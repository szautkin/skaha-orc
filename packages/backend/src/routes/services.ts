import { Router } from 'express';
import type { ServiceId, ApiResponse, ServiceWithStatus } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS, configUpdateSchema } from '@skaha-orc/shared';
import { getServiceStatus, getAllStatuses } from '../services/status.service.js';
import { readValuesFile, writeValuesFile } from '../services/yaml.service.js';
import { helmDeploy, helmUninstall } from '../services/helm.service.js';
import { scaleDeployment } from '../services/kubectl.service.js';
import { logger } from '../logger.js';

const router = Router();

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

router.post('/services/:id/pause', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const def = SERVICE_CATALOG[serviceId];

  try {
    const result = await scaleDeployment(def.namespace, serviceId, 0);
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Pause failed');
    res.status(500).json({ success: false, error: 'Pause failed' });
  }
});

router.post('/services/:id/resume', async (req, res) => {
  const serviceId = req.params.id as ServiceId;

  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const def = SERVICE_CATALOG[serviceId];

  try {
    const result = await scaleDeployment(def.namespace, serviceId, 1);
    res.json({ success: result.success, data: { output: result.output } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Resume failed');
    res.status(500).json({ success: false, error: 'Resume failed' });
  }
});

export default router;
