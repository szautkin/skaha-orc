import { mkdir, readdir, copyFile, stat, readFile, symlink, readlink } from 'fs/promises';
import { resolve, dirname } from 'path';
import { execa } from 'execa';
import type { PreflightCheck, PreflightResult } from '@skaha-orc/shared';
import { PLATFORM_HOSTNAME, SERVICE_CATALOG } from '@skaha-orc/shared';
import { config } from '../config.js';
import { kubeArgs, kubeEnv } from './kube-args.js';
import { logger } from '../logger.js';
import { getCaInfo, generateCA, generateHAProxyCert, HAPROXY_CERT_PATH, CA_CERT_PATH } from './cert.service.js';
import { generateHAProxyConfig, saveHAProxyConfig } from './haproxy.service.js';
import { readValuesFile, writeValuesFile } from './yaml.service.js';

export async function ensureDirectories(): Promise<void> {
  const dirs = [
    config.helmConfigDir,
    dirname(config.haproxy.configPath),
    config.chartBaseDir,
  ];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
  logger.debug({ dirs }, 'Ensured directories exist');
}

export async function copyExampleValues(): Promise<void> {
  const helmDir = resolve(config.helmConfigDir);

  let helmEmpty = true;
  try {
    const entries = await readdir(helmDir);
    helmEmpty = entries.filter((f) => f.endsWith('.yaml')).length === 0;
  } catch {
    helmEmpty = true;
  }

  if (!helmEmpty) return;

  // Search for helm-values.example/ walking up from the CWD.
  // In a monorepo the dev CWD is packages/backend/ so the example dir
  // at the repo root is two levels up.
  const exampleDir = await findExampleDir();
  if (!exampleDir) {
    logger.debug('No helm-values.example/ directory found, skipping copy');
    return;
  }

  const files = (await readdir(exampleDir)).filter((f) => f.endsWith('.yaml'));
  for (const file of files) {
    await copyFile(resolve(exampleDir, file), resolve(helmDir, file));
  }
  logger.info({ count: files.length }, 'Copied example values files to helm-values/');
}

/**
 * If the local charts directory is empty, look for a charts/ directory at the
 * project root and symlink its contents so local chart references resolve.
 */
export async function linkRootCharts(): Promise<void> {
  const chartsDir = resolve(config.chartBaseDir);

  // Skip if charts dir already has content
  try {
    const entries = await readdir(chartsDir);
    if (entries.length > 0) return;
  } catch {
    return;
  }

  // Walk up from CWD looking for a charts/ dir that has subdirectories
  let dir = resolve('.');
  for (let i = 0; i < 4; i++) {
    const candidate = resolve(dir, 'charts');
    // Don't match our own empty charts dir
    if (candidate === chartsDir) {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
      continue;
    }
    if (await dirExists(candidate)) {
      const entries = await readdir(candidate);
      for (const entry of entries) {
        const src = resolve(candidate, entry);
        const dest = resolve(chartsDir, entry);
        try {
          await readlink(dest);
          continue; // already linked
        } catch {
          // not a symlink, create one
        }
        try {
          const s = await stat(src);
          if (s.isDirectory()) {
            await symlink(src, dest);
          }
        } catch {
          continue;
        }
      }
      if (entries.length > 0) {
        logger.info({ from: candidate, count: entries.length }, 'Linked root charts into local charts/');
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

async function findExampleDir(): Promise<string | null> {
  // Check CWD and up to 3 parent directories
  let dir = resolve('.');
  for (let i = 0; i < 4; i++) {
    const candidate = resolve(dir, 'helm-values.example');
    if (await dirExists(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

async function checkCli(
  id: string,
  label: string,
  cmd: string,
  args: string[],
): Promise<PreflightCheck> {
  try {
    const result = await execa(cmd, args, { timeout: 5000 });
    const output = String(result.stdout ?? '').split('\n')[0] ?? '';
    return {
      id,
      label,
      status: 'ok',
      message: output.trim(),
    };
  } catch {
    return {
      id,
      label,
      status: 'fail',
      message: `${cmd} not found or not executable`,
      remedy: `Install ${cmd} and ensure it is on your PATH`,
    };
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * On startup, if no CA or HAProxy server cert exists, auto-generate them
 * and regenerate haproxy.cfg with SSL termination enabled.
 */
export async function initializeCerts(): Promise<void> {
  try {
    const caInfo = await getCaInfo();
    if (!caInfo.exists) {
      logger.info('No CA found — generating self-signed CA');
      await generateCA({ cn: PLATFORM_HOSTNAME, days: 3650, org: 'Skaha ORC Dev' });
    }

    if (!(await fileExists(HAPROXY_CERT_PATH))) {
      logger.info('No HAProxy server cert found — generating');
      await generateHAProxyCert({ cn: PLATFORM_HOSTNAME, days: 3650 });
    }

    // Regenerate haproxy.cfg with SSL now that certs exist
    if (await fileExists(HAPROXY_CERT_PATH) && await fileExists(CA_CERT_PATH)) {
      const sslConfig = generateHAProxyConfig({ enableSsl: true });
      await saveHAProxyConfig(sslConfig);
      logger.info('Regenerated haproxy.cfg with SSL termination');
    }

    // Inject CA cert (base64) into service values files so Helm creates cacert secrets
    if (await fileExists(CA_CERT_PATH)) {
      await injectCaCertIntoValues();
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to auto-generate certs — HAProxy will run without TLS');
  }
}

/**
 * Map of service → cacert secret name used by upstream Helm charts.
 * The chart will create a K8s Secret from secrets.<name>.ca.crt.
 */
const CACERT_SECRET_NAMES: Record<string, string> = {
  skaha: 'skaha-cacert-secret',
  cavern: 'cavern-cacert-secret',
  'science-portal': 'science-portal-cacert-secret',
  'posix-mapper': 'posix-mapper-cacert-secret',
};

// Map service → values path prefix for the volume mount arrays
const VOLUME_MOUNT_PREFIXES: Record<string, string> = {
  skaha: 'deployment.skaha',
  cavern: 'deployment.cavern',
  'science-portal': 'deployment.sciencePortal',
  'posix-mapper': 'deployment.posixMapper',
};

function getNestedArray(obj: Record<string, unknown>, path: string): unknown[] | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : undefined;
}

function setNestedVal(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}

export async function injectCaCertIntoValues(): Promise<void> {
  const caPem = await readFile(CA_CERT_PATH, 'utf-8');
  const caB64 = Buffer.from(caPem).toString('base64');

  let updated = 0;

  for (const [serviceId, secretName] of Object.entries(CACERT_SECRET_NAMES)) {
    const def = SERVICE_CATALOG[serviceId as keyof typeof SERVICE_CATALOG];
    if (!def?.valuesFile) continue;

    try {
      const data = await readValuesFile(def.valuesFile);
      const secrets = ((data.secrets ?? {}) as Record<string, Record<string, string>>);
      let changed = false;

      // Inject cert secret — mounted at /config/cacerts/, picked up by update-ca-trust at startup
      if (!secrets[secretName]?.['ca.crt'] || secrets[secretName]['ca.crt'].length <= 10) {
        if (!secrets[secretName]) secrets[secretName] = {};
        secrets[secretName]['ca.crt'] = caB64;
        data.secrets = secrets;
        changed = true;
      }

      // Clean up stale truststore.p12 — not needed, OpenCADC containers use update-ca-trust
      if (secrets[secretName]?.['truststore.p12']) {
        delete secrets[secretName]['truststore.p12'];
        data.secrets = secrets;
        changed = true;
      }

      // Auto-add volume mounts for the CA cert
      const prefix = VOLUME_MOUNT_PREFIXES[serviceId];
      if (prefix) {
        const mountsKey = `${prefix}.extraVolumeMounts`;
        const mounts = (getNestedArray(data, mountsKey) ?? []) as Record<string, unknown>[];
        if (!mounts.some((m) => m.mountPath === '/config/cacerts')) {
          mounts.push({ mountPath: '/config/cacerts', name: 'cacert-volume' });
          setNestedVal(data, mountsKey, mounts);
          changed = true;
        }

        const volsKey = `${prefix}.extraVolumes`;
        const vols = (getNestedArray(data, volsKey) ?? []) as Record<string, unknown>[];
        if (!vols.some((v) => v.name === 'cacert-volume')) {
          vols.push({
            name: 'cacert-volume',
            secret: { defaultMode: 420, secretName },
          });
          setNestedVal(data, volsKey, vols);
          changed = true;
        }

        // Point Java at the system-generated truststore.
        // update-ca-trust runs at container start and generates a JKS truststore at
        // /etc/pki/ca-trust/extracted/java/cacerts that includes our custom CA cert.
        // Without this, Java uses its default truststore (/etc/java/.../lib/security/cacerts)
        // which does NOT include the custom CA, causing HTTPS calls between services to fail.
        const SYSTEM_TRUSTSTORE = '/etc/pki/ca-trust/extracted/java/cacerts';
        const JTO_VALUE = `-Djavax.net.ssl.trustStore=${SYSTEM_TRUSTSTORE}`;

        const envKey = `${prefix}.extraEnv`;
        const envArr = (getNestedArray(data, envKey) ?? []) as Record<string, unknown>[];
        const jtoIdx = envArr.findIndex((e) => e.name === 'JAVA_TOOL_OPTIONS');
        if (jtoIdx >= 0) {
          if (envArr[jtoIdx]!.value !== JTO_VALUE) {
            envArr[jtoIdx] = { name: 'JAVA_TOOL_OPTIONS', value: JTO_VALUE };
            setNestedVal(data, envKey, envArr);
            changed = true;
          }
        } else {
          envArr.push({ name: 'JAVA_TOOL_OPTIONS', value: JTO_VALUE });
          setNestedVal(data, envKey, envArr);
          changed = true;
        }
      }

      if (changed) {
        await writeValuesFile(def.valuesFile, data);
        updated++;
      }
    } catch {
      continue;
    }
  }

  if (updated > 0) {
    logger.info({ updated }, 'Injected CA cert and volume mounts into service values files');
  }
}

/**
 * Reads DB credentials from the standalone posix-mapper-postgres values file
 * and writes the `postgresql` JDBC connection block into posix-mapper-values.yaml.
 * Without this, posix-mapper's catalina.properties has no DB pool vars and
 * throws NumberFormatException on startup.
 */
export async function syncPosixMapperDbConfig(): Promise<void> {
  const pmDbDef = SERVICE_CATALOG['posix-mapper-db'];
  const pmDef = SERVICE_CATALOG['posix-mapper'];
  if (!pmDbDef?.valuesFile || !pmDef?.valuesFile) return;

  try {
    const dbData = await readValuesFile(pmDbDef.valuesFile);
    const pmData = await readValuesFile(pmDef.valuesFile);

    const pgAuth = (dbData as Record<string, unknown>).postgres as Record<string, unknown> | undefined;
    if (!pgAuth?.auth) return;

    const auth = pgAuth.auth as Record<string, string>;
    const database = auth.database || 'posixmapper';
    const schema = auth.schema || 'mapping';
    const username = auth.username || 'posixmapper';
    const password = auth.password || 'posixmapper';

    const pgBlock = {
      maxActive: 8,
      url: `jdbc:postgresql://posix-mapper-postgres.skaha-system:5432/${database}`,
      schema,
      auth: { username, password },
    };

    const existing = pmData.postgresql as Record<string, unknown> | undefined;
    // Skip if already populated with a real URL
    if (existing?.url && typeof existing.url === 'string' && existing.url.includes('postgresql://')) {
      return;
    }

    pmData.postgresql = pgBlock;
    await writeValuesFile(pmDef.valuesFile, pmData);
    logger.info('Synced posix-mapper DB config from posix-mapper-postgres values');
  } catch (err) {
    logger.warn({ err }, 'Failed to sync posix-mapper DB config');
  }
}

/**
 * Reads the GMS resource ID from posix-mapper values and fans it out to
 * skaha, science-portal, cavern, storage-ui, and doi values files.
 */
const GMS_ID_PATHS: Record<string, string> = {
  skaha: 'deployment.skaha.gmsID',
  'science-portal': 'deployment.sciencePortal.gmsID',
  cavern: 'deployment.cavern.gmsID',
  'storage-ui': 'deployment.storageUI.gmsID',
  doi: 'deployment.doi.gmsID',
};

export async function syncGmsId(): Promise<void> {
  const pmDef = SERVICE_CATALOG['posix-mapper'];
  if (!pmDef?.valuesFile) return;

  try {
    const pmData = await readValuesFile(pmDef.valuesFile);
    const deployment = pmData.deployment as Record<string, unknown> | undefined;
    const posixMapper = deployment?.posixMapper as Record<string, unknown> | undefined;
    const gmsID = posixMapper?.gmsID;
    if (!gmsID || typeof gmsID !== 'string') return;

    let updated = 0;
    for (const [svcId, path] of Object.entries(GMS_ID_PATHS)) {
      const def = SERVICE_CATALOG[svcId as keyof typeof SERVICE_CATALOG];
      if (!def?.valuesFile) continue;
      try {
        const data = await readValuesFile(def.valuesFile);
        const keys = path.split('.');
        const currentVal = keys.reduce<unknown>((obj, k) => {
          if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
          return undefined;
        }, data);

        if (currentVal === gmsID) continue;

        setNestedVal(data, path, gmsID);
        await writeValuesFile(def.valuesFile, data);
        updated++;
      } catch {
        continue;
      }
    }

    if (updated > 0) {
      logger.info({ gmsID, updated }, 'Synced gmsID to service values files');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync gmsID');
  }
}

/**
 * Ensures the IVOA registry (reg-values.yaml) has a GMS service entry.
 * If mock-ac is in the catalog and no GMS entry exists, auto-adds one.
 */
export async function syncRegistryEntries(): Promise<void> {
  const regDef = SERVICE_CATALOG['reg'];
  if (!regDef?.valuesFile) return;

  try {
    const regData = await readValuesFile(regDef.valuesFile);
    const app = (regData.application ?? {}) as Record<string, unknown>;
    const entries = (app.serviceEntries ?? []) as Array<{ id: string; url: string }>;

    const hasGms = entries.some((e) => e.id.includes('/gms'));
    if (hasGms) return;

    // Check if mock-ac is in the catalog (it provides GMS)
    const mockAcDef = SERVICE_CATALOG['mock-ac' as keyof typeof SERVICE_CATALOG];
    if (!mockAcDef) return;

    const hostname = (regData.global as Record<string, unknown>)?.hostname ?? PLATFORM_HOSTNAME;
    entries.push({
      id: 'ivo://cadc.nrc.ca/gms',
      url: `https://${hostname}/ac/capabilities`,
    });
    app.serviceEntries = entries;
    regData.application = app;
    await writeValuesFile(regDef.valuesFile, regData);
    logger.info('Auto-registered GMS (mock-ac) in IVOA registry');
  } catch (err) {
    logger.warn({ err }, 'Failed to sync registry entries');
  }
}

/**
 * Ensures every Dex staticPassword entry has preferredUsername set.
 * Without it, Dex JWT tokens lack the preferred_username claim and
 * StandardIdentityManager cannot create an HttpPrincipal → auth fails.
 */
export async function syncDexPreferredUsername(): Promise<void> {
  const dexDef = SERVICE_CATALOG['dex' as keyof typeof SERVICE_CATALOG];
  if (!dexDef?.valuesFile) return;

  try {
    const data = await readValuesFile(dexDef.valuesFile);
    const passwords = data.staticPasswords as Array<Record<string, string>> | undefined;
    if (!Array.isArray(passwords) || passwords.length === 0) return;

    let changed = false;
    for (const entry of passwords) {
      if (entry.username && !entry.preferredUsername) {
        entry.preferredUsername = entry.username;
        changed = true;
      }
    }

    if (changed) {
      data.staticPasswords = passwords;
      await writeValuesFile(dexDef.valuesFile, data);
      logger.info('Auto-set preferredUsername for Dex static passwords');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync Dex preferredUsername');
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function checkPrerequisites(): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  // Directory checks
  const dirChecks = [
    { id: 'dir-helm-values', label: 'Helm values directory', path: config.helmConfigDir },
    { id: 'dir-haproxy', label: 'HAProxy directory', path: dirname(config.haproxy.configPath) },
    { id: 'dir-charts', label: 'Charts directory', path: config.chartBaseDir },
  ];
  for (const d of dirChecks) {
    const exists = await dirExists(d.path);
    checks.push({
      id: d.id,
      label: d.label,
      status: exists ? 'ok' : 'fail',
      message: exists ? `${d.path} exists` : `${d.path} not found`,
      remedy: exists ? undefined : `Run: mkdir -p ${d.path}`,
    });
  }

  // CLI checks
  checks.push(await checkCli('helm-cli', 'Helm CLI', config.helmBinary, ['version', '--short']));
  checks.push(
    await checkCli('kubectl-cli', 'Kubectl CLI', config.kubectlBinary, ['version', '--client']),
  );

  // Cluster connectivity (warn, not fail)
  try {
    await execa(config.kubectlBinary, ['cluster-info', ...kubeArgs()], {
      timeout: 5000,
      env: kubeEnv(),
    });
    checks.push({
      id: 'kube-cluster',
      label: 'Kubernetes cluster',
      status: 'ok',
      message: 'Cluster reachable',
    });
  } catch {
    checks.push({
      id: 'kube-cluster',
      label: 'Kubernetes cluster',
      status: 'warn',
      message: 'Cluster not reachable',
      remedy: 'Configure KUBE_CONTEXT in .env or ensure your kubeconfig is set up',
    });
  }

  // Values files count (warn if 0)
  try {
    const entries = await readdir(resolve(config.helmConfigDir));
    const yamlCount = entries.filter((f) => f.endsWith('.yaml')).length;
    checks.push({
      id: 'values-files',
      label: 'Helm values files',
      status: yamlCount > 0 ? 'ok' : 'warn',
      message: yamlCount > 0 ? `${yamlCount} values file(s) found` : 'No values files found',
      remedy: yamlCount > 0 ? undefined : 'Add .yaml files to helm-values/ or run npm run setup',
    });
  } catch {
    checks.push({
      id: 'values-files',
      label: 'Helm values files',
      status: 'warn',
      message: 'Could not read helm-values directory',
      remedy: 'Run npm run setup to create directories and copy example files',
    });
  }

  // HAProxy config (warn if missing)
  try {
    await stat(resolve(config.haproxy.configPath));
    checks.push({
      id: 'haproxy-config',
      label: 'HAProxy config',
      status: 'ok',
      message: 'haproxy.cfg found',
    });
  } catch {
    checks.push({
      id: 'haproxy-config',
      label: 'HAProxy config',
      status: 'warn',
      message: 'haproxy.cfg not found',
      remedy: 'HAProxy config will be generated when you deploy HAProxy from the UI',
    });
  }

  const ready = checks
    .filter((c) => ['dir-helm-values', 'dir-haproxy', 'dir-charts', 'helm-cli', 'kubectl-cli'].includes(c.id))
    .every((c) => c.status === 'ok');

  return { ready, checks };
}
