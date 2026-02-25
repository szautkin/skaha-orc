import { useState } from 'react';
import { Shield, RefreshCw, Loader2 } from 'lucide-react';
import type { ServiceId, CertInfo } from '@skaha-orc/shared';
import { useCerts, useGenerateCert } from '@/hooks/use-certs';
import { toast } from 'sonner';

interface CertPanelProps {
  serviceId: ServiceId;
}

function statusBadge(cert: CertInfo) {
  if (cert.isExpired) {
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-tall-poppy-red">Expired</span>;
  }
  if (cert.daysUntilExpiry < 30) {
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Expiring Soon</span>;
  }
  return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Valid</span>;
}

export function CertPanel({ serviceId }: CertPanelProps) {
  const { data: certs, isLoading } = useCerts(serviceId);
  const generateCert = useGenerateCert(serviceId);
  const [renewTarget, setRenewTarget] = useState<CertInfo | null>(null);
  const [cn, setCn] = useState('');
  const [days, setDays] = useState(365);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-congress-blue" />
      </div>
    );
  }

  if (!certs || certs.length === 0) {
    return (
      <div className="text-sm text-neutral-gray py-8 text-center">
        No certificates found in this service's secrets.
      </div>
    );
  }

  const handleRenew = () => {
    if (!renewTarget || !cn) return;
    generateCert.mutate(
      { secretName: renewTarget.secretName, keyName: renewTarget.keyName, cn, days },
      {
        onSuccess: () => {
          toast.success(`Certificate ${renewTarget.keyName} renewed`);
          setRenewTarget(null);
          setCn('');
        },
        onError: (err) => toast.error(`Renewal failed: ${err.message}`),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {certs.map((cert) => (
          <div
            key={`${cert.secretName}/${cert.keyName}`}
            className="border border-gray-200 rounded-md p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">
                  {cert.secretName} / {cert.keyName}
                </span>
                {statusBadge(cert)}
              </div>
              <button
                onClick={() => {
                  setRenewTarget(cert);
                  setCn(cert.subject.replace(/^.*CN\s*=\s*/, ''));
                }}
                className="flex items-center gap-1.5 text-sm text-congress-blue hover:text-prussian-blue transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Renew
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div>
                <span className="text-gray-400">Subject:</span> {cert.subject}
              </div>
              <div>
                <span className="text-gray-400">Issuer:</span> {cert.issuer}
              </div>
              <div>
                <span className="text-gray-400">Not Before:</span> {cert.notBefore}
              </div>
              <div>
                <span className="text-gray-400">Not After:</span> {cert.notAfter}
              </div>
              <div>
                <span className="text-gray-400">Days Until Expiry:</span> {cert.daysUntilExpiry}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Renew Dialog */}
      {renewTarget && (
        <div className="border border-congress-blue/30 rounded-md p-4 bg-blue-50/50 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">
            Renew: {renewTarget.secretName} / {renewTarget.keyName}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Common Name (CN)</label>
              <input
                type="text"
                value={cn}
                onChange={(e) => setCn(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Validity (days)</label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRenew}
              disabled={generateCert.isPending || !cn}
              className="flex items-center gap-1.5 bg-congress-blue text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
            >
              {generateCert.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Generate & Save
            </button>
            <button
              onClick={() => setRenewTarget(null)}
              className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
