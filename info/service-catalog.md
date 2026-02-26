# Service Catalog & Dependency Graph

## Services

1. **base** — Traefik ingress + namespaces (default namespace)
2. **haproxy** — Reverse proxy and load balancer (skaha-system)
3. **reg** — IVOA Registry (nginx, custom chart from helm_assets/reg/)
4. **volumes** — PersistentVolume + PVC (kubectl apply)
5. **posix-mapper-db** — Standalone PostgreSQL for posix-mapper (skaha-system)
6. **posix-mapper** — UID/GID mapping + PostgreSQL (skaha-system)
7. **mock-ac** — Mock access-control service for development (optional, skaha-system)
8. **skaha** — Session management + Redis (skaha-system)
9. **cavern** — VOSpace storage + PostgreSQL UWS (skaha-system)
10. **science-portal** — Web UI + Redis + OIDC (skaha-system)
11. **storage-ui** — Storage browser + Redis + OIDC (skaha-system)
12. **doi** — DOI minting (optional, skaha-system)

## Dependency Graph

```
base (Traefik, namespaces)
  ├─> haproxy (reverse proxy)
  ├─> reg (IVOA Registry - nginx)
  │     └─> posix-mapper-db (PostgreSQL)
  │           └─> posix-mapper (UID/GID + PostgreSQL)
  │                 ├─> skaha (Sessions + Redis)
  │                 │     └─> science-portal (Web UI + Redis + OIDC)
  │                 └─> cavern (VOSpace + PostgreSQL)
  │                       ├─> storage-ui (Storage browser + Redis + OIDC)
  │                       └─> doi (optional, DOI minting)
  ├─> volumes (PV + PVC)
  └─> mock-ac (optional, dev access-control)
```

## Deploy Order

base -> haproxy -> reg -> volumes -> posix-mapper-db -> posix-mapper -> mock-ac -> skaha -> cavern -> science-portal -> storage-ui -> doi
