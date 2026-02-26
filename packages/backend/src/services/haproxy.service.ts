import { readFile, writeFile, rename, stat, access } from 'fs/promises';
import { execa } from 'execa';
import type { HAProxyDeployMode, HAProxyStatus, HAProxyConfigResponse, HAProxyTestConfigResponse, HAProxyPreflightResponse, HAProxyPrereqCheck } from '@skaha-orc/shared';
import { SERVICE_IDS, SERVICE_CATALOG } from '@skaha-orc/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { eventBus } from '../sse/event-bus.js';
import { CA_CERT_PATH, HAPROXY_CERT_PATH } from './cert.service.js';

const { haproxy: haCfg } = config;

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function readHAProxyConfig(): Promise<HAProxyConfigResponse> {
  const content = await readFile(haCfg.configPath, 'utf-8');
  const stats = await stat(haCfg.configPath);
  return {
    content,
    lastModified: stats.mtime.toISOString(),
  };
}

export async function saveHAProxyConfig(content: string): Promise<void> {
  const tmpPath = `${haCfg.configPath}.tmp`;
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, haCfg.configPath);
  logger.info('HAProxy config saved');
}

export async function testHAProxyConfig(): Promise<HAProxyTestConfigResponse> {
  try {
    await stat(haCfg.configPath);
  } catch {
    return { valid: false, output: `Config file not found: ${haCfg.configPath}` };
  }

  // Try local binary first
  try {
    const { stdout, stderr } = await execa(haCfg.binary, ['-c', '-f', haCfg.configPath]);
    const output = (stdout + '\n' + stderr).trim();
    const valid = output.toLowerCase().includes('valid');
    return { valid, output };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'ENOENT') {
      const output = err instanceof Error ? (err as { stderr?: string }).stderr ?? err.message : String(err);
      return { valid: false, output: String(output) };
    }
  }

  // Fall back to Docker container
  try {
    const { stdout, stderr } = await execa('docker', [
      'run', '--rm',
      '-v', `${haCfg.configPath}:/usr/local/etc/haproxy/haproxy.cfg:ro`,
      haCfg.dockerImage,
      'haproxy', '-c', '-f', '/usr/local/etc/haproxy/haproxy.cfg',
    ]);
    const output = (stdout + '\n' + stderr).trim();
    const valid = output.toLowerCase().includes('valid');
    return { valid, output: `[docker] ${output}` };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOENT') {
      return { valid: false, output: 'HAProxy binary not found locally and Docker is not available' };
    }
    const output = err instanceof Error ? (err as { stderr?: string }).stderr ?? err.message : String(err);
    return { valid: false, output: `[docker] ${String(output)}` };
  }
}

export async function checkDeployPrereqs(mode: HAProxyDeployMode): Promise<HAProxyPreflightResponse> {
  logger.info({ mode }, 'HAProxy preflight: starting checks');
  const checks: HAProxyPrereqCheck[] = [];

  // Config file check — common to all modes
  try {
    await stat(haCfg.configPath);
    checks.push({ id: 'config_file', label: 'Config file', status: 'ok', message: `Found ${haCfg.configPath}` });
  } catch {
    checks.push({
      id: 'config_file',
      label: 'Config file',
      status: 'missing',
      message: `Not found: ${haCfg.configPath}`,
      remedy: `Generate a config from the editor, or create ${haCfg.configPath}`,
    });
  }

  if (mode === 'kubernetes') {
    // kubectl CLI
    try {
      await execa(config.kubectlBinary, ['version', '--client']);
      checks.push({ id: 'kubectl', label: 'kubectl CLI', status: 'ok', message: 'kubectl available' });
    } catch {
      checks.push({
        id: 'kubectl',
        label: 'kubectl CLI',
        status: 'missing',
        message: 'kubectl not found',
        remedy: 'brew install kubectl',
      });
    }

    // Cluster reachable
    try {
      await execa(config.kubectlBinary, ['cluster-info']);
      checks.push({ id: 'k8s_cluster', label: 'K8s cluster', status: 'ok', message: 'Cluster reachable' });
    } catch {
      checks.push({
        id: 'k8s_cluster',
        label: 'K8s cluster',
        status: 'missing',
        message: 'Cluster not reachable',
        remedy: 'Start minikube/Docker Desktop K8s, or set KUBECONFIG',
      });
    }

    // Namespace exists (non-blocking)
    try {
      await execa(config.kubectlBinary, ['get', 'ns', haCfg.k8sNamespace]);
      checks.push({ id: 'namespace', label: `Namespace ${haCfg.k8sNamespace}`, status: 'ok', message: 'Namespace exists' });
    } catch {
      checks.push({
        id: 'namespace',
        label: `Namespace ${haCfg.k8sNamespace}`,
        status: 'missing',
        message: 'Namespace does not exist',
        remedy: 'Will be auto-created on deploy',
      });
    }
  }

  if (mode === 'docker') {
    // Docker CLI
    try {
      await execa('docker', ['version']);
      checks.push({ id: 'docker', label: 'Docker CLI', status: 'ok', message: 'Docker CLI available' });
    } catch {
      checks.push({
        id: 'docker',
        label: 'Docker CLI',
        status: 'missing',
        message: 'Docker CLI not found',
        remedy: 'brew install --cask docker',
      });
    }

    // Docker daemon
    try {
      await execa('docker', ['info']);
      checks.push({ id: 'docker_daemon', label: 'Docker daemon', status: 'ok', message: 'Docker daemon running' });
    } catch {
      checks.push({
        id: 'docker_daemon',
        label: 'Docker daemon',
        status: 'missing',
        message: 'Docker daemon not running',
        remedy: 'Start Docker Desktop',
      });
    }
  }

  if (mode === 'process') {
    // HAProxy binary
    try {
      await execa('which', [haCfg.binary]);
      checks.push({ id: 'binary', label: 'HAProxy binary', status: 'ok', message: `Found ${haCfg.binary}` });
    } catch {
      checks.push({
        id: 'binary',
        label: 'HAProxy binary',
        status: 'missing',
        message: `${haCfg.binary} not found on PATH`,
        remedy: 'brew install haproxy',
      });
    }
  }

  // ready = all ok, treating namespace 'missing' as non-blocking
  const ready = checks.every((c) => c.status === 'ok' || (c.id === 'namespace' && c.status === 'missing'));

  logger.info({ mode, ready, checks: checks.map((c) => `${c.id}:${c.status}`) }, 'HAProxy preflight: complete');
  return { mode, ready, checks };
}

export async function detectDeployMode(): Promise<HAProxyDeployMode | null> {
  // Try K8s first
  try {
    const { stdout } = await execa(config.kubectlBinary, [
      'get', 'deployment', haCfg.k8sDeploymentName,
      '-n', haCfg.k8sNamespace,
      '--no-headers',
    ]);
    if (stdout.trim()) return 'kubernetes';
  } catch { /* not on k8s */ }

  // Try Docker
  try {
    const { stdout } = await execa('docker', [
      'inspect', '--format', '{{.State.Running}}', haCfg.dockerContainerName,
    ]);
    if (stdout.trim() === 'true') return 'docker';
  } catch { /* not docker */ }

  // Try process
  try {
    const { stdout } = await execa('pgrep', ['-f', haCfg.binary]);
    if (stdout.trim()) return 'process';
  } catch { /* not running */ }

  return null;
}

/** Lightweight check — no config test, just subprocess calls. */
export async function isHAProxyRunning(mode: HAProxyDeployMode): Promise<boolean> {
  try {
    if (mode === 'kubernetes') {
      const { stdout } = await execa(config.kubectlBinary, [
        'get', 'deployment', haCfg.k8sDeploymentName,
        '-n', haCfg.k8sNamespace,
        '-o', 'jsonpath={.status.readyReplicas}',
      ]);
      return Number(stdout) > 0;
    }
    if (mode === 'docker') {
      const { stdout } = await execa('docker', [
        'inspect', '--format', '{{.State.Running}}', haCfg.dockerContainerName,
      ]);
      return stdout.trim() === 'true';
    }
    // process mode
    await execa('pgrep', ['-f', haCfg.binary]);
    return true;
  } catch {
    return false;
  }
}

/** K8s only: replicas === 0 means paused. Docker/process have no pause concept. */
export async function isHAProxyPaused(mode: HAProxyDeployMode): Promise<boolean> {
  if (mode !== 'kubernetes') return false;
  try {
    const { stdout } = await execa(config.kubectlBinary, [
      'get', 'deployment', haCfg.k8sDeploymentName,
      '-n', haCfg.k8sNamespace,
      '-o', 'jsonpath={.spec.replicas}',
    ]);
    return Number(stdout) === 0;
  } catch {
    return false;
  }
}

export async function getHAProxyStatus(mode?: HAProxyDeployMode): Promise<HAProxyStatus> {
  const deployMode = mode ?? await detectDeployMode();
  let running = false;
  let error: string | null = null;

  if (deployMode) {
    try {
      running = await isHAProxyRunning(deployMode);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    running,
    deployMode,
    configValid: null,
    configValidationMessage: null,
    lastReloaded: null,
    error,
  };
}

export async function reloadHAProxy(mode: HAProxyDeployMode): Promise<string> {
  logger.info({ mode }, 'HAProxy reload: starting');
  let result: string;

  if (mode === 'kubernetes') {
    const { stdout } = await execa(config.kubectlBinary, [
      'rollout', 'restart', `deployment/${haCfg.k8sDeploymentName}`,
      '-n', haCfg.k8sNamespace,
    ]);
    result = stdout;
  } else if (mode === 'docker') {
    const { stdout } = await execa('docker', [
      'kill', '-s', 'HUP', haCfg.dockerContainerName,
    ]);
    result = stdout;
  } else {
    // process mode — send SIGUSR2 to reload
    const { stdout: pidOut } = await execa('pgrep', ['-f', haCfg.binary]);
    const pid = pidOut.trim().split('\n')[0] ?? '';
    await execa('kill', ['-USR2', pid]);
    result = `Sent SIGUSR2 to PID ${pid}`;
  }

  logger.info({ mode, result }, 'HAProxy reload: success');

  eventBus.broadcast({
    type: 'health_check',
    serviceId: 'haproxy',
    message: 'HAProxy reloaded',
    timestamp: new Date().toISOString(),
  });

  return result;
}

export async function deployHAProxy(mode: HAProxyDeployMode): Promise<string> {
  logger.info({ mode }, 'HAProxy deploy: starting');
  const timestamp = () => new Date().toISOString();
  eventBus.broadcast({ type: 'phase_change', serviceId: 'haproxy', phase: 'deploying', message: 'Deploying HAProxy', timestamp: timestamp() });

  try {
    const result = await _deployHAProxy(mode);
    logger.info({ mode, result }, 'HAProxy deploy: success');
    eventBus.broadcast({ type: 'phase_change', serviceId: 'haproxy', phase: 'deployed', message: 'HAProxy deployed', timestamp: timestamp() });
    return result;
  } catch (err) {
    logger.error({ mode, err }, 'HAProxy deploy: failed');
    eventBus.broadcast({ type: 'phase_change', serviceId: 'haproxy', phase: 'failed', message: `HAProxy deploy failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: timestamp() });
    throw err;
  }
}

async function _deployHAProxy(mode: HAProxyDeployMode): Promise<string> {
  // Pre-flight checks
  const preflight = await checkDeployPrereqs(mode);
  if (!preflight.ready) {
    const failures = preflight.checks
      .filter((c) => c.status !== 'ok' && !(c.id === 'namespace' && c.status === 'missing'))
      .map((c) => `${c.label}: ${c.message}${c.remedy ? ` → ${c.remedy}` : ''}`)
      .join('; ');
    logger.warn({ mode, failures }, 'HAProxy deploy: prerequisites not met');
    throw new Error(`Prerequisites not met: ${failures}`);
  }

  if (mode === 'kubernetes') {
    // Auto-create namespace if missing, with Helm ownership labels so
    // `helm install base` can adopt it later without conflicts
    const nsCheck = preflight.checks.find((c) => c.id === 'namespace');
    if (nsCheck && nsCheck.status === 'missing') {
      logger.info({ namespace: haCfg.k8sNamespace }, 'HAProxy deploy: auto-creating namespace');
      await execa(config.kubectlBinary, ['create', 'namespace', haCfg.k8sNamespace]);
      await execa(config.kubectlBinary, [
        'label', 'namespace', haCfg.k8sNamespace,
        'app.kubernetes.io/managed-by=Helm', '--overwrite',
      ]);
      await execa(config.kubectlBinary, [
        'annotate', 'namespace', haCfg.k8sNamespace,
        'meta.helm.sh/release-name=base',
        'meta.helm.sh/release-namespace=default',
        '--overwrite',
      ]);
      logger.info({ namespace: haCfg.k8sNamespace }, 'HAProxy deploy: namespace created with Helm labels');
    }

    // Create ConfigMap from config file (+ cert files if they exist)
    logger.info('HAProxy deploy [k8s]: creating configmap');
    const configMapArgs = [
      'create', 'configmap', 'haproxy-config',
      `--from-file=haproxy.cfg=${haCfg.configPath}`,
    ];
    const hasCerts = await fileExists(HAPROXY_CERT_PATH) && await fileExists(CA_CERT_PATH);
    if (hasCerts) {
      configMapArgs.push(`--from-file=server.pem=${HAPROXY_CERT_PATH}`);
      configMapArgs.push(`--from-file=ca.pem=${CA_CERT_PATH}`);
    }
    configMapArgs.push('-n', haCfg.k8sNamespace, '--dry-run=client', '-o', 'yaml');
    await execa(config.kubectlBinary, configMapArgs).then(async ({ stdout }) => {
      await execa(config.kubectlBinary, ['apply', '-f', '-', '-n', haCfg.k8sNamespace], { input: stdout });
    });

    logger.info('HAProxy deploy [k8s]: applying deployment manifest');
    const volumeMounts: Array<{ name: string; mountPath: string; subPath: string }> = [
      { name: 'config', mountPath: '/usr/local/etc/haproxy/haproxy.cfg', subPath: 'haproxy.cfg' },
    ];
    if (hasCerts) {
      volumeMounts.push({ name: 'config', mountPath: '/usr/local/etc/haproxy/certs/server.pem', subPath: 'server.pem' });
      volumeMounts.push({ name: 'config', mountPath: '/usr/local/etc/haproxy/certs/ca.pem', subPath: 'ca.pem' });
    }
    const deployManifest = JSON.stringify({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: haCfg.k8sDeploymentName, namespace: haCfg.k8sNamespace },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'haproxy' } },
        template: {
          metadata: { labels: { app: 'haproxy' } },
          spec: {
            containers: [{
              name: 'haproxy',
              image: haCfg.dockerImage,
              ports: [{ containerPort: 80 }, { containerPort: 443 }],
              volumeMounts,
            }],
            volumes: [{
              name: 'config',
              configMap: { name: 'haproxy-config' },
            }],
          },
        },
      },
    });

    const { stdout } = await execa(config.kubectlBinary, ['apply', '-f', '-', '-n', haCfg.k8sNamespace], {
      input: deployManifest,
    });
    logger.info({ stdout }, 'HAProxy deploy [k8s]: deployment applied');
    return stdout;
  }

  if (mode === 'docker') {
    // Remove any stale container with the same name (stopped but not removed)
    logger.info({ container: haCfg.dockerContainerName }, 'HAProxy deploy [docker]: cleaning up stale container');
    await execa('docker', ['rm', '-f', haCfg.dockerContainerName]).catch(() => {});
    logger.info({ image: haCfg.dockerImage, container: haCfg.dockerContainerName }, 'HAProxy deploy [docker]: starting container');
    const dockerArgs = [
      'run', '-d',
      '--name', haCfg.dockerContainerName,
      '-v', `${haCfg.configPath}:/usr/local/etc/haproxy/haproxy.cfg:ro`,
    ];
    if (await fileExists(HAPROXY_CERT_PATH)) {
      dockerArgs.push('-v', `${HAPROXY_CERT_PATH}:/usr/local/etc/haproxy/certs/server.pem:ro`);
    }
    if (await fileExists(CA_CERT_PATH)) {
      dockerArgs.push('-v', `${CA_CERT_PATH}:/usr/local/etc/haproxy/certs/ca.pem:ro`);
    }
    dockerArgs.push('-p', '80:80', '-p', '443:443', haCfg.dockerImage);
    const { stdout } = await execa('docker', dockerArgs);
    const containerId = stdout.trim().slice(0, 12);
    logger.info({ containerId }, 'HAProxy deploy [docker]: container started');
    return `Container started: ${containerId}`;
  }

  // process mode
  logger.info({ binary: haCfg.binary, configPath: haCfg.configPath }, 'HAProxy deploy [process]: starting daemon');
  const { stdout } = await execa(haCfg.binary, ['-f', haCfg.configPath, '-D']);
  logger.info('HAProxy deploy [process]: daemon started');
  return stdout || 'HAProxy started as daemon';
}

export async function stopHAProxy(mode: HAProxyDeployMode): Promise<string> {
  logger.info({ mode }, 'HAProxy stop: starting');
  const timestamp = () => new Date().toISOString();
  eventBus.broadcast({ type: 'phase_change', serviceId: 'haproxy', phase: 'uninstalling', message: 'Stopping HAProxy', timestamp: timestamp() });

  try {
    const result = await _stopHAProxy(mode);
    logger.info({ mode, result }, 'HAProxy stop: success');
    eventBus.broadcast({ type: 'phase_change', serviceId: 'haproxy', phase: 'not_installed', message: 'HAProxy stopped', timestamp: timestamp() });
    return result;
  } catch (err) {
    logger.error({ mode, err }, 'HAProxy stop: failed');
    eventBus.broadcast({ type: 'phase_change', serviceId: 'haproxy', phase: 'failed', message: `HAProxy stop failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: timestamp() });
    throw err;
  }
}

async function _stopHAProxy(mode: HAProxyDeployMode): Promise<string> {
  if (mode === 'kubernetes') {
    logger.info({ deployment: haCfg.k8sDeploymentName, namespace: haCfg.k8sNamespace }, 'HAProxy stop [k8s]: deleting deployment');
    const { stdout } = await execa(config.kubectlBinary, [
      'delete', 'deployment', haCfg.k8sDeploymentName,
      '-n', haCfg.k8sNamespace,
      '--ignore-not-found',
    ]);
    logger.info({ stdout }, 'HAProxy stop [k8s]: deployment deleted');
    return stdout;
  }

  if (mode === 'docker') {
    logger.info({ container: haCfg.dockerContainerName }, 'HAProxy stop [docker]: stopping container');
    let stdout = '';
    try {
      const result = await execa('docker', ['stop', haCfg.dockerContainerName]);
      stdout = result.stdout;
    } catch {
      stdout = 'Container already stopped or not found';
      logger.warn({ container: haCfg.dockerContainerName }, 'HAProxy stop [docker]: container already stopped or not found');
    }
    await execa('docker', ['rm', haCfg.dockerContainerName]).catch(() => {});
    logger.info({ stdout }, 'HAProxy stop [docker]: done');
    return stdout;
  }

  // process mode
  logger.info({ binary: haCfg.binary }, 'HAProxy stop [process]: finding PID');
  const { stdout: pidOut } = await execa('pgrep', ['-f', haCfg.binary]);
  const pid = pidOut.trim().split('\n')[0] ?? '';
  logger.info({ pid }, 'HAProxy stop [process]: killing');
  await execa('kill', [pid]);
  return `Killed PID ${pid}`;
}

export async function getHAProxyLogs(mode: HAProxyDeployMode, tail = 50): Promise<string> {
  logger.info({ mode, tail }, 'HAProxy logs: fetching');

  if (mode === 'kubernetes') {
    try {
      const { stdout } = await execa(config.kubectlBinary, [
        'logs', '-l', 'app=haproxy',
        '-n', haCfg.k8sNamespace,
        '--tail', String(tail),
        '--all-containers',
      ]);
      return stdout || '(no logs)';
    } catch (err) {
      // Try to get events if no pod logs available
      try {
        const { stdout } = await execa(config.kubectlBinary, [
          'get', 'events',
          '-n', haCfg.k8sNamespace,
          '--field-selector', `involvedObject.name=${haCfg.k8sDeploymentName}`,
          '--sort-by=.lastTimestamp',
        ]);
        return stdout || `No logs available: ${err instanceof Error ? err.message : String(err)}`;
      } catch {
        return `No logs available: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  if (mode === 'docker') {
    try {
      const { stdout } = await execa('docker', [
        'logs', '--tail', String(tail), haCfg.dockerContainerName,
      ]);
      return stdout || '(no logs)';
    } catch (err) {
      return `No logs available: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // process mode — no built-in log capture
  return 'Process mode: check system logs (journalctl or /var/log/haproxy.log)';
}

export interface HAProxyRouteEntry {
  serviceId: string;
  serviceName: string;
  endpointPath: string;
  k8sServiceName: string;
  k8sServicePort: number;
  backendName: string;
}

export function getRoutingTable(): HAProxyRouteEntry[] {
  const entries: HAProxyRouteEntry[] = [];
  for (const id of SERVICE_IDS) {
    const def = SERVICE_CATALOG[id];
    if (def.endpointPath && def.k8sServiceName && def.k8sServicePort) {
      entries.push({
        serviceId: id,
        serviceName: def.name,
        endpointPath: def.endpointPath,
        k8sServiceName: def.k8sServiceName,
        k8sServicePort: def.k8sServicePort,
        backendName: `${id}-service`,
      });
    }
  }
  return entries;
}

// In-container cert paths (these are where deploy mounts files to)
const CONTAINER_CERT_DIR = '/usr/local/etc/haproxy/certs';
const CONTAINER_SSL_CERT = `${CONTAINER_CERT_DIR}/server.pem`;
const CONTAINER_CA_CERT = `${CONTAINER_CERT_DIR}/ca.pem`;

export function generateHAProxyConfig(options?: {
  enableSsl?: boolean;
}): string {
  const enableSsl = options?.enableSsl ?? false;
  const sslCert = CONTAINER_SSL_CERT;
  const caFile = CONTAINER_CA_CERT;
  const routes = getRoutingTable();
  const ns = config.defaultNamespace;

  const lines: string[] = [];

  // Global
  lines.push('global');
  lines.push('  log stdout format raw local0');
  lines.push('  maxconn 256');
  lines.push('  pidfile /tmp/haproxy-queue.pid');
  lines.push('');

  // Resolvers — K8s CoreDNS for runtime backend resolution
  lines.push('resolvers k8s-dns');
  lines.push('  nameserver dns1 kube-dns.kube-system.svc.cluster.local:53');
  lines.push('  accepted_payload_size 8192');
  lines.push('  resolve_retries 3');
  lines.push('  timeout resolve 1s');
  lines.push('  timeout retry   1s');
  lines.push('  hold valid      10s');
  lines.push('');

  // Defaults
  lines.push('defaults');
  lines.push('  log global');
  lines.push('  mode http');
  lines.push('  timeout connect         6000ms');
  lines.push('  timeout client         30000ms');
  lines.push('  timeout server         30000ms');
  lines.push('  timeout http-keep-alive 6000ms');
  lines.push('  maxconn 256');
  lines.push('  option redispatch');
  lines.push('  retries 3');
  lines.push('  option http-keep-alive');
  lines.push('  option httplog');
  lines.push('  option forwardfor');
  lines.push('  option httpchk HEAD / HTTP/1.0');
  lines.push('');

  // Frontend
  if (enableSsl) {
    lines.push('frontend https-in');
    lines.push('   log global');
    lines.push(`   bind *:443 ssl crt ${sslCert} ca-file ${caFile} verify optional`);
  } else {
    lines.push('frontend http-in');
    lines.push('   log global');
    lines.push('   bind *:80');
  }
  lines.push('   mode http');
  lines.push('   option forwardfor');
  lines.push('   option http-server-close');
  lines.push('');

  // Use_backend rules
  for (const route of routes) {
    lines.push(` # ${route.serviceName}`);
    lines.push(` use_backend ${route.backendName} if { path_beg ${route.endpointPath} }`);
    lines.push('');
  }

  lines.push(` default_backend science-portal-service`);
  lines.push('');

  // Backend blocks
  for (const route of routes) {
    const fqdn = `${route.k8sServiceName}.${ns}.svc.cluster.local`;
    lines.push(`backend ${route.backendName}`);
    lines.push(' mode http');
    lines.push(` server ${route.serviceId} ${fqdn}:${route.k8sServicePort} resolvers k8s-dns init-addr none`);
    lines.push('');
  }

  return lines.join('\n');
}
