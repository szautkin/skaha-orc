# Service Catalog & Dependency Graph

## Services

1. **base** — Traefik ingress + namespaces (default namespace)
2. **reg** — IVOA Registry (nginx, custom chart from helm_assets/reg/)
3. **volumes** — PersistentVolume + PVC (kubectl apply)
4. **posix-mapper** — UID/GID mapping + PostgreSQL (skaha-system)
5. **skaha** — Session management + Redis (skaha-system)
6. **cavern** — VOSpace storage + PostgreSQL UWS (skaha-system)
7. **science-portal** — Web UI + Redis + OIDC (skaha-system)
8. **storage-ui** — Storage browser + Redis + OIDC (skaha-system)
9. **doi** — DOI minting (optional, skaha-system)

## Dependency Graph

```
base (Traefik, namespaces)
  └─> reg (IVOA Registry - nginx)
        ├─> posix-mapper (UID/GID + PostgreSQL)
        │     ├─> skaha (Sessions + Redis)
        │     │     └─> science-portal (Web UI + Redis + OIDC)
        │     └─> cavern (VOSpace + PostgreSQL)
        │           ├─> storage-ui (Storage browser + Redis + OIDC)
        │           └─> doi (optional, DOI minting)
```

## Deploy Order

base -> reg -> volumes -> posix-mapper -> skaha -> cavern -> science-portal -> storage-ui -> doi
