import type { ServiceId } from './services.js';

export type DeploymentPhase =
  | 'not_installed'
  | 'pending'
  | 'deploying'
  | 'deployed'
  | 'paused'
  | 'failed'
  | 'uninstalling';

export interface DeploymentStatus {
  serviceId: ServiceId;
  phase: DeploymentPhase;
  revision: number | null;
  lastDeployed: string | null;
  helmStatus: string | null;
  podCount: number;
  readyPods: number;
  error: string | null;
}

export interface DeploymentEvent {
  type: 'phase_change' | 'log' | 'error' | 'complete';
  serviceId: ServiceId;
  phase?: DeploymentPhase;
  message: string;
  timestamp: string;
}

export interface DeployAllRequest {
  serviceIds: ServiceId[];
  dryRun: boolean;
}

export interface DeployAllProgress {
  currentService: ServiceId | null;
  completedServices: ServiceId[];
  failedServices: ServiceId[];
  pendingServices: ServiceId[];
  events: DeploymentEvent[];
}
