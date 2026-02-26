import { config } from '../config.js';

export function kubeArgs(): string[] {
  const ctx = config.kubernetes.context;
  return ctx ? ['--context', ctx] : [];
}

export function helmContextArgs(): string[] {
  const ctx = config.kubernetes.context;
  return ctx ? ['--kube-context', ctx] : [];
}

export function kubeEnv(): Record<string, string> {
  const kc = config.kubernetes.kubeconfig;
  return kc ? { KUBECONFIG: kc } : {};
}
