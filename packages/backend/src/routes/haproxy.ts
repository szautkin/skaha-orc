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

/**
 * @openapi
 * /haproxy/config:
 *   get:
 *     tags: [HAProxy]
 *     summary: Read HAProxy config file
 *     description: Returns the raw HAProxy configuration file content and metadata.
 *     responses:
 *       200:
 *         description: Config file content
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         content:
 *                           type: string
 *                         path:
 *                           type: string
 *                         exists:
 *                           type: boolean
 *       500:
 *         description: Failed to read config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/haproxy/config', async (_req, res) => {
  try {
    const data = await readHAProxyConfig();
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to read HAProxy config');
    res.status(500).json({ success: false, error: 'Failed to read config' });
  }
});

/**
 * @openapi
 * /haproxy/config:
 *   put:
 *     tags: [HAProxy]
 *     summary: Save HAProxy config file
 *     description: Writes the given content to the HAProxy configuration file.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 description: Full HAProxy config file content
 *     responses:
 *       200:
 *         description: Config saved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *       400:
 *         description: content is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to save config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /haproxy/test:
 *   post:
 *     tags: [HAProxy]
 *     summary: Test HAProxy config
 *     description: Runs `haproxy -c` to validate the current config file syntax.
 *     responses:
 *       200:
 *         description: Test results (valid or errors)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         valid:
 *                           type: boolean
 *                         output:
 *                           type: string
 *       500:
 *         description: Failed to test config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/haproxy/test', async (_req, res) => {
  try {
    const data = await testHAProxyConfig();
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to test HAProxy config');
    res.status(500).json({ success: false, error: 'Failed to test config' });
  }
});

/**
 * @openapi
 * /haproxy/preflight:
 *   get:
 *     tags: [HAProxy]
 *     summary: Run HAProxy deploy preflight checks
 *     description: Checks prerequisites for deploying HAProxy in the specified mode (kubernetes, docker, or process).
 *     parameters:
 *       - in: query
 *         name: mode
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/HAProxyDeployMode'
 *         description: Deployment mode
 *     responses:
 *       200:
 *         description: Preflight check results
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PreflightResult'
 *       400:
 *         description: mode query param required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to run preflight checks
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /haproxy/status:
 *   get:
 *     tags: [HAProxy]
 *     summary: Get HAProxy runtime status
 *     description: Returns HAProxy's current running status. Optionally filter by deploy mode.
 *     parameters:
 *       - in: query
 *         name: mode
 *         schema:
 *           $ref: '#/components/schemas/HAProxyDeployMode'
 *         description: Optional deployment mode filter
 *     responses:
 *       200:
 *         description: HAProxy status
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         running:
 *                           type: boolean
 *                         mode:
 *                           type: string
 *                           nullable: true
 *       500:
 *         description: Failed to get status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /haproxy/reload:
 *   post:
 *     tags: [HAProxy]
 *     summary: Reload HAProxy
 *     description: Gracefully reloads HAProxy to pick up config changes.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode:
 *                 $ref: '#/components/schemas/HAProxyDeployMode'
 *     responses:
 *       200:
 *         description: Reloaded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                         output:
 *                           type: string
 *       400:
 *         description: mode is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to reload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /haproxy/deploy:
 *   post:
 *     tags: [HAProxy]
 *     summary: Deploy HAProxy
 *     description: Deploys HAProxy using the specified mode (kubernetes, docker, or process).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode:
 *                 $ref: '#/components/schemas/HAProxyDeployMode'
 *     responses:
 *       200:
 *         description: Deployed
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                         output:
 *                           type: string
 *       400:
 *         description: mode is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to deploy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /haproxy/stop:
 *   post:
 *     tags: [HAProxy]
 *     summary: Stop HAProxy
 *     description: Stops HAProxy in the specified mode.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode:
 *                 $ref: '#/components/schemas/HAProxyDeployMode'
 *     responses:
 *       200:
 *         description: Stopped
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                         output:
 *                           type: string
 *       400:
 *         description: mode is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to stop
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /haproxy/logs:
 *   get:
 *     tags: [HAProxy]
 *     summary: Get HAProxy logs
 *     description: Fetches the last N lines of HAProxy logs.
 *     parameters:
 *       - in: query
 *         name: mode
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/HAProxyDeployMode'
 *         description: Deployment mode
 *       - in: query
 *         name: tail
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 10000
 *         description: Number of log lines to return
 *     responses:
 *       200:
 *         description: Log lines
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         logs:
 *                           type: string
 *       400:
 *         description: mode query param required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to fetch logs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/haproxy/logs', async (req, res) => {
  const mode = req.query.mode as HAProxyDeployMode | undefined;
  const rawTail = req.query.tail ? Number(req.query.tail) : 50;
  const tail = Math.min(Math.max(1, rawTail || 50), 10000);

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

/**
 * @openapi
 * /haproxy/routes:
 *   get:
 *     tags: [HAProxy]
 *     summary: Get HAProxy routing table
 *     description: Returns the generated routing table derived from the service catalog, showing backend mappings.
 *     responses:
 *       200:
 *         description: Routing table
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 */
router.get('/haproxy/routes', (_req, res) => {
  const data = getRoutingTable();
  res.json({ success: true, data });
});

/**
 * @openapi
 * /haproxy/generate:
 *   post:
 *     tags: [HAProxy]
 *     summary: Generate HAProxy config from catalog
 *     description: Generates an HAProxy configuration file from the service catalog and routing table.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enableSsl:
 *                 type: boolean
 *                 description: Whether to enable SSL termination in the generated config
 *     responses:
 *       200:
 *         description: Generated config content
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         content:
 *                           type: string
 *       500:
 *         description: Failed to generate config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /haproxy/cert:
 *   get:
 *     tags: [HAProxy]
 *     summary: Get HAProxy TLS certificate info
 *     description: Returns information about the HAProxy frontend TLS certificate.
 *     responses:
 *       200:
 *         description: Certificate info
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         exists:
 *                           type: boolean
 *                         subject:
 *                           type: string
 *                         issuer:
 *                           type: string
 *                         notAfter:
 *                           type: string
 *                         isExpired:
 *                           type: boolean
 *       500:
 *         description: Failed to get cert info
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/haproxy/cert', async (_req, res) => {
  try {
    const data = await getHAProxyCertInfo();
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'Failed to get HAProxy cert info');
    res.status(500).json({ success: false, error: 'Failed to get cert info' });
  }
});

/**
 * @openapi
 * /haproxy/cert/generate:
 *   post:
 *     tags: [HAProxy]
 *     summary: Generate HAProxy TLS certificate
 *     description: Generates a CA-signed TLS certificate for HAProxy frontend SSL termination.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cn]
 *             properties:
 *               cn:
 *                 type: string
 *                 description: Common name (hostname) for the certificate
 *               days:
 *                 type: integer
 *                 default: 365
 *                 description: Validity period in days
 *     responses:
 *       200:
 *         description: Generated cert info
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *       400:
 *         description: cn is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to generate cert
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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
