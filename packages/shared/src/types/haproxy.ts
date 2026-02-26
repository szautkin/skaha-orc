export type HAProxyDeployMode = 'kubernetes' | 'docker' | 'process';

export interface HAProxyStatus {
  running: boolean;
  deployMode: HAProxyDeployMode | null;
  configValid: boolean | null;
  configValidationMessage: string | null;
  lastReloaded: string | null;
  error: string | null;
}

export interface HAProxyConfigResponse {
  content: string;
  lastModified: string;
}

export interface HAProxySaveConfigRequest {
  content: string;
}

export interface HAProxyTestConfigResponse {
  valid: boolean;
  output: string;
}

export interface HAProxyDeployRequest {
  mode: HAProxyDeployMode;
}

export interface HAProxyPrereqCheck {
  id: string;
  label: string;
  status: 'ok' | 'missing' | 'error';
  message: string;
  remedy?: string;
}

export interface HAProxyPreflightResponse {
  mode: HAProxyDeployMode;
  ready: boolean;
  checks: HAProxyPrereqCheck[];
}

export interface HAProxyCertInfo {
  exists: boolean;
  path: string;
  subject?: string;
  issuer?: string;
  notAfter?: string;
  isExpired?: boolean;
  daysUntilExpiry?: number;
}
