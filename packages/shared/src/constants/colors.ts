import type { DeploymentPhase } from '../types/deployment.js';

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
