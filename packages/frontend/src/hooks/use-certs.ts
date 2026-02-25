import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { GenerateCertRequest, GenerateCaRequest, UploadCaRequest } from '@skaha-orc/shared';
import { api } from '@/lib/api';

export function useCerts(serviceId: string) {
  return useQuery({
    queryKey: ['certs', serviceId],
    queryFn: () => api.getCerts(serviceId),
  });
}

export function useCaInfo() {
  return useQuery({
    queryKey: ['certs', 'ca'],
    queryFn: api.getCaInfo,
  });
}

export function useGenerateCert(serviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: GenerateCertRequest) => api.generateCert(serviceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certs', serviceId] });
      void queryClient.invalidateQueries({ queryKey: ['services', serviceId, 'config'] });
    },
  });
}

export function useGenerateCA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: GenerateCaRequest) => api.generateCA(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certs', 'ca'] });
    },
  });
}

export function useUploadCA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UploadCaRequest) => api.uploadCA(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certs', 'ca'] });
    },
  });
}
