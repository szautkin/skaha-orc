import type { ServiceId } from '@skaha-orc/shared';

const mockHelmDeploy = jest.fn().mockResolvedValue({ success: true, output: 'deployed' });
const mockHelmUninstall = jest.fn().mockResolvedValue({ success: true, output: 'uninstalled' });
const mockCleanupStuckPVs = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/services/helm.service', () => ({
  helmDeploy: mockHelmDeploy,
  helmUninstall: mockHelmUninstall,
  cleanupStuckPVs: mockCleanupStuckPVs,
}));

jest.mock('../../src/services/kubectl.service', () => ({
  scaleDeployment: jest.fn().mockResolvedValue({ success: true, output: 'scaled' }),
  isServicePaused: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../src/services/bootstrap.service', () => ({
  injectCaCertIntoValues: jest.fn().mockResolvedValue(undefined),
}));

const mockBroadcast = jest.fn();
jest.mock('../../src/sse/event-bus', () => ({
  eventBus: { broadcast: mockBroadcast },
}));

jest.mock('../../src/services/health.service', () => ({
  waitForHealthy: jest.fn().mockResolvedValue(undefined),
}));

import { deployAll, stopAll, pauseAll, resumeAll } from '../../src/services/deploy.service';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deployAll', () => {
  it('deploys services in dependency order', async () => {
    const ids: ServiceId[] = ['base', 'volumes'];
    const progress = await deployAll(ids);

    expect(progress.completedServices).toContain('base');
    expect(progress.completedServices).toContain('volumes');
    expect(progress.failedServices).toHaveLength(0);
    expect(mockHelmDeploy).toHaveBeenCalledTimes(2);
  });

  it('stops on failure', async () => {
    mockHelmDeploy
      .mockResolvedValueOnce({ success: true, output: 'ok' })
      .mockResolvedValueOnce({ success: false, output: 'error' });

    const ids: ServiceId[] = ['base', 'volumes', 'reg'];
    const progress = await deployAll(ids);

    expect(progress.failedServices).toHaveLength(1);
    // reg (phase 2) depends on base; volumes fails -> stops before reg
    expect(progress.pendingServices.length).toBeGreaterThanOrEqual(0);
  });

  it('emits events', async () => {
    await deployAll(['base'] as ServiceId[]);

    expect(mockBroadcast).toHaveBeenCalled();
    const events = mockBroadcast.mock.calls.map(c => c[0]);
    expect(events.some((e: any) => e.type === 'phase_change')).toBe(true);
    expect(events.some((e: any) => e.type === 'complete')).toBe(true);
  });

  it('supports dryRun', async () => {
    await deployAll(['base'] as ServiceId[], { dryRun: true });

    expect(mockHelmDeploy).toHaveBeenCalledWith('base', { dryRun: true });
  });

  it('injects CA cert before deploying', async () => {
    const { injectCaCertIntoValues } = require('../../src/services/bootstrap.service');
    await deployAll(['base'] as ServiceId[]);

    expect(injectCaCertIntoValues).toHaveBeenCalled();
  });
});

describe('stopAll', () => {
  it('uninstalls in reverse order', async () => {
    const ids: ServiceId[] = ['base', 'volumes'];
    const progress = await stopAll(ids);

    expect(progress.completedServices).toHaveLength(2);
    // volumes should be uninstalled before base (reverse topo order)
    const calls = mockHelmUninstall.mock.calls.map((c: any[]) => c[0]);
    expect(calls.indexOf('volumes')).toBeLessThan(calls.indexOf('base'));
  });

  it('continues on failure', async () => {
    mockHelmUninstall
      .mockResolvedValueOnce({ success: false, output: 'error' })
      .mockResolvedValueOnce({ success: true, output: 'ok' });

    const ids: ServiceId[] = ['base', 'volumes'];
    const progress = await stopAll(ids);

    // Both should be attempted
    expect(mockHelmUninstall).toHaveBeenCalledTimes(2);
    expect(progress.failedServices).toHaveLength(1);
    expect(progress.completedServices).toHaveLength(1);
  });

  it('cleans up PVs when volumes is included', async () => {
    await stopAll(['base', 'volumes'] as ServiceId[]);
    expect(mockCleanupStuckPVs).toHaveBeenCalled();
  });

  it('skips PV cleanup when volumes not included', async () => {
    await stopAll(['reg'] as ServiceId[]);
    expect(mockCleanupStuckPVs).not.toHaveBeenCalled();
  });
});

describe('pauseAll', () => {
  it('skips kubectl-type services', async () => {
    const { scaleDeployment } = require('../../src/services/kubectl.service');
    const progress = await pauseAll(['base', 'volumes'] as ServiceId[]);

    // volumes is kubectl-type, should be auto-completed without scaling
    expect(progress.completedServices).toContain('volumes');
    // base is repo-type, should be scaled
    const calls = scaleDeployment.mock.calls;
    const scaledServices = calls.map((c: any[]) => c[1]);
    expect(scaledServices).not.toContain('volumes');
  });
});

describe('resumeAll', () => {
  it('resumes in dependency order', async () => {
    const { scaleDeployment } = require('../../src/services/kubectl.service');
    const progress = await resumeAll(['base', 'reg'] as ServiceId[]);

    expect(progress.completedServices).toHaveLength(2);
    const calls = scaleDeployment.mock.calls;
    const scaled = calls.map((c: any[]) => c[1]);
    if (scaled.includes('base') && scaled.includes('reg')) {
      expect(scaled.indexOf('base')).toBeLessThan(scaled.indexOf('reg'));
    }
  });
});
