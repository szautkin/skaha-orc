import { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, Play, Square, RefreshCw, Wand2, AlertTriangle, Lock } from 'lucide-react';
import type { HAProxyDeployMode, HAProxyTestConfigResponse } from '@skaha-orc/shared';
import {
  useHAProxyConfig,
  useHAProxyStatus,
  useSaveHAProxyConfig,
  useTestHAProxyConfig,
  useReloadHAProxy,
  useDeployHAProxy,
  useStopHAProxy,
  useHAProxyRoutes,
  useGenerateHAProxyConfig,
  useHAProxyPreflight,
  useHAProxyLogs,
  useHAProxyCertInfo,
} from '@/hooks/use-haproxy';
import { useCaInfo } from '@/hooks/use-certs';
import { CaManager } from '@/components/certs/CaManager';
import { HAProxyCertPanel } from '@/components/certs/HAProxyCertPanel';
import { toast } from 'sonner';

type Tab = 'config' | 'certs';

export function HAProxyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const selectedMode: HAProxyDeployMode = 'kubernetes';
  const [testResult, setTestResult] = useState<HAProxyTestConfigResponse | null>(null);
  const [enableSsl, setEnableSsl] = useState(false);

  const configQuery = useHAProxyConfig();
  const statusQuery = useHAProxyStatus();
  const routesQuery = useHAProxyRoutes();
  const preflightQuery = useHAProxyPreflight(selectedMode);
  const deployMode = statusQuery.data?.deployMode ?? selectedMode;
  const showLogs = !!statusQuery.data?.deployMode && !statusQuery.data?.running;
  const logsQuery = useHAProxyLogs(deployMode, showLogs);
  const certInfoQuery = useHAProxyCertInfo();
  const caInfoQuery = useCaInfo();

  const saveConfig = useSaveHAProxyConfig();
  const testConfig = useTestHAProxyConfig();
  const reload = useReloadHAProxy();
  const deploy = useDeployHAProxy();
  const stop = useStopHAProxy();
  const generateConfig = useGenerateHAProxyConfig();

  const content = editorContent ?? configQuery.data?.content ?? '';
  const status = statusQuery.data;
  const routes = routesQuery.data ?? [];
  const preflight = preflightQuery.data;
  const preflightReady = preflight?.ready ?? false;
  const isDirty = editorContent !== null && editorContent !== configQuery.data?.content;

  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    },
    [isDirty],
  );

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  const caExists = caInfoQuery.data?.exists ?? false;
  const certExists = certInfoQuery.data?.exists ?? false;
  const sslReady = caExists && certExists;

  function handleTest() {
    testConfig.mutate(undefined, {
      onSuccess: (result) => {
        setTestResult(result);
        if (result.valid) toast.success('Config is valid');
        else toast.error('Config validation failed');
      },
      onError: (err) => toast.error(`Test failed: ${err.message}`),
    });
  }

  function handleSave() {
    saveConfig.mutate(content, {
      onSuccess: () => {
        setEditorContent(null);
        toast.success('Config saved');
      },
      onError: (err) => toast.error(`Save failed: ${err.message}`),
    });
  }

  function handleSaveAndReload() {
    const mode = status?.deployMode ?? selectedMode;
    saveConfig.mutate(content, {
      onSuccess: () => {
        setEditorContent(null);
        reload.mutate(mode, {
          onSuccess: () => toast.success('Config saved and HAProxy reloaded'),
          onError: (err) => toast.error(`Reload failed: ${err.message}`),
        });
      },
      onError: (err) => toast.error(`Save failed: ${err.message}`),
    });
  }

  function handleGenerate() {
    const options = enableSsl && sslReady
      ? { enableSsl: true }
      : undefined;

    generateConfig.mutate(options, {
      onSuccess: (result) => {
        setEditorContent(result.content);
        toast.success('Config generated from service catalog');
      },
      onError: (err) => toast.error(`Generate failed: ${err.message}`),
    });
  }

  if (configQuery.isLoading) {
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
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">HAProxy</h2>
          {status && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                status.running
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-gray-100 text-neutral-gray'
              }`}
            >
              {status.running ? 'Running' : 'Stopped'}
            </span>
          )}
          {status?.deployMode && (
            <span className="text-xs text-neutral-gray">
              via {status.deployMode}
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6 -mb-px">
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'config'
                ? 'border-congress-blue text-congress-blue'
                : 'border-transparent text-neutral-gray hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Configuration
          </button>
          <button
            onClick={() => setActiveTab('certs')}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'certs'
                ? 'border-congress-blue text-congress-blue'
                : 'border-transparent text-neutral-gray hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Certificates
          </button>
        </nav>
      </div>

      {/* Configuration tab */}
      {activeTab === 'config' && (
        <>
          {/* Routing Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Service Routing</h3>
              <div className="flex items-center gap-3">
                {/* SSL toggle */}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableSsl}
                    onChange={(e) => setEnableSsl(e.target.checked)}
                    className="accent-congress-blue"
                  />
                  <Lock className="w-3 h-3" />
                  Enable SSL
                </label>
                <button
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-congress-blue text-white rounded-md hover:bg-prussian-blue transition-colors disabled:opacity-50"
                  onClick={handleGenerate}
                  disabled={generateConfig.isPending}
                >
                  {generateConfig.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  Generate Config
                </button>
              </div>
            </div>

            {/* SSL warnings */}
            {enableSsl && !sslReady && (
              <div className="px-4 py-2 bg-buttercup-yellow/10 border-b border-buttercup-yellow/20">
                <div className="flex items-center gap-2 text-xs text-buttercup-yellow">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {!caExists && !certExists
                    ? 'CA and server certificates are required for SSL.'
                    : !caExists
                      ? 'CA certificate is required for SSL.'
                      : 'Server certificate is required for SSL.'}
                  <button
                    onClick={() => setActiveTab('certs')}
                    className="underline hover:no-underline font-medium"
                  >
                    Go to Certificates
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-neutral-gray">
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">Path</th>
                  <th className="px-4 py-2 font-medium">K8s Service</th>
                  <th className="px-4 py-2 font-medium">Port</th>
                  <th className="px-4 py-2 font-medium">Backend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {routes.map((route) => (
                  <tr key={route.serviceId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{route.serviceName}</td>
                    <td className="px-4 py-2 font-mono text-congress-blue">{route.endpointPath}</td>
                    <td className="px-4 py-2 font-mono">{route.k8sServiceName}</td>
                    <td className="px-4 py-2">{route.k8sServicePort}</td>
                    <td className="px-4 py-2 font-mono text-neutral-gray">{route.backendName}</td>
                  </tr>
                ))}
                {routes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-center text-neutral-gray">
                      No routes configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Config Editor — left 2/3 */}
            <div className="col-span-2 space-y-3">
              <textarea
                className="w-full h-[600px] font-mono text-xs bg-gray-900 text-gray-100 p-4 rounded-md border border-gray-700 focus:border-congress-blue focus:outline-none resize-none"
                value={content}
                onChange={(e) => setEditorContent(e.target.value)}
                spellCheck={false}
              />

              {/* Action bar */}
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                  onClick={handleTest}
                  disabled={testConfig.isPending}
                >
                  {testConfig.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Test Config
                </button>

                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-congress-blue text-white rounded-md hover:bg-prussian-blue transition-colors disabled:opacity-50"
                  onClick={handleSave}
                  disabled={saveConfig.isPending || !isDirty}
                >
                  {saveConfig.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save
                </button>

                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-congress-blue text-white rounded-md hover:bg-prussian-blue transition-colors disabled:opacity-50"
                  onClick={handleSaveAndReload}
                  disabled={saveConfig.isPending || reload.isPending}
                >
                  {(saveConfig.isPending || reload.isPending) && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Save & Reload
                </button>
              </div>

              {/* Test result panel */}
              {testResult && (
                <div
                  className={`rounded-md border p-3 text-xs font-mono whitespace-pre-wrap ${
                    testResult.valid
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-tall-poppy-red'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 font-sans font-medium text-sm">
                    {testResult.valid ? (
                      <><CheckCircle className="w-4 h-4" /> Valid</>
                    ) : (
                      <><XCircle className="w-4 h-4" /> Invalid</>
                    )}
                  </div>
                  {testResult.output}
                </div>
              )}
            </div>

            {/* Sidebar — right 1/3 */}
            <div className="space-y-4">
              {/* Status panel */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Status</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-gray">Running</span>
                    <span className={status?.running ? 'text-emerald-600 font-medium' : 'text-neutral-gray'}>
                      {status?.running ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-neutral-gray">Config Valid</span>
                    <span
                      className={
                        status?.configValid === true
                          ? 'text-emerald-600 font-medium'
                          : status?.configValid === false
                            ? 'text-tall-poppy-red font-medium'
                            : 'text-neutral-gray'
                      }
                    >
                      {status?.configValid === true ? 'Yes' : status?.configValid === false ? 'No' : '—'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-neutral-gray">Deploy Mode</span>
                    <span className="font-medium">{status?.deployMode ?? '—'}</span>
                  </div>

                  {status?.lastReloaded && (
                    <div className="flex justify-between">
                      <span className="text-neutral-gray">Last Reload</span>
                      <span className="text-xs">{status.lastReloaded}</span>
                    </div>
                  )}

                  {status?.error && (
                    <p className="text-xs text-tall-poppy-red mt-1">{status.error}</p>
                  )}
                </div>
              </div>

              {/* Logs panel — shown when deployed but not running */}
              {showLogs && logsQuery.data && (
                <div className="bg-white border border-tall-poppy-red/30 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-tall-poppy-red flex items-center gap-1.5">
                      <XCircle className="w-4 h-4" />
                      Container Logs
                    </h3>
                    <button
                      className="text-xs text-neutral-gray hover:text-gray-700"
                      onClick={() => logsQuery.refetch()}
                    >
                      <RefreshCw className={`w-3 h-3 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <pre className="text-xs font-mono bg-gray-900 text-gray-100 p-3 rounded-md overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {logsQuery.data.logs}
                  </pre>
                </div>
              )}

              {/* Prerequisites panel */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Prerequisites</h3>
                {preflightQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-gray">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Checking...
                  </div>
                ) : preflight ? (
                  <div className="space-y-1.5">
                    {preflight.checks.map((check) => (
                      <div key={check.id}>
                        <div className="flex items-center gap-2 text-sm">
                          {check.status === 'ok' ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-tall-poppy-red shrink-0" />
                          )}
                          <span className={check.status === 'ok' ? 'text-gray-700' : 'text-tall-poppy-red font-medium'}>
                            {check.label}
                          </span>
                        </div>
                        {check.status !== 'ok' && check.remedy && (
                          <p className="ml-5.5 pl-[22px] text-xs text-neutral-gray mt-0.5">
                            {check.remedy}
                          </p>
                        )}
                      </div>
                    ))}
                    {!preflightReady && (
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 text-xs text-buttercup-yellow">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Fix prerequisites above before deploying
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-gray">Unable to check prerequisites</p>
                )}
              </div>

              {/* Deploy actions */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Deploy Mode</h3>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="deploy-mode"
                    value="kubernetes"
                    checked
                    readOnly
                    className="accent-congress-blue"
                  />
                  Kubernetes
                </label>

                <div className="flex gap-2 pt-2">
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-congress-blue text-white rounded-md hover:bg-prussian-blue transition-colors disabled:opacity-50"
                    onClick={() =>
                      deploy.mutate(selectedMode, {
                        onSuccess: () => toast.success('HAProxy deployed'),
                        onError: (err) => toast.error(`Deploy failed: ${err.message}`),
                      })
                    }
                    disabled={deploy.isPending || !preflightReady}
                    title={!preflightReady ? 'Fix prerequisites above' : undefined}
                  >
                    {deploy.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Deploy
                  </button>

                  <button
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-tall-poppy-red text-tall-poppy-red rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                    onClick={() =>
                      stop.mutate(selectedMode, {
                        onSuccess: () => toast.success('HAProxy stopped'),
                        onError: (err) => toast.error(`Stop failed: ${err.message}`),
                      })
                    }
                    disabled={stop.isPending}
                  >
                    {stop.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    Stop
                  </button>
                </div>

                <button
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                  onClick={() =>
                    reload.mutate(selectedMode, {
                      onSuccess: () => toast.success('HAProxy reloaded'),
                      onError: (err) => toast.error(`Reload failed: ${err.message}`),
                    })
                  }
                  disabled={reload.isPending || !status?.running}
                >
                  {reload.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Reload
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Certificates tab */}
      {activeTab === 'certs' && (
        <div className="space-y-6">
          <CaManager />
          <HAProxyCertPanel />
        </div>
      )}
    </div>
  );
}
