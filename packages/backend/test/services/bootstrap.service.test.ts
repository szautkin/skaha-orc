import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';

jest.mock('execa', () => ({
  execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

jest.mock('../../src/swagger', () => ({
  swaggerSpec: {},
}));

let tmpDir: string;

function mockConfig(dir: string) {
  jest.doMock('../../src/config', () => ({
    config: {
      helmConfigDir: dir,
      port: 3001,
      chartBaseDir: './charts',
      platformHostname: 'test.example.com',
      helmBinary: 'helm',
      kubectlBinary: 'kubectl',
      helmRepos: {},
      defaultNamespace: 'skaha-system',
      statusPollInterval: 10000,
      healthCheck: { podReadyTimeoutMs: 120000, podPollIntervalMs: 3000, httpTimeoutMs: 10000 },
      haproxy: {
        configPath: join(dir, 'haproxy.cfg'),
        binary: 'haproxy',
        dockerImage: 'haproxy:2.9-alpine',
        dockerContainerName: 'skaha-haproxy',
        k8sNamespace: 'skaha-system',
        k8sDeploymentName: 'haproxy',
      },
      kubernetes: { context: '', kubeconfig: '' },
    },
    valuesFilePath: (filename: string) => {
      const { resolve } = require('path');
      return resolve(dir, filename);
    },
  }));
}

function writeYaml(filename: string, data: Record<string, unknown>): void {
  writeFileSync(join(tmpDir, filename), yaml.dump(data));
}

function readYaml(filename: string): Record<string, unknown> {
  const { readFileSync } = require('fs');
  return yaml.load(readFileSync(join(tmpDir, filename), 'utf-8')) as Record<string, unknown>;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bootstrap-test-'));
  jest.resetModules();

  jest.doMock('execa', () => ({
    execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  }));
  jest.doMock('../../src/swagger', () => ({
    swaggerSpec: {},
  }));
  // Mock cert service to avoid filesystem dependencies
  jest.doMock('../../src/services/cert.service', () => ({
    getCaInfo: jest.fn().mockResolvedValue(null),
    generateCA: jest.fn().mockResolvedValue(undefined),
    generateHAProxyCert: jest.fn().mockResolvedValue(undefined),
    HAPROXY_CERT_PATH: join(tmpDir, 'haproxy.pem'),
    CA_CERT_PATH: join(tmpDir, 'ca.crt'),
  }));
  jest.doMock('../../src/services/haproxy.service', () => ({
    generateHAProxyConfig: jest.fn().mockResolvedValue(''),
    saveHAProxyConfig: jest.fn().mockResolvedValue(undefined),
    isHAProxyRunning: jest.fn().mockResolvedValue(false),
    isHAProxyPaused: jest.fn().mockResolvedValue(false),
    deployHAProxy: jest.fn().mockResolvedValue('deployed'),
    stopHAProxy: jest.fn().mockResolvedValue('stopped'),
    detectDeployMode: jest.fn().mockResolvedValue('kubernetes'),
  }));
  jest.doMock('../../src/services/kubectl.service', () => ({
    kubectlExec: jest.fn().mockResolvedValue(''),
    scaleDeployment: jest.fn().mockResolvedValue({ success: true, output: '' }),
  }));
  mockConfig(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('syncPosixMapperDbConfig', () => {
  it('merges DB config into posix-mapper values', async () => {
    writeYaml('posix-mapper-postgres.yaml', {
      postgres: {
        auth: { username: 'pm', password: 'secret', database: 'pmdb', schema: 'mapping' },
      },
    });
    writeYaml('posix-mapper-values.yaml', {
      deployment: { posixMapper: {} },
    });

    const { syncPosixMapperDbConfig } = await import('../../src/services/bootstrap.service');
    const result = await syncPosixMapperDbConfig();

    expect(result.status).toBe('applied');
    const data = readYaml('posix-mapper-values.yaml');
    const pg = data.postgresql as Record<string, unknown>;
    expect(pg.url).toContain('postgresql://');
    expect(pg.schema).toBe('mapping');
    expect((pg.auth as Record<string, string>).username).toBe('pm');
  });

  it('preserves existing maxActive', async () => {
    writeYaml('posix-mapper-postgres.yaml', {
      postgres: {
        auth: { username: 'pm', password: 'pass', database: 'pmdb', schema: 'mapping' },
      },
    });
    writeYaml('posix-mapper-values.yaml', {
      deployment: { posixMapper: {} },
      postgresql: { maxActive: 20 },
    });

    const { syncPosixMapperDbConfig } = await import('../../src/services/bootstrap.service');
    await syncPosixMapperDbConfig();

    const data = readYaml('posix-mapper-values.yaml');
    expect((data.postgresql as Record<string, unknown>).maxActive).toBe(20);
  });

  it('skips when URL already valid', async () => {
    writeYaml('posix-mapper-postgres.yaml', {
      postgres: {
        auth: { username: 'pm', password: 'pass', database: 'pmdb', schema: 'mapping' },
      },
    });
    writeYaml('posix-mapper-values.yaml', {
      postgresql: { url: 'jdbc:postgresql://existing:5432/db' },
    });

    const { syncPosixMapperDbConfig } = await import('../../src/services/bootstrap.service');
    const result = await syncPosixMapperDbConfig();
    expect(result.status).toBe('skipped');
  });
});

describe('syncGmsId', () => {
  it('fans out gmsID to 5 services', async () => {
    writeYaml('posix-mapper-values.yaml', {
      deployment: { posixMapper: { gmsID: 'ivo://cadc.nrc.ca/gms' } },
    });
    writeYaml('skaha-values.yaml', { deployment: { skaha: {} } });
    writeYaml('cavern-values.yaml', { deployment: { cavern: {} } });
    writeYaml('science-portal-values.yaml', { deployment: { sciencePortal: {} } });
    writeYaml('storage.yaml', { deployment: { storageUI: {} } });
    writeYaml('doi-values.yaml', { deployment: { doi: {} } });

    const { syncGmsId } = await import('../../src/services/bootstrap.service');
    const result = await syncGmsId();
    expect(result.status).toBe('applied');

    const skaha = readYaml('skaha-values.yaml');
    expect((skaha.deployment as any).skaha.gmsID).toBe('ivo://cadc.nrc.ca/gms');
  });

  it('warns when gmsID is empty', async () => {
    writeYaml('posix-mapper-values.yaml', {
      deployment: { posixMapper: { gmsID: '' } },
    });

    const { syncGmsId } = await import('../../src/services/bootstrap.service');
    const result = await syncGmsId();
    expect(result.status).toBe('skipped');
    expect(result.message).toContain('empty');
  });

  it('skips when all services already have correct gmsID', async () => {
    const gmsID = 'ivo://cadc.nrc.ca/gms';
    writeYaml('posix-mapper-values.yaml', {
      deployment: { posixMapper: { gmsID } },
    });
    writeYaml('skaha-values.yaml', { deployment: { skaha: { gmsID } } });
    writeYaml('cavern-values.yaml', { deployment: { cavern: { gmsID } } });
    writeYaml('science-portal-values.yaml', { deployment: { sciencePortal: { gmsID } } });
    writeYaml('storage.yaml', { deployment: { storageUI: { gmsID } } });
    writeYaml('doi-values.yaml', { deployment: { doi: { gmsID } } });

    const { syncGmsId } = await import('../../src/services/bootstrap.service');
    const result = await syncGmsId();
    expect(result.status).toBe('skipped');
    expect(result.message).toContain('already');
  });
});

describe('syncDexBcryptHash', () => {
  it('replaces CHANGE_ME with a valid bcrypt hash', async () => {
    writeYaml('dex-values.yaml', {
      staticPasswords: [
        { email: 'admin@test.com', username: 'admin', userID: '1', hash: 'CHANGE_ME' },
      ],
    });

    const { syncDexBcryptHash } = await import('../../src/services/bootstrap.service');
    await syncDexBcryptHash();

    const data = readYaml('dex-values.yaml');
    const passwords = data.staticPasswords as Array<Record<string, string>>;
    expect(passwords[0]!.hash).toMatch(/^\$2[aby]\$/);
  });

  it('preserves valid bcrypt hashes', async () => {
    const validHash = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
    writeYaml('dex-values.yaml', {
      staticPasswords: [
        { email: 'admin@test.com', username: 'admin', userID: '1', hash: validHash },
      ],
    });

    const { syncDexBcryptHash } = await import('../../src/services/bootstrap.service');
    await syncDexBcryptHash();

    const data = readYaml('dex-values.yaml');
    const passwords = data.staticPasswords as Array<Record<string, string>>;
    expect(passwords[0]!.hash).toBe(validHash);
  });
});

describe('syncDbPasswords', () => {
  it('generates passwords for CHANGE_ME', async () => {
    writeYaml('posix-mapper-postgres.yaml', {
      postgres: { auth: { password: 'CHANGE_ME', username: 'pm', database: 'pmdb', schema: 'mapping' } },
    });
    writeYaml('cavern-values.yaml', {
      postgres: { auth: { password: 'CHANGE_ME' } },
    });

    const { syncDbPasswords } = await import('../../src/services/bootstrap.service');
    await syncDbPasswords();

    const pmDb = readYaml('posix-mapper-postgres.yaml');
    const cavern = readYaml('cavern-values.yaml');
    expect((pmDb.postgres as any).auth.password).not.toBe('CHANGE_ME');
    expect((cavern.postgres as any).auth.password).not.toBe('CHANGE_ME');
  });

  it('preserves valid passwords', async () => {
    writeYaml('posix-mapper-postgres.yaml', {
      postgres: { auth: { password: 'real-password' } },
    });

    const { syncDbPasswords } = await import('../../src/services/bootstrap.service');
    await syncDbPasswords();

    const data = readYaml('posix-mapper-postgres.yaml');
    expect((data.postgres as any).auth.password).toBe('real-password');
  });
});

describe('syncBaseTraefikConfig', () => {
  it('sets allowCrossNamespace to true', async () => {
    writeYaml('base-values.yaml', {});

    const { syncBaseTraefikConfig } = await import('../../src/services/bootstrap.service');
    await syncBaseTraefikConfig();

    const data = readYaml('base-values.yaml');
    expect((data.traefik as any).providers.kubernetesCRD.allowCrossNamespace).toBe(true);
  });

  it('is idempotent', async () => {
    writeYaml('base-values.yaml', {
      traefik: { providers: { kubernetesCRD: { allowCrossNamespace: true } } },
    });

    const { syncBaseTraefikConfig } = await import('../../src/services/bootstrap.service');
    await syncBaseTraefikConfig();

    const data = readYaml('base-values.yaml');
    expect((data.traefik as any).providers.kubernetesCRD.allowCrossNamespace).toBe(true);
  });
});

describe('syncUrlProtocol', () => {
  it('prepends https:// to URLs without protocol', async () => {
    writeYaml('skaha-values.yaml', {
      deployment: {
        skaha: {
          registryURL: 'my-host.example.com/reg',
          oidcURI: 'https://already-has-protocol.com/dex',
        },
      },
    });

    const { syncUrlProtocol } = await import('../../src/services/bootstrap.service');
    await syncUrlProtocol();

    const data = readYaml('skaha-values.yaml');
    expect((data.deployment as any).skaha.registryURL).toBe('https://my-host.example.com/reg');
    expect((data.deployment as any).skaha.oidcURI).toBe('https://already-has-protocol.com/dex');
  });
});

describe('syncStorageUiFeatureFlags', () => {
  it('sets feature flags on backend services', async () => {
    writeYaml('storage.yaml', {
      deployment: {
        storageUI: {
          backend: {
            services: {
              cavern: { name: 'cavern' },
            },
          },
        },
      },
    });

    const { syncStorageUiFeatureFlags } = await import('../../src/services/bootstrap.service');
    const result = await syncStorageUiFeatureFlags();

    expect(result.status).toBe('applied');
    const data = readYaml('storage.yaml');
    const features = (data.deployment as any).storageUI.backend.services.cavern.features;
    expect(features.batchDownload).toBe(true);
    expect(features.directDownload).toBe(true);
  });

  it('cleans stale top-level flags', async () => {
    writeYaml('storage.yaml', {
      deployment: {
        storageUI: {
          batchDownload: true,
          backend: { services: { cavern: {} } },
        },
      },
    });

    const { syncStorageUiFeatureFlags } = await import('../../src/services/bootstrap.service');
    await syncStorageUiFeatureFlags();

    const data = readYaml('storage.yaml');
    expect((data.deployment as any).storageUI.batchDownload).toBeUndefined();
  });

  it('skips when flags already set', async () => {
    const features = { batchDownload: true, batchUpload: true, externalLinks: true, paging: true, directDownload: true };
    writeYaml('storage.yaml', {
      deployment: {
        storageUI: {
          backend: { services: { cavern: { features } } },
        },
      },
    });

    const { syncStorageUiFeatureFlags } = await import('../../src/services/bootstrap.service');
    const result = await syncStorageUiFeatureFlags();
    expect(result.status).toBe('skipped');
  });
});

describe('syncOidcClientSecrets', () => {
  it('generates secrets for CHANGE_ME', async () => {
    writeYaml('dex-values.yaml', {
      staticClients: [
        { id: 'science-portal', secret: 'CHANGE_ME', redirectURIs: [] },
        { id: 'storage-ui', secret: 'CHANGE_ME', redirectURIs: [] },
      ],
    });
    writeYaml('science-portal-values.yaml', { deployment: { sciencePortal: { oidc: {} } } });
    writeYaml('skaha-values.yaml', { deployment: { skaha: { oidc: {} } } });
    writeYaml('storage.yaml', { deployment: { storageUI: { oidc: {} } } });

    const { syncOidcClientSecrets } = await import('../../src/services/bootstrap.service');
    const result = await syncOidcClientSecrets();

    expect(result.status).toBe('applied');
    const dex = readYaml('dex-values.yaml');
    const clients = dex.staticClients as Array<Record<string, unknown>>;
    expect(clients[0]!.secret).not.toBe('CHANGE_ME');
    expect((clients[0]!.secret as string).length).toBeGreaterThan(10);
  });

  it('skips when secrets already valid', async () => {
    const secret = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    writeYaml('dex-values.yaml', {
      staticClients: [
        { id: 'science-portal', secret, redirectURIs: [] },
      ],
    });
    writeYaml('science-portal-values.yaml', {
      deployment: { sciencePortal: { oidc: { clientSecret: secret } } },
    });
    writeYaml('skaha-values.yaml', {
      deployment: { skaha: { oidc: { clientSecret: secret } } },
    });

    const { syncOidcClientSecrets } = await import('../../src/services/bootstrap.service');
    const result = await syncOidcClientSecrets();
    expect(result.status).toBe('skipped');
  });
});

describe('syncDexRedirectUris', () => {
  it('collects callbackURI and redirectURI into Dex', async () => {
    writeYaml('dex-values.yaml', {
      staticClients: [
        { id: 'science-portal', secret: 'sec', redirectURIs: [] },
      ],
    });
    writeYaml('science-portal-values.yaml', {
      deployment: {
        sciencePortal: {
          oidc: {
            callbackURI: 'https://host/science-portal/oidc-callback',
            redirectURI: 'https://host/science-portal',
          },
        },
      },
    });
    writeYaml('skaha-values.yaml', {
      deployment: {
        skaha: {
          oidc: {
            callbackURI: 'https://host/skaha/oidc-callback',
            redirectURI: 'https://host/skaha',
          },
        },
      },
    });

    const { syncDexRedirectUris } = await import('../../src/services/bootstrap.service');
    const result = await syncDexRedirectUris();

    expect(result.status).toBe('applied');
    const dex = readYaml('dex-values.yaml');
    const client = (dex.staticClients as Array<Record<string, unknown>>)[0]!;
    const uris = client.redirectURIs as string[];
    expect(uris).toContain('https://host/science-portal/oidc-callback');
    expect(uris).toContain('https://host/science-portal');
    expect(uris).toContain('https://host/skaha/oidc-callback');
  });
});

describe('syncDexPreferredUsername', () => {
  it('sets preferredUsername from username', async () => {
    writeYaml('dex-values.yaml', {
      staticPasswords: [
        { email: 'admin@test.com', username: 'admin', userID: '1', hash: '$2a$10$abc' },
      ],
    });

    const { syncDexPreferredUsername } = await import('../../src/services/bootstrap.service');
    await syncDexPreferredUsername();

    const data = readYaml('dex-values.yaml');
    const passwords = data.staticPasswords as Array<Record<string, string>>;
    expect(passwords[0]!.preferredUsername).toBe('admin');
  });

  it('does not overwrite existing preferredUsername', async () => {
    writeYaml('dex-values.yaml', {
      staticPasswords: [
        { email: 'admin@test.com', username: 'admin', userID: '1', hash: '$2a$10$abc', preferredUsername: 'custom' },
      ],
    });

    const { syncDexPreferredUsername } = await import('../../src/services/bootstrap.service');
    await syncDexPreferredUsername();

    const data = readYaml('dex-values.yaml');
    const passwords = data.staticPasswords as Array<Record<string, string>>;
    expect(passwords[0]!.preferredUsername).toBe('custom');
  });
});

describe('syncRegistryEntries', () => {
  it('adds core service entries and GMS entry', async () => {
    writeYaml('reg-values.yaml', {
      global: { hostname: 'test.example.com' },
      application: { serviceEntries: [] },
    });

    const { syncRegistryEntries } = await import('../../src/services/bootstrap.service');
    await syncRegistryEntries();

    const data = readYaml('reg-values.yaml');
    const entries = (data.application as any).serviceEntries as Array<{ id: string; url: string }>;
    expect(entries.some(e => e.id === 'ivo://cadc.nrc.ca/skaha')).toBe(true);
    expect(entries.some(e => e.id === 'ivo://cadc.nrc.ca/cavern')).toBe(true);
    expect(entries.some(e => e.id === 'ivo://cadc.nrc.ca/posix-mapper')).toBe(true);
    expect(entries.some(e => e.id === 'ivo://cadc.nrc.ca/gms')).toBe(true);
  });

  it('does not duplicate existing entries', async () => {
    writeYaml('reg-values.yaml', {
      global: { hostname: 'test.example.com' },
      application: {
        serviceEntries: [
          { id: 'ivo://cadc.nrc.ca/skaha', url: 'https://test.example.com/skaha/capabilities' },
        ],
      },
    });

    const { syncRegistryEntries } = await import('../../src/services/bootstrap.service');
    await syncRegistryEntries();

    const data = readYaml('reg-values.yaml');
    const entries = (data.application as any).serviceEntries as Array<{ id: string }>;
    const skahaEntries = entries.filter(e => e.id === 'ivo://cadc.nrc.ca/skaha');
    expect(skahaEntries).toHaveLength(1);
  });
});
