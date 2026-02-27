import { execa } from 'execa';
import type { Pod, KubeEvent } from '@skaha-orc/shared';
import type { ServiceId } from '@skaha-orc/shared';
import { SERVICE_CATALOG } from '@skaha-orc/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { kubeArgs, kubeEnv } from './kube-args.js';

/**
 * List deployment (and statefulset) names in a namespace that belong to a helm release.
 * Helm releases use the release name as a prefix for all resources.
 */
async function getDeploymentNames(
  namespace: string,
  releaseName: string,
): Promise<{ deployments: string[]; statefulsets: string[] }> {
  const deployments: string[] = [];
  const statefulsets: string[] = [];

  try {
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(),
      'get',
      'deploy',
      '-n',
      namespace,
      '--no-headers',
      '-o',
      'custom-columns=NAME:.metadata.name',
    ], { env: { ...process.env, ...kubeEnv() } });
    for (const line of stdout.split('\n')) {
      const name = line.trim();
      if (name && name.startsWith(releaseName)) {
        deployments.push(name);
      }
    }
  } catch {
    // no deployments
  }

  try {
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(),
      'get',
      'statefulset',
      '-n',
      namespace,
      '--no-headers',
      '-o',
      'custom-columns=NAME:.metadata.name',
    ], { env: { ...process.env, ...kubeEnv() } });
    for (const line of stdout.split('\n')) {
      const name = line.trim();
      if (name && name.startsWith(releaseName)) {
        statefulsets.push(name);
      }
    }
  } catch {
    // no statefulsets
  }

  return { deployments, statefulsets };
}

export async function getPods(serviceId: ServiceId): Promise<Pod[]> {
  const def = SERVICE_CATALOG[serviceId];

  try {
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(),
      'get',
      'pods',
      '-n',
      def.namespace,
      '-o',
      'json',
    ], { env: { ...process.env, ...kubeEnv() } });

    const parsed = JSON.parse(stdout) as {
      items: Array<{
        metadata: { name: string; namespace: string };
        status: {
          phase: string;
          containerStatuses?: Array<{
            ready: boolean;
            restartCount: number;
          }>;
        };
        spec: { nodeName?: string };
      }>;
    };

    // Filter pods whose name starts with the release name (serviceId)
    const prefix = serviceId;
    const matching = parsed.items.filter((item) => item.metadata.name.startsWith(prefix));

    return matching.map((item) => {
      const containers = item.status.containerStatuses ?? [];
      const ready = containers.filter((c) => c.ready).length;
      const total = containers.length;
      const restarts = containers.reduce((sum, c) => sum + c.restartCount, 0);

      return {
        name: item.metadata.name,
        namespace: item.metadata.namespace,
        status: item.status.phase,
        ready: `${ready}/${total}`,
        restarts,
        age: '',
        node: item.spec.nodeName ?? '',
      };
    });
  } catch {
    return [];
  }
}

export async function getEvents(serviceId: ServiceId): Promise<KubeEvent[]> {
  const def = SERVICE_CATALOG[serviceId];

  try {
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(),
      'get',
      'events',
      '-n',
      def.namespace,
      '-o',
      'json',
    ], { env: { ...process.env, ...kubeEnv() } });

    const parsed = JSON.parse(stdout) as {
      items: Array<{
        type: string;
        reason: string;
        message: string;
        source: { component?: string };
        count?: number;
        involvedObject?: { name?: string };
      }>;
    };

    // Filter events related to this service's resources
    const prefix = serviceId;
    return parsed.items
      .filter((item) => item.involvedObject?.name?.startsWith(prefix))
      .map((item) => ({
        type: item.type,
        reason: item.reason,
        message: item.message,
        source: item.source.component ?? '',
        age: '',
        count: item.count ?? 1,
      }));
  } catch {
    return [];
  }
}

export async function scaleDeployment(
  namespace: string,
  serviceId: ServiceId,
  replicas: number,
): Promise<{ success: boolean; output: string }> {
  const { deployments, statefulsets } = await getDeploymentNames(namespace, serviceId);

  if (deployments.length === 0 && statefulsets.length === 0) {
    return { success: false, output: `No deployments/statefulsets found for ${serviceId}` };
  }

  const outputs: string[] = [];
  let allSuccess = true;

  for (const deploy of deployments) {
    try {
      const { stdout } = await execa(config.kubectlBinary, [
        ...kubeArgs(),
        'scale',
        `deployment/${deploy}`,
        '--replicas',
        String(replicas),
        '-n',
        namespace,
      ], { env: { ...process.env, ...kubeEnv() } });
      outputs.push(stdout);
    } catch (err) {
      allSuccess = false;
      outputs.push(`Failed to scale ${deploy}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const sts of statefulsets) {
    try {
      const { stdout } = await execa(config.kubectlBinary, [
        ...kubeArgs(),
        'scale',
        `statefulset/${sts}`,
        '--replicas',
        String(replicas),
        '-n',
        namespace,
      ], { env: { ...process.env, ...kubeEnv() } });
      outputs.push(stdout);
    } catch (err) {
      allSuccess = false;
      outputs.push(`Failed to scale ${sts}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info({ serviceId, replicas, deployments, statefulsets }, 'Scaled resources');
  return { success: allSuccess, output: outputs.join('\n') };
}

/**
 * Check if a service is paused: helm release is deployed but all deployments have 0 replicas.
 */
export async function isServicePaused(serviceId: ServiceId): Promise<boolean> {
  const def = SERVICE_CATALOG[serviceId];
  if (def.chartSource.type === 'kubectl' || def.chartSource.type === 'haproxy') return false;

  const { deployments } = await getDeploymentNames(def.namespace, serviceId);
  if (deployments.length === 0) return false;

  try {
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(),
      'get',
      'deploy',
      ...deployments,
      '-n',
      def.namespace,
      '-o',
      'json',
    ], { env: { ...process.env, ...kubeEnv() } });

    const parsed = JSON.parse(stdout) as {
      kind?: string;
      spec?: { replicas?: number };
      items?: Array<{ spec?: { replicas?: number } }>;
    };

    // kubectl returns a List for multiple names, single object for one name
    const items = parsed.kind === 'List' ? (parsed.items ?? []) : [parsed];
    if (items.length === 0) return false;

    const replicaCounts = items.map((item) => item.spec?.replicas ?? 1);
    return replicaCounts.every((r) => r === 0);
  } catch {
    return false;
  }
}

/**
 * Run a command inside a pod via kubectl exec.
 * Returns stdout on success, throws on failure.
 */
export async function kubectlExec(
  namespace: string,
  podPrefix: string,
  command: string[],
): Promise<string> {
  // Find the pod by prefix
  const pods = await getPodsByPrefix(namespace, podPrefix);
  if (pods.length === 0) {
    throw new Error(`No running pod found with prefix "${podPrefix}" in namespace "${namespace}"`);
  }
  const podName = pods[0]!;

  const { stdout } = await execa(config.kubectlBinary, [
    ...kubeArgs(),
    'exec',
    podName,
    '-n',
    namespace,
    '--',
    ...command,
  ], { env: { ...process.env, ...kubeEnv() } });
  return stdout;
}

async function getPodsByPrefix(namespace: string, prefix: string): Promise<string[]> {
  try {
    const { stdout } = await execa(config.kubectlBinary, [
      ...kubeArgs(),
      'get',
      'pods',
      '-n',
      namespace,
      '--field-selector=status.phase=Running',
      '--no-headers',
      '-o',
      'custom-columns=NAME:.metadata.name',
    ], { env: { ...process.env, ...kubeEnv() } });
    return stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith(prefix));
  } catch {
    return [];
  }
}

export function streamPodLogs(
  namespace: string,
  podName: string,
  onData: (line: string) => void,
  onError: (err: Error) => void,
): () => void {
  const proc = execa(config.kubectlBinary, [
    ...kubeArgs(),
    'logs',
    '-f',
    podName,
    '-n',
    namespace,
    '--tail=200',
  ], { env: { ...process.env, ...kubeEnv() } });

  proc.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) onData(line);
    }
  });

  proc.catch((err) => {
    if (!String(err).includes('SIGTERM')) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  return () => {
    proc.kill('SIGTERM');
  };
}
