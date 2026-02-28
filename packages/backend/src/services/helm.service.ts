import { resolve, join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { execa } from 'execa';
import { dump as yamlDump } from 'js-yaml';
import type { DeploymentPhase, ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG } from '@skaha-orc/shared';
import { config, valuesFilePath } from '../config.js';
import { readValuesFile } from './yaml.service.js';
import { eventBus } from '../sse/event-bus.js';
import { logger } from '../logger.js';
import { kubeArgs, kubeEnv, helmContextArgs } from './kube-args.js';
import { waitForHealthy } from './health.service.js';
import { isHAProxyRunning, isHAProxyPaused, deployHAProxy, stopHAProxy, detectDeployMode } from './haproxy.service.js';
import { fixCavernDirPermissions, provisionCavernHomeDirs } from './bootstrap.service.js';

/** Extract useful fields from an execa error for logging. */
function execaErrorDetail(err: unknown): Record<string, unknown> {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return {
      message: e.message,
      command: e.command,
      exitCode: e.exitCode,
      stdout: typeof e.stdout === 'string' ? e.stdout.slice(0, 2000) : undefined,
      stderr: typeof e.stderr === 'string' ? e.stderr.slice(0, 2000) : undefined,
    };
  }
  return { message: String(err) };
}

/**
 * Maps each kubectl-type service to the K8s resource used for status detection.
 * Each service checks for its own unique resource so they don't overlap.
 */
const KUBECTL_STATUS_RESOURCE: Partial<Record<ServiceId, { kind: string; name: string }>> = {
  volumes: { kind: 'pvc', name: 'skaha-pvc' },
  'posix-mapper-db': { kind: 'deployment', name: 'posix-mapper-postgres' },
};

interface HelmRelease {
  name: string;
  namespace: string;
  revision: string;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
}

export async function helmList(): Promise<HelmRelease[]> {
  try {
    const { stdout } = await execa(config.helmBinary, [...helmContextArgs(), 'list', '--all-namespaces', '-o', 'json'], { env: { ...process.env, ...kubeEnv() } });
    return JSON.parse(stdout) as HelmRelease[];
  } catch (err) {
    logger.warn(execaErrorDetail(err), 'helm list failed');
    return [];
  }
}

export async function helmStatus(releaseName: string, namespace: string): Promise<string | null> {
  try {
    const { stdout } = await execa(config.helmBinary, [
      ...helmContextArgs(),
      'status',
      releaseName,
      '-n',
      namespace,
      '-o',
      'json',
    ], { env: { ...process.env, ...kubeEnv() } });
    const parsed = JSON.parse(stdout) as { info?: { status?: string } };
    return parsed.info?.status ?? null;
  } catch (err) {
    logger.debug({ serviceId: releaseName, ...execaErrorDetail(err) }, 'helm status failed (likely not installed)');
    return null;
  }
}

function getChartRef(serviceId: ServiceId): string {
  const def = SERVICE_CATALOG[serviceId];
  const src = def.chartSource;
  if (src.type === 'repo') return `${src.repo}/${src.chart}`;
  if (src.type === 'local') return resolve(config.chartBaseDir, src.path);
  return '';
}

function getReleaseName(serviceId: ServiceId): string {
  // Use service ID as release name (matches existing convention)
  return serviceId;
}

/**
 * Ensures a namespace has Helm ownership labels/annotations so that
 * `helm upgrade --install --create-namespace` can adopt it.
 * This prevents the "invalid ownership metadata" error when a namespace
 * was created by another mechanism (HAProxy k8s deploy, manual kubectl, etc.).
 */
async function ensureNamespaceHelmLabels(serviceId: ServiceId): Promise<void> {
  const def = SERVICE_CATALOG[serviceId];
  const ns = def.namespace;
  // Only the 'base' chart manages namespace creation; other charts just use it
  const releaseName = serviceId === 'base' ? 'base' : serviceId;

  try {
    // Check if namespace exists
    await execa(config.kubectlBinary, [
      ...kubeArgs(), 'get', 'namespace', ns,
    ], { env: { ...process.env, ...kubeEnv() } });

    // Namespace exists — ensure it has Helm labels
    await execa(config.kubectlBinary, [
      ...kubeArgs(), 'label', 'namespace', ns,
      'app.kubernetes.io/managed-by=Helm', '--overwrite',
    ], { env: { ...process.env, ...kubeEnv() } });
    await execa(config.kubectlBinary, [
      ...kubeArgs(), 'annotate', 'namespace', ns,
      `meta.helm.sh/release-name=${releaseName}`,
      `meta.helm.sh/release-namespace=${ns}`,
      '--overwrite',
    ], { env: { ...process.env, ...kubeEnv() } });
    logger.debug({ ns, releaseName }, 'Ensured namespace has Helm ownership labels');
  } catch {
    // Namespace doesn't exist yet — Helm will create it with --create-namespace
  }
}

export async function helmDeploy(
  serviceId: ServiceId,
  options: { dryRun?: boolean } = {},
): Promise<{ success: boolean; output: string }> {
  const def = SERVICE_CATALOG[serviceId];

  if (def.chartSource.type === 'haproxy') {
    try {
      const mode = await detectDeployMode() ?? 'kubernetes';
      const output = await deployHAProxy(mode);
      return { success: true, output };
    } catch (err) {
      logger.error({ serviceId, ...execaErrorDetail(err) }, 'HAProxy deploy failed');
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: message };
    }
  }

  if (def.chartSource.type === 'kubectl') {
    return kubectlApply(serviceId);
  }

  // Pre-deploy: ensure target namespace has Helm ownership labels.
  // Without these, `helm upgrade --install` refuses to adopt an existing namespace.
  await ensureNamespaceHelmLabels(serviceId);

  const chartRef = getChartRef(serviceId);
  const releaseName = getReleaseName(serviceId);
  const args = [...helmContextArgs(), 'upgrade', '--install', releaseName, chartRef, '-n', def.namespace, '--create-namespace'];

  if (def.valuesFile) {
    args.push('--values', valuesFilePath(def.valuesFile));
  }

  if (def.chartSource.type === 'local') {
    args.push('--dependency-update');
  }

  if (options.dryRun) {
    args.push('--dry-run=client');
  }

  const timestamp = () => new Date().toISOString();

  eventBus.broadcast({
    type: 'phase_change',
    serviceId,
    phase: 'deploying',
    message: `Running: ${config.helmBinary} ${args.join(' ')}`,
    timestamp: timestamp(),
  });

  try {
    const proc = execa(config.helmBinary, args, { env: { ...process.env, ...kubeEnv() } });

    proc.stdout?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) {
        eventBus.broadcast({ type: 'log', serviceId, message: msg, timestamp: timestamp() });
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) {
        eventBus.broadcast({ type: 'log', serviceId, message: msg, timestamp: timestamp() });
      }
    });

    const result = await proc;
    const output = result.stdout + '\n' + result.stderr;

    eventBus.broadcast({
      type: 'phase_change',
      serviceId,
      phase: 'deployed',
      message: `${serviceId} deployed successfully`,
      timestamp: timestamp(),
    });

    // Fire-and-forget health check + post-deploy hooks
    if (serviceId === 'cavern') {
      // Cavern creates /data/cavern/home and /data/cavern/projects with 750.
      // Users can't traverse into them. Fix permissions after pod is healthy.
      // Also pre-create home dirs for seed users (workaround for CADC HttpUpload
      // token bug that drops auth on PUT, blocking first-login home dir creation).
      waitForHealthy(serviceId)
        .then(() => fixCavernDirPermissions())
        .then(() => provisionCavernHomeDirs())
        .catch((e) => logger.error({ serviceId, err: e }, 'Cavern post-deploy failed'));
    } else {
      waitForHealthy(serviceId).catch((e) =>
        logger.error({ serviceId, err: e }, 'Health check failed unexpectedly'),
      );
    }

    return { success: true, output };
  } catch (err) {
    const detail = execaErrorDetail(err);
    logger.error({ serviceId, ...detail }, 'Helm deploy failed');

    const output = [detail.stderr, detail.stdout, detail.message].filter(Boolean).join('\n');

    eventBus.broadcast({
      type: 'error',
      serviceId,
      phase: 'failed',
      message: `Deploy failed: ${output}`,
      timestamp: timestamp(),
    });

    return { success: false, output };
  }
}

/** Validate a Kubernetes quantity string (e.g. "10Gi", "500Mi", "1Ti"). */
function validateQuantity(value: string, field: string): string {
  const valid = /^\d+(\.\d+)?(Ki|Mi|Gi|Ti|Pi|Ei|m|k|M|G|T|P|E)?$/;
  if (!valid.test(value)) {
    throw new Error(`Invalid quantity "${value}" for ${field}. Expected format: <number><suffix> (e.g. 10Gi, 500Mi, 1Ti)`);
  }
  return value;
}

/** Render K8s manifest YAML from a values file for kubectl-type services. */
function renderManifest(serviceId: ServiceId, values: Record<string, unknown>): string {
  const def = SERVICE_CATALOG[serviceId];

  if (serviceId === 'volumes') {
    const cavern = (values.cavern ?? {}) as Record<string, unknown>;
    const nfs = (cavern.nfs ?? {}) as Record<string, unknown>;
    const capacity = validateQuantity(String(cavern.capacity || '10Gi'), 'cavern.capacity');
    const storageClass = String(cavern.storageClassName ?? '');
    const nfsServer = String(nfs.server || '');
    const nfsPath = String(nfs.path || '/data/cavern');
    const hostPath = String(cavern.hostPath || '');

    // If NFS server is configured (and not a placeholder), use NFS; otherwise hostPath (local dev)
    const useNfs = nfsServer.length > 0 && !nfsServer.includes('example') && !nfsServer.includes('CHANGE_ME');
    const accessMode = useNfs ? 'ReadWriteMany' : 'ReadWriteOnce';

    // Build K8s objects as plain JS, then serialize with yaml.dump for correct typing
    const cavernPv: Record<string, unknown> = {
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: { name: 'skaha-pv', labels: { app: 'cavern' } },
      spec: {
        capacity: { storage: capacity },
        accessModes: [accessMode],
        storageClassName: storageClass,
        ...(useNfs
          ? { nfs: { server: nfsServer, path: nfsPath } }
          : { hostPath: { path: hostPath || '/var/lib/k8s-pvs/science-platform', type: 'DirectoryOrCreate' } }),
      },
    };

    const cavernPvc: Record<string, unknown> = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name: 'skaha-pvc', namespace: def.namespace },
      spec: {
        accessModes: [accessMode],
        storageClassName: storageClass,
        resources: { requests: { storage: capacity } },
        volumeName: 'skaha-pv',
      },
    };

    // Workload PV/PVC — used by Skaha session pods to access cavern storage
    const wl = (values.workload ?? {}) as Record<string, unknown>;
    const wlPvName = String(wl.pvName || 'skaha-workload-pv');
    const wlPvcName = String(wl.pvcName || 'skaha-workload-cavern-pvc');
    const wlNamespace = String(wl.namespace || 'skaha-workload');
    const wlCapacity = validateQuantity(String(wl.capacity || capacity), 'workload.capacity');
    const wlStorageClass = String(wl.storageClassName ?? storageClass);
    const wlAccessModes = (wl.accessModes ?? ['ReadWriteMany']) as string[];
    const wlAccessMode = wlAccessModes[0] || 'ReadWriteMany';
    const wlHostPath = String(wl.hostPath || hostPath || '/var/lib/k8s-pvs/science-platform');
    // Node name is auto-detected by syncWorkloadNodeName() bootstrap
    // and written to volumes.yaml before deploy. Fallback to docker-desktop
    // only if bootstrap hasn't run yet (should not happen in normal flow).
    const wlNodeName = String(wl.nodeName || 'docker-desktop');

    const workloadPv: Record<string, unknown> = {
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: {
        name: wlPvName,
        labels: { storage: 'skaha-workload-storage' },
        annotations: { 'helm.sh/resource-policy': 'keep' },
      },
      spec: {
        capacity: { storage: wlCapacity },
        accessModes: [wlAccessMode],
        storageClassName: wlStorageClass,
        persistentVolumeReclaimPolicy: String(wl.reclaimPolicy || 'Retain'),
        ...(useNfs
          ? { nfs: { server: nfsServer, path: nfsPath } }
          : {
              local: { path: wlHostPath },
              nodeAffinity: {
                required: {
                  nodeSelectorTerms: [{
                    matchExpressions: [{
                      key: 'kubernetes.io/hostname',
                      operator: 'In',
                      values: [wlNodeName],
                    }],
                  }],
                },
              },
            }),
      },
    };

    const workloadPvc: Record<string, unknown> = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name: wlPvcName, namespace: wlNamespace },
      spec: {
        accessModes: [wlAccessMode],
        storageClassName: wlStorageClass,
        resources: { requests: { storage: wlCapacity } },
        volumeName: wlPvName,
      },
    };

    const sysNs = { apiVersion: 'v1', kind: 'Namespace', metadata: { name: def.namespace } };
    const wlNs = { apiVersion: 'v1', kind: 'Namespace', metadata: { name: wlNamespace } };

    // Namespaces first, then PVs (cluster-scoped), then PVCs (namespaced)
    const objects = [sysNs, wlNs, cavernPv, cavernPvc, workloadPv, workloadPvc];
    return objects.map((o) => yamlDump(o, { lineWidth: -1, noRefs: true }).trim()).join('\n---\n');
  }

  if (serviceId === 'posix-mapper-db') {
    const pg = (values.postgres ?? {}) as Record<string, unknown>;
    const auth = (pg.auth ?? {}) as Record<string, unknown>;
    const storage = (pg.storage ?? {}) as Record<string, unknown>;
    const storageSpec = (storage.spec ?? {}) as Record<string, unknown>;
    const resources = (storageSpec.resources ?? {}) as Record<string, unknown>;
    const requests = (resources.requests ?? {}) as Record<string, unknown>;

    const image = String(pg.image || 'postgres:14');
    const username = String(auth.username || 'posixmapper');
    const password = String(auth.password || 'posixmapper');
    const database = String(auth.database || 'posixmapper');
    const schema = String(auth.schema || 'mapping');
    const storageSize = validateQuantity(String(requests.storage || '1Gi'), 'postgres.storage.spec.resources.requests.storage');

    return [
      `apiVersion: v1`,
      `kind: PersistentVolumeClaim`,
      `metadata:`,
      `  name: posix-mapper-postgres-pvc`,
      `  namespace: ${def.namespace}`,
      `spec:`,
      `  accessModes:`,
      `    - ReadWriteOnce`,
      `  resources:`,
      `    requests:`,
      `      storage: ${storageSize}`,
      `---`,
      `apiVersion: apps/v1`,
      `kind: Deployment`,
      `metadata:`,
      `  name: posix-mapper-postgres`,
      `  namespace: ${def.namespace}`,
      `spec:`,
      `  replicas: 1`,
      `  selector:`,
      `    matchLabels:`,
      `      app: posix-mapper-postgres`,
      `  template:`,
      `    metadata:`,
      `      labels:`,
      `        app: posix-mapper-postgres`,
      `    spec:`,
      `      containers:`,
      `        - name: postgres`,
      `          image: "${image}"`,
      `          ports:`,
      `            - containerPort: 5432`,
      `          env:`,
      `            - name: POSTGRES_USER`,
      `              value: "${username}"`,
      `            - name: POSTGRES_PASSWORD`,
      `              value: "${password}"`,
      `            - name: POSTGRES_DB`,
      `              value: "${database}"`,
      `          volumeMounts:`,
      `            - name: postgres-data`,
      `              mountPath: /var/lib/postgresql/data`,
      `              subPath: pgdata`,
      `            - name: init-scripts`,
      `              mountPath: /docker-entrypoint-initdb.d`,
      `      volumes:`,
      `        - name: postgres-data`,
      `          persistentVolumeClaim:`,
      `            claimName: posix-mapper-postgres-pvc`,
      `        - name: init-scripts`,
      `          configMap:`,
      `            name: posix-mapper-init-sql`,
      `---`,
      `apiVersion: v1`,
      `kind: Service`,
      `metadata:`,
      `  name: posix-mapper-postgres`,
      `  namespace: ${def.namespace}`,
      `spec:`,
      `  selector:`,
      `    app: posix-mapper-postgres`,
      `  ports:`,
      `    - port: 5432`,
      `      targetPort: 5432`,
      `---`,
      `apiVersion: v1`,
      `kind: ConfigMap`,
      `metadata:`,
      `  name: posix-mapper-init-sql`,
      `  namespace: ${def.namespace}`,
      `data:`,
      `  01-init-schema.sql: |`,
      `    CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${username};`,
      `---`,
      `apiVersion: v1`,
      `kind: ConfigMap`,
      `metadata:`,
      `  name: posix-mapper-db-config`,
      `  namespace: ${def.namespace}`,
      `data:`,
      `  schema: "${schema}"`,
    ].join('\n');
  }

  throw new Error(`No manifest renderer for kubectl service: ${serviceId}`);
}

/**
 * Ensures a namespace exists, creating it if needed.
 * Uses `kubectl create` with `--dry-run=client` piped to `kubectl apply`
 * to avoid "last-applied-configuration" annotation issues.
 */
async function ensureNamespace(ns: string): Promise<void> {
  try {
    await execa(config.kubectlBinary, [
      ...kubeArgs(), 'get', 'namespace', ns,
    ], { env: { ...process.env, ...kubeEnv() } });
  } catch {
    // Namespace doesn't exist — create it
    await execa(config.kubectlBinary, [
      ...kubeArgs(), 'create', 'namespace', ns,
    ], { env: { ...process.env, ...kubeEnv() } });
    logger.info({ ns }, 'Created namespace');
  }
}

async function kubectlApply(
  serviceId: ServiceId,
): Promise<{ success: boolean; output: string }> {
  const def = SERVICE_CATALOG[serviceId];
  if (!def.valuesFile) {
    return { success: false, output: 'No values file for kubectl apply' };
  }

  const timestamp = () => new Date().toISOString();

  let values: Record<string, unknown>;
  try {
    values = await readValuesFile(def.valuesFile);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ serviceId, err: msg }, 'Failed to read values file for kubectl apply');
    return { success: false, output: `Cannot read values: ${msg}` };
  }

  const manifest = renderManifest(serviceId, values);
  logger.info({ serviceId, manifestLength: manifest.length }, 'Rendered kubectl manifest');
  logger.debug({ serviceId, manifest }, 'Manifest content');

  eventBus.broadcast({
    type: 'phase_change',
    serviceId,
    phase: 'deploying',
    message: `Running: kubectl apply for ${serviceId}`,
    timestamp: timestamp(),
  });

  try {
    // Extract namespace docs and ensure they exist before applying.
    // This avoids both "namespace not found" and "last-applied-configuration" errors.
    const docs = manifest.split(/^---$/m).map((d) => d.trim()).filter(Boolean);
    const nsDocs = docs.filter((d) => d.includes('kind: Namespace'));
    const resourceDocs = docs.filter((d) => !d.includes('kind: Namespace'));

    for (const nsDoc of nsDocs) {
      const match = nsDoc.match(/name:\s*(\S+)/);
      if (match?.[1]) {
        await ensureNamespace(match[1]);
      }
    }

    // Apply each resource document individually via temp file.
    // This avoids stdin encoding issues and gives clear per-resource errors.
    const outputs: string[] = [];
    for (const doc of resourceDocs) {
      const tmpFile = join(tmpdir(), `skaha-${serviceId}-${Date.now()}.yaml`);
      try {
        await writeFile(tmpFile, doc, 'utf-8');
        logger.info({ serviceId, tmpFile, doc }, 'Applying resource document');
        const { stdout, stderr } = await execa(
          config.kubectlBinary,
          [...kubeArgs(), 'apply', '-f', tmpFile],
          { env: { ...process.env, ...kubeEnv() } },
        );
        outputs.push(stdout, stderr);
      } catch (applyErr) {
        const detail = execaErrorDetail(applyErr);
        const errOut = [detail.stderr, detail.stdout].filter(Boolean).join('\n');
        logger.warn({ serviceId, errOut, doc }, 'kubectl apply failed for document — trying create --save-config');

        // Fallback: kubectl create --save-config (avoids annotation merge issues)
        try {
          // Delete first if it exists with corrupted state
          await execa(config.kubectlBinary, [
            ...kubeArgs(), 'delete', '-f', tmpFile, '--ignore-not-found',
          ], { env: { ...process.env, ...kubeEnv() } });
          const { stdout, stderr } = await execa(
            config.kubectlBinary,
            [...kubeArgs(), 'create', '--save-config', '-f', tmpFile],
            { env: { ...process.env, ...kubeEnv() } },
          );
          outputs.push(stdout, stderr);
        } catch (createErr) {
          // Propagate the original apply error for clarity
          throw applyErr;
        }
      } finally {
        await unlink(tmpFile).catch(() => {});
      }
    }
    const output = outputs.filter(Boolean).join('\n');

    eventBus.broadcast({
      type: 'phase_change',
      serviceId,
      phase: 'deployed',
      message: `${serviceId} applied successfully`,
      timestamp: timestamp(),
    });

    // Fire-and-forget health check
    waitForHealthy(serviceId).catch((e) =>
      logger.error({ serviceId, err: e }, 'Health check failed unexpectedly'),
    );

    return { success: true, output };
  } catch (err) {
    const detail = execaErrorDetail(err);
    logger.error({ serviceId, ...detail }, 'kubectl apply failed');

    const output = [detail.stderr, detail.stdout, detail.message].filter(Boolean).join('\n');

    eventBus.broadcast({
      type: 'error',
      serviceId,
      phase: 'failed',
      message: `kubectl apply failed: ${output}`,
      timestamp: timestamp(),
    });

    return { success: false, output };
  }
}

/**
 * Services whose PVCs must survive uninstall (databases, etc.).
 * Their PVCs are stripped from `kubectl delete` manifests.
 */
const PRESERVE_PVC_SERVICES = new Set<ServiceId>(['posix-mapper-db']);

async function kubectlDelete(
  serviceId: ServiceId,
): Promise<{ success: boolean; output: string }> {
  const def = SERVICE_CATALOG[serviceId];
  if (!def.valuesFile) {
    return { success: false, output: 'No values file for kubectl delete' };
  }

  let values: Record<string, unknown>;
  try {
    values = await readValuesFile(def.valuesFile);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ serviceId, err: msg }, 'Failed to read values file for kubectl delete');
    return { success: false, output: `Cannot read values: ${msg}` };
  }

  const manifest = renderManifest(serviceId, values);
  const docs = manifest.split(/^---$/m);

  // For services with persistent data (DBs), strip PVCs to preserve data.
  // For 'volumes' service, we need special ordering: PVC first, then PV
  // with finalizer cleanup to avoid getting stuck in Terminating state.
  if (PRESERVE_PVC_SERVICES.has(serviceId)) {
    const safeManifest = docs
      .filter((doc) => !doc.includes('kind: PersistentVolumeClaim'))
      .join('---');
    return kubectlDeleteManifest(serviceId, safeManifest, '(PVCs preserved)');
  }

  if (serviceId === 'volumes') {
    return kubectlDeleteVolumes(serviceId, docs);
  }

  return kubectlDeleteManifest(serviceId, manifest);
}

/** Delete volumes in correct order: PVC → wait → PV with finalizer cleanup. */
async function kubectlDeleteVolumes(
  serviceId: ServiceId,
  docs: string[],
): Promise<{ success: boolean; output: string }> {
  const outputs: string[] = [];

  // 1. Delete PVCs first (must be unbound before PV can be deleted)
  const pvcDocs = docs.filter((d) => d.includes('kind: PersistentVolumeClaim'));
  if (pvcDocs.length > 0) {
    try {
      const { stdout, stderr } = await execa(
        config.kubectlBinary,
        [...kubeArgs(), 'delete', '-f', '-', '--ignore-not-found', '--timeout=15s'],
        { input: pvcDocs.join('---'), env: { ...process.env, ...kubeEnv() } },
      );
      outputs.push(stdout, stderr);
    } catch (err) {
      outputs.push(`PVC delete: ${execaErrorDetail(err).message}`);
    }
  }

  // 2. Delete PVs — if they get stuck on finalizers, patch them
  const pvDocs = docs.filter((d) => d.includes('kind: PersistentVolume') && !d.includes('kind: PersistentVolumeClaim'));
  if (pvDocs.length > 0) {
    try {
      await execa(
        config.kubectlBinary,
        [...kubeArgs(), 'delete', '-f', '-', '--ignore-not-found', '--timeout=15s'],
        { input: pvDocs.join('---'), env: { ...process.env, ...kubeEnv() } },
      );
      outputs.push('PVs deleted');
    } catch {
      // PVs stuck in Terminating — remove finalizers
      const pvNames = pvDocs
        .map((d) => d.match(/name:\s*(\S+)/)?.[1])
        .filter(Boolean) as string[];
      for (const pvName of pvNames) {
        try {
          await execa(config.kubectlBinary, [
            ...kubeArgs(), 'patch', 'pv', pvName,
            '-p', '{"metadata":{"finalizers":null}}',
          ], { env: { ...process.env, ...kubeEnv() } });
          outputs.push(`Cleared finalizer on PV ${pvName}`);
        } catch {
          outputs.push(`Could not clear finalizer on PV ${pvName}`);
        }
      }
    }
  }

  // 3. Delete remaining resources (ConfigMaps, etc.) but NOT namespaces
  const otherDocs = docs.filter(
    (d) => !d.includes('kind: PersistentVolume') && !d.includes('kind: Namespace'),
  );
  if (otherDocs.length > 0) {
    try {
      const { stdout, stderr } = await execa(
        config.kubectlBinary,
        [...kubeArgs(), 'delete', '-f', '-', '--ignore-not-found'],
        { input: otherDocs.join('---'), env: { ...process.env, ...kubeEnv() } },
      );
      outputs.push(stdout, stderr);
    } catch (err) {
      outputs.push(`Other resources: ${execaErrorDetail(err).message}`);
    }
  }

  const output = outputs.filter(Boolean).join('\n');
  logger.info({ serviceId, output }, 'volumes delete completed');
  return { success: true, output };
}

/**
 * Post-uninstall cleanup for PVs that block re-deploys:
 * 1. Terminating PVs — remove finalizers so they can be deleted
 * 2. Released PVs — clear stale claimRef so new PVCs can bind
 */
export async function cleanupStuckPVs(): Promise<void> {
  try {
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(), 'get', 'pv',
      '-o', 'jsonpath={range .items[*]}{.metadata.name}{" "}{.status.phase}{"\\n"}{end}',
    ], { env: { ...process.env, ...kubeEnv() } });

    const lines = stdout.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const [pvName, phase] = line.split(' ');
      if (!pvName) continue;

      // Fix 1: Terminating PVs — remove finalizers
      if (phase === 'Terminating') {
        try {
          await execa(config.kubectlBinary, [
            ...kubeArgs(), 'patch', 'pv', pvName,
            '-p', '{"metadata":{"finalizers":null}}',
          ], { env: { ...process.env, ...kubeEnv() } });
          logger.info({ pvName }, 'Cleared finalizer on Terminating PV');
        } catch {
          logger.debug({ pvName }, 'Could not clear finalizer on PV');
        }
      }

      // Fix 2: Released PVs — clear stale claimRef so new PVCs can bind
      if (phase === 'Released') {
        try {
          await execa(config.kubectlBinary, [
            ...kubeArgs(), 'patch', 'pv', pvName,
            '--type', 'json',
            '-p', '[{"op": "remove", "path": "/spec/claimRef"}]',
          ], { env: { ...process.env, ...kubeEnv() } });
          logger.info({ pvName }, 'Cleared stale claimRef on Released PV');
        } catch {
          logger.debug({ pvName }, 'Could not clear claimRef on PV');
        }
      }
    }
  } catch {
    // No PVs or cluster not reachable — nothing to clean up
  }
}

async function kubectlDeleteManifest(
  serviceId: ServiceId,
  manifest: string,
  suffix = '',
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execa(
      config.kubectlBinary,
      [...kubeArgs(), 'delete', '-f', '-', '--ignore-not-found'],
      { input: manifest, env: { ...process.env, ...kubeEnv() } },
    );
    const output = stdout + '\n' + stderr;
    logger.info({ serviceId, output }, `kubectl delete succeeded ${suffix}`);
    return { success: true, output };
  } catch (err) {
    const detail = execaErrorDetail(err);
    logger.error({ serviceId, ...detail }, 'kubectl delete failed');
    const output = [detail.stderr, detail.stdout, detail.message].filter(Boolean).join('\n');
    return { success: false, output };
  }
}

export async function helmUninstall(
  serviceId: ServiceId,
): Promise<{ success: boolean; output: string }> {
  const def = SERVICE_CATALOG[serviceId];

  if (def.chartSource.type === 'haproxy') {
    try {
      const mode = await detectDeployMode() ?? 'kubernetes';
      const output = await stopHAProxy(mode);
      return { success: true, output };
    } catch (err) {
      logger.error({ serviceId, ...execaErrorDetail(err) }, 'HAProxy stop failed');
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: message };
    }
  }

  if (def.chartSource.type === 'kubectl') {
    return kubectlDelete(serviceId);
  }

  const releaseName = getReleaseName(serviceId);

  try {
    const { stdout, stderr } = await execa(config.helmBinary, [
      ...helmContextArgs(),
      'uninstall',
      releaseName,
      '-n',
      def.namespace,
    ], { env: { ...process.env, ...kubeEnv() } });
    logger.info({ serviceId }, 'Helm uninstall succeeded');
    return { success: true, output: stdout + '\n' + stderr };
  } catch (err) {
    const detail = execaErrorDetail(err);
    const output = [detail.stderr, detail.stdout, detail.message].filter(Boolean).join('\n');

    // "release not found" means it's already uninstalled — treat as success
    if (output.includes('not found')) {
      logger.info({ serviceId }, 'Helm release already uninstalled');
      return { success: true, output: `${serviceId}: already uninstalled` };
    }

    logger.error({ serviceId, ...detail }, 'Helm uninstall failed');
    return { success: false, output };
  }
}

export async function getServicePhase(serviceId: ServiceId): Promise<DeploymentPhase> {
  const def = SERVICE_CATALOG[serviceId];

  if (def.chartSource.type === 'haproxy') {
    try {
      const mode = await detectDeployMode();
      if (!mode) return 'not_installed';
      if (await isHAProxyPaused(mode)) return 'paused';
      if (await isHAProxyRunning(mode)) return 'deployed';

      // Deployment exists but not running — check if pods are crash-looping
      if (mode === 'kubernetes') {
        try {
          const { stdout } = await execa(config.kubectlBinary, [
            ...kubeArgs(), 'get', 'pods', '-l', 'app=haproxy',
            '-n', def.namespace,
            '-o', 'jsonpath={.items[0].status.containerStatuses[0].state.waiting.reason}',
          ], { env: { ...process.env, ...kubeEnv() } });
          const reason = stdout.trim();
          if (reason === 'CrashLoopBackOff' || reason === 'Error' || reason === 'ImagePullBackOff') {
            return 'failed';
          }
        } catch { /* no pods yet — still deploying */ }
      }

      return 'deploying';
    } catch {
      return 'not_installed';
    }
  }

  if (def.chartSource.type === 'kubectl') {
    // Each kubectl service checks for its own primary resource
    const resourceCheck = KUBECTL_STATUS_RESOURCE[serviceId];
    if (!resourceCheck) return 'not_installed';

    try {
      await execa(config.kubectlBinary, [
        ...kubeArgs(),
        'get',
        resourceCheck.kind,
        resourceCheck.name,
        '-n',
        def.namespace,
        '--no-headers',
      ], { env: { ...process.env, ...kubeEnv() } });
      return 'deployed';
    } catch {
      return 'not_installed';
    }
  }

  const status = await helmStatus(serviceId, def.namespace);
  if (!status) return 'not_installed';

  switch (status) {
    case 'deployed': {
      // Check if service is paused (scaled to 0)
      const { isServicePaused } = await import('./kubectl.service.js');
      const paused = await isServicePaused(serviceId);
      return paused ? 'paused' : 'deployed';
    }
    case 'pending-install':
    case 'pending-upgrade':
    case 'pending-rollback':
      return 'deploying';
    case 'failed':
      return 'failed';
    case 'uninstalling':
      return 'uninstalling';
    default:
      return 'not_installed';
  }
}
