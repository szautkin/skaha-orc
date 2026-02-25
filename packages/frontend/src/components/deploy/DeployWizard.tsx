import { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import type { ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS, getDeploymentOrder } from '@skaha-orc/shared';
import { useDeployAll } from '@/hooks/use-deploy';
import { DeployProgress } from './DeployProgress';
import { LogStream } from './LogStream';

export function DeployWizard() {
  const [selected, setSelected] = useState<Set<ServiceId>>(
    new Set(SERVICE_IDS.filter((id) => !SERVICE_CATALOG[id].optional)),
  );
  const [dryRun, setDryRun] = useState(false);
  const deployAll = useDeployAll();

  const order = getDeploymentOrder([...selected]);

  const toggle = (id: ServiceId) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const handleStart = () => {
    deployAll.mutate({ serviceIds: [...selected], dryRun });
  };

  const isRunning = deployAll.isPending || deployAll.isStreaming;

  return (
    <div className="grid grid-cols-3 gap-6 h-full">
      {/* Left: Controls + Stepper */}
      <div className="space-y-6">
        {/* Service selection */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Services</h3>
          <div className="space-y-2">
            {SERVICE_IDS.map((id) => {
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
                  <span className={def.optional ? 'text-neutral-gray' : ''}>
                    {def.name}
                    {def.optional && ' (optional)'}
                  </span>
                </label>
              );
            })}
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

        {/* Start button */}
        <button
          className="w-full flex items-center justify-center gap-2 bg-congress-blue text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
          onClick={handleStart}
          disabled={isRunning || selected.size === 0}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Deploying...
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
