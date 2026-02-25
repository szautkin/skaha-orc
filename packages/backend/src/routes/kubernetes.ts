import { Router } from 'express';
import type { ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS } from '@skaha-orc/shared';
import { getPods, getEvents, streamPodLogs } from '../services/kubectl.service.js';

const router = Router();

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
