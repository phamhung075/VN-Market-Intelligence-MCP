#!/usr/bin/env bash
# scripts/audits/rebuild-raw-verify-check.test.sh
# Smoke test for scripts/audits/rebuild-raw-verify-check.sh (FACTORY-GUARD-CI-RAWVERIFY-IMPL).
#
# ISOLATION: every scenario runs inside its own mktemp scratch repo with a
# git-init'd working tree — NEVER touches the live project repo or its .git/
# (same isolation idiom as scripts/git-hooks/pre-commit.test.sh's new_repo()).
# The real script under test is invoked via its live absolute path (bash
# doesn't care which repo it runs FROM — the base/head SHAs it diffs live in
# the scratch repo, resolved via git rev-parse --show-toplevel inside it).
#
# Covers the 4 DoD cases from
# docs/architecture-briefs/2026-07-24-factory-guard-ci-rebuild-raw-verify-hook.md:
#   1. trigger-path + field-match with NO attestation -> FAIL (reproduces the
#      e3386bdfa shape as a synthetic fixture: an apps/*/src/infrastructure/
#      file gains a `score`-named export with no RAW-verify/annotation/journal
#      attestation anywhere in the range).
#   2. same shape, but the range's commit message carries a RAW-verify token
#      -> PASS.
#   3. same shape, but the triggering line carries an inline
#      `raw-verify-allow:` annotation -> PASS.
#   4. a diff touching only non-trigger paths, or a trigger-path file with no
#      metric-field-name line -> PASSes trivially (also exercises the
#      colocated-test-file exclusion deviation documented in the script's own
#      header).
# Plus bonus coverage for the docs/agent-memory/decisions/** attestation path
# (brief §3(ii), not explicitly one of the 4 named DoD cases but part of the
# "require ONE of" mechanism) and the usage-error exit code.
#
# Usage: bash scripts/audits/rebuild-raw-verify-check.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/rebuild-raw-verify-check.sh"
[ -f "$SCRIPT" ] || { echo "FAIL: script not found at $SCRIPT"; exit 1; }

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

new_repo() {
  # Creates a fresh scratch repo with a seeded apps/<svc>/src/infrastructure/
  # file (no trigger content yet) so every case diffs against a real base SHA.
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/rawverify-check-test.XXXXXX")"
  (
    cd "$dir" || exit 1
    git init -q .
    git config user.email test@local
    git config user.name test
    mkdir -p apps/foo/src/infrastructure apps/foo/src/domain
    echo "export const x = 1;" > apps/foo/src/infrastructure/repo.ts
    echo "export const y = 1;" > apps/foo/src/domain/service.ts
    git add -A
    git commit -qm seed
  )
  printf '%s' "$dir"
}

# ---------------------------------------------------------------------------
# Case 1 (DoD): trigger-path + field-match, NO attestation -> FAIL.
# ---------------------------------------------------------------------------
D1="$(new_repo)"
BASE1="$(cd "$D1" && git rev-parse HEAD)"
(
  cd "$D1" || exit 1
  cat > apps/foo/src/infrastructure/repo.ts <<'EOF'
export const x = 1;
export function fetchScore(): number {
  return 42;
}
EOF
  git add -A
  git commit -qm "add fetchScore trigger, no attestation"
)
HEAD1="$(cd "$D1" && git rev-parse HEAD)"
OUT1="$(cd "$D1" && bash "$SCRIPT" "$BASE1" "$HEAD1" 2>&1)"
RC1=$?
if [ "$RC1" -eq 1 ] && printf '%s' "$OUT1" | grep -q "repo.ts:2" && printf '%s' "$OUT1" | grep -q "FAIL"; then
  ok "DoD-1-trigger-no-attestation-fails (rc=${RC1})"
else
  bad "DoD-1-trigger-no-attestation-fails (rc=${RC1})"
  echo "$OUT1"
fi
rm -rf "$D1"

# ---------------------------------------------------------------------------
# Case 2 (DoD): same trigger shape, commit-message RAW-verify token -> PASS.
# ---------------------------------------------------------------------------
D2="$(new_repo)"
BASE2="$(cd "$D2" && git rev-parse HEAD)"
(
  cd "$D2" || exit 1
  cat > apps/foo/src/infrastructure/repo.ts <<'EOF'
export const x = 1;
export function fetchScore(): number {
  return 42;
}
EOF
  git add -A
  git commit -qm "add fetchScore trigger — RAW-verify: hit live endpoint, confirmed"
)
HEAD2="$(cd "$D2" && git rev-parse HEAD)"
OUT2="$(cd "$D2" && bash "$SCRIPT" "$BASE2" "$HEAD2" 2>&1)"
RC2=$?
if [ "$RC2" -eq 0 ] && printf '%s' "$OUT2" | grep -q "commit-message attestation"; then
  ok "DoD-2-commit-message-attestation-passes (rc=${RC2})"
else
  bad "DoD-2-commit-message-attestation-passes (rc=${RC2})"
  echo "$OUT2"
fi
rm -rf "$D2"

# ---------------------------------------------------------------------------
# Case 3 (DoD): same trigger shape, inline raw-verify-allow: annotation -> PASS.
# ---------------------------------------------------------------------------
D3="$(new_repo)"
BASE3="$(cd "$D3" && git rev-parse HEAD)"
(
  cd "$D3" || exit 1
  cat > apps/foo/src/infrastructure/repo.ts <<'EOF'
export const x = 1;
export function fetchScore(): number { // raw-verify-allow: synthetic test fixture, not a real metric
  return 42;
}
EOF
  git add -A
  git commit -qm "add fetchScore trigger with inline annotation"
)
HEAD3="$(cd "$D3" && git rev-parse HEAD)"
OUT3="$(cd "$D3" && bash "$SCRIPT" "$BASE3" "$HEAD3" 2>&1)"
RC3=$?
if [ "$RC3" -eq 0 ] && printf '%s' "$OUT3" | grep -q "inline annotation"; then
  ok "DoD-3-inline-raw-verify-allow-annotation-passes (rc=${RC3})"
else
  bad "DoD-3-inline-raw-verify-allow-annotation-passes (rc=${RC3})"
  echo "$OUT3"
fi
rm -rf "$D3"

# ---------------------------------------------------------------------------
# Case 4a (DoD): non-trigger-path change only -> PASSes trivially.
# ---------------------------------------------------------------------------
D4A="$(new_repo)"
BASE4A="$(cd "$D4A" && git rev-parse HEAD)"
(
  cd "$D4A" || exit 1
  cat > apps/foo/src/domain/service.ts <<'EOF'
export const y = 2;
export function domainScore(): number {
  return 7;
}
EOF
  git add -A
  git commit -qm "domain-layer change (not a trigger path), no attestation needed"
)
HEAD4A="$(cd "$D4A" && git rev-parse HEAD)"
OUT4A="$(cd "$D4A" && bash "$SCRIPT" "$BASE4A" "$HEAD4A" 2>&1)"
RC4A=$?
if [ "$RC4A" -eq 0 ] && printf '%s' "$OUT4A" | grep -q "PASS — no added"; then
  ok "DoD-4a-non-trigger-path-passes-trivially (rc=${RC4A})"
else
  bad "DoD-4a-non-trigger-path-passes-trivially (rc=${RC4A})"
  echo "$OUT4A"
fi
rm -rf "$D4A"

# ---------------------------------------------------------------------------
# Case 4b (DoD): trigger-path file with NO metric-field-name line -> PASSes
# trivially (proves the trigger is field-match-gated, not path-gated alone).
# ---------------------------------------------------------------------------
D4B="$(new_repo)"
BASE4B="$(cd "$D4B" && git rev-parse HEAD)"
(
  cd "$D4B" || exit 1
  cat > apps/foo/src/infrastructure/repo.ts <<'EOF'
export const x = 1;
export function fetchTicker(): string {
  return "VCB";
}
EOF
  git add -A
  git commit -qm "trigger-path change with no metric field name"
)
HEAD4B="$(cd "$D4B" && git rev-parse HEAD)"
OUT4B="$(cd "$D4B" && bash "$SCRIPT" "$BASE4B" "$HEAD4B" 2>&1)"
RC4B=$?
if [ "$RC4B" -eq 0 ] && printf '%s' "$OUT4B" | grep -q "PASS — no added"; then
  ok "DoD-4b-trigger-path-no-field-match-passes-trivially (rc=${RC4B})"
else
  bad "DoD-4b-trigger-path-no-field-match-passes-trivially (rc=${RC4B})"
  echo "$OUT4B"
fi
rm -rf "$D4B"

# ---------------------------------------------------------------------------
# Case 4c: colocated test file under a trigger DDD layer (verify-live
# deviation documented in the script header) never counts as trigger evidence.
# ---------------------------------------------------------------------------
D4C="$(new_repo)"
BASE4C="$(cd "$D4C" && git rev-parse HEAD)"
(
  cd "$D4C" || exit 1
  mkdir -p apps/foo/src/infrastructure/__tests__
  cat > apps/foo/src/infrastructure/__tests__/repo.test.ts <<'EOF'
export function testFetchScore(): number {
  return 42;
}
EOF
  git add -A
  git commit -qm "colocated test file under infrastructure/, no attestation needed"
)
HEAD4C="$(cd "$D4C" && git rev-parse HEAD)"
OUT4C="$(cd "$D4C" && bash "$SCRIPT" "$BASE4C" "$HEAD4C" 2>&1)"
RC4C=$?
if [ "$RC4C" -eq 0 ] && printf '%s' "$OUT4C" | grep -q "PASS — no added"; then
  ok "DoD-4c-colocated-test-file-excluded-passes-trivially (rc=${RC4C})"
else
  bad "DoD-4c-colocated-test-file-excluded-passes-trivially (rc=${RC4C})"
  echo "$OUT4C"
fi
rm -rf "$D4C"

# ---------------------------------------------------------------------------
# Bonus: docs/agent-memory/decisions/** added-line attestation (brief §3(ii))
# passes even with no commit-message token and no inline annotation.
# ---------------------------------------------------------------------------
D5="$(new_repo)"
BASE5="$(cd "$D5" && git rev-parse HEAD)"
(
  cd "$D5" || exit 1
  cat > apps/foo/src/infrastructure/repo.ts <<'EOF'
export const x = 1;
export function fetchScore(): number {
  return 42;
}
EOF
  mkdir -p docs/agent-memory/decisions
  echo "REALDATA verified against the live endpoint 2026-07-30" > docs/agent-memory/decisions/sprint-test.md
  git add -A
  git commit -qm "add fetchScore trigger + decision-journal attestation (no commit-msg token)"
)
HEAD5="$(cd "$D5" && git rev-parse HEAD)"
OUT5="$(cd "$D5" && bash "$SCRIPT" "$BASE5" "$HEAD5" 2>&1)"
RC5=$?
if [ "$RC5" -eq 0 ] && printf '%s' "$OUT5" | grep -q "docs/agent-memory/decisions"; then
  ok "bonus-decisions-journal-attestation-passes (rc=${RC5})"
else
  bad "bonus-decisions-journal-attestation-passes (rc=${RC5})"
  echo "$OUT5"
fi
rm -rf "$D5"

# ---------------------------------------------------------------------------
# Bonus: missing args -> usage error, exit 2.
# ---------------------------------------------------------------------------
OUT6="$(bash "$SCRIPT" 2>&1)"
RC6=$?
if [ "$RC6" -eq 2 ] && printf '%s' "$OUT6" | grep -q "Usage:"; then
  ok "bonus-usage-error-exit-2 (rc=${RC6})"
else
  bad "bonus-usage-error-exit-2 (rc=${RC6})"
  echo "$OUT6"
fi

# ---------------------------------------------------------------------------
# Bonus: zero-SHA base/head (new-branch case) -> fail-open PASS.
# ---------------------------------------------------------------------------
D7="$(new_repo)"
HEAD7="$(cd "$D7" && git rev-parse HEAD)"
OUT7="$(cd "$D7" && bash "$SCRIPT" "0000000000000000000000000000000000000000" "$HEAD7" 2>&1)"
RC7=$?
if [ "$RC7" -eq 0 ] && printf '%s' "$OUT7" | grep -q "fail-open"; then
  ok "bonus-zero-sha-fail-open-passes (rc=${RC7})"
else
  bad "bonus-zero-sha-fail-open-passes (rc=${RC7})"
  echo "$OUT7"
fi
rm -rf "$D7"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
[ "$FAIL_COUNT" -eq 0 ] && exit 0 || exit 1
