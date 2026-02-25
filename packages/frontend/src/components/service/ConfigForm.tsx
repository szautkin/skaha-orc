import type { ServiceId } from '@skaha-orc/shared';
import { useServiceConfig, useSaveConfig } from '@/hooks/use-services';
import { DynamicForm } from '@/components/config/DynamicForm';
import { SERVICE_FIELD_DEFS } from '@/components/config/field-definitions';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConfigFormProps {
  serviceId: ServiceId;
}

export function ConfigForm({ serviceId }: ConfigFormProps) {
  const { data: config, isLoading } = useServiceConfig(serviceId);
  const saveConfig = useSaveConfig(serviceId);
  const sections = SERVICE_FIELD_DEFS[serviceId];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-congress-blue" />
      </div>
    );
  }

  if (!sections) {
    return (
      <div className="text-sm text-neutral-gray py-8 text-center">
        No configurable fields for this service.
        {config && Object.keys(config).length > 0 && (
          <p className="mt-2">Values file is managed directly on disk.</p>
        )}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-sm text-neutral-gray py-8 text-center">
        No configuration file found.
      </div>
    );
  }

  return (
    <DynamicForm
      sections={sections}
      values={config}
      isSaving={saveConfig.isPending}
      onSave={(data) => {
        saveConfig.mutate(data, {
          onSuccess: () => toast.success('Configuration saved'),
          onError: (err) => toast.error(`Save failed: ${err.message}`),
        });
      }}
    />
  );
}
