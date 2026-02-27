import { Router } from 'express';
import {
  getTlsStatus,
  getServicesTrustStatus,
  applyTrust,
} from '../services/tls.service.js';
import { uploadCA } from '../services/cert.service.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/tls/status', async (_req, res) => {
  try {
    const status = await getTlsStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    logger.error({ err }, 'Failed to get TLS status');
    res.status(500).json({ success: false, error: 'Failed to get TLS status' });
  }
});

router.get('/tls/service-trust', async (_req, res) => {
  try {
    const services = await getServicesTrustStatus();
    res.json({ success: true, data: services });
  } catch (err) {
    logger.error({ err }, 'Failed to get service trust status');
    res.status(500).json({ success: false, error: 'Failed to get service trust status' });
  }
});

router.post('/tls/apply-trust', async (_req, res) => {
  try {
    const result = await applyTrust();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err }, 'Failed to apply trust');
    res.status(500).json({ success: false, error: 'Failed to apply trust configuration' });
  }
});

router.post('/tls/upload-le-cert', async (req, res) => {
  const { certPem, keyPem } = req.body as { certPem?: string; keyPem?: string };
  if (!certPem || !keyPem) {
    res.status(400).json({ success: false, error: 'certPem and keyPem are required' });
    return;
  }

  try {
    // Upload as CA (Let's Encrypt chain cert)
    await uploadCA(certPem, keyPem);
    // For LE, the combined PEM is cert+key directly
    const { writeFile } = await import('fs/promises');
    const { HAPROXY_CERT_PATH } = await import('../services/cert.service.js');
    const combinedPem = `${certPem}\n${keyPem}`;
    await writeFile(HAPROXY_CERT_PATH, combinedPem, { encoding: 'utf-8', mode: 0o600 });
    const status = await getTlsStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    logger.error({ err }, 'Failed to upload Let\'s Encrypt cert');
    res.status(500).json({ success: false, error: 'Failed to upload certificate' });
  }
});

export default router;
