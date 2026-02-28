# Session Creation Fix — 2026-02-27

## Problem

After fixing the identity/authorization chain (Dex OIDC, posix-mapper, mock-ac GMS), notebook session creation via Science Portal still failed:

```
POST https://haproxy.cadc.dao.nrc.ca/science-portal/session → 500
  → Skaha: Bad Gateway calling Cavern
  → Cavern: init failed / PosixMapperClient.augment NPE
```

Three cascading issues prevented Cavern VOSpace from working.

---

## Issue 1: Cavern Init — "posix principal default group is null"

**Symptom:** Cavern pod starts but `CavernInitAction` fails:
```
root node: /data/cavern/cavern owner: 1000(cavern)
init failed
java.lang.RuntimeException: CONFIG or BUG: posix principal default group is null
    at org.opencadc.cavern.nodes.NodeUtil.getDefaultGroup(NodeUtil.java:798)
```

**Root Cause:** `cavern-values.yaml` had `rootOwner: cavern/1000/1000` but:
- Container `/etc/passwd` only has `root` (uid=0) — no `cavern` user
- Container `/etc/group` only has `root` (gid=0) — no gid=1000
- `getDefaultGroup()` resolves gid via POSIX system calls, fails on gid=1000

**Fix:** Changed rootOwner to match the container's actual users:
```yaml
# BEFORE (broken)
rootOwner:
  username: cavern
  uid: 1000
  gid: 1000

# AFTER (from original config ~/reviews/helm_config/cavern-values.yaml)
rootOwner:
  username: "root"
  uid: "0"
  gid: "0"
```

Also fixed `dataDir: /data` (was `/data/cavern`) and added `securityContext.fsGroup: 10000`.

**Note:** uid/gid values must be **quoted strings** — Helm's `required` template function treats `0` as falsy.

---

## Issue 2: UID Mismatch — TSVPosixPrincipalParser NPE

**Symptom:** After fixing init, Cavern node access still failed:
```
FAIL: PosixMapperClient.augment(Subject)
Caused by: java.lang.NullPointerException
    at PosixMapperClient$TSVPosixPrincipalParser.parse(PosixMapperClient.java:405)
```

**Root Cause:** Filesystem ownership didn't match posix-mapper database:
```
/data/cavern/home/admin  → owned by uid=10000  (from previous install)
/data/cavern/home/testuser    → owned by uid=10001  (from previous install)
posix-mapper database       → admin = uid=10002 (new auto-assignment)
```

When Cavern traversed `/home/admin`, it read uid=10000 from the filesystem and queried posix-mapper for that uid. Posix-mapper had no mapping for uid=10000 → empty response → `readLine()` returned null → NPE in `line.split()`.

**Bug detail:** `cadc-gms-1.0.14.jar` (Cavern) has no null-check before parsing. Fixed in 1.0.19 (used by Skaha), but Cavern image ships 1.0.14.

**Fix:** Updated posix-mapper PostgreSQL directly:
```sql
UPDATE mapping.users SET uid = 10000 WHERE username = 'admin';
UPDATE mapping.groups SET gid = 10000 WHERE groupuri LIKE '%admin';
INSERT INTO mapping.users (uid, username) VALUES (10001, 'testuser');
INSERT INTO mapping.groups (gid, groupuri) VALUES (10001,
  'ivo://default-group-should-be-ignored.opencadc.org/default-group?testuser');
```

**Posix-mapper TSV response format** (verified via curl with JWT):
```
admin	10000	10000
```
Three columns: `username\tuid\tdefaultGroupGid`

---

## Issue 3: Missing skaha-workload-cavern-pvc

**Symptom:** PVC `skaha-workload-cavern-pvc` in `Failed` state.

**Root Cause:** The PV had `persistentVolumeReclaimPolicy: Delete` on a local volume. When the PVC was deleted, Kubernetes tried to delete the PV but failed (no deleter plugin for local volumes), leaving it stuck in `Failed`.

**Fix:** Recreated both PV and PVC with `Retain` policy:
```yaml
# PV in default namespace
apiVersion: v1
kind: PersistentVolume
metadata:
  name: skaha-workload-pv
  labels:
    storage: skaha-workload-storage
spec:
  capacity: { storage: 10Gi }
  accessModes: [ReadWriteMany]
  persistentVolumeReclaimPolicy: Retain  # NOT Delete!
  storageClassName: ""
  local:
    path: /var/lib/k8s-pvs/science-platform
  nodeAffinity: ...

# PVC in skaha-workload namespace
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: skaha-workload-cavern-pvc
  namespace: skaha-workload
spec:
  accessModes: [ReadWriteMany]
  storageClassName: ""
  resources: { requests: { storage: 10Gi } }
  selector:
    matchLabels: { storage: skaha-workload-storage }
```

---

## Verification

After all fixes:
1. Cavern init: `root node: /data/cavern owner: 0(root)` — no errors
2. Cavern node access: `GET /cavern/nodes/home/admin` → returns VOSpace XML with files
3. Session creation: `POST /science-portal/session` → success

```bash
# Test Cavern directly
curl -sk -H "Authorization: Bearer $TOKEN" \
  https://haproxy.cadc.dao.nrc.ca/cavern/nodes/home/admin
# Returns: <vos:node uri="vos://cadc.nrc.ca~cavern/home/admin" ...>
```

---

## Services Restarted

After fixing all three issues, these pods needed restart (in order):
1. `posix-mapper-tomcat` — reload database changes
2. `cavern-tomcat` — re-run CavernInitAction with new rootOwner
3. `skaha-skaha-tomcat` — clear 24h posix-mapper cache
4. `science-portal-tomcat` — (optional) clear session state

---

## Files Changed

| File | Change |
|------|--------|
| `packages/backend/helm-values/cavern-values.yaml` | rootOwner: root/0/0, dataDir: /data, fsGroup: 10000 |
| posix-mapper-postgres DB (runtime) | admin uid 10002→10000, added testuser uid=10001, added cavern uid=1000 |
| skaha-workload-pv/pvc (runtime) | Recreated with Retain policy |

---

## Key Lesson

**Always check the original working config** at `~/reviews/helm_config/` before guessing values. The rootOwner=root/0/0 and dataDir=/data settings were in the original config but were changed at some point, breaking Cavern init.

**posix-mapper UIDs are permanent.** Once filesystem nodes are created with specific UIDs, those UIDs must exist in posix-mapper. A fresh posix-mapper DB will auto-assign different UIDs (starting at minUID), causing mismatches with existing data.
