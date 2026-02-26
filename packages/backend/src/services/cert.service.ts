import { execFile } from 'child_process';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { CertInfo, CaInfo, HAProxyCertInfo } from '@skaha-orc/shared';
import { SERVICE_CATALOG } from '@skaha-orc/shared';
import type { ServiceId } from '@skaha-orc/shared';
import { readValuesFile, writeValuesFile } from './yaml.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

const DEV_CONFIG_DIR = resolve(config.helmConfigDir, '..', 'dev_config');
export const CA_CERT_PATH = resolve(DEV_CONFIG_DIR, 'ca-cert.crt');
const CA_KEY_PATH = resolve(DEV_CONFIG_DIR, 'ca-key.key');
export const HAPROXY_CERT_PATH = resolve(DEV_CONFIG_DIR, 'server-cert.pem');

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface ParsedCert {
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
}

async function parsePem(pemContent: string): Promise<ParsedCert> {
  const tmpFile = resolve(tmpdir(), `cert-${randomUUID()}.pem`);
  try {
    await writeFile(tmpFile, pemContent, 'utf-8');
    const { stdout } = await execFileAsync('openssl', [
      'x509',
      '-noout',
      '-subject',
      '-issuer',
      '-dates',
      '-in',
      tmpFile,
    ]);

    const lines = stdout.split('\n');
    const get = (prefix: string) =>
      lines.find((l) => l.startsWith(prefix))?.replace(prefix, '').trim() ?? '';

    return {
      subject: get('subject='),
      issuer: get('issuer='),
      notBefore: get('notBefore='),
      notAfter: get('notAfter='),
    };
  } finally {
    await writeFile(tmpFile, '', 'utf-8').catch(() => {});
  }
}

function computeExpiry(notAfter: string): { isExpired: boolean; daysUntilExpiry: number } {
  const expiryDate = new Date(notAfter);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const daysUntilExpiry = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return { isExpired: daysUntilExpiry < 0, daysUntilExpiry };
}

export async function listCertificates(serviceId: ServiceId): Promise<CertInfo[]> {
  const def = SERVICE_CATALOG[serviceId];
  if (!def?.valuesFile) return [];

  const values = await readValuesFile(def.valuesFile);
  const secrets = (values as Record<string, unknown>).secrets as
    | Record<string, Record<string, string>>
    | undefined;
  if (!secrets) return [];

  const certs: CertInfo[] = [];
  for (const [secretName, entries] of Object.entries(secrets)) {
    for (const [keyName, value] of Object.entries(entries)) {
      if (!keyName.endsWith('.pem') && !keyName.endsWith('.crt')) continue;
      try {
        const decoded = Buffer.from(value, 'base64').toString('utf-8');
        if (!decoded.includes('BEGIN CERTIFICATE')) continue;
        const parsed = await parsePem(decoded);
        const expiry = computeExpiry(parsed.notAfter);
        certs.push({
          secretName,
          keyName,
          subject: parsed.subject,
          issuer: parsed.issuer,
          notBefore: parsed.notBefore,
          notAfter: parsed.notAfter,
          ...expiry,
        });
      } catch (err) {
        logger.warn({ err, secretName, keyName }, 'Failed to parse cert');
      }
    }
  }
  return certs;
}

export async function getCaInfo(): Promise<CaInfo> {
  if (!(await fileExists(CA_CERT_PATH))) {
    return { exists: false, path: CA_CERT_PATH };
  }

  try {
    const pem = await readFile(CA_CERT_PATH, 'utf-8');
    const parsed = await parsePem(pem);
    const expiry = computeExpiry(parsed.notAfter);
    return {
      exists: true,
      subject: parsed.subject,
      issuer: parsed.issuer,
      notAfter: parsed.notAfter,
      isExpired: expiry.isExpired,
      path: CA_CERT_PATH,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to read CA cert');
    return { exists: false, path: CA_CERT_PATH };
  }
}

export async function generateCA(opts: {
  cn: string;
  days: number;
  org: string;
}): Promise<CaInfo> {
  await mkdir(DEV_CONFIG_DIR, { recursive: true });

  const subject = `/O=${opts.org}/CN=${opts.cn}`;
  await execFileAsync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-keyout',
    CA_KEY_PATH,
    '-out',
    CA_CERT_PATH,
    '-days',
    String(opts.days),
    '-nodes',
    '-subj',
    subject,
  ]);

  logger.info({ cn: opts.cn, days: opts.days }, 'Generated new CA');
  return getCaInfo();
}

export async function uploadCA(certPem: string, keyPem: string): Promise<CaInfo> {
  await mkdir(DEV_CONFIG_DIR, { recursive: true });

  // Validate the cert
  const tmpCert = resolve(tmpdir(), `ca-validate-${randomUUID()}.pem`);
  try {
    await writeFile(tmpCert, certPem, 'utf-8');
    await execFileAsync('openssl', ['x509', '-noout', '-in', tmpCert]);
  } finally {
    await writeFile(tmpCert, '', 'utf-8').catch(() => {});
  }

  await writeFile(CA_CERT_PATH, certPem, 'utf-8');
  await writeFile(CA_KEY_PATH, keyPem, 'utf-8');

  logger.info('Uploaded CA cert and key');
  return getCaInfo();
}

export async function generateSignedCert(opts: {
  cn: string;
  days: number;
}): Promise<{ certPem: string; keyPem: string }> {
  if (!(await fileExists(CA_CERT_PATH)) || !(await fileExists(CA_KEY_PATH))) {
    throw new Error('CA cert/key not found. Generate or upload a CA first.');
  }

  const tmpDir = resolve(tmpdir(), `cert-gen-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  const keyPath = resolve(tmpDir, 'key.pem');
  const csrPath = resolve(tmpDir, 'csr.pem');
  const certPath = resolve(tmpDir, 'cert.pem');

  try {
    // Generate key
    await execFileAsync('openssl', [
      'genrsa',
      '-out',
      keyPath,
      '2048',
    ]);

    // Generate CSR
    await execFileAsync('openssl', [
      'req',
      '-new',
      '-key',
      keyPath,
      '-out',
      csrPath,
      '-subj',
      `/CN=${opts.cn}`,
    ]);

    // Sign with CA
    await execFileAsync('openssl', [
      'x509',
      '-req',
      '-in',
      csrPath,
      '-CA',
      CA_CERT_PATH,
      '-CAkey',
      CA_KEY_PATH,
      '-CAcreateserial',
      '-out',
      certPath,
      '-days',
      String(opts.days),
    ]);

    const certPem = await readFile(certPath, 'utf-8');
    const keyPem = await readFile(keyPath, 'utf-8');

    logger.info({ cn: opts.cn, days: opts.days }, 'Generated signed certificate');
    return { certPem, keyPem };
  } finally {
    // Cleanup temp files
    for (const f of [keyPath, csrPath, certPath]) {
      await writeFile(f, '', 'utf-8').catch(() => {});
    }
  }
}

export async function getHAProxyCertInfo(): Promise<HAProxyCertInfo> {
  if (!(await fileExists(HAPROXY_CERT_PATH))) {
    return { exists: false, path: HAPROXY_CERT_PATH };
  }

  try {
    const pem = await readFile(HAPROXY_CERT_PATH, 'utf-8');
    const parsed = await parsePem(pem);
    const expiry = computeExpiry(parsed.notAfter);
    return {
      exists: true,
      path: HAPROXY_CERT_PATH,
      subject: parsed.subject,
      issuer: parsed.issuer,
      notAfter: parsed.notAfter,
      isExpired: expiry.isExpired,
      daysUntilExpiry: expiry.daysUntilExpiry,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to read HAProxy cert');
    return { exists: false, path: HAPROXY_CERT_PATH };
  }
}

export async function generateHAProxyCert(opts: {
  cn: string;
  days: number;
}): Promise<HAProxyCertInfo> {
  const { certPem, keyPem } = await generateSignedCert(opts);
  const combinedPem = `${certPem}\n${keyPem}`;

  await mkdir(DEV_CONFIG_DIR, { recursive: true });
  await writeFile(HAPROXY_CERT_PATH, combinedPem, 'utf-8');

  logger.info({ cn: opts.cn, days: opts.days }, 'Generated HAProxy server cert');
  return getHAProxyCertInfo();
}

export async function updateCertSecret(
  serviceId: ServiceId,
  secretName: string,
  keyName: string,
  base64Pem: string,
): Promise<void> {
  const def = SERVICE_CATALOG[serviceId];
  if (!def?.valuesFile) throw new Error(`Service ${serviceId} has no values file`);

  const values = await readValuesFile(def.valuesFile);
  const secrets = ((values as Record<string, unknown>).secrets ?? {}) as Record<
    string,
    Record<string, string>
  >;

  if (!secrets[secretName]) {
    secrets[secretName] = {};
  }
  secrets[secretName][keyName] = base64Pem;
  (values as Record<string, unknown>).secrets = secrets;

  await writeValuesFile(def.valuesFile, values);
  logger.info({ serviceId, secretName, keyName }, 'Updated cert secret in values file');
}
