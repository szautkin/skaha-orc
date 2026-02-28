import { mkdir, readdir, copyFile, stat, readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { randomBytes } from 'crypto';
import { execa } from 'execa';
import bcrypt from 'bcryptjs';
import type { PreflightCheck, PreflightResult } from '@skaha-orc/shared';
import { PLATFORM_HOSTNAME, SERVICE_CATALOG } from '@skaha-orc/shared';
import { config } from '../config.js';
import { kubeArgs, kubeEnv } from './kube-args.js';
import { logger } from '../logger.js';
import { getCaInfo, generateCA, generateHAProxyCert, HAPROXY_CERT_PATH, CA_CERT_PATH } from './cert.service.js';
import { generateHAProxyConfig, saveHAProxyConfig } from './haproxy.service.js';
import { readValuesFile, writeValuesFile } from './yaml.service.js';
import { kubectlExec } from './kubectl.service.js';

/**
 * Ensures all helm chart repositories from config.helmRepos are added.
 * Without this, `helm upgrade --install science-platform/base ...` fails
 * on a fresh machine because the repo isn't registered.
 */
export async function ensureHelmRepos(): Promise<void> {
  const repos = config.helmRepos;
  for (const [name, url] of Object.entries(repos)) {
    try {
      await execa(config.helmBinary, ['repo', 'add', name, url, '--force-update'], {
        timeout: 30_000,
      });
      logger.debug({ name, url }, 'Helm repo added');
    } catch (err) {
      logger.warn({ name, url, err }, 'Failed to add helm repo');
    }
  }

  // Run helm repo update to fetch latest chart indexes
  try {
    await execa(config.helmBinary, ['repo', 'update'], { timeout: 60_000 });
    logger.info({ repos: Object.keys(repos) }, 'Helm repos ensured and updated');
  } catch (err) {
    logger.warn({ err }, 'Failed to update helm repos');
  }
}

export async function ensureDirectories(): Promise<void> {
  const dirs = [
    config.helmConfigDir,
    dirname(config.haproxy.configPath),
  ];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
  logger.debug({ dirs }, 'Ensured directories exist');
}

export async function copyExampleValues(): Promise<void> {
  const helmDir = resolve(config.helmConfigDir);

  // Search for helm-values.example/ walking up from the CWD.
  // In a monorepo the dev CWD is packages/backend/ so the example dir
  // at the repo root is two levels up.
  const exampleDir = await findExampleDir();
  if (!exampleDir) {
    logger.debug('No helm-values.example/ directory found, skipping copy');
    return;
  }

  // Get existing files in helm-values/
  let existing: Set<string>;
  try {
    const entries = await readdir(helmDir);
    existing = new Set(entries.filter((f) => f.endsWith('.yaml')));
  } catch {
    existing = new Set();
  }

  // Copy all example files, filling in any that are missing
  const exampleFiles = (await readdir(exampleDir)).filter((f) => f.endsWith('.yaml'));
  let copied = 0;
  for (const file of exampleFiles) {
    if (!existing.has(file)) {
      await copyFile(resolve(exampleDir, file), resolve(helmDir, file));
      copied++;
    }
  }

  if (copied > 0) {
    logger.info({ copied }, 'Copied missing example values files to helm-values/');
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

    // Regenerate haproxy.cfg with SSL now that certs exist.
    // Use default (container) paths — kubernetes/docker deploy mounts certs
    // at container paths. Process mode regenerates config at deploy time.
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
  'storage-ui': 'storage-ui-cacert-secret',
  doi: 'doi-cacert-secret',
};

// Map service → values path prefix for the volume mount arrays
const VOLUME_MOUNT_PREFIXES: Record<string, string> = {
  skaha: 'deployment.skaha',
  cavern: 'deployment.cavern',
  'science-portal': 'deployment.sciencePortal',
  'posix-mapper': 'deployment.posixMapper',
  'storage-ui': 'deployment.storageUI',
  doi: 'deployment.doi',
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
/**
 * Core services that must be registered in the IVOA registry.
 * Without these entries, services that do registry lookups
 * (e.g. science-portal looking up skaha) fail with
 * "not configured in the Registry" errors.
 */
const REQUIRED_REGISTRY_ENTRIES: Array<{ idSuffix: string; pathPrefix: string }> = [
  { idSuffix: 'skaha', pathPrefix: '/skaha/capabilities' },
  { idSuffix: 'cavern', pathPrefix: '/cavern/capabilities' },
  { idSuffix: 'posix-mapper', pathPrefix: '/posix-mapper/capabilities' },
];

export async function syncRegistryEntries(): Promise<void> {
  const regDef = SERVICE_CATALOG['reg'];
  if (!regDef?.valuesFile) return;

  try {
    const regData = await readValuesFile(regDef.valuesFile);
    const app = (regData.application ?? {}) as Record<string, unknown>;
    const entries = (app.serviceEntries ?? []) as Array<{ id: string; url: string }>;
    const hostname = (regData.global as Record<string, unknown>)?.hostname ?? PLATFORM_HOSTNAME;

    let changed = false;

    // Ensure all core service entries exist
    for (const { idSuffix, pathPrefix } of REQUIRED_REGISTRY_ENTRIES) {
      const fullId = `ivo://cadc.nrc.ca/${idSuffix}`;
      if (!entries.some((e) => e.id === fullId)) {
        entries.push({ id: fullId, url: `https://${hostname}${pathPrefix}` });
        changed = true;
      }
    }

    // Ensure GMS entry exists (if mock-ac is in the catalog)
    const mockAcDef = SERVICE_CATALOG['mock-ac' as keyof typeof SERVICE_CATALOG];
    if (mockAcDef && !entries.some((e) => e.id.includes('/gms'))) {
      entries.push({
        id: 'ivo://cadc.nrc.ca/gms',
        url: `https://${hostname}/ac/capabilities`,
      });
      changed = true;
    }

    if (changed) {
      app.serviceEntries = entries;
      regData.application = app;
      await writeValuesFile(regDef.valuesFile, regData);
      logger.info('Auto-registered missing service entries in IVOA registry');
    }
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

/**
 * Ensures posix-mapper values have authorizedClients so Cavern and Skaha
 * can request UID/GID mappings. Without this, user sessions fail.
 */
export async function syncPosixMapperAuthorizedClients(): Promise<void> {
  const pmDef = SERVICE_CATALOG['posix-mapper'];
  if (!pmDef?.valuesFile) return;

  try {
    const data = await readValuesFile(pmDef.valuesFile);
    const pm = ((data.deployment as Record<string, unknown>)?.posixMapper ?? {}) as Record<string, unknown>;
    const existing = pm.authorizedClients as string[] | undefined;
    if (Array.isArray(existing) && existing.length > 0) return;

    pm.authorizedClients = ['sshd', 'cavern', 'skaha'];
    (data.deployment as Record<string, unknown>).posixMapper = pm;
    await writeValuesFile(pmDef.valuesFile, data);
    logger.info('Auto-set posix-mapper authorizedClients');
  } catch (err) {
    logger.warn({ err }, 'Failed to sync posix-mapper authorizedClients');
  }
}

/**
 * Ensures storage-ui feature flags are set in values for org.opencadc.vosui.properties.
 * Without these, the VOSpace UI lacks batch download/upload, paging, and direct download
 * capabilities — confusing for first-time users.
 */
export async function syncStorageUiFeatureFlags(): Promise<void> {
  const def = SERVICE_CATALOG['storage-ui'];
  if (!def?.valuesFile) return;

  const FLAGS: Record<string, boolean> = {
    batchDownload: true,
    batchUpload: true,
    externalLinks: true,
    paging: true,
    directDownload: true,
  };

  try {
    const data = await readValuesFile(def.valuesFile);
    const storageUI = ((data.deployment as Record<string, unknown>)?.storageUI ?? {}) as Record<string, unknown>;

    let changed = false;
    for (const [flag, defaultVal] of Object.entries(FLAGS)) {
      if (storageUI[flag] === undefined) {
        storageUI[flag] = defaultVal;
        changed = true;
      }
    }

    if (changed) {
      (data.deployment as Record<string, unknown>).storageUI = storageUI;
      await writeValuesFile(def.valuesFile, data);
      logger.info('Auto-set storage-ui feature flags (batchDownload, batchUpload, externalLinks, paging, directDownload)');
    }
  } catch (err) {
    logger.debug({ err }, 'Could not sync storage-ui feature flags (values file may not exist yet)');
  }
}

/**
 * Ensures Cavern rootOwner defaults to root/0/0 when empty.
 * Using any other uid/gid requires that user/group to exist in the container.
 */
export async function syncCavernRootOwner(): Promise<void> {
  const cavernDef = SERVICE_CATALOG['cavern'];
  if (!cavernDef?.valuesFile) return;

  try {
    const data = await readValuesFile(cavernDef.valuesFile);
    const cavern = ((data.deployment as Record<string, unknown>)?.cavern ?? {}) as Record<string, unknown>;
    const fs = (cavern.filesystem ?? {}) as Record<string, unknown>;
    const ro = (fs.rootOwner ?? {}) as Record<string, string>;

    let changed = false;
    if (!ro.username) { ro.username = 'root'; changed = true; }
    if (!ro.uid && ro.uid !== '0') { ro.uid = '0'; changed = true; }
    if (!ro.gid && ro.gid !== '0') { ro.gid = '0'; changed = true; }

    if (changed) {
      fs.rootOwner = ro;
      cavern.filesystem = fs;
      (data.deployment as Record<string, unknown>).cavern = cavern;
      await writeValuesFile(cavernDef.valuesFile, data);
      logger.info('Auto-set Cavern rootOwner to root/0/0');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync Cavern rootOwner');
  }
}

/**
 * Fixes directory permissions on Cavern's home and projects directories.
 * The Cavern Java app creates /data/cavern/home and /data/cavern/projects
 * with umask 027 (750 root:root). Users can't traverse into them to access
 * or create allocations. This fixes them to 755.
 */
export async function fixCavernDirPermissions(): Promise<void> {
  const cavernDef = SERVICE_CATALOG['cavern'];
  if (!cavernDef) return;

  try {
    await kubectlExec(
      cavernDef.namespace,
      'cavern-tomcat',
      ['chmod', '755', '/data/cavern/home', '/data/cavern/projects'],
    );
    logger.info('Fixed Cavern home/projects directory permissions to 755');
  } catch (err) {
    // Best-effort — cavern may not be deployed yet, or dirs may not exist yet
    logger.debug({ err }, 'Could not fix Cavern directory permissions (may not be deployed yet)');
  }
}

/**
 * Seeds the posix-mapper database with initial user AND group mappings.
 * Reads seed data from posix-mapper-postgres values (postgres.seed.users).
 *
 * User seeding prevents the recurring problem where a fresh DB auto-assigns
 * new UIDs that don't match existing filesystem ownership, causing
 * Cavern's cadc-gms-1.0.14 TSVPosixPrincipalParser to NPE on null.
 *
 * Group seeding fixes a posix-mapper bug where creating a user (admin → UID 10000)
 * sets GID=10000 in the passwd entry (admin:x:10000:10000:...) but does NOT create
 * a matching group record in mapping.groups. When the notebook init container pulls
 * from Redis to build /etc/group, the primary group is missing, causing:
 *   "groups: cannot find name for group ID 10000"
 * We create a personal group per user (like Linux useradd -U) with GID = UID.
 */
export async function seedPosixMapperDb(): Promise<void> {
  const dbDef = SERVICE_CATALOG['posix-mapper-db'];
  if (!dbDef?.valuesFile) return;

  try {
    const data = await readValuesFile(dbDef.valuesFile);
    const pg = (data.postgres ?? {}) as Record<string, unknown>;
    const auth = (pg.auth ?? {}) as Record<string, unknown>;
    const seed = (pg.seed ?? {}) as Record<string, unknown>;
    const users = (seed.users ?? []) as Array<Record<string, unknown>>;

    if (users.length === 0) {
      logger.debug('No seed users configured in posix-mapper-postgres values');
      return;
    }

    const dbUser = String(auth.username || 'posixmapper');
    const database = String(auth.database || 'posixmapper');
    const schema = String(auth.schema || 'mapping');

    // --- Seed users (only if table is empty) ---
    const userCountResult = await kubectlExec(
      dbDef.namespace,
      'posix-mapper-postgres',
      ['psql', '-U', dbUser, '-d', database, '-t', '-c',
       `SELECT COUNT(*) FROM ${schema}.users;`],
    );

    const userCount = parseInt(userCountResult.trim(), 10);
    if (userCount === 0) {
      const userStatements: string[] = [];
      for (const u of users) {
        const uid = Number(u.uid);
        const uname = String(u.username || '').replace(/'/g, "''");
        if (!uname || isNaN(uid)) continue;
        userStatements.push(
          `INSERT INTO ${schema}.users (uid, username) VALUES (${uid}, '${uname}') ON CONFLICT DO NOTHING;`,
        );
      }

      if (userStatements.length > 0) {
        await kubectlExec(
          dbDef.namespace,
          'posix-mapper-postgres',
          ['psql', '-U', dbUser, '-d', database, '-c', userStatements.join(' ')],
        );
        logger.info({ users: users.map((u) => u.username) }, 'Seeded posix-mapper DB with initial user mappings');
      }
    }

    // --- Seed personal groups (always check, even if users were already seeded) ---
    // posix-mapper creates users but does NOT create matching personal groups.
    // Without the group record, notebook init containers fail with
    // "groups: cannot find name for group ID <uid>".
    const groupStatements: string[] = [];
    for (const u of users) {
      const uid = Number(u.uid);
      const uname = String(u.username || '').replace(/'/g, "''");
      if (!uname || isNaN(uid)) continue;

      // Personal group URI follows CADC convention:
      // ivo://default-group-should-be-ignored.opencadc.org/default-group?<username>
      const groupUri = `ivo://default-group-should-be-ignored.opencadc.org/default-group?${uname}`;
      // Use conditional insert to avoid duplicates (safe even without unique constraints)
      groupStatements.push(
        `INSERT INTO ${schema}.groups (gid, groupuri) SELECT ${uid}, '${groupUri}' WHERE NOT EXISTS (SELECT 1 FROM ${schema}.groups WHERE gid = ${uid});`,
      );
    }

    if (groupStatements.length > 0) {
      try {
        await kubectlExec(
          dbDef.namespace,
          'posix-mapper-postgres',
          ['psql', '-U', dbUser, '-d', database, '-c', groupStatements.join(' ')],
        );
        logger.info({ users: users.map((u) => u.username) }, 'Ensured personal groups exist in posix-mapper DB');
      } catch (groupErr) {
        // Groups table may not exist yet (Hibernate creates on first posix-mapper startup)
        logger.debug({ err: groupErr }, 'Could not seed personal groups (Hibernate may not have created tables yet)');
      }
    }
  } catch (err) {
    // This is best-effort — may fail if posix-mapper-db isn't deployed yet
    logger.debug({ err }, 'Could not seed posix-mapper DB (may not be deployed yet)');
  }
}

/**
 * Ensures every Dex staticPasswords entry has a valid bcrypt hash.
 * Fresh installs have `hash: CHANGE_ME` which causes Dex to crash with
 * "malformed bcrypt hash". This generates a default hash for the password
 * "Test123!" so Dex can start out-of-box.
 */
export async function syncDexBcryptHash(): Promise<void> {
  const dexDef = SERVICE_CATALOG['dex' as keyof typeof SERVICE_CATALOG];
  if (!dexDef?.valuesFile) return;

  try {
    const data = await readValuesFile(dexDef.valuesFile);
    const passwords = data.staticPasswords as Array<Record<string, string>> | undefined;
    if (!Array.isArray(passwords) || passwords.length === 0) return;

    let changed = false;
    for (const entry of passwords) {
      if (!entry.hash || entry.hash.includes('CHANGE_ME') || entry.hash.length < 50) {
        entry.hash = bcrypt.hashSync('Test123!', 10);
        changed = true;
      }
    }

    if (changed) {
      data.staticPasswords = passwords;
      await writeValuesFile(dexDef.valuesFile, data);
      logger.info('Auto-generated bcrypt hash for Dex static passwords (default password: Test123!)');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync Dex bcrypt hash');
  }
}

/**
 * Service IDs with a `postgres.auth.password` field that should not be CHANGE_ME.
 * Generates a random password if it is, so the DB starts with a real credential.
 * Must run BEFORE syncPosixMapperDbConfig() which propagates the password.
 */
const DB_PASSWORD_SERVICES = ['posix-mapper-db', 'cavern'] as const;

export async function syncDbPasswords(): Promise<void> {
  let updated = 0;

  for (const serviceId of DB_PASSWORD_SERVICES) {
    const def = SERVICE_CATALOG[serviceId as keyof typeof SERVICE_CATALOG];
    if (!def?.valuesFile) continue;

    try {
      const data = await readValuesFile(def.valuesFile);
      const pg = (data.postgres ?? {}) as Record<string, unknown>;
      const auth = (pg.auth ?? {}) as Record<string, string>;

      if (auth.password && !auth.password.includes('CHANGE_ME')) continue;

      auth.password = randomBytes(16).toString('hex');
      pg.auth = auth;
      data.postgres = pg;
      await writeValuesFile(def.valuesFile, data);
      updated++;
    } catch { continue; }
  }

  if (updated > 0) {
    logger.info({ updated }, 'Auto-generated DB passwords for services with CHANGE_ME');
  }
}

/**
 * Ensures Traefik (base chart) has cross-namespace discovery enabled.
 * Without this, Traefik in the `default` namespace cannot discover
 * IngressRoutes in `skaha-system`, and all services return 404.
 */
export async function syncBaseTraefikConfig(): Promise<void> {
  const baseDef = SERVICE_CATALOG['base' as keyof typeof SERVICE_CATALOG];
  if (!baseDef?.valuesFile) return;

  try {
    const data = await readValuesFile(baseDef.valuesFile);
    let changed = false;

    // Ensure traefik.providers.kubernetesCRD.allowCrossNamespace = true
    // Traefik deploys to `default` namespace but IngressRoutes live in `skaha-system`.
    // Without this, Traefik ignores all IngressRoutes and every service returns 404.
    // Note: only kubernetesCRD has allowCrossNamespace — kubernetesIngress does not.
    const crdPath = 'traefik.providers.kubernetesCRD.allowCrossNamespace';
    const crdKeys = crdPath.split('.');
    const crdVal = crdKeys.reduce<unknown>((obj, k) => {
      if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
      return undefined;
    }, data);

    if (crdVal !== true) {
      setNestedVal(data, crdPath, true);
      changed = true;
    }

    if (changed) {
      await writeValuesFile(baseDef.valuesFile, data);
      logger.info('Ensured Traefik cross-namespace CRD discovery is enabled in base values');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync base Traefik config');
  }
}

/**
 * Injects the generated TLS cert+key into the base chart values so Traefik
 * serves our CA-signed cert instead of its auto-generated default cert
 * ("CN=TRAEFIK DEFAULT CERT"). Without this, Java services don't trust
 * Traefik's TLS and all inter-service HTTPS calls fail silently.
 */
export async function syncTraefikTlsCert(): Promise<void> {
  const baseDef = SERVICE_CATALOG['base' as keyof typeof SERVICE_CATALOG];
  if (!baseDef?.valuesFile) return;

  try {
    if (!(await fileExists(HAPROXY_CERT_PATH))) return;

    const combinedPem = await readFile(HAPROXY_CERT_PATH, 'utf-8');

    // Split combined PEM into cert and key
    const certMatch = combinedPem.match(/(-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----)/);
    const keyMatch = combinedPem.match(/(-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----)/);
    if (!certMatch || !keyMatch) {
      logger.warn('Server cert PEM does not contain both cert and key sections');
      return;
    }

    const certB64 = Buffer.from(certMatch[1]!).toString('base64');
    const keyB64 = Buffer.from(keyMatch[1]!).toString('base64');

    const data = await readValuesFile(baseDef.valuesFile);
    let changed = false;

    // Inject TLS secret: secrets.default-certificate
    const secrets = ((data.secrets ?? {}) as Record<string, Record<string, string>>);
    if (!secrets['default-certificate'] ||
        secrets['default-certificate']['tls.crt'] !== certB64 ||
        secrets['default-certificate']['tls.key'] !== keyB64) {
      secrets['default-certificate'] = { 'tls.crt': certB64, 'tls.key': keyB64 };
      data.secrets = secrets;
      changed = true;
    }

    // Point Traefik's default TLS store at our secret
    const storePath = 'traefik.tlsStore.default.defaultCertificate.secretName';
    const storeKeys = storePath.split('.');
    const storeVal = storeKeys.reduce<unknown>((obj, k) => {
      if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
      return undefined;
    }, data);

    if (storeVal !== 'default-certificate') {
      setNestedVal(data, storePath, 'default-certificate');
      changed = true;
    }

    if (changed) {
      await writeValuesFile(baseDef.valuesFile, data);
      logger.info('Injected TLS cert into base chart — Traefik will serve our CA-signed cert');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync Traefik TLS cert');
  }
}

/**
 * After the base chart (Traefik) is deployed, discovers the Traefik service
 * ClusterIP and updates all hostAliases in values files. Pods need to reach
 * Traefik via its ClusterIP, not the host machine's IP (which may be a
 * home router like 10.0.0.1 that's unreachable from inside the cluster).
 */
export async function syncTraefikClusterIp(): Promise<void> {
  try {
    // Discover the Traefik service ClusterIP in the default namespace
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(), 'get', 'svc', '-n', 'default',
      '-l', 'app.kubernetes.io/name=traefik',
      '-o', 'jsonpath={.items[0].spec.clusterIP}',
    ], { env: { ...process.env, ...kubeEnv() }, timeout: 10_000 });

    const clusterIp = stdout.trim();
    if (!clusterIp || clusterIp === '<none>') {
      logger.debug('Traefik service not found or has no ClusterIP (base may not be deployed yet)');
      return;
    }

    let updated = 0;
    for (const def of Object.values(SERVICE_CATALOG)) {
      if (!def.valuesFile) continue;
      try {
        const data = await readValuesFile(def.valuesFile);
        const deployment = (data.deployment ?? {}) as Record<string, unknown>;
        const extraHosts = deployment.extraHosts as Array<{ ip: string; hostname: string }> | undefined;
        if (!Array.isArray(extraHosts)) continue;

        let changed = false;
        for (const host of extraHosts) {
          if (host.hostname === PLATFORM_HOSTNAME && host.ip !== clusterIp) {
            host.ip = clusterIp;
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
      logger.info({ clusterIp, updated }, 'Updated hostAliases to Traefik ClusterIP');
    }
  } catch {
    // Cluster not reachable or base not deployed — skip silently
    logger.debug('Could not discover Traefik ClusterIP (cluster may not be reachable)');
  }
}

/**
 * Ensures URL fields in values files have the https:// protocol prefix.
 * Without this, Java's RegistryClient throws MalformedURLException: no protocol.
 */
const URL_FIELD_PATHS: Record<string, string[]> = {
  skaha: [
    'deployment.skaha.registryURL',
    'deployment.skaha.oidcURI',
    'deployment.skaha.oidc.uri',
    'deployment.skaha.oidc.callbackURI',
    'deployment.skaha.oidc.redirectURI',
  ],
  cavern: [
    'deployment.cavern.registryURL',
    'deployment.cavern.oidcURI',
  ],
  'posix-mapper': [
    'deployment.posixMapper.registryURL',
    'deployment.posixMapper.oidcURI',
  ],
  'science-portal': [
    'deployment.sciencePortal.registryURL',
    'deployment.sciencePortal.oidc.uri',
    'deployment.sciencePortal.oidc.callbackURI',
    'deployment.sciencePortal.oidc.redirectURI',
  ],
  'storage-ui': [
    'deployment.storageUI.registryURL',
    'deployment.storageUI.oidc.uri',
    'deployment.storageUI.oidc.callbackURI',
    'deployment.storageUI.oidc.redirectURI',
  ],
  doi: [
    'deployment.doi.registryURL',
  ],
};

export async function syncUrlProtocol(): Promise<void> {
  let totalFixed = 0;

  for (const [serviceId, paths] of Object.entries(URL_FIELD_PATHS)) {
    const def = SERVICE_CATALOG[serviceId as keyof typeof SERVICE_CATALOG];
    if (!def?.valuesFile) continue;

    try {
      const data = await readValuesFile(def.valuesFile);
      let changed = false;

      for (const path of paths) {
        const keys = path.split('.');
        const val = keys.reduce<unknown>((obj, k) => {
          if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
          return undefined;
        }, data);

        if (typeof val === 'string' && val.length > 0 &&
            !val.startsWith('https://') && !val.startsWith('http://')) {
          // Looks like a hostname without protocol — prepend https://
          setNestedVal(data, path, `https://${val}`);
          changed = true;
          totalFixed++;
        }
      }

      if (changed) {
        await writeValuesFile(def.valuesFile, data);
      }
    } catch {
      continue;
    }
  }

  if (totalFixed > 0) {
    logger.info({ totalFixed }, 'Fixed URL fields missing https:// protocol prefix');
  }
}

/**
 * Detects if the cluster is a Kind cluster and loads locally-built images.
 * Kind clusters can't pull from external registries without explicit loading.
 */
export async function loadKindImages(): Promise<void> {
  try {
    // Check if we're running against a Kind cluster
    const { stdout: contextName } = await execa(config.kubectlBinary, [
      ...kubeArgs(), 'config', 'current-context',
    ], { env: { ...process.env, ...kubeEnv() }, timeout: 5_000 });

    if (!contextName.trim().startsWith('kind-')) {
      return; // Not a Kind cluster
    }

    const clusterName = contextName.trim().replace('kind-', '');

    // Load mock-ac image into Kind
    try {
      await execa('kind', [
        'load', 'docker-image',
        'ghcr.io/szautkin/skaha-orc/mock-ac:latest',
        '--name', clusterName,
      ], { timeout: 60_000 });
      logger.info({ clusterName }, 'Loaded mock-ac image into Kind cluster');
    } catch (err) {
      // Image may not exist locally — that's OK, Kind will pull from GHCR
      logger.debug({ err }, 'Could not load mock-ac image into Kind (may pull from GHCR instead)');
    }
  } catch {
    // Not a Kind cluster or kind CLI not available
  }
}

/**
 * Auto-detects the Kubernetes node name and updates volumes.yaml so the
 * workload PV gets the correct nodeAffinity for local volumes.
 * Without this, the PV is stuck on "docker-desktop" and can't schedule
 * on Kind or other local clusters with different node names.
 */
export async function syncWorkloadNodeName(): Promise<void> {
  const volumesDef = SERVICE_CATALOG['volumes'];
  if (!volumesDef?.valuesFile) return;

  try {
    const data = await readValuesFile(volumesDef.valuesFile);
    const wl = (data.workload ?? {}) as Record<string, unknown>;
    const currentName = String(wl.nodeName || '');

    // Only auto-detect if unset or still the default placeholder
    if (currentName && currentName !== 'docker-desktop') return;

    // Get actual node name from the cluster
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(), 'get', 'nodes',
      '-o', 'jsonpath={.items[0].metadata.name}',
    ], { env: { ...process.env, ...kubeEnv() }, timeout: 10_000 });

    const nodeName = stdout.trim();
    if (!nodeName || nodeName === currentName) return;

    wl.nodeName = nodeName;
    data.workload = wl;
    await writeValuesFile(volumesDef.valuesFile, data);
    logger.info({ from: currentName || '(empty)', to: nodeName }, 'Auto-detected workload PV node name');
  } catch (err) {
    // Cluster may not be reachable — keep existing value
    logger.debug({ err }, 'Could not auto-detect workload node name (cluster may not be reachable)');
  }
}

/**
 * Pre-creates home directories inside the Cavern pod for all seed users.
 * Works around a CADC HttpUpload bug where the bearer token is not
 * forwarded on PUT requests, causing Cavern to reject home directory
 * creation as unauthenticated. By pre-creating the dirs with correct
 * ownership, first-login "just works" without hitting the PUT bug.
 */
export async function provisionCavernHomeDirs(): Promise<void> {
  const cavernDef = SERVICE_CATALOG['cavern'];
  const dbDef = SERVICE_CATALOG['posix-mapper-db'];
  if (!cavernDef || !dbDef?.valuesFile) return;

  try {
    const dbData = await readValuesFile(dbDef.valuesFile);
    const pg = (dbData.postgres ?? {}) as Record<string, unknown>;
    const seed = (pg.seed ?? {}) as Record<string, unknown>;
    const users = (seed.users ?? []) as Array<Record<string, unknown>>;

    if (users.length === 0) return;

    // Read GID start from posix-mapper values (default 900000 per CADC convention).
    // The first group registered (skaha-users) gets gid.start as its GID.
    const pmDef = SERVICE_CATALOG['posix-mapper'];
    let gidStart = 900000;
    if (pmDef?.valuesFile) {
      try {
        const pmData = await readValuesFile(pmDef.valuesFile);
        const pm = ((pmData.deployment as Record<string, unknown>)?.posixMapper ?? {}) as Record<string, unknown>;
        const minGid = Number(pm.minGID);
        if (!isNaN(minGid) && minGid > 0) gidStart = minGid;
      } catch { /* use default */ }
    }

    for (const u of users) {
      const username = String(u.username || '');
      const uid = Number(u.uid);
      if (!username || isNaN(uid)) continue;

      try {
        await kubectlExec(cavernDef.namespace, 'cavern-tomcat', [
          'sh', '-c',
          `mkdir -p /data/cavern/home/${username} && chown ${uid}:${gidStart} /data/cavern/home/${username}`,
        ]);
        logger.info({ username, uid, gid: gidStart }, 'Provisioned Cavern home directory');
      } catch (err) {
        logger.debug({ username, err }, 'Could not provision Cavern home dir (may not be deployed yet)');
      }
    }
  } catch (err) {
    logger.debug({ err }, 'Could not provision Cavern home directories');
  }
}

/**
 * OIDC client definitions — maps Dex clientID to the services that share
 * that client and the values paths where the clientSecret lives.
 */
const OIDC_CLIENT_MAP: Array<{
  clientId: string;
  serviceSecretPaths: Array<{ serviceId: string; path: string }>;
}> = [
  {
    clientId: 'science-portal',
    serviceSecretPaths: [
      { serviceId: 'science-portal', path: 'deployment.sciencePortal.oidc.clientSecret' },
      { serviceId: 'skaha', path: 'deployment.skaha.oidc.clientSecret' },
    ],
  },
  {
    clientId: 'storage-ui',
    serviceSecretPaths: [
      { serviceId: 'storage-ui', path: 'deployment.storageUI.oidc.clientSecret' },
    ],
  },
];

/**
 * Auto-generates OIDC client secrets when they contain CHANGE_ME.
 * Generates a random 32-byte hex secret and syncs it to both the Dex
 * staticClients entry and all services that share that clientID.
 */
export async function syncOidcClientSecrets(): Promise<void> {
  const dexDef = SERVICE_CATALOG['dex' as keyof typeof SERVICE_CATALOG];
  if (!dexDef?.valuesFile) return;

  try {
    const dexData = await readValuesFile(dexDef.valuesFile);
    const clients = dexData.staticClients as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(clients)) return;

    let dexChanged = false;

    for (const { clientId, serviceSecretPaths } of OIDC_CLIENT_MAP) {
      const dexClient = clients.find((c) => c.id === clientId);
      if (!dexClient) continue;

      const dexSecret = typeof dexClient.secret === 'string' ? dexClient.secret : '';
      const needsGenerate = !dexSecret || dexSecret.includes('CHANGE_ME');

      const secret = needsGenerate
        ? randomBytes(32).toString('hex')
        : dexSecret;

      if (needsGenerate) {
        dexClient.secret = secret;
        dexChanged = true;
      }

      // Fan out the secret to all services that use this clientID
      for (const { serviceId, path } of serviceSecretPaths) {
        const def = SERVICE_CATALOG[serviceId as keyof typeof SERVICE_CATALOG];
        if (!def?.valuesFile) continue;
        try {
          const data = await readValuesFile(def.valuesFile);
          const keys = path.split('.');
          const current = keys.reduce<unknown>((obj, k) => {
            if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
            return undefined;
          }, data);

          if (current !== secret) {
            setNestedVal(data, path, secret);
            await writeValuesFile(def.valuesFile, data);
          }
        } catch { continue; }
      }
    }

    if (dexChanged) {
      await writeValuesFile(dexDef.valuesFile, dexData);
      logger.info('Auto-generated OIDC client secrets and synced to services');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync OIDC client secrets');
  }
}

/**
 * Maps Dex clientID to the service(s) whose callbackURI AND redirectURI
 * should both appear in the Dex client's redirectURIs whitelist.
 * Dex needs both registered because the OIDC flow may use either URI
 * as the redirect_uri parameter at different stages.
 */
const DEX_REDIRECT_MAP: Array<{
  clientId: string;
  uriPaths: Array<{ serviceId: string; callbackPath: string; redirectPath: string }>;
}> = [
  {
    clientId: 'science-portal',
    uriPaths: [
      {
        serviceId: 'science-portal',
        callbackPath: 'deployment.sciencePortal.oidc.callbackURI',
        redirectPath: 'deployment.sciencePortal.oidc.redirectURI',
      },
      {
        serviceId: 'skaha',
        callbackPath: 'deployment.skaha.oidc.callbackURI',
        redirectPath: 'deployment.skaha.oidc.redirectURI',
      },
    ],
  },
  {
    clientId: 'storage-ui',
    uriPaths: [
      {
        serviceId: 'storage-ui',
        callbackPath: 'deployment.storageUI.oidc.callbackURI',
        redirectPath: 'deployment.storageUI.oidc.redirectURI',
      },
    ],
  },
];

/**
 * Reads both callbackURI and redirectURI from each OIDC service and
 * ensures Dex's staticClients[].redirectURIs includes both.
 * Without this, Dex rejects the redirect_uri with "unregistered url".
 */
export async function syncDexRedirectUris(): Promise<void> {
  const dexDef = SERVICE_CATALOG['dex' as keyof typeof SERVICE_CATALOG];
  if (!dexDef?.valuesFile) return;

  try {
    const dexData = await readValuesFile(dexDef.valuesFile);
    const clients = dexData.staticClients as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(clients)) return;

    let changed = false;

    for (const { clientId, uriPaths } of DEX_REDIRECT_MAP) {
      const dexClient = clients.find((c) => c.id === clientId);
      if (!dexClient) continue;

      const redirectURIs: string[] = [];
      for (const { serviceId, callbackPath, redirectPath } of uriPaths) {
        const def = SERVICE_CATALOG[serviceId as keyof typeof SERVICE_CATALOG];
        if (!def?.valuesFile) continue;
        try {
          const data = await readValuesFile(def.valuesFile);

          // Collect both callbackURI and redirectURI
          for (const path of [callbackPath, redirectPath]) {
            const keys = path.split('.');
            const val = keys.reduce<unknown>((obj, k) => {
              if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
              return undefined;
            }, data);
            if (typeof val === 'string' && val.length > 0 && !redirectURIs.includes(val)) {
              redirectURIs.push(val);
            }
          }
        } catch { continue; }
      }

      if (redirectURIs.length === 0) continue;

      const existing = Array.isArray(dexClient.redirectURIs)
        ? dexClient.redirectURIs as string[]
        : [];
      const missing = redirectURIs.filter((uri) => !existing.includes(uri));
      if (missing.length > 0) {
        dexClient.redirectURIs = redirectURIs;
        changed = true;
      }
    }

    if (changed) {
      await writeValuesFile(dexDef.valuesFile, dexData);
      logger.info('Synced Dex staticClients redirectURIs from service callbackURI values');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to sync Dex redirect URIs');
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

  // Helm repos check
  try {
    const { stdout } = await execa(config.helmBinary, ['repo', 'list', '-o', 'json'], { timeout: 5000 });
    const repos = JSON.parse(stdout) as Array<{ name: string }>;
    const repoNames = repos.map((r) => r.name);
    const missing = Object.keys(config.helmRepos).filter((r) => !repoNames.includes(r));
    if (missing.length === 0) {
      checks.push({
        id: 'helm-repos',
        label: 'Helm repositories',
        status: 'ok',
        message: `All repos configured (${Object.keys(config.helmRepos).join(', ')})`,
      });
    } else {
      checks.push({
        id: 'helm-repos',
        label: 'Helm repositories',
        status: 'warn',
        message: `Missing repos: ${missing.join(', ')}`,
        remedy: 'Restart the backend — repos are added automatically on startup',
      });
    }
  } catch {
    checks.push({
      id: 'helm-repos',
      label: 'Helm repositories',
      status: 'warn',
      message: 'Could not check helm repos',
      remedy: 'Ensure helm is installed and run: helm repo list',
    });
  }

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
