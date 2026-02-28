import { Router } from 'express';
import type { ApiResponse, PlatformOidcSettings, OidcClientConfig } from '@skaha-orc/shared';
import { SERVICE_CATALOG, platformOidcSettingsSchema, getNestedValue, setNestedValue } from '@skaha-orc/shared';
import { readValuesFile, writeValuesFile } from '../services/yaml.service.js';
import { logger } from '../logger.js';

const router = Router();

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
  skaha: 'deployment.skaha.oidc',
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

    // Read skaha client config
    let skaha = { ...emptyClient };
    const skahaDef = SERVICE_CATALOG['skaha'];
    if (skahaDef.valuesFile) {
      try {
        const config = await readValuesFile(skahaDef.valuesFile);
        const oidc = getNestedValue(config, OIDC_CLIENT_PATHS['skaha']!) as Record<string, unknown> | undefined;
        if (oidc) {
          skaha = {
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

    const settings: PlatformOidcSettings = { issuerUri, sciencePortal, storageUi, skaha };
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

  const { issuerUri, sciencePortal, storageUi, skaha } = parsed.data;

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

    // Write full client config to each OIDC client service
    const clientMap: Record<string, OidcClientConfig> = {
      'science-portal': sciencePortal,
      'storage-ui': storageUi,
      skaha,
    };
    for (const [svcId, clientConfig] of Object.entries(clientMap)) {
      const basePath = OIDC_CLIENT_PATHS[svcId];
      if (!basePath) continue;
      const def = SERVICE_CATALOG[svcId as keyof typeof SERVICE_CATALOG];
      if (!def?.valuesFile) continue;
      try {
        const config = await readValuesFile(def.valuesFile);
        setNestedValue(config, `${basePath}.uri`, issuerUri);
        setNestedValue(config, `${basePath}.clientID`, clientConfig.clientID);
        setNestedValue(config, `${basePath}.clientSecret`, clientConfig.clientSecret);
        setNestedValue(config, `${basePath}.redirectURI`, clientConfig.redirectURI);
        setNestedValue(config, `${basePath}.callbackURI`, clientConfig.callbackURI);
        setNestedValue(config, `${basePath}.scope`, clientConfig.scope);
        await writeValuesFile(def.valuesFile, config);
      } catch {
        logger.warn({ svcId }, 'Failed to update OIDC client config');
      }
    }

    // Sync full client state (secrets + redirect URIs) into Dex staticClients
    const dexDef = SERVICE_CATALOG['dex'];
    if (dexDef.valuesFile) {
      try {
        const config = await readValuesFile(dexDef.valuesFile);
        const clients = (config.staticClients ?? []) as
          Array<{ id: string; secret: string; name?: string; redirectURIs?: string[]; [k: string]: unknown }>;

        const desiredClients = [
          {
            id: sciencePortal.clientID,
            secret: sciencePortal.clientSecret,
            name: 'Science Portal',
            redirectURIs: [sciencePortal.redirectURI],
          },
          {
            id: storageUi.clientID,
            secret: storageUi.clientSecret,
            name: 'Storage UI',
            redirectURIs: [storageUi.redirectURI],
          },
          {
            id: skaha.clientID,
            secret: skaha.clientSecret,
            name: 'Skaha',
            redirectURIs: [skaha.redirectURI, skaha.callbackURI].filter(Boolean),
          },
        ];

        for (const desired of desiredClients) {
          if (!desired.id) continue;
          const existing = clients.find((c) => c.id === desired.id);
          if (existing) {
            existing.secret = desired.secret;
            existing.name = desired.name;
            existing.redirectURIs = desired.redirectURIs;
          } else {
            clients.push(desired);
          }
        }

        // Also sync DEX issuer
        config.staticClients = clients;
        config.issuer = issuerUri;
        await writeValuesFile(dexDef.valuesFile, config);
        updated++;
      } catch {
        logger.warn('Failed to sync clients to dex-values.yaml');
      }
    }

    // Set cavern identityManagerClass to StandardIdentityManager for token-based auth
    const cavernDef = SERVICE_CATALOG['cavern'];
    if (cavernDef.valuesFile) {
      try {
        const config = await readValuesFile(cavernDef.valuesFile);
        const current = getNestedValue(config, 'deployment.cavern.identityManagerClass');
        if (current !== 'org.opencadc.auth.StandardIdentityManager') {
          setNestedValue(config, 'deployment.cavern.identityManagerClass',
            'org.opencadc.auth.StandardIdentityManager');
          await writeValuesFile(cavernDef.valuesFile, config);
          updated++;
        }
      } catch {
        logger.warn('Failed to set cavern identityManagerClass');
      }
    }

    res.json({ success: true, data: { updated } });
  } catch (err) {
    logger.error({ err }, 'Failed to save OIDC settings');
    res.status(500).json({ success: false, error: 'Failed to save OIDC settings' });
  }
});

export default router;
