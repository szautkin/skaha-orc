import { Router } from 'express';
import type { ServiceId } from '@skaha-orc/shared';
import { deployAllRequestSchema } from '@skaha-orc/shared';
import { deployAll, stopAll, pauseAll, resumeAll } from '../services/deploy.service.js';
import { eventBus } from '../sse/event-bus.js';
import { logger } from '../logger.js';

const router = Router();

router.post('/deploy-all', async (req, res) => {
  const parsed = deployAllRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { serviceIds, dryRun } = parsed.data;

  try {
    const progress = await deployAll(serviceIds as ServiceId[], { dryRun });
    res.json({ success: progress.failedServices.length === 0, data: progress });
  } catch (err) {
    logger.error({ err }, 'Deploy-all failed');
    res.status(500).json({ success: false, error: 'Deploy-all failed' });
  }
});

router.post('/stop-all', async (req, res) => {
  const parsed = deployAllRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  try {
    const progress = await stopAll(parsed.data.serviceIds as ServiceId[]);
    res.json({ success: progress.failedServices.length === 0, data: progress });
  } catch (err) {
    logger.error({ err }, 'Stop-all failed');
    res.status(500).json({ success: false, error: 'Stop-all failed' });
  }
});

router.post('/pause-all', async (req, res) => {
  const parsed = deployAllRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  try {
    const progress = await pauseAll(parsed.data.serviceIds as ServiceId[]);
    res.json({ success: progress.failedServices.length === 0, data: progress });
  } catch (err) {
    logger.error({ err }, 'Pause-all failed');
    res.status(500).json({ success: false, error: 'Pause-all failed' });
  }
});

router.post('/resume-all', async (req, res) => {
  const parsed = deployAllRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  try {
    const progress = await resumeAll(parsed.data.serviceIds as ServiceId[]);
    res.json({ success: progress.failedServices.length === 0, data: progress });
  } catch (err) {
    logger.error({ err }, 'Resume-all failed');
    res.status(500).json({ success: false, error: 'Resume-all failed' });
  }
});

router.get('/deploy-all/stream', (_req, res) => {
  eventBus.addClient(res);
});

export default router;
