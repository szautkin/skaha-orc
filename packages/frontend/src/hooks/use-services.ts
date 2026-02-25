import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ServiceId } from '@skaha-orc/shared';
import { api } from '@/lib/api';
import { useServicePhaseStore } from '@/stores/service-phase-store';

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: api.getServices,
    refetchInterval: 10_000,
  });
}

export function useService(id: string) {
  return useQuery({
    queryKey: ['services', id],
    queryFn: () => api.getService(id),
  });
}

export function useServiceConfig(id: string) {
  return useQuery({
    queryKey: ['services', id, 'config'],
    queryFn: () => api.getConfig(id),
  });
}

export function useSaveConfig(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Record<string, unknown>) => api.saveConfig(id, config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services', id, 'config'] });
    },
  });
}

export function useDeploy(id: string) {
  const queryClient = useQueryClient();
  const { setOptimistic, clearOverride } = useServicePhaseStore.getState();

  return useMutation({
    mutationFn: (dryRun?: boolean) => api.deploy(id, dryRun),
    onMutate: () => {
      setOptimistic(id as ServiceId, 'deploying');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => {
      clearOverride(id as ServiceId);
    },
  });
}

export function useUninstall(id: string) {
  const queryClient = useQueryClient();
  const { setOptimistic, clearOverride } = useServicePhaseStore.getState();

  return useMutation({
    mutationFn: () => api.uninstall(id),
    onMutate: () => {
      setOptimistic(id as ServiceId, 'uninstalling');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => {
      clearOverride(id as ServiceId);
    },
  });
}

export function usePause(id: string) {
  const queryClient = useQueryClient();
  const { setOptimistic, clearOverride } = useServicePhaseStore.getState();

  return useMutation({
    mutationFn: () => api.pause(id),
    onMutate: () => {
      setOptimistic(id as ServiceId, 'paused');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => {
      clearOverride(id as ServiceId);
    },
  });
}

export function useResume(id: string) {
  const queryClient = useQueryClient();
  const { setOptimistic, clearOverride } = useServicePhaseStore.getState();

  return useMutation({
    mutationFn: () => api.resume(id),
    onMutate: () => {
      setOptimistic(id as ServiceId, 'deploying');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => {
      clearOverride(id as ServiceId);
    },
  });
}

export function useStopAll() {
  const queryClient = useQueryClient();
  const { setBulkOptimistic, clearAll } = useServicePhaseStore.getState();

  return useMutation({
    mutationFn: (serviceIds: string[]) => api.stopAll(serviceIds),
    onMutate: (serviceIds) => {
      setBulkOptimistic(serviceIds as ServiceId[], 'uninstalling');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => {
      clearAll();
    },
  });
}

export function usePauseAll() {
  const queryClient = useQueryClient();
  const { setBulkOptimistic, clearAll } = useServicePhaseStore.getState();

  return useMutation({
    mutationFn: (serviceIds: string[]) => api.pauseAll(serviceIds),
    onMutate: (serviceIds) => {
      setBulkOptimistic(serviceIds as ServiceId[], 'paused');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => {
      clearAll();
    },
  });
}

export function useResumeAll() {
  const queryClient = useQueryClient();
  const { setBulkOptimistic, clearAll } = useServicePhaseStore.getState();

  return useMutation({
    mutationFn: (serviceIds: string[]) => api.resumeAll(serviceIds),
    onMutate: (serviceIds) => {
      setBulkOptimistic(serviceIds as ServiceId[], 'deploying');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => {
      clearAll();
    },
  });
}
