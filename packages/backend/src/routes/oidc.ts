import { Router } from 'express';
import type { ApiResponse, PlatformOidcSettings, OidcClientConfig } from '@skaha-orc/shared';
import { SERVICE_CATALOG, platformOidcSettingsSchema } from '@skaha-orc/shared';
import { readValuesFile, writeValuesFile } from '../services/yaml.service.js';
import { logger } from '../logger.js';

const router = Router();

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}

// OIDC URI paths per service
const OIDC_URI_PATHS: Record<string, string> = {
  'posix-mapper': 'deployment.posixMapper.oidcURI',
  skaha: 'deployment.skaha.oidcURI',
  cavern: 'deployment.cavern.oidcURI',
  'science-portal': 'deployment.sciencePortal.oidc.uri',
  'storage-ui': 'deployment.storageUI.oidc.uri',
};

// Full OIDC client config paths
const OIDC_CLIENT_PATHS: Record<string, string> = {
  'science-portal': 'deployment.sciencePortal.oidc',
  'storage-ui': 'deployment.storageUI.oidc',
};

/**
 * @openapi
 * /oidc/settings:
 *   get:
 *     tags: [OIDC]
 *     summary: Get platform OIDC settings
 *     description: Reads OIDC issuer URI and client configurations for science-portal and storage-ui from their values files.
 *     responses:
 *       200:
 *         description: Platform OIDC settings
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PlatformOidcSettings'
 *       500:
 *         description: Failed to read OIDC settings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/oidc/settings', async (_req, res) => {
  try {
    let issuerUri = '';

    // Find issuer URI from the first service that has it
    for (const [svcId, path] of Object.entries(OIDC_URI_PATHS)) {
      const def = SERVICE_CATALOG[svcId as keyof typeof SERVICE_CATALOG];
      if (!def?.valuesFile) continue;

      try {
        const config = await readValuesFile(def.valuesFile);
        const val = getNestedValue(config, path);
        if (typeof val === 'string' && val.length > 0) {
          issuerUri = val;
          break;
        }
      } catch {
        continue;
      }
    }

    const emptyClient: OidcClientConfig = {
      clientID: '',
      clientSecret: '',
      redirectURI: '',
      callbackURI: '',
      scope: '',
    };

    // Read science-portal client config
    let sciencePortal = { ...emptyClient };
    const spDef = SERVICE_CATALOG['science-portal'];
    if (spDef.valuesFile) {
      try {
        const config = await readValuesFile(spDef.valuesFile);
        const oidc = getNestedValue(config, OIDC_CLIENT_PATHS['science-portal']!) as Record<string, unknown> | undefined;
        if (oidc) {
          sciencePortal = {
            clientID: (oidc.clientID as string) ?? '',
            clientSecret: (oidc.clientSecret as string) ?? '',
            redirectURI: (oidc.redirectURI as string) ?? '',
            callbackURI: (oidc.callbackURI as string) ?? '',
            scope: (oidc.scope as string) ?? '',
          };
        }
      } catch {
        // use defaults
      }
    }

    // Read storage-ui client config
    let storageUi = { ...emptyClient };
    const suDef = SERVICE_CATALOG['storage-ui'];
    if (suDef.valuesFile) {
      try {
        const config = await readValuesFile(suDef.valuesFile);
        const oidc = getNestedValue(config, OIDC_CLIENT_PATHS['storage-ui']!) as Record<string, unknown> | undefined;
        if (oidc) {
          storageUi = {
            clientID: (oidc.clientID as string) ?? '',
            clientSecret: (oidc.clientSecret as string) ?? '',
            redirectURI: (oidc.redirectURI as string) ?? '',
            callbackURI: (oidc.callbackURI as string) ?? '',
            scope: (oidc.scope as string) ?? '',
          };
        }
      } catch {
        // use defaults
      }
    }

    const settings: PlatformOidcSettings = { issuerUri, sciencePortal, storageUi };
    const response: ApiResponse<PlatformOidcSettings> = { success: true, data: settings };
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to read OIDC settings');
    res.status(500).json({ success: false, error: 'Failed to read OIDC settings' });
  }
});

/**
 * @openapi
 * /oidc/settings:
 *   put:
 *     tags: [OIDC]
 *     summary: Update platform OIDC settings
 *     description: Writes OIDC issuer URI to all 5 services and full client configs to science-portal and storage-ui.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlatformOidcSettings'
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
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Failed to save OIDC settings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.put('/oidc/settings', async (req, res) => {
  const parsed = platformOidcSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { issuerUri, sciencePortal, storageUi } = parsed.data;

  try {
    let updated = 0;

    // Write issuer URI to all services that have an OIDC URI path
    for (const [svcId, path] of Object.entries(OIDC_URI_PATHS)) {
      const def = SERVICE_CATALOG[svcId as keyof typeof SERVICE_CATALOG];
      if (!def?.valuesFile) continue;

      try {
        const config = await readValuesFile(def.valuesFile);
        setNestedValue(config, path, issuerUri);
        await writeValuesFile(def.valuesFile, config);
        updated++;
      } catch {
        logger.warn({ svcId }, 'Failed to update OIDC URI for service');
      }
    }

    // Write full client config to science-portal
    const spDef = SERVICE_CATALOG['science-portal'];
    if (spDef.valuesFile) {
      try {
        const config = await readValuesFile(spDef.valuesFile);
        const basePath = OIDC_CLIENT_PATHS['science-portal'];
        setNestedValue(config, `${basePath}.uri`, issuerUri);
        setNestedValue(config, `${basePath}.clientID`, sciencePortal.clientID);
        setNestedValue(config, `${basePath}.clientSecret`, sciencePortal.clientSecret);
        setNestedValue(config, `${basePath}.redirectURI`, sciencePortal.redirectURI);
        setNestedValue(config, `${basePath}.callbackURI`, sciencePortal.callbackURI);
        setNestedValue(config, `${basePath}.scope`, sciencePortal.scope);
        await writeValuesFile(spDef.valuesFile, config);
      } catch {
        logger.warn('Failed to update science-portal OIDC client config');
      }
    }

    // Write full client config to storage-ui
    const suDef = SERVICE_CATALOG['storage-ui'];
    if (suDef.valuesFile) {
      try {
        const config = await readValuesFile(suDef.valuesFile);
        const basePath = OIDC_CLIENT_PATHS['storage-ui'];
        setNestedValue(config, `${basePath}.uri`, issuerUri);
        setNestedValue(config, `${basePath}.clientID`, storageUi.clientID);
        setNestedValue(config, `${basePath}.clientSecret`, storageUi.clientSecret);
        setNestedValue(config, `${basePath}.redirectURI`, storageUi.redirectURI);
        setNestedValue(config, `${basePath}.callbackURI`, storageUi.callbackURI);
        setNestedValue(config, `${basePath}.scope`, storageUi.scope);
        await writeValuesFile(suDef.valuesFile, config);
      } catch {
        logger.warn('Failed to update storage-ui OIDC client config');
      }
    }

    res.json({ success: true, data: { updated } });
  } catch (err) {
    logger.error({ err }, 'Failed to save OIDC settings');
    res.status(500).json({ success: false, error: 'Failed to save OIDC settings' });
  }
});

export default router;
