import { useNavigate } from 'react-router-dom';
import { Play, Server } from 'lucide-react';
import type { ServiceWithStatus } from '@skaha-orc/shared';
import { StatusBadge } from './StatusBadge';
import { useDeploy } from '@/hooks/use-services';
import { toast } from 'sonner';

interface ServiceCardProps {
  service: ServiceWithStatus;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const navigate = useNavigate();
  const deploy = useDeploy(service.id);

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 hover:border-congress-blue hover:shadow-sm transition-all cursor-pointer"
      onClick={() => navigate(`/services/${service.id}`)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-congress-blue" />
          <h3 className="font-medium text-sm">{service.name}</h3>
        </div>
        <StatusBadge phase={service.status.phase} />
      </div>

      <p className="text-xs text-neutral-gray mb-3 line-clamp-2">{service.description}</p>

      <div className="flex items-center justify-between text-xs text-neutral-gray">
        <span>
          {service.status.podCount > 0
            ? `${service.status.readyPods}/${service.status.podCount} pods`
            : 'No pods'}
        </span>
        {service.status.revision && <span>Rev {service.status.revision}</span>}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <button
          className="flex items-center gap-1.5 text-xs font-medium text-congress-blue hover:text-prussian-blue transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            deploy.mutate(false, {
              onSuccess: () => toast.success(`${service.name} deployed`),
              onError: (err) => toast.error(`Deploy failed: ${err.message}`),
            });
          }}
          disabled={deploy.isPending}
        >
          <Play className="w-3 h-3" />
          {deploy.isPending ? 'Deploying...' : 'Deploy'}
        </button>
      </div>
    </div>
  );
}
