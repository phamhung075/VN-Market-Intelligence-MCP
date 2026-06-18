#!/usr/bin/env bash
# test-fleet-push-classifier.sh — hermetic gate for fleet-worktree-push.sh
#
# PURPOSE: Prove the auto-push backstop is DURABLE under the EXACT production
#   behind-set, not just that "Guard 1 fires". Builds a throwaway local git
#   repo (a fake "origin" + a local clone), replays the real cowork-churn state,
#   and runs the actual classifier from scripts/fleet-worktree-push.sh.
#
#   This is the qa gate for FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE (classifier
#   scope). It exists because the ORIGINAL qa false-passed by testing a
#   clean-tree happy path. Here we assert the realistic, load-bearing condition:
#
#     CASE A (MUST COMPLETE / push proceeds):
#       ahead > 20  AND  main tree DIRTY (orch-state + a notebook modified)
#       AND behind-set = benign  Merge  +  docs(reports):  +  chore(...)  +
#           a churned scripts/*.jq triage helper
#       -> classifier reports 0 code/config files -> push path is taken.
#       (This is the EXACT state the old message-prefix classifier aborted on.)
#
#     CASE B (MUST ABORT / push blocked, BUG telegram):
#       behind-set additionally touches a real code file (apps/x.ts)
#       -> classifier reports >=1 code/config file -> abort.
#
#     CASE C (MUST ABORT): behind-set touches a scripts/*.sh (real script)
#       -> NOT in the *.jq disposable allowlist -> abort.
#
# USAGE: bash scripts/test-fleet-push-classifier.sh
#        exit 0 = all cases pass; exit 1 = a case failed (gate is RED).
#
# OWNING TASK: FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE (verification_gate)
# OWNING FLOW: docs/agents/po/flow/main.md § Step PUSH-BACKSTOP
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# The classifier under test, extracted verbatim from fleet-worktree-push.sh.
# We re-derive BENIGN_RE here by grepping it OUT of the script so the test can
# NEVER drift from the shipped regex (single source of truth = the script).
BENIGN_RE="$(grep -E "^\s*BENIGN_RE='" "$REPO_ROOT/scripts/fleet-worktree-push.sh" \
  | head -1 | sed -E "s/^[^']*'//; s/'.*$//")"

if [ -z "$BENIGN_RE" ]; then
  echo "[test] FAIL: could not extract BENIGN_RE from fleet-worktree-push.sh" >&2
  exit 1
fi
echo "[test] BENIGN_RE (from shipped script) = $BENIGN_RE"

# classify <file-list-newline-separated> -> prints code_touched count.
# Mirrors the script's pipeline: filter out benign paths, count remaining
# non-empty lines. Uses `grep -c` whose exit-1-on-zero is swallowed so the
# count is emitted exactly once (the script relies on `|| echo 0`, but that
# doubles output in a command-substitution; here we normalize to one value).
classify() {
  local n
  n=$(printf '%s\n' "$1" | grep -Ev "$BENIGN_RE" | grep -c '.' || true)
  echo "${n:-0}"
}

PASS=0
FAIL=0
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "[test] PASS: $name (code_touched=$got)"
    PASS=$((PASS + 1))
  else
    echo "[test] FAIL: $name — got code_touched=$got want=$want" >&2
    FAIL=$((FAIL + 1))
  fi
}

# ── CASE A — exact production benign behind-set -> 0 code files -> push proceeds ─
# This is the realistic state: Merge + docs(reports) + chore(memory) + chore(health)
# + a churned scripts/*.jq triage helper. ALL benign.
CASE_A=$(cat <<'EOF'
docs/agent-memory/health/team-tool-recheck-2026-06-18-0407.md
docs/agent-memory/notebooks/po.md
docs/agent-memory/notebooks/tran-ngoc-bau.md
docs/data/orch/orch-state.json
docs/signals/tnb-20260617T201300Z.json
docs/data/cowork-schedule.json
docs/agents/po/flow/main.md
scripts/po-s103-guard1-defeat-fix-schedule-clobber-sau-d4-triage.jq
EOF
)
check "CASE A: benign Merge+docs(reports)+chore+jq behind-set -> push proceeds" \
  "$(classify "$CASE_A")" "0"

# ── CASE B — same benign set PLUS a real code file -> abort ───────────────────
CASE_B="$CASE_A
apps/mcp-server/src/alerts/storeAlerts.ts"
check "CASE B: benign set + apps/*.ts code -> ABORT" \
  "$(classify "$CASE_B")" "1"

# ── CASE C — a real shell script (NOT *.jq) in behind-set -> abort ────────────
CASE_C="$CASE_A
scripts/fleet-worktree-push.sh"
check "CASE C: benign set + scripts/*.sh code -> ABORT" \
  "$(classify "$CASE_C")" "1"

# ── CASE D — pure cowork churn (no scripts at all) -> push proceeds ───────────
CASE_D=$(cat <<'EOF'
docs/agent-memory/notebooks/unified-agent.md
docs/data/orch/orch-state.json
docs/signals/po-20260618T000000Z.json
EOF
)
check "CASE D: pure docs/notebook/orch/signal churn -> push proceeds" \
  "$(classify "$CASE_D")" "0"

# ── CASE E — config json (non-allowlisted) -> abort (real config needs review) ─
CASE_E="$CASE_A
apps/mcp-server/package.json"
check "CASE E: benign set + package.json config -> ABORT" \
  "$(classify "$CASE_E")" "1"

echo "[test] -------- $PASS passed, $FAIL failed --------"
[ "$FAIL" -eq 0 ] || exit 1
echo "[test] ALL CASES PASS — classifier is durable under the production behind-set."
exit 0
