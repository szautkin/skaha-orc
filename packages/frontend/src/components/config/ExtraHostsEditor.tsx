import { Plus, Trash2 } from 'lucide-react';
import type { ExtraHost } from '@skaha-orc/shared';

interface ExtraHostsEditorProps {
  value: ExtraHost[];
  onChange: (value: ExtraHost[]) => void;
}

export function ExtraHostsEditor({ value, onChange }: ExtraHostsEditorProps) {
  const hosts = value ?? [];

  const updateRow = (index: number, field: keyof ExtraHost, v: string) => {
    const next = hosts.map((h, i) => (i === index ? { ...h, [field]: v } : h));
    onChange(next);
  };

  const addRow = () => {
    onChange([...hosts, { ip: '', hostname: '' }]);
  };

  const removeRow = (index: number) => {
    onChange(hosts.filter((_, i) => i !== index));
  };

  return (
    <div className="col-span-2 space-y-2">
      {hosts.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
          <span>IP Address</span>
          <span>Hostname</span>
          <span className="w-8" />
        </div>
      )}

      {hosts.map((host, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            type="text"
            value={host.ip}
            onChange={(e) => updateRow(index, 'ip', e.target.value)}
            placeholder="192.168.1.1"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none"
          />
          <input
            type="text"
            value={host.hostname}
            onChange={(e) => updateRow(index, 'hostname', e.target.value)}
            placeholder="hostname.example.com"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-tall-poppy-red transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-sm text-congress-blue hover:text-prussian-blue transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Host
      </button>
    </div>
  );
}
