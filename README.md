# Skaha-Orc

[![CI](https://github.com/szautkin/skaha-orc/actions/workflows/ci.yml/badge.svg)](https://github.com/szautkin/skaha-orc/actions/workflows/ci.yml)
[![CodeQL](https://github.com/szautkin/skaha-orc/actions/workflows/codeql.yml/badge.svg)](https://github.com/szautkin/skaha-orc/actions/workflows/codeql.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

A deployment orchestrator and companion UI for the [OpenCADC](https://github.com/opencadc) astronomy platform stack. Skaha-Orc provides a web interface and REST API for managing Helm releases, Kubernetes resources, HAProxy routing, and TLS certificates — designed to work alongside [opencadc/deployments](https://github.com/opencadc/deployments) and the broader OpenCADC ecosystem.

## Relationship to OpenCADC

Skaha-Orc orchestrates the services defined in the [OpenCADC Science Platform](https://github.com/opencadc/science-platform), including Skaha, Cavern, Science Portal, POSIX Mapper, and others. It consumes the same Helm charts published by [opencadc/deployments](https://github.com/opencadc/deployments) and provides:

- A visual dashboard showing service dependencies, deployment status, and pod health
- One-click deploy/pause/resume/uninstall for individual services or the entire platform
- Helm values editing with live YAML validation
- HAProxy config generation, testing, and deployment based on the service catalog
- TLS certificate management (CA generation, signed certs, per-service secrets)
- Multi-cluster support via kubectl context switching

Where `opencadc/deployments` provides CI/CD automation and chart publishing, Skaha-Orc provides the interactive operator experience — particularly useful during initial platform setup, debugging, and development environments.

## Features

- **Dashboard** — real-time service status, pod health, and deployment phases at a glance, grouped by service tier
- **Dependency graph** — visual DAG of service relationships with topological deploy ordering
- **Helm values editing** — per-service config forms with live YAML validation and type-safe fields
- **ExtraHosts management** — bulk IP/hostname override editing across all services
- **Certificate lifecycle** — generate CAs, sign certs, view expiry, renew — all from the UI
- **HAProxy orchestration** — generate, test, deploy, reload, and monitor HAProxy (Kubernetes, Docker, or process mode)
- **OIDC settings** — propagate issuer URI and client configs across all services from a single panel
- **Dex user management** — manage static passwords for the Dex identity provider
- **Deployment profiles** — standard, production, minimal, and full presets for one-click deploy
- **Service tiers** — core / recommended / site categorization with tier-based dashboard grouping
- **Context switching** — switch kubectl contexts at runtime for multi-cluster management
- **Setup wizard** — interactive `npm run setup` creates `.env`, directories, copies example values, and checks CLI prerequisites
- **Bootstrap preflight** — on startup, the frontend shows a checklist of missing prerequisites
- **Interactive API docs** — Swagger UI at `/api/docs` for exploring and testing all endpoints

## Architecture

```
packages/
  shared/     <- TypeScript types, constants, validation schemas
  backend/    <- Express API server (Helm, kubectl, HAProxy, cert management)
  frontend/   <- React SPA (Vite, Tailwind, React Query)
```

**Tech stack:** TypeScript, Express, React, Vite, Tailwind CSS, React Hook Form, TanStack React Query, Zod, Pino, Sonner toasts, Lucide icons.

## Service Catalog

The platform manages 14 services deployed in dependency order across three tiers:

| # | Service | Tier | Description | Namespace |
|---|---------|------|-------------|-----------|
| 1 | **base** | core | Traefik ingress controller, TLS, and namespaces | default |
| 2 | **reg** | core | IVOA Registry service | skaha-system |
| 3 | **volumes** | core | PersistentVolume + PVC resources | skaha-system |
| 4 | **posix-mapper-db** | core | Standalone PostgreSQL for posix-mapper | skaha-system |
| 5 | **posix-mapper** | core | UID/GID mapping service with PostgreSQL | skaha-system |
| 6 | **cavern** | core | VOSpace storage service with PostgreSQL UWS | skaha-system |
| 7 | **skaha** | core | Session management service with Redis | skaha-system |
| 8 | **science-portal** | recommended | Web UI for launching sessions (OIDC + Redis) | skaha-system |
| 9 | **storage-ui** | recommended | Storage browser with OIDC and Redis | skaha-system |
| 10 | **haproxy** | site | Reverse proxy and load balancer | skaha-system |
| 11 | **mock-ac** | site | Mock IVOA GMS / user management service (dev/demo) | skaha-system |
| 12 | **doi** | site | DOI minting service | skaha-system |
| 13 | **dex** | site | Lightweight OIDC provider with static passwords (dev/demo) | skaha-system |
| 14 | **keycloak** | site | Full-featured OIDC identity provider with admin console | skaha-system |

### Service Tiers

| Tier | Description | Services |
|------|-------------|----------|
| **Core** | Required infrastructure — always deployed | base, reg, volumes, posix-mapper-db, posix-mapper, cavern, skaha |
| **Recommended** | Standard user-facing services | science-portal, storage-ui |
| **Site** | Site-specific or optional services | haproxy, mock-ac, doi, dex, keycloak |

### Deployment Profiles

| Profile | Description | Includes |
|---------|-------------|----------|
| **Standard** (Dev/Demo) | Core + recommended + HAProxy + Dex + Mock AC | Quick setup with static passwords and mock group management |
| **Production** | Core + recommended + HAProxy + Keycloak | Full IdP with admin console |
| **Minimal** | Core infrastructure only | 7 core services |
| **Full** | All 14 services | Includes both Dex and Keycloak |

### Identity Providers

Skaha-Orc supports two OIDC identity providers:

- **Dex** — lightweight provider with static passwords, ideal for development and demo environments. Manage users directly from the UI.
- **Keycloak** — full-featured IdP with admin console, federation, and enterprise SSO. Recommended for production.

Choose between them via deployment profiles or by selecting individual services.

### Deployment Order

Services are deployed in four phases. Within each phase, topological sort ensures dependencies are satisfied:

| Phase | Name | Services |
|-------|------|----------|
| 1 | **Foundation** | base, volumes |
| 2 | **Identity & Discovery** | dex (or keycloak), mock-ac, haproxy, reg, posix-mapper-db |
| 3 | **Core Services** | posix-mapper, cavern |
| 4 | **Session & UI** | skaha, science-portal, storage-ui, doi |

Topological order for the standard profile: `base → volumes → dex → haproxy → mock-ac → reg → posix-mapper-db → posix-mapper → cavern → skaha → science-portal → storage-ui`

> **Runtime dependencies:** Most Java services (posix-mapper, skaha, cavern, science-portal, storage-ui) require an OIDC provider (Dex or Keycloak), a GMS service (mock-ac), and HAProxy to be running at runtime. These are not deploy-time blockers but will cause 500 errors if missing.

### Dependency Graph

```
base (Traefik, namespaces)
  ├─> volumes (PV + PVC)
  │     └─> posix-mapper-db (PostgreSQL)
  ├─> reg (IVOA Registry)
  ├─> haproxy (reverse proxy)
  ├─> mock-ac (mock GMS, dev/demo)
  ├─> dex (lightweight OIDC, dev/demo)
  └─> keycloak (full OIDC, production)

reg + posix-mapper-db
  └─> posix-mapper (UID/GID mapping)
        └─> cavern (VOSpace storage)
              ├─> skaha (session management)
              │     └─> science-portal (Web UI)
              ├─> storage-ui (storage browser)
              └─> doi (DOI minting)
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

# Run interactive setup (creates .env, directories, copies example values, checks CLIs)
npm run setup

# Start development servers (backend + frontend)
npm run dev
```

If you prefer manual setup, copy `.env.example` to `.env`, create `helm-values/`, `haproxy/`, and `charts/` directories, and place your Helm values YAML files in `helm-values/`. When you start the app without prerequisites, the frontend will show a setup checklist indicating what's missing.

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

## Scripts

```bash
npm run setup         # Interactive setup wizard (env, dirs, values, CLI checks)
npm run dev           # Start backend + frontend in dev mode
npm run build         # Build all packages
npm run typecheck     # Type-check all packages
npm run lint          # Lint all packages
npm run format        # Format code with Prettier
npm test              # Run all tests (shared + backend + frontend)
```

## API Documentation

Interactive API docs are available at **`/api/docs`** (Swagger UI) when the backend is running. All endpoints are documented across 8 tags: Health, Services, Deployment, Kubernetes, Certificates, HAProxy, OIDC, and Dex.

## Docker

```bash
docker compose build
docker compose up
```

## Related Projects

- [opencadc/deployments](https://github.com/opencadc/deployments) — Helm charts and CI/CD for CADC services
- [opencadc/science-platform](https://github.com/opencadc/science-platform) — Science Platform infrastructure
- [opencadc/science-portal](https://github.com/opencadc/science-portal) — CANFAR Science Portal UI

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).
