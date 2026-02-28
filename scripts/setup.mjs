#!/usr/bin/env node
import { createInterface } from 'readline';
import { readdir, copyFile, stat, mkdir, readFile, writeFile, appendFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const isTTY = process.stdin.isTTY === true;

// ANSI helpers
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const ok = (msg) => console.log(`  ${green('✓')} ${msg}`);
const warn = (msg) => console.log(`  ${yellow('!')} ${msg}`);
const fail = (msg) => console.log(`  ${red('✗')} ${msg}`);
const info = (msg) => console.log(`  ${dim(msg)}`);

function ask(question) {
  if (!isTTY) return Promise.resolve('');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

// ─── Steps ──────────────────────────────────────────────

async function stepEnv() {
  console.log(`\n${bold('1. Environment file')}`);
  const envPath = join(ROOT, '.env');
  const examplePath = join(ROOT, '.env.example');

  if (await exists(envPath)) {
    ok('.env already exists');
    return;
  }

  if (!(await exists(examplePath))) {
    warn('.env.example not found — skipping');
    return;
  }

  await copyFile(examplePath, envPath);
  ok('Created .env from .env.example');
}

async function stepDirectories() {
  console.log(`\n${bold('2. Required directories')}`);
  const dirs = ['helm-values', 'haproxy', 'charts'];

  for (const dir of dirs) {
    const p = join(ROOT, dir);
    if (await exists(p)) {
      ok(`${dir}/ exists`);
    } else {
      await mkdir(p, { recursive: true });
      ok(`Created ${dir}/`);
    }
  }
}

async function stepExampleValues() {
  console.log(`\n${bold('3. Helm values files')}`);
  const helmDir = join(ROOT, 'helm-values');
  const exampleDir = join(ROOT, 'helm-values.example');

  if (!(await exists(exampleDir))) {
    warn('No helm-values.example/ directory found — add your own values files');
    return;
  }

  const existingFiles = new Set((await readdir(helmDir).catch(() => [])).filter((f) => f.endsWith('.yaml')));
  const examples = (await readdir(exampleDir)).filter((f) => f.endsWith('.yaml'));

  let copied = 0;
  for (const file of examples) {
    if (!existingFiles.has(file)) {
      await copyFile(join(exampleDir, file), join(helmDir, file));
      copied++;
    }
  }

  if (copied > 0 && existingFiles.size > 0) {
    ok(`${copied} missing values file(s) added, ${existingFiles.size} already present`);
  } else if (copied > 0) {
    ok(`Copied ${copied} example values file(s)`);
  } else {
    ok(`All ${existingFiles.size} values file(s) already present`);
  }
}

async function stepHelmCheck() {
  console.log(`\n${bold('4. Helm CLI')}`);
  const out = run('helm version --short');
  if (out) {
    ok(`helm ${out}`);
  } else {
    fail('helm not found');
    info('Install: https://helm.sh/docs/intro/install/');
  }
}

async function stepHelmRepos() {
  console.log(`\n${bold('5. Helm chart repositories')}`);
  const repos = {
    'science-platform': 'https://images.opencadc.org/chartrepo/platform',
    'science-platform-client': 'https://images.opencadc.org/chartrepo/client',
    'bitnami': 'https://charts.bitnami.com/bitnami',
  };

  // Check if helm is available first
  if (!run('helm version --short')) {
    warn('Helm not installed — skipping repo setup');
    return;
  }

  for (const [name, url] of Object.entries(repos)) {
    const result = run(`helm repo add ${name} ${url} --force-update 2>&1`);
    if (result !== null) {
      ok(`${name} → ${url}`);
    } else {
      fail(`Failed to add ${name}`);
    }
  }

  const updateResult = run('helm repo update 2>&1');
  if (updateResult !== null) {
    ok('Repo index updated');
  } else {
    warn('Failed to update repo index');
  }
}

async function stepKubectlCheck() {
  console.log(`\n${bold('6. Kubectl CLI')}`);
  const out = run('kubectl version --client -o yaml 2>/dev/null');
  if (out) {
    ok('kubectl available');
  } else {
    fail('kubectl not found');
    info('Install: https://kubernetes.io/docs/tasks/tools/');
  }
}

async function stepKubeContext() {
  console.log(`\n${bold('7. Kubernetes context')}`);
  const raw = run('kubectl config get-contexts -o name 2>/dev/null');
  if (!raw) {
    warn('Could not list kube contexts');
    return;
  }

  const contexts = raw.split('\n').filter(Boolean);
  if (contexts.length === 0) {
    warn('No kube contexts found');
    return;
  }

  console.log('');
  contexts.forEach((ctx, i) => console.log(`    ${dim(`${i + 1})`)} ${ctx}`));
  console.log('');

  if (!isTTY) {
    info('Non-interactive mode — skipping context selection');
    return;
  }

  const answer = await ask(`Select context [1-${contexts.length}] or press Enter to skip: `);
  const idx = parseInt(answer, 10);
  if (isNaN(idx) || idx < 1 || idx > contexts.length) {
    info('Skipped — set KUBE_CONTEXT in .env manually');
    return;
  }

  const chosen = contexts[idx - 1];
  const envPath = join(ROOT, '.env');

  if (await exists(envPath)) {
    const content = await readFile(envPath, 'utf-8');
    if (content.includes('KUBE_CONTEXT=')) {
      const updated = content.replace(/^#?\s*KUBE_CONTEXT=.*/m, `KUBE_CONTEXT=${chosen}`);
      await writeFile(envPath, updated);
    } else {
      await appendFile(envPath, `\nKUBE_CONTEXT=${chosen}\n`);
    }
  } else {
    await writeFile(envPath, `KUBE_CONTEXT=${chosen}\n`);
  }

  ok(`Set KUBE_CONTEXT=${chosen} in .env`);
}

// ─── Main ───────────────────────────────────────────────

console.log('');
console.log(bold('  ╔══════════════════════════════╗'));
console.log(bold('  ║      Skaha-Orc Setup         ║'));
console.log(bold('  ╚══════════════════════════════╝'));

await stepEnv();
await stepDirectories();
await stepExampleValues();
await stepHelmCheck();
await stepHelmRepos();
await stepKubectlCheck();
await stepKubeContext();

console.log(`\n${bold('Summary')}`);
console.log('─'.repeat(40));
const envExists = await exists(join(ROOT, '.env'));
const helmValuesCount = (await readdir(join(ROOT, 'helm-values')).catch(() => []))
  .filter((f) => f.endsWith('.yaml')).length;
const helmOk = run('helm version --short') !== null;
const kubectlOk = run('kubectl version --client 2>/dev/null') !== null;

(envExists ? ok : warn)('.env file');
ok('Directories created');
(helmValuesCount > 0 ? ok : warn)(`${helmValuesCount} values file(s)`);
(helmOk ? ok : fail)('Helm CLI');
(kubectlOk ? ok : fail)('Kubectl CLI');

console.log('');
console.log(`  Run ${green('npm run dev')} to start the platform.`);
console.log('');
