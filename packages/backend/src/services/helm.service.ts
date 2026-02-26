import { execa } from 'execa';
import type { DeploymentPhase, ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG } from '@skaha-orc/shared';
import { config, valuesFilePath } from '../config.js';
import { eventBus } from '../sse/event-bus.js';
import { logger } from '../logger.js';
import { waitForHealthy } from './health.service.js';
import { isHAProxyRunning, isHAProxyPaused, deployHAProxy, stopHAProxy, detectDeployMode } from './haproxy.service.js';

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
    const { stdout } = await execa(config.helmBinary, ['list', '--all-namespaces', '-o', 'json']);
    return JSON.parse(stdout) as HelmRelease[];
  } catch {
    return [];
  }
}

export async function helmStatus(releaseName: string, namespace: string): Promise<string | null> {
  try {
    const { stdout } = await execa(config.helmBinary, [
      'status',
      releaseName,
      '-n',
      namespace,
      '-o',
      'json',
    ]);
    const parsed = JSON.parse(stdout) as { info?: { status?: string } };
    return parsed.info?.status ?? null;
  } catch {
    return null;
  }
}

function getChartRef(serviceId: ServiceId): string {
  const def = SERVICE_CATALOG[serviceId];
  const src = def.chartSource;
  if (src.type === 'repo') return `${src.repo}/${src.chart}`;
  if (src.type === 'local') return src.path;
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
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: message };
    }
  }

  if (def.chartSource.type === 'kubectl') {
    return kubectlApply(serviceId);
  }

  const chartRef = getChartRef(serviceId);
  const releaseName = getReleaseName(serviceId);
  const args = ['upgrade', '--install', releaseName, chartRef, '-n', def.namespace];

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
    const proc = execa(config.helmBinary, args);

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
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ serviceId, err }, 'Helm deploy failed');

    eventBus.broadcast({
      type: 'error',
      serviceId,
      phase: 'failed',
      message: `Deploy failed: ${message}`,
      timestamp: timestamp(),
    });

    return { success: false, output: message };
  }
}

async function kubectlApply(
  serviceId: ServiceId,
): Promise<{ success: boolean; output: string }> {
  const def = SERVICE_CATALOG[serviceId];
  if (!def.valuesFile) {
    return { success: false, output: 'No values file for kubectl apply' };
  }

  const filePath = valuesFilePath(def.valuesFile);
  const timestamp = () => new Date().toISOString();

  eventBus.broadcast({
    type: 'phase_change',
    serviceId,
    phase: 'deploying',
    message: `Running: kubectl apply -f ${filePath}`,
    timestamp: timestamp(),
  });

  try {
    const { stdout, stderr } = await execa(config.kubectlBinary, ['apply', '-f', filePath]);
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
    const message = err instanceof Error ? err.message : String(err);

    eventBus.broadcast({
      type: 'error',
      serviceId,
      phase: 'failed',
      message: `kubectl apply failed: ${message}`,
      timestamp: timestamp(),
    });

    return { success: false, output: message };
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
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: message };
    }
  }

  const releaseName = getReleaseName(serviceId);

  try {
    const { stdout, stderr } = await execa(config.helmBinary, [
      'uninstall',
      releaseName,
      '-n',
      def.namespace,
    ]);
    return { success: true, output: stdout + '\n' + stderr };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: message };
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
            'get', 'pods', '-l', 'app=haproxy',
            '-n', def.namespace,
            '-o', 'jsonpath={.items[0].status.containerStatuses[0].state.waiting.reason}',
          ]);
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
    // For kubectl resources, check if PVCs exist
    try {
      await execa(config.kubectlBinary, [
        'get',
        'pvc',
        'skaha-pvc',
        '-n',
        def.namespace,
        '--no-headers',
      ]);
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
