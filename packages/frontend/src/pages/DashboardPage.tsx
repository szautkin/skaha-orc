import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, Square, RotateCcw, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { SERVICE_IDS, SERVICE_CATALOG, TIER_ORDER, TIER_LABELS, getServicesByTier } from '@skaha-orc/shared';
import type { ServiceTier } from '@skaha-orc/shared';
import { useStopAll, usePauseAll, useResumeAll } from '@/hooks/use-services';
import { useServicesLive } from '@/hooks/use-services-live';
import { usePreflight } from '@/hooks/use-preflight';
import { HostIpWidget } from '@/components/dashboard/HostIpWidget';
import { DependencyGraph } from '@/components/graph/DependencyGraph';
import { ServiceCard } from '@/components/service/ServiceCard';
import { SetupWizard } from '@/components/setup/SetupWizard';
import { toast } from 'sonner';

const servicesByTier = getServicesByTier();

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: services, isLoading, error } = useServicesLive();
  const preflight = usePreflight();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('setup-dismissed') === 'true',
  );
  const [collapsed, setCollapsed] = useState<Record<ServiceTier, boolean>>({
    core: false,
    recommended: false,
    site: true,
  });
  const stopAll = useStopAll();
  const pauseAll = usePauseAll();
  const resumeAll = useResumeAll();

  const allIds = [...SERVICE_IDS];
  const anyBusy = stopAll.isPending || pauseAll.isPending || resumeAll.isPending;

  if (preflight.data && !preflight.data.ready && !dismissed) {
    return (
      <SetupWizard
        result={preflight.data}
        onDismiss={() => {
          setDismissed(true);
          sessionStorage.setItem('setup-dismissed', 'true');
        }}
        onRecheck={() => void preflight.refetch()}
        isRechecking={preflight.isFetching}
      />
    );
  }

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
  const svcMap = new Map(svcList.map((s) => [s.id, s]));

  const toggleTier = (tier: ServiceTier) => {
    setCollapsed((prev) => ({ ...prev, [tier]: !prev[tier] }));
  };

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

        <div className="col-span-2 overflow-auto space-y-4">
          {TIER_ORDER.map((tier) => {
            const ids = servicesByTier[tier];
            const isCollapsed = collapsed[tier];
            return (
              <div key={tier}>
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold text-neutral-gray uppercase tracking-wider mb-2 hover:text-gray-700"
                  onClick={() => toggleTier(tier)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {TIER_LABELS[tier]} ({ids.length})
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-2 gap-3">
                    {ids.map((id) => {
                      const svc = svcMap.get(id);
                      if (!svc) return null;
                      return <ServiceCard key={id} service={svc} />;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
