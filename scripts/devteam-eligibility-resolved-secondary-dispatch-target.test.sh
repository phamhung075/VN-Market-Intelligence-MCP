#!/usr/bin/env bash
# scripts/devteam-eligibility-resolved-secondary-dispatch-target.test.sh
#
# Regression test for scripts/lib/devteam-eligibility.jq's
# resolved_secondary_dispatch_target() — Task:
# FIX-DEVTEAM-SECONDARY-DRAIN-NO-SELF-TARGET-RESOLVER-CASE (architect,
# 2026-08-05).
#
# ROOT CAUSE THIS SUITE PROVES CLOSED: resolved_secondary_dispatch_target()
# had exactly ONE defaulting case — next_agent null/absent -> "po" — and
# passed every other non-null value through VERBATIM, including the literal
# string "dev-team". scripts/devteam-review-claim-secondary-drain.jq
# (Review-Lane SECONDARY-Drain) then stamps that value as
# secondary_dispatch_target and hands it to the caller (dev-team's own flow)
# to spawn. dev-team carries a hard, non-negotiable "NEVER spawn the
# dev-team dispatcher flow from within itself" anti-recursion guard, so a
# "dev-team" dispatch_target can never actually be dispatched — the row was
# left claimed (secondary_claimed_at stamped) but permanently stranded,
# re-picked and re-refused every subsequent tick. LIVE-CONFIRMED 2026-08-05:
# review[] row OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE hit exactly this
# wall; 4 more live rows (FIX-BCTC-FPT-BT5-BALANCE-GATE,
# FIX-MACRO-THRESHOLD-FXFLOOR-OVERCLAMP,
# FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING,
# FIX-DRAIN-TEST-HARNESS-ORCH-HELPER-COPY-LIST) carried the identical
# next_agent=="dev-team" shape and would have stranded identically.
#
# This suite EXECUTES resolved_secondary_dispatch_target() directly (never
# reads next_agent back) against a small isolated fixture — never against
# the live docs/data/orch/orch-state.json.
#
# Run:
#   bash scripts/devteam-eligibility-resolved-secondary-dispatch-target.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0
check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

# exec_target(next_agent_json_literal) -> resolved_secondary_dispatch_target()
# result for a single-row fixture whose .next_agent is the given jq literal
# (e.g. "\"dev-team\"" or "null"). No $detail_items entries -> board value is
# authoritative (mirrors effective_next_agent's own board-fallback path).
# MUST be invoked with cwd=REPO_ROOT (jq `include` path resolution is
# caller-cwd-relative — see devteam-eligibility.jq's own header).
exec_target() {
  local na_literal="$1"
  ( cd "$REPO_ROOT" && jq -n --argjson na "$na_literal" '
      include "scripts/lib/devteam-eligibility";
      ({ id: "FIX-FIXTURE-ROW", next_agent: $na }) as $row
      | ($row | resolved_secondary_dispatch_target({}))
    '
  )
}

# ── T1: the pre-existing null-fallback case (unchanged behavior) ──────────
T1=$(exec_target "null")
check "T1: next_agent=null resolves to \"po\" (unchanged null-fallback)" \
  "$( [ "$T1" = "\"po\"" ] && echo true || echo false )"

# ── T2: the pre-existing absent-field case (unchanged behavior) ───────────
T2=$( cd "$REPO_ROOT" && jq -n '
    include "scripts/lib/devteam-eligibility";
    ({ id: "FIX-FIXTURE-ROW" }) as $row
    | ($row | resolved_secondary_dispatch_target({}))
  ' )
check "T2: next_agent absent resolves to \"po\" (unchanged absent-fallback)" \
  "$( [ "$T2" = "\"po\"" ] && echo true || echo false )"

# ── T3: THE FIX — next_agent=="dev-team" must resolve to "po", never
#        pass through as "dev-team" (the self-target strand this task closes) ──
T3=$(exec_target '"dev-team"')
check "T3: next_agent=\"dev-team\" resolves to \"po\" (THE FIX — never self-targets)" \
  "$( [ "$T3" = "\"po\"" ] && echo true || echo false )"

# ── T4: every other non-null next_agent still passes through verbatim
#        (proves the fix is a narrow special-case, not a behavior regression) ──
T4=$(exec_target '"architect"')
check "T4: next_agent=\"architect\" still passes through verbatim (no regression)" \
  "$( [ "$T4" = "\"architect\"" ] && echo true || echo false )"

T5=$(exec_target '"ops"')
check "T5: next_agent=\"ops\" still passes through verbatim (no regression)" \
  "$( [ "$T5" = "\"ops\"" ] && echo true || echo false )"

echo "──────────────────────────────────────────────────────────────"
echo "devteam-eligibility-resolved-secondary-dispatch-target.test.sh: ${PASS} pass / ${FAIL} fail"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
