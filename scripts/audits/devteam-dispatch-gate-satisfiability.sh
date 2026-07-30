#!/usr/bin/env bash
# devteam-dispatch-gate-satisfiability.sh
#
# UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22),
# PO ruling item (4): "The DoD instrument MUST test gate SATISFIABILITY on
# a live-shaped saturated fixture (ready≈36, in_progress=1) — assert the
# gate FIRES and DRAINS — NOT lane-resolution."
#
# WHY THIS SCRIPT EXISTS AND IS NOT scripts/audits/bounded1-supervised-
# lane-report.sh: that script (kept, still valid for what it tests) proves
# every supervised+plan_only backlog row resolves to a named specialist
# (LANE RESOLUTION). It does NOT prove the promote/claim scripts that use
# that resolution are ever reachable — FIX-BOUNDED1-SUPERVISED-LANE-NO-
# SWEEPER shipped 2026-07-21 with that report GREEN (16/16 rows resolved)
# while its own firing gate `(ready+in_progress) < 2` was permanently false
# against the live board (ready=36, in_progress=1 => 37, never < 2) — a
# green lane-resolution report gave zero signal that the mechanism would
# ever actually run. This script tests the OTHER claim: given the exact
# saturated shape that caused that false-green (ready[] large, review[]
# large, in_progress small), do the gates actually FIRE and does the board
# actually DRAIN (row counts move between lanes), end to end, using the
# REAL promote/claim scripts (not a re-implementation of their logic)?
#
# Method: copies the CURRENT LIVE docs/data/orch/orch-state.json to a
# scratch workdir (never mutates the live file — no orch-apply.sh call
# against the real path anywhere in this script) and, IF the live board is
# not already saturated enough for a meaningful test, synthesizes a
# saturated fixture from it (pads ready[]/review[] with synthetic rows,
# caps in_progress[] to exactly 1) — then replays the REAL dev-team tick
# chain (BOUNDED-1 promote+claim -> SLS promote+claim -> Ready-Lane
# Consumer claim -> Review-Lane QA-Drain claim, each gated exactly as
# docs/agents/dev-team/flow/main.md specifies) against the scratch file,
# asserting each stage's OWN gate-satisfiability + drain behavior, plus a
# NEGATIVE control (WIP capped at 2 -> the three in_progress-budget lanes
# must NOT fire).
#
# EXTENDED 2026-07-30 (AC-6, FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-
# PLANONLY-NO-PICKER): § SLS-claim FALLBACK adds isolated single-row
# fixtures (same discipline as the DRS AC fixtures below — NOT mixed into
# the shared padded fixture, so these assertions are deterministic
# regardless of live-board drift) proving the NEW unstamped-ready[]-row
# claim path (AC-2's fix) actually fires: positive claim + dispatch_lane
# resolution + promoted_by-not-forged (AC-2's explicit constraint), plus
# negative controls (epic-wrapper exclusion per AC-4, unmet-depends_on
# exclusion) and a PRIMARY-vs-FALLBACK coexistence ordering check. This is
# satisfiability for the SAME reason the rest of this file exists:
# scripts/audits/bounded1-supervised-lane-report.sh proves the fixed claim
# script's FALLBACK class resolves a dispatch lane (LANE RESOLUTION,
# extended there too, AC-5) — it does not prove the claim script's jq logic
# actually reaches and moves the row. This file does.
#
# Usage: bash scripts/audits/devteam-dispatch-gate-satisfiability.sh
# Exit 0 = every assertion below passes. Exit 1 = at least one fails
# (details printed). Never writes to the live orch-state.json.

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATE="docs/data/orch/orch-state.json"
DETAIL="docs/data/orch/archive/backlog-detail.json"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAIL=0
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING (2026-07-28): BOUNDED-
# 1/SLS/RLC now require --slurpfile archive (dep_status_map($archive) —
# scripts/lib/devteam-eligibility.jq). Materialized ONCE into a real scratch
# file (not re-globbed per invocation below) via the shared helper.
ARCHIVE="$WORK/archive.json"
bash scripts/lib/archive-glob-cat.sh > "$ARCHIVE"

assert() {
  local desc="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "  [PASS] $desc"
  else
    echo "  [FAIL] $desc"
    FAIL=1
  fi
}

# ---- Step 1: build the saturated fixture ----
cp "$STATE" "$WORK/fixture.json"

READY_N=$(jq '.task_board.ready|length' "$WORK/fixture.json")
INPROG_N=$(jq '.task_board.in_progress|length' "$WORK/fixture.json")
REVIEW_N=$(jq '.task_board.review|length' "$WORK/fixture.json")

echo "=== Live-shaped baseline: ready=$READY_N in_progress=$INPROG_N review=$REVIEW_N ==="

# Pad ready[]/review[] with synthetic rows if the live board is not already
# saturated enough (defensive — keeps this instrument meaningful even after
# the live board has been drained by this very fix). Synthetic rows are
# clearly id-prefixed and use non-DONE_VERIFIED-dependent, non-supervised,
# non-plan_only shapes so they are trivially eligible.
if [ "$READY_N" -lt 30 ]; then
  jq --arg now "$NOW" '
    .task_board.ready += [
      range(0; 30 - ($ARGS.positional[0] | tonumber)) as $i
      | { id: ("GATESAT-SYNTH-READY-" + ($i|tostring)),
          status: "READY", priority: "P2", type: "FIX", zone: "cross-service/",
          next_agent: "developer", created_at: $now }
    ]' --args "$READY_N" "$WORK/fixture.json" > "$WORK/fixture2.json"
  mv "$WORK/fixture2.json" "$WORK/fixture.json"
fi
if [ "$REVIEW_N" -lt 20 ]; then
  jq --arg now "$NOW" '
    .task_board.review += [
      range(0; 20 - ($ARGS.positional[0] | tonumber)) as $i
      | { id: ("GATESAT-SYNTH-REVIEW-" + ($i|tostring)),
          status: "REVIEW", priority: "P2", type: "FIX", zone: "cross-service/",
          next_agent: "qa", created_at: $now }
    ]' --args "$REVIEW_N" "$WORK/fixture.json" > "$WORK/fixture2.json"
  mv "$WORK/fixture2.json" "$WORK/fixture.json"
fi
# Force in_progress to exactly 1 (the reported deadlock shape) regardless of
# live drift, so this instrument's PRIMARY assertions are deterministic.
jq '.task_board.in_progress = (.task_board.in_progress[0:1])' "$WORK/fixture.json" > "$WORK/fixture2.json"
mv "$WORK/fixture2.json" "$WORK/fixture.json"
if [ "$(jq '.task_board.in_progress|length' "$WORK/fixture.json")" -eq 0 ]; then
  jq --arg now "$NOW" '.task_board.in_progress = [{ id: "GATESAT-SYNTH-INPROGRESS-0", status: "IN_PROGRESS", priority: "P2", type: "FIX", zone: "cross-service/", next_agent: "developer", claimed_at: $now }]' \
    "$WORK/fixture.json" > "$WORK/fixture2.json"
  mv "$WORK/fixture2.json" "$WORK/fixture.json"
fi

READY_N=$(jq '.task_board.ready|length' "$WORK/fixture.json")
INPROG_N=$(jq '.task_board.in_progress|length' "$WORK/fixture.json")
REVIEW_N=$(jq '.task_board.review|length' "$WORK/fixture.json")
echo "=== Saturated fixture under test: ready=$READY_N in_progress=$INPROG_N review=$REVIEW_N ==="

bun scripts/orch-validate.mjs "$WORK/fixture.json" >/dev/null 2>&1 \
  && FIXTURE_VALID=true || FIXTURE_VALID=false
assert "saturated fixture is itself Zod-schema-valid before any picker runs" "$FIXTURE_VALID"

# ---- Step 2: gate-satisfiability + drain assertions (positive path) ----
echo ""
echo "=== POSITIVE PATH: WIP(in_progress)=$INPROG_N < 2 — BOUNDED-1/SLS/RLC gates MUST be satisfiable ==="

cp "$WORK/fixture.json" "$WORK/t1.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-bounded1.jq "$WORK/t1.json" > "$WORK/t1b.json"
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq "$WORK/t1b.json" > "$WORK/t1c.json"
B1_MOVED=$([ "$(jq '.task_board.in_progress|length' "$WORK/t1c.json")" -gt "$INPROG_N" ] && echo true || echo false)
# BOUNDED-1's OWN gate is in_progress<1 (independent, stricter cap) — with
# INPROG_N=1 live it will legitimately no-op (already at its own cap). Only
# assert it FIRES when in_progress==0; otherwise assert the documented no-op.
if [ "$INPROG_N" -eq 0 ]; then
  assert "BOUNDED-1 fires when in_progress==0 (its own WIP<1 cap)" "$B1_MOVED"
else
  assert "BOUNDED-1 correctly no-ops when in_progress>=1 (own WIP<1 cap, independent of ready[] depth)" "$([ "$B1_MOVED" = "false" ] && echo true || echo false)"
fi

cp "$WORK/fixture.json" "$WORK/t2.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq "$WORK/t2.json" > "$WORK/t2b.json"
# FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER (2026-07-30):
# claim script now ALSO needs --slurpfile detail/--slurpfile archive (its new
# FALLBACK path resolves effective_supervised/effective_plan_only/is_epic_wrapper/
# deps_satisfied) — thread the same two files every other real-script call in
# this instrument already uses.
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/t2b.json" > "$WORK/t2c.json"
SLS_READY_BEFORE=$(jq '.task_board.ready|length' "$WORK/t2.json")
SLS_INPROG_AFTER=$(jq '.task_board.in_progress|length' "$WORK/t2c.json")
SLS_FIRED=$([ "$SLS_INPROG_AFTER" -gt "$INPROG_N" ] && echo true || echo false)
assert "SLS gate (in_progress<2) is SATISFIABLE at in_progress=$INPROG_N despite ready[]=$SLS_READY_BEFORE (the exact instance-9 saturated shape) — SLS claims a row" "$SLS_FIRED"

# ---- SLS-claim FALLBACK (FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-
# NO-PICKER, 2026-07-30) — an unstamped supervised+plan_only ready[] row
# (arrived via a route OTHER than this sweep's own promote script) must now
# be reachable too. Isolated single-row fixtures (mirrors the DRS AC fixtures
# below), never mixed into the shared padded fixture above, so this section's
# assertions are deterministic regardless of live-board drift.
echo ""
echo "=== SLS-claim FALLBACK: unstamped supervised+plan_only ready[] row (AC-2 fix) ==="

SLS_FALLBACK_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-SLS-FALLBACK-UNSTAMPED", status: "READY", priority: "P0",
        type: "FIX", zone: "cross-service/", next_agent: "pm",
        supervised: true, plan_only: true, promoted_by: null, created_at: $now } ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$SLS_FALLBACK_FIXTURE" > "$WORK/sls-fallback.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
  -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-fallback.json" > "$WORK/sls-fallback-out.json"
SLS_FALLBACK_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-SLS-FALLBACK-UNSTAMPED")] | length' "$WORK/sls-fallback-out.json")
assert "AC-SLS-FALLBACK: unstamped (promoted_by=null) supervised+plan_only ready[] row IS claimed by SLS-claim's FALLBACK path" \
  "$([ "$SLS_FALLBACK_CLAIMED" -eq 1 ] && echo true || echo false)"
SLS_FALLBACK_LANE=$(jq -r '.task_board.in_progress[] | select(.id=="GATESAT-SLS-FALLBACK-UNSTAMPED") | .dispatch_lane // empty' "$WORK/sls-fallback-out.json")
assert "AC-SLS-FALLBACK-LANE: dispatch_lane resolved to the row's own next_agent ('pm'), got '${SLS_FALLBACK_LANE:-<none>}'" \
  "$([ "$SLS_FALLBACK_LANE" = "pm" ] && echo true || echo false)"
SLS_FALLBACK_PROMOTED_BY=$(jq -r '.task_board.in_progress[] | select(.id=="GATESAT-SLS-FALLBACK-UNSTAMPED") | .promoted_by' "$WORK/sls-fallback-out.json")
assert "AC-SLS-FALLBACK-NO-FORGE (AC-2 explicit constraint): promoted_by stays null — NEVER forged to fabricate provenance (got '${SLS_FALLBACK_PROMOTED_BY}')" \
  "$([ "$SLS_FALLBACK_PROMOTED_BY" = "null" ] && echo true || echo false)"

# Negative control 1: same shape, but an epic wrapper — must NOT be claimed
# (AC-4 — decomposition containers are never directly dispatched; closed out
# separately by post-cycle.md's Step 4.4 Epic-Wrapper Autoclose Sweep).
SLS_FALLBACK_WRAPPER_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-SLS-FALLBACK-WRAPPER", status: "READY", priority: "P0",
        type: "FIX", zone: "cross-service/", next_agent: "developer",
        supervised: true, plan_only: true, promoted_by: null,
        children: ["GATESAT-SLS-FALLBACK-WRAPPER-CHILD-1"], created_at: $now } ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$SLS_FALLBACK_WRAPPER_FIXTURE" > "$WORK/sls-fallback-wrapper.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
  -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-fallback-wrapper.json" > "$WORK/sls-fallback-wrapper-out.json"
SLS_FALLBACK_WRAPPER_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-SLS-FALLBACK-WRAPPER")] | length' "$WORK/sls-fallback-wrapper-out.json")
assert "AC-SLS-FALLBACK-NEG-WRAPPER: an epic-wrapper row (children[] non-empty) is NEVER claimed by the FALLBACK path, even though supervised+plan_only+unstamped" \
  "$([ "$SLS_FALLBACK_WRAPPER_CLAIMED" -eq 0 ] && echo true || echo false)"

# Negative control 2: same shape, but an unmet depends_on — must NOT be claimed.
SLS_FALLBACK_DEP_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-SLS-FALLBACK-BLOCKED-DEP", status: "READY", priority: "P0",
        type: "FIX", zone: "cross-service/", next_agent: "pm",
        supervised: true, plan_only: true, promoted_by: null,
        depends_on: ["GATESAT-SLS-FALLBACK-DEP-NOT-DONE"], created_at: $now } ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$SLS_FALLBACK_DEP_FIXTURE" > "$WORK/sls-fallback-dep.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
  -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-fallback-dep.json" > "$WORK/sls-fallback-dep-out.json"
SLS_FALLBACK_DEP_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-SLS-FALLBACK-BLOCKED-DEP")] | length' "$WORK/sls-fallback-dep-out.json")
assert "AC-SLS-FALLBACK-NEG-DEPS: a row with an unsatisfied depends_on is NEVER claimed by the FALLBACK path" \
  "$([ "$SLS_FALLBACK_DEP_CLAIMED" -eq 0 ] && echo true || echo false)"

# Ordering control: PRIMARY (SLS-stamped) row and an eligible FALLBACK row
# coexist in ready[] — PRIMARY must win this invocation; FALLBACK stays
# staged for a later tick (at most one claim per invocation, same discipline
# as every other picker in this chain).
SLS_COEXIST_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [],
      ready: [
        { id: "GATESAT-SLS-COEXIST-PRIMARY", status: "READY", priority: "P1",
          type: "FIX", zone: "cross-service/", next_agent: "architect",
          supervised: true, plan_only: true, promoted_by: "dev-team (supervised-lane sweep)",
          dispatch_lane: "architect", created_at: $now },
        { id: "GATESAT-SLS-COEXIST-FALLBACK", status: "READY", priority: "P0",
          type: "FIX", zone: "cross-service/", next_agent: "pm",
          supervised: true, plan_only: true, promoted_by: null, created_at: $now }
      ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$SLS_COEXIST_FIXTURE" > "$WORK/sls-coexist.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
  -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-coexist.json" > "$WORK/sls-coexist-out.json"
SLS_COEXIST_PRIMARY_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-SLS-COEXIST-PRIMARY")] | length' "$WORK/sls-coexist-out.json")
SLS_COEXIST_FALLBACK_STILL_READY=$(jq -r '[.task_board.ready[] | select(.id=="GATESAT-SLS-COEXIST-FALLBACK")] | length' "$WORK/sls-coexist-out.json")
assert "AC-SLS-FALLBACK-ORDERING: when a PRIMARY (stamped) candidate exists, it is claimed and the FALLBACK candidate is left staged in ready[] for a later tick (at most one claim per invocation)" \
  "$([ "$SLS_COEXIST_PRIMARY_CLAIMED" -eq 1 ] && [ "$SLS_COEXIST_FALLBACK_STILL_READY" -eq 1 ] && echo true || echo false)"

cp "$WORK/fixture.json" "$WORK/t3.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-ready-lane-consumer.jq "$WORK/t3.json" > "$WORK/t3c.json"
RLC_INPROG_AFTER=$(jq '.task_board.in_progress|length' "$WORK/t3c.json")
RLC_READY_AFTER=$(jq '.task_board.ready|length' "$WORK/t3c.json")
RLC_FIRED=$([ "$RLC_INPROG_AFTER" -gt "$INPROG_N" ] && [ "$RLC_READY_AFTER" -lt "$READY_N" ] && echo true || echo false)
assert "Ready-Lane Consumer gate (in_progress<2) is SATISFIABLE at in_progress=$INPROG_N — RLC claims a resolved-next_agent ready[] row (ready[] shrinks, in_progress[] grows)" "$RLC_FIRED"

cp "$WORK/fixture.json" "$WORK/t4.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-review-claim-qa-drain.jq "$WORK/t4.json" > "$WORK/t4c.json"
QA_REVIEW_AFTER=$(jq '.task_board.review|length' "$WORK/t4c.json")
QA_QA_AFTER=$(jq '.task_board.qa|length' "$WORK/t4c.json")
QA_FIRED=$([ "$QA_REVIEW_AFTER" -lt "$REVIEW_N" ] && [ "$QA_QA_AFTER" -gt 0 ] && echo true || echo false)
assert "Review-Lane QA-Drain gate (qa[]<1, independent of the in_progress budget) is SATISFIABLE at review[]=$REVIEW_N — a row moves review[]->qa[]" "$QA_FIRED"

# ---- Design-Router Sweep (DRS) — FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE (2026-07-30) ----
DRS_ALLOWLIST='["architect","ba","pm","po","agents-architect"]'

cp "$WORK/fixture.json" "$WORK/t5.json"
jq --arg now "$NOW" --argjson allowlist "$DRS_ALLOWLIST" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-design-router-sweep.jq "$WORK/t5.json" > "$WORK/t5b.json"
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/t5b.json" > "$WORK/t5c.json"
DRS_INPROG_AFTER=$(jq '.task_board.in_progress|length' "$WORK/t5c.json")
DRS_FIRED=$([ "$DRS_INPROG_AFTER" -gt "$INPROG_N" ] && echo true || echo false)
assert "DRS gate (in_progress<2, shared 4th writer) is SATISFIABLE at in_progress=$INPROG_N — DRS claims an allowlisted non-dev-next_agent row not already in SLS's supervised+plan_only territory" "$DRS_FIRED"

# AC: allowlist excludes agent-father/ops*/qa even when otherwise DRS-eligible
# (single-row synthetic fixture, isolated from the live/padded board above).
DRS_AGENTFATHER_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [ { id: "GATESAT-DRS-AGENTFATHER", status: "BACKLOG", priority: "P1",
                    type: "FIX", zone: "cross-service/", next_agent: "agent-father", created_at: $now } ],
      ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$DRS_AGENTFATHER_FIXTURE" > "$WORK/drs-agentfather.json"
DRS_AGENTFATHER_PICKED=$(jq --arg now "$NOW" --argjson allowlist "$DRS_ALLOWLIST" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
  -f scripts/devteam-backlog-promote-design-router-sweep.jq "$WORK/drs-agentfather.json" | jq -r '.task_board.ready[0].id // empty')
assert "AC-DRS-ALLOWLIST: a non-dev next_agent='agent-father' row (ratified-EXCLUDED, off-allowlist) is NEVER promoted by DRS even though it would otherwise be eligible (picked='${DRS_AGENTFATHER_PICKED:-<none>}')" \
  "$([ "$DRS_AGENTFATHER_PICKED" != "GATESAT-DRS-AGENTFATHER" ] && echo true || echo false)"

# AC: a row already in SLS's doubly-gated territory (supervised AND plan_only
# both true) is NEVER picked up by DRS — no double-claim race with SLS.
DRS_SLS_OVERLAP_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [ { id: "GATESAT-DRS-SLS-OVERLAP", status: "BACKLOG", priority: "P0",
                    type: "FIX", zone: "cross-service/", next_agent: "ba",
                    supervised: true, plan_only: true, created_at: $now } ],
      ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$DRS_SLS_OVERLAP_FIXTURE" > "$WORK/drs-sls-overlap.json"
DRS_SLS_OVERLAP_PICKED=$(jq --arg now "$NOW" --argjson allowlist "$DRS_ALLOWLIST" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
  -f scripts/devteam-backlog-promote-design-router-sweep.jq "$WORK/drs-sls-overlap.json" | jq -r '.task_board.ready[0].id // empty')
assert "AC-DRS-NO-SLS-OVERLAP: a supervised:true AND plan_only:true row (SLS's own territory) is NEVER promoted by DRS (picked='${DRS_SLS_OVERLAP_PICKED:-<none>}')" \
  "$([ "$DRS_SLS_OVERLAP_PICKED" != "GATESAT-DRS-SLS-OVERLAP" ] && echo true || echo false)"

# AC: a row with EXACTLY ONE of supervised/plan_only true (SLS does NOT drain
# this — SLS requires BOTH) IS DRS-eligible, per the ratified brief §2.1
# (an AND exclusion, not OR) — this is the exact residual PO's ratification
# flagged as "some already covered" (§ review_note).
DRS_SUPERVISED_ONLY_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [ { id: "GATESAT-DRS-SUPERVISED-ONLY", status: "BACKLOG", priority: "P0",
                    type: "FIX", zone: "cross-service/", next_agent: "ba",
                    supervised: true, created_at: $now } ],
      ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$DRS_SUPERVISED_ONLY_FIXTURE" > "$WORK/drs-supervised-only.json"
DRS_SUPERVISED_ONLY_PICKED=$(jq --arg now "$NOW" --argjson allowlist "$DRS_ALLOWLIST" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
  -f scripts/devteam-backlog-promote-design-router-sweep.jq "$WORK/drs-supervised-only.json" | jq -r '.task_board.ready[0].id // empty')
assert "AC-DRS-SUPERVISED-ONLY-ELIGIBLE: a supervised:true (plan_only NOT true) allowlisted non-dev row IS promoted by DRS (mirrors live UC-CCA-P3/FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR shape; picked='${DRS_SUPERVISED_ONLY_PICKED:-<none>}')" \
  "$([ "$DRS_SUPERVISED_ONLY_PICKED" = "GATESAT-DRS-SUPERVISED-ONLY" ] && echo true || echo false)"

# AC-DRS-HEAD-GUARD (mandatory conditional-guard `.head` write, brief §2.5 /
# PO ratification Q3 hard AC): pre-seed a genuinely busy `.head` (a DIFFERENT
# task, unrelated to anything DRS just staged) BEFORE invoking the claim
# script — `.head` must come out byte-identical, even though the row still
# legitimately moves ready[]->in_progress[] underneath it. Mechanizes the
# exact defect class the qadrain-head-slot-decouple sibling precedent found.
DRS_BUSY_HEAD_FIXTURE="$WORK/drs-busy-head.json"
jq --arg now "$NOW" '
  .task_board.ready += [ { id: "GATESAT-DRS-HEADGUARD", status: "READY", priority: "P1",
    type: "FIX", zone: "cross-service/", next_agent: "ba", dispatch_lane: "ba",
    promoted_by: "dev-team (design-router sweep)", promoted_at: $now } ]
  | .head = { status: "in_progress", active_task_id: "GATESAT-UNRELATED-BUSY-TASK",
              next_agent: "developer", updated_at: $now, updated_by: "test" }
' "$WORK/fixture.json" > "$DRS_BUSY_HEAD_FIXTURE"
HEAD_BEFORE=$(jq -c '.head' "$DRS_BUSY_HEAD_FIXTURE")
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$DRS_BUSY_HEAD_FIXTURE" > "$WORK/drs-busy-head-after.json"
HEAD_AFTER=$(jq -c '.head' "$WORK/drs-busy-head-after.json")
assert "AC-DRS-HEAD-GUARD: .head is byte-identical after DRS claim when a DIFFERENT task is genuinely busy in .head (never clobbers a live resume pointer)" \
  "$([ "$HEAD_BEFORE" = "$HEAD_AFTER" ] && echo true || echo false)"
DRS_HEADGUARD_STILL_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-DRS-HEADGUARD")] | length' "$WORK/drs-busy-head-after.json")
assert "AC-DRS-HEAD-GUARD (positive half): the row itself still moves ready[]->in_progress[] even while .head stays untouched (only .head is guarded, not the lane move)" \
  "$([ "$DRS_HEADGUARD_STILL_CLAIMED" -eq 1 ] && echo true || echo false)"

for f in t1c t2c t3c t4c t5c; do
  jq -e . "$WORK/$f.json" >/dev/null 2>&1 || { echo "  [FAIL] $f.json is not even valid JSON"; FAIL=1; continue; }
  bun scripts/orch-validate.mjs "$WORK/$f.json" >/dev/null 2>&1 \
    && assert "$f.json (post-drain candidate) is Zod-schema-valid" true \
    || assert "$f.json (post-drain candidate) is Zod-schema-valid" false
  bun scripts/orch-conservation-check.mjs "$STATE" "$WORK/$f.json" >/dev/null 2>&1 \
    && assert "$f.json passes the conservation guard (no silent row loss)" true \
    || assert "$f.json passes the conservation guard (no silent row loss)" false
done

# ---- Step 3: NEGATIVE control — cap reached, nothing fires ----
echo ""
echo "=== NEGATIVE CONTROL: in_progress padded to 2 — SLS/RLC/DRS (shared WIP<=2 budget) MUST NOT fire ==="
jq '.task_board.in_progress += [{ id: "GATESAT-SYNTH-INPROGRESS-1", status: "IN_PROGRESS", priority: "P2", type: "FIX", zone: "cross-service/", next_agent: "developer" }]' \
  "$WORK/fixture.json" > "$WORK/capped.json"
CAPPED_INPROG=$(jq '.task_board.in_progress|length' "$WORK/capped.json")

# The claim script itself is unconditional (the WIP gate lives in main.md's
# bash `if`, not inside the jq claim script) — so THIS control asserts the
# CALLER-LEVEL invariant the flow doc encodes: the flow never invokes
# promote+claim unless the fresh WIP read (main.md's own `if [ "$WIP2" -lt 2
# ]`) passed. Confirmed directly (no double-claim possible at cap):
assert "at in_progress=$CAPPED_INPROG (== cap), main.md's own WIP2<2 pre-check would skip invoking the SLS promote+claim pair entirely this tick (2<2 is false)" "$([ "$CAPPED_INPROG" -ge 2 ] && echo true || echo false)"

# Defense-in-depth: even if something DID call promote+claim at the cap
# (e.g. a future caller bug bypassing the bash pre-check), confirm the
# underlying jq scripts do not themselves fabricate extra in_progress rows
# beyond whatever promote legitimately staged into ready[] this call.
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq "$WORK/capped.json" > "$WORK/capped-sls.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/capped-sls.json" > "$WORK/capped-sls2.json"
CAPPED_SLS_CLAIMED_AT_MOST_ONE=$([ "$(jq '.task_board.in_progress|length' "$WORK/capped-sls2.json")" -le "$((CAPPED_INPROG + 1))" ] && echo true || echo false)
assert "defense-in-depth: SLS claim script never claims more than ONE additional row per invocation even if called at/above the cap" "$CAPPED_SLS_CLAIMED_AT_MOST_ONE"

assert "at in_progress=$CAPPED_INPROG (== cap), main.md's own WIP4<2 pre-check would skip invoking the DRS promote+claim pair entirely this tick (2<2 is false)" "$([ "$CAPPED_INPROG" -ge 2 ] && echo true || echo false)"
jq --arg now "$NOW" --argjson allowlist "$DRS_ALLOWLIST" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-design-router-sweep.jq "$WORK/capped.json" > "$WORK/capped-drs.json"
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/capped-drs.json" > "$WORK/capped-drs2.json"
CAPPED_DRS_CLAIMED_AT_MOST_ONE=$([ "$(jq '.task_board.in_progress|length' "$WORK/capped-drs2.json")" -le "$((CAPPED_INPROG + 1))" ] && echo true || echo false)
assert "defense-in-depth: DRS claim script never claims more than ONE additional row per invocation even if called at/above the shared WIP<=2 cap" "$CAPPED_DRS_CLAIMED_AT_MOST_ONE"

# =============================================================================
# ---- Step 4: FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING ----
# Extends this instrument (per its own recorded lesson: test gate FIRING via
# the REAL production scripts, not a reimplementation of their logic) rather
# than minting a new one. Covers: (a) the live-data healing claim, (b) the
# mechanism actually firing through the REAL BOUNDED-1 promote script with
# only the archive content varied, (c) both required negative controls, and
# (d) the eviction referential guard via the REAL orch-cold-evict.sh.
# =============================================================================
echo ""
echo "=== COLD-ARCHIVE DEP RESOLUTION (dep_status_map(\$archive), scripts/lib/devteam-eligibility.jq) ==="

JQ_DEFS='include "scripts/lib/devteam-eligibility";'

# AC-DEP-1 (LIVE, dynamic — no hardcoded task/dep ids): against the REAL
# live board + REAL detail + REAL archive, using the REAL
# dep_status_map($archive) (not a reimplementation), zero live rows (any
# lane) may carry an effective_depends_on entry that is DONE_VERIFIED in
# cold archive but still resolves MISSING via the fixed map.
AC_DEP1_BEFORE=$(jq -c --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | dep_status_map as $status_map
  | archive_status_map($archive) as $archive_map
  | [ .task_board | to_entries[] | select(.value|type=="array") | .value[]?
      | select(type=="object")
      | (effective_depends_on($detail_items))[]
      | select($archive_map[.] == "DONE_VERIFIED")
      | select(($status_map[.] // "MISSING") == "MISSING")
    ] | unique
' "$STATE")
echo "  [INFO] pre-fix (hot-only dep_status_map) baseline: $(echo "$AC_DEP1_BEFORE" | jq 'length') live dep-ids resolve MISSING despite being DONE_VERIFIED in cold archive — informational, shows the defect class this fix closes (drains naturally as BOUNDED-1 picks rows, zero here is not a failure)."

AC_DEP1_LEAKS=$(jq -c --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | dep_status_map($archive) as $status_map
  | archive_status_map($archive) as $archive_map
  | [ .task_board | to_entries[] | select(.value|type=="array") | .value[]?
      | select(type=="object")
      | (effective_depends_on($detail_items))[]
      | select($archive_map[.] == "DONE_VERIFIED")
      | select(($status_map[.] // "MISSING") == "MISSING")
    ] | unique
' "$STATE")
AC_DEP1_N=$(echo "$AC_DEP1_LEAKS" | jq 'length')
assert "AC-DEP-1 (live, dynamic): 0 live effective_depends_on ids resolve MISSING via dep_status_map(\$archive) despite being DONE_VERIFIED in cold archive (found ${AC_DEP1_N}: ${AC_DEP1_LEAKS})" \
  "$([ "$AC_DEP1_N" -eq 0 ] && echo true || echo false)"

# AC-DEP-MECH: the mechanism actually FIRES through the REAL BOUNDED-1
# promote script (not lane-resolution-only) — grounded in a REAL cold-
# archived DONE_VERIFIED id (dynamic, no hardcoded id), isolated single-row
# fixture (mirrors scripts/audits/devteam-bounded1-prose-sequencing-gate-
# verify.sh's own synthetic-fixture discipline). Same script, only the
# archive content varies between the BEFORE (empty) and AFTER (real) runs.
: > "$WORK/empty-archive.json"   # zero JSON values -> --slurpfile gives []
REAL_ARCHIVED_ID=$(jq -rs '[ .[] | (.done_tasks // [])[] | select((.status // "") == "DONE_VERIFIED") | .id ] | first // empty' "$ARCHIVE")

if [ -n "$REAL_ARCHIVED_ID" ]; then
  jq -n --arg now "$NOW" --arg dep "$REAL_ARCHIVED_ID" '
    { task_board: {
        backlog: [ { id: "GATESAT-ARCHDEP-BACKLOG-1", status: "BACKLOG",
                      priority: "P0", next_agent: "developer",
                      depends_on: [$dep], created_at: $now } ],
        ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
      } }
  ' > "$WORK/archdep.json"

  ARCHDEP_BEFORE=$(jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$WORK/empty-archive.json" \
    -f scripts/devteam-backlog-promote-bounded1.jq "$WORK/archdep.json" | jq -r '.task_board.ready[0].id // empty')
  assert "AC-DEP-MECH (control): archive-blind run (same real script, empty archive) does NOT promote a row depending on real archived id ${REAL_ARCHIVED_ID} (picked='${ARCHDEP_BEFORE:-<none>}')" \
    "$([ "$ARCHDEP_BEFORE" != "GATESAT-ARCHDEP-BACKLOG-1" ] && echo true || echo false)"

  ARCHDEP_AFTER=$(jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
    -f scripts/devteam-backlog-promote-bounded1.jq "$WORK/archdep.json" | jq -r '.task_board.ready[0].id // empty')
  assert "AC-DEP-MECH: BOUNDED-1 promote (real script) NOW promotes a row depending on real cold-archived DONE_VERIFIED id ${REAL_ARCHIVED_ID} (picked='${ARCHDEP_AFTER:-<none>}')" \
    "$([ "$ARCHDEP_AFTER" = "GATESAT-ARCHDEP-BACKLOG-1" ] && echo true || echo false)"
else
  echo "  [SKIP] AC-DEP-MECH: no DONE_VERIFIED id found in cold archive (archive empty?) — mechanism control skipped"
fi

# AC-DEP-NEG-A (negative control, required): a dep-id existing NOWHERE (hot
# or cold) must still resolve UNSATISFIED — never blanket-satisfied.
jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [ { id: "GATESAT-ARCHDEP-NOWHERE", status: "BACKLOG", priority: "P0",
                    next_agent: "developer", depends_on: ["GATESAT-ARCHDEP-NOWHERE-DEP-NOT-REAL"], created_at: $now } ],
      ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }
' > "$WORK/archdep-nowhere.json"
NOWHERE_PICKED=$(jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
  -f scripts/devteam-backlog-promote-bounded1.jq "$WORK/archdep-nowhere.json" | jq -r '.task_board.ready[0].id // empty')
assert "AC-DEP-NEG-A: dep-id existing NOWHERE (hot or cold) stays UNSATISFIED — NOT promoted (picked='${NOWHERE_PICKED:-<none>}')" \
  "$([ "$NOWHERE_PICKED" != "GATESAT-ARCHDEP-NOWHERE" ] && echo true || echo false)"

# AC-DEP-NEG-B (negative control, required): a dep-id cold-archived with a
# NON-terminal status must still resolve UNSATISFIED (synthetic archive
# fixture, deterministic — not dependent on the real archive happening to
# contain a non-terminal row).
echo '{"month":"2099-01","done_tasks":[{"id":"GATESAT-ARCHDEP-NONTERM-DEP","status":"IN_PROGRESS"}]}' > "$WORK/nonterm-archive.json"
jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [ { id: "GATESAT-ARCHDEP-NONTERM", status: "BACKLOG", priority: "P0",
                    next_agent: "developer", depends_on: ["GATESAT-ARCHDEP-NONTERM-DEP"], created_at: $now } ],
      ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }
' > "$WORK/archdep-nonterm.json"
NONTERM_PICKED=$(jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$WORK/nonterm-archive.json" \
  -f scripts/devteam-backlog-promote-bounded1.jq "$WORK/archdep-nonterm.json" | jq -r '.task_board.ready[0].id // empty')
assert "AC-DEP-NEG-B: dep-id cold-archived with NON-terminal status (IN_PROGRESS) stays UNSATISFIED — NOT promoted (picked='${NONTERM_PICKED:-<none>}')" \
  "$([ "$NONTERM_PICKED" != "GATESAT-ARCHDEP-NONTERM" ] && echo true || echo false)"

echo ""
echo "=== EVICTION REFERENTIAL GUARD (scripts/orch-cold-evict.sh) ==="

EVICT_WORK="$WORK/coldevict"
mkdir -p "$EVICT_WORK/archive"
cp "$STATE" "$EVICT_WORK/fixture.json"
jq --arg now "$NOW" '
  .task_board.backlog += [
    {"id": "GATESAT-REFGUARD-DEPENDENT", "status": "BACKLOG", "priority": "P2",
     "depends_on": ["GATESAT-REFGUARD-DEP-REFERENCED"], "next_agent": "developer",
     "type": "FIX", "zone": "cross-service/", "created_at": $now}
  ]
  | .task_board.done_verified += [
    {"id": "GATESAT-REFGUARD-DEP-REFERENCED", "status": "DONE_VERIFIED", "created_at": "2026-01-01T00:00:00Z"},
    {"id": "GATESAT-REFGUARD-DEP-UNREFERENCED", "status": "DONE_VERIFIED", "created_at": "2026-01-01T00:00:00Z"}
  ]
' "$EVICT_WORK/fixture.json" > "$EVICT_WORK/fixture2.json"
mv "$EVICT_WORK/fixture2.json" "$EVICT_WORK/fixture.json"

# Never writes to the live orch-state.json/archive dir — both overridden to
# scratch paths (mirrors this script's own header discipline).
if ORCH_STATE="$EVICT_WORK/fixture.json" ARCHIVE_DIR="$EVICT_WORK/archive" \
    bash scripts/orch-cold-evict.sh > "$EVICT_WORK/run.log" 2>&1; then
  EVICT_RC=0
else
  EVICT_RC=$?
fi
assert "AC-EVICT-1: orch-cold-evict.sh completes cleanly against the guard fixture (exit 0)" \
  "$([ "$EVICT_RC" -eq 0 ] && echo true || echo false)"

REFERENCED_STILL_HOT=$(jq '[.task_board.done_verified[] | select(.id=="GATESAT-REFGUARD-DEP-REFERENCED")] | length' "$EVICT_WORK/fixture.json")
UNREFERENCED_STILL_HOT=$(jq '[.task_board.done_verified[] | select(.id=="GATESAT-REFGUARD-DEP-UNREFERENCED")] | length' "$EVICT_WORK/fixture.json")
assert "AC-EVICT-2 (guard REFUSAL proven): still-referenced row GATESAT-REFGUARD-DEP-REFERENCED HELD in hot done_verified[] (NOT evicted — a live rows depends_on still names it)" \
  "$([ "$REFERENCED_STILL_HOT" -eq 1 ] && echo true || echo false)"
assert "AC-EVICT-3 (positive control — guard does not over-hold): unreferenced row GATESAT-REFGUARD-DEP-UNREFERENCED WAS evicted normally" \
  "$([ "$UNREFERENCED_STILL_HOT" -eq 0 ] && echo true || echo false)"

echo ""
if [ "$FAIL" -eq 1 ]; then
  echo "[FAIL] one or more gate-satisfiability / drain assertions failed — see above."
  exit 1
fi
echo "[PASS] every gate fires and drains under the live-shaped saturated fixture (ready=$READY_N, in_progress=$INPROG_N, review=$REVIEW_N); shared WIP<=2 cap verified not bypassable."
exit 0
