import { useState } from 'react';
import { Shield, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { useHAProxyCertInfo, useGenerateHAProxyCert } from '@/hooks/use-haproxy';
import { useCaInfo } from '@/hooks/use-certs';
import { toast } from 'sonner';

export function HAProxyCertPanel() {
  const { data: cert, isLoading } = useHAProxyCertInfo();
  const { data: ca } = useCaInfo();
  const generateCert = useGenerateHAProxyCert();

  const [showGenerate, setShowGenerate] = useState(false);
  const [cn, setCn] = useState('haproxy.skaha-system.local');
  const [days, setDays] = useState(365);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-congress-blue" />
      </div>
    );
  }

  const caExists = ca?.exists ?? false;

  const handleGenerate = () => {
    generateCert.mutate(
      { cn, days },
      {
        onSuccess: () => {
          toast.success('HAProxy server certificate generated');
          setShowGenerate(false);
        },
        onError: (err) => toast.error(`Generation failed: ${err.message}`),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="border border-gray-200 rounded-md p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">HAProxy Server Certificate</h3>
            {cert?.exists ? (
              cert.isExpired ? (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-tall-poppy-red">
                  Expired
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                  Valid
                </span>
              )
            ) : (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
                Not Generated
              </span>
            )}
          </div>
          <button
            onClick={() => setShowGenerate(true)}
            disabled={!caExists}
            className="flex items-center gap-1.5 text-sm text-congress-blue hover:text-prussian-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Generate
          </button>
        </div>

        {cert?.exists && (
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mt-3">
            <div><span className="text-gray-400">Subject:</span> {cert.subject}</div>
            <div><span className="text-gray-400">Issuer:</span> {cert.issuer}</div>
            <div><span className="text-gray-400">Expires:</span> {cert.notAfter}</div>
            <div>
              <span className="text-gray-400">Days remaining:</span>{' '}
              {cert.daysUntilExpiry !== undefined ? cert.daysUntilExpiry : '—'}
            </div>
            <div className="col-span-2">
              <span className="text-gray-400">PEM path:</span>{' '}
              <span className="font-mono">{cert.path}</span>
            </div>
          </div>
        )}

        {!caExists && (
          <div className="flex items-center gap-2 mt-3 text-xs text-buttercup-yellow">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            A CA certificate must exist before generating a server certificate. Use the CA panel above.
          </div>
        )}
      </div>

      {showGenerate && (
        <div className="border border-congress-blue/30 rounded-md p-4 bg-blue-50/50 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Generate HAProxy Server Certificate</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Common Name</label>
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
              onClick={handleGenerate}
              disabled={generateCert.isPending || !cn}
              className="flex items-center gap-1.5 bg-congress-blue text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
            >
              {generateCert.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Generate Certificate
            </button>
            <button
              onClick={() => setShowGenerate(false)}
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
