import { useState, useMemo } from 'react';
import { Play, Loader2, AlertTriangle, Lock } from 'lucide-react';
import type { ServiceId, DeploymentProfileId, DeploymentPhase } from '@skaha-orc/shared';
import {
  SERVICE_CATALOG,
  SERVICE_IDS,
  DEPLOYMENT_PROFILES,
  TIER_ORDER,
  TIER_LABELS,
  getDeploymentOrder,
  getServicesByTier,
} from '@skaha-orc/shared';
import { useDeployAll } from '@/hooks/use-deploy';
import { useServicesLive } from '@/hooks/use-services-live';
import { DeployProgress } from './DeployProgress';
import { LogStream } from './LogStream';

function setsEqual(a: Set<ServiceId>, b: Set<ServiceId>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

const RUNNING_PHASES: ReadonlySet<DeploymentPhase> = new Set([
  'deployed',
  'healthy',
  'waiting_ready',
]);

export function DeployWizard() {
  const standardProfile = DEPLOYMENT_PROFILES.find((p) => p.id === 'standard')!;
  const [selected, setSelected] = useState<Set<ServiceId>>(
    new Set(standardProfile.serviceIds),
  );
  const [dryRun, setDryRun] = useState(false);
  const deployAll = useDeployAll();
  const { data: allServices } = useServicesLive();

  const servicesByTier = useMemo(() => getServicesByTier(), []);

  const activeProfile = useMemo((): DeploymentProfileId | 'custom' => {
    for (const profile of DEPLOYMENT_PROFILES) {
      if (setsEqual(selected, new Set(profile.serviceIds))) {
        return profile.id;
      }
    }
    return 'custom';
  }, [selected]);

  const order = getDeploymentOrder([...selected]);

  // Compute external unmet deps: deps not in selected set AND not already deployed
  const externalUnmetDeps = useMemo(() => {
    const phaseMap = new Map<ServiceId, DeploymentPhase>(
      (allServices ?? []).map((s) => [s.id, s.status.phase]),
    );
    const result: { serviceId: ServiceId; serviceName: string; depId: ServiceId; depName: string }[] = [];
    for (const id of selected) {
      const deps = SERVICE_CATALOG[id]?.dependencies ?? [];
      for (const depId of deps) {
        if (selected.has(depId)) continue;
        const phase = phaseMap.get(depId);
        if (!phase || !RUNNING_PHASES.has(phase)) {
          result.push({
            serviceId: id,
            serviceName: SERVICE_CATALOG[id].name,
            depId,
            depName: SERVICE_CATALOG[depId].name,
          });
        }
      }
    }
    return result;
  }, [selected, allServices]);

  const hasUnmetDeps = externalUnmetDeps.length > 0;
  const missingDepNames = [...new Set(externalUnmetDeps.map((d) => d.depName))];

  const toggle = (id: ServiceId) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const selectProfile = (profileId: DeploymentProfileId) => {
    const profile = DEPLOYMENT_PROFILES.find((p) => p.id === profileId);
    if (profile) setSelected(new Set(profile.serviceIds));
  };

  const handleStart = () => {
    deployAll.mutate({ serviceIds: [...selected], dryRun });
  };

  const isRunning = deployAll.isPending || deployAll.isStreaming;

  return (
    <div className="grid grid-cols-3 gap-6 h-full">
      {/* Left: Controls + Stepper */}
      <div className="space-y-6">
        {/* Profile selector */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Deployment Profile</h3>
          <div className="flex gap-2 flex-wrap">
            {DEPLOYMENT_PROFILES.map((profile) => (
              <button
                key={profile.id}
                disabled={isRunning}
                onClick={() => selectProfile(profile.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeProfile === profile.id
                    ? 'bg-congress-blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } disabled:opacity-50`}
                title={profile.description}
              >
                {profile.name}
              </button>
            ))}
            <span
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                activeProfile === 'custom'
                  ? 'bg-buttercup-yellow text-white'
                  : 'bg-gray-50 text-gray-400'
              }`}
            >
              Custom
            </span>
          </div>
        </div>

        {/* Tier-grouped service selection */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Services</h3>
          <div className="space-y-4">
            {TIER_ORDER.map((tier) => (
              <div key={tier}>
                <p className="text-xs font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                  {TIER_LABELS[tier]}
                </p>
                <div className="space-y-1.5 pl-1">
                  {servicesByTier[tier].map((id) => {
                    const def = SERVICE_CATALOG[id];
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggle(id)}
                          disabled={isRunning}
                          className="rounded border-gray-300 text-congress-blue focus:ring-congress-blue"
                        />
                        <span>{def.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={isRunning}
              className="rounded border-gray-300 text-congress-blue focus:ring-congress-blue"
            />
            Dry run (simulate only)
          </label>
        </div>

        {/* Missing dependency warning */}
        {hasUnmetDeps && (
          <div className="flex items-start gap-2 bg-amber-50 border border-buttercup-yellow rounded-md p-3 text-sm text-amber-800">
            <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              The following dependencies are required but not selected or deployed:{' '}
              <span className="font-medium">{missingDepNames.join(', ')}</span>
            </span>
          </div>
        )}

        {/* Mutual exclusion warning */}
        {selected.has('dex') && selected.has('keycloak') && (
          <div className="flex items-start gap-2 bg-amber-50 border border-buttercup-yellow rounded-md p-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Both Dex and Keycloak are selected. Typically you only need one identity provider. Use Dex for dev/demo or Keycloak for production.</span>
          </div>
        )}

        {/* Start button */}
        <button
          className="w-full flex items-center justify-center gap-2 bg-congress-blue text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
          onClick={handleStart}
          disabled={isRunning || selected.size === 0 || hasUnmetDeps}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Deploying...
            </>
          ) : hasUnmetDeps ? (
            <>
              <Lock className="w-4 h-4" />
              Missing Dependencies
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Deploy
            </>
          )}
        </button>

        {/* Progress stepper */}
        {(isRunning || deployAll.events.length > 0) && (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Progress</h3>
            <DeployProgress order={order} events={deployAll.events} />
          </div>
        )}
      </div>

      {/* Right: Log stream */}
      <div className="col-span-2">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Deploy Log</h3>
        <LogStream events={deployAll.events} />
      </div>
    </div>
  );
}
