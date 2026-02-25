import type { ServiceId } from '@skaha-orc/shared';
import { usePods } from '@/hooks/use-pods';
import { Loader2 } from 'lucide-react';

interface PodListProps {
  serviceId: ServiceId;
  onSelectPod: (podName: string) => void;
  selectedPod: string | null;
}

export function PodList({ serviceId, onSelectPod, selectedPod }: PodListProps) {
  const { data, isLoading } = usePods(serviceId);

  if (isLoading) {
    return <Loader2 className="w-5 h-5 animate-spin text-congress-blue" />;
  }

  const pods = data?.pods ?? [];

  if (pods.length === 0) {
    return <p className="text-sm text-neutral-gray">No pods found for this service.</p>;
  }

  return (
    <div className="space-y-2">
      {pods.map((pod) => (
        <div
          key={pod.name}
          className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
            selectedPod === pod.name
              ? 'border-congress-blue bg-light-blue'
              : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => onSelectPod(pod.name)}
        >
          <div>
            <p className="text-sm font-medium">{pod.name}</p>
            <p className="text-xs text-neutral-gray">
              Ready: {pod.ready} | Restarts: {pod.restarts}
            </p>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              pod.status === 'Running'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {pod.status}
          </span>
        </div>
      ))}
    </div>
  );
}
