# Skaha-Orc

A deployment orchestrator for the [Skaha](https://github.com/opencadc/science-platform) astronomy platform. Provides a web UI and REST API for managing Helm releases, Kubernetes resources, HAProxy routing, and TLS certificates.

## Architecture

```
packages/
  shared/     ← TypeScript types, constants, validation schemas
  backend/    ← Express API server (Helm, kubectl, HAProxy, cert management)
  frontend/   ← React SPA (Vite, Tailwind, React Query)
```

## Prerequisites

- Node.js >= 18
- npm >= 9
- `helm` CLI
- `kubectl` CLI with a configured kubeconfig
- (Optional) `haproxy` binary or Docker for HAProxy config validation

## Quick Start

```bash
# Install dependencies
npm install

# Copy and edit environment config
cp .env.example .env

# Place your Helm values files in ./helm-values/
# Place your local charts in ./charts/

# Start development servers (backend + frontend)
npm run dev
```

The frontend dev server runs on `http://localhost:5173` and proxies `/api` to the backend on port 3001.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |
| `HELM_CONFIG_DIR` | `./helm-values` | Directory containing Helm values YAML files |
| `CHART_BASE_DIR` | `./charts` | Base directory for local chart paths |
| `HELM_BINARY` | `helm` | Path to Helm binary |
| `KUBECTL_BINARY` | `kubectl` | Path to kubectl binary |
| `PLATFORM_HOSTNAME` | `haproxy.cadc.dao.nrc.ca` | Hostname used in extraHosts entries |
| `HAPROXY_CONFIG_PATH` | `./haproxy/haproxy.cfg` | Path to HAProxy config file |
| `HAPROXY_BINARY` | `haproxy` | Path to HAProxy binary |
| `KUBE_CONTEXT` | _(empty)_ | Kubernetes context name (optional) |
| `KUBECONFIG` | _(empty)_ | Path to kubeconfig file (optional) |
| `CORS_ORIGINS` | `*` (dev) | Comma-separated allowed CORS origins |

## Docker

```bash
docker compose build
docker compose up
```

## Scripts

```bash
npm run dev           # Start backend + frontend in dev mode
npm run build         # Build all packages
npm run typecheck     # Type-check all packages
npm run lint          # Lint all packages
npm run format        # Format code with Prettier
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
