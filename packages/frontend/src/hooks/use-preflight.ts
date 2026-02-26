import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function usePreflight() {
  return useQuery({
    queryKey: ['preflight'],
    queryFn: api.getPreflight,
    staleTime: 30_000,
    retry: false,
  });
}
