import { useState } from 'react';
import { Shield, Plus, Upload, Loader2 } from 'lucide-react';
import { useCaInfo, useGenerateCA, useUploadCA } from '@/hooks/use-certs';
import { toast } from 'sonner';

export function CaManager() {
  const { data: ca, isLoading } = useCaInfo();
  const generateCA = useGenerateCA();
  const uploadCA = useUploadCA();

  const [showGenerate, setShowGenerate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [genCn, setGenCn] = useState('CANFAR Dev CA');
  const [genOrg, setGenOrg] = useState('CANFAR');
  const [genDays, setGenDays] = useState(3650);
  const [uploadCert, setUploadCert] = useState('');
  const [uploadKey, setUploadKey] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-congress-blue" />
      </div>
    );
  }

  const handleGenerate = () => {
    generateCA.mutate(
      { cn: genCn, org: genOrg, days: genDays },
      {
        onSuccess: () => {
          toast.success('CA certificate generated');
          setShowGenerate(false);
        },
        onError: (err) => toast.error(`CA generation failed: ${err.message}`),
      },
    );
  };

  const handleUpload = () => {
    if (!uploadCert || !uploadKey) return;
    uploadCA.mutate(
      { certPem: uploadCert, keyPem: uploadKey },
      {
        onSuccess: () => {
          toast.success('CA certificate uploaded');
          setShowUpload(false);
          setUploadCert('');
          setUploadKey('');
        },
        onError: (err) => toast.error(`CA upload failed: ${err.message}`),
      },
    );
  };

  const readFile = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {/* CA Status */}
      <div className="border border-gray-200 rounded-md p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Platform CA Certificate</h3>
            {ca?.exists ? (
              ca.isExpired ? (
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
                Not Found
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowGenerate(true); setShowUpload(false); }}
              className="flex items-center gap-1.5 text-sm text-congress-blue hover:text-prussian-blue transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate New
            </button>
            <button
              onClick={() => { setShowUpload(true); setShowGenerate(false); }}
              className="flex items-center gap-1.5 text-sm text-congress-blue hover:text-prussian-blue transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
          </div>
        </div>

        {ca?.exists && (
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mt-3">
            <div><span className="text-gray-400">Subject:</span> {ca.subject}</div>
            <div><span className="text-gray-400">Issuer:</span> {ca.issuer}</div>
            <div><span className="text-gray-400">Expires:</span> {ca.notAfter}</div>
          </div>
        )}
      </div>

      {/* Generate CA Form */}
      {showGenerate && (
        <div className="border border-congress-blue/30 rounded-md p-4 bg-blue-50/50 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Generate Self-Signed CA</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Common Name</label>
              <input
                type="text"
                value={genCn}
                onChange={(e) => setGenCn(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Organization</label>
              <input
                type="text"
                value={genOrg}
                onChange={(e) => setGenOrg(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Validity (days)</label>
              <input
                type="number"
                value={genDays}
                onChange={(e) => setGenDays(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={generateCA.isPending || !genCn || !genOrg}
              className="flex items-center gap-1.5 bg-congress-blue text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
            >
              {generateCA.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Generate CA
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

      {/* Upload CA Form */}
      {showUpload && (
        <div className="border border-congress-blue/30 rounded-md p-4 bg-blue-50/50 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Upload CA Certificate</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">CA Certificate (PEM)</label>
              <input
                type="file"
                accept=".pem,.crt"
                onChange={readFile(setUploadCert)}
                className="w-full text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">CA Key (PEM)</label>
              <input
                type="file"
                accept=".pem,.key"
                onChange={readFile(setUploadKey)}
                className="w-full text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploadCA.isPending || !uploadCert || !uploadKey}
              className="flex items-center gap-1.5 bg-congress-blue text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50"
            >
              {uploadCA.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Upload CA
            </button>
            <button
              onClick={() => setShowUpload(false)}
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
