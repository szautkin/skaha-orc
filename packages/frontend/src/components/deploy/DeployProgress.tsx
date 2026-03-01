import { Check, X, Loader2, Circle } from 'lucide-react';
import type { ServiceId, DeploymentEvent } from '@skaha-orc/shared';
import { SERVICE_CATALOG, DEPLOY_PHASE_LABELS, DEPLOY_PHASE_ORDER } from '@skaha-orc/shared';

interface DeployProgressProps {
  order: ServiceId[];
  events: DeploymentEvent[];
}

function getStepStatus(
  serviceId: ServiceId,
  events: DeploymentEvent[],
): 'pending' | 'deploying' | 'success' | 'failed' {
  const serviceEvents = events.filter((e) => e.serviceId === serviceId);
  const lastPhaseEvent = [...serviceEvents].reverse().find((e) => e.type === 'phase_change' || e.type === 'error');

  if (!lastPhaseEvent) return 'pending';
  if (lastPhaseEvent.phase === 'deployed' || lastPhaseEvent.phase === 'healthy') return 'success';
  if (lastPhaseEvent.phase === 'failed' || lastPhaseEvent.type === 'error') return 'failed';
  if (lastPhaseEvent.phase === 'deploying' || lastPhaseEvent.phase === 'waiting_ready') return 'deploying';
  return 'pending';
}

export function DeployProgress({ order, events }: DeployProgressProps) {
  const phaseGroups = DEPLOY_PHASE_ORDER.map((phase) => {
    const services = order.filter((id) => {
      const def = SERVICE_CATALOG[id];
      return def && def.deployPhase === phase;
    });
    return { phase, services };
  }).filter((g) => g.services.length > 0);

  let stepIndex = 0;

  return (
    <div className="space-y-3">
      {phaseGroups.map(({ phase, services }) => (
        <div key={phase}>
          <p className="text-xs font-semibold text-neutral-gray uppercase tracking-wider mb-1.5">
            Phase {phase}: {DEPLOY_PHASE_LABELS[phase]}
          </p>
          <div className="space-y-1 pl-1">
            {services.map((serviceId) => {
              const def = SERVICE_CATALOG[serviceId];
              const status = getStepStatus(serviceId, events);
              const currentStep = ++stepIndex;

              return (
                <div key={serviceId} className="flex items-center gap-3 py-1.5">
                  <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                    {status === 'success' && (
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                    )}
                    {status === 'failed' && (
                      <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                        <X className="w-3.5 h-3.5 text-tall-poppy-red" />
                      </div>
                    )}
                    {status === 'deploying' && (
                      <Loader2 className="w-5 h-5 animate-spin text-buttercup-yellow" />
                    )}
                    {status === 'pending' && <Circle className="w-4 h-4 text-gray-300" />}
                  </div>

                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        status === 'pending'
                          ? 'text-neutral-gray'
                          : status === 'failed'
                            ? 'text-tall-poppy-red'
                            : 'text-gray-900'
                      }`}
                    >
                      {currentStep}. {def.name}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
