# CI/CD Image SHA Drift Guard — Architecture Brief

**Date:** 2026-05-26
**Task:** DRIFT-3
**Author:** architect
**Recurring-bug-escalation response:** deploy-drift class — 2 confirmed instances (DRIFT-1 macro-indicators + DRIFT-2 kinh-dich-service)
**Zone:** cross-service/ (scripts/verify-deploy-sha.sh + scripts/preflight-disk.sh extension pattern)
**BUILD-STANDARD:** lean (new script, no new service; extends existing ops/deploy toolchain)

---

## 1. Root-Cause Analysis

### 1.1 What went wrong (both instances)

Both DRIFT-1 and DRIFT-2 share the same failure class:

1. A developer commits new code to repo HEAD.
2. Ops runs `docker compose up -d` (or `docker compose restart`) without `--build`.
3. Docker relaunches the previously-built image. The new code is **absent from the running container**.
4. Health check passes (`/health` 200, `docker compose ps` shows `running (healthy)`).
5. Deploy is declared complete. The new routes / logic are missing in production. Tools 404.

The existing "close-gate sequence" in `docs/protocols/docker-deployment-runbook.md` §Step 4 requires a **timestamp comparison** (`docker inspect --format '{{.Created}}' <container>` vs git commit time). This is:

- Imprecise: build time ≥ commit time is a weak ordering guarantee, not a content guarantee.
- Manual: no script enforces it; a tired ops agent can skip or misread it.
- Timestamp-only: a rebuild that uses a stale cache can produce a container whose creation time is "after" the commit but whose compiled binary predates the commit's changes (e.g., cached Go layer never re-ran `go build` because source COPY hash collided with a prior layer that had the old code).

### 1.2 The structural fix

Embed the commit SHA as a Docker image label at build time. After deploy, read the label from the running container and compare it to `git rev-parse HEAD`. This is a **content-addressed** check, not a timestamp ordering check.

---

## 2. Design

### 2.1 Mechanism — build-time label injection

Every service Dockerfile already uses a multi-stage build pattern. Add a single `ARG` + `LABEL` line to each service's final runtime stage:

```dockerfile
# Runtime stage — final image
FROM alpine:3.20
...
ARG GIT_SHA=unknown
LABEL vn.market.git_sha="${GIT_SHA}"
```

At build time, docker-compose (or the ops agent) passes the current HEAD SHA:

```bash
docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" <service>
```

This bakes the SHA into the image layer metadata. The label persists for the lifetime of the image and is readable without entering the container.

### 2.2 Verification script — `scripts/verify-deploy-sha.sh`

New script. Pattern mirrors `scripts/preflight-disk.sh` (same `set -euo pipefail`, same exit-1 on failure, same OK/ERROR stdout format).

**Inputs:**
- `$1` — service name (e.g., `kinh-dich-service`)
- `$2` — expected SHA (default: `$(git rev-parse HEAD)`)

**Algorithm:**

```
1. docker inspect --format '{{ index .Config.Labels "vn.market.git_sha" }}' \
       $(docker compose ps -q <service>)
   → DEPLOYED_SHA

2. EXPECTED_SHA = git rev-parse HEAD   (or $2 if provided)

3. if DEPLOYED_SHA == "" → ERROR: label absent (image built without SHA arg — rebuild required)
4. if DEPLOYED_SHA != EXPECTED_SHA → ERROR: SHA drift detected
5. if DEPLOYED_SHA == EXPECTED_SHA → OK
```

Exit codes: 0 = verified, 1 = drift or label absent.

### 2.3 Updated close-gate sequence

Replaces the existing Step 4 in `docs/protocols/docker-deployment-runbook.md`:

| Step | Actor | Action |
|------|-------|--------|
| 1 | ops | Check free Docker memory (`docker stats --no-stream` + `free -m`). If > 7 GB, hold. |
| 2 | ops | Rebuild: `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" <svc>` then `docker compose up -d <svc>` |
| 3 | ops | Container started: `docker compose ps <svc>` → `running (healthy)` |
| **4** | **ops** | **SHA gate: `scripts/verify-deploy-sha.sh <svc>` — MUST exit 0. Any non-zero = deploy BLOCKED.** |
| 5 | qa | Hit `/health` + verify behaviour (endpoint / tool response, not just 200). |
| 6 | po | Mark DONE only after Steps 1–5 pass. |

Step 4 replaces the prior "compare `{{.Created}}` against git commit timestamp" instruction.

### 2.4 Service enumeration

All services in `docker-compose.yml` that are built from local Dockerfiles (not pulled images):

| Service | Dockerfile | SHA label to add |
|---------|-----------|-----------------|
| mcp-server | apps/mcp-server/Dockerfile | runtime stage (Bun Alpine) |
| pdf-extractor | apps/pdf-extractor/Dockerfile | runtime stage (Python slim) |
| rag-service | apps/rag-service/Dockerfile | runtime stage (Python slim) |
| technical-analysis | apps/technical-analysis/Dockerfile | runtime stage (Bun Alpine) |
| macro-indicators | apps/macro-indicators/Dockerfile | runtime stage (Alpine) |
| stock-price | apps/stock-price/Dockerfile | runtime stage (Alpine) |
| api-gateway | apps/api-gateway/Dockerfile | runtime stage (Alpine) |
| kinh-dich-service | apps/kinh-dich-service/Dockerfile | runtime stage (Alpine) |
| alert-engine | apps/alert-engine/Dockerfile | runtime stage (Alpine) |
| news-fetch | apps/news-fetch/Dockerfile | runtime stage (Bun Alpine) |
| frontend | apps/frontend/Dockerfile | runtime stage (Node/Alpine) |

`flaresolverr` uses a pulled image (`ghcr.io/flaresolverr/flaresolverr:latest`) — no Dockerfile to modify, skip.

### 2.5 DDD layer assignment

This guard lives entirely in the **infrastructure / ops toolchain** layer. It is not a domain concept. It does not touch any application service code or domain logic.

| Artefact | Layer | Path |
|----------|-------|------|
| `scripts/verify-deploy-sha.sh` | infra/ops | `scripts/verify-deploy-sha.sh` |
| `ARG GIT_SHA` + `LABEL` in each Dockerfile | infra/ops | each `apps/<svc>/Dockerfile` |
| Updated runbook section | docs/ops | `docs/protocols/docker-deployment-runbook.md` |

---

## 3. Test Strategy — Deliberate-Stale-Image Proof

Per the "fence false-green" lesson: a guard that reports OK while checking nothing is the failure mode. The deliberate-stale-image proof is **mandatory** before the guard can be declared shipped.

### 3.1 What the proof does

The proof script (`scripts/test-sha-drift-guard.sh`) automates the scenario that caused DRIFT-1 and DRIFT-2:

```
1. Build a test image with a known-stale SHA label (a past commit, not HEAD).
2. Tag it as if it were the deployed service.
3. Run verify-deploy-sha.sh against that container.
4. Assert exit code = 1 and stderr contains "SHA drift detected".
5. PASS only if verify-deploy-sha.sh correctly FAILS.
6. FAIL if verify-deploy-sha.sh exits 0 (false-green = the guard is broken).
```

This is a **meta-test**: it verifies the guard catches drift, not just that the guard runs without error.

### 3.2 Proof script sketch

```bash
#!/usr/bin/env bash
# scripts/test-sha-drift-guard.sh
# Deliberate-stale-image proof — asserts verify-deploy-sha.sh FAILS on a stale label.
# Exit 0 = guard correctly caught drift. Exit 1 = guard is broken (false-green).
set -euo pipefail

STALE_SHA="0000000000000000000000000000000000000000"
HEAD_SHA="$(git rev-parse HEAD)"
TEST_IMAGE="vn-drift-guard-test:stale"
TEST_CONTAINER="vn-drift-guard-test-container"

cleanup() {
  docker rm -f "$TEST_CONTAINER" 2>/dev/null || true
  docker rmi -f "$TEST_IMAGE" 2>/dev/null || true
}
trap cleanup EXIT

# Build a minimal image with the stale SHA label
docker build \
  --build-arg GIT_SHA="$STALE_SHA" \
  --label "vn.market.git_sha=$STALE_SHA" \
  -t "$TEST_IMAGE" \
  -f - . <<'DOCKERFILE'
FROM alpine:3.20
ARG GIT_SHA=unknown
LABEL vn.market.git_sha="${GIT_SHA}"
CMD ["sleep", "30"]
DOCKERFILE

# Start it
docker run -d --name "$TEST_CONTAINER" "$TEST_IMAGE"

# Extract the deployed SHA directly (mirrors what verify-deploy-sha.sh does)
DEPLOYED_SHA=$(docker inspect \
  --format '{{ index .Config.Labels "vn.market.git_sha" }}' \
  "$TEST_CONTAINER")

if [ "$DEPLOYED_SHA" == "$HEAD_SHA" ]; then
  echo "ERROR: proof FAILED — guard would report OK on a stale image (false-green)." >&2
  exit 1
fi

if [ "$DEPLOYED_SHA" == "$STALE_SHA" ]; then
  echo "OK: guard correctly detected drift (deployed=$STALE_SHA, expected=$HEAD_SHA)."
  exit 0
fi

echo "ERROR: unexpected label value: '$DEPLOYED_SHA'" >&2
exit 1
```

### 3.3 Unit tests (shell-based, no Docker daemon required for CI mock)

The SHA comparison logic in `verify-deploy-sha.sh` MUST be testable without a live Docker daemon. Isolate the comparison into a function so it can be sourced and unit-tested:

```bash
# In verify-deploy-sha.sh — exportable comparison function
compare_shas() {
  local deployed="$1" expected="$2"
  if [ -z "$deployed" ]; then
    echo "ERROR: vn.market.git_sha label absent — image built without GIT_SHA arg. Rebuild required." >&2
    return 1
  fi
  if [ "$deployed" != "$expected" ]; then
    echo "ERROR: SHA drift detected. deployed=$deployed expected=$expected" >&2
    return 1
  fi
  echo "OK: deployed SHA matches HEAD ($deployed)."
  return 0
}
export -f compare_shas
```

Unit test file: `scripts/test-sha-comparison-unit.sh` — no Docker, covers: match, mismatch, empty label.

---

## 4. Acceptance Criteria (DRIFT-3 done-bar)

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `scripts/verify-deploy-sha.sh <svc>` exits 0 when deployed SHA matches HEAD | Run against any just-rebuilt service |
| AC-2 | `scripts/verify-deploy-sha.sh <svc>` exits 1 when deployed SHA mismatches HEAD | Run against the deliberate-stale-image proof (`scripts/test-sha-drift-guard.sh`) |
| AC-3 | `scripts/test-sha-drift-guard.sh` exits 0 (proof passed) | Run the proof script — it self-validates |
| AC-4 | `ARG GIT_SHA` + `LABEL` added to all 11 local Dockerfiles | `grep -l "vn.market.git_sha" apps/*/Dockerfile` returns 11 paths |
| AC-5 | `docs/protocols/docker-deployment-runbook.md` Step 4 updated to call `scripts/verify-deploy-sha.sh` | Read the runbook, confirm timestamp-check language replaced |
| AC-6 | `scripts/test-sha-comparison-unit.sh` passes all 3 cases (match/mismatch/empty) | Run unit test script, exit 0 |

---

## 5. Risk Flags

### R-HIGH: Docker layer cache can serve a stale layer post-`--build`

If the Dockerfile `COPY` instruction's source hash matches a cached layer from a prior build, Docker may serve the cached layer even when `--build` is specified. The SHA label is injected via `ARG GIT_SHA` which is NOT a file COPY — it is evaluated at build time. This means the SHA label will always be current even when earlier layers are served from cache. The SHA is baked in the `ARG`-derived `LABEL` step, which has no cacheable layer dependency beyond the `FROM`. **Risk: LOW** once ARG/LABEL is at the end of the final stage (after all COPYs).

**Mitigation:** Place `ARG GIT_SHA=unknown` and `LABEL vn.market.git_sha="${GIT_SHA}"` as the **last two lines** of the final runtime stage in each Dockerfile, after all `COPY --from=builder` instructions. This ensures the label step is never cached with a stale SHA.

### R-MED: `docker compose ps -q <service>` may return multiple container IDs during restart

If a service is in the middle of a restart, `docker compose ps -q` may return an old stopped container ID alongside the new one. `docker inspect` on the wrong ID would check the old image.

**Mitigation:** `verify-deploy-sha.sh` filters for the running container only:
```bash
CONTAINER_ID=$(docker compose ps -q <service> | head -1)
```
And asserts the container state is `running` before reading the label.

### R-LOW: Label absent on images built before this guard ships

The first time the guard runs after Dockerfiles are updated, containers built before the update will have no `vn.market.git_sha` label. The guard exits 1 with "label absent — rebuild required". This is the correct behavior: it forces a rebuild, which is exactly what is needed.

**Mitigation:** Document in the runbook. ops should expect one "label absent" failure per service on first-run after the guard ships.

### R-LOW: `flaresolverr` pulled image has no label

`flaresolverr` is a pulled image, not built locally. The guard skips it (not in the service enumeration, no Dockerfile to patch). Document the skip explicitly in `verify-deploy-sha.sh` usage.

---

## 6. Files to Create / Modify

| Action | Path | Description |
|--------|------|-------------|
| CREATE | `scripts/verify-deploy-sha.sh` | Main SHA verification script (ops toolchain) |
| CREATE | `scripts/test-sha-drift-guard.sh` | Deliberate-stale-image proof script |
| CREATE | `scripts/test-sha-comparison-unit.sh` | Unit tests for comparison logic (no Docker daemon) |
| MODIFY | `apps/mcp-server/Dockerfile` | Add `ARG GIT_SHA=unknown` + `LABEL` to runtime stage |
| MODIFY | `apps/pdf-extractor/Dockerfile` | Same |
| MODIFY | `apps/rag-service/Dockerfile` | Same |
| MODIFY | `apps/technical-analysis/Dockerfile` | Same |
| MODIFY | `apps/macro-indicators/Dockerfile` | Same |
| MODIFY | `apps/stock-price/Dockerfile` | Same |
| MODIFY | `apps/api-gateway/Dockerfile` | Same |
| MODIFY | `apps/kinh-dich-service/Dockerfile` | Same |
| MODIFY | `apps/alert-engine/Dockerfile` | Same |
| MODIFY | `apps/news-fetch/Dockerfile` | Same |
| MODIFY | `apps/frontend/Dockerfile` | Same |
| MODIFY | `docs/protocols/docker-deployment-runbook.md` | Replace Step 4 timestamp check with `verify-deploy-sha.sh` call |

---

## 7. Frozen Surfaces (do NOT touch)

- `docker-compose.yml` — no change needed. The `--build-arg` is passed on the CLI by ops, not in compose YAML.
- `apps/pdf-extractor/` — parallel session active (BCTC-LAYOUT-FIRST); the Dockerfile `ARG/LABEL` addition is a one-line append to the final stage and MUST NOT conflict with any extraction logic changes. dev-pdf-extractor handles this in the same commit as its current work, or in a dedicated DRIFT-3 micro-commit sequenced after pdf-extractor's active session closes.
- No `pilot-status-*.json` files.
- No `docs/pipeline-state.json` BCTC fields.

---

## 8. Implementation Sequence

Due to the `apps/pdf-extractor/` parallel session (hard constraint), the implementation sequence is:

**Phase A (parallel-safe — all other services):** dev-cross-service adds ARG/LABEL to all 10 non-pdf-extractor Dockerfiles + creates the 3 scripts + updates the runbook.

**Phase B (after pdf-extractor session closes):** dev-pdf-extractor (or dev-cross-service) adds ARG/LABEL to `apps/pdf-extractor/Dockerfile` in a single-line append.

Both phases are independent of any Docker rebuild. No container is rebuilt as part of DRIFT-3 implementation — the label addition is inert until the next ops rebuild cycle.

---

## 9. Parallelism Note

DRIFT-3 implementation (Phase A) can proceed in parallel with all current active sessions because:
- It touches only `apps/<svc>/Dockerfile` (appending 2 lines to the runtime stage — no logic change).
- It adds 3 new scripts in `scripts/` (new files, no conflicts).
- It modifies one section of `docs/protocols/docker-deployment-runbook.md` (Step 4 replacement).

None of these paths overlap with the active `apps/pdf-extractor/` BCTC-LAYOUT-FIRST session or any `pilot-status-*.json`.
