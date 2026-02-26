import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlatformOidcSettings } from '@skaha-orc/shared';
import { api } from '@/lib/api';

export function useOidcSettings() {
  return useQuery({
    queryKey: ['oidc-settings'],
    queryFn: api.getOidcSettings,
  });
}

export function useSaveOidcSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: PlatformOidcSettings) => api.saveOidcSettings(settings),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['oidc-settings'] });
    },
  });
}
