import type { DeploymentPhase } from '@skaha-orc/shared';
import { PHASE_LABELS } from '@skaha-orc/shared';
import { cn } from '@/lib/utils';

const phaseStyles: Record<DeploymentPhase, string> = {
  not_installed: 'bg-gray-100 text-neutral-gray',
  pending: 'bg-gray-100 text-neutral-gray',
  deploying: 'bg-amber-100 text-amber-800 animate-pulse',
  deployed: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-blue-100 text-congress-blue',
  failed: 'bg-red-100 text-tall-poppy-red',
  uninstalling: 'bg-amber-100 text-amber-800 animate-pulse',
};

interface StatusBadgeProps {
  phase: DeploymentPhase;
  className?: string;
}

export function StatusBadge({ phase, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        phaseStyles[phase],
        className,
      )}
    >
      {PHASE_LABELS[phase]}
    </span>
  );
}
