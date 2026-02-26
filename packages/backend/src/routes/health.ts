import { Router } from 'express';
import { checkPrerequisites } from '../services/bootstrap.service.js';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Health check
 *     description: Returns server status and current timestamp.
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * @openapi
 * /health/preflight:
 *   get:
 *     tags: [Health]
 *     summary: Preflight checks
 *     description: Runs prerequisite checks (helm, kubectl, directories, etc.) and returns their status.
 *     responses:
 *       200:
 *         description: Preflight results
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PreflightResult'
 */
router.get('/health/preflight', async (_req, res) => {
  const result = await checkPrerequisites();
  res.json({ success: true, data: result });
});

export default router;
