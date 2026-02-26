import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Loader2,
  Settings,
  Activity,
  Terminal,
  Shield,
  ExternalLink,
} from 'lucide-react';
import type { ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS, PLATFORM_HOSTNAME } from '@skaha-orc/shared';
import { useDeploy, useUninstall, usePause, useResume } from '@/hooks/use-services';
import { useServiceLive } from '@/hooks/use-services-live';
import { StatusBadge } from '@/components/service/StatusBadge';
import { ConfigForm } from '@/components/service/ConfigForm';
import { CertPanel } from '@/components/service/CertPanel';
import { CaManager } from '@/components/certs/CaManager';
import { PodList } from '@/components/kubernetes/PodList';
import { PodLogViewer } from '@/components/kubernetes/PodLogViewer';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type TabId = 'config' | 'status' | 'pods' | 'certs';

const SERVICES_WITH_CERTS: ServiceId[] = ['base', 'doi', 'posix-mapper', 'science-portal', 'skaha'];

export function ServicePage() {
  const { id } = useParams<{ id: string }>();
  const serviceId = id as ServiceId;
  const hasCerts = SERVICES_WITH_CERTS.includes(serviceId);

  const allTabs: Array<{ id: TabId; label: string; icon: typeof Settings }> = [
    { id: 'config', label: 'Configuration', icon: Settings },
    { id: 'status', label: 'Status', icon: Activity },
    { id: 'pods', label: 'Pods & Logs', icon: Terminal },
    ...(hasCerts ? [{ id: 'certs' as TabId, label: 'Certificates', icon: Shield }] : []),
  ];

  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [selectedPod, setSelectedPod] = useState<string | null>(null);

  const { data: service, isLoading } = useServiceLive(serviceId);
  const deploy = useDeploy(serviceId);
  const uninstall = useUninstall(serviceId);
  const pause = usePause(serviceId);
  const resume = useResume(serviceId);

  if (serviceId === 'haproxy') {
    return <Navigate to="/haproxy" replace />;
  }

  if (!SERVICE_IDS.includes(serviceId)) {
    return <div className="text-tall-poppy-red">Unknown service: {id}</div>;
  }

  const def = SERVICE_CATALOG[serviceId];
  const anyBusy = deploy.isPending || uninstall.isPending || pause.isPending || resume.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-congress-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">{def.name}</h2>
            {service && <StatusBadge phase={service.status.phase} />}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-neutral-gray">{def.description}</p>
            {def.endpointPath &&
              service &&
              (service.status.phase === 'deployed' || service.status.phase === 'healthy') && (
                <a
                  href={`https://${PLATFORM_HOSTNAME}${def.endpointPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-congress-blue hover:text-prussian-blue transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Service
                </a>
              )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 bg-congress-blue text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
            onClick={() =>
              deploy.mutate(false, {
                onSuccess: () => toast.success(`${def.name} deployed`),
                onError: (err) => toast.error(`Deploy failed: ${err.message}`),
              })
            }
            disabled={anyBusy}
          >
            {deploy.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Deploy
          </button>

          <button
            className="flex items-center gap-1.5 border border-buttercup-yellow text-buttercup-yellow px-3 py-1.5 rounded-md text-sm font-medium hover:bg-amber-50 transition-colors disabled:opacity-50"
            onClick={() =>
              pause.mutate(undefined, {
                onSuccess: () => toast.success(`${def.name} paused`),
                onError: (err) => toast.error(`Pause failed: ${err.message}`),
              })
            }
            disabled={anyBusy}
          >
            {pause.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
            Pause
          </button>

          <button
            className="flex items-center gap-1.5 border border-success-green text-success-green px-3 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-50 transition-colors disabled:opacity-50"
            onClick={() =>
              resume.mutate(undefined, {
                onSuccess: () => toast.success(`${def.name} resumed`),
                onError: (err) => toast.error(`Resume failed: ${err.message}`),
              })
            }
            disabled={anyBusy}
          >
            {resume.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Resume
          </button>

          <button
            className="flex items-center gap-1.5 border border-tall-poppy-red text-tall-poppy-red px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            onClick={() =>
              uninstall.mutate(undefined, {
                onSuccess: () => toast.success(`${def.name} uninstalled`),
                onError: (err) => toast.error(`Uninstall failed: ${err.message}`),
              })
            }
            disabled={anyBusy}
          >
            {uninstall.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Uninstall
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {allTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-congress-blue text-congress-blue'
                  : 'border-transparent text-neutral-gray hover:text-gray-900',
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {activeTab === 'config' && <ConfigForm serviceId={serviceId} />}

        {activeTab === 'status' && service && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-md p-3">
                <p className="text-xs text-neutral-gray">Helm Status</p>
                <p className="text-sm font-medium mt-1">
                  {service.status.helmStatus ?? 'Not installed'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-md p-3">
                <p className="text-xs text-neutral-gray">Revision</p>
                <p className="text-sm font-medium mt-1">{service.status.revision ?? '-'}</p>
              </div>
              <div className="bg-gray-50 rounded-md p-3">
                <p className="text-xs text-neutral-gray">Pods</p>
                <p className="text-sm font-medium mt-1">
                  {service.status.readyPods}/{service.status.podCount} ready
                </p>
              </div>
            </div>
            {service.status.lastDeployed && (
              <p className="text-xs text-neutral-gray">
                Last deployed: {service.status.lastDeployed}
              </p>
            )}
            {service.status.error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-tall-poppy-red">{service.status.error}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pods' && (
          <div className="space-y-4">
            <PodList
              serviceId={serviceId}
              onSelectPod={setSelectedPod}
              selectedPod={selectedPod}
            />
            <PodLogViewer serviceId={serviceId} podName={selectedPod} />
          </div>
        )}

        {activeTab === 'certs' && (
          <div className="space-y-6">
            <CaManager />
            <CertPanel serviceId={serviceId} />
          </div>
        )}
      </div>
    </div>
  );
}
