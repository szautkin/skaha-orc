import { useNavigate } from 'react-router-dom';
import { Play, Pause, Square, RotateCcw, Loader2 } from 'lucide-react';
import { SERVICE_IDS } from '@skaha-orc/shared';
import { useStopAll, usePauseAll, useResumeAll } from '@/hooks/use-services';
import { useServicesLive } from '@/hooks/use-services-live';
import { HostIpWidget } from '@/components/dashboard/HostIpWidget';
import { DependencyGraph } from '@/components/graph/DependencyGraph';
import { ServiceCard } from '@/components/service/ServiceCard';
import { toast } from 'sonner';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: services, isLoading, error } = useServicesLive();
  const stopAll = useStopAll();
  const pauseAll = usePauseAll();
  const resumeAll = useResumeAll();

  const allIds = [...SERVICE_IDS];
  const anyBusy = stopAll.isPending || pauseAll.isPending || resumeAll.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-congress-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-tall-poppy-red font-medium">Failed to load services</p>
          <p className="text-sm text-neutral-gray mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  const svcList = services ?? [];

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Platform Overview</h2>

          <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 bg-congress-blue text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
            onClick={() => navigate('/deploy')}
          >
            <Play className="w-4 h-4" />
            Deploy All
          </button>

          <button
            className="flex items-center gap-1.5 border border-buttercup-yellow text-buttercup-yellow px-3 py-1.5 rounded-md text-sm font-medium hover:bg-amber-50 transition-colors disabled:opacity-50"
            disabled={anyBusy}
            onClick={() => {
              if (!confirm('Pause all services? This will scale all deployments to 0 replicas.')) return;
              pauseAll.mutate(allIds, {
                onSuccess: () => toast.success('All services paused'),
                onError: (err) => toast.error(`Pause failed: ${err.message}`),
              });
            }}
          >
            {pauseAll.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
            Pause All
          </button>

          <button
            className="flex items-center gap-1.5 border border-success-green text-success-green px-3 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-50 transition-colors disabled:opacity-50"
            disabled={anyBusy}
            onClick={() =>
              resumeAll.mutate(allIds, {
                onSuccess: () => toast.success('All services resumed'),
                onError: (err) => toast.error(`Resume failed: ${err.message}`),
              })
            }
          >
            {resumeAll.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            Resume All
          </button>

          <button
            className="flex items-center gap-1.5 border border-tall-poppy-red text-tall-poppy-red px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            disabled={anyBusy}
            onClick={() => {
              if (!confirm('Stop all services? This will uninstall all Helm releases.')) return;
              stopAll.mutate(allIds, {
                onSuccess: () => toast.success('All services stopped'),
                onError: (err) => toast.error(`Stop failed: ${err.message}`),
              });
            }}
          >
            {stopAll.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            Stop All
          </button>
          </div>
        </div>
        <HostIpWidget />
      </div>

      <div className="flex-1 grid grid-cols-5 gap-6 min-h-0">
        <div className="col-span-3 min-h-[400px]">
          <DependencyGraph services={svcList} />
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-3 auto-rows-min overflow-auto">
          {svcList.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </div>
    </div>
  );
}
