import { resolve } from 'path';
import { PLATFORM_HOSTNAME } from '@skaha-orc/shared';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  helmConfigDir: process.env.HELM_CONFIG_DIR ?? './helm-values',
  chartBaseDir: process.env.CHART_BASE_DIR ?? './charts',
  platformHostname: process.env.PLATFORM_HOSTNAME ?? PLATFORM_HOSTNAME,
  helmBinary: process.env.HELM_BINARY ?? 'helm',
  kubectlBinary: process.env.KUBECTL_BINARY ?? 'kubectl',
  helmRepos: {
    'science-platform': 'https://images.opencadc.org/chartrepo/platform',
    'science-platform-client': 'https://images.opencadc.org/chartrepo/client',
    'bitnami': 'https://charts.bitnami.com/bitnami',
  },
  defaultNamespace: 'skaha-system',
  statusPollInterval: 10_000,
  healthCheck: {
    podReadyTimeoutMs: 120_000,
    podPollIntervalMs: 3_000,
    httpTimeoutMs: 10_000,
  },
  haproxy: {
    configPath: process.env.HAPROXY_CONFIG_PATH ?? './haproxy/haproxy.cfg',
    binary: process.env.HAPROXY_BINARY ?? 'haproxy',
    dockerImage: 'haproxy:2.9-alpine',
    dockerContainerName: 'skaha-haproxy',
    k8sNamespace: 'skaha-system',
    k8sDeploymentName: 'haproxy',
  },
  kubernetes: {
    context: process.env.KUBE_CONTEXT ?? '',
    kubeconfig: process.env.KUBECONFIG ?? '',
  },
} as const;

/**
 * Resolves a bare filename to an absolute path inside helmConfigDir.
 * Rejects filenames containing `..` or `/` to prevent directory traversal.
 * @param filename - Bare YAML filename (e.g. "base-values.yaml").
 * @throws If the filename contains path separators or traversal sequences.
 */
export function valuesFilePath(filename: string): string {
  if (filename.includes('..') || filename.includes('/')) {
    throw new Error(`Invalid values filename: ${filename}`);
  }
  return resolve(config.helmConfigDir, filename);
}
