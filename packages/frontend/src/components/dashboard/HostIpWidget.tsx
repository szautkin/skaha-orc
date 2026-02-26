import { useState } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import { useHostIp, useSetHostIp } from '@/hooks/use-services';
import { toast } from 'sonner';

export function HostIpWidget() {
  const { data, isLoading } = useHostIp();
  const setHostIp = useSetHostIp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(data?.ip ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
  };

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    setHostIp.mutate(trimmed, {
      onSuccess: ({ updated }) => {
        toast.success(`Host IP updated (${updated} file${updated === 1 ? '' : 's'})`);
        setEditing(false);
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

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium text-gray-700">Host IP:</span>

      {editing ? (
        <>
          <input
            autoFocus
            className="border border-gray-300 rounded px-2 py-0.5 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-congress-blue"
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
            onClick={save}
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
            onClick={cancel}
            disabled={setHostIp.isPending}
          >
            <X className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-900">
            {data?.ip ?? '—'}
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
    </div>
  );
}
