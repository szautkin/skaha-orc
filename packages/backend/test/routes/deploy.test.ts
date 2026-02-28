import request from 'supertest';
import type { Express } from 'express';

jest.mock('execa', () => ({
  execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

jest.mock('../../src/swagger', () => ({
  swaggerSpec: {},
}));

const mockDeployAll = jest.fn().mockResolvedValue({
  currentService: null,
  completedServices: ['base'],
  failedServices: [],
  pendingServices: [],
  events: [],
});

jest.mock('../../src/services/deploy.service', () => ({
  deployAll: mockDeployAll,
  stopAll: jest.fn().mockResolvedValue({
    currentService: null, completedServices: [], failedServices: [], pendingServices: [], events: [],
  }),
  pauseAll: jest.fn().mockResolvedValue({
    currentService: null, completedServices: [], failedServices: [], pendingServices: [], events: [],
  }),
  resumeAll: jest.fn().mockResolvedValue({
    currentService: null, completedServices: [], failedServices: [], pendingServices: [], events: [],
  }),
}));

jest.mock('../../src/services/status.service', () => ({
  getAllStatuses: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/sse/event-bus', () => ({
  eventBus: { broadcast: jest.fn(), addClient: jest.fn() },
}));

jest.mock('../../src/services/bootstrap.service', () => ({
  injectCaCertIntoValues: jest.fn(),
  syncPosixMapperDbConfig: jest.fn().mockResolvedValue({ name: 'syncPosixMapperDbConfig', status: 'skipped' }),
  syncGmsId: jest.fn().mockResolvedValue({ name: 'syncGmsId', status: 'skipped' }),
  syncRegistryEntries: jest.fn(),
  syncDexPreferredUsername: jest.fn(),
  syncPosixMapperAuthorizedClients: jest.fn(),
  syncCavernRootOwner: jest.fn(),
  seedPosixMapperDb: jest.fn(),
  syncDexBcryptHash: jest.fn(),
  syncBaseTraefikConfig: jest.fn(),
  syncTraefikTlsCert: jest.fn(),
  syncTraefikClusterIp: jest.fn(),
  syncUrlProtocol: jest.fn(),
  loadKindImages: jest.fn(),
  syncOidcClientSecrets: jest.fn().mockResolvedValue({ name: 'syncOidcClientSecrets', status: 'skipped' }),
  syncDexRedirectUris: jest.fn().mockResolvedValue({ name: 'syncDexRedirectUris', status: 'skipped' }),
  syncDbPasswords: jest.fn(),
  syncStorageUiFeatureFlags: jest.fn().mockResolvedValue({ name: 'syncStorageUiFeatureFlags', status: 'skipped' }),
}));

jest.mock('../../src/services/helm.service', () => ({
  helmDeploy: jest.fn().mockResolvedValue({ success: true, output: 'deployed' }),
  helmUninstall: jest.fn().mockResolvedValue({ success: true, output: 'uninstalled' }),
}));

jest.mock('../../src/services/kubectl.service', () => ({
  scaleDeployment: jest.fn(),
  isServicePaused: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../src/services/haproxy.service', () => ({
  detectDeployMode: jest.fn().mockResolvedValue('kubernetes'),
  isHAProxyRunning: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../src/services/integration-test.service', () => ({
  runIntegrationTests: jest.fn(),
}));

let app: Express;

beforeEach(async () => {
  jest.clearAllMocks();
  const { createApp } = await import('../../src/app');
  app = createApp();
});

describe('POST /api/deploy-all', () => {
  it('deploys with valid service IDs', async () => {
    const res = await request(app)
      .post('/api/deploy-all')
      .send({ serviceIds: ['base'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDeployAll).toHaveBeenCalledWith(['base'], { dryRun: false });
  });

  it('returns 400 for empty serviceIds', async () => {
    const res = await request(app)
      .post('/api/deploy-all')
      .send({ serviceIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid service IDs', async () => {
    const res = await request(app)
      .post('/api/deploy-all')
      .send({ serviceIds: ['base', 'invalid-service'] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for no body', async () => {
    const res = await request(app)
      .post('/api/deploy-all')
      .send({});

    expect(res.status).toBe(400);
  });

  it('accepts dryRun parameter', async () => {
    const res = await request(app)
      .post('/api/deploy-all')
      .send({ serviceIds: ['base'], dryRun: true });

    expect(res.status).toBe(200);
    expect(mockDeployAll).toHaveBeenCalledWith(['base'], { dryRun: true });
  });
});

describe('POST /api/stop-all', () => {
  it('stops with valid service IDs', async () => {
    const res = await request(app)
      .post('/api/stop-all')
      .send({ serviceIds: ['base'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for invalid service IDs', async () => {
    const res = await request(app)
      .post('/api/stop-all')
      .send({ serviceIds: ['not-real'] });

    expect(res.status).toBe(400);
  });
});
