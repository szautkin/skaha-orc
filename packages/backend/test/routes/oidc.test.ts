import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';
import request from 'supertest';
import type { Express } from 'express';

// Must mock ESM-only deps before any module that transitively imports them
jest.mock('execa', () => ({
  execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

jest.mock('../../src/swagger', () => ({
  swaggerSpec: {},
}));

let tmpDir: string;
let app: Express;

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
        configPath: './haproxy/haproxy.cfg',
        binary: 'haproxy',
        dockerImage: 'haproxy:2.9-alpine',
        dockerContainerName: 'skaha-haproxy',
        k8sNamespace: 'skaha-system',
        k8sDeploymentName: 'haproxy',
      },
      kubernetes: { context: '', kubeconfig: '' },
    },
    valuesFilePath: (filename: string) => {
      if (filename.includes('..') || filename.includes('/')) {
        throw new Error(`Invalid values filename: ${filename}`);
      }
      const { resolve } = require('path');
      return resolve(dir, filename);
    },
  }));
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'oidc-test-'));
  jest.resetModules();

  jest.doMock('execa', () => ({
    execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  }));
  jest.doMock('../../src/swagger', () => ({
    swaggerSpec: {},
  }));
  mockConfig(tmpDir);

  const { createApp } = await import('../../src/app');
  app = createApp();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

function writeYaml(filename: string, data: Record<string, unknown>): void {
  writeFileSync(join(tmpDir, filename), yaml.dump(data));
}

describe('GET /api/oidc/settings', () => {
  it('returns issuerUri from first available service + client configs', async () => {
    writeYaml('posix-mapper-values.yaml', {
      deployment: { posixMapper: { oidcURI: 'https://dex.example.com' } },
    });
    writeYaml('science-portal-values.yaml', {
      deployment: {
        sciencePortal: {
          oidc: {
            uri: 'https://dex.example.com',
            clientID: 'sp-id',
            clientSecret: 'sp-secret',
            redirectURI: 'https://example.com/r',
            callbackURI: 'https://example.com/c',
            scope: 'openid',
          },
        },
      },
    });
    writeYaml('storage.yaml', {
      deployment: {
        storageUI: {
          oidc: {
            uri: 'https://dex.example.com',
            clientID: 'su-id',
            clientSecret: 'su-secret',
            redirectURI: 'https://example.com/su-r',
            callbackURI: 'https://example.com/su-c',
            scope: 'openid profile',
          },
        },
      },
    });

    const res = await request(app).get('/api/oidc/settings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.issuerUri).toBe('https://dex.example.com');
    expect(res.body.data.sciencePortal.clientID).toBe('sp-id');
    expect(res.body.data.storageUi.clientID).toBe('su-id');
  });

  it('returns empty strings when no values files exist', async () => {
    const res = await request(app).get('/api/oidc/settings');
    expect(res.status).toBe(200);
    expect(res.body.data.issuerUri).toBe('');
    expect(res.body.data.sciencePortal.clientID).toBe('');
    expect(res.body.data.storageUi.clientID).toBe('');
  });
});

describe('PUT /api/oidc/settings', () => {
  const validPayload = {
    issuerUri: 'https://keycloak.example.com/realms/test',
    sciencePortal: {
      clientID: 'sp-client',
      clientSecret: 'sp-secret',
      redirectURI: 'https://example.com/sp-redirect',
      callbackURI: 'https://example.com/sp-callback',
      scope: 'openid profile',
    },
    storageUi: {
      clientID: 'su-client',
      clientSecret: 'su-secret',
      redirectURI: 'https://example.com/su-redirect',
      callbackURI: 'https://example.com/su-callback',
      scope: 'openid',
    },
    skaha: {
      clientID: 'skaha-client',
      clientSecret: 'skaha-secret',
      redirectURI: 'https://example.com/skaha-redirect',
      callbackURI: 'https://example.com/skaha-callback',
      scope: 'openid profile offline_access',
    },
  };

  it('writes issuerUri to service files and returns updated count', async () => {
    writeYaml('posix-mapper-values.yaml', {});
    writeYaml('skaha-values.yaml', {});
    writeYaml('cavern-values.yaml', {});
    writeYaml('science-portal-values.yaml', {});
    writeYaml('storage.yaml', {});

    const res = await request(app)
      .put('/api/oidc/settings')
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated).toBeGreaterThanOrEqual(5);
  });

  it('returns 400 for invalid input', async () => {
    const res = await request(app)
      .put('/api/oidc/settings')
      .send({ issuerUri: 'not-a-url' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('round-trips: PUT then GET returns matching data', async () => {
    writeYaml('posix-mapper-values.yaml', {});
    writeYaml('skaha-values.yaml', {});
    writeYaml('cavern-values.yaml', {});
    writeYaml('science-portal-values.yaml', {});
    writeYaml('storage.yaml', {});

    await request(app).put('/api/oidc/settings').send(validPayload);

    const res = await request(app).get('/api/oidc/settings');
    expect(res.body.data.issuerUri).toBe(validPayload.issuerUri);
    expect(res.body.data.sciencePortal.clientID).toBe(validPayload.sciencePortal.clientID);
    expect(res.body.data.storageUi.scope).toBe(validPayload.storageUi.scope);
  });
});
