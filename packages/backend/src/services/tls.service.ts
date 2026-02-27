import type { TlsMode, TlsStatus, ServiceTrustStatus, ApplyTrustResult } from '@skaha-orc/shared';
import { SERVICE_CATALOG } from '@skaha-orc/shared';
import {
  getCaInfo,
  getHAProxyCertInfo,
} from './cert.service.js';
import { readValuesFile } from './yaml.service.js';
import { logger } from '../logger.js';

/**
 * CA cert trust secret names per Java service.
 * OpenCADC containers auto-import /config/cacerts/* via update-ca-trust at startup.
 */
const CACERT_SECRET_NAMES: Record<string, string> = {
  skaha: 'skaha-cacert-secret',
  cavern: 'cavern-cacert-secret',
  'science-portal': 'science-portal-cacert-secret',
  'posix-mapper': 'posix-mapper-cacert-secret',
};

/**
 * Detect TLS mode based on the CA cert: self-signed if subject===issuer,
 * lets-encrypt if issued by a different CA, not-configured if no CA.
 */
export async function detectTlsMode(): Promise<TlsMode> {
  const ca = await getCaInfo();
  if (!ca.exists || !ca.subject || !ca.issuer) return 'not-configured';
  return ca.subject === ca.issuer ? 'self-signed' : 'lets-encrypt';
}

/**
 * Get the trust status of each Java service.
 * OpenCADC containers trust the CA automatically when ca.crt is mounted
 * at /config/cacerts — the container startup script runs update-ca-trust.
 * We check whether the volume mount and secret exist in the values file.
 */
export async function getServicesTrustStatus(): Promise<ServiceTrustStatus[]> {
  const results: ServiceTrustStatus[] = [];

  for (const [serviceId, secretName] of Object.entries(CACERT_SECRET_NAMES)) {
    const def = SERVICE_CATALOG[serviceId as keyof typeof SERVICE_CATALOG];
    if (!def) continue;

    let hasCaCert = false;

    if (def.valuesFile) {
      try {
        const data = await readValuesFile(def.valuesFile);
        const secrets = (data.secrets ?? {}) as Record<string, Record<string, string>>;
        hasCaCert = !!(secrets[secretName]?.['ca.crt'] && secrets[secretName]['ca.crt'].length > 10);
      } catch {
        // values file not readable
      }
    }

    results.push({
      serviceId,
      serviceName: def.name,
      deploymentName: secretName.replace('-cacert-secret', '-tomcat'),
      hasCaCert,
    });
  }

  return results;
}

/**
 * Full TLS status for the UI.
 */
export async function getTlsStatus(): Promise<TlsStatus> {
  const [mode, ca, haproxyCert, services] = await Promise.all([
    detectTlsMode(),
    getCaInfo(),
    getHAProxyCertInfo(),
    getServicesTrustStatus(),
  ]);

  return {
    mode,
    ca: {
      exists: ca.exists,
      subject: ca.subject,
      issuer: ca.issuer,
      isSelfSigned: ca.subject !== undefined && ca.subject === ca.issuer,
    },
    haproxyCert: {
      exists: haproxyCert.exists,
      issuer: haproxyCert.exists ? haproxyCert.issuer : undefined,
      isSelfSigned: haproxyCert.exists && haproxyCert.subject === haproxyCert.issuer,
    },
    services,
  };
}

/**
 * Apply trust is now a no-op for JAVA_TOOL_OPTIONS — OpenCADC containers
 * auto-import CA certs via update-ca-trust. This just verifies the CA cert
 * is present in the cacert secrets and reports status.
 */
export async function applyTrust(): Promise<ApplyTrustResult> {
  const result: ApplyTrustResult = {
    servicesPatched: [],
    errors: [],
  };

  // Verify CA cert is injected into all service values
  for (const [serviceId, secretName] of Object.entries(CACERT_SECRET_NAMES)) {
    const def = SERVICE_CATALOG[serviceId as keyof typeof SERVICE_CATALOG];
    if (!def?.valuesFile) continue;

    try {
      const data = await readValuesFile(def.valuesFile);
      const secrets = (data.secrets ?? {}) as Record<string, Record<string, string>>;
      if (secrets[secretName]?.['ca.crt'] && secrets[secretName]['ca.crt'].length > 10) {
        result.servicesPatched.push(serviceId);
      } else {
        result.errors.push({ serviceId, error: 'CA cert not found in values — redeploy needed' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ serviceId, error: msg });
    }
  }

  logger.info({ patched: result.servicesPatched, errors: result.errors.length }, 'Trust status checked');
  return result;
}
