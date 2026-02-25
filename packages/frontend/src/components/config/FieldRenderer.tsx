import type { UseFormRegister, FieldErrors, Control } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { ExtraHostsEditor } from './ExtraHostsEditor';
import type { ExtraHost } from '@skaha-orc/shared';

type FieldType = 'text' | 'number' | 'boolean' | 'password' | 'textarea' | 'select' | 'extra-hosts';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  path: string;
  options?: string[];
  placeholder?: string;
}

interface FieldRendererProps {
  field: FieldDef;
  register: UseFormRegister<Record<string, unknown>>;
  errors: FieldErrors;
  control?: Control<Record<string, unknown>>;
}

export function FieldRenderer({ field, register, control }: FieldRendererProps) {
  const baseClass =
    'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-congress-blue focus:ring-1 focus:ring-congress-blue outline-none';

  if (field.type === 'extra-hosts') {
    if (!control) return null;
    return <ExtraHostsField field={field} control={control} />;
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          {...register(field.path)}
          className="rounded border-gray-300 text-congress-blue focus:ring-congress-blue"
        />
        {field.label}
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
        <textarea
          {...register(field.path)}
          rows={3}
          className={baseClass}
          placeholder={field.placeholder}
        />
      </div>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
        <select {...register(field.path)} className={baseClass}>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
      <input
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        {...register(field.path)}
        className={baseClass}
        placeholder={field.placeholder}
      />
    </div>
  );
}

function ExtraHostsField({
  field,
  control,
}: {
  field: FieldDef;
  control: Control<Record<string, unknown>>;
}) {
  const {
    field: { value, onChange },
  } = useController({ name: field.path, control, defaultValue: [] });

  return (
    <div className="col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
      <ExtraHostsEditor value={(value as ExtraHost[]) ?? []} onChange={onChange} />
    </div>
  );
}
