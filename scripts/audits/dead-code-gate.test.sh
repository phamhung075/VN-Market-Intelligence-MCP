#!/usr/bin/env bash
# scripts/audits/dead-code-gate.test.sh
# Smoke test for scripts/audits/dead-code-gate.sh (FACTORY-GUARD-CI-DEADCODE-IMPL).
#
# Checks 1/2/4 in dead-code-gate.sh operate on TRACKED files only (`git
# ls-files --cached`) — so every fixture below must be `git add -f`'d
# (staged) before it will be seen, and `git reset --`'d (unstaged) + deleted
# in cleanup. Every fixture lives under a disposable, normally-untracked
# subdir (scripts/audits/__dead_code_gate_fixtures__/), scoped via
# DEAD_CODE_GATE_PATHSPEC_OVERRIDE / DEAD_CODE_GATE_APPS_OVERRIDE so each
# case only ever scans its own fixture — never the live repo tree.
#
# Covers the DoD cases from
# docs/architecture-briefs/2026-07-24-factory-guard-ci-dead-code-gate.md:
#   1. --check exits 0 on the current live repo (post-cleanup: the 2 stray
#      root artifacts, all 4 _deprecated/ trees, the 1077 test file, the
#      1081 surgical edit, and the technical-analysis package.json trim all
#      landed — technical-analysis's src/ + __tests__/ share was already
#      independently deleted by commit 099afddd3 before this task started)
#   2. a synthetic new .bak file fails --check
#   3. a synthetic new _deprecated/ dir fails --check
#   4. a synthetic twin-scaffold (cmd/server + package.json + src/, Dockerfile
#      with zero src reference) fails --check
#   4b. bonus negative control — same twin-scaffold but with a Dockerfile
#       that DOES reference src/ (mirrors the real apps/news-fetch shape)
#       passes --check, proving the exemption is deliberate, not a script bug
#   5. a synthetic //go:build ignore file fails --check
#
# Usage: bash scripts/audits/dead-code-gate.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/dead-code-gate.sh"
FIXTURE_DIR="$PROJECT_ROOT/scripts/audits/__dead_code_gate_fixtures__"

# shellcheck disable=SC2329 # invoked indirectly via `trap ... EXIT` below
cleanup() {
  git reset -- "$FIXTURE_DIR" >/dev/null 2>&1 || true
  rm -rf "$FIXTURE_DIR"
}
trap cleanup EXIT

rm -rf "$FIXTURE_DIR"
mkdir -p "$FIXTURE_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ---------------------------------------------------------------------------
# DoD-1: --check exits 0 on the current live repo (post-cleanup state).
# No override — exercises the real script against the real repo tree.
# ---------------------------------------------------------------------------
bash "$SCRIPT" --check > /tmp/dead-code-gate-test-dod1.txt 2>&1
RC1=$?
if [ "$RC1" -eq 0 ]; then
  ok "DoD-1-live-repo-check-passes-post-cleanup-zero-offenders (rc=0)"
else
  bad "DoD-1-live-repo-check-passes-post-cleanup-zero-offenders (rc=${RC1}, expected 0)"
  cat /tmp/dead-code-gate-test-dod1.txt
fi

# ---------------------------------------------------------------------------
# DoD-2: synthetic new .bak file (tracked) fails --check.
# ---------------------------------------------------------------------------
F2="$FIXTURE_DIR/tc2_new.bak"
echo "stale backup content" > "$F2"
git add -f "$F2" >/dev/null 2>&1
REL2="scripts/audits/__dead_code_gate_fixtures__"
DEAD_CODE_GATE_PATHSPEC_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/dead-code-gate-test-dod2.txt 2>&1
RC2=$?
if [ "$RC2" -eq 1 ] && grep -q "tc2_new.bak" /tmp/dead-code-gate-test-dod2.txt; then
  ok "DoD-2-synthetic-new-tracked-bak-file-fails-check (rc=${RC2})"
else
  bad "DoD-2-synthetic-new-tracked-bak-file-fails-check (rc=${RC2})"
  cat /tmp/dead-code-gate-test-dod2.txt
fi
git reset -- "$F2" >/dev/null 2>&1
rm -f "$F2"

# ---------------------------------------------------------------------------
# Bonus: same .bak fixture UNTRACKED (not git add -f'd) passes — proves the
# check is genuinely "tracked-file", not "any file present on disk".
# ---------------------------------------------------------------------------
F2U="$FIXTURE_DIR/tc2u_untracked.bak"
echo "untracked backup, never staged" > "$F2U"
DEAD_CODE_GATE_PATHSPEC_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/dead-code-gate-test-dod2u.txt 2>&1
RC2U=$?
if [ "$RC2U" -eq 0 ]; then
  ok "bonus-untracked-bak-file-not-flagged-tracked-only-semantics (rc=${RC2U})"
else
  bad "bonus-untracked-bak-file-not-flagged-tracked-only-semantics (rc=${RC2U})"
  cat /tmp/dead-code-gate-test-dod2u.txt
fi
rm -f "$F2U"

# ---------------------------------------------------------------------------
# DoD-3: synthetic new _deprecated/ dir (tracked) fails --check.
# ---------------------------------------------------------------------------
mkdir -p "$FIXTURE_DIR/_deprecated"
F3="$FIXTURE_DIR/_deprecated/stale.ts"
echo "export const stale = 1;" > "$F3"
git add -f "$F3" >/dev/null 2>&1
DEAD_CODE_GATE_PATHSPEC_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/dead-code-gate-test-dod3.txt 2>&1
RC3=$?
if [ "$RC3" -eq 1 ] && grep -q "_deprecated/stale.ts" /tmp/dead-code-gate-test-dod3.txt; then
  ok "DoD-3-synthetic-new-tracked-deprecated-dir-fails-check (rc=${RC3})"
else
  bad "DoD-3-synthetic-new-tracked-deprecated-dir-fails-check (rc=${RC3})"
  cat /tmp/dead-code-gate-test-dod3.txt
fi
git reset -- "$F3" >/dev/null 2>&1
rm -rf "$FIXTURE_DIR/_deprecated"

# ---------------------------------------------------------------------------
# DoD-4: synthetic Go/TS twin scaffold (cmd/server + package.json + src/,
# Dockerfile with ZERO src reference — the confirmed-dead technical-analysis
# shape) fails --check.
# ---------------------------------------------------------------------------
SVC4="$FIXTURE_DIR/faux-dead-svc"
mkdir -p "$SVC4/cmd/server" "$SVC4/src"
echo "package main" > "$SVC4/cmd/server/main.go"
echo '{"name":"faux"}' > "$SVC4/package.json"
echo "export const x = 1;" > "$SVC4/src/index.ts"
cat > "$SVC4/Dockerfile" <<'EOF'
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY cmd/ cmd/
RUN go build -o /out/server ./cmd/server/
FROM alpine:3.20
COPY --from=builder /out/server /app/server
ENTRYPOINT ["/app/server"]
EOF
git add -f "$SVC4" >/dev/null 2>&1
DEAD_CODE_GATE_APPS_OVERRIDE="$SVC4" bash "$SCRIPT" --check > /tmp/dead-code-gate-test-dod4.txt 2>&1
RC4=$?
if [ "$RC4" -eq 1 ] && grep -q "faux-dead-svc" /tmp/dead-code-gate-test-dod4.txt; then
  ok "DoD-4-synthetic-twin-scaffold-dockerfile-src-blind-fails-check (rc=${RC4})"
else
  bad "DoD-4-synthetic-twin-scaffold-dockerfile-src-blind-fails-check (rc=${RC4})"
  cat /tmp/dead-code-gate-test-dod4.txt
fi

# ---------------------------------------------------------------------------
# DoD-4b (bonus, negative control): identical twin shape, but the Dockerfile
# DOES reference src/ (mirrors the real, live apps/news-fetch shape) — must
# PASS. Proves the check-3 exemption is deliberate (Dockerfile-content
# signal), not an accidental blanket pass.
# ---------------------------------------------------------------------------
SVC4B="$FIXTURE_DIR/faux-live-dualstack-svc"
mkdir -p "$SVC4B/cmd/server" "$SVC4B/src"
echo "package main" > "$SVC4B/cmd/server/main.go"
echo '{"name":"faux-live"}' > "$SVC4B/package.json"
echo "export const x = 1;" > "$SVC4B/src/index.ts"
cat > "$SVC4B/Dockerfile" <<'EOF'
FROM oven/bun:1.3.13-alpine AS bun-builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
COPY --from=bun-builder /app/src ./src
CMD ["bun", "run", "src/index.ts"]
EOF
git add -f "$SVC4B" >/dev/null 2>&1
DEAD_CODE_GATE_APPS_OVERRIDE="$SVC4B" bash "$SCRIPT" --check > /tmp/dead-code-gate-test-dod4b.txt 2>&1
RC4B=$?
if [ "$RC4B" -eq 0 ]; then
  ok "bonus-DoD-4b-live-dualstack-dockerfile-references-src-passes-check (rc=${RC4B})"
else
  bad "bonus-DoD-4b-live-dualstack-dockerfile-references-src-passes-check (rc=${RC4B})"
  cat /tmp/dead-code-gate-test-dod4b.txt
fi
git reset -- "$SVC4" "$SVC4B" >/dev/null 2>&1
rm -rf "$SVC4" "$SVC4B"

# ---------------------------------------------------------------------------
# DoD-5: synthetic //go:build ignore file (tracked) fails --check.
# ---------------------------------------------------------------------------
F5="$FIXTURE_DIR/tc5_archived.go"
cat > "$F5" <<'EOF'
// DEPRECATED — archive only.
//
//go:build ignore

package archived
EOF
git add -f "$F5" >/dev/null 2>&1
DEAD_CODE_GATE_PATHSPEC_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/dead-code-gate-test-dod5.txt 2>&1
RC5=$?
if [ "$RC5" -eq 1 ] && grep -q "tc5_archived.go" /tmp/dead-code-gate-test-dod5.txt; then
  ok "DoD-5-synthetic-tracked-go-build-ignore-fails-check (rc=${RC5})"
else
  bad "DoD-5-synthetic-tracked-go-build-ignore-fails-check (rc=${RC5})"
  cat /tmp/dead-code-gate-test-dod5.txt
fi
git reset -- "$F5" >/dev/null 2>&1
rm -f "$F5"

# ---------------------------------------------------------------------------
# Bonus: a live .go file with no build-ignore directive passes.
# ---------------------------------------------------------------------------
F6="$FIXTURE_DIR/tc6_live.go"
cat > "$F6" <<'EOF'
package live

func Live() int { return 1 }
EOF
git add -f "$F6" >/dev/null 2>&1
DEAD_CODE_GATE_PATHSPEC_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/dead-code-gate-test-dod6.txt 2>&1
RC6=$?
if [ "$RC6" -eq 0 ]; then
  ok "bonus-live-go-file-no-build-ignore-passes-check (rc=${RC6})"
else
  bad "bonus-live-go-file-no-build-ignore-passes-check (rc=${RC6})"
  cat /tmp/dead-code-gate-test-dod6.txt
fi
git reset -- "$F6" >/dev/null 2>&1
rm -f "$F6"

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
