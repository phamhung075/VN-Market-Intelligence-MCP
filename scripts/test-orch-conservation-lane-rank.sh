#!/usr/bin/env bash
# test-orch-conservation-lane-rank.sh — hermetic gate for the LANE_RANK
# tier-model fix in scripts/orch-conservation-check.mjs.
#
# OWNING TASK: FIX-QADRAIN-DONE-TO-QA-SCORES-BACKWARD-CONSERVATION-ABORTS-WHOLE-DRAIN (P0)
# OWNING BRIEF: docs/architecture-briefs/2026-08-26-qadrain-shared-hop-timegate-conservation-skipstrand.md §2
#
# ROOT CAUSE UNDER TEST: LANE_RANK used to be derived straight from
# FLAT_TASK_LANES' array position, encoding `done`(5) > `qa`(4) — i.e. "done
# comes after qa". That is FALSE for this board: done[] is a SECOND pre-QA
# staging lane feeding qa[] (exactly like review[]), so every legitimate
# done[]->qa[] drain scored BACKWARD, and at >=2 such rows in one write the
# guard aborted the ENTIRE write (including strictly-forward review[]-origin
# rows in the same batch). The fix gives `done` the SAME tier as `review`
# (both tier 3, feeding qa[]=tier 4); only `done_verified`=tier 5 stays the
# sole post-QA terminal.
#
# No dedicated test file existed for scripts/orch-conservation-check.mjs
# before this task (grep-confirmed) — this is a NEW file, not an extension
# of an existing harness.
#
# HARD INVARIANTS ASSERTED HERE:
#   AC1  two-or-more done[]-origin next_agent=="qa" rows moved done[]->qa[]
#        in ONE write lands clean — NO ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES
#        set, NO raised CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES.
#   AC2  NEGATIVE CONTROL — a genuine >=2-row stale-full-doc revert (qa[] ->
#        done[], the reproduced incident shape) STILL aborts. Proves the
#        guard stays armed, not merely disarmed by this fix.
#   AC3  fixture replays the exact 2026-08-26T03:22Z live shape (2 review[]-
#        origin + 2 done[]-origin rows, all moved to qa[] in one write) and
#        lands all 4.
#   NG1  same-tier lateral case (review[]<->done[]) is a documented NON-GOAL,
#        never flagged as backward, even with 2 such moves in one write
#        (exceeding the default tolerance of 1) — proves tier-equality, not
#        tolerance, is what protects this direction.
#   NG2  a genuine single-row qa[]->review[] revert (the pre-existing
#        sanctioned CHANGES_REQUESTED shape) is UNCHANGED — still tolerated
#        at exactly 1, unaffected by the done/review tier merge.
#
# USAGE: bash scripts/test-orch-conservation-lane-rank.sh
#        exit 0 = all cases pass; exit 1 = a case failed (gate is RED).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKER="$REPO_ROOT/scripts/orch-conservation-check.mjs"

cd "$REPO_ROOT"

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

TMP="$(mktemp -d -t orch-conservation-lane-rank-XXXXXX)"
# shellcheck disable=SC2329  # invoked via `trap cleanup EXIT INT TERM` below
cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# board <lanes-json> -> a minimally-shaped orch-state document (task_board
# only — the two dimensions this test exercises never touch signal_queue/
# dev_team_idle_chain).
board() {
  jq -n --argjson lanes "$1" \
    '{task_board: ({backlog: [], ready: [], in_progress: [], qa: [],
                    review: [], done: [], done_verified: []} + $lanes),
      signal_queue: {rows: [], archive: []},
      dev_team_idle_chain: {pending_triage_inbox: []}}'
}

# run_check <live-fixture> <candidate-fixture> -> "<exit_code>|<first stderr line matching ABORTED, or none>"
run_check() {
  local live="$1" candidate="$2"
  local out rc
  out="$(bun "$CHECKER" "$live" "$candidate" 2>&1)"
  rc=$?
  local abort_line
  abort_line="$(echo "$out" | grep -o 'lane-placement violation' | head -1)"
  echo "${rc}|${abort_line:-none}"
}

# ─────────────────────────────────────────────────────────────────────────────
# STATIC PROOF — LANE_RANK is a TIER map, done/review share the same tier
# ─────────────────────────────────────────────────────────────────────────────
check "LANE_RANK.done == LANE_RANK.review (same tier, source-verified)" \
  "$(node -e "
    const fs=require('fs');
    const src=fs.readFileSync('$CHECKER','utf-8');
    const m=src.match(/const LANE_RANK = \{([\s\S]*?)\};/);
    const body='{'+m[1]+'}';
    const obj=eval('('+body+')');
    console.log(obj.done === obj.review ? 'yes' : 'no');
  ")" "yes"
check "LANE_RANK.qa > LANE_RANK.done (done still feeds qa, not the reverse)" \
  "$(node -e "
    const fs=require('fs');
    const src=fs.readFileSync('$CHECKER','utf-8');
    const m=src.match(/const LANE_RANK = \{([\s\S]*?)\};/);
    const body='{'+m[1]+'}';
    const obj=eval('('+body+')');
    console.log(obj.qa > obj.done ? 'yes' : 'no');
  ")" "yes"
check "LANE_RANK.done_verified is the sole highest (terminal) tier" \
  "$(node -e "
    const fs=require('fs');
    const src=fs.readFileSync('$CHECKER','utf-8');
    const m=src.match(/const LANE_RANK = \{([\s\S]*?)\};/);
    const body='{'+m[1]+'}';
    const obj=eval('('+body+')');
    const max=Math.max(...Object.values(obj));
    console.log((obj.done_verified === max) ? 'yes' : 'no');
  ")" "yes"

# ─────────────────────────────────────────────────────────────────────────────
# AC1 — 2 done[]-origin next_agent=="qa" rows claimed into qa[] in one write
# ─────────────────────────────────────────────────────────────────────────────
LIVE1="$TMP/ac1-live.json"
CAND1="$TMP/ac1-candidate.json"
board '{
  "done": [
    {"id":"DONE-Q1","status":"DONE","next_agent":"qa"},
    {"id":"DONE-Q2","status":"DONE","next_agent":"qa"}
  ]
}' > "$LIVE1"
board '{
  "qa": [
    {"id":"DONE-Q1","status":"QA","next_agent":"qa","drain_source_lane":"done"},
    {"id":"DONE-Q2","status":"QA","next_agent":"qa","drain_source_lane":"done"}
  ]
}' > "$CAND1"
RESULT1="$(unset ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES; run_check "$LIVE1" "$CAND1")"
check "AC1 two done[]-origin qa[] claims land clean, exit 0" \
  "$(echo "$RESULT1" | cut -d'|' -f1)" "0"
check "AC1 no lane-placement violation reported" \
  "$(echo "$RESULT1" | cut -d'|' -f2)" "none"

# ─────────────────────────────────────────────────────────────────────────────
# AC2 — NEGATIVE CONTROL: a genuine >=2-row stale-full-doc revert (qa[] back
# to done[]) STILL aborts. Proves the guard is not merely disarmed.
# ─────────────────────────────────────────────────────────────────────────────
LIVE2="$TMP/ac2-live.json"
CAND2="$TMP/ac2-candidate.json"
board '{
  "qa": [
    {"id":"STALE-REVERT-1","status":"QA","next_agent":"qa"},
    {"id":"STALE-REVERT-2","status":"QA","next_agent":"qa"}
  ]
}' > "$LIVE2"
board '{
  "done": [
    {"id":"STALE-REVERT-1","status":"DONE","next_agent":"qa"},
    {"id":"STALE-REVERT-2","status":"DONE","next_agent":"qa"}
  ]
}' > "$CAND2"
RESULT2="$(unset ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES; run_check "$LIVE2" "$CAND2")"
check "AC2 negative control: 2-row qa[]->done[] stale revert STILL aborts (exit 1)" \
  "$(echo "$RESULT2" | cut -d'|' -f1)" "1"
check "AC2 negative control: reported as lane-placement violation" \
  "$(echo "$RESULT2" | cut -d'|' -f2)" "lane-placement violation"

# ─────────────────────────────────────────────────────────────────────────────
# AC3 — replays the exact 2026-08-26T03:22Z live shape: 2 review[]-origin +
# 2 done[]-origin rows, all claimed into qa[] in ONE write. Lands all 4.
# ─────────────────────────────────────────────────────────────────────────────
LIVE3="$TMP/ac3-live.json"
CAND3="$TMP/ac3-candidate.json"
board '{
  "review": [
    {"id":"REV-1","status":"REVIEW","next_agent":"qa"},
    {"id":"REV-2","status":"REVIEW","next_agent":"qa"}
  ],
  "done": [
    {"id":"DONE-1","status":"DONE","next_agent":"qa"},
    {"id":"DONE-2","status":"DONE","next_agent":"qa"}
  ]
}' > "$LIVE3"
board '{
  "qa": [
    {"id":"REV-1","status":"QA","next_agent":"qa","drain_source_lane":"review"},
    {"id":"REV-2","status":"QA","next_agent":"qa","drain_source_lane":"review"},
    {"id":"DONE-1","status":"QA","next_agent":"qa","drain_source_lane":"done"},
    {"id":"DONE-2","status":"QA","next_agent":"qa","drain_source_lane":"done"}
  ]
}' > "$CAND3"
RESULT3="$(unset ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES; run_check "$LIVE3" "$CAND3")"
check "AC3 03:22Z-shape replay (2 review + 2 done -> qa) lands all 4, exit 0" \
  "$(echo "$RESULT3" | cut -d'|' -f1)" "0"
check "AC3 03:22Z-shape replay: candidate qa[] holds all 4 ids" \
  "$(jq -r '.task_board.qa | length' "$CAND3")" "4"

# ─────────────────────────────────────────────────────────────────────────────
# NG1 — documented non-goal: same-tier lateral moves (review<->done) are
# NEVER flagged, even 2-at-once (exceeding the default tolerance of 1) —
# proves tier-EQUALITY, not the tolerance count, protects this direction.
# ─────────────────────────────────────────────────────────────────────────────
LIVE4="$TMP/ng1-live.json"
CAND4="$TMP/ng1-candidate.json"
board '{
  "review": [
    {"id":"LATERAL-1","status":"REVIEW","next_agent":"po"},
    {"id":"LATERAL-2","status":"REVIEW","next_agent":"po"}
  ]
}' > "$LIVE4"
board '{
  "done": [
    {"id":"LATERAL-1","status":"DONE","next_agent":"po"},
    {"id":"LATERAL-2","status":"DONE","next_agent":"po"}
  ]
}' > "$CAND4"
RESULT4="$(unset ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES; run_check "$LIVE4" "$CAND4")"
check "NG1 2x same-tier lateral review->done move is NOT flagged (exit 0)" \
  "$(echo "$RESULT4" | cut -d'|' -f1)" "0"
check "NG1 no lane-placement violation reported for the lateral pair" \
  "$(echo "$RESULT4" | cut -d'|' -f2)" "none"

# ─────────────────────────────────────────────────────────────────────────────
# NG2 — the pre-existing sanctioned single-row qa[]->review[] revert (QA
# CHANGES_REQUESTED) is UNCHANGED by this fix — still tolerated at exactly 1.
# ─────────────────────────────────────────────────────────────────────────────
LIVE5="$TMP/ng2-live.json"
CAND5="$TMP/ng2-candidate.json"
board '{
  "qa": [
    {"id":"CHANGES-REQ-1","status":"QA","next_agent":"qa"}
  ]
}' > "$LIVE5"
board '{
  "review": [
    {"id":"CHANGES-REQ-1","status":"REVIEW","next_agent":"developer"}
  ]
}' > "$CAND5"
RESULT5="$(unset ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES; run_check "$LIVE5" "$CAND5")"
check "NG2 single-row qa[]->review[] CHANGES_REQUESTED revert still tolerated (exit 0)" \
  "$(echo "$RESULT5" | cut -d'|' -f1)" "0"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[test] ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
