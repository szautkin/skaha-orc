import { mkdir, readdir, copyFile, stat } from 'fs/promises';
import { resolve, dirname } from 'path';
import { execa } from 'execa';
import type { PreflightCheck, PreflightResult } from '@skaha-orc/shared';
import { config } from '../config.js';
import { kubeArgs, kubeEnv } from './kube-args.js';
import { logger } from '../logger.js';

export async function ensureDirectories(): Promise<void> {
  const dirs = [
    config.helmConfigDir,
    dirname(config.haproxy.configPath),
    config.chartBaseDir,
  ];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
  logger.debug({ dirs }, 'Ensured directories exist');
}

export async function copyExampleValues(): Promise<void> {
  const helmDir = resolve(config.helmConfigDir);
  const exampleDir = resolve(helmDir, '..', 'helm-values.example');

  let helmEmpty = true;
  try {
    const entries = await readdir(helmDir);
    helmEmpty = entries.filter((f) => f.endsWith('.yaml')).length === 0;
  } catch {
    helmEmpty = true;
  }

  if (!helmEmpty) return;

  let exampleExists = false;
  try {
    await stat(exampleDir);
    exampleExists = true;
  } catch {
    exampleExists = false;
  }

  if (!exampleExists) {
    logger.debug('No helm-values.example/ directory found, skipping copy');
    return;
  }

  const files = (await readdir(exampleDir)).filter((f) => f.endsWith('.yaml'));
  for (const file of files) {
    await copyFile(resolve(exampleDir, file), resolve(helmDir, file));
  }
  logger.info({ count: files.length }, 'Copied example values files to helm-values/');
}

async function checkCli(
  id: string,
  label: string,
  cmd: string,
  args: string[],
): Promise<PreflightCheck> {
  try {
    const result = await execa(cmd, args, { timeout: 5000 });
    const output = String(result.stdout ?? '').split('\n')[0] ?? '';
    return {
      id,
      label,
      status: 'ok',
      message: output.trim(),
    };
  } catch {
    return {
      id,
      label,
      status: 'fail',
      message: `${cmd} not found or not executable`,
      remedy: `Install ${cmd} and ensure it is on your PATH`,
    };
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function checkPrerequisites(): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  // Directory checks
  const dirChecks = [
    { id: 'dir-helm-values', label: 'Helm values directory', path: config.helmConfigDir },
    { id: 'dir-haproxy', label: 'HAProxy directory', path: dirname(config.haproxy.configPath) },
    { id: 'dir-charts', label: 'Charts directory', path: config.chartBaseDir },
  ];
  for (const d of dirChecks) {
    const exists = await dirExists(d.path);
    checks.push({
      id: d.id,
      label: d.label,
      status: exists ? 'ok' : 'fail',
      message: exists ? `${d.path} exists` : `${d.path} not found`,
      remedy: exists ? undefined : `Run: mkdir -p ${d.path}`,
    });
  }

  // CLI checks
  checks.push(await checkCli('helm-cli', 'Helm CLI', config.helmBinary, ['version', '--short']));
  checks.push(
    await checkCli('kubectl-cli', 'Kubectl CLI', config.kubectlBinary, ['version', '--client']),
  );

  // Cluster connectivity (warn, not fail)
  try {
    await execa(config.kubectlBinary, ['cluster-info', ...kubeArgs()], {
      timeout: 5000,
      env: kubeEnv(),
    });
    checks.push({
      id: 'kube-cluster',
      label: 'Kubernetes cluster',
      status: 'ok',
      message: 'Cluster reachable',
    });
  } catch {
    checks.push({
      id: 'kube-cluster',
      label: 'Kubernetes cluster',
      status: 'warn',
      message: 'Cluster not reachable',
      remedy: 'Configure KUBE_CONTEXT in .env or ensure your kubeconfig is set up',
    });
  }

  // Values files count (warn if 0)
  try {
    const entries = await readdir(resolve(config.helmConfigDir));
    const yamlCount = entries.filter((f) => f.endsWith('.yaml')).length;
    checks.push({
      id: 'values-files',
      label: 'Helm values files',
      status: yamlCount > 0 ? 'ok' : 'warn',
      message: yamlCount > 0 ? `${yamlCount} values file(s) found` : 'No values files found',
      remedy: yamlCount > 0 ? undefined : 'Add .yaml files to helm-values/ or run npm run setup',
    });
  } catch {
    checks.push({
      id: 'values-files',
      label: 'Helm values files',
      status: 'warn',
      message: 'Could not read helm-values directory',
      remedy: 'Run npm run setup to create directories and copy example files',
    });
  }

  // HAProxy config (warn if missing)
  try {
    await stat(resolve(config.haproxy.configPath));
    checks.push({
      id: 'haproxy-config',
      label: 'HAProxy config',
      status: 'ok',
      message: 'haproxy.cfg found',
    });
  } catch {
    checks.push({
      id: 'haproxy-config',
      label: 'HAProxy config',
      status: 'warn',
      message: 'haproxy.cfg not found',
      remedy: 'HAProxy config will be generated when you deploy HAProxy from the UI',
    });
  }

  const ready = checks
    .filter((c) => ['dir-helm-values', 'dir-haproxy', 'dir-charts', 'helm-cli', 'kubectl-cli'].includes(c.id))
    .every((c) => c.status === 'ok');

  return { ready, checks };
}
