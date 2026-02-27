import { Router } from 'express';
import type { ServiceId, DeploymentPhase } from '@skaha-orc/shared';
import { deployAllRequestSchema, SERVICE_CATALOG } from '@skaha-orc/shared';
import { getAllStatuses } from '../services/status.service.js';
import { deployAll, stopAll, pauseAll, resumeAll } from '../services/deploy.service.js';
import { eventBus } from '../sse/event-bus.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * @openapi
 * /deploy-all:
 *   post:
 *     tags: [Deployment]
 *     summary: Deploy multiple services
 *     description: Deploys the given services in dependency order. Supports dry-run mode.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeployAllRequest'
 *     responses:
 *       200:
 *         description: Deployment progress
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DeployAllProgress'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Deploy-all failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/deploy-all', async (req, res) => {
  const parsed = deployAllRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { serviceIds, dryRun } = parsed.data;
  const selectedSet = new Set(serviceIds as ServiceId[]);

  try {
    // Check for external unmet deps (not in selected set AND not already deployed)
    const statuses = await getAllStatuses();
    const phaseMap = new Map<ServiceId, DeploymentPhase>(
      statuses.map((s) => [s.id, s.status.phase]),
    );
    const externalUnmet: { serviceId: ServiceId; deps: { id: ServiceId; name: string }[] }[] = [];
    for (const id of selectedSet) {
      const deps = SERVICE_CATALOG[id as ServiceId]?.dependencies ?? [];
      const missing = deps
        .filter((depId) => {
          if (selectedSet.has(depId)) return false; // will be deployed in this batch
          const phase = phaseMap.get(depId);
          return !phase || !(['deployed', 'healthy', 'waiting_ready'] as DeploymentPhase[]).includes(phase);
        })
        .map((depId) => ({ id: depId, name: SERVICE_CATALOG[depId].name }));
      if (missing.length > 0) {
        externalUnmet.push({ serviceId: id as ServiceId, deps: missing });
      }
    }

    if (externalUnmet.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Cannot deploy: some dependencies are not selected or deployed',
        data: { externalUnmet },
      });
      return;
    }

    const progress = await deployAll(serviceIds as ServiceId[], { dryRun });
    res.json({ success: true, data: progress });
  } catch (err) {
    logger.error({ err }, 'Deploy-all failed');
    res.status(500).json({ success: false, error: 'Deploy-all failed' });
  }
});

/**
 * @openapi
 * /stop-all:
 *   post:
 *     tags: [Deployment]
 *     summary: Stop (uninstall) multiple services
 *     description: Uninstalls the given services in reverse dependency order.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeployAllRequest'
 *     responses:
 *       200:
 *         description: Stop progress
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DeployAllProgress'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Stop-all failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/stop-all', async (req, res) => {
  const parsed = deployAllRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  try {
    const progress = await stopAll(parsed.data.serviceIds as ServiceId[]);
    res.json({ success: true, data: progress });
  } catch (err) {
    logger.error({ err }, 'Stop-all failed');
    res.status(500).json({ success: false, error: 'Stop-all failed' });
  }
});

/**
 * @openapi
 * /pause-all:
 *   post:
 *     tags: [Deployment]
 *     summary: Pause (scale to 0) multiple services
 *     description: Scales all given services to 0 replicas.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeployAllRequest'
 *     responses:
 *       200:
 *         description: Pause progress
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DeployAllProgress'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Pause-all failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/pause-all', async (req, res) => {
  const parsed = deployAllRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  try {
    const progress = await pauseAll(parsed.data.serviceIds as ServiceId[]);
    res.json({ success: true, data: progress });
  } catch (err) {
    logger.error({ err }, 'Pause-all failed');
    res.status(500).json({ success: false, error: 'Pause-all failed' });
  }
});

/**
 * @openapi
 * /resume-all:
 *   post:
 *     tags: [Deployment]
 *     summary: Resume (scale to 1) multiple services
 *     description: Scales all given services back to 1 replica.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeployAllRequest'
 *     responses:
 *       200:
 *         description: Resume progress
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DeployAllProgress'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Resume-all failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/resume-all', async (req, res) => {
  const parsed = deployAllRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  try {
    const progress = await resumeAll(parsed.data.serviceIds as ServiceId[]);
    res.json({ success: true, data: progress });
  } catch (err) {
    logger.error({ err }, 'Resume-all failed');
    res.status(500).json({ success: false, error: 'Resume-all failed' });
  }
});

/**
 * @openapi
 * /deploy-all/stream:
 *   get:
 *     tags: [Deployment]
 *     summary: SSE stream for deploy-all progress
 *     description: Server-Sent Events stream that emits real-time deployment progress events during deploy-all, stop-all, pause-all, or resume-all operations.
 *     responses:
 *       200:
 *         description: SSE event stream
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: Newline-delimited SSE events with JSON data payloads
 */
router.get('/deploy-all/stream', (_req, res) => {
  eventBus.addClient(res);
});

export default router;
