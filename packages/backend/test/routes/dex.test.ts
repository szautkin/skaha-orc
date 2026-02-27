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
      if (filename.includes('..') || filename.includes('/')) {
        throw new Error(`Invalid values filename: ${filename}`);
      }
      const { resolve } = require('path');
      return resolve(dir, filename);
    },
  }));
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'dex-test-'));
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

describe('GET /api/dex/users', () => {
  it('returns staticPasswords from dex-values.yaml', async () => {
    writeYaml('dex-values.yaml', {
      staticPasswords: [
        { email: 'admin@example.com', username: 'admin', userID: '1', hash: '$2a$10$abc' },
      ],
    });

    const res = await request(app).get('/api/dex/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('admin@example.com');
  });

  it('returns empty array when no staticPasswords', async () => {
    writeYaml('dex-values.yaml', { issuer: 'https://dex.example.com' });

    const res = await request(app).get('/api/dex/users');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('PUT /api/dex/users', () => {
  it('saves valid users and returns 200', async () => {
    writeYaml('dex-values.yaml', {});

    const users = [
      { email: 'user@test.com', username: 'user', userID: 'u1', hash: '$2a$10$xyz' },
    ];

    const res = await request(app)
      .put('/api/dex/users')
      .send({ users });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .put('/api/dex/users')
      .send({ notUsers: [] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for user missing required fields', async () => {
    writeYaml('dex-values.yaml', {});

    const res = await request(app)
      .put('/api/dex/users')
      .send({ users: [{ email: 'test@test.com' }] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('round-trip: PUT then GET returns same data', async () => {
    writeYaml('dex-values.yaml', {});

    const users = [
      { email: 'a@b.com', username: 'ab', userID: 'id1', hash: '$2a$10$hash1' },
      { email: 'c@d.com', username: 'cd', userID: 'id2', hash: '$2a$10$hash2' },
    ];

    await request(app).put('/api/dex/users').send({ users });

    const res = await request(app).get('/api/dex/users');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].email).toBe('a@b.com');
    expect(res.body.data[1].email).toBe('c@d.com');
  });
});
