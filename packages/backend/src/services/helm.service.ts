import { resolve } from 'path';
import { execa } from 'execa';
import type { DeploymentPhase, ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG } from '@skaha-orc/shared';
import { config, valuesFilePath } from '../config.js';
import { readValuesFile } from './yaml.service.js';
import { eventBus } from '../sse/event-bus.js';
import { logger } from '../logger.js';
import { kubeArgs, kubeEnv, helmContextArgs } from './kube-args.js';
import { waitForHealthy } from './health.service.js';
import { isHAProxyRunning, isHAProxyPaused, deployHAProxy, stopHAProxy, detectDeployMode } from './haproxy.service.js';

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

    // Fire-and-forget health check
    waitForHealthy(serviceId).catch((e) =>
      logger.error({ serviceId, err: e }, 'Health check failed unexpectedly'),
    );

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

/** Render K8s manifest YAML from a values file for kubectl-type services. */
function renderManifest(serviceId: ServiceId, values: Record<string, unknown>): string {
  const def = SERVICE_CATALOG[serviceId];

  if (serviceId === 'volumes') {
    const cavern = (values.cavern ?? {}) as Record<string, unknown>;
    const nfs = (cavern.nfs ?? {}) as Record<string, unknown>;
    const capacity = String(cavern.capacity || '10Gi');
    const storageClass = String(cavern.storageClassName ?? '');
    const nfsServer = String(nfs.server || '');
    const nfsPath = String(nfs.path || '/data/cavern');
    const hostPath = String(cavern.hostPath || '');

    // If NFS server is configured, use NFS; otherwise fall back to hostPath (local dev)
    const useNfs = nfsServer.length > 0;
    const accessMode = useNfs ? 'ReadWriteMany' : 'ReadWriteOnce';

    const pvSourceLines = useNfs
      ? [
          `  nfs:`,
          `    server: "${nfsServer}"`,
          `    path: "${nfsPath}"`,
        ]
      : [
          `  hostPath:`,
          `    path: "${hostPath || '/var/lib/k8s-pvs/science-platform'}"`,
          `    type: DirectoryOrCreate`,
        ];

    const pvLines = [
      `apiVersion: v1`,
      `kind: PersistentVolume`,
      `metadata:`,
      `  name: skaha-pv`,
      `  labels:`,
      `    app: cavern`,
      `spec:`,
      `  capacity:`,
      `    storage: "${capacity}"`,
      `  accessModes:`,
      `    - ${accessMode}`,
      `  storageClassName: "${storageClass}"`,
      ...pvSourceLines,
    ];

    const pvcLines = [
      `apiVersion: v1`,
      `kind: PersistentVolumeClaim`,
      `metadata:`,
      `  name: skaha-pvc`,
      `  namespace: ${def.namespace}`,
      `spec:`,
      `  accessModes:`,
      `    - ${accessMode}`,
      `  storageClassName: "${storageClass}"`,
      `  resources:`,
      `    requests:`,
      `      storage: "${capacity}"`,
      `  volumeName: skaha-pv`,
    ];

    return [...pvLines, `---`, ...pvcLines].join('\n');
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
    const storageSize = String(requests.storage || '1Gi');

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
      `      storage: "${storageSize}"`,
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
    const { stdout, stderr } = await execa(
      config.kubectlBinary,
      [...kubeArgs(), 'apply', '-f', '-'],
      { input: manifest, env: { ...process.env, ...kubeEnv() } },
    );
    const output = stdout + '\n' + stderr;

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

  try {
    const { stdout, stderr } = await execa(
      config.kubectlBinary,
      [...kubeArgs(), 'delete', '-f', '-', '--ignore-not-found'],
      { input: manifest, env: { ...process.env, ...kubeEnv() } },
    );
    const output = stdout + '\n' + stderr;
    logger.info({ serviceId, output }, 'kubectl delete succeeded');
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
    logger.error({ serviceId, ...detail }, 'Helm uninstall failed');
    const output = [detail.stderr, detail.stdout, detail.message].filter(Boolean).join('\n');
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
