import { Router } from 'express';
import { randomBytes } from 'crypto';
import { networkInterfaces } from 'os';
import type { ServiceId, ApiResponse, ServiceWithStatus, ExtraHost, DeploymentPhase } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS, PLATFORM_HOSTNAME, configUpdateSchema, getUnmetDependencies } from '@skaha-orc/shared';
import { getServiceStatus, getAllStatuses } from '../services/status.service.js';
import { readValuesFile, writeValuesFile } from '../services/yaml.service.js';
import { helmDeploy, helmUninstall } from '../services/helm.service.js';
import { scaleDeployment } from '../services/kubectl.service.js';
import { injectCaCertIntoValues, syncPosixMapperDbConfig, syncGmsId, syncRegistryEntries, syncDexPreferredUsername, syncPosixMapperAuthorizedClients, syncCavernRootOwner, seedPosixMapperDb, syncDexBcryptHash, syncBaseTraefikConfig, syncTraefikTlsCert, syncTraefikClusterIp, syncUrlProtocol, loadKindImages, syncOidcClientSecrets, syncDexRedirectUris, syncDbPasswords } from '../services/bootstrap.service.js';
import { detectDeployMode } from '../services/haproxy.service.js';
import { runIntegrationTests } from '../services/integration-test.service.js';
import { logger } from '../logger.js';

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const IPV6_RE = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^([0-9a-fA-F]{1,4}:)*:([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip);
}

/**
 * Virtual / bridge interface name patterns that should be deprioritized
 * when auto-detecting the host IP (Docker, UTM, VMware, VPN, etc.).
 */
const VIRTUAL_IFACE_RE = /^(bridge|vmnet|veth|docker|br-|utun|tun|tap|virbr|vbox)/i;

/**
 * Detects the machine's primary non-loopback, non-link-local IPv4 address.
 * Prefers physical interfaces (en*, eth*) over virtual bridges / VPN tunnels,
 * so a Docker bridge `10.0.0.1` won't shadow the real LAN address.
 */
function detectHostIp(): string | null {
  const nets = networkInterfaces();
  let fallback: string | null = null;

  for (const [name, entries] of Object.entries(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal || entry.address.startsWith('169.254.')) {
        continue;
      }
      // Prefer physical interfaces; keep virtual ones as fallback only
      if (VIRTUAL_IFACE_RE.test(name)) {
        fallback ??= entry.address;
      } else {
        return entry.address;
      }
    }
  }
  return fallback;
}

/**
 * On startup, if no extraHosts entry exists for the platform hostname in any
 * values file, detect the host IP and write it into all service values files
 * that have a deployment section.
 */
export async function initializeHostIp(): Promise<void> {
  // Check if any file already has the platform host entry
  for (const def of Object.values(SERVICE_CATALOG)) {
    if (!def.valuesFile) continue;
    try {
      const data = await readValuesFile(def.valuesFile);
      const deployment = data.deployment as { extraHosts?: ExtraHost[] } | undefined;
      if (deployment?.extraHosts?.some((h) => h.hostname === PLATFORM_HOSTNAME && h.ip)) {
        logger.debug('Host IP already configured, skipping auto-detect');
        return;
      }
    } catch {
      continue;
    }
  }

  const ip = detectHostIp();
  if (!ip) {
    logger.debug('Could not auto-detect host IP');
    return;
  }

  let updated = 0;
  for (const def of Object.values(SERVICE_CATALOG)) {
    if (!def.valuesFile) continue;
    try {
      const data = await readValuesFile(def.valuesFile);
      const deployment = (data.deployment ?? {}) as Record<string, unknown>;
      const extraHosts = (deployment.extraHosts as ExtraHost[] | undefined) ?? [];
      const existing = extraHosts.find((h) => h.hostname === PLATFORM_HOSTNAME);
      if (existing) {
        existing.ip = ip;
      } else {
        extraHosts.push({ ip, hostname: PLATFORM_HOSTNAME });
      }
      deployment.extraHosts = extraHosts;
      data.deployment = deployment;
      await writeValuesFile(def.valuesFile, data);
      updated++;
    } catch {
      continue;
    }
  }

  if (updated > 0) {
    logger.info({ ip, updated }, 'Auto-detected host IP and wrote to values files');
  }
}

/**
 * On startup, if the skaha↔cavern admin API key is empty in either values file,
 * generate a shared key and write it to both files.
 */
export async function initializeApiKeys(): Promise<void> {
  const skahaFile = SERVICE_CATALOG.skaha?.valuesFile;
  const cavernFile = SERVICE_CATALOG.cavern?.valuesFile;
  if (!skahaFile || !cavernFile) return;

  let skahaData: Record<string, unknown>;
  let cavernData: Record<string, unknown>;
  try {
    skahaData = await readValuesFile(skahaFile);
    cavernData = await readValuesFile(cavernFile);
  } catch {
    return;
  }

  // Read existing key from skaha values
  const skahaKey = getNestedString(skahaData,
    ['deployment', 'skaha', 'sessions', 'userStorage', 'admin', 'auth', 'apiKey']);

  // Read existing key from cavern values
  const cavernKey = getNestedString(cavernData,
    ['deployment', 'cavern', 'extraConfigData', 'adminAPIKeys', 'skaha']);

  // If both are already populated, nothing to do
  if (skahaKey && cavernKey) {
    logger.debug('Skaha↔Cavern API key already configured');
    return;
  }

  // Use whichever existing key we find, or generate a new one
  const apiKey = skahaKey || cavernKey || randomBytes(32).toString('base64');

  // Write to skaha
  setNestedValue(skahaData,
    ['deployment', 'skaha', 'sessions', 'userStorage', 'admin', 'auth', 'apiKey'], apiKey);
  await writeValuesFile(skahaFile, skahaData);

  // Write to cavern
  setNestedValue(cavernData,
    ['deployment', 'cavern', 'extraConfigData', 'adminAPIKeys', 'skaha'], apiKey);
  await writeValuesFile(cavernFile, cavernData);

  logger.info('Auto-generated skaha↔cavern API key and wrote to values files');
}

function getNestedString(obj: Record<string, unknown>, keys: string[]): string {
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : '';
}

function setNestedValue(obj: Record<string, unknown>, keys: string[], value: unknown): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}

const router = Router();

/**
 * @openapi
 * /services:
 *   get:
 *     tags: [Services]
 *     summary: List all services with status
 *     description: Returns every service in the catalog with its current deployment status.
 *     responses:
 *       200:
 *         description: Array of services with status
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ServiceWithStatus'
 *       500:
 *         description: Failed to fetch services
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/services', async (_req, res) => {
  try {
    const services = await getAllStatuses();
    const response: ApiResponse<ServiceWithStatus[]> = { success: true, data: services };
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to list services');
    res.status(500).json({ success: false, error: 'Failed to fetch services' });
  }
});

/**
 * @openapi
 * /services/host-ip:
 *   get:
 *     tags: [Services]
 *     summary: Get the platform host IP
 *     description: Scans all service values files for an extraHosts entry matching the platform hostname and returns the first IP found.
 *     responses:
 *       200:
 *         description: Host IP entry (ip may be null if not configured)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ExtraHost'
 *       500:
 *         description: Failed to read host IP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/services/host-ip', async (_req, res) => {
  try {
    for (const def of Object.values(SERVICE_CATALOG)) {
      if (!def.valuesFile) continue;

      let config: Record<string, unknown>;
      try {
        config = await readValuesFile(def.valuesFile);
      } catch {
        continue; // skip multi-document or unreadable files
      }

      const deployment = config.deployment as
        | { extraHosts?: ExtraHost[] }
        | undefined;
      if (!deployment?.extraHosts) continue;

      const entry = deployment.extraHosts.find(
        (h) => h.hostname === PLATFORM_HOSTNAME,
      );
      if (entry) {
        res.json({ success: true, data: { ip: entry.ip, hostname: entry.hostname } });
        return;
      }
    }

    res.json({ success: true, data: { ip: null, hostname: PLATFORM_HOSTNAME } });
  } catch (err) {
    logger.error({ err }, 'Failed to read host IP');
    res.status(500).json({ success: false, error: 'Failed to read host IP' });
  }
});

/**
 * @openapi
 * /services/host-ips:
 *   get:
 *     tags: [Services]
 *     summary: List all detected host IPv4 addresses
 *     description: Returns every non-loopback, non-link-local IPv4 address on the machine with its interface name.
 *     responses:
 *       200:
 *         description: Array of detected addresses
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           ip:
 *                             type: string
 *                           iface:
 *                             type: string
 *                           virtual:
 *                             type: boolean
 */
router.get('/services/host-ips', (_req, res) => {
  const nets = networkInterfaces();
  const result: { ip: string; iface: string; virtual: boolean }[] = [];

  for (const [name, entries] of Object.entries(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal || entry.address.startsWith('169.254.')) {
        continue;
      }
      result.push({
        ip: entry.address,
        iface: name,
        virtual: VIRTUAL_IFACE_RE.test(name),
      });
    }
  }

  // Physical interfaces first, then virtual
  result.sort((a, b) => (a.virtual === b.virtual ? 0 : a.virtual ? 1 : -1));

  res.json({ success: true, data: result });
});

/**
 * @openapi
 * /services/host-ip:
 *   put:
 *     tags: [Services]
 *     summary: Update the platform host IP across all services
 *     description: Sets the IP for the platform hostname in every service values file that has an extraHosts entry.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ip]
 *             properties:
 *               ip:
 *                 type: string
 *                 description: IPv4 or IPv6 address
 *     responses:
 *       200:
 *         description: Number of files updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         updated:
 *                           type: integer
 *       400:
 *         description: Missing or invalid IP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to update host IP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.put('/services/host-ip', async (req, res) => {
  const { ip } = req.body as { ip?: string };
  if (!ip || typeof ip !== 'string') {
    res.status(400).json({ success: false, error: 'Missing or invalid ip' });
    return;
  }

  if (!isValidIp(ip)) {
    res.status(400).json({ success: false, error: 'Invalid IP address format' });
    return;
  }

  try {
    let updated = 0;

    for (const def of Object.values(SERVICE_CATALOG)) {
      if (!def.valuesFile) continue;

      let config: Record<string, unknown>;
      try {
        config = await readValuesFile(def.valuesFile);
      } catch {
        continue; // skip multi-document or unreadable files
      }

      const deployment = config.deployment as
        | { extraHosts?: ExtraHost[] }
        | undefined;
      if (!deployment?.extraHosts) continue;

      let changed = false;
      for (const host of deployment.extraHosts) {
        if (host.hostname === PLATFORM_HOSTNAME && host.ip !== ip) {
          host.ip = ip;
          changed = true;
        }
      }

      if (changed) {
        await writeValuesFile(def.valuesFile, config);
        updated++;
      }
    }

    res.json({ success: true, data: { updated } });
  } catch (err) {
    logger.error({ err }, 'Failed to update host IP');
    res.status(500).json({ success: false, error: 'Failed to update host IP' });
  }
});

/**
 * @openapi
 * /services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get a single service with status
 *     description: Returns the service definition and its current deployment status.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Service with status
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ServiceWithStatus'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to fetch service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/services/:id', async (req, res) => {
  const serviceId = req.params.id as ServiceId;
  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  try {
    const def = SERVICE_CATALOG[serviceId];
    const status = await getServiceStatus(serviceId);
    const service: ServiceWithStatus = { ...def, status };
    res.json({ success: true, data: service });
  } catch (err) {
    logger.error({ err, serviceId }, 'Failed to get service');
    res.status(500).json({ success: false, error: 'Failed to fetch service' });
  }
});

/**
 * @openapi
 * /services/{id}/config:
 *   get:
 *     tags: [Services]
 *     summary: Get Helm values for a service
 *     description: Reads and returns the parsed YAML values file for the service.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Parsed values object
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to read config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/services/:id/config', async (req, res) => {
  const serviceId = req.params.id as ServiceId;
  const def = SERVICE_CATALOG[serviceId];

  if (!def) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  if (!def.valuesFile) {
    res.json({ success: true, data: {} });
    return;
  }

  try {
    const config = await readValuesFile(def.valuesFile);
    res.json({ success: true, data: config });
  } catch (err) {
    logger.error({ err, serviceId }, 'Failed to read config');
    res.status(500).json({ success: false, error: 'Failed to read config' });
  }
});

/**
 * @openapi
 * /services/{id}/config:
 *   put:
 *     tags: [Services]
 *     summary: Update Helm values for a service
 *     description: Validates and writes a new values object to the service's YAML file.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [config]
 *             properties:
 *               config:
 *                 type: object
 *                 description: The full values object to write
 *     responses:
 *       200:
 *         description: Config saved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *       400:
 *         description: Validation error or service has no values file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to save config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
const PLACEHOLDER_PATTERNS = [
  { pattern: /CHANGE_ME/i, label: 'CHANGE_ME' },
  { pattern: /example\.com/i, label: 'example.com' },
  { pattern: /^your-/i, label: 'placeholder prefix' },
  { pattern: /^TODO$/i, label: 'TODO' },
];

function findPlaceholders(obj: unknown, path: string, warnings: string[]): void {
  if (typeof obj === 'string') {
    for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
      if (pattern.test(obj)) {
        warnings.push(`${path} contains '${label}'`);
        break;
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => findPlaceholders(item, `${path}[${i}]`, warnings));
  } else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      findPlaceholders(value, path ? `${path}.${key}` : key, warnings);
    }
  }
}

router.get('/services/:id/config-warnings', async (req, res) => {
  const serviceId = req.params.id as ServiceId;
  const def = SERVICE_CATALOG[serviceId];

  if (!def) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  if (!def.valuesFile) {
    res.json({ success: true, data: { warnings: [] } });
    return;
  }

  try {
    const config = await readValuesFile(def.valuesFile);
    const warnings: string[] = [];
    findPlaceholders(config, '', warnings);
    warnings.push(...findSemanticWarnings(serviceId, config));
    res.json({ success: true, data: { warnings } });
  } catch {
    res.json({ success: true, data: { warnings: [] } });
  }
});

// Semantic config checks for known deployment pitfalls
const SCOPE_PATHS: Record<string, string> = {
  'science-portal': 'deployment.sciencePortal.oidc.scope',
  'storage-ui': 'deployment.storageUI.oidc.scope',
  skaha: 'deployment.skaha.oidc.scope',
};

const MOUNT_PREFIXES: Record<string, string> = {
  skaha: 'deployment.skaha',
  cavern: 'deployment.cavern',
  'science-portal': 'deployment.sciencePortal',
  'posix-mapper': 'deployment.posixMapper',
};

export function findSemanticWarnings(serviceId: string, config: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  // 1. OIDC scope must include offline_access for refresh tokens
  const scopePath = SCOPE_PATHS[serviceId];
  if (scopePath) {
    const scope = getNestedString(config, scopePath.split('.'));
    if (scope && !scope.includes('offline_access')) {
      warnings.push(`${scopePath}: missing 'offline_access' — will cause refresh_token errors`);
    }
  }

  // 2. CA cert volume mount present for TLS-dependent services
  const prefix = MOUNT_PREFIXES[serviceId];
  if (prefix) {
    const mountsPath = `${prefix}.extraVolumeMounts`;
    const mounts = getNestedValue(config, mountsPath);
    const hasCacert = Array.isArray(mounts) &&
      (mounts as Array<Record<string, unknown>>).some((m) => m.mountPath === '/config/cacerts');
    if (!hasCacert) {
      warnings.push(`${mountsPath}: missing /config/cacerts mount — SSL will fail`);
    }
  }

  // 3. posix-mapper: warn if postgresql block is empty/missing
  if (serviceId === 'posix-mapper') {
    const pg = getNestedValue(config, 'postgresql');
    if (!pg || (typeof pg === 'object' && Object.keys(pg as object).length === 0)) {
      warnings.push('postgresql: empty — posix-mapper will fail with NumberFormatException (no DB pool)');
    }
  }

  // 4. skaha: warn if gmsID is empty
  if (serviceId === 'skaha') {
    const gmsID = getNestedString(config, ['deployment', 'skaha', 'gmsID']);
    if (!gmsID) {
      warnings.push('deployment.skaha.gmsID: empty — group membership lookups will fail');
    }
  }

  // 5. posix-mapper-db: warn if no seed users configured
  if (serviceId === 'posix-mapper-db') {
    const seed = getNestedValue(config, 'postgres.seed');
    const seedUsers = seed && typeof seed === 'object' ? (seed as Record<string, unknown>).users : undefined;
    if (!Array.isArray(seedUsers) || seedUsers.length === 0) {
      warnings.push('postgres.seed.users: empty — fresh DB will auto-assign UIDs that may not match existing filesystem ownership');
    }
  }

  // 6. posix-mapper: warn if authorizedClients is empty
  if (serviceId === 'posix-mapper') {
    const clients = getNestedValue(config, 'deployment.posixMapper.authorizedClients');
    if (!Array.isArray(clients) || clients.length === 0) {
      warnings.push('deployment.posixMapper.authorizedClients: empty — Cavern/Skaha cannot create UID mappings');
    }
  }

  // 7. volumes: warn if workload section is missing/incomplete
  if (serviceId === 'volumes') {
    const wl = getNestedValue(config, 'workload');
    if (!wl || typeof wl !== 'object') {
      warnings.push('workload: missing — session pods need a workload PVC to mount cavern storage');
    } else {
      const wlObj = wl as Record<string, unknown>;
      if (!wlObj.pvcName) {
        warnings.push('workload.pvcName: empty — session pods will fail to schedule');
      }
      if (!wlObj.namespace) {
        warnings.push('workload.namespace: empty — workload PVC needs a target namespace');
      }
    }
  }

  // 8. Dex: warn if any staticPasswords entry has an invalid bcrypt hash
  if (serviceId === 'dex') {
    const passwords = config.staticPasswords;
    if (Array.isArray(passwords)) {
      for (const entry of passwords as Array<Record<string, unknown>>) {
        const hash = typeof entry.hash === 'string' ? entry.hash : '';
        if (!hash || hash.includes('CHANGE_ME') || hash.length < 50) {
          warnings.push('staticPasswords[].hash: invalid bcrypt hash — Dex will crash on startup');
          break;
        }
      }
    }
  }

  // 9. Cavern identityManagerClass must be StandardIdentityManager
  if (serviceId === 'cavern') {
    const cls = getNestedString(config, ['deployment', 'cavern', 'identityManagerClass']);
    if (cls && cls !== 'org.opencadc.auth.StandardIdentityManager') {
      warnings.push(`deployment.cavern.identityManagerClass: expected 'StandardIdentityManager', got '${cls}'`);
    }
  }

  // 10. Science Portal: warn if skahaResourceID is missing (used for registry lookup)
  if (serviceId === 'science-portal') {
    const resId = getNestedString(config, ['deployment', 'sciencePortal', 'skahaResourceID']);
    if (!resId) {
      warnings.push('deployment.sciencePortal.skahaResourceID: empty — science-portal cannot find Skaha in the registry');
    }
  }

  // 11. Dex: warn if any staticClients secret is CHANGE_ME
  if (serviceId === 'dex') {
    const clients = config.staticClients;
    if (Array.isArray(clients)) {
      for (const entry of clients as Array<Record<string, unknown>>) {
        const secret = typeof entry.secret === 'string' ? entry.secret : '';
        if (!secret || secret.includes('CHANGE_ME')) {
          warnings.push(`staticClients[${entry.id}].secret: CHANGE_ME — OIDC login will fail`);
        }
      }
    }
  }

  // 12. Registry: warn if core service entries are missing
  if (serviceId === 'reg') {
    const entries = getNestedValue(config, 'application.serviceEntries');
    if (Array.isArray(entries)) {
      const ids = (entries as Array<Record<string, string>>).map((e) => e.id);
      for (const required of ['ivo://cadc.nrc.ca/skaha', 'ivo://cadc.nrc.ca/cavern', 'ivo://cadc.nrc.ca/posix-mapper']) {
        if (!ids.includes(required)) {
          warnings.push(`application.serviceEntries: missing ${required} — services using registry lookups will fail`);
        }
      }
    }
  }

  return warnings;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

router.post('/services/:id/auto-fix', async (req, res) => {
  const serviceId = req.params.id as ServiceId;
  const def = SERVICE_CATALOG[serviceId];

  if (!def) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  if (!def.valuesFile) {
    res.status(400).json({ success: false, error: 'Service has no values file' });
    return;
  }

  try {
    const config = await readValuesFile(def.valuesFile);
    const fixes: string[] = [];

    // Fix 1: Add offline_access to OIDC scope
    const scopePath = SCOPE_PATHS[serviceId];
    if (scopePath) {
      const scope = getNestedString(config, scopePath.split('.'));
      if (scope && !scope.includes('offline_access')) {
        setNestedValue(config, scopePath.split('.'), `${scope} offline_access`);
        fixes.push(`Added 'offline_access' to ${scopePath}`);
      }
    }

    // Fix 2: Add CA cert volume mounts
    const prefix = MOUNT_PREFIXES[serviceId];
    if (prefix) {
      const mountsPath = `${prefix}.extraVolumeMounts`;
      const mountsVal = getNestedValue(config, mountsPath);
      const mounts = (Array.isArray(mountsVal) ? mountsVal : []) as Record<string, unknown>[];
      if (!mounts.some((m) => m.mountPath === '/config/cacerts')) {
        mounts.push({ mountPath: '/config/cacerts', name: 'cacert-volume' });
        setNestedValue(config, mountsPath.split('.'), mounts);
        fixes.push(`Added /config/cacerts mount to ${mountsPath}`);
      }

      const volsPath = `${prefix}.extraVolumes`;
      const volsVal = getNestedValue(config, volsPath);
      const vols = (Array.isArray(volsVal) ? volsVal : []) as Record<string, unknown>[];
      if (!vols.some((v) => v.name === 'cacert-volume')) {
        const secretName = `${serviceId}-cacert-secret`;
        vols.push({ name: 'cacert-volume', secret: { defaultMode: 420, secretName } });
        setNestedValue(config, volsPath.split('.'), vols);
        fixes.push(`Added cacert-volume to ${volsPath}`);
      }
    }

    // Fix 3: Set cavern identityManagerClass
    if (serviceId === 'cavern') {
      const cls = getNestedString(config, ['deployment', 'cavern', 'identityManagerClass']);
      if (cls !== 'org.opencadc.auth.StandardIdentityManager') {
        setNestedValue(config, ['deployment', 'cavern', 'identityManagerClass'],
          'org.opencadc.auth.StandardIdentityManager');
        fixes.push('Set identityManagerClass to StandardIdentityManager');
      }
    }

    if (fixes.length > 0) {
      await writeValuesFile(def.valuesFile, config);
    }

    res.json({ success: true, data: { fixes } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Auto-fix failed');
    res.status(500).json({ success: false, error: 'Auto-fix failed' });
  }
});

router.put('/services/:id/config', async (req, res) => {
  const serviceId = req.params.id as ServiceId;
  const def = SERVICE_CATALOG[serviceId];

  if (!def) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  if (!def.valuesFile) {
    res.status(400).json({ success: false, error: 'Service has no values file' });
    return;
  }

  const parsed = configUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  try {
    await writeValuesFile(def.valuesFile, parsed.data.config);
    res.json({ success: true, data: { message: 'Config saved' } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Failed to write config');
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

/**
 * @openapi
 * /services/{id}/deploy:
 *   post:
 *     tags: [Services]
 *     summary: Deploy a service
 *     description: Runs helm install/upgrade for the service. Supports dry-run mode.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Deploy output
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         output:
 *                           type: string
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Deploy failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/services/:id/deploy', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const dryRun = req.body?.dryRun === true;

  try {
    // Dependency guard
    const statuses = await getAllStatuses();
    const phaseMap = new Map<ServiceId, DeploymentPhase>(
      statuses.map((s) => [s.id, s.status.phase]),
    );
    const unmetDeps = getUnmetDependencies(serviceId, phaseMap);
    if (unmetDeps.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Cannot deploy: dependencies not ready',
        data: { unmetDeps },
      });
      return;
    }

    // Ensure CA cert + volume mounts are in values before deploying
    try { await injectCaCertIntoValues(); } catch { /* CA may not exist yet */ }
    try { await syncDexBcryptHash(); } catch { /* best-effort */ }
    try { await syncOidcClientSecrets(); } catch { /* best-effort */ }
    try { await syncDexRedirectUris(); } catch { /* best-effort */ }
    try { await syncBaseTraefikConfig(); } catch { /* best-effort */ }
    try { await syncTraefikTlsCert(); } catch { /* best-effort */ }
    try { await syncUrlProtocol(); } catch { /* best-effort */ }
    try { await syncDbPasswords(); } catch { /* best-effort */ }
    try { await syncTraefikClusterIp(); } catch { /* best-effort */ }
    try { await loadKindImages(); } catch { /* best-effort */ }
    try { await syncPosixMapperDbConfig(); } catch { /* best-effort */ }
    try { await syncGmsId(); } catch { /* best-effort */ }
    try { await syncRegistryEntries(); } catch { /* best-effort */ }
    try { await syncDexPreferredUsername(); } catch { /* best-effort */ }
    try { await syncPosixMapperAuthorizedClients(); } catch { /* best-effort */ }
    try { await syncCavernRootOwner(); } catch { /* best-effort */ }
    try { await seedPosixMapperDb(); } catch { /* best-effort */ }

    const result = await helmDeploy(serviceId, { dryRun });
    if (!result.success) {
      logger.error({ serviceId, output: result.output }, 'Deploy returned failure');
    }
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Deploy threw unexpectedly');
    res.status(500).json({ success: false, error: `Deploy failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

/**
 * @openapi
 * /services/{id}/uninstall:
 *   post:
 *     tags: [Services]
 *     summary: Uninstall a service
 *     description: Runs helm uninstall for the service.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Uninstall output
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         output:
 *                           type: string
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Uninstall failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/services/:id/uninstall', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  try {
    const result = await helmUninstall(serviceId);
    if (!result.success) {
      logger.error({ serviceId, output: result.output }, 'Uninstall returned failure');
    }
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Uninstall threw unexpectedly');
    res.status(500).json({ success: false, error: `Uninstall failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

/**
 * @openapi
 * /services/{id}/pause:
 *   post:
 *     tags: [Services]
 *     summary: Pause a service (scale to 0)
 *     description: Scales the service deployment to 0 replicas. For HAProxy services, only works in kubernetes mode.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Pause output
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         output:
 *                           type: string
 *       400:
 *         description: Pause not supported (HAProxy non-kubernetes mode)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Pause failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/services/:id/pause', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const def = SERVICE_CATALOG[serviceId];

  if (def.chartSource.type === 'haproxy') {
    try {
      const mode = await detectDeployMode();
      if (mode !== 'kubernetes') {
        res.status(400).json({ success: false, error: `Pause not supported for HAProxy in ${mode ?? 'unknown'} mode. Use stop instead.` });
        return;
      }
    } catch {
      res.status(400).json({ success: false, error: 'Pause not supported for HAProxy: unable to detect deploy mode. Use stop instead.' });
      return;
    }
  }

  try {
    const result = await scaleDeployment(def.namespace, serviceId, 0);
    if (!result.success) {
      logger.error({ serviceId, output: result.output }, 'Pause returned failure');
    }
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Pause threw unexpectedly');
    res.status(500).json({ success: false, error: `Pause failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

/**
 * @openapi
 * /services/{id}/resume:
 *   post:
 *     tags: [Services]
 *     summary: Resume a service (scale to 1)
 *     description: Scales the service deployment back to 1 replica. For HAProxy services, only works in kubernetes mode.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Resume output
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         output:
 *                           type: string
 *       400:
 *         description: Resume not supported (HAProxy non-kubernetes mode)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Resume failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/services/:id/resume', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const def = SERVICE_CATALOG[serviceId];

  if (def.chartSource.type === 'haproxy') {
    try {
      const mode = await detectDeployMode();
      if (mode !== 'kubernetes') {
        res.status(400).json({ success: false, error: `Resume not supported for HAProxy in ${mode ?? 'unknown'} mode. Use deploy instead.` });
        return;
      }
    } catch {
      res.status(400).json({ success: false, error: 'Resume not supported for HAProxy: unable to detect deploy mode. Use deploy instead.' });
      return;
    }
  }

  try {
    const result = await scaleDeployment(def.namespace, serviceId, 1);
    if (!result.success) {
      logger.error({ serviceId, output: result.output }, 'Resume returned failure');
    }
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Resume threw unexpectedly');
    res.status(500).json({ success: false, error: `Resume failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

router.post('/services/:id/test', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  try {
    const status = await getServiceStatus(serviceId);
    if (status.phase === 'not_installed') {
      res.status(400).json({ success: false, error: 'Service is not deployed' });
      return;
    }
    const results = await runIntegrationTests(serviceId);
    res.json({ success: true, data: { results } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Integration test failed');
    res.status(500).json({ success: false, error: `Tests failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

export default router;
