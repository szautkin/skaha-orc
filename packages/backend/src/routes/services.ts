import { Router } from 'express';
import type { ServiceId, ApiResponse, ServiceWithStatus, ExtraHost } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS, PLATFORM_HOSTNAME, configUpdateSchema } from '@skaha-orc/shared';
import { getServiceStatus, getAllStatuses } from '../services/status.service.js';
import { readValuesFile, writeValuesFile } from '../services/yaml.service.js';
import { helmDeploy, helmUninstall } from '../services/helm.service.js';
import { scaleDeployment } from '../services/kubectl.service.js';
import { detectDeployMode } from '../services/haproxy.service.js';
import { logger } from '../logger.js';

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const IPV6_RE = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^([0-9a-fA-F]{1,4}:)*:([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip);
}

const router = Router();

/**
 * @openapi
 * /services:
 *   get:
 *     tags: [Services]
 *     summary: List all services with status
 *     description: Returns every service in the catalog with its current deployment status.
 *     responses:
 *       200:
 *         description: Array of services with status
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ServiceWithStatus'
 *       500:
 *         description: Failed to fetch services
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/services', async (_req, res) => {
  try {
    const services = await getAllStatuses();
    const response: ApiResponse<ServiceWithStatus[]> = { success: true, data: services };
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to list services');
    res.status(500).json({ success: false, error: 'Failed to fetch services' });
  }
});

/**
 * @openapi
 * /services/host-ip:
 *   get:
 *     tags: [Services]
 *     summary: Get the platform host IP
 *     description: Scans all service values files for an extraHosts entry matching the platform hostname and returns the first IP found.
 *     responses:
 *       200:
 *         description: Host IP entry (ip may be null if not configured)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ExtraHost'
 *       500:
 *         description: Failed to read host IP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/services/host-ip', async (_req, res) => {
  try {
    for (const def of Object.values(SERVICE_CATALOG)) {
      if (!def.valuesFile) continue;

      let config: Record<string, unknown>;
      try {
        config = await readValuesFile(def.valuesFile);
      } catch {
        continue; // skip multi-document or unreadable files
      }

      const deployment = config.deployment as
        | { extraHosts?: ExtraHost[] }
        | undefined;
      if (!deployment?.extraHosts) continue;

      const entry = deployment.extraHosts.find(
        (h) => h.hostname === PLATFORM_HOSTNAME,
      );
      if (entry) {
        res.json({ success: true, data: { ip: entry.ip, hostname: entry.hostname } });
        return;
      }
    }

    res.json({ success: true, data: { ip: null, hostname: PLATFORM_HOSTNAME } });
  } catch (err) {
    logger.error({ err }, 'Failed to read host IP');
    res.status(500).json({ success: false, error: 'Failed to read host IP' });
  }
});

/**
 * @openapi
 * /services/host-ip:
 *   put:
 *     tags: [Services]
 *     summary: Update the platform host IP across all services
 *     description: Sets the IP for the platform hostname in every service values file that has an extraHosts entry.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ip]
 *             properties:
 *               ip:
 *                 type: string
 *                 description: IPv4 or IPv6 address
 *     responses:
 *       200:
 *         description: Number of files updated
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
 *                         updated:
 *                           type: integer
 *       400:
 *         description: Missing or invalid IP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to update host IP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.put('/services/host-ip', async (req, res) => {
  const { ip } = req.body as { ip?: string };
  if (!ip || typeof ip !== 'string') {
    res.status(400).json({ success: false, error: 'Missing or invalid ip' });
    return;
  }

  if (!isValidIp(ip)) {
    res.status(400).json({ success: false, error: 'Invalid IP address format' });
    return;
  }

  try {
    let updated = 0;

    for (const def of Object.values(SERVICE_CATALOG)) {
      if (!def.valuesFile) continue;

      let config: Record<string, unknown>;
      try {
        config = await readValuesFile(def.valuesFile);
      } catch {
        continue; // skip multi-document or unreadable files
      }

      const deployment = config.deployment as
        | { extraHosts?: ExtraHost[] }
        | undefined;
      if (!deployment?.extraHosts) continue;

      let changed = false;
      for (const host of deployment.extraHosts) {
        if (host.hostname === PLATFORM_HOSTNAME && host.ip !== ip) {
          host.ip = ip;
          changed = true;
        }
      }

      if (changed) {
        await writeValuesFile(def.valuesFile, config);
        updated++;
      }
    }

    res.json({ success: true, data: { updated } });
  } catch (err) {
    logger.error({ err }, 'Failed to update host IP');
    res.status(500).json({ success: false, error: 'Failed to update host IP' });
  }
});

/**
 * @openapi
 * /services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get a single service with status
 *     description: Returns the service definition and its current deployment status.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Service with status
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ServiceWithStatus'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to fetch service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/services/:id', async (req, res) => {
  const serviceId = req.params.id as ServiceId;
  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  try {
    const def = SERVICE_CATALOG[serviceId];
    const status = await getServiceStatus(serviceId);
    const service: ServiceWithStatus = { ...def, status };
    res.json({ success: true, data: service });
  } catch (err) {
    logger.error({ err, serviceId }, 'Failed to get service');
    res.status(500).json({ success: false, error: 'Failed to fetch service' });
  }
});

/**
 * @openapi
 * /services/{id}/config:
 *   get:
 *     tags: [Services]
 *     summary: Get Helm values for a service
 *     description: Reads and returns the parsed YAML values file for the service.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Parsed values object
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to read config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/services/:id/config', async (req, res) => {
  const serviceId = req.params.id as ServiceId;
  const def = SERVICE_CATALOG[serviceId];

  if (!def) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  if (!def.valuesFile) {
    res.json({ success: true, data: {} });
    return;
  }

  try {
    const config = await readValuesFile(def.valuesFile);
    res.json({ success: true, data: config });
  } catch (err) {
    logger.error({ err, serviceId }, 'Failed to read config');
    res.status(500).json({ success: false, error: 'Failed to read config' });
  }
});

/**
 * @openapi
 * /services/{id}/config:
 *   put:
 *     tags: [Services]
 *     summary: Update Helm values for a service
 *     description: Validates and writes a new values object to the service's YAML file.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [config]
 *             properties:
 *               config:
 *                 type: object
 *                 description: The full values object to write
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
 *         description: Validation error or service has no values file
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
 *       500:
 *         description: Failed to save config
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.put('/services/:id/config', async (req, res) => {
  const serviceId = req.params.id as ServiceId;
  const def = SERVICE_CATALOG[serviceId];

  if (!def) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  if (!def.valuesFile) {
    res.status(400).json({ success: false, error: 'Service has no values file' });
    return;
  }

  const parsed = configUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  try {
    await writeValuesFile(def.valuesFile, parsed.data.config);
    res.json({ success: true, data: { message: 'Config saved' } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Failed to write config');
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

/**
 * @openapi
 * /services/{id}/deploy:
 *   post:
 *     tags: [Services]
 *     summary: Deploy a service
 *     description: Runs helm install/upgrade for the service. Supports dry-run mode.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Deploy output
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
 *                         output:
 *                           type: string
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Deploy failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/services/:id/deploy', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const dryRun = req.body?.dryRun === true;

  try {
    const result = await helmDeploy(serviceId, { dryRun });
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Deploy failed');
    res.status(500).json({ success: false, error: 'Deploy failed' });
  }
});

/**
 * @openapi
 * /services/{id}/uninstall:
 *   post:
 *     tags: [Services]
 *     summary: Uninstall a service
 *     description: Runs helm uninstall for the service.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Uninstall output
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
 *                         output:
 *                           type: string
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Uninstall failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/services/:id/uninstall', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  try {
    const result = await helmUninstall(serviceId);
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Uninstall failed');
    res.status(500).json({ success: false, error: 'Uninstall failed' });
  }
});

/**
 * @openapi
 * /services/{id}/pause:
 *   post:
 *     tags: [Services]
 *     summary: Pause a service (scale to 0)
 *     description: Scales the service deployment to 0 replicas. For HAProxy services, only works in kubernetes mode.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Pause output
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
 *                         output:
 *                           type: string
 *       400:
 *         description: Pause not supported (HAProxy non-kubernetes mode)
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
 *       500:
 *         description: Pause failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/services/:id/pause', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const def = SERVICE_CATALOG[serviceId];

  if (def.chartSource.type === 'haproxy') {
    try {
      const mode = await detectDeployMode();
      if (mode !== 'kubernetes') {
        res.status(400).json({ success: false, error: `Pause not supported for HAProxy in ${mode ?? 'unknown'} mode. Use stop instead.` });
        return;
      }
    } catch {
      res.status(400).json({ success: false, error: 'Pause not supported for HAProxy: unable to detect deploy mode. Use stop instead.' });
      return;
    }
  }

  try {
    const result = await scaleDeployment(def.namespace, serviceId, 0);
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Pause failed');
    res.status(500).json({ success: false, error: 'Pause failed' });
  }
});

/**
 * @openapi
 * /services/{id}/resume:
 *   post:
 *     tags: [Services]
 *     summary: Resume a service (scale to 1)
 *     description: Scales the service deployment back to 1 replica. For HAProxy services, only works in kubernetes mode.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service identifier
 *     responses:
 *       200:
 *         description: Resume output
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
 *                         output:
 *                           type: string
 *       400:
 *         description: Resume not supported (HAProxy non-kubernetes mode)
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
 *       500:
 *         description: Resume failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/services/:id/resume', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const def = SERVICE_CATALOG[serviceId];

  if (def.chartSource.type === 'haproxy') {
    try {
      const mode = await detectDeployMode();
      if (mode !== 'kubernetes') {
        res.status(400).json({ success: false, error: `Resume not supported for HAProxy in ${mode ?? 'unknown'} mode. Use deploy instead.` });
        return;
      }
    } catch {
      res.status(400).json({ success: false, error: 'Resume not supported for HAProxy: unable to detect deploy mode. Use deploy instead.' });
      return;
    }
  }

  try {
    const result = await scaleDeployment(def.namespace, serviceId, 1);
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Resume failed');
    res.status(500).json({ success: false, error: 'Resume failed' });
  }
});

export default router;
