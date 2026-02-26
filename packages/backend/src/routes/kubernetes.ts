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

/**
 * @openapi
 * /kubernetes/contexts:
 *   get:
 *     tags: [Kubernetes]
 *     summary: List available kubectl contexts
 *     description: Returns all kubectl contexts from the kubeconfig and identifies the currently active one.
 *     responses:
 *       200:
 *         description: Context list
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
 *                         contexts:
 *                           type: array
 *                           items:
 *                             type: string
 *                         current:
 *                           type: string
 *                           nullable: true
 *       500:
 *         description: Failed to list contexts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /kubernetes/current-context:
 *   get:
 *     tags: [Kubernetes]
 *     summary: Get the current kubectl context
 *     description: Returns the runtime kubectl context name.
 *     responses:
 *       200:
 *         description: Current context
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
 *                         context:
 *                           type: string
 *                           nullable: true
 */
router.get('/kubernetes/current-context', (_req, res) => {
  res.json({ success: true, data: { context: runtimeContext || null } });
});

/**
 * @openapi
 * /kubernetes/context:
 *   put:
 *     tags: [Kubernetes]
 *     summary: Switch kubectl context
 *     description: Changes the runtime kubectl context used for all subsequent operations.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [context]
 *             properties:
 *               context:
 *                 type: string
 *                 description: Context name from kubeconfig
 *     responses:
 *       200:
 *         description: Context switched
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
 *                         context:
 *                           type: string
 *       400:
 *         description: context is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /services/{id}/pods:
 *   get:
 *     tags: [Kubernetes]
 *     summary: List pods for a service
 *     description: Returns all pods in the service's namespace matching its label selector.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Pod list
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
 *                         pods:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Pod'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to fetch pods
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /services/{id}/events:
 *   get:
 *     tags: [Kubernetes]
 *     summary: List Kubernetes events for a service
 *     description: Returns recent Kubernetes events from the service's namespace.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Event list
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
 *                         events:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/KubeEvent'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to fetch events
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

/**
 * @openapi
 * /services/{id}/logs/{pod}:
 *   get:
 *     tags: [Kubernetes]
 *     summary: Stream pod logs (SSE)
 *     description: Opens a Server-Sent Events stream of real-time log lines from the specified pod.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *       - in: path
 *         name: pod
 *         required: true
 *         schema:
 *           type: string
 *         description: Pod name (DNS-1123 format)
 *     responses:
 *       200:
 *         description: SSE log stream
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: Newline-delimited SSE events with JSON payloads containing message and timestamp
 *       400:
 *         description: Missing or invalid pod name
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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
