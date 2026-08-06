#!/usr/bin/env bash
# scripts/audits/execute-tier-phase35-locklifetime-verify.sh
#
# Regression verifier for FIX-EXECUTETIER-PHASE35-RESUME-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION.
#
# docs/agents/dev-team/flow/execute-tier.md § Per-Tier Parallel Spawn (Phase 3.5)
# claims each task:<id> in `spawned_batch`, spawns its resolved agent(s)
# run_in_background=true, and (post-fix) releases the claim ONLY on the
# per-task exception path -- never on success. Pre-fix, a `finally` bound to
# the batch's own spawn calls released every claim in `spawned_batch`
# immediately after those (near-instant, backgrounded) calls returned, while
# every spawned agent was still live -- letting the NEXT read of the SAME
# task:<id> key (S2/SLS/RLC/DRS resume, or a peer session) re-claim and
# duplicate-spawn onto a task that already had a live agent working it.
#
# Unlike execute-tier-branchnull-review-headidle-verify.sh (a pure jq/orch-
# state decision tree, replayable against a synthetic fixture with zero
# network I/O), the defect this row fixes lives entirely in task_claim/
# task_release's OWN live mutex semantics -- there is no local jq transform
# to replay. This script instead mirrors the ORIGINAL S2 LOCK-LIFETIME fix's
# own verification methodology (commit adb426877, "Live-proved against the
# real task_claim/task_release MCP primitives ... not flow-doc prose"): it
# drives the REAL vn-market task_claim/task_release tools (via
# scripts/agents-flow/mcp-call.sh, the sanctioned Bash-bridge for MCP calls)
# against a throwaway, clearly-scoped task_id, and asserts:
#
#   AC-1 (positive -- the actual bug class): while session A's claim on
#     task:<id> is still held (unreleased -- the FIXED Phase-3.5 behavior,
#     i.e. "the spawned agent is still live"), a second claim attempt on the
#     SAME task:<id> from a different owner_client_session (session B, e.g.
#     a later tick's S2/SLS/RLC/DRS resume dispatcher) MUST fail
#     (claimed:false), and the reported current_holder MUST be session A.
#   AC-2 (negative control -- the counterfactual this fix removes): ONLY
#     after session A's claim is explicitly released (simulating the OLD,
#     pre-fix `finally: task_release` firing right after the backgrounded
#     spawn call returns) does session B's IDENTICAL retry succeed
#     (claimed:true) -- proving the old code path really would have let a
#     second agent be spawned onto a task the first agent was still working.
#
# Uses ttl_seconds=60 (the schema's own minimum -- live-verified 2026-08-06:
# task_claim rejects ttl_seconds<60) so the fixture self-expires quickly even
# if cleanup below is ever skipped; the task_id itself is namespaced
# ARCHVERIFY-PHASE35-LOCKLIFETIME-<UTC timestamp> so a script re-run never
# collides with a prior run's (already-expired) row.
#
# Usage: bash scripts/audits/execute-tier-phase35-locklifetime-verify.sh
# Exit 0 = both assertions pass. Exit 1 = a regression was detected (or the
# live MCP round-trip itself failed -- treated as inconclusive-fail, printed
# distinctly so it is not mistaken for a real regression).

set -uo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# shellcheck source=../agents-flow/mcp-call.sh
source "$PROJECT_ROOT/scripts/agents-flow/mcp-call.sh"

TID="task:ARCHVERIFY-PHASE35-LOCKLIFETIME-$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_A="verify-session-A-$$"
SESSION_B="verify-session-B-$$"

PASS=0
FAIL=0
INCONCLUSIVE=0
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

# Best-effort cleanup — releases whichever session might still hold $TID.
# `|| true` throughout: a release call on an already-unheld/expired lock is
# a benign no-op (`{"ok":true,"released":0}`), never a script failure.
cleanup() {
  mcp_call task_release "$(jq -n --arg tid "$TID" '{task_id:$tid, owner_client_session:"'"$SESSION_A"'"}')" >/dev/null 2>&1 || true
  mcp_call task_release "$(jq -n --arg tid "$TID" '{task_id:$tid, owner_client_session:"'"$SESSION_B"'"}')" >/dev/null 2>&1 || true
}
trap cleanup EXIT

claim_args() {
  local session="$1"
  jq -n --arg tid "$TID" --arg sess "$session" \
    '{task_id:$tid, task_kind:"sprint-task", owner_agent:"dev-team", owner_client_session:$sess, ttl_seconds:60, payload:"{\"site\":\"verify-fixture\",\"spawning\":\"dev-team\"}"}'
}

echo "[verify] task_id=$TID"

# ── Step 1: session A claims (simulates Phase-3.5's Step-1 outer_claim + the
#    spawn that follows it — this is the "agent still live" state). ─────────
claim_a_out=$(mcp_call task_claim "$(claim_args "$SESSION_A")") || { echo "INCONCLUSIVE: session A's initial claim itself failed (live MCP call error) — cannot proceed: $claim_a_out" >&2; INCONCLUSIVE=1; }
if [ "$INCONCLUSIVE" -eq 0 ]; then
  claim_a_ok=$(printf '%s' "$claim_a_out" | jq -r 'if .claimed == null then "false" else (.claimed|tostring) end')
  check "session A initial claim succeeds" "$([ "$claim_a_ok" = "true" ] && echo true || echo false)"
fi

# ── AC-1: session B attempts the SAME task:<id> WHILE A's claim is still
#    held (fixed-code state — no release happened). MUST fail. ─────────────
if [ "$INCONCLUSIVE" -eq 0 ]; then
  claim_b_out=$(mcp_call task_claim "$(claim_args "$SESSION_B")") || { echo "INCONCLUSIVE: session B's contested claim call itself errored (expected a clean claimed:false response, not a transport/tool error): $claim_b_out" >&2; INCONCLUSIVE=1; }
fi
if [ "$INCONCLUSIVE" -eq 0 ]; then
  # NOTE (self-caught while first running this script): jq's `//` operator falls
  # through on a literal `false`, not just `null`/absent — `.claimed // true` would
  # silently discard a genuine `claimed:false` and always yield "true", defeating
  # this exact assertion. Use an explicit null-check instead everywhere `.claimed`
  # is read in this file.
  claim_b_claimed=$(printf '%s' "$claim_b_out" | jq -r 'if .claimed == null then "true" else (.claimed|tostring) end')
  claim_b_holder=$(printf '%s' "$claim_b_out" | jq -r '.current_holder.owner_client_session // "MISSING"')
  check "AC-1: 2nd claim on same task:<id> FAILS while 1st claim (\"spawned agent\") still live" \
    "$([ "$claim_b_claimed" = "false" ] && echo true || echo false)"
  check "AC-1: current_holder correctly reports session A" \
    "$([ "$claim_b_holder" = "$SESSION_A" ] && echo true || echo false)"
fi

# ── AC-2 (negative control / counterfactual): release A — this is exactly
#    what the OLD, pre-fix `finally: task_release` bound to Phase-3.5's
#    backgrounded spawn call did, immediately after the spawn call returned
#    (milliseconds), NOT after the spawned agent actually finished. ────────
if [ "$INCONCLUSIVE" -eq 0 ]; then
  release_a_out=$(mcp_call task_release "$(jq -n --arg tid "$TID" --arg sess "$SESSION_A" '{task_id:$tid, owner_client_session:$sess}')") || { echo "INCONCLUSIVE: session A's release call itself errored: $release_a_out" >&2; INCONCLUSIVE=1; }
fi
if [ "$INCONCLUSIVE" -eq 0 ]; then
  retry_b_out=$(mcp_call task_claim "$(claim_args "$SESSION_B")") || { echo "INCONCLUSIVE: session B's retry-after-release claim itself errored: $retry_b_out" >&2; INCONCLUSIVE=1; }
fi
if [ "$INCONCLUSIVE" -eq 0 ]; then
  retry_b_claimed=$(printf '%s' "$retry_b_out" | jq -r 'if .claimed == null then "false" else (.claimed|tostring) end')
  check "AC-2: retry succeeds ONLY after the (simulated pre-fix) release — proves the counterfactual duplicate-spawn window this fix closes" \
    "$([ "$retry_b_claimed" = "true" ] && echo true || echo false)"
fi

echo ""
if [ "$INCONCLUSIVE" -ne 0 ]; then
  echo "INCONCLUSIVE: live MCP round-trip did not complete cleanly — re-run once network/gateway state is healthy; this is NOT a verdict on the fix itself."
  exit 1
fi
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
