import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';

let tmpDir: string;
let mockExeca: jest.Mock;

jest.mock('../../src/swagger', () => ({
  swaggerSpec: {},
}));

function mockConfig(dir: string) {
  jest.doMock('../../src/config', () => ({
    config: {
      helmConfigDir: dir,
      port: 3001,
      chartBaseDir: join(dir, 'charts'),
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

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'helm-test-'));
  jest.resetModules();

  mockExeca = jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  // Create a process-like mock object for helmDeploy
  const execaMock = jest.fn().mockImplementation(() => {
    const proc = Promise.resolve({ stdout: 'deployed', stderr: '', exitCode: 0 });
    (proc as any).stdout = { on: jest.fn() };
    (proc as any).stderr = { on: jest.fn() };
    return proc;
  });
  jest.doMock('execa', () => ({ execa: execaMock }));
  jest.doMock('../../src/swagger', () => ({ swaggerSpec: {} }));
  jest.doMock('../../src/sse/event-bus', () => ({
    eventBus: { broadcast: jest.fn() },
  }));
  jest.doMock('../../src/services/health.service', () => ({
    waitForHealthy: jest.fn().mockResolvedValue(undefined),
  }));
  jest.doMock('../../src/services/haproxy.service', () => ({
    isHAProxyRunning: jest.fn().mockResolvedValue(false),
    isHAProxyPaused: jest.fn().mockResolvedValue(false),
    deployHAProxy: jest.fn().mockResolvedValue('deployed'),
    stopHAProxy: jest.fn().mockResolvedValue('stopped'),
    detectDeployMode: jest.fn().mockResolvedValue('kubernetes'),
  }));
  jest.doMock('../../src/services/bootstrap.service', () => ({
    fixCavernDirPermissions: jest.fn().mockResolvedValue(undefined),
    provisionCavernHomeDirs: jest.fn().mockResolvedValue(undefined),
  }));
  mockConfig(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('helmList', () => {
  it('returns parsed releases', async () => {
    const mockReleases = [{ name: 'base', namespace: 'default', status: 'deployed' }];
    jest.resetModules();
    jest.doMock('execa', () => ({
      execa: jest.fn().mockResolvedValue({ stdout: JSON.stringify(mockReleases), stderr: '' }),
    }));
    jest.doMock('../../src/swagger', () => ({ swaggerSpec: {} }));
    jest.doMock('../../src/sse/event-bus', () => ({ eventBus: { broadcast: jest.fn() } }));
    jest.doMock('../../src/services/health.service', () => ({ waitForHealthy: jest.fn() }));
    jest.doMock('../../src/services/haproxy.service', () => ({
      isHAProxyRunning: jest.fn(), isHAProxyPaused: jest.fn(),
      deployHAProxy: jest.fn(), stopHAProxy: jest.fn(), detectDeployMode: jest.fn(),
    }));
    jest.doMock('../../src/services/bootstrap.service', () => ({
      fixCavernDirPermissions: jest.fn(), provisionCavernHomeDirs: jest.fn(),
    }));
    mockConfig(tmpDir);

    const { helmList } = await import('../../src/services/helm.service');
    const releases = await helmList();
    expect(releases).toHaveLength(1);
    expect(releases[0]!.name).toBe('base');
  });

  it('returns empty array on error', async () => {
    jest.resetModules();
    jest.doMock('execa', () => ({
      execa: jest.fn().mockRejectedValue(new Error('connection refused')),
    }));
    jest.doMock('../../src/swagger', () => ({ swaggerSpec: {} }));
    jest.doMock('../../src/sse/event-bus', () => ({ eventBus: { broadcast: jest.fn() } }));
    jest.doMock('../../src/services/health.service', () => ({ waitForHealthy: jest.fn() }));
    jest.doMock('../../src/services/haproxy.service', () => ({
      isHAProxyRunning: jest.fn(), isHAProxyPaused: jest.fn(),
      deployHAProxy: jest.fn(), stopHAProxy: jest.fn(), detectDeployMode: jest.fn(),
    }));
    jest.doMock('../../src/services/bootstrap.service', () => ({
      fixCavernDirPermissions: jest.fn(), provisionCavernHomeDirs: jest.fn(),
    }));
    mockConfig(tmpDir);

    const { helmList } = await import('../../src/services/helm.service');
    const releases = await helmList();
    expect(releases).toEqual([]);
  });
});

describe('helmStatus', () => {
  it('returns status from JSON response', async () => {
    jest.resetModules();
    jest.doMock('execa', () => ({
      execa: jest.fn().mockResolvedValue({
        stdout: JSON.stringify({ info: { status: 'deployed' } }),
        stderr: '',
      }),
    }));
    jest.doMock('../../src/swagger', () => ({ swaggerSpec: {} }));
    jest.doMock('../../src/sse/event-bus', () => ({ eventBus: { broadcast: jest.fn() } }));
    jest.doMock('../../src/services/health.service', () => ({ waitForHealthy: jest.fn() }));
    jest.doMock('../../src/services/haproxy.service', () => ({
      isHAProxyRunning: jest.fn(), isHAProxyPaused: jest.fn(),
      deployHAProxy: jest.fn(), stopHAProxy: jest.fn(), detectDeployMode: jest.fn(),
    }));
    jest.doMock('../../src/services/bootstrap.service', () => ({
      fixCavernDirPermissions: jest.fn(), provisionCavernHomeDirs: jest.fn(),
    }));
    mockConfig(tmpDir);

    const { helmStatus } = await import('../../src/services/helm.service');
    const status = await helmStatus('base', 'default');
    expect(status).toBe('deployed');
  });

  it('returns null on error', async () => {
    jest.resetModules();
    jest.doMock('execa', () => ({
      execa: jest.fn().mockRejectedValue(new Error('release not found')),
    }));
    jest.doMock('../../src/swagger', () => ({ swaggerSpec: {} }));
    jest.doMock('../../src/sse/event-bus', () => ({ eventBus: { broadcast: jest.fn() } }));
    jest.doMock('../../src/services/health.service', () => ({ waitForHealthy: jest.fn() }));
    jest.doMock('../../src/services/haproxy.service', () => ({
      isHAProxyRunning: jest.fn(), isHAProxyPaused: jest.fn(),
      deployHAProxy: jest.fn(), stopHAProxy: jest.fn(), detectDeployMode: jest.fn(),
    }));
    jest.doMock('../../src/services/bootstrap.service', () => ({
      fixCavernDirPermissions: jest.fn(), provisionCavernHomeDirs: jest.fn(),
    }));
    mockConfig(tmpDir);

    const { helmStatus } = await import('../../src/services/helm.service');
    const status = await helmStatus('missing', 'default');
    expect(status).toBeNull();
  });
});

describe('helmUninstall', () => {
  it('treats "not found" as success', async () => {
    jest.resetModules();
    const err = new Error('release: not found') as any;
    err.stderr = 'Error: release: not found';
    err.stdout = '';
    jest.doMock('execa', () => ({
      execa: jest.fn().mockRejectedValue(err),
    }));
    jest.doMock('../../src/swagger', () => ({ swaggerSpec: {} }));
    jest.doMock('../../src/sse/event-bus', () => ({ eventBus: { broadcast: jest.fn() } }));
    jest.doMock('../../src/services/health.service', () => ({ waitForHealthy: jest.fn() }));
    jest.doMock('../../src/services/haproxy.service', () => ({
      isHAProxyRunning: jest.fn(), isHAProxyPaused: jest.fn(),
      deployHAProxy: jest.fn(), stopHAProxy: jest.fn(), detectDeployMode: jest.fn(),
    }));
    jest.doMock('../../src/services/bootstrap.service', () => ({
      fixCavernDirPermissions: jest.fn(), provisionCavernHomeDirs: jest.fn(),
    }));
    mockConfig(tmpDir);

    const { helmUninstall } = await import('../../src/services/helm.service');
    const result = await helmUninstall('reg' as any);
    expect(result.success).toBe(true);
  });
});

describe('helmDeploy', () => {
  it('handles haproxy type via deployHAProxy', async () => {
    const { helmDeploy } = await import('../../src/services/helm.service');
    const result = await helmDeploy('haproxy' as any);
    expect(result.success).toBe(true);
  });
});
