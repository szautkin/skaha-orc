# Out-of-Box Automation & Resilience Fixes — 2026-02-27

## Context

After manually fixing session creation ([session-creation-fix-2026-02-27.md](./session-creation-fix-2026-02-27.md)), every full redeploy broke the system again because manual fixes (DB seeding, PV finalizer cleanup, haproxy config regeneration) were not automated. This document describes the automation layer added to make the system work out of the box.

---

## Problem 1: posix-mapper DB Loses UID Mappings on Redeploy

**Symptom:** After `stop-all` + `deploy-all`, Cavern crashes with:
```
PosixMapperClient.augment(Subject): Cannot invoke "String.split(String)" because "line" is null
```

**Root Cause:** Redeploying `posix-mapper-postgres` wipes the database. Fresh DB auto-assigns new UIDs starting at `minUID` (10000), but existing filesystem nodes are owned by UIDs from the previous install. Cavern's `cadc-gms-1.0.14` TSVPosixPrincipalParser NPEs when posix-mapper returns empty response for an unknown UID.

### Fix: 5-layer protection

#### Layer 1: PVC Preserved on Uninstall

**File:** `packages/backend/src/services/helm.service.ts`

`kubectlDelete()` now strips PersistentVolumeClaim documents from the manifest for services in `PRESERVE_PVC_SERVICES` (currently `posix-mapper-db`). The PVC and its data survive uninstall/reinstall cycles.

```typescript
const PRESERVE_PVC_SERVICES = new Set<ServiceId>(['posix-mapper-db']);

// In kubectlDelete():
const safeManifest = docs
  .filter((doc) => !doc.includes('kind: PersistentVolumeClaim'))
  .join('---');
```

Users who genuinely want to delete the PVC can do so manually via `kubectl delete pvc`.

#### Layer 2: Init SQL Creates Tables + Seeds Users

**File:** `packages/backend/src/services/helm.service.ts`

The `posix-mapper-db` manifest ConfigMap init SQL creates **only the schema** — NOT tables:

```sql
CREATE SCHEMA IF NOT EXISTS mapping AUTHORIZATION posixmapper;
```

**Important:** Tables (`mapping.users`, `mapping.groups`, `mapping.modelversion`) are **NOT** created in the init SQL. posix-mapper's Hibernate ORM auto-creates them with the correct column types, constraints, and sequences on first startup. Pre-creating tables with simplified definitions causes `PosixInitAction.initDatabase()` to fail because the schema doesn't match Hibernate's expectations.

Seed users are configured in `posix-mapper-postgres.yaml` (used by Layer 3):
```yaml
postgres:
  seed:
    users:
      - username: szautkin
        uid: 10000
      - username: jburke
        uid: 10001
```

Docker's postgres entrypoint runs init scripts only on first start with an empty data directory.

#### Layer 3: Post-Deploy kubectl exec Seeding

**File:** `packages/backend/src/services/bootstrap.service.ts`

`seedPosixMapperDb()` runs at backend startup and before every deploy. It:
1. Reads seed users from `posix-mapper-postgres.yaml`
2. kubectl execs into the postgres pod
3. Checks if `mapping.users` is empty
4. If empty, inserts seed data

This catches cases where the PVC was manually deleted or the init scripts didn't run.

#### Layer 4: Integration Test

**File:** `packages/backend/src/services/integration-test.service.ts`

New "DB User Mappings" test for `posix-mapper` and `posix-mapper-db` services:
- Queries the DB for user count
- Verifies each seed user exists with the expected UID
- Reports mismatches: `"szautkin: expected uid=10000, got uid=10002"`

Run via: `POST /api/services/posix-mapper/test`

#### Layer 5: Semantic Warnings

**File:** `packages/backend/src/routes/services.ts`

New warnings in `findSemanticWarnings()`:
- `posix-mapper-db`: warns if `postgres.seed.users` is empty
- `posix-mapper`: warns if `deployment.posixMapper.authorizedClients` is empty

These appear in the UI config-warnings panel.

#### UI: Seed Users Field

**File:** `packages/frontend/src/components/config/field-definitions.ts`

Added "Seed Users (UID Mappings)" section to `posix-mapper-db` config page with a textarea field for `postgres.seed.users`.

---

## Problem 2: PV Stuck in Terminating on Uninstall

**Symptom:** `stop-all` hangs indefinitely. `skaha-pv` stuck in `Terminating` state with `kubernetes.io/pv-protection` finalizer.

**Root Cause:** `kubectlDelete()` deleted the full manifest in one shot. The PV has a protection finalizer that prevents deletion while a PVC is bound to it. Since both were in the same manifest, the PV deletion blocks on the PVC still being bound.

### Fix: Ordered Volume Deletion

**File:** `packages/backend/src/services/helm.service.ts`

New `kubectlDeleteVolumes()` function handles the `volumes` service with correct ordering:

1. Delete PVCs first (unbinds from PVs)
2. Delete PVs with `--timeout=15s`
3. If PVs stuck on finalizers, auto-patch to remove them:
   ```typescript
   kubectl patch pv <name> -p '{"metadata":{"finalizers":null}}'
   ```
4. Delete remaining resources (ConfigMaps, etc.)

---

## Problem 3: HAProxy Config Uses Wrong Paths for Deploy Mode

**Symptom:** HAProxy pod fails with:
```
unable to stat SSL certificate from file '/Users/szautkin/.../server-cert.pem'
```
or:
```
'nameserver dns1' : invalid address: 'kube-dns.kube-system.svc.cluster.local'
```

**Root Cause:** `generateHAProxyConfig()` always used the same paths regardless of deploy mode:
- **Container mode** (kubernetes/docker): certs at `/usr/local/etc/haproxy/certs/`, K8s DNS FQDN works
- **Process mode** (host): certs at host filesystem paths, K8s DNS FQDN unreachable from host

### Fix: Deploy-Mode-Aware Config Generation

**File:** `packages/backend/src/services/haproxy.service.ts`

`generateHAProxyConfig()` now accepts `deployMode` and `kubeDnsIp` options:

```typescript
generateHAProxyConfig({
  enableSsl: true,
  deployMode: 'process',  // or 'kubernetes' (default)
  kubeDnsIp: '10.96.0.10',
});
```

- **kubernetes/docker** (default): uses container paths `/usr/local/etc/haproxy/certs/server.pem`
- **process**: uses host paths from `HAPROXY_CERT_PATH` and resolves kube-dns to cluster IP

Bootstrap generates config with container paths (safe default). Process-mode deploy regenerates with host paths and resolved DNS IP right before starting the daemon.

### Fix: Force Rollout Restart After ConfigMap Update

**File:** `packages/backend/src/services/haproxy.service.ts`

K8s deploy now forces a rollout restart after applying the deployment manifest, so pods always pick up new ConfigMap content:

```typescript
await execa(kubectlBinary, [
  'rollout', 'restart', 'deployment/haproxy', '-n', namespace,
]);
```

Previously, `kubectl apply` returned `unchanged` if only the ConfigMap changed, leaving the pod running with stale config in CrashLoopBackOff.

---

## Problem 4: Missing Bootstrap Sync Functions

**Symptom:** After fresh deploy, posix-mapper rejects requests from Cavern/Skaha because `authorizedClients` is empty. Cavern init fails because `rootOwner` defaults to non-root.

### Fix: New Bootstrap Functions

**File:** `packages/backend/src/services/bootstrap.service.ts`

| Function | Purpose | Runs |
|----------|---------|------|
| `syncPosixMapperAuthorizedClients()` | Sets `authorizedClients: [sshd, cavern, skaha]` if empty | Startup + pre-deploy |
| `syncCavernRootOwner()` | Defaults rootOwner to `root/0/0` if empty | Startup + pre-deploy |
| `seedPosixMapperDb()` | Seeds mapping.users if DB is empty | Startup + pre-deploy |

All three are wired into `index.ts` (startup) and `services.ts` (pre-deploy).

---

## Files Changed

### Backend

| File | Change |
|------|--------|
| `src/services/helm.service.ts` | PVC preservation, init SQL seeding, ordered volume deletion |
| `src/services/bootstrap.service.ts` | `seedPosixMapperDb()`, `syncPosixMapperAuthorizedClients()`, `syncCavernRootOwner()` |
| `src/services/haproxy.service.ts` | Deploy-mode-aware config, rollout restart after deploy |
| `src/services/kubectl.service.ts` | `kubectlExec()` helper for running commands in pods |
| `src/services/integration-test.service.ts` | DB User Mappings test |
| `src/routes/services.ts` | Semantic warnings for seed users, authorizedClients |
| `src/index.ts` | Wire new bootstrap functions |
| `helm-values/posix-mapper-postgres.yaml` | Added `postgres.seed.users` config |
| `helm-values/posix-mapper-values.yaml` | Added `authorizedClients` |
| `helm-values/cavern-values.yaml` | rootOwner: root/0/0, dataDir: /data, fsGroup: 10000 |
| `helm-values/storage.yaml` | Full backend services config |
| `helm-values/volumes.yaml` | Workload PV/PVC documentation |

### Frontend

| File | Change |
|------|--------|
| `src/components/config/field-definitions.ts` | Seed Users section, fsGroup field, rootOwner text type, storage-ui backend fields |

### Example Values

| File | Change |
|------|--------|
| `helm-values.example/posix-mapper-postgres.yaml` | Added `postgres.seed.users` with documentation |

---

## Deploy Order (Working)

```
base → volumes → dex → mock-ac → reg → posix-mapper-db → haproxy → posix-mapper → cavern → skaha → science-portal → storage-ui
```

---

## Verification Checklist

After a full `stop-all` + `deploy-all`:

1. `stop-all` completes without hanging (PV finalizers auto-cleared)
2. `posix-mapper-postgres-pvc` survives uninstall (PVC preserved)
3. Backend logs show `Seeded posix-mapper DB with initial user mappings` (if DB was empty)
4. Backend logs show `Auto-set posix-mapper authorizedClients`
5. Backend logs show `Auto-set Cavern rootOwner to root/0/0` (if empty)
6. HAProxy starts without cert errors
7. `POST /api/services/posix-mapper/test` → DB User Mappings: pass
8. `POST /science-portal/session` → session creates successfully
