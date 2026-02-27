import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useConfigWarnings(serviceId: string) {
  return useQuery({
    queryKey: ['services', serviceId, 'config-warnings'],
    queryFn: () => api.getConfigWarnings(serviceId),
  });
}
