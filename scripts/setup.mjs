#!/usr/bin/env node
import { createInterface } from 'readline';
import { readdir, copyFile, stat, mkdir, readFile, writeFile, appendFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
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
  const dirs = ['helm-values', 'haproxy'];

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

function generateSecret(length = 32) {
  return randomBytes(length).toString('base64url').slice(0, length);
}

async function stepPlatformConfig() {
  console.log(`\n${bold('4. Platform configuration')}`);
  const helmDir = join(ROOT, 'helm-values');
  const envPath = join(ROOT, '.env');

  const entries = await readdir(helmDir).catch(() => []);
  const yamlFiles = entries.filter((f) => f.endsWith('.yaml'));
  if (yamlFiles.length === 0) {
    warn('No values files to configure — skipping');
    return;
  }

  // Check if already configured (no CHANGE_ME remaining)
  let hasPlaceholders = false;
  for (const file of yamlFiles) {
    const content = await readFile(join(helmDir, file), 'utf-8');
    if (content.includes('CHANGE_ME')) {
      hasPlaceholders = true;
      break;
    }
  }

  if (!hasPlaceholders) {
    ok('Values files already configured');
    return;
  }

  // In non-TTY mode, use defaults and auto-generate everything
  const DEFAULT_HOST = 'haproxy.cadc.dao.nrc.ca';
  let hostname = DEFAULT_HOST;
  let adminPassword = 'Test123!';

  if (isTTY) {
    hostname = (await ask(`Platform hostname [${DEFAULT_HOST}]: `)) || DEFAULT_HOST;
    adminPassword = (await ask('Admin password for Dex login [Test123!]: ')) || 'Test123!';
  } else {
    info('Non-interactive mode — using defaults and auto-generating secrets');
  }

  // Generate bcrypt hash for Dex
  let dexHash = '';
  try {
    const bcryptjs = await import('bcryptjs');
    const bcrypt = bcryptjs.default ?? bcryptjs;
    dexHash = bcrypt.hashSync(adminPassword, 10);
  } catch {
    warn('Could not generate bcrypt hash — set dex password hash manually');
    dexHash = 'GENERATE_WITH_htpasswd';
  }

  // Auto-generate secrets and passwords
  const sciencePortalSecret = generateSecret();
  const storageUiSecret = generateSecret();
  const posixMapperDbPassword = generateSecret(16);
  const cavernDbPassword = generateSecret(16);
  const keycloakPassword = generateSecret(16);

  // Per-file replacements for CHANGE_ME (context-sensitive)
  // Dex has multiple CHANGE_ME secrets — we match by surrounding context (id above the secret line)
  // to assign the correct generated secret to each client.
  const fileReplacements = {
    'dex-values.yaml': [
      // hash for static passwords
      [/^(\s+hash:)\s*CHANGE_ME$/m, `$1 ${dexHash}`],
      // science-portal client secret (id: science-portal is the line above)
      [/(id:\s*science-portal[\s\S]*?secret:)\s*CHANGE_ME/, `$1 ${sciencePortalSecret}`],
      // storage-ui client secret (id: storage-ui is the line above)
      [/(id:\s*storage-ui[\s\S]*?secret:)\s*CHANGE_ME/, `$1 ${storageUiSecret}`],
    ],
    'keycloak-values.yaml': [
      [/adminPassword:\s*CHANGE_ME/, `adminPassword: ${keycloakPassword}`],
    ],
    'posix-mapper-postgres.yaml': [
      [/password:\s*CHANGE_ME/, `password: ${posixMapperDbPassword}`],
    ],
    'cavern-values.yaml': [
      [/password:\s*CHANGE_ME/, `password: ${cavernDbPassword}`],
    ],
    'science-portal-values.yaml': [
      [/clientSecret:\s*CHANGE_ME/, `clientSecret: ${sciencePortalSecret}`],
    ],
    'skaha-values.yaml': [
      [/clientSecret:\s*CHANGE_ME/, `clientSecret: ${sciencePortalSecret}`],
    ],
    'storage.yaml': [
      [/clientSecret:\s*CHANGE_ME/, `clientSecret: ${storageUiSecret}`],
    ],
  };

  let configured = 0;
  for (const file of yamlFiles) {
    const filePath = join(helmDir, file);
    let content = await readFile(filePath, 'utf-8');
    const original = content;

    // Apply context-sensitive replacements for this file
    const specific = fileReplacements[file];
    if (specific) {
      for (const [pattern, replacement] of specific) {
        content = content.replace(pattern, replacement);
      }
    }

    // Catch-all: replace any remaining CHANGE_ME with a generated secret
    // (handles future additions without needing explicit per-file rules)
    if (content.includes('CHANGE_ME')) {
      content = content.replaceAll('CHANGE_ME', generateSecret());
    }

    // Replace the default dev hostname if user chose a different one
    if (hostname !== DEFAULT_HOST) {
      content = content.replaceAll(DEFAULT_HOST, hostname);
    }

    if (content !== original) {
      await writeFile(filePath, content);
      configured++;
    }
  }

  // Update .env with PLATFORM_HOSTNAME
  if (await exists(envPath)) {
    let envContent = await readFile(envPath, 'utf-8');
    if (envContent.includes('PLATFORM_HOSTNAME=')) {
      envContent = envContent.replace(/^PLATFORM_HOSTNAME=.*/m, `PLATFORM_HOSTNAME=${hostname}`);
    } else {
      envContent += `\nPLATFORM_HOSTNAME=${hostname}\n`;
    }
    await writeFile(envPath, envContent);
  }

  ok(`Configured ${configured} values file(s) for ${bold(hostname)}`);
  info(`OIDC client secrets: auto-generated`);
  info(`DB passwords: auto-generated`);
  info(`Keycloak admin: admin / ${keycloakPassword}`);
  info(`Dex admin: admin@${hostname} / ${adminPassword}`);
}

async function stepPrerequisites() {
  console.log(`\n${bold('5. Host prerequisites')}`);

  const platform = process.platform; // 'darwin' or 'linux'
  const isMac = platform === 'darwin';

  const tools = [
    {
      name: 'docker',
      check: 'docker --version 2>/dev/null',
      required: true,
      purpose: 'build & run container images',
      install: isMac
        ? 'brew install --cask docker  (or https://docker.com/products/docker-desktop)'
        : 'curl -fsSL https://get.docker.com | sh',
    },
    {
      name: 'helm',
      check: 'helm version --short 2>/dev/null',
      required: true,
      purpose: 'deploy Helm charts to Kubernetes',
      install: isMac
        ? 'brew install helm'
        : 'curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash',
    },
    {
      name: 'kubectl',
      check: 'kubectl version --client -o yaml 2>/dev/null',
      required: true,
      purpose: 'manage Kubernetes resources',
      install: isMac
        ? 'brew install kubectl'
        : 'curl -LO "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && sudo install kubectl /usr/local/bin/',
    },
    {
      name: 'openssl',
      check: 'openssl version 2>/dev/null',
      required: true,
      purpose: 'generate TLS certificates',
      install: isMac
        ? 'brew install openssl  (usually pre-installed)'
        : 'sudo apt-get install -y openssl',
    },
    {
      name: 'kind',
      check: 'kind version 2>/dev/null',
      required: false,
      purpose: 'local Kubernetes cluster (optional — not needed with Docker Desktop)',
      install: isMac
        ? 'brew install kind'
        : 'go install sigs.k8s.io/kind@latest',
    },
  ];

  let missing = 0;
  for (const tool of tools) {
    const out = run(tool.check);
    if (out) {
      const version = out.split('\n')[0].trim();
      ok(`${tool.name}: ${version}`);
    } else if (tool.required) {
      fail(`${tool.name} not found — ${tool.purpose}`);
      info(`Install: ${tool.install}`);
      missing++;
    } else {
      warn(`${tool.name} not found — ${tool.purpose}`);
      info(`Install: ${tool.install}`);
    }
  }

  // Check Docker daemon is running (not just installed)
  if (run('docker --version 2>/dev/null')) {
    const ping = run('docker info 2>/dev/null');
    if (ping) {
      ok('Docker daemon running');
    } else {
      warn('Docker installed but daemon not running — start Docker Desktop or: sudo systemctl start docker');
    }
  }

  if (missing > 0) {
    console.log('');
    warn(`${missing} required tool(s) missing — install them before deploying`);
  }
}

async function stepHelmRepos() {
  console.log(`\n${bold('6. Helm chart repositories')}`);
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

async function stepHosts() {
  console.log(`\n${bold('7. /etc/hosts entry')}`);
  const hostname = 'haproxy.cadc.dao.nrc.ca';

  try {
    const hosts = await readFile('/etc/hosts', 'utf-8');
    if (hosts.includes(hostname)) {
      ok(`${hostname} already in /etc/hosts`);
      return;
    }
  } catch {
    // Can't read /etc/hosts — try anyway
  }

  warn(`${hostname} not in /etc/hosts — browser access won't work without it`);

  if (!isTTY) {
    info(`Run: sudo bash -c "echo '127.0.0.1 ${hostname}' >> /etc/hosts"`);
    return;
  }

  const answer = await ask(`Add 127.0.0.1 ${hostname} to /etc/hosts? (requires sudo) [Y/n]: `);
  if (answer && answer.toLowerCase() !== 'y') {
    info('Skipped — add it manually before accessing the UI');
    return;
  }

  try {
    execSync(`sudo bash -c "echo '127.0.0.1 ${hostname}' >> /etc/hosts"`, {
      stdio: 'inherit',
      timeout: 30000,
    });
    ok(`Added ${hostname} to /etc/hosts`);
  } catch {
    fail('Could not update /etc/hosts — add it manually');
    info(`Run: sudo bash -c "echo '127.0.0.1 ${hostname}' >> /etc/hosts"`);
  }
}

async function stepKubeContext() {
  console.log(`\n${bold('8. Kubernetes context')}`);
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
await stepPlatformConfig();
await stepPrerequisites();
await stepHelmRepos();
await stepHosts();
await stepKubeContext();

console.log(`\n${bold('Summary')}`);
console.log('─'.repeat(40));
const envExists = await exists(join(ROOT, '.env'));
const helmValuesCount = (await readdir(join(ROOT, 'helm-values')).catch(() => []))
  .filter((f) => f.endsWith('.yaml')).length;
const dockerOk = run('docker --version 2>/dev/null') !== null;
const helmOk = run('helm version --short') !== null;
const kubectlOk = run('kubectl version --client 2>/dev/null') !== null;
const opensslOk = run('openssl version 2>/dev/null') !== null;
let hostsOk = false;
try { hostsOk = (await readFile('/etc/hosts', 'utf-8')).includes('haproxy.cadc.dao.nrc.ca'); } catch {}

(envExists ? ok : warn)('.env file');
ok('Directories created');
(helmValuesCount > 0 ? ok : warn)(`${helmValuesCount} values file(s)`);
(dockerOk ? ok : fail)('Docker');
(helmOk ? ok : fail)('Helm');
(kubectlOk ? ok : fail)('Kubectl');
(opensslOk ? ok : fail)('OpenSSL');
(hostsOk ? ok : warn)('/etc/hosts');

console.log('');
console.log(`  Run ${green('npm run dev')} to start the platform.`);
console.log('');
