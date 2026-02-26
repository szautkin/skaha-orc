import type {
  HAProxyConfigResponse,
  HAProxyTestConfigResponse,
  HAProxyStatus,
  HAProxyDeployMode,
  HAProxyPreflightResponse,
  HAProxyCertInfo,
  ApiResponse,
} from '@skaha-orc/shared';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error ?? 'Request failed');
  }

  return json.data as T;
}

export const haproxyApi = {
  getConfig: () => request<HAProxyConfigResponse>('/haproxy/config'),

  saveConfig: (content: string) =>
    request<{ message: string }>('/haproxy/config', {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  testConfig: () => request<HAProxyTestConfigResponse>('/haproxy/test', { method: 'POST' }),

  getStatus: (mode?: HAProxyDeployMode) => {
    const query = mode ? `?mode=${mode}` : '';
    return request<HAProxyStatus>(`/haproxy/status${query}`);
  },

  reload: (mode: HAProxyDeployMode) =>
    request<{ message: string; output: string }>('/haproxy/reload', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  deploy: (mode: HAProxyDeployMode) =>
    request<{ message: string; output: string }>('/haproxy/deploy', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  stop: (mode: HAProxyDeployMode) =>
    request<{ message: string; output: string }>('/haproxy/stop', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  getRoutes: () =>
    request<Array<{
      serviceId: string;
      serviceName: string;
      endpointPath: string;
      k8sServiceName: string;
      k8sServicePort: number;
      backendName: string;
    }>>('/haproxy/routes'),

  generateConfig: (options?: { enableSsl?: boolean }) =>
    request<{ content: string }>('/haproxy/generate', {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined,
    }),

  getCertInfo: () => request<HAProxyCertInfo>('/haproxy/cert'),

  generateCert: (body: { cn: string; days: number }) =>
    request<HAProxyCertInfo>('/haproxy/cert/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  preflight: (mode: HAProxyDeployMode) =>
    request<HAProxyPreflightResponse>(`/haproxy/preflight?mode=${mode}`),

  getLogs: (mode: HAProxyDeployMode, tail = 50) =>
    request<{ logs: string }>(`/haproxy/logs?mode=${mode}&tail=${tail}`),
};
