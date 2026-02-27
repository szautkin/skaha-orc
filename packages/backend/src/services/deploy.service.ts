import type { ServiceId, DeployAllProgress } from '@skaha-orc/shared';
import { getDeploymentOrder, SERVICE_CATALOG } from '@skaha-orc/shared';
import { helmDeploy, helmUninstall } from './helm.service.js';
import { scaleDeployment } from './kubectl.service.js';
import { eventBus } from '../sse/event-bus.js';
import { logger } from '../logger.js';

export async function deployAll(
  serviceIds: ServiceId[],
  options: { dryRun?: boolean } = {},
): Promise<DeployAllProgress> {
  const order = getDeploymentOrder(serviceIds);
  logger.info({ order, dryRun: options.dryRun }, 'Starting deploy-all');

  const progress: DeployAllProgress = {
    currentService: null,
    completedServices: [],
    failedServices: [],
    pendingServices: [...order],
    events: [],
  };

  for (const serviceId of order) {
    progress.currentService = serviceId;
    progress.pendingServices = progress.pendingServices.filter((id) => id !== serviceId);

    const timestamp = new Date().toISOString();
    eventBus.broadcast({
      type: 'phase_change',
      serviceId,
      phase: 'deploying',
      message: `Starting deployment of ${serviceId}`,
      timestamp,
    });

    const result = await helmDeploy(serviceId, { dryRun: options.dryRun });
    logger.info({ serviceId, success: result.success, output: result.output }, 'Deploy-all: service result');

    if (result.success) {
      progress.completedServices.push(serviceId);
    } else {
      progress.failedServices.push(serviceId);
      logger.error({ serviceId, output: result.output }, 'Service deployment failed');

      // Stop on failure — downstream services depend on this
      eventBus.broadcast({
        type: 'error',
        serviceId,
        phase: 'failed',
        message: `Stopping deploy-all: ${serviceId} failed`,
        timestamp: new Date().toISOString(),
      });
      break;
    }
  }

  progress.currentService = null;

  eventBus.broadcast({
    type: 'complete',
    serviceId: progress.completedServices[progress.completedServices.length - 1] ?? order[0]!,
    message:
      progress.failedServices.length > 0
        ? `Deploy-all stopped with failures: ${progress.failedServices.join(', ')}`
        : `Deploy-all completed: ${progress.completedServices.length} services deployed`,
    timestamp: new Date().toISOString(),
  });

  return progress;
}

/** Uninstall all services in reverse topological order. */
export async function stopAll(
  serviceIds: ServiceId[],
): Promise<DeployAllProgress> {
  const order = getDeploymentOrder(serviceIds).reverse();
  logger.info({ order }, 'Starting stop-all (uninstall)');

  const progress: DeployAllProgress = {
    currentService: null,
    completedServices: [],
    failedServices: [],
    pendingServices: [...order],
    events: [],
  };

  for (const serviceId of order) {
    progress.currentService = serviceId;
    progress.pendingServices = progress.pendingServices.filter((id) => id !== serviceId);

    eventBus.broadcast({
      type: 'phase_change',
      serviceId,
      phase: 'uninstalling',
      message: `Uninstalling ${serviceId}`,
      timestamp: new Date().toISOString(),
    });

    const result = await helmUninstall(serviceId);
    logger.info({ serviceId, success: result.success, output: result.output }, 'Stop-all: service result');

    if (result.success) {
      progress.completedServices.push(serviceId);
      eventBus.broadcast({
        type: 'phase_change',
        serviceId,
        phase: 'not_installed',
        message: `${serviceId} uninstalled`,
        timestamp: new Date().toISOString(),
      });
    } else {
      progress.failedServices.push(serviceId);
      eventBus.broadcast({
        type: 'error',
        serviceId,
        phase: 'failed',
        message: `Uninstall failed: ${result.output}`,
        timestamp: new Date().toISOString(),
      });
      // Continue uninstalling others — upstream services don't block teardown
    }
  }

  progress.currentService = null;

  eventBus.broadcast({
    type: 'complete',
    serviceId: order[0]!,
    message:
      progress.failedServices.length > 0
        ? `Stop-all finished with failures: ${progress.failedServices.join(', ')}`
        : `Stop-all completed: ${progress.completedServices.length} services uninstalled`,
    timestamp: new Date().toISOString(),
  });

  return progress;
}

/** Scale all service deployments to 0 replicas (pause). */
export async function pauseAll(
  serviceIds: ServiceId[],
): Promise<DeployAllProgress> {
  const order = getDeploymentOrder(serviceIds).reverse();
  logger.info({ order }, 'Starting pause-all (scale to 0)');

  const progress: DeployAllProgress = {
    currentService: null,
    completedServices: [],
    failedServices: [],
    pendingServices: [...order],
    events: [],
  };

  for (const serviceId of order) {
    const def = SERVICE_CATALOG[serviceId];
    if (def.chartSource.type === 'kubectl' || def.chartSource.type === 'haproxy') {
      // Can't scale PV/PVC resources or HAProxy via replicas — skip
      progress.pendingServices = progress.pendingServices.filter((id) => id !== serviceId);
      progress.completedServices.push(serviceId);
      continue;
    }

    progress.currentService = serviceId;
    progress.pendingServices = progress.pendingServices.filter((id) => id !== serviceId);

    eventBus.broadcast({
      type: 'phase_change',
      serviceId,
      phase: 'uninstalling',
      message: `Pausing ${serviceId} (scaling to 0)`,
      timestamp: new Date().toISOString(),
    });

    const result = await scaleDeployment(def.namespace, serviceId, 0);
    logger.info({ serviceId, success: result.success, output: result.output }, 'Pause-all: service result');

    if (result.success) {
      progress.completedServices.push(serviceId);
      eventBus.broadcast({
        type: 'phase_change',
        serviceId,
        phase: 'paused',
        message: `${serviceId} paused`,
        timestamp: new Date().toISOString(),
      });
    } else {
      progress.failedServices.push(serviceId);
      eventBus.broadcast({
        type: 'error',
        serviceId,
        phase: 'failed',
        message: `Pause failed: ${result.output}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  progress.currentService = null;

  eventBus.broadcast({
    type: 'complete',
    serviceId: order[0]!,
    message:
      progress.failedServices.length > 0
        ? `Pause-all finished with failures: ${progress.failedServices.join(', ')}`
        : `Pause-all completed: ${progress.completedServices.length} services paused`,
    timestamp: new Date().toISOString(),
  });

  return progress;
}

/** Scale all service deployments back to 1 replica (resume). */
export async function resumeAll(
  serviceIds: ServiceId[],
): Promise<DeployAllProgress> {
  const order = getDeploymentOrder(serviceIds);
  logger.info({ order }, 'Starting resume-all (scale to 1)');

  const progress: DeployAllProgress = {
    currentService: null,
    completedServices: [],
    failedServices: [],
    pendingServices: [...order],
    events: [],
  };

  for (const serviceId of order) {
    const def = SERVICE_CATALOG[serviceId];
    if (def.chartSource.type === 'kubectl' || def.chartSource.type === 'haproxy') {
      progress.pendingServices = progress.pendingServices.filter((id) => id !== serviceId);
      progress.completedServices.push(serviceId);
      continue;
    }

    progress.currentService = serviceId;
    progress.pendingServices = progress.pendingServices.filter((id) => id !== serviceId);

    eventBus.broadcast({
      type: 'phase_change',
      serviceId,
      phase: 'deploying',
      message: `Resuming ${serviceId} (scaling to 1)`,
      timestamp: new Date().toISOString(),
    });

    const result = await scaleDeployment(def.namespace, serviceId, 1);
    logger.info({ serviceId, success: result.success, output: result.output }, 'Resume-all: service result');

    if (result.success) {
      progress.completedServices.push(serviceId);
      eventBus.broadcast({
        type: 'phase_change',
        serviceId,
        phase: 'deployed',
        message: `${serviceId} resumed`,
        timestamp: new Date().toISOString(),
      });
    } else {
      progress.failedServices.push(serviceId);
      eventBus.broadcast({
        type: 'error',
        serviceId,
        phase: 'failed',
        message: `Resume failed: ${result.output}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  progress.currentService = null;

  eventBus.broadcast({
    type: 'complete',
    serviceId: order[0]!,
    message:
      progress.failedServices.length > 0
        ? `Resume-all finished with failures: ${progress.failedServices.join(', ')}`
        : `Resume-all completed: ${progress.completedServices.length} services resumed`,
    timestamp: new Date().toISOString(),
  });

  return progress;
}
