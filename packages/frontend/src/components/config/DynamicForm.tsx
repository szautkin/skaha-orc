import { useForm, FormProvider } from 'react-hook-form';
import { Save, Loader2 } from 'lucide-react';
import yaml from 'js-yaml';
import { getNestedValue, setNestedValue } from '@skaha-orc/shared';
import { FieldRenderer, type FieldDef } from './FieldRenderer';

export interface FieldSection {
  title: string;
  fields: FieldDef[];
}

interface DynamicFormProps {
  sections: FieldSection[];
  values: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
  isSaving: boolean;
}

function flattenToFormValues(
  sections: FieldSection[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const section of sections) {
    for (const field of section.fields) {
      const val = getNestedValue(values, field.path);
      // For array/object fields (like extra-hosts), preserve as-is
      if (field.type === 'extra-hosts') {
        flat[field.path] = val ?? [];
      } else if (field.type === 'textarea' && val != null && typeof val === 'object') {
        // Serialize arrays/objects to YAML text for textarea display
        flat[field.path] = yaml.dump(val, { flowLevel: -1, lineWidth: -1 }).trim();
      } else {
        flat[field.path] = val ?? '';
      }
    }
  }
  return flat;
}

function unflattenFormValues(
  flat: Record<string, unknown>,
  original: Record<string, unknown>,
  sections: FieldSection[],
): Record<string, unknown> {
  // Build a set of textarea field paths for YAML parsing
  const textareaPaths = new Set<string>();
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type === 'textarea') textareaPaths.add(field.path);
    }
  }

  // Start with original so we preserve keys not in the form
  const result = structuredClone(original);
  for (const [path, value] of Object.entries(flat)) {
    if (textareaPaths.has(path) && typeof value === 'string' && value.trim()) {
      // Parse YAML text back to structured data
      try {
        const parsed = yaml.load(value);
        setNestedValue(result, path, parsed);
      } catch {
        // If YAML parse fails, store as-is
        setNestedValue(result, path, value);
      }
    } else {
      setNestedValue(result, path, value);
    }
  }
  return result;
}

export function DynamicForm({ sections, values, onSave, isSaving }: DynamicFormProps) {
  const defaultValues = flattenToFormValues(sections, values);

  const methods = useForm<Record<string, unknown>>({ defaultValues });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = methods;

  const onSubmit = (data: Record<string, unknown>) => {
    const merged = unflattenFormValues(data, values, sections);
    onSave(merged);
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-1">
              {section.title}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {section.fields.map((field) => (
                <FieldRenderer
                  key={field.path}
                  field={field}
                  register={register}
                  errors={errors}
                  control={control}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={!isDirty || isSaving}
            className="flex items-center gap-2 bg-congress-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-prussian-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
