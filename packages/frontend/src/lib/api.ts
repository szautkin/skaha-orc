import type {
  ApiResponse,
  ServiceWithStatus,
  CertInfo,
  CaInfo,
  GenerateCertRequest,
  GenerateCaRequest,
  UploadCaRequest,
  PreflightResult,
  PlatformOidcSettings,
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

export const api = {
  getPreflight: () => request<PreflightResult>('/health/preflight'),

  getServices: () => request<ServiceWithStatus[]>('/services'),

  getService: (id: string) => request<ServiceWithStatus>(`/services/${id}`),

  getConfig: (id: string) => request<Record<string, unknown>>(`/services/${id}/config`),

  saveConfig: (id: string, config: Record<string, unknown>) =>
    request<{ message: string }>(`/services/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),

  deploy: (id: string, dryRun = false) =>
    request<{ output: string }>(`/services/${id}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ dryRun }),
    }),

  uninstall: (id: string) =>
    request<{ output: string }>(`/services/${id}/uninstall`, { method: 'POST' }),

  pause: (id: string) =>
    request<{ output: string }>(`/services/${id}/pause`, { method: 'POST' }),

  resume: (id: string) =>
    request<{ output: string }>(`/services/${id}/resume`, { method: 'POST' }),

  deployAll: (serviceIds: string[], dryRun = false) =>
    request<unknown>('/deploy-all', {
      method: 'POST',
      body: JSON.stringify({ serviceIds, dryRun }),
    }),

  stopAll: (serviceIds: string[]) =>
    request<unknown>('/stop-all', {
      method: 'POST',
      body: JSON.stringify({ serviceIds, dryRun: false }),
    }),

  pauseAll: (serviceIds: string[]) =>
    request<unknown>('/pause-all', {
      method: 'POST',
      body: JSON.stringify({ serviceIds, dryRun: false }),
    }),

  resumeAll: (serviceIds: string[]) =>
    request<unknown>('/resume-all', {
      method: 'POST',
      body: JSON.stringify({ serviceIds, dryRun: false }),
    }),

  getConfigWarnings: (id: string) =>
    request<{ warnings: string[] }>(`/services/${id}/config-warnings`),

  getPods: (id: string) =>
    request<{ pods: Array<{ name: string; status: string; ready: string; restarts: number }> }>(
      `/services/${id}/pods`,
    ),

  getCerts: (serviceId: string) => request<CertInfo[]>(`/certs/${serviceId}`),

  getCaInfo: () => request<CaInfo>('/certs/ca'),

  generateCert: (serviceId: string, body: GenerateCertRequest) =>
    request<{ message: string }>(`/certs/${serviceId}/generate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  generateCA: (body: GenerateCaRequest) =>
    request<CaInfo>('/certs/ca/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  uploadCA: (body: UploadCaRequest) =>
    request<CaInfo>('/certs/ca/upload', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getHostIp: () => request<{ ip: string | null; hostname: string }>('/services/host-ip'),

  getHostIps: () =>
    request<{ ip: string; iface: string; virtual: boolean }[]>('/services/host-ips'),

  setHostIp: (ip: string) =>
    request<{ updated: number }>('/services/host-ip', {
      method: 'PUT',
      body: JSON.stringify({ ip }),
    }),

  getKubeContexts: () =>
    request<{ contexts: string[]; current: string | null }>('/kubernetes/contexts'),

  setKubeContext: (context: string) =>
    request<{ context: string }>('/kubernetes/context', {
      method: 'PUT',
      body: JSON.stringify({ context }),
    }),

  getOidcSettings: () => request<PlatformOidcSettings>('/oidc/settings'),

  saveOidcSettings: (settings: PlatformOidcSettings) =>
    request<{ updated: number }>('/oidc/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  getDexUsers: () =>
    request<Array<{ email: string; username: string; userID: string; hash: string }>>('/dex/users'),

  saveDexUsers: (users: Array<{ email: string; username: string; userID: string; hash: string }>) =>
    request<{ message: string }>('/dex/users', {
      method: 'PUT',
      body: JSON.stringify({ users }),
    }),

  hashPassword: (password: string) =>
    request<{ hash: string }>('/dex/hash-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  autoFix: (id: string) =>
    request<{ fixes: string[] }>(`/services/${id}/auto-fix`, { method: 'POST' }),

  runTests: (id: string) =>
    request<{ results: Array<{ name: string; status: 'pass' | 'fail' | 'skip'; message: string; durationMs: number }> }>(
      `/services/${id}/test`,
      { method: 'POST' },
    ),
};

export function createSSEStream(path: string, onMessage: (data: unknown) => void): () => void {
  const eventSource = new EventSource(`${BASE}${path}`);

  eventSource.onmessage = (event) => {
    try {
      const data: unknown = JSON.parse(event.data as string);
      onMessage(data);
    } catch {
      // ignore parse errors
    }
  };

  return () => eventSource.close();
}
