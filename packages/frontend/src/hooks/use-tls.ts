import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useTlsStatus() {
  return useQuery({
    queryKey: ['tls', 'status'],
    queryFn: api.getTlsStatus,
    refetchInterval: 30_000,
  });
}

export function useServiceTrust() {
  return useQuery({
    queryKey: ['tls', 'service-trust'],
    queryFn: api.getServiceTrust,
  });
}

export function useApplyTrust() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.applyTrust,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tls'] });
    },
  });
}

export function useUploadLeCert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ certPem, keyPem }: { certPem: string; keyPem: string }) =>
      api.uploadLeCert(certPem, keyPem),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tls'] });
      void queryClient.invalidateQueries({ queryKey: ['certs'] });
    },
  });
}
