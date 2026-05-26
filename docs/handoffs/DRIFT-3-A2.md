# DRIFT-3-A2 — Create CI/CD SHA Verification Scripts

**Task ID:** DRIFT-3-A2
**Phase:** Phase A (parallel-safe)
**Brief:** `docs/architecture-briefs/2026-05-26-ci-cd-image-sha-drift-guard.md`
**Owner:** dev-cross-service (scripting)
**Zone:** `cross-service/` (scripts/)

---

## Scope

Create 3 new scripts that implement the SHA drift guard mechanism:

1. **`scripts/verify-deploy-sha.sh`** — Main SHA verification script (ops toolchain)
2. **`scripts/test-sha-drift-guard.sh`** — Deliberate-stale-image proof script
3. **`scripts/test-sha-comparison-unit.sh`** — Unit tests for comparison logic (no Docker daemon)

All 3 scripts follow the pattern of `scripts/preflight-disk.sh`: `set -euo pipefail`, exit codes (0=OK, 1=failure), and `OK/ERROR` stdout format.

---

## Acceptance Criteria

- AC-1: `scripts/verify-deploy-sha.sh <service>` exits 0 when deployed SHA matches HEAD
- AC-2: `scripts/verify-deploy-sha.sh <service>` exits 1 when deployed SHA mismatches HEAD
- AC-3: `scripts/test-sha-drift-guard.sh` exits 0 (proof passed) — guard correctly FAILS on stale image
- AC-4: `scripts/test-sha-comparison-unit.sh` exits 0 — all 3 unit tests pass (match/mismatch/empty label)
- AC-5: All 3 scripts are executable (`chmod +x`) and have `#!/usr/bin/env bash` shebang
- AC-6: Zero Docker daemon required to run unit tests (test-sha-comparison-unit.sh can run in CI)

---

## Script Specs (per brief §3–§4)

### `scripts/verify-deploy-sha.sh`

```bash
#!/usr/bin/env bash
# Verify deployed container image SHA matches latest commit.
# Usage: scripts/verify-deploy-sha.sh <service> [expected_sha]
# Exit 0: SHA matches. Exit 1: mismatch or label absent.
set -euo pipefail

SERVICE="${1:-}"
EXPECTED_SHA="${2:-$(git rev-parse HEAD)}"

if [ -z "$SERVICE" ]; then
  echo "ERROR: service name required" >&2
  exit 1
fi

CONTAINER_ID=$(docker compose ps -q "$SERVICE" | head -1)
if [ -z "$CONTAINER_ID" ]; then
  echo "ERROR: container not found for service=$SERVICE" >&2
  exit 1
fi

DEPLOYED_SHA=$(docker inspect --format '{{ index .Config.Labels "vn.market.git_sha" }}' "$CONTAINER_ID")

# Call the exportable comparison function (sourced from this file)
compare_shas "$DEPLOYED_SHA" "$EXPECTED_SHA"
```

Also export a `compare_shas()` function that can be sourced and unit-tested:

```bash
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

### `scripts/test-sha-drift-guard.sh`

Per brief §3.1–3.2: Deliberately build a minimal Alpine image with a known-stale SHA label (`0000000...`), run it as a container, invoke `verify-deploy-sha.sh` against it, and assert the script exits 1 with "SHA drift detected". The proof itself exits 0 only when the guard correctly FAILS on the stale image.

```bash
#!/usr/bin/env bash
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

# Start it (this would require docker socket; unit test must mock this)
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

### `scripts/test-sha-comparison-unit.sh`

Unit tests for the `compare_shas()` function (no Docker daemon). Source verify-deploy-sha.sh to access the function.

```bash
#!/usr/bin/env bash
# Unit tests for SHA comparison logic (no Docker daemon required).
set -euo pipefail

# Source the compare_shas function from verify-deploy-sha.sh
source scripts/verify-deploy-sha.sh

PASS=0
FAIL=0

# Test 1: SHA match (should return 0)
if compare_shas "abc123" "abc123" >/dev/null 2>&1; then
  echo "✓ Test 1: match passes"
  ((PASS++))
else
  echo "✗ Test 1: match should pass"
  ((FAIL++))
fi

# Test 2: SHA mismatch (should return 1)
if ! compare_shas "abc123" "def456" >/dev/null 2>&1; then
  echo "✓ Test 2: mismatch fails"
  ((PASS++))
else
  echo "✗ Test 2: mismatch should fail"
  ((FAIL++))
fi

# Test 3: Empty label (should return 1)
if ! compare_shas "" "abc123" >/dev/null 2>&1; then
  echo "✓ Test 3: empty label fails"
  ((PASS++))
else
  echo "✗ Test 3: empty label should fail"
  ((FAIL++))
fi

echo ""
echo "Results: $PASS pass, $FAIL fail"
[ $FAIL -eq 0 ] && exit 0 || exit 1
```

---

## Files to Create

| Path | Owner | Description |
|------|-------|-------------|
| `scripts/verify-deploy-sha.sh` | dev-cross-service | Main verification gate |
| `scripts/test-sha-drift-guard.sh` | dev-cross-service | Deliberate-stale-image proof |
| `scripts/test-sha-comparison-unit.sh` | dev-cross-service | Unit tests (CI-friendly, no Docker) |

---

## Dispatch

Single-zone task (cross-service). Can be parallelized with DRIFT-3-A1 and DRIFT-3-A3 (all Phase A). No Docker rebuild needed — source-only changes.

---

## Binding Day-0 Notes

- Explicit-file staging only: `git add scripts/verify-deploy-sha.sh` + similar per script
- No `--force`, `--no-verify`, `--no-gpg-sign`
- NO `git push` (main terminal owns the final commit)
- Stay on main branch
- Do NOT touch `apps/pdf-extractor/`, any `LF-*` task, any `pilot-status-*.json`, or `docs/pipeline-state.json` BCTC fields

---

## [Developer] Implementation Record

- **Files created:**
  - `scripts/verify-deploy-sha.sh:68` — main deploy gate; exports `compare_shas()` function; BASH_SOURCE guard prevents main block from running when sourced
  - `scripts/test-sha-comparison-unit.sh:75` — pure-logic unit tests (no Docker); covers match/stale/empty-label
  - `scripts/test-sha-drift-guard.sh:77` — end-to-end stale-image proof (Docker, ops-deferred); sources `compare_shas()` from verify script
- **Tests written:** `scripts/test-sha-comparison-unit.sh` — 3 assertions, all GREEN
- **Key test output (deliberate-stale anti-false-green proof):**
  ```
  PASS Test 1: matching SHAs — exit 0
  PASS Test 2: stale SHA (deliberate drift) — exit non-zero (guard correctly rejects)
  PASS Test 3: empty label — exit non-zero (guard correctly rejects)
  Results: 3 pass, 0 fail
  OK: all SHA comparison unit tests passed.
  ```
- **bash -n syntax:** all 3 scripts PASS
- **shellcheck:** not available on host (not installed); syntax-check via bash -n substituted
- **compare_shas() signature:** `compare_shas <deployed_sha> <expected_sha>` — returns 0 on match, 1 on drift or empty label; exported with `export -f compare_shas`; sourceable by A3 runbook examples and A1 reviewers
- **Dockerfile edits:** ZERO (DRIFT-3-A1 owns Dockerfiles)
- **Runbook edits:** ZERO (DRIFT-3-A3 owns runbook)
- **pdf-extractor/LF-*/pipeline-state touches:** ZERO
- **Docker run/build during implementation:** ZERO (unit tests are Docker-free)
- **Docs updated:** `docs/handoffs/DRIFT-3-A2.md` — this record appended
- **Graphify:** skipped (no docs/policies/standards knowledge files impacted — scripts-only task)
