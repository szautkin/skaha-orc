import { useState } from 'react';
import { Pencil, Check, X, Loader2, ChevronDown } from 'lucide-react';
import { useHostIp, useSetHostIp, useHostIps } from '@/hooks/use-services';
import { toast } from 'sonner';

type EditMode = 'closed' | 'dropdown' | 'manual';

export function HostIpWidget() {
  const { data, isLoading } = useHostIp();
  const { data: detectedIps } = useHostIps();
  const setHostIp = useSetHostIp();
  const [mode, setMode] = useState<EditMode>('closed');
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(data?.ip ?? '');
    setMode('dropdown');
  };

  const cancel = () => setMode('closed');

  const save = (ip?: string) => {
    const trimmed = (ip ?? draft).trim();
    if (!trimmed) return;

    setHostIp.mutate(trimmed, {
      onSuccess: ({ updated }) => {
        toast.success(`Host IP updated (${updated} file${updated === 1 ? '' : 's'})`);
        setMode('closed');
      },
      onError: (err) => toast.error(`Failed to update Host IP: ${err.message}`),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-gray">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading host IP…
      </div>
    );
  }

  const ips = detectedIps ?? [];
  const currentIp = data?.ip;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium text-gray-700">Host IP:</span>

      {mode === 'closed' && (
        <>
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-900">
            {currentIp ?? '—'}
          </code>
          <span className="text-neutral-gray">→</span>
          <span className="text-gray-500">{data?.hostname}</span>
          <button
            className="text-neutral-gray hover:text-congress-blue"
            onClick={startEdit}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {mode === 'dropdown' && (
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              autoFocus
              className="appearance-none border border-gray-300 rounded pl-2 pr-7 py-0.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-congress-blue cursor-pointer"
              value={currentIp && ips.some((i) => i.ip === currentIp) ? currentIp : '__custom__'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__custom__') {
                  setDraft(currentIp ?? '');
                  setMode('manual');
                } else {
                  save(val);
                }
              }}
              disabled={setHostIp.isPending}
            >
              {ips.map((entry) => (
                <option key={entry.ip} value={entry.ip}>
                  {entry.ip} ({entry.iface}{entry.virtual ? ', virtual' : ''})
                </option>
              ))}
              {currentIp && !ips.some((i) => i.ip === currentIp) && (
                <option value={currentIp}>
                  {currentIp} (current)
                </option>
              )}
              <option value="__custom__">Enter manually…</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
          </div>
          {setHostIp.isPending && <Loader2 className="w-4 h-4 animate-spin text-congress-blue" />}
          <button
            className="text-neutral-gray hover:text-gray-600"
            onClick={cancel}
            disabled={setHostIp.isPending}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {mode === 'manual' && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="border border-gray-300 rounded px-2 py-0.5 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-congress-blue"
            placeholder="e.g. 192.168.1.10"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') cancel();
            }}
            disabled={setHostIp.isPending}
          />
          <button
            className="text-success-green hover:text-emerald-700 disabled:opacity-50"
            onClick={() => save()}
            disabled={setHostIp.isPending || !draft.trim()}
          >
            {setHostIp.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
          </button>
          <button
            className="text-neutral-gray hover:text-gray-600"
            onClick={() => setMode('dropdown')}
            disabled={setHostIp.isPending}
            title="Back to interface list"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            className="text-neutral-gray hover:text-gray-600"
            onClick={cancel}
            disabled={setHostIp.isPending}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
