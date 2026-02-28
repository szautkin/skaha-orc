import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';
import request from 'supertest';
import type { Express } from 'express';

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
      const { resolve } = require('path');
      return resolve(dir, filename);
    },
  }));
}

function writeYaml(filename: string, data: Record<string, unknown>): void {
  writeFileSync(join(tmpDir, filename), yaml.dump(data));
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'services-test-'));
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

describe('GET /api/services', () => {
  it('returns all 14 services', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(14);
  });

  it('includes mock-ac in the service list', async () => {
    const res = await request(app).get('/api/services');
    const ids = res.body.data.map((s: any) => s.id);
    expect(ids).toContain('mock-ac');
  });
});

describe('GET /api/services/:id/config', () => {
  it('returns config for a known service', async () => {
    writeYaml('base-values.yaml', { traefik: { replicas: 1 } });

    const res = await request(app).get('/api/services/base/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.traefik).toBeDefined();
  });

  it('returns 404 for unknown service', async () => {
    const res = await request(app).get('/api/services/unknown/config');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/services/:id/config', () => {
  it('updates config for a known service', async () => {
    writeYaml('base-values.yaml', { traefik: { replicas: 1 } });

    const res = await request(app)
      .put('/api/services/base/config')
      .send({ config: { traefik: { replicas: 2 } } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 for unknown service', async () => {
    const res = await request(app)
      .put('/api/services/unknown/config')
      .send({ config: {} });

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .put('/api/services/base/config')
      .send({ notConfig: {} });

    expect(res.status).toBe(400);
  });
});
