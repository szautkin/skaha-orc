import https from 'https';
import type { ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG, PLATFORM_HOSTNAME } from '@skaha-orc/shared';
import { config } from '../config.js';
import { eventBus } from '../sse/event-bus.js';
import { getPods } from './kubectl.service.js';
import { logger } from '../logger.js';

function timestamp(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForHealthy(serviceId: ServiceId): Promise<void> {
  const def = SERVICE_CATALOG[serviceId];
  const { podReadyTimeoutMs, podPollIntervalMs, httpTimeoutMs } = config.healthCheck;

  // Broadcast waiting_ready phase
  eventBus.broadcast({
    type: 'phase_change',
    serviceId,
    phase: 'waiting_ready',
    message: 'Waiting for pods to become ready',
    timestamp: timestamp(),
  });

  eventBus.broadcast({
    type: 'health_check',
    serviceId,
    message: 'Waiting for pod readiness...',
    timestamp: timestamp(),
    healthStep: 'pods_waiting',
  });

  // Poll pods until all containers are ready or timeout
  const deadline = Date.now() + podReadyTimeoutMs;
  let podsReady = false;

  while (Date.now() < deadline) {
    const pods = await getPods(serviceId);
    if (pods.length > 0) {
      const allReady = pods.every((pod) => {
        const parts = pod.ready.split('/').map(Number);
        const ready = parts[0] ?? 0;
        const total = parts[1] ?? 0;
        return ready > 0 && ready === total && pod.status === 'Running';
      });
      if (allReady) {
        podsReady = true;
        break;
      }
    }
    await sleep(podPollIntervalMs);
  }

  if (!podsReady) {
    eventBus.broadcast({
      type: 'health_check',
      serviceId,
      message: 'Pod readiness timeout — staying at deployed',
      timestamp: timestamp(),
      healthStep: 'timeout',
    });
    logger.warn({ serviceId }, 'Health check: pod readiness timeout');
    return;
  }

  eventBus.broadcast({
    type: 'health_check',
    serviceId,
    message: 'All pods ready',
    timestamp: timestamp(),
    healthStep: 'pods_ready',
  });

  // HTTP health ping if endpointPath exists
  if (!def.endpointPath) {
    eventBus.broadcast({
      type: 'phase_change',
      serviceId,
      phase: 'deployed',
      message: 'Pods ready (no endpoint to health-check)',
      timestamp: timestamp(),
    });
    return;
  }

  const url = `https://${PLATFORM_HOSTNAME}${def.endpointPath}`;

  eventBus.broadcast({
    type: 'health_check',
    serviceId,
    message: `HTTP health check: ${url}`,
    timestamp: timestamp(),
    healthStep: 'http_checking',
  });

  try {
    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = https.get(url, { rejectUnauthorized: false, timeout: httpTimeoutMs }, (res) => {
        res.resume(); // drain response body
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });

    if (statusCode > 0 && statusCode < 500) {
      eventBus.broadcast({
        type: 'health_check',
        serviceId,
        message: `HTTP OK (${statusCode})`,
        timestamp: timestamp(),
        healthStep: 'http_ok',
      });

      eventBus.broadcast({
        type: 'phase_change',
        serviceId,
        phase: 'healthy',
        message: `Service healthy — HTTP ${statusCode}`,
        timestamp: timestamp(),
      });
    } else {
      eventBus.broadcast({
        type: 'health_check',
        serviceId,
        message: `HTTP failed (${statusCode}) — staying at deployed`,
        timestamp: timestamp(),
        healthStep: 'http_failed',
      });

      eventBus.broadcast({
        type: 'phase_change',
        serviceId,
        phase: 'deployed',
        message: 'Pods ready but HTTP check failed',
        timestamp: timestamp(),
      });
    }
  } catch (err) {
    const cause = err instanceof Error && err.cause ? String(err.cause) : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ serviceId, err: msg, cause, url }, 'Health check HTTP ping failed');

    eventBus.broadcast({
      type: 'health_check',
      serviceId,
      message: `HTTP error: ${msg} — staying at deployed`,
      timestamp: timestamp(),
      healthStep: 'http_failed',
    });

    eventBus.broadcast({
      type: 'phase_change',
      serviceId,
      phase: 'deployed',
      message: 'Pods ready but HTTP check errored',
      timestamp: timestamp(),
    });
  }
}
