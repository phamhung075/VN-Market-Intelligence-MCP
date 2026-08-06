#!/usr/bin/env bash
# scripts/agents-flow/branch-hygiene-stop.test.sh
#
# UC-CRITIC-HOOKS-ENFORCEMENT — first test coverage for branch-hygiene-stop.sh
# (previously zero coverage, per architect NFR-5 Test Strategy; this hook now
# receives an FR-1/FR-2 behavior change — untested + changing is the highest-
# risk combination named by the spec).
#
# branch-hygiene-stop.sh resolves its own repo root via
# `cd "$(dirname "$0")/../.."` (its OWN on-disk location), not
# `git rev-parse --show-toplevel` like the other 3 hooks — so isolating this
# test from the real project tree requires copying the script (+ its
# lib/hook-guard.sh dependency) into a throwaway fixture repo at the SAME
# relative path (scripts/agents-flow/), rather than pointing PROJECT_ROOT at
# a fixture via env override.
#
# Coverage:
#   T1  clean repo, on main, clean tree, no worktrees      → exit 0, no WARNING block
#   T2  repo on a non-main branch                           → exit 0, WARNING cites the branch name
#   T3  dirty working tree (untracked file)                 → exit 0, WARNING cites uncommitted changes
#   T4  CRASH: git binary missing (PATH override)            → exit 1 (OPPOSITE polarity from the other
#       3 load-bearing hooks — a git crash here used to fall through as "" / true, reading as
#       CLEAN; this fix's `hg_run`-wrapped git calls now flip to the FAIL branch AND exit 1)
#
# Run:
#   bash scripts/agents-flow/branch-hygiene-stop.test.sh
#
# Exit 0 = all pass. Exit 1 = ≥1 failure.
# Owning task: UC-CRITIC-HOOKS-ENFORCEMENT (FR-1/FR-2)
set -uo pipefail

REAL_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REAL_HOOK_SH="$REAL_SCRIPT_DIR/branch-hygiene-stop.sh"
REAL_HOOK_GUARD_SH="$REAL_SCRIPT_DIR/lib/hook-guard.sh"

if [ ! -f "$REAL_HOOK_SH" ]; then
  echo "ERROR: hook script not found at $REAL_HOOK_SH" >&2
  exit 1
fi
if [ ! -f "$REAL_HOOK_GUARD_SH" ]; then
  echo "ERROR: hook-guard.sh not found at $REAL_HOOK_GUARD_SH" >&2
  exit 1
fi

# ── Isolated fixture repo ────────────────────────────────────────────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/branch-hygiene-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

mkdir -p "$TMPDIR_TEST/scripts/agents-flow/lib"
cp "$REAL_HOOK_SH" "$TMPDIR_TEST/scripts/agents-flow/branch-hygiene-stop.sh"
cp "$REAL_HOOK_GUARD_SH" "$TMPDIR_TEST/scripts/agents-flow/lib/hook-guard.sh"
FIXTURE_HOOK_SH="$TMPDIR_TEST/scripts/agents-flow/branch-hygiene-stop.sh"

(
  cd "$TMPDIR_TEST" || exit 1
  git init -q -b main . 2>/dev/null || { git init -q .; git checkout -q -b main 2>/dev/null || true; }
  git config user.email "test@example.com"
  git config user.name "test"
  echo "seed" > seed.txt
  git add seed.txt scripts/
  git commit -q -m "seed"
)

PASS=0
FAIL=0

# ── T1: clean repo, on main, clean tree, no worktrees → exit 0, no WARNING ──
OUT1=$(cd "$TMPDIR_TEST" && bash "$FIXTURE_HOOK_SH" 2>&1)
EXIT1=$?
if [ "$EXIT1" -eq 0 ] && ! printf '%s' "$OUT1" | grep -q "BRANCH HYGIENE WARNING"; then
  echo "PASS T1: clean repo on main → exit 0, no WARNING block"
  PASS=$((PASS + 1))
else
  echo "FAIL T1: exit=$EXIT1 output='$OUT1' (expected exit 0, no WARNING)"
  FAIL=$((FAIL + 1))
fi

# ── T2: non-main branch → exit 0, WARNING cites the branch name ─────────────
(cd "$TMPDIR_TEST" && git checkout -q -b task/feature-branch)
OUT2=$(cd "$TMPDIR_TEST" && bash "$FIXTURE_HOOK_SH" 2>&1)
EXIT2=$?
if [ "$EXIT2" -eq 0 ] && printf '%s' "$OUT2" | grep -q "HEAD is on 'task/feature-branch'"; then
  echo "PASS T2: non-main branch → exit 0, WARNING cites branch name"
  PASS=$((PASS + 1))
else
  echo "FAIL T2: exit=$EXIT2 output='$OUT2' (expected exit 0, WARNING citing task/feature-branch)"
  FAIL=$((FAIL + 1))
fi
(cd "$TMPDIR_TEST" && git checkout -q main && git branch -q -D task/feature-branch)

# ── T3: dirty tree (untracked file) → exit 0, WARNING cites uncommitted changes ──
echo "dirty" > "$TMPDIR_TEST/untracked.txt"
OUT3=$(cd "$TMPDIR_TEST" && bash "$FIXTURE_HOOK_SH" 2>&1)
EXIT3=$?
if [ "$EXIT3" -eq 0 ] && printf '%s' "$OUT3" | grep -q "uncommitted changes"; then
  echo "PASS T3: dirty tree → exit 0, WARNING cites uncommitted changes"
  PASS=$((PASS + 1))
else
  echo "FAIL T3: exit=$EXIT3 output='$OUT3' (expected exit 0, WARNING citing uncommitted changes)"
  FAIL=$((FAIL + 1))
fi
rm -f "$TMPDIR_TEST/untracked.txt"

# ── T4 (UC-CRITIC-HOOKS-ENFORCEMENT FR-2): git binary missing → exit 1 ──────
# OPPOSITE polarity from the other 3 hooks: before this fix, a git crash here
# fell through as "" / true, which reads as CLEAN (the worst instance — a
# crash silently indistinguishable from "nothing wrong"). Build a PATH with
# every binary the hook needs EXCEPT git.
NO_GIT_BIN=$(mktemp -d /private/tmp/branch-hygiene-no-git-XXXXXX)
for b in bash grep echo printf dirname pwd; do
  p=$(command -v "$b" 2>/dev/null || true)
  [ -n "$p" ] && ln -sf "$p" "$NO_GIT_BIN/$b"
done

OUT4=$(cd "$TMPDIR_TEST" && PATH="$NO_GIT_BIN" bash "$FIXTURE_HOOK_SH" 2>&1)
EXIT4=$?
rm -rf "$NO_GIT_BIN"

if [ "$EXIT4" -eq 1 ] && printf '%s' "$OUT4" | grep -q "PREREQUISITE-FAILURE" \
   && printf '%s' "$OUT4" | grep -q "itself crashed"; then
  echo "PASS T4: git binary missing → exit 1 (prerequisite crash surfaced, not read as clean)"
  PASS=$((PASS + 1))
else
  echo "FAIL T4: exit=$EXIT4 output='$OUT4' (expected exit 1, PREREQUISITE-FAILURE + 'itself crashed')"
  FAIL=$((FAIL + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
