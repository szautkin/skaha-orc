import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw, Square, Server, ExternalLink, Lock, AlertTriangle } from 'lucide-react';
import type { ServiceWithStatus, ServiceId, DeploymentPhase, ReadinessLevel } from '@skaha-orc/shared';
import { PLATFORM_HOSTNAME, getUnmetDependencies, getRuntimeWarnings } from '@skaha-orc/shared';
import { StatusBadge } from './StatusBadge';
import { ReadinessDot } from './ReadinessDot';
import { useDeploy, usePause, useResume, useUninstall } from '@/hooks/use-services';
import { useConfigWarnings } from '@/hooks/use-config-warnings';
import { toast } from 'sonner';

interface ServiceCardProps {
  service: ServiceWithStatus;
  allServices: ServiceWithStatus[];
}

export function ServiceCard({ service, allServices }: ServiceCardProps) {
  const navigate = useNavigate();
  const deploy = useDeploy(service.id);
  const pause = usePause(service.id);
  const resume = useResume(service.id);
  const uninstall = useUninstall(service.id);
  const configWarnings = useConfigWarnings(service.id);

  const phase = service.status.phase;
  const isRunning = phase === 'deployed' || phase === 'healthy' || phase === 'waiting_ready';
  const isPaused = phase === 'paused';

  const phaseMap = useMemo(
    () => new Map<ServiceId, DeploymentPhase>(allServices.map((s) => [s.id, s.status.phase])),
    [allServices],
  );

  const unmetDeps = useMemo(
    () => getUnmetDependencies(service.id, phaseMap),
    [service.id, phaseMap],
  );

  const runtimeWarnings = useMemo(
    () => getRuntimeWarnings(service.id, phaseMap),
    [service.id, phaseMap],
  );

  const hasWarnings = (configWarnings.data?.warnings.length ?? 0) > 0;
  const hasRuntimeWarnings = runtimeWarnings.length > 0;
  const isBlocked = unmetDeps.length > 0;

  const readiness: ReadinessLevel = useMemo(() => {
    if (isBlocked) return 'blocked';
    if (phase === 'failed') return 'failed';
    if (phase === 'not_installed' || phase === 'pending') {
      return (hasWarnings || hasRuntimeWarnings) ? 'warnings' : 'idle';
    }
    if (phase === 'healthy' && !hasWarnings && !hasRuntimeWarnings) return 'healthy';
    if (isRunning && !hasWarnings && !hasRuntimeWarnings) return 'deployed';
    if (hasWarnings || hasRuntimeWarnings) return 'warnings';
    return 'idle';
  }, [phase, isBlocked, hasWarnings, hasRuntimeWarnings, isRunning]);

  const readinessTooltip = useMemo(() => {
    if (isBlocked) return `Requires: ${unmetDeps.map((d) => d.name).join(', ')} (not deployed)`;
    if (phase === 'failed') return 'Deployment failed';
    const parts: string[] = [];
    if (hasWarnings) parts.push(`${configWarnings.data?.warnings.length ?? 0} config warning(s)`);
    if (hasRuntimeWarnings) parts.push(runtimeWarnings.join('; '));
    if (parts.length > 0) return parts.join(' | ');
    if (phase === 'healthy') return 'Healthy';
    if (isRunning) return 'Deployed';
    return 'Ready to deploy';
  }, [phase, isBlocked, hasWarnings, hasRuntimeWarnings, isRunning, unmetDeps, configWarnings.data, runtimeWarnings]);

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 hover:border-congress-blue hover:shadow-sm transition-all cursor-pointer"
      onClick={() => navigate(service.id === 'haproxy' ? '/haproxy' : `/services/${service.id}`)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <ReadinessDot level={readiness} tooltip={readinessTooltip} />
          <Server className="w-4 h-4 text-congress-blue" />
          <h3 className="font-medium text-sm">{service.name}</h3>
          {hasWarnings && (
            <span title={`Config has ${configWarnings.data!.warnings.length} placeholder value(s)`}>
              <AlertTriangle className="w-3.5 h-3.5 text-buttercup-yellow" />
            </span>
          )}
        </div>
        <StatusBadge phase={phase} />
      </div>

      <p className="text-xs text-neutral-gray mb-3 line-clamp-2">{service.description}</p>

      <div className="flex items-center justify-between text-xs text-neutral-gray">
        <span>
          {service.status.podCount > 0
            ? `${service.status.readyPods}/${service.status.podCount} pods`
            : 'No pods'}
        </span>
        {service.status.revision && <span>Rev {service.status.revision}</span>}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isRunning && !isPaused && (
            <button
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                isBlocked
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-congress-blue hover:text-prussian-blue'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (isBlocked) return;
                deploy.mutate(false, {
                  onSuccess: () => toast.success(`${service.name} deployed`),
                  onError: (err) => toast.error(`Deploy failed: ${err.message}`),
                });
              }}
              disabled={deploy.isPending || isBlocked}
              title={
                isBlocked
                  ? `Requires: ${unmetDeps.map((d) => d.name).join(', ')} (not deployed)`
                  : undefined
              }
            >
              {isBlocked ? <Lock className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {deploy.isPending ? 'Deploying...' : 'Deploy'}
            </button>
          )}

          {isRunning && (
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-buttercup-yellow hover:text-amber-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                pause.mutate(undefined, {
                  onSuccess: () => toast.success(`${service.name} paused`),
                  onError: (err) => toast.error(`Pause failed: ${err.message}`),
                });
              }}
              disabled={pause.isPending}
            >
              <Pause className="w-3 h-3" />
              Pause
            </button>
          )}

          {isPaused && (
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-success-green hover:text-emerald-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                resume.mutate(undefined, {
                  onSuccess: () => toast.success(`${service.name} resumed`),
                  onError: (err) => toast.error(`Resume failed: ${err.message}`),
                });
              }}
              disabled={resume.isPending}
            >
              <RotateCcw className="w-3 h-3" />
              Resume
            </button>
          )}

          {(isRunning || isPaused) && (
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-tall-poppy-red hover:text-red-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                uninstall.mutate(undefined, {
                  onSuccess: () => toast.success(`${service.name} stopped`),
                  onError: (err) => toast.error(`Stop failed: ${err.message}`),
                });
              }}
              disabled={uninstall.isPending}
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          )}
        </div>

        {service.endpointPath &&
          (phase === 'deployed' || phase === 'healthy') && (
            <a
              href={`https://${PLATFORM_HOSTNAME}${service.endpointPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-congress-blue hover:text-prussian-blue transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              Open
            </a>
          )}
      </div>
    </div>
  );
}
