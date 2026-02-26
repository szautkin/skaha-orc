import { useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw, Square, Server, ExternalLink } from 'lucide-react';
import type { ServiceWithStatus } from '@skaha-orc/shared';
import { PLATFORM_HOSTNAME } from '@skaha-orc/shared';
import { StatusBadge } from './StatusBadge';
import { useDeploy, usePause, useResume, useUninstall } from '@/hooks/use-services';
import { toast } from 'sonner';

interface ServiceCardProps {
  service: ServiceWithStatus;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const navigate = useNavigate();
  const deploy = useDeploy(service.id);
  const pause = usePause(service.id);
  const resume = useResume(service.id);
  const uninstall = useUninstall(service.id);

  const phase = service.status.phase;
  const isRunning = phase === 'deployed' || phase === 'healthy' || phase === 'waiting_ready';
  const isPaused = phase === 'paused';

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 hover:border-congress-blue hover:shadow-sm transition-all cursor-pointer"
      onClick={() => navigate(service.id === 'haproxy' ? '/haproxy' : `/services/${service.id}`)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-congress-blue" />
          <h3 className="font-medium text-sm">{service.name}</h3>
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
              className="flex items-center gap-1.5 text-xs font-medium text-congress-blue hover:text-prussian-blue transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                deploy.mutate(false, {
                  onSuccess: () => toast.success(`${service.name} deployed`),
                  onError: (err) => toast.error(`Deploy failed: ${err.message}`),
                });
              }}
              disabled={deploy.isPending}
            >
              <Play className="w-3 h-3" />
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
