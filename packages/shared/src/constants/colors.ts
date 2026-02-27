import type { DeploymentPhase } from '../types/deployment.js';
import type { ServiceTier, DeployPhaseNumber } from '../types/services.js';

export const UVIC_COLORS = {
  congressBlue: '#005493',
  prussianBlue: '#002754',
  buttercupYellow: '#f5aa1c',
  tallPoppyRed: '#c63527',
  successGreen: '#16a34a',
  lightBlue: '#e8f4fd',
  neutralGray: '#64748b',
} as const;

export const PHASE_COLORS: Record<DeploymentPhase, string> = {
  not_installed: UVIC_COLORS.neutralGray,
  pending: UVIC_COLORS.neutralGray,
  deploying: UVIC_COLORS.buttercupYellow,
  deployed: UVIC_COLORS.successGreen,
  waiting_ready: UVIC_COLORS.buttercupYellow,
  healthy: UVIC_COLORS.successGreen,
  paused: UVIC_COLORS.congressBlue,
  failed: UVIC_COLORS.tallPoppyRed,
  uninstalling: UVIC_COLORS.buttercupYellow,
};

export const TIER_COLORS: Record<ServiceTier, string> = {
  core: UVIC_COLORS.congressBlue,
  recommended: UVIC_COLORS.successGreen,
  site: UVIC_COLORS.neutralGray,
};

export const PHASE_LABELS: Record<DeploymentPhase, string> = {
  not_installed: 'Not Installed',
  pending: 'Pending',
  deploying: 'Deploying',
  deployed: 'Deployed',
  waiting_ready: 'Waiting Ready',
  healthy: 'Healthy',
  paused: 'Paused',
  failed: 'Failed',
  uninstalling: 'Uninstalling',
};

export const DEPLOY_PHASE_COLORS: Record<DeployPhaseNumber, string> = {
  1: '#94a3b8', // slate-400 — Foundation
  2: '#8b5cf6', // violet-500 — Identity & Discovery
  3: UVIC_COLORS.congressBlue, // Core Services
  4: UVIC_COLORS.successGreen, // Session & UI
};

export const DEPLOY_PHASE_BG: Record<DeployPhaseNumber, string> = {
  1: '#f1f5f9', // slate-100
  2: '#f5f3ff', // violet-50
  3: '#e8f4fd', // lightBlue
  4: '#f0fdf4', // green-50
};
