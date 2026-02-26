import { resolve } from 'path';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  helmConfigDir: process.env.HELM_CONFIG_DIR ?? '/Users/szautkin/reviews/helm_config',
  helmBinary: process.env.HELM_BINARY ?? 'helm',
  kubectlBinary: process.env.KUBECTL_BINARY ?? 'kubectl',
  helmRepos: {
    'science-platform': 'https://images.opencadc.org/chartrepo/platform',
    'science-platform-client': 'https://images.opencadc.org/chartrepo/client',
  },
  defaultNamespace: 'skaha-system',
  statusPollInterval: 10_000,
  healthCheck: {
    podReadyTimeoutMs: 120_000,
    podPollIntervalMs: 3_000,
    httpTimeoutMs: 10_000,
  },
  haproxy: {
    configPath: process.env.HAPROXY_CONFIG_PATH ?? '/Users/szautkin/reviews/ha_prox_cfg/haprox.cfg',
    binary: process.env.HAPROXY_BINARY ?? 'haproxy',
    dockerImage: 'haproxy:2.9-alpine',
    dockerContainerName: 'skaha-haproxy',
    k8sNamespace: 'skaha-system',
    k8sDeploymentName: 'haproxy',
  },
} as const;

export function valuesFilePath(filename: string): string {
  return resolve(config.helmConfigDir, filename);
}
