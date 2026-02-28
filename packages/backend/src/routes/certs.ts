import { Router } from 'express';
import type { ServiceId } from '@skaha-orc/shared';
import { SERVICE_IDS } from '@skaha-orc/shared';
import {
  listCertificates,
  getCaInfo,
  generateCA,
  uploadCA,
  generateSignedCert,
  updateCertSecret,
} from '../services/cert.service.js';
import { logger } from '../logger.js';

// eslint-disable-next-line security/detect-unsafe-regex -- anchored DNS hostname pattern, no backtracking risk
const DNS_RE = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
const ASCII_RE = /^[\x20-\x7E]+$/;

const router = Router();

/**
 * @openapi
 * /certs/ca:
 *   get:
 *     tags: [Certificates]
 *     summary: Get CA certificate info
 *     description: Returns information about the platform CA certificate, or indicates it does not exist.
 *     responses:
 *       200:
 *         description: CA info
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CaInfo'
 *       500:
 *         description: Failed to get CA info
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/certs/ca', async (_req, res) => {
  try {
    const info = await getCaInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    logger.error({ err }, 'Failed to get CA info');
    res.status(500).json({ success: false, error: 'Failed to get CA info' });
  }
});

/**
 * @openapi
 * /certs/ca/generate:
 *   post:
 *     tags: [Certificates]
 *     summary: Generate a self-signed CA
 *     description: Generates a new self-signed CA certificate and private key, stored in dev_config/.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateCaRequest'
 *     responses:
 *       200:
 *         description: Generated CA info
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CaInfo'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to generate CA
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/certs/ca/generate', async (req, res) => {
  const { cn, org, days } = req.body as { cn?: string; org?: string; days?: number };
  if (!cn || !org || !days) {
    res.status(400).json({ success: false, error: 'cn, org, and days are required' });
    return;
  }

  if (!DNS_RE.test(cn) || cn.length > 253) {
    res.status(400).json({ success: false, error: 'cn must be a valid DNS name' });
    return;
  }
  if (!ASCII_RE.test(org) || org.length > 64) {
    res.status(400).json({ success: false, error: 'org must be printable ASCII (max 64 chars)' });
    return;
  }
  if (!Number.isInteger(days) || days < 1 || days > 10950) {
    res.status(400).json({ success: false, error: 'days must be 1–10950' });
    return;
  }

  try {
    const info = await generateCA({ cn, org, days });
    res.json({ success: true, data: info });
  } catch (err) {
    logger.error({ err }, 'Failed to generate CA');
    res.status(500).json({ success: false, error: 'Failed to generate CA' });
  }
});

/**
 * @openapi
 * /certs/ca/upload:
 *   post:
 *     tags: [Certificates]
 *     summary: Upload a CA certificate and key
 *     description: Uploads an existing CA certificate and private key (PEM format) for signing service certificates.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UploadCaRequest'
 *     responses:
 *       200:
 *         description: Uploaded CA info
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CaInfo'
 *       400:
 *         description: Missing certPem or keyPem
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to upload CA
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/certs/ca/upload', async (req, res) => {
  const { certPem, keyPem } = req.body as { certPem?: string; keyPem?: string };
  if (!certPem || !keyPem) {
    res.status(400).json({ success: false, error: 'certPem and keyPem are required' });
    return;
  }

  try {
    const info = await uploadCA(certPem, keyPem);
    res.json({ success: true, data: info });
  } catch (err) {
    logger.error({ err }, 'Failed to upload CA');
    res.status(500).json({ success: false, error: 'Failed to upload CA' });
  }
});

/**
 * @openapi
 * /certs/{serviceId}:
 *   get:
 *     tags: [Certificates]
 *     summary: List certificates for a service
 *     description: Lists all TLS certificates found in the service's Helm values secrets block.
 *     parameters:
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The service identifier
 *     responses:
 *       200:
 *         description: Array of certificate info
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
 *                         $ref: '#/components/schemas/CertInfo'
 *       404:
 *         description: Unknown service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to list certificates
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/certs/:serviceId', async (req, res) => {
  const serviceId = req.params.serviceId as ServiceId;
  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  try {
    const certs = await listCertificates(serviceId);
    res.json({ success: true, data: certs });
  } catch (err) {
    logger.error({ err, serviceId }, 'Failed to list certs');
    res.status(500).json({ success: false, error: 'Failed to list certificates' });
  }
});

/**
 * @openapi
 * /certs/{serviceId}/generate:
 *   post:
 *     tags: [Certificates]
 *     summary: Generate a CA-signed certificate for a service
 *     description: Generates a new certificate signed by the platform CA and updates the service's Helm values secrets.
 *     parameters:
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The service identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateCertRequest'
 *     responses:
 *       200:
 *         description: Certificate generated and secret updated
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
 *         description: Validation error
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
 *         description: Failed to generate certificate
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/certs/:serviceId/generate', async (req, res) => {
  const serviceId = req.params.serviceId as ServiceId;
  if (!SERVICE_IDS.includes(serviceId)) {
    res.status(404).json({ success: false, error: `Unknown service: ${serviceId}` });
    return;
  }

  const { secretName, keyName, cn, days } = req.body as {
    secretName?: string;
    keyName?: string;
    cn?: string;
    days?: number;
  };
  if (!secretName || !keyName || !cn || !days) {
    res.status(400).json({
      success: false,
      error: 'secretName, keyName, cn, and days are required',
    });
    return;
  }

  if (!DNS_RE.test(cn) || cn.length > 253) {
    res.status(400).json({ success: false, error: 'cn must be a valid DNS name' });
    return;
  }
  if (!Number.isInteger(days) || days < 1 || days > 10950) {
    res.status(400).json({ success: false, error: 'days must be 1–10950' });
    return;
  }

  try {
    const { certPem, keyPem } = await generateSignedCert({ cn, days });
    const bundlePem = certPem + keyPem;
    const base64 = Buffer.from(bundlePem).toString('base64');
    await updateCertSecret(serviceId, secretName, keyName, base64);
    res.json({ success: true, data: { message: `Certificate ${keyName} renewed` } });
  } catch (err) {
    logger.error({ err, serviceId }, 'Failed to generate cert');
    res.status(500).json({ success: false, error: 'Failed to generate certificate' });
  }
});

export default router;
