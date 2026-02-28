import type { DeploymentStatus } from './deployment.js';
import type { ServiceDefinition } from './services.js';
import type { ServiceConfig } from './configs.js';
import type { Pod, KubeEvent } from './kubernetes.js';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ServiceWithStatus extends ServiceDefinition {
  status: DeploymentStatus;
}

export interface ServiceDetailResponse {
  service: ServiceWithStatus;
  config: ServiceConfig;
}

export interface ServiceListResponse {
  services: ServiceWithStatus[];
}

export interface PodsResponse {
  pods: Pod[];
}

export interface EventsResponse {
  events: KubeEvent[];
}

export interface DeployRequest {
  dryRun?: boolean;
}

export interface ConfigUpdateRequest {
  config: Record<string, unknown>;
}

export interface PreflightCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  remedy?: string;
}

export interface PreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
}

export interface SyncResult {
  name: string;
  status: 'applied' | 'skipped' | 'failed';
  message?: string;
}
