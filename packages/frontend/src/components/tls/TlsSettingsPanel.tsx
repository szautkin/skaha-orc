import { useState } from 'react';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Upload,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useTlsStatus, useApplyTrust, useUploadLeCert } from '@/hooks/use-tls';
import { toast } from 'sonner';

const MODE_STYLES: Record<string, { label: string; className: string }> = {
  'self-signed': { label: 'Self-Signed', className: 'bg-buttercup-yellow/20 text-buttercup-yellow' },
  'lets-encrypt': { label: "Let's Encrypt", className: 'bg-emerald-100 text-emerald-800' },
  'not-configured': { label: 'Not Configured', className: 'bg-gray-100 text-neutral-gray' },
};

export function TlsSettingsPanel() {
  const [showUpload, setShowUpload] = useState(false);
  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');

  const tlsQuery = useTlsStatus();
  const applyTrust = useApplyTrust();
  const uploadLe = useUploadLeCert();

  const tls = tlsQuery.data;

  function handleApplyTrust() {
    applyTrust.mutate(undefined, {
      onSuccess: (result) => {
        if (result.errors.length > 0) {
          toast.warning(`Trust check: ${result.errors.length} service(s) missing CA cert`);
        } else {
          toast.success(`All ${result.servicesPatched.length} service(s) have CA cert configured`);
        }
      },
      onError: (err) => toast.error(`Trust check failed: ${err.message}`),
    });
  }

  function handleUploadLeCert() {
    if (!certPem.trim() || !keyPem.trim()) {
      toast.error('Both certificate and key PEM are required');
      return;
    }
    uploadLe.mutate(
      { certPem: certPem.trim(), keyPem: keyPem.trim() },
      {
        onSuccess: () => {
          toast.success("Let's Encrypt certificate uploaded");
          setCertPem('');
          setKeyPem('');
          setShowUpload(false);
        },
        onError: (err) => toast.error(`Upload failed: ${err.message}`),
      },
    );
  }

  if (tlsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-congress-blue" />
      </div>
    );
  }

  if (!tls) {
    return (
      <div className="text-sm text-neutral-gray py-8 text-center">
        Unable to load TLS status
      </div>
    );
  }

  const modeInfo = MODE_STYLES[tls.mode] ?? MODE_STYLES['not-configured']!;

  return (
    <div className="space-y-6">
      {/* Section 1: TLS Mode Overview */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-congress-blue" />
            <h3 className="text-sm font-semibold text-gray-900">TLS Mode</h3>
          </div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${modeInfo.className}`}>
            {modeInfo.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {/* CA Status */}
          <div className="space-y-1">
            <div className="text-neutral-gray text-xs font-medium">CA Certificate</div>
            <div className="flex items-center gap-1.5">
              {tls.ca.exists ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-tall-poppy-red shrink-0" />
              )}
              <span className={tls.ca.exists ? 'text-gray-700' : 'text-tall-poppy-red'}>
                {tls.ca.exists ? 'Present' : 'Missing'}
              </span>
            </div>
            {tls.ca.subject && (
              <div className="text-xs text-neutral-gray truncate" title={tls.ca.subject}>
                {tls.ca.subject}
              </div>
            )}
          </div>

          {/* HAProxy Cert Status */}
          <div className="space-y-1">
            <div className="text-neutral-gray text-xs font-medium">Traefik Server Certificate</div>
            <div className="flex items-center gap-1.5">
              {tls.haproxyCert.exists ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-tall-poppy-red shrink-0" />
              )}
              <span className={tls.haproxyCert.exists ? 'text-gray-700' : 'text-tall-poppy-red'}>
                {tls.haproxyCert.exists ? 'Present' : 'Missing'}
              </span>
            </div>
            {tls.haproxyCert.issuer && (
              <div className="text-xs text-neutral-gray truncate" title={tls.haproxyCert.issuer}>
                {tls.haproxyCert.issuer}
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-xs text-blue-700">
          OpenCADC containers auto-import CA certificates from <code className="bg-blue-100 px-1 rounded">/config/cacerts/</code> at startup via <code className="bg-blue-100 px-1 rounded">update-ca-trust</code>. No manual truststore configuration needed.
        </div>

        {/* Upload Let's Encrypt Cert */}
        <div className="border-t border-gray-100 pt-3">
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-1.5 text-xs font-medium text-congress-blue hover:text-prussian-blue transition-colors"
          >
            {showUpload ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Upload className="w-3 h-3" />
            Upload Let's Encrypt Certificate
          </button>

          {showUpload && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Certificate PEM (fullchain)</label>
                <textarea
                  className="w-full h-24 font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-2 focus:border-congress-blue focus:outline-none resize-none"
                  value={certPem}
                  onChange={(e) => setCertPem(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Private Key PEM</label>
                <textarea
                  className="w-full h-24 font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-2 focus:border-congress-blue focus:outline-none resize-none"
                  value={keyPem}
                  onChange={(e) => setKeyPem(e.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;..."
                />
              </div>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-congress-blue text-white rounded-md hover:bg-prussian-blue transition-colors disabled:opacity-50"
                onClick={handleUploadLeCert}
                disabled={uploadLe.isPending}
              >
                {uploadLe.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Upload
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Service CA Trust Status */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-congress-blue" />
            <h3 className="text-sm font-semibold text-gray-900">Service CA Trust</h3>
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-congress-blue text-white rounded-md hover:bg-prussian-blue transition-colors disabled:opacity-50"
            onClick={handleApplyTrust}
            disabled={applyTrust.isPending || !tls.ca.exists}
            title={!tls.ca.exists ? 'CA certificate required' : 'Verify CA cert is configured for all services'}
          >
            {applyTrust.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            Check Trust Status
          </button>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-left text-neutral-gray">
              <th className="px-4 py-2 font-medium">Service</th>
              <th className="px-4 py-2 font-medium">Secret</th>
              <th className="px-4 py-2 font-medium text-center">CA Cert Mounted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tls.services.map((svc) => (
              <tr key={svc.serviceId} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{svc.serviceName}</td>
                <td className="px-4 py-2 font-mono text-neutral-gray">{svc.deploymentName}</td>
                <td className="px-4 py-2 text-center">
                  {svc.hasCaCert ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto" />
                  ) : (
                    <XCircle className="w-4 h-4 text-tall-poppy-red mx-auto" />
                  )}
                </td>
              </tr>
            ))}
            {tls.services.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-center text-neutral-gray">
                  No Java services configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
