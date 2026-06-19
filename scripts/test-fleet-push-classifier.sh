#!/usr/bin/env bash
# test-fleet-push-classifier.sh — hermetic gate for fleet-worktree-push.sh
#
# PURPOSE: Prove the auto-push backstop's behind-set classifier PROCEEDS under
#   the EXACT production state and ABORTS only on real behind-set code.
#
#   THIS TEST WAS REWRITTEN (FIX-AUTO-PUSH-TWODOT-FALSE-ABORT). The PRIOR version
#   fed a *literal file list* into the BENIGN_RE filter and never ran `git diff`
#   at all. It therefore could NOT see the two-dot vs three-dot bug: the diff
#   RANGE was never under test, only the regex. It false-passed 5/5 while the
#   shipped script false-aborted every cycle.
#
#   The load-bearing production state — which the old test never set up — is:
#     LOCAL has AHEAD COMMITS touching code (unpushed *.ts fixes)  AND
#     origin's BEHIND-set is PURE CHORE (docs/notebook/health).
#   With TWO-dot (HEAD..origin/main) the classifier ALSO surfaces local's ahead
#   code edits and FALSE-ABORTS. With THREE-dot (HEAD...origin/main) it sees only
#   the behind-set's own changes -> 0 code -> PROCEED.
#
#   So this test now builds REAL throwaway git repos and runs BOTH diff ranges
#   through the shipped BENIGN_RE, asserting:
#     - the shipped script uses THREE-dot (grep proof), and
#     - in the production state: two-dot=CODE-SEEN (would abort, the bug),
#                                three-dot=0 (proceeds, the fix).
#
# USAGE: bash scripts/test-fleet-push-classifier.sh
#        exit 0 = all cases pass; exit 1 = a case failed (gate is RED).
#
# OWNING TASK: FIX-AUTO-PUSH-TWODOT-FALSE-ABORT (verification_gate)
# OWNING FLOW: docs/agents/po/flow/main.md § Step PUSH-BACKSTOP
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHIPPED="$REPO_ROOT/scripts/fleet-worktree-push.sh"

# ── Extract the shipped BENIGN_RE so the test NEVER drifts from the script ─────
BENIGN_RE="$(grep -E "^\s*BENIGN_RE='" "$SHIPPED" \
  | head -1 | sed -E "s/^[^']*'//; s/'.*$//")"
if [ -z "$BENIGN_RE" ]; then
  echo "[test] FAIL: could not extract BENIGN_RE from fleet-worktree-push.sh" >&2
  exit 1
fi
echo "[test] BENIGN_RE (from shipped script) = $BENIGN_RE"

PASS=0
FAIL=0
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "[test] PASS: $name (got=$got)"
    PASS=$((PASS + 1))
  else
    echo "[test] FAIL: $name — got=$got want=$want" >&2
    FAIL=$((FAIL + 1))
  fi
}

# classify_range <repo> <range> -> count of behind-set code/config files.
# Mirrors the shipped pipeline EXACTLY but takes the diff range as a parameter so
# we can prove two-dot vs three-dot differ on the same repo.
classify_range() {
  local repo="$1" range="$2" n
  n=$(git -C "$repo" diff --name-only "$range" 2>/dev/null \
    | grep -Ev "$BENIGN_RE" | grep -c '.' || true)
  echo "${n:-0}"
}

# ── STATIC PROOF: the shipped script uses THREE-dot for BOTH classifier diffs ──
# (the count-only `behind=` rev-list two-dot on ~line 121 is correct and excluded
#  because it is `rev-list`, not `diff --name-only`).
twodot_diff=$(grep -c 'git diff --name-only HEAD\.\.origin/main' "$SHIPPED" || true)
threedot_diff=$(grep -c 'git diff --name-only HEAD\.\.\.origin/main' "$SHIPPED" || true)
check "shipped script has ZERO two-dot 'git diff --name-only HEAD..origin/main'" "$twodot_diff" "0"
check "shipped script has TWO three-dot 'git diff --name-only HEAD...origin/main'" "$threedot_diff" "2"

# ── BUILD A REAL THROWAWAY REPO replicating the production divergence state ────
TMP="$(mktemp -d -t fleet-push-classifier-XXXXXX)"
# shellcheck disable=SC2329  # invoked via `trap cleanup EXIT INT TERM` below
cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

ORIGIN="$TMP/origin.git"
LOCAL="$TMP/local"

git init -q --bare -b main "$ORIGIN"

seed() {
  local f="$1" body="$2"
  mkdir -p "$LOCAL/$(dirname "$f")"
  printf '%s\n' "$body" > "$LOCAL/$f"
  git -C "$LOCAL" add "$f"
}

# --- merge-base: a shared baseline both sides build on (seed origin first) ---
git init -q -b main "$LOCAL"
git -C "$LOCAL" config user.email test@test && git -C "$LOCAL" config user.name test
git -C "$LOCAL" remote add origin "$ORIGIN"
seed "apps/mcp-server/src/application/usecases/ohlcvWriteService.ts" "base"
seed "docs/agent-memory/notebooks/po.md" "base"
git -C "$LOCAL" commit -q -m "base: shared merge-base"
git -C "$LOCAL" push -q origin main
git -C "$LOCAL" branch -q --set-upstream-to=origin/main main 2>/dev/null || true

# --- ORIGIN advances with a PURE-CHORE behind-set (health/notebook/orch) ---
#     done via a second clone so origin moves ahead of LOCAL.
OTHER="$TMP/other"
git clone -q -b main "$ORIGIN" "$OTHER"
git -C "$OTHER" config user.email b@b && git -C "$OTHER" config user.name b
mkdir -p "$OTHER/docs/agent-memory/health" "$OTHER/docs/data/orch"
printf 'recheck\n' > "$OTHER/docs/agent-memory/health/team-tool-recheck-2026-06-19-0207.md"
printf '{"x":1}\n'  > "$OTHER/docs/data/orch/orch-state.json"
git -C "$OTHER" add -A && git -C "$OTHER" commit -q -m "chore(health): team MCP tool recheck"
git -C "$OTHER" push -q origin main

# --- LOCAL advances with AHEAD COMMITS that TOUCH CODE (the production state) ---
#     These are the unpushed *.ts fixes the fleet perpetually carries.
git -C "$LOCAL" fetch -q origin main
seed "apps/mcp-server/src/application/usecases/ohlcvWriteService.ts" "local-ahead-fix"
seed "apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts"  "local-ahead-new"
seed "apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts" "local-ahead-fix2"
seed "launchd/com.vn-market.fleet-push.plist" "<plist/>"
git -C "$LOCAL" commit -q -m "fix(mcp-server): local-ahead code edits (unpushed)"

# Now LOCAL is AHEAD (1 code commit) and BEHIND (1 pure-chore commit).
ahead=$(git -C "$LOCAL" rev-list --count origin/main..HEAD)
behind=$(git -C "$LOCAL" rev-list --count HEAD..origin/main)
check "fixture is AHEAD>0 (local code commit unpushed)" "$([ "$ahead" -gt 0 ] && echo ok || echo no)" "ok"
check "fixture is BEHIND>0 (origin chore commit)"        "$([ "$behind" -gt 0 ] && echo ok || echo no)" "ok"

# ── THE CORE ASSERTION ────────────────────────────────────────────────────────
# Production state: local-ahead code + pure-chore behind-set.
two=$(classify_range "$LOCAL" "HEAD..origin/main")    # BUGGY range
three=$(classify_range "$LOCAL" "HEAD...origin/main")  # CORRECT range

# Two-dot MUST surface the local-ahead code (proving it WOULD false-abort).
check "TWO-dot false-counts local-ahead code (the bug: would ABORT)" \
  "$([ "$two" -gt 0 ] && echo abort || echo proceed)" "abort"
# Three-dot MUST see ONLY the pure-chore behind-set -> 0 -> proceed.
check "THREE-dot sees behind-set only (the fix: PROCEEDS)" "$three" "0"

# ── REGRESSION: three-dot MUST still ABORT when the BEHIND-set has real code ───
# Add a code file to ORIGIN's behind-set; three-dot must now report it.
git -C "$OTHER" fetch -q origin main && git -C "$OTHER" reset -q --hard origin/main
mkdir -p "$OTHER/apps/mcp-server/src/alerts"
printf 'real behind code\n' > "$OTHER/apps/mcp-server/src/alerts/storeAlerts.ts"
git -C "$OTHER" add -A && git -C "$OTHER" commit -q -m "chore: msg-prefix-benign BUT touches code"
git -C "$OTHER" push -q origin main
git -C "$LOCAL" fetch -q origin main
three_codebehind=$(classify_range "$LOCAL" "HEAD...origin/main")
check "THREE-dot ABORTS when behind-set itself touches code (regression)" \
  "$([ "$three_codebehind" -gt 0 ] && echo abort || echo proceed)" "abort"

# ── BOUNDED tsc-gate watchdog (FIX-AUTO-PUSH-TSC-GATE-HANG, 2026-06-19) ────────
# The pre-push tsc gate (`bun tsc --noEmit`) hung forever in the worktree (alive
# ~2h, 0.02s CPU) because it resolved deps through a node_modules SYMLINK and
# blocked. launchd uses StartInterval (no per-run kill) so a hung run starves
# every future push. The fix wraps the gate in `run_bounded <secs> <cmd>` (a
# perl process-group watchdog — macOS has no gtimeout/timeout). Lock the THREE
# return-code semantics + the no-orphan invariant against regression by sourcing
# the SHIPPED helper (never a copy — must not drift).
echo "[test] -------- run_bounded watchdog cases --------"
# Extract run_bounded() from the shipped script into a sourceable file.
RB="$TMP/_run_bounded.sh"
sed -n '/^run_bounded() {/,/^}/p' "$SHIPPED" > "$RB"
if ! grep -q '^run_bounded()' "$RB"; then
  echo "[test] FAIL: could not extract run_bounded() from fleet-worktree-push.sh" >&2
  FAIL=$((FAIL + 1))
else
  # shellcheck disable=SC1090  # dynamic path, extracted from the shipped script
  source "$RB"

  set +e
  run_bounded 5 true;  rc_ok=$?
  run_bounded 5 false; rc_red=$?
  rb_start=$(date +%s)
  run_bounded 1 sleep 10; rc_hang=$?
  rb_elapsed=$(( $(date +%s) - rb_start ))
  set -e

  check "run_bounded: fast success -> rc 0"            "$rc_ok"   "0"
  check "run_bounded: fast non-zero (red) -> rc 1"     "$rc_red"  "1"
  check "run_bounded: HUNG cmd bounded-out -> rc 124"  "$rc_hang" "124"
  # The 1s-cap hang must die fast (cap + TERM->KILL grace), never run the full 10s.
  check "run_bounded: hung cmd killed promptly (<8s, not full 10s)" \
    "$([ "$rb_elapsed" -lt 8 ] && echo fast || echo slow)" "fast"
  # No orphan: the process-group kill must leave no 'sleep 10' survivor.
  sleep 1
  orphans=$(pgrep -f 'sleep 10' | grep -c '.' || true)
  check "run_bounded: hung cmd leaves NO orphan (process-group killed)" "${orphans:-0}" "0"
fi

echo "[test] -------- $PASS passed, $FAIL failed --------"
[ "$FAIL" -eq 0 ] || exit 1
echo "[test] ALL CASES PASS — classifier proceeds on local-ahead+chore-behind (three-dot), aborts on real behind-code; bounded tsc-gate kills hangs (rc124) without orphans."
exit 0
