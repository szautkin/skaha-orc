import { Router } from 'express';
import type { HAProxyDeployMode } from '@skaha-orc/shared';
import {
  readHAProxyConfig,
  saveHAProxyConfig,
  testHAProxyConfig,
  getHAProxyStatus,
  reloadHAProxy,
  deployHAProxy,
  stopHAProxy,
  getRoutingTable,
  generateHAProxyConfig,
  checkDeployPrereqs,
  getHAProxyLogs,
} from '../services/haproxy.service.js';
import { getHAProxyCertInfo, generateHAProxyCert } from '../services/cert.service.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/haproxy/config', async (_req, res) => {
  try {
    const data = await readHAProxyConfig();
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to read HAProxy config');
    res.status(500).json({ success: false, error: 'Failed to read config' });
  }
});

router.put('/haproxy/config', async (req, res) => {
  const { content } = req.body as { content?: string };
  if (typeof content !== 'string') {
    res.status(400).json({ success: false, error: 'content is required' });
    return;
  }

  try {
    await saveHAProxyConfig(content);
    res.json({ success: true, data: { message: 'Config saved' } });
  } catch (err) {
    logger.error({ err }, 'Failed to save HAProxy config');
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

router.post('/haproxy/test', async (_req, res) => {
  try {
    const data = await testHAProxyConfig();
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to test HAProxy config');
    res.status(500).json({ success: false, error: 'Failed to test config' });
  }
});

router.get('/haproxy/preflight', async (req, res) => {
  const mode = req.query.mode as HAProxyDeployMode | undefined;
  if (!mode || !['kubernetes', 'docker', 'process'].includes(mode)) {
    res.status(400).json({ success: false, error: 'mode query param required (kubernetes|docker|process)' });
    return;
  }

  try {
    const data = await checkDeployPrereqs(mode);
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to run preflight checks');
    res.status(500).json({ success: false, error: 'Failed to run preflight checks' });
  }
});

router.get('/haproxy/status', async (req, res) => {
  try {
    const mode = req.query.mode as HAProxyDeployMode | undefined;
    const data = await getHAProxyStatus(mode);
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to get HAProxy status');
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

router.post('/haproxy/reload', async (req, res) => {
  const { mode } = req.body as { mode?: HAProxyDeployMode };
  if (!mode) {
    res.status(400).json({ success: false, error: 'mode is required' });
    return;
  }

  try {
    const output = await reloadHAProxy(mode);
    res.json({ success: true, data: { message: 'Reloaded', output } });
  } catch (err) {
    logger.error({ err }, 'Failed to reload HAProxy');
    res.status(500).json({ success: false, error: 'Failed to reload' });
  }
});

router.post('/haproxy/deploy', async (req, res) => {
  const { mode } = req.body as { mode?: HAProxyDeployMode };
  if (!mode) {
    res.status(400).json({ success: false, error: 'mode is required' });
    return;
  }

  try {
    const output = await deployHAProxy(mode);
    res.json({ success: true, data: { message: 'Deployed', output } });
  } catch (err) {
    logger.error({ err }, 'Failed to deploy HAProxy');
    res.status(500).json({ success: false, error: 'Failed to deploy' });
  }
});

router.post('/haproxy/stop', async (req, res) => {
  const { mode } = req.body as { mode?: HAProxyDeployMode };
  if (!mode) {
    res.status(400).json({ success: false, error: 'mode is required' });
    return;
  }

  try {
    const output = await stopHAProxy(mode);
    res.json({ success: true, data: { message: 'Stopped', output } });
  } catch (err) {
    logger.error({ err }, 'Failed to stop HAProxy');
    res.status(500).json({ success: false, error: 'Failed to stop' });
  }
});

router.get('/haproxy/logs', async (req, res) => {
  const mode = req.query.mode as HAProxyDeployMode | undefined;
  const tail = req.query.tail ? Number(req.query.tail) : 50;

  if (!mode || !['kubernetes', 'docker', 'process'].includes(mode)) {
    res.status(400).json({ success: false, error: 'mode query param required (kubernetes|docker|process)' });
    return;
  }

  try {
    const logs = await getHAProxyLogs(mode, tail);
    res.json({ success: true, data: { logs } });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch HAProxy logs');
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
});

router.get('/haproxy/routes', (_req, res) => {
  const data = getRoutingTable();
  res.json({ success: true, data });
});

router.post('/haproxy/generate', (req, res) => {
  const { enableSsl } = req.body as {
    enableSsl?: boolean;
  };

  try {
    const content = generateHAProxyConfig({ enableSsl });
    res.json({ success: true, data: { content } });
  } catch (err) {
    logger.error({ err }, 'Failed to generate HAProxy config');
    res.status(500).json({ success: false, error: 'Failed to generate config' });
  }
});

router.get('/haproxy/cert', async (_req, res) => {
  try {
    const data = await getHAProxyCertInfo();
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to get HAProxy cert info');
    res.status(500).json({ success: false, error: 'Failed to get cert info' });
  }
});

router.post('/haproxy/cert/generate', async (req, res) => {
  const { cn, days } = req.body as { cn?: string; days?: number };
  if (!cn) {
    res.status(400).json({ success: false, error: 'cn is required' });
    return;
  }

  try {
    const data = await generateHAProxyCert({ cn, days: days ?? 365 });
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to generate HAProxy cert');
    res.status(500).json({ success: false, error: String((err as Error).message ?? 'Failed to generate cert') });
  }
});

export default router;
