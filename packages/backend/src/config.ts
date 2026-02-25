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
} as const;

export function valuesFilePath(filename: string): string {
  return resolve(config.helmConfigDir, filename);
}
