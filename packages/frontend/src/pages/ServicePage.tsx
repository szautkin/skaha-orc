import { useState, useMemo } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
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
  AlertTriangle,
  Lock,
  Wrench,
  FlaskConical,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { ServiceId, DeploymentPhase } from '@skaha-orc/shared';
import { SERVICE_CATALOG, SERVICE_IDS, PLATFORM_HOSTNAME, getUnmetDependencies } from '@skaha-orc/shared';
import { useDeploy, useUninstall, usePause, useResume } from '@/hooks/use-services';
import { useServiceLive, useServicesLive } from '@/hooks/use-services-live';
import { useConfigWarnings } from '@/hooks/use-config-warnings';
import { StatusBadge } from '@/components/service/StatusBadge';
import { ConfigForm } from '@/components/service/ConfigForm';
import { CertPanel } from '@/components/service/CertPanel';
import { CaManager } from '@/components/certs/CaManager';
import { PodList } from '@/components/kubernetes/PodList';
import { PodLogViewer } from '@/components/kubernetes/PodLogViewer';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  durationMs: number;
}

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
  const { data: allServices } = useServicesLive();
  const configWarnings = useConfigWarnings(serviceId);
  const deploy = useDeploy(serviceId);
  const uninstall = useUninstall(serviceId);
  const pause = usePause(serviceId);
  const resume = useResume(serviceId);
  const [fixing, setFixing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);

  const unmetDeps = useMemo(() => {
    if (!allServices) return [];
    const phaseMap = new Map<ServiceId, DeploymentPhase>(
      allServices.map((s) => [s.id, s.status.phase]),
    );
    return getUnmetDependencies(serviceId, phaseMap);
  }, [serviceId, allServices]);

  if (serviceId === 'haproxy') {
    return <Navigate to="/haproxy" replace />;
  }

  if (!SERVICE_IDS.includes(serviceId)) {
    return <div className="text-tall-poppy-red">Unknown service: {id}</div>;
  }

  const def = SERVICE_CATALOG[serviceId];
  const anyBusy = deploy.isPending || uninstall.isPending || pause.isPending || resume.isPending;
  const isBlocked = unmetDeps.length > 0;
  const warnings = configWarnings.data?.warnings ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-congress-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dependency warning */}
      {isBlocked && (
        <div className="flex items-start gap-2 bg-amber-50 border border-buttercup-yellow rounded-md p-3 text-sm text-amber-800">
          <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Cannot deploy — requires:{' '}
            {unmetDeps.map((dep, i) => (
              <span key={dep.id}>
                {i > 0 && ', '}
                <Link
                  to={`/services/${dep.id}`}
                  className="font-medium underline hover:text-amber-900"
                >
                  {dep.name}
                </Link>
              </span>
            ))}{' '}
            (not yet deployed)
          </span>
        </div>
      )}

      {/* Config warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-buttercup-yellow rounded-md p-3 text-sm text-amber-800">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Configuration warnings:
            </div>
            <button
              onClick={async () => {
                setFixing(true);
                try {
                  const { fixes } = await api.autoFix(serviceId);
                  if (fixes.length > 0) {
                    toast.success(`Applied ${fixes.length} fix(es)`);
                    void configWarnings.refetch();
                  } else {
                    toast.info('No auto-fixable issues found');
                  }
                } catch (err) {
                  toast.error(`Auto-fix failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                } finally {
                  setFixing(false);
                }
              }}
              disabled={fixing}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors disabled:opacity-50"
            >
              {fixing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
              Fix automatically
            </button>
          </div>
          <ul className="list-disc pl-8 space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

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
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50',
              isBlocked
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-congress-blue text-white hover:bg-prussian-blue',
            )}
            onClick={() =>
              deploy.mutate(false, {
                onSuccess: () => toast.success(`${def.name} deployed`),
                onError: (err) => toast.error(`Deploy failed: ${err.message}`),
              })
            }
            disabled={anyBusy || isBlocked}
            title={
              isBlocked
                ? `Requires: ${unmetDeps.map((d) => d.name).join(', ')} (not deployed)`
                : undefined
            }
          >
            {deploy.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isBlocked ? (
              <Lock className="w-3.5 h-3.5" />
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

          <button
            className="flex items-center gap-1.5 border border-congress-blue text-congress-blue px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
            onClick={async () => {
              setTesting(true);
              setTestResults(null);
              try {
                const { results } = await api.runTests(serviceId);
                setTestResults(results);
                const passed = results.filter((r) => r.status === 'pass').length;
                const failed = results.filter((r) => r.status === 'fail').length;
                if (failed === 0) {
                  toast.success(`All ${passed} test(s) passed`);
                } else {
                  toast.error(`${failed} test(s) failed, ${passed} passed`);
                }
              } catch (err) {
                toast.error(`Tests failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
              } finally {
                setTesting(false);
              }
            }}
            disabled={anyBusy || testing}
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FlaskConical className="w-3.5 h-3.5" />
            )}
            Run Tests
          </button>
        </div>
      </div>

      {/* Test Results */}
      {testResults && testResults.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm">
          <h4 className="font-medium text-gray-900 mb-2">Test Results</h4>
          <div className="space-y-1">
            {testResults.map((r) => (
              <div key={r.name} className="flex items-center gap-2">
                {r.status === 'pass' ? (
                  <CheckCircle2 className="w-4 h-4 text-success-green flex-shrink-0" />
                ) : r.status === 'fail' ? (
                  <XCircle className="w-4 h-4 text-tall-poppy-red flex-shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-gray-300 flex-shrink-0 inline-block" />
                )}
                <span className="font-medium">{r.name}</span>
                <span className="text-neutral-gray">{r.message}</span>
                <span className="text-xs text-neutral-gray ml-auto">{r.durationMs}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
