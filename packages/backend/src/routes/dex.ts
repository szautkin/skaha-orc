import { Router } from 'express';
import type { ApiResponse } from '@skaha-orc/shared';
import { SERVICE_CATALOG } from '@skaha-orc/shared';
import { readValuesFile, writeValuesFile } from '../services/yaml.service.js';
import { logger } from '../logger.js';

const router = Router();

interface DexStaticUser {
  email: string;
  username: string;
  userID: string;
  hash: string;
}

/**
 * @openapi
 * /dex/users:
 *   get:
 *     tags: [Dex]
 *     summary: Get Dex static users
 *     description: Reads staticPasswords from dex-values.yaml.
 *     responses:
 *       200:
 *         description: List of static users
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
 *                         type: object
 *                         properties:
 *                           email: { type: string }
 *                           username: { type: string }
 *                           userID: { type: string }
 *                           hash: { type: string }
 *       500:
 *         description: Failed to read Dex users
 */
router.get('/dex/users', async (_req, res) => {
  const def = SERVICE_CATALOG.dex;
  if (!def.valuesFile) {
    res.json({ success: true, data: [] });
    return;
  }

  try {
    const config = await readValuesFile(def.valuesFile);
    const users = (config.staticPasswords as DexStaticUser[] | undefined) ?? [];
    const response: ApiResponse<DexStaticUser[]> = { success: true, data: users };
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to read Dex users');
    res.status(500).json({ success: false, error: 'Failed to read Dex users' });
  }
});

/**
 * @openapi
 * /dex/users:
 *   put:
 *     tags: [Dex]
 *     summary: Update Dex static users
 *     description: Writes staticPasswords array to dex-values.yaml. Passwords should be bcrypt hashes.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [users]
 *             properties:
 *               users:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [email, username, userID, hash]
 *                   properties:
 *                     email: { type: string }
 *                     username: { type: string }
 *                     userID: { type: string }
 *                     hash: { type: string }
 *     responses:
 *       200:
 *         description: Users saved
 *       400:
 *         description: Validation error
 *       500:
 *         description: Failed to save Dex users
 */
router.put('/dex/users', async (req, res) => {
  const { users } = req.body as { users?: DexStaticUser[] };

  if (!Array.isArray(users)) {
    res.status(400).json({ success: false, error: 'Missing users array' });
    return;
  }

  for (const u of users) {
    if (!u.email || !u.username || !u.userID || !u.hash) {
      res.status(400).json({ success: false, error: 'Each user must have email, username, userID, and hash' });
      return;
    }
  }

  const def = SERVICE_CATALOG.dex;
  if (!def.valuesFile) {
    res.status(400).json({ success: false, error: 'Dex has no values file' });
    return;
  }

  try {
    const config = await readValuesFile(def.valuesFile);
    config.staticPasswords = users;
    await writeValuesFile(def.valuesFile, config);
    res.json({ success: true, data: { message: `Saved ${users.length} user(s)` } });
  } catch (err) {
    logger.error({ err }, 'Failed to save Dex users');
    res.status(500).json({ success: false, error: 'Failed to save Dex users' });
  }
});

export default router;
