import { Router } from 'express';
import { execa } from 'execa';
import type { ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS } from '@skaha-orc/shared';
import { getPods, getEvents, streamPodLogs } from '../services/kubectl.service.js';
import { config } from '../config.js';
import { kubeArgs, kubeEnv } from '../services/kube-args.js';
import { logger } from '../logger.js';

const DNS_1123_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

// Mutable runtime context — can be changed via PUT /kubernetes/context
let runtimeContext = config.kubernetes.context;

export function getCurrentContext(): string {
  return runtimeContext;
}

const router = Router();

router.get('/kubernetes/contexts', async (_req, res) => {
  try {
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(), 'config', 'get-contexts', '-o', 'name',
    ], { env: { ...process.env, ...kubeEnv() } });
    const contexts = stdout.trim().split('\n').filter(Boolean);
    res.json({ success: true, data: { contexts, current: runtimeContext || null } });
  } catch (err) {
    logger.error({ err }, 'Failed to list kube contexts');
    res.status(500).json({ success: false, error: 'Failed to list contexts' });
  }
});

router.get('/kubernetes/current-context', (_req, res) => {
  res.json({ success: true, data: { context: runtimeContext || null } });
});

router.put('/kubernetes/context', (req, res) => {
  const { context } = req.body as { context?: string };
  if (typeof context !== 'string') {
    res.status(400).json({ success: false, error: 'context is required' });
    return;
  }
  runtimeContext = context;
  // Update the config object so kube-args picks it up
  (config as { kubernetes: { context: string; kubeconfig: string } }).kubernetes.context = context;
  logger.info({ context }, 'Kubernetes context switched');
  res.json({ success: true, data: { context } });
});

router.get('/services/:id/pods', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  try {
    const pods = await getPods(serviceId);
    res.json({ success: true, data: { pods } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch pods' });
  }
});

router.get('/services/:id/events', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  try {
    const events = await getEvents(serviceId);
    res.json({ success: true, data: { events } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

router.get('/services/:id/logs/:pod', (req, res) => {
  const serviceId = req.params.id as ServiceId;
  const podName = req.params.pod;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  if (!podName) {
    res.status(400).json({ success: false, error: 'Pod name required' });
    return;
  }

  if (!DNS_1123_RE.test(podName) || podName.length > 253) {
    res.status(400).json({ success: false, error: 'Invalid pod name (must be DNS-1123)' });
    return;
  }

  const def = SERVICE_CATALOG[serviceId];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const cleanup = streamPodLogs(
    def.namespace,
    podName,
    (line) => {
      res.write(`data: ${JSON.stringify({ message: line, timestamp: new Date().toISOString() })}\n\n`);
    },
    (err) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    },
  );

  req.on('close', () => {
    cleanup();
  });
});

export default router;
