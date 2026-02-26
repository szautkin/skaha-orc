import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HAProxyDeployMode } from '@skaha-orc/shared';
import { haproxyApi } from '@/lib/haproxy-api';

export function useHAProxyConfig() {
  return useQuery({
    queryKey: ['haproxy', 'config'],
    queryFn: haproxyApi.getConfig,
  });
}

export function useHAProxyStatus() {
  return useQuery({
    queryKey: ['haproxy', 'status'],
    queryFn: () => haproxyApi.getStatus(),
    refetchInterval: 10_000,
  });
}

export function useSaveHAProxyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => haproxyApi.saveConfig(content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['haproxy', 'config'] }),
  });
}

export function useTestHAProxyConfig() {
  return useMutation({
    mutationFn: () => haproxyApi.testConfig(),
  });
}

export function useReloadHAProxy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: HAProxyDeployMode) => haproxyApi.reload(mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['haproxy'] }),
  });
}

export function useDeployHAProxy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: HAProxyDeployMode) => haproxyApi.deploy(mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['haproxy'] }),
  });
}

export function useStopHAProxy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: HAProxyDeployMode) => haproxyApi.stop(mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['haproxy'] }),
  });
}

export function useHAProxyRoutes() {
  return useQuery({
    queryKey: ['haproxy', 'routes'],
    queryFn: haproxyApi.getRoutes,
  });
}

export function useGenerateHAProxyConfig() {
  return useMutation({
    mutationFn: (options?: { enableSsl?: boolean }) =>
      haproxyApi.generateConfig(options),
  });
}

export function useHAProxyCertInfo() {
  return useQuery({
    queryKey: ['haproxy', 'cert'],
    queryFn: haproxyApi.getCertInfo,
  });
}

export function useGenerateHAProxyCert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { cn: string; days: number }) => haproxyApi.generateCert(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['haproxy', 'cert'] }),
  });
}

export function useHAProxyPreflight(mode: HAProxyDeployMode) {
  return useQuery({
    queryKey: ['haproxy', 'preflight', mode],
    queryFn: () => haproxyApi.preflight(mode),
    refetchInterval: 15_000,
  });
}

export function useHAProxyLogs(mode: HAProxyDeployMode, enabled: boolean) {
  return useQuery({
    queryKey: ['haproxy', 'logs', mode],
    queryFn: () => haproxyApi.getLogs(mode),
    enabled,
    refetchInterval: enabled ? 10_000 : false,
  });
}
