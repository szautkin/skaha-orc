import type { ServiceId, DeploymentStatus, ServiceWithStatus } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS } from '@skaha-orc/shared';
import { getServicePhase, helmList } from './helm.service.js';
import { getPods } from './kubectl.service.js';
import { config } from '../config.js';
import { eventBus } from '../sse/event-bus.js';
import { logger } from '../logger.js';

const statusCache = new Map<ServiceId, DeploymentStatus>();

export async function getServiceStatus(serviceId: ServiceId): Promise<DeploymentStatus> {
  const phase = await getServicePhase(serviceId);
  const pods = await getPods(serviceId);
  const readyPods = pods.filter((p) => {
    const parts = p.ready.split('/').map(Number);
    const ready = parts[0] ?? 0;
    const total = parts[1] ?? 0;
    return ready === total && total > 0;
  }).length;

  const releases = await helmList();
  const release = releases.find((r) => r.name === serviceId);

  const status: DeploymentStatus = {
    serviceId,
    phase,
    revision: release ? parseInt(release.revision, 10) : null,
    lastDeployed: release?.updated ?? null,
    helmStatus: release?.status ?? null,
    podCount: pods.length,
    readyPods,
    error: null,
  };

  statusCache.set(serviceId, status);
  return status;
}

export async function getAllStatuses(): Promise<ServiceWithStatus[]> {
  const results: ServiceWithStatus[] = [];

  for (const id of SERVICE_IDS) {
    const def = SERVICE_CATALOG[id];
    const status = await getServiceStatus(id);
    results.push({ ...def, status });
  }

  return results;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startStatusPolling(): void {
  if (pollTimer) return;

  pollTimer = setInterval(async () => {
    try {
      const statuses = await getAllStatuses();
      eventBus.broadcastNamed('status', statuses);
    } catch (err) {
      logger.error({ err }, 'Status polling error');
    }
  }, config.statusPollInterval);

  logger.info('Status polling started');
}

export function stopStatusPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    logger.info('Status polling stopped');
  }
}
