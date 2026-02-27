import { Plus, Trash2 } from 'lucide-react';

interface ServiceEntry {
  id: string;
  url: string;
}

interface ServiceEntriesEditorProps {
  value: ServiceEntry[];
  onChange: (value: ServiceEntry[]) => void;
}

export function ServiceEntriesEditor({ value, onChange }: ServiceEntriesEditorProps) {
  const entries = value ?? [];

  const updateRow = (index: number, field: keyof ServiceEntry, v: string) => {
    const next = entries.map((e, i) => (i === index ? { ...e, [field]: v } : e));
    onChange(next);
  };

  const addRow = () => {
    onChange([...entries, { id: '', url: '' }]);
  };

  const removeRow = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="col-span-2 space-y-2">
      {entries.length > 0 && (
        <div className="grid grid-cols-[1fr_2fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
          <span>IVOA Identifier</span>
          <span>Capabilities URL</span>
          <span className="w-8" />
        </div>
      )}

      {entries.map((entry, index) => (
        <div key={index} className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <input
            type="text"
            value={entry.id}
            onChange={(e) => updateRow(index, 'id', e.target.value)}
            placeholder="ivo://cadc.nrc.ca/service"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none"
          />
          <input
            type="text"
            value={entry.url}
            onChange={(e) => updateRow(index, 'url', e.target.value)}
            placeholder="https://host/service/capabilities"
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
        Add Service Entry
      </button>
    </div>
  );
}
