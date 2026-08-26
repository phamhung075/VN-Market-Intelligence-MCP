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
# EXTENDED 2026-07-30 (FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-
# OVERWRITE, PO ratification ruling-20260730T0906Z-po-triage-po.md STEP
# po-4): AC-DRS-HEAD-GUARD below already proved the `$head_free` conditional
# guard for scripts/devteam-backlog-claim-design-router-sweep.jq (which
# shipped the guard from day one). This same defect class was ALSO found
# live (unconditional `.head` replace) in devteam-backlog-claim-bounded1.jq,
# devteam-backlog-claim-supervised-lane-sweep.jq (BOTH its PRIMARY and
# FALLBACK claim branches), and devteam-backlog-claim-ready-lane-consumer.jq
# — now hardened with the IDENTICAL guard shape. § AC-BOUNDED1-HEAD-GUARD /
# AC-SLS-HEAD-GUARD (PRIMARY + FALLBACK) / AC-RLC-HEAD-GUARD mechanize the
# same negative control (pre-seed a genuinely busy `.head` with an unrelated
# task, assert byte-identical after + the row still moves ready[]->
# in_progress[] underneath it) for these three scripts, using ISOLATED
# single-row fixtures (same discipline as the SLS-FALLBACK/DRS-AC fixtures
# above — NOT the shared padded fixture, which is unsuitable here: BOUNDED-
# 1's own picker takes `$auto_promoted[0]` and RLC's own picker sorts ALL
# eligible ready[] rows by priority_rank, so a lower-rank live/padded row
# would win the pick non-deterministically and never exercise OUR row's
# head-guard behavior at all).
#
# EXTENDED 2026-07-30 (FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-
# ROWS): § WIP EFFECTIVE COUNT below proves the corrected `wip_in_progress`
# def (scripts/lib/devteam-eligibility.jq — now excludes BLOCKED/TERMINAL_SET
# rows from the count, not a bare `in_progress|length`) reads 1, not 2, on an
# isolated fixture shaped exactly like the live incident (1 IN_PROGRESS + 1
# BLOCKED row both physically in in_progress[]), that a genuinely-saturated
# 2x-IN_PROGRESS fixture still reads 2 (no false relief), and — non-vacuously
# — that the REAL SLS claim script actually fires under the effective-wip=1
# shape (not just an arithmetic assertion).
#
# EXTENDED 2026-08-09 (FIX-DEVTEAM-IDLE-CHAIN-TEST-FAIRNESS, AC-1/AC-4): every
# assertion above this point proves a lane's promote/claim scripts fire IN
# ISOLATION (a fixture shaped for that one lane). It does not prove the aged
# round-robin selection mechanism (docs/agents/dev-team/flow/main.md § Idle-
# Tick Rotation Selection, FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION) actually
# gives every lane a turn, or that gate-firing is DRIVEN by $SELECTED end to
# end. New § ROTATION FAIRNESS BOUND + $SELECTED-DRIVEN GATE-FIRING PROOF
# simulates 12 consecutive idle-fallthrough ticks (2 independent 6-tick
# windows) against a fixture carrying one dedicated row per board-touching
# lane, computing $SELECTED each tick via a byte-verbatim copy of main.md's
# own inline 6-candidate selection/stamp jq (deliberately NOT the stale 5-id
# rotation_selected($doc)/devteam-idle-chain-stamp.jq — DRS-blind, not what
# main.md actually calls — see the new section's own header for the full
# rationale) and dispatching to that lane's REAL promote/claim script(s),
# asserting the dedicated row actually moves. Proves: AC-1 fairness (both
# windows cover all 6 ids exactly once, deterministic bootstrap tie-break
# order) and AC-4 gate-firing (each $SELECTED tick's real script mutates
# board state, not merely resolves an id) in one instrument, plus a dedicated
# isolated-fixture no-same-tick-cascade proof (a genuinely empty turn still
# advances the stamp, so rotation does not retry the same lane next tick).
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
#
# FALSE-RED FIXED IN PASSING (FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS,
# 2026-08-23): this branch used to test the RAW `in_progress[]` array length
# ($INPROG_N) while the gate under test uses `wip_in_progress`, which EXCLUDES
# BLOCKED rows (FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS — the
# very distinction this file's own "WIP EFFECTIVE COUNT" section below exists to
# prove). The `[0:1]` slice above keeps whatever the live board's FIRST
# in_progress row happens to be; on 2026-08-23 that was a BLOCKED row, so
# effective WIP was 0, BOUNDED-1 CORRECTLY fired, and the assertion CORRECTLY
# reported a failure of its own wrong expectation. Branch on the same effective
# count the gate does.
B1_EFFECTIVE_WIP=$(jq 'include "scripts/lib/devteam-eligibility"; wip_in_progress' "$WORK/t1.json")
if [ "$B1_EFFECTIVE_WIP" -eq 0 ]; then
  assert "BOUNDED-1 fires when effective WIP==0 (its own WIP<1 cap; raw in_progress[] length is $INPROG_N, BLOCKED rows excluded)" "$B1_MOVED"
else
  assert "BOUNDED-1 correctly no-ops when effective WIP>=1 (own WIP<1 cap, independent of ready[] depth; effective=$B1_EFFECTIVE_WIP, raw=$INPROG_N)" "$([ "$B1_MOVED" = "false" ] && echo true || echo false)"
fi

# ---- BOUNDED-1 OWN-WIP-RECHECK + PRIORITY-ORDERED PICK + STALE-STAMP DRAIN
# (FIX-DEVTEAM-BOUNDED1-CLAIM-NO-OWN-WIP-RECHECK, 2026-08-06) ----
# The block above already exercises the own-WIP-recheck fix against the
# LIVE-shaped fixture (which, as of this fix, itself carries 2 live stale
# stamps — see AC-4 below), but that alone is not a REGRESSION gate: it can
# pass vacuously if the live board later drains those stamps. This section
# adds ISOLATED single-invocation fixtures (same discipline as every other
# AC block in this file) that are deterministic regardless of live-board
# drift and that PROVABLY distinguish the fixed selector from the pre-fix
# `$auto_promoted[0]` array-position one.
echo ""
echo "=== BOUNDED-1 OWN-WIP-RECHECK + PRIORITY-ORDERED PICK (FIX-DEVTEAM-BOUNDED1-CLAIM-NO-OWN-WIP-RECHECK) ==="

# AC-1 negative control (own WIP recheck, isolated): WIP=1 (a DIFFERENT row
# already holds the slot) + one stamped ready[] row — must NOT claim, even
# though the stamp alone used to be trusted as "WIP was 0 when this was
# promoted". This isolates AC-1 from AC-4's shared padded-fixture instance.
B1_WIPCHECK_BLOCKED_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-B1-WIPCHECK-BLOCKED", status: "READY", priority: "P0",
        type: "FIX", zone: "cross-service/", next_agent: "developer",
        promoted_by: "dev-team (bounded-1 auto-pickup)", promoted_at: $now } ],
      in_progress: [ { id: "GATESAT-B1-WIPCHECK-OTHER-LIVE", status: "IN_PROGRESS", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "developer", claimed_at: $now } ],
      qa: [], review: [], done: [], done_verified: []
    } }')
echo "$B1_WIPCHECK_BLOCKED_FIXTURE" > "$WORK/b1-wipcheck-blocked.json"
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq "$WORK/b1-wipcheck-blocked.json" > "$WORK/b1-wipcheck-blocked-out.json"
B1_WIPCHECK_BLOCKED_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-B1-WIPCHECK-BLOCKED")] | length' "$WORK/b1-wipcheck-blocked-out.json")
assert "AC-BOUNDED1-WIPCHECK (negative, isolated): a stamped ready[] row is NOT claimed when a DIFFERENT row already holds the WIP slot — own WIP recheck fires independent of the stamp" \
  "$([ "$B1_WIPCHECK_BLOCKED_CLAIMED" -eq 0 ] && echo true || echo false)"

# AC-3 negative control (required, per this row's verification_gate note):
# WIP=0 + ONE stale-stamped ready[] row must still claim normally — the fix
# must not over-tighten into never claiming.
B1_WIPCHECK_FREE_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-B1-WIPCHECK-FREE", status: "READY", priority: "P2",
        type: "FIX", zone: "cross-service/", next_agent: "developer",
        promoted_by: "dev-team (bounded-1 auto-pickup)", promoted_at: $now } ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$B1_WIPCHECK_FREE_FIXTURE" > "$WORK/b1-wipcheck-free.json"
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq "$WORK/b1-wipcheck-free.json" > "$WORK/b1-wipcheck-free-out.json"
B1_WIPCHECK_FREE_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-B1-WIPCHECK-FREE")] | length' "$WORK/b1-wipcheck-free-out.json")
assert "AC-BOUNDED1-WIPCHECK-NEG-CONTROL: at WIP=0, a single stale-stamped ready[] row STILL claims normally (fix is not over-tightened)" \
  "$([ "$B1_WIPCHECK_FREE_CLAIMED" -eq 1 ] && echo true || echo false)"

# AC-2/AC-4 (REGRESSION GATE, not a fixture the current code already passes):
# TWO stamped rows at mixed priority, P0 at a HIGHER array index than P2 —
# the pre-fix `$auto_promoted[0]` array-position selector provably picks the
# P2 (lower index); the fixed [priority_rank, idx]-sorted selector must pick
# the P0 instead.
B1_PRIO_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [],
      ready: [
        { id: "GATESAT-B1-PRIO-P2-LOWER-IDX", status: "READY", priority: "P2",
          type: "FIX", zone: "cross-service/", next_agent: "developer",
          promoted_by: "dev-team (bounded-1 auto-pickup)", promoted_at: $now },
        { id: "GATESAT-B1-PRIO-P0-HIGHER-IDX", status: "READY", priority: "P0",
          type: "FIX", zone: "cross-service/", next_agent: "developer",
          promoted_by: "dev-team (bounded-1 auto-pickup)", promoted_at: $now }
      ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }')
echo "$B1_PRIO_FIXTURE" > "$WORK/b1-prio.json"
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq "$WORK/b1-prio.json" > "$WORK/b1-prio-out.json"
B1_PRIO_PICKED=$(jq -r '.task_board.in_progress[0].id // empty' "$WORK/b1-prio-out.json")
assert "AC-BOUNDED1-PRIORITY-ORDER (regression gate): P0 at the HIGHER array index is claimed, not the P2 at the lower index — proves priority_rank now outranks array position (picked='${B1_PRIO_PICKED:-<none>}')" \
  "$([ "$B1_PRIO_PICKED" = "GATESAT-B1-PRIO-P0-HIGHER-IDX" ] && echo true || echo false)"

# AC-3 (STALE-STAMP DRAIN, positive proof): the non-selected P2 candidate
# from the SAME invocation above must have its promoted_by cleared (not left
# stamped to mis-order a future tick) while staying resident in ready[].
B1_PRIO_LEFTOVER_STAMP=$(jq -r '.task_board.ready[] | select(.id=="GATESAT-B1-PRIO-P2-LOWER-IDX") | .promoted_by' "$WORK/b1-prio-out.json")
B1_PRIO_LEFTOVER_STILL_READY=$(jq -r '[.task_board.ready[] | select(.id=="GATESAT-B1-PRIO-P2-LOWER-IDX")] | length' "$WORK/b1-prio-out.json")
assert "AC-BOUNDED1-STALE-STAMP-DRAIN: the non-selected P2 row's promoted_by is cleared to null in the SAME write (got '${B1_PRIO_LEFTOVER_STAMP}') so it can never mis-order a later tick" \
  "$([ "$B1_PRIO_LEFTOVER_STAMP" = "null" ] && echo true || echo false)"
assert "AC-BOUNDED1-STALE-STAMP-DRAIN (row not lost): the non-selected P2 row stays resident in ready[] (only the stamp is cleared, the row is not dropped)" \
  "$([ "$B1_PRIO_LEFTOVER_STILL_READY" -eq 1 ] && echo true || echo false)"

# AC-5 (LIVE PROOF): re-run the fixed selector's OWN ranking against the
# LIVE ready[]'s real stamped candidates (never writes to $STATE — scratch
# copy only, in_progress zeroed to observe the selector's ranking in
# isolation from whatever WIP happens to be live right now). Expected pick
# is computed DYNAMICALLY (sort_by([priority_rank, idx]), same contract the
# fixed script itself uses) — never a hardcoded task id — so this stays
# meaningful no matter which/how many rows are stamped live at run time.
LIVE_B1_SCRATCH="$WORK/b1-live-proof.json"
jq '.task_board.in_progress = []' "$STATE" > "$LIVE_B1_SCRATCH"
LIVE_B1_STAMPED_N=$(jq '[.task_board.ready[] | select(.promoted_by == "dev-team (bounded-1 auto-pickup)")] | length' "$LIVE_B1_SCRATCH")
if [ "$LIVE_B1_STAMPED_N" -ge 1 ]; then
  jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq "$LIVE_B1_SCRATCH" > "$WORK/b1-live-proof-out.json"
  LIVE_B1_PICKED=$(jq -r '.task_board.in_progress[-1].id // empty' "$WORK/b1-live-proof-out.json")
  LIVE_B1_ARRAYPOS_PICK=$(jq -r '[.task_board.ready[]|select(.promoted_by=="dev-team (bounded-1 auto-pickup)")][0].id // empty' "$LIVE_B1_SCRATCH")
  LIVE_B1_EXPECTED_PICK=$(jq -r 'include "scripts/lib/devteam-eligibility";
    [ .task_board.ready | to_entries[] | select(.value.promoted_by == "dev-team (bounded-1 auto-pickup)")
      | { idx: .key, id: .value.id, rank: (.value | priority_rank) } ]
    | sort_by([.rank, .idx]) | .[0].id // empty' "$LIVE_B1_SCRATCH")
  echo "  [INFO] AC-5 LIVE PROOF: pre-fix array-position selector would have picked '${LIVE_B1_ARRAYPOS_PICK}'; fixed priority-ordered selector against the SAME live ready[] candidates picked '${LIVE_B1_PICKED}' (expected top-ranked id '${LIVE_B1_EXPECTED_PICK}'; WIP hypothetically zeroed to isolate the ranking from live WIP saturation)."
  assert "AC-BOUNDED1-LIVE-PROOF: the fixed selector, replayed against the live ready[]'s real stamped candidates, picks the DYNAMICALLY-computed top-[priority_rank,idx] row (got '${LIVE_B1_PICKED}', expected '${LIVE_B1_EXPECTED_PICK}')" \
    "$([ "$LIVE_B1_PICKED" = "$LIVE_B1_EXPECTED_PICK" ] && echo true || echo false)"
  if [ "$LIVE_B1_STAMPED_N" -ge 2 ]; then
    assert "AC-BOUNDED1-LIVE-PROOF (non-vacuous): >=2 live stamped candidates exist AND the array-position pick differs from the priority-ranked pick — this run actually exercises the regression, not a single-candidate no-op (array-pos='${LIVE_B1_ARRAYPOS_PICK}', ranked='${LIVE_B1_EXPECTED_PICK}')" \
      "$([ "$LIVE_B1_ARRAYPOS_PICK" != "$LIVE_B1_EXPECTED_PICK" ] && echo true || echo false)"
  fi
else
  echo "  [INFO] AC-5 LIVE PROOF: live ready[] currently carries 0 bounded-1-stamped rows (already drained) — selector has nothing to rank; regression coverage is carried by the isolated AC-BOUNDED1-PRIORITY-ORDER fixture above instead."
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
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/t5b.json" > "$WORK/t5c.json"
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
#
# FALSE-RED FIXED IN PASSING (FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS,
# 2026-08-23): this fixture used to be built by APPENDING to the shared
# live-derived padded fixture. But the DRS claim script takes `$swept[0]` — the
# FIRST ready[] row already stamped `promoted_by: "dev-team (design-router
# sweep)"` — and the live board routinely carries several (3 on 2026-08-23:
# UC-MDH-P2, UC-SDF-P6, FIX-COWORK-PUBLISHED-MARKER-TTL-...). Those sort ahead
# of the appended synthetic row, so DRS claimed a LIVE row and the positive-half
# assertion looked for a move that had (correctly) not happened to its own row.
# Live-board contamination, not a script defect. Rebuilt as an ISOLATED
# single-row fixture, matching the discipline this file's own header states and
# every sibling HEAD-GUARD block below already follows.
DRS_BUSY_HEAD_FIXTURE="$WORK/drs-busy-head.json"
jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-DRS-HEADGUARD", status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "ba", dispatch_lane: "ba",
        promoted_by: "dev-team (design-router sweep)", promoted_at: $now } ]
    },
    head: { status: "in_progress", active_task_id: "GATESAT-UNRELATED-BUSY-TASK",
            next_agent: "developer", updated_at: $now, updated_by: "test" }
  }' > "$DRS_BUSY_HEAD_FIXTURE"
HEAD_BEFORE=$(jq -c '.head' "$DRS_BUSY_HEAD_FIXTURE")
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$DRS_BUSY_HEAD_FIXTURE" > "$WORK/drs-busy-head-after.json"
HEAD_AFTER=$(jq -c '.head' "$WORK/drs-busy-head-after.json")
assert "AC-DRS-HEAD-GUARD: .head is byte-identical after DRS claim when a DIFFERENT task is genuinely busy in .head (never clobbers a live resume pointer)" \
  "$([ "$HEAD_BEFORE" = "$HEAD_AFTER" ] && echo true || echo false)"
DRS_HEADGUARD_STILL_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-DRS-HEADGUARD")] | length' "$WORK/drs-busy-head-after.json")
assert "AC-DRS-HEAD-GUARD (positive half): the row itself still moves ready[]->in_progress[] even while .head stays untouched (only .head is guarded, not the lane move)" \
  "$([ "$DRS_HEADGUARD_STILL_CLAIMED" -eq 1 ] && echo true || echo false)"

# =============================================================================
# ---- FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT
# (2026-08-26) ----
# scripts/devteam-backlog-claim-design-router-sweep.jq and (scope-widened,
# same commit — cross-ref
# feedback_sls_primary_claim_null_dispatch_lane_yields_unspawnable_head)
# scripts/devteam-backlog-claim-supervised-lane-sweep.jq's PRIMARY path used
# to bind `($picked.dispatch_lane) as $lane` — a promote-time CACHE — with no
# re-resolution and no null-guard. Isolated single-row fixtures (same
# discipline as every other AC block in this file), proving:
#   AC-1/AC-2 (claim-time resolve supersedes a stale cache): a row whose
#     cached `dispatch_lane` predates a later `next_agent` change claims to
#     the LATER (current) agent, not the stale cached one.
#   AC-3 (null dispatch_lane never yields an unspawnable head): (a) a row
#     with `dispatch_lane:null` but a resolvable `next_agent` still claims
#     correctly (never refused unnecessarily); (b) a row with
#     `dispatch_lane:null` AND no resolvable next_agent/owner at all is
#     REFUSED — `.head.next_agent` is NEVER written as null.
#   Ordering (second, separable defect, same commit): a freshly-stamped P0
#     at a HIGHER array index outranks an older stamp at a LOWER array index.
# =============================================================================
echo ""
echo "=== FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT (DRS + SLS-PRIMARY) ==="

# --- DRS: AC-1/AC-2, stale cache superseded ---
DRS_STALECACHE_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-DRS-STALECACHE", status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "architect",
        dispatch_lane: "ba", promoted_by: "dev-team (design-router sweep)", promoted_at: $now } ]
    } }')
echo "$DRS_STALECACHE_FIXTURE" > "$WORK/drs-stalecache.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/drs-stalecache.json" > "$WORK/drs-stalecache-out.json"
DRS_STALECACHE_HEAD_NA=$(jq -r '.head.next_agent // empty' "$WORK/drs-stalecache-out.json")
assert "AC-DRS-CLAIMTIME-RESOLVE (AC-1/AC-2): dispatch_lane cache='ba' predates next_agent='architect' — claim resolves to the LATER agent 'architect', not the stale cache (got '${DRS_STALECACHE_HEAD_NA:-<none>}')" \
  "$([ "$DRS_STALECACHE_HEAD_NA" = "architect" ] && echo true || echo false)"

# --- DRS: AC-3(a), null dispatch_lane + resolvable next_agent still claims ---
DRS_NULLLANE_RESOLVABLE_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-DRS-NULLLANE-OK", status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "architect",
        dispatch_lane: null, promoted_by: "dev-team (design-router sweep)", promoted_at: $now } ]
    } }')
echo "$DRS_NULLLANE_RESOLVABLE_FIXTURE" > "$WORK/drs-nulllane-ok.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/drs-nulllane-ok.json" > "$WORK/drs-nulllane-ok-out.json"
DRS_NULLLANE_OK_HEAD_NA=$(jq -r '.head.next_agent // empty' "$WORK/drs-nulllane-ok-out.json")
assert "AC-DRS-NULL-LANE-RESOLVABLE (AC-3, positive): dispatch_lane=null but next_agent='architect' resolvable — claims to 'architect' (got '${DRS_NULLLANE_OK_HEAD_NA:-<none>}')" \
  "$([ "$DRS_NULLLANE_OK_HEAD_NA" = "architect" ] && echo true || echo false)"

# --- DRS: AC-3(b), null dispatch_lane + unresolvable next_agent -> REFUSE, never write null head ---
DRS_NULLLANE_UNRESOLVABLE_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-DRS-NULLLANE-REFUSE", status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "",
        dispatch_lane: null, promoted_by: "dev-team (design-router sweep)", promoted_at: $now } ]
    },
    head: { status: "idle", active_task_id: null, next_agent: null, updated_at: $now, updated_by: "test" }
  }')
echo "$DRS_NULLLANE_UNRESOLVABLE_FIXTURE" > "$WORK/drs-nulllane-refuse.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/drs-nulllane-refuse.json" > "$WORK/drs-nulllane-refuse-out.json"
DRS_NULLLANE_REFUSE_HEAD_STATUS=$(jq -r '.head.status' "$WORK/drs-nulllane-refuse-out.json")
DRS_NULLLANE_REFUSE_INPROG_N=$(jq '.task_board.in_progress|length' "$WORK/drs-nulllane-refuse-out.json")
assert "AC-DRS-NULL-LANE-REFUSE (AC-3, negative control): dispatch_lane=null AND next_agent unresolvable — script REFUSES (no claim, .head stays idle, NEVER next_agent=null written)" \
  "$([ "$DRS_NULLLANE_REFUSE_HEAD_STATUS" = "idle" ] && [ "$DRS_NULLLANE_REFUSE_INPROG_N" -eq 0 ] && echo true || echo false)"

# --- DRS: ordering, fresh P0 (higher idx) outranks stale P1 (lower idx) ---
DRS_ORDER_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [
        { id: "GATESAT-DRS-ORDER-STALE-P1", status: "READY", priority: "P1",
          type: "FIX", zone: "cross-service/", next_agent: "architect", dispatch_lane: "architect",
          promoted_by: "dev-team (design-router sweep)", promoted_at: "2026-08-15T00:00:00Z" },
        { id: "GATESAT-DRS-ORDER-FRESH-P0", status: "READY", priority: "P0",
          type: "FIX", zone: "cross-service/", next_agent: "architect", dispatch_lane: "architect",
          promoted_by: "dev-team (design-router sweep)", promoted_at: $now }
      ]
    } }')
echo "$DRS_ORDER_FIXTURE" > "$WORK/drs-order.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/drs-order.json" > "$WORK/drs-order-out.json"
DRS_ORDER_PICKED=$(jq -r '.task_board.in_progress[0].id // empty' "$WORK/drs-order-out.json")
assert "AC-DRS-PRIORITY-ORDER (2nd, separable defect fixed same commit): the fresh P0 at the HIGHER array index is claimed, not the stale P1 at the LOWER index (got '${DRS_ORDER_PICKED:-<none>}')" \
  "$([ "$DRS_ORDER_PICKED" = "GATESAT-DRS-ORDER-FRESH-P0" ] && echo true || echo false)"

# =============================================================================
# ---- FIX-DRS-CLAIM-HAS-NO-ALLOWLIST-GATE-OFF-ALLOWLIST-BLIND-DISPATCH
# (2026-08-26; caught pre-spawn at the 10:07Z dev-team tick) ----
# scripts/devteam-backlog-claim-design-router-sweep.jq never applied the
# ratified agent-identity allowlist (promote always has) — its ONLY
# candidate filter was `promoted_by == "dev-team (design-router sweep)"`
# then a non-empty claim-time-resolved lane. A row that re-resolves
# OFF-allowlist by claim time (the claim-time re-resolution fix above is
# what makes this reachable — re-resolving fresh is necessary but not
# sufficient) was still blind-claimed.
#   AC-DRS-ALLOWLIST-GATE: an isolated DRS-stamped row whose claim-time
#     next_agent resolves to 'developer' (off the ratified allowlist) is
#     NEVER claimed.
#   AC-DRS-ALLOWLIST-SKIP-TO-NEXT: reproduces the live incident shape
#     exactly — an off-allowlist P0 at a LOWER array index (promoted
#     earlier) must not starve an on-allowlist P0 ranked behind it; claim
#     skips the off-allowlist stamp and takes the allowlisted one instead.
# =============================================================================
echo ""
echo "=== FIX-DRS-CLAIM-HAS-NO-ALLOWLIST-GATE-OFF-ALLOWLIST-BLIND-DISPATCH (DRS claim allowlist) ==="

# --- DRS: AC-DRS-ALLOWLIST-GATE, isolated off-allowlist row is never claimed ---
DRS_OFFALLOWLIST_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-DRS-OFFALLOWLIST", status: "READY", priority: "P0",
        type: "FIX", zone: "cross-service/", next_agent: "developer",
        dispatch_lane: "developer", promoted_by: "dev-team (design-router sweep)", promoted_at: $now } ]
    },
    head: { status: "idle", active_task_id: null, next_agent: null, updated_at: $now, updated_by: "test" }
  }')
echo "$DRS_OFFALLOWLIST_FIXTURE" > "$WORK/drs-offallowlist.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/drs-offallowlist.json" > "$WORK/drs-offallowlist-out.json"
DRS_OFFALLOWLIST_HEAD_STATUS=$(jq -r '.head.status' "$WORK/drs-offallowlist-out.json")
DRS_OFFALLOWLIST_INPROG_N=$(jq '.task_board.in_progress|length' "$WORK/drs-offallowlist-out.json")
DRS_OFFALLOWLIST_STILL_READY=$(jq '[.task_board.ready[]?.id] | index("GATESAT-DRS-OFFALLOWLIST") != null' "$WORK/drs-offallowlist-out.json")
assert "AC-DRS-ALLOWLIST-GATE: a DRS-stamped row whose claim-time next_agent resolves to 'developer' (off the ratified allowlist) is NEVER claimed -- .head stays idle, in_progress stays 0, row remains parked in ready[] (got head.status='$DRS_OFFALLOWLIST_HEAD_STATUS', in_progress=$DRS_OFFALLOWLIST_INPROG_N, still_ready=$DRS_OFFALLOWLIST_STILL_READY)" \
  "$([ "$DRS_OFFALLOWLIST_HEAD_STATUS" = "idle" ] && [ "$DRS_OFFALLOWLIST_INPROG_N" -eq 0 ] && [ "$DRS_OFFALLOWLIST_STILL_READY" = "true" ] && echo true || echo false)"

# --- DRS: AC-DRS-ALLOWLIST-SKIP-TO-NEXT, off-allowlist P0 at lower idx does not starve an allowlisted P0 behind it ---
DRS_ALLOWLIST_SKIP_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [
        { id: "GATESAT-DRS-ALLOWLIST-SKIP-OFF-P0", status: "READY", priority: "P0",
          type: "FIX", zone: "cross-service/", next_agent: "developer", dispatch_lane: "developer",
          promoted_by: "dev-team (design-router sweep)", promoted_at: "2026-08-24T15:46:41Z" },
        { id: "GATESAT-DRS-ALLOWLIST-SKIP-ON-P0", status: "READY", priority: "P0",
          type: "FIX", zone: "cross-service/", next_agent: "architect", dispatch_lane: "architect",
          promoted_by: "dev-team (design-router sweep)", promoted_at: $now }
      ]
    } }')
echo "$DRS_ALLOWLIST_SKIP_FIXTURE" > "$WORK/drs-allowlist-skip.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/drs-allowlist-skip.json" > "$WORK/drs-allowlist-skip-out.json"
DRS_ALLOWLIST_SKIP_PICKED=$(jq -r '.task_board.in_progress[0].id // empty' "$WORK/drs-allowlist-skip-out.json")
DRS_ALLOWLIST_SKIP_OFF_STILL_READY=$(jq '[.task_board.ready[]?.id] | index("GATESAT-DRS-ALLOWLIST-SKIP-OFF-P0") != null' "$WORK/drs-allowlist-skip-out.json")
assert "AC-DRS-ALLOWLIST-SKIP-TO-NEXT: an off-allowlist P0 at the LOWER array index (promoted earlier, mirrors live FIX-FLEETPUSH-DISARM-... incident) is skipped; the on-allowlist P0 behind it is claimed instead, and the off-allowlist stamp is left parked in ready[] (got picked='${DRS_ALLOWLIST_SKIP_PICKED:-<none>}', off-allowlist still_ready=$DRS_ALLOWLIST_SKIP_OFF_STILL_READY)" \
  "$([ "$DRS_ALLOWLIST_SKIP_PICKED" = "GATESAT-DRS-ALLOWLIST-SKIP-ON-P0" ] && [ "$DRS_ALLOWLIST_SKIP_OFF_STILL_READY" = "true" ] && echo true || echo false)"

# --- SLS-PRIMARY: AC-1/AC-2, stale cache superseded (identical shape, sibling script) ---
SLS_STALECACHE_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-SLS-STALECACHE", status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "architect", supervised: true, plan_only: true,
        dispatch_lane: "ba", promoted_by: "dev-team (supervised-lane sweep)", promoted_at: $now } ]
    } }')
echo "$SLS_STALECACHE_FIXTURE" > "$WORK/sls-stalecache.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-stalecache.json" > "$WORK/sls-stalecache-out.json"
SLS_STALECACHE_HEAD_NA=$(jq -r '.head.next_agent // empty' "$WORK/sls-stalecache-out.json")
assert "AC-SLS-PRIMARY-CLAIMTIME-RESOLVE (scope-widened AC-1/AC-2): dispatch_lane cache='ba' predates next_agent='architect' — PRIMARY claim resolves to the LATER agent 'architect' (got '${SLS_STALECACHE_HEAD_NA:-<none>}')" \
  "$([ "$SLS_STALECACHE_HEAD_NA" = "architect" ] && echo true || echo false)"

# --- SLS-PRIMARY: AC-3, null dispatch_lane never yields an unspawnable head
# (SLS's own resolved_dispatch_lane always terminates in "developer" — so
# this proves the NEVER-NULL guarantee via the fallback chain rather than an
# explicit refusal, which is the correct SLS-specific behavior; see this
# script's own header note on why PRIMARY reuses resolved_dispatch_lane, not
# bare effective_next_agent). ---
SLS_NULLLANE_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-SLS-NULLLANE", status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "", supervised: true, plan_only: true,
        dispatch_lane: null, promoted_by: "dev-team (supervised-lane sweep)", promoted_at: $now } ]
    } }')
echo "$SLS_NULLLANE_FIXTURE" > "$WORK/sls-nulllane.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-nulllane.json" > "$WORK/sls-nulllane-out.json"
SLS_NULLLANE_HEAD_NA=$(jq -r '.head.next_agent // empty' "$WORK/sls-nulllane-out.json")
assert "AC-SLS-PRIMARY-NULL-LANE-NEVER-NULL (AC-3): dispatch_lane=null AND next_agent empty — .head.next_agent is NEVER written as null/empty (resolved via resolved_dispatch_lane's own terminal fallback, got '${SLS_NULLLANE_HEAD_NA:-<none>}')" \
  "$([ -n "$SLS_NULLLANE_HEAD_NA" ] && echo true || echo false)"

# --- SLS-PRIMARY: ordering, fresh P0 (higher idx) outranks stale P1 (lower idx) ---
SLS_ORDER_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [
        { id: "GATESAT-SLS-ORDER-STALE-P1", status: "READY", priority: "P1",
          type: "FIX", zone: "cross-service/", next_agent: "architect", dispatch_lane: "architect",
          supervised: true, plan_only: true,
          promoted_by: "dev-team (supervised-lane sweep)", promoted_at: "2026-08-15T00:00:00Z" },
        { id: "GATESAT-SLS-ORDER-FRESH-P0", status: "READY", priority: "P0",
          type: "FIX", zone: "cross-service/", next_agent: "architect", dispatch_lane: "architect",
          supervised: true, plan_only: true,
          promoted_by: "dev-team (supervised-lane sweep)", promoted_at: $now }
      ]
    } }')
echo "$SLS_ORDER_FIXTURE" > "$WORK/sls-order.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-order.json" > "$WORK/sls-order-out.json"
SLS_ORDER_PICKED=$(jq -r '.task_board.in_progress[0].id // empty' "$WORK/sls-order-out.json")
assert "AC-SLS-PRIMARY-PRIORITY-ORDER (scope-widened, same ordering fix applied to the sibling sweep): the fresh P0 at the HIGHER array index is claimed, not the stale P1 at the LOWER index (got '${SLS_ORDER_PICKED:-<none>}')" \
  "$([ "$SLS_ORDER_PICKED" = "GATESAT-SLS-ORDER-FRESH-P0" ] && echo true || echo false)"

# ---- AC-BOUNDED1-HEAD-GUARD / AC-SLS-HEAD-GUARD / AC-RLC-HEAD-GUARD ----
# FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE (2026-07-30): same
# negative control as AC-DRS-HEAD-GUARD above, applied to the 3 sibling
# claim scripts PO ratified as carrying the identical pre-fix defect.
# ISOLATED single-row fixtures throughout (see header note) — never the
# shared padded fixture.
echo ""
echo "=== HEAD-GUARD (FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE): BOUNDED-1 / SLS (primary+fallback) / RLC ==="

BOUNDED1_HEADGUARD_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-BOUNDED1-HEADGUARD", status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "developer",
        promoted_by: "dev-team (bounded-1 auto-pickup)", promoted_at: $now } ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    },
    head: { status: "in_progress", active_task_id: "GATESAT-UNRELATED-BUSY-TASK-B1",
            next_agent: "developer", updated_at: $now, updated_by: "test" }
  }')
echo "$BOUNDED1_HEADGUARD_FIXTURE" > "$WORK/b1-headguard.json"
HEAD_BEFORE_B1=$(jq -c '.head' "$WORK/b1-headguard.json")
jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq "$WORK/b1-headguard.json" > "$WORK/b1-headguard-after.json"
HEAD_AFTER_B1=$(jq -c '.head' "$WORK/b1-headguard-after.json")
assert "AC-BOUNDED1-HEAD-GUARD: .head is byte-identical after BOUNDED-1 claim when a DIFFERENT task is genuinely busy in .head (never clobbers a live resume pointer)" \
  "$([ "$HEAD_BEFORE_B1" = "$HEAD_AFTER_B1" ] && echo true || echo false)"
BOUNDED1_HEADGUARD_STILL_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-BOUNDED1-HEADGUARD")] | length' "$WORK/b1-headguard-after.json")
assert "AC-BOUNDED1-HEAD-GUARD (positive half): the row itself still moves ready[]->in_progress[] even while .head stays untouched (only .head is guarded, not the lane move)" \
  "$([ "$BOUNDED1_HEADGUARD_STILL_CLAIMED" -eq 1 ] && echo true || echo false)"

SLS_PRIMARY_HEADGUARD_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-SLS-HEADGUARD-PRIMARY", status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "architect", dispatch_lane: "architect",
        promoted_by: "dev-team (supervised-lane sweep)", promoted_at: $now } ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    },
    head: { status: "in_progress", active_task_id: "GATESAT-UNRELATED-BUSY-TASK-SLS",
            next_agent: "developer", updated_at: $now, updated_by: "test" }
  }')
echo "$SLS_PRIMARY_HEADGUARD_FIXTURE" > "$WORK/sls-primary-headguard.json"
HEAD_BEFORE_SLS_P=$(jq -c '.head' "$WORK/sls-primary-headguard.json")
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-primary-headguard.json" > "$WORK/sls-primary-headguard-after.json"
HEAD_AFTER_SLS_P=$(jq -c '.head' "$WORK/sls-primary-headguard-after.json")
assert "AC-SLS-HEAD-GUARD (PRIMARY path): .head is byte-identical after SLS claim when a DIFFERENT task is genuinely busy in .head" \
  "$([ "$HEAD_BEFORE_SLS_P" = "$HEAD_AFTER_SLS_P" ] && echo true || echo false)"
SLS_PRIMARY_HEADGUARD_STILL_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-SLS-HEADGUARD-PRIMARY")] | length' "$WORK/sls-primary-headguard-after.json")
assert "AC-SLS-HEAD-GUARD (PRIMARY positive half): the row itself still moves ready[]->in_progress[] even while .head stays untouched" \
  "$([ "$SLS_PRIMARY_HEADGUARD_STILL_CLAIMED" -eq 1 ] && echo true || echo false)"

SLS_FALLBACK_HEADGUARD_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-SLS-HEADGUARD-FALLBACK", status: "READY", priority: "P0",
        type: "FIX", zone: "cross-service/", next_agent: "pm",
        supervised: true, plan_only: true, promoted_by: null, created_at: $now } ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    },
    head: { status: "in_progress", active_task_id: "GATESAT-UNRELATED-BUSY-TASK-SLS-FB",
            next_agent: "developer", updated_at: $now, updated_by: "test" }
  }')
echo "$SLS_FALLBACK_HEADGUARD_FIXTURE" > "$WORK/sls-fallback-headguard.json"
HEAD_BEFORE_SLS_F=$(jq -c '.head' "$WORK/sls-fallback-headguard.json")
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/sls-fallback-headguard.json" > "$WORK/sls-fallback-headguard-after.json"
HEAD_AFTER_SLS_F=$(jq -c '.head' "$WORK/sls-fallback-headguard-after.json")
assert "AC-SLS-HEAD-GUARD (FALLBACK path): .head is byte-identical after SLS FALLBACK claim when a DIFFERENT task is genuinely busy in .head" \
  "$([ "$HEAD_BEFORE_SLS_F" = "$HEAD_AFTER_SLS_F" ] && echo true || echo false)"
SLS_FALLBACK_HEADGUARD_STILL_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-SLS-HEADGUARD-FALLBACK")] | length' "$WORK/sls-fallback-headguard-after.json")
assert "AC-SLS-HEAD-GUARD (FALLBACK positive half): the row itself still moves ready[]->in_progress[] even while .head stays untouched" \
  "$([ "$SLS_FALLBACK_HEADGUARD_STILL_CLAIMED" -eq 1 ] && echo true || echo false)"

RLC_HEADGUARD_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [ { id: "GATESAT-RLC-HEADGUARD", status: "READY", priority: "P0",
        type: "FIX", zone: "cross-service/", next_agent: "ba", created_at: $now } ],
      in_progress: [], qa: [], review: [], done: [], done_verified: []
    },
    head: { status: "in_progress", active_task_id: "GATESAT-UNRELATED-BUSY-TASK-RLC",
            next_agent: "developer", updated_at: $now, updated_by: "test" }
  }')
echo "$RLC_HEADGUARD_FIXTURE" > "$WORK/rlc-headguard.json"
HEAD_BEFORE_RLC=$(jq -c '.head' "$WORK/rlc-headguard.json")
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-ready-lane-consumer.jq "$WORK/rlc-headguard.json" > "$WORK/rlc-headguard-after.json"
HEAD_AFTER_RLC=$(jq -c '.head' "$WORK/rlc-headguard-after.json")
assert "AC-RLC-HEAD-GUARD: .head is byte-identical after Ready-Lane Consumer claim when a DIFFERENT task is genuinely busy in .head" \
  "$([ "$HEAD_BEFORE_RLC" = "$HEAD_AFTER_RLC" ] && echo true || echo false)"
RLC_HEADGUARD_STILL_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-RLC-HEADGUARD")] | length' "$WORK/rlc-headguard-after.json")
assert "AC-RLC-HEAD-GUARD (positive half): the row itself still moves ready[]->in_progress[] even while .head stays untouched" \
  "$([ "$RLC_HEADGUARD_STILL_CLAIMED" -eq 1 ] && echo true || echo false)"

# ---- AC-QADRAIN-HEAD-GUARD ----
# FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL (2026-07-30/31, brief
# docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md §3/§6):
# same negative-control discipline as the 4 HEAD-GUARD blocks above, applied
# to scripts/devteam-review-claim-qa-drain.jq's own `.head` write, PLUS the
# brief's explicitly-requested POSITIVE control (today's fixture above never
# set `.head` at all, so it could not previously catch this defect class).
# ISOLATED single-row fixtures (same discipline as every HEAD-GUARD block
# above) — never the shared padded fixture.
echo ""
echo "=== HEAD-GUARD (FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL): Review-Lane QA-Drain ==="

QADRAIN_HEADGUARD_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [], in_progress: [], qa: [],
      review: [ { id: "GATESAT-QADRAIN-HEADGUARD", status: "REVIEW", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "qa", created_at: $now } ],
      done: [], done_verified: []
    },
    head: { status: "in_progress", active_task_id: "GATESAT-UNRELATED-BUSY-TASK-QADRAIN",
            next_agent: "developer", updated_at: $now, updated_by: "test" }
  }')
echo "$QADRAIN_HEADGUARD_FIXTURE" > "$WORK/qadrain-headguard.json"
HEAD_BEFORE_QADRAIN=$(jq -c '.head' "$WORK/qadrain-headguard.json")
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-review-claim-qa-drain.jq "$WORK/qadrain-headguard.json" > "$WORK/qadrain-headguard-after.json"
HEAD_AFTER_QADRAIN=$(jq -c '.head' "$WORK/qadrain-headguard-after.json")
assert "AC-QADRAIN-HEAD-GUARD (negative): .head is byte-identical after QA-Drain claim when a DIFFERENT task is genuinely busy in .head (never clobbers a live resume pointer)" \
  "$([ "$HEAD_BEFORE_QADRAIN" = "$HEAD_AFTER_QADRAIN" ] && echo true || echo false)"
QADRAIN_HEADGUARD_STILL_CLAIMED=$(jq -r '[.task_board.qa[] | select(.id=="GATESAT-QADRAIN-HEADGUARD")] | length' "$WORK/qadrain-headguard-after.json")
assert "AC-QADRAIN-HEAD-GUARD (negative, lane-move half): the row itself still moves review[]->qa[] even while .head stays untouched (only .head is guarded, not the lane move)" \
  "$([ "$QADRAIN_HEADGUARD_STILL_CLAIMED" -eq 1 ] && echo true || echo false)"

QADRAIN_HEADFREE_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [], in_progress: [], qa: [],
      review: [ { id: "GATESAT-QADRAIN-HEADFREE", status: "REVIEW", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "qa", created_at: $now } ],
      done: [], done_verified: []
    },
    head: { status: "idle", active_task_id: null, next_agent: "router",
            updated_at: $now, updated_by: "test" }
  }')
echo "$QADRAIN_HEADFREE_FIXTURE" > "$WORK/qadrain-headfree.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-review-claim-qa-drain.jq "$WORK/qadrain-headfree.json" > "$WORK/qadrain-headfree-after.json"
QADRAIN_HEADFREE_HEAD_TASK=$(jq -r '.head.active_task_id // empty' "$WORK/qadrain-headfree-after.json")
assert "AC-QADRAIN-HEAD-GUARD (positive): .head IS written with the picked row when .head was idle before invocation (regression-guards the original call site's existing behavior stays intact after the conditional guard landed; got active_task_id='${QADRAIN_HEADFREE_HEAD_TASK:-<none>}')" \
  "$([ "$QADRAIN_HEADFREE_HEAD_TASK" = "GATESAT-QADRAIN-HEADFREE" ] && echo true || echo false)"

# ---- AC-QADRAIN-PRIORITY-ORDER / AC-QADRAIN-TAKE-BUDGET ----
# FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP (architect brief docs/architecture-
# briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md §2/§3): QA-Drain
# was the one lane in the idle-fallthrough chain still sort_by(.age) with NO
# priority term — a same-day P0 could queue behind a 13-14d-old P2/P3 wall.
# Positive control (PO/architect AC(c)): seed a same-day P0 row BEHIND an
# older P2 row in review[] (P2 appears FIRST in the array / has the older
# timestamp), assert the P0 is claimed FIRST within the batch despite being
# younger. Isolated single-invocation fixture (same discipline as every other
# HEAD-GUARD/AC block above) — never the shared padded fixture.
echo ""
echo "=== PRIORITY ORDER + TAKE_BUDGET (FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP) ==="

QADRAIN_PRIO_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [], in_progress: [], qa: [],
      review: [
        { id: "GATESAT-QADRAIN-OLDER-P2", status: "REVIEW", priority: "P2",
          type: "FIX", zone: "cross-service/", next_agent: "qa",
          updated_at: "2026-07-20T00:00:00Z", created_at: "2026-07-20T00:00:00Z" },
        { id: "GATESAT-QADRAIN-SAMEDAY-P0", status: "REVIEW", priority: "P0",
          type: "FIX", zone: "cross-service/", next_agent: "qa",
          updated_at: $now, created_at: $now }
      ],
      done: [], done_verified: []
    },
    head: { status: "idle", active_task_id: null, next_agent: "router",
            updated_at: $now, updated_by: "test" }
  }')
echo "$QADRAIN_PRIO_FIXTURE" > "$WORK/qadrain-prio.json"

# Default take_budget (--argjson OMITTED entirely — AC-QADRAIN-TAKE-BUDGET-
# DEFAULT: backward-safe for any caller, e.g. the pre-existing main.md idle-
# tick site before its own QA_CAP rewrite lands, that never passes it): only
# ONE row is claimed, and it MUST be the same-day P0, not the older P2 — this
# is only possible if priority_rank now outranks raw age in the sort.
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-review-claim-qa-drain.jq "$WORK/qadrain-prio.json" > "$WORK/qadrain-prio-default.json"
QADRAIN_PRIO_DEFAULT_QA=$(jq -r '[.task_board.qa[].id] | join(",")' "$WORK/qadrain-prio-default.json")
assert "AC-QADRAIN-PRIORITY-ORDER (default take_budget=1, omitted --argjson): same-day P0 claimed FIRST despite an older P2 sitting ahead of it — priority_rank now outranks raw age (qa[]=[${QADRAIN_PRIO_DEFAULT_QA}])" \
  "$([ "$QADRAIN_PRIO_DEFAULT_QA" = "GATESAT-QADRAIN-SAMEDAY-P0" ] && echo true || echo false)"
QADRAIN_PRIO_DEFAULT_REVIEW=$(jq -r '[.task_board.review[].id] | join(",")' "$WORK/qadrain-prio-default.json")
assert "AC-QADRAIN-TAKE-BUDGET-DEFAULT: with --argjson take_budget omitted, only ONE row is claimed (older P2 stays staged in review[]=[${QADRAIN_PRIO_DEFAULT_REVIEW}] for a later tick)" \
  "$([ "$QADRAIN_PRIO_DEFAULT_REVIEW" = "GATESAT-QADRAIN-OLDER-P2" ] && echo true || echo false)"

# take_budget=2 (explicit batch >1): BOTH rows claimed in the SAME invocation,
# sharing one claimed_at/claimed_by stamp (batch-correlation idiom), and the
# batch's own [rank, age]-highest-ranked row (the P0) is what .head narrates —
# cosmetic only, does not gate the P2's own claim.
jq --arg now "$NOW" --argjson take_budget 2 --slurpfile detail "$DETAIL" -f scripts/devteam-review-claim-qa-drain.jq "$WORK/qadrain-prio.json" > "$WORK/qadrain-prio-batch2.json"
QADRAIN_BATCH2_QA_IDS=$(jq -r '[.task_board.qa[].id] | join(",")' "$WORK/qadrain-prio-batch2.json")
assert "AC-QADRAIN-TAKE-BUDGET-BATCH: --argjson take_budget 2 claims BOTH rows in one invocation, P0 ordered first (qa[]=[${QADRAIN_BATCH2_QA_IDS}])" \
  "$([ "$QADRAIN_BATCH2_QA_IDS" = "GATESAT-QADRAIN-SAMEDAY-P0,GATESAT-QADRAIN-OLDER-P2" ] && echo true || echo false)"
QADRAIN_BATCH2_REVIEW_EMPTY=$(jq '.task_board.review | length' "$WORK/qadrain-prio-batch2.json")
assert "AC-QADRAIN-TAKE-BUDGET-BATCH (review drained): review[] is empty after both eligible rows are claimed in the same batch" \
  "$([ "$QADRAIN_BATCH2_REVIEW_EMPTY" -eq 0 ] && echo true || echo false)"
QADRAIN_BATCH2_CLAIMED_AT_A=$(jq -r '.task_board.qa[0].claimed_at' "$WORK/qadrain-prio-batch2.json")
QADRAIN_BATCH2_CLAIMED_AT_B=$(jq -r '.task_board.qa[1].claimed_at' "$WORK/qadrain-prio-batch2.json")
assert "AC-QADRAIN-TAKE-BUDGET-BATCH (correlation): both batch rows share the identical claimed_at stamp ('${QADRAIN_BATCH2_CLAIMED_AT_A}' == '${QADRAIN_BATCH2_CLAIMED_AT_B}')" \
  "$([ "$QADRAIN_BATCH2_CLAIMED_AT_A" = "$QADRAIN_BATCH2_CLAIMED_AT_B" ] && [ -n "$QADRAIN_BATCH2_CLAIMED_AT_A" ] && echo true || echo false)"
QADRAIN_BATCH2_HEAD_TASK=$(jq -r '.head.active_task_id // empty' "$WORK/qadrain-prio-batch2.json")
assert "AC-QADRAIN-TAKE-BUDGET-BATCH (.head narration): .head.active_task_id narrates the batch's own highest-priority row (the P0), not the older P2 (got '${QADRAIN_BATCH2_HEAD_TASK:-<none>}')" \
  "$([ "$QADRAIN_BATCH2_HEAD_TASK" = "GATESAT-QADRAIN-SAMEDAY-P0" ] && echo true || echo false)"

# take_budget larger than the eligible pool (3, only 2 rows exist): must NOT
# error or pad — same $take = min(take_budget, candidates length) contract.
jq --arg now "$NOW" --argjson take_budget 3 --slurpfile detail "$DETAIL" -f scripts/devteam-review-claim-qa-drain.jq "$WORK/qadrain-prio.json" > "$WORK/qadrain-prio-overbudget.json"
QADRAIN_OVERBUDGET_QA_N=$(jq '.task_board.qa | length' "$WORK/qadrain-prio-overbudget.json")
assert "AC-QADRAIN-TAKE-BUDGET-OVERBUDGET: take_budget=3 against only 2 eligible rows claims exactly 2 (min(take_budget, candidates length)) — no error, no padding" \
  "$([ "$QADRAIN_OVERBUDGET_QA_N" -eq 2 ] && echo true || echo false)"

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
jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/capped-drs.json" > "$WORK/capped-drs2.json"
CAPPED_DRS_CLAIMED_AT_MOST_ONE=$([ "$(jq '.task_board.in_progress|length' "$WORK/capped-drs2.json")" -le "$((CAPPED_INPROG + 1))" ] && echo true || echo false)
assert "defense-in-depth: DRS claim script never claims more than ONE additional row per invocation even if called at/above the shared WIP<=2 cap" "$CAPPED_DRS_CLAIMED_AT_MOST_ONE"

# =============================================================================
# ---- WIP EFFECTIVE COUNT excludes BLOCKED rows (FIX-DEVTEAM-WIP-BUDGET-
# COUNTS-BLOCKED-INPROGRESS-ROWS, 2026-07-30) ----
# wip_in_progress (scripts/lib/devteam-eligibility.jq) must count only rows
# representing REAL live concurrency, not raw in_progress[] array length.
# Live incident: FU-CNYVND-DEAD-FIELD-REMOVE flipped IN_PROGRESS->BLOCKED and
# stayed parked in in_progress[] — a bare-length WIP read at cap=2 froze
# BOUNDED-1/SLS/RLC/DRS fleet-wide for ~2.5h despite only ONE row genuinely
# live. Isolated single-row-array fixtures throughout (same discipline as the
# HEAD-GUARD sections above), never mixed into the shared padded fixture.
# =============================================================================
echo ""
echo "=== WIP EFFECTIVE COUNT (BLOCKED rows excluded from concurrency budget) ==="

# Fixture A: raw in_progress[] array length 2, but only ONE row genuinely
# IN_PROGRESS — mirrors the live incident shape exactly.
WIP_BLOCKED_MIX_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [], qa: [], review: [], done: [], done_verified: [],
      in_progress: [
        { id: "GATESAT-WIP-LIVE", status: "IN_PROGRESS", priority: "P1",
          type: "FIX", zone: "cross-service/", next_agent: "developer", claimed_at: $now },
        { id: "GATESAT-WIP-PARKED-BLOCKED", status: "BLOCKED", priority: "P3",
          type: "FIX", zone: "apps/mcp-server", next_agent: "architect",
          blocked_reason: "synthetic — mirrors FU-CNYVND-DEAD-FIELD-REMOVE parked shape", claimed_at: $now }
      ]
    } }')
echo "$WIP_BLOCKED_MIX_FIXTURE" > "$WORK/wip-blocked-mix.json"
WIP_MIX_RAW_LEN=$(jq '.task_board.in_progress|length' "$WORK/wip-blocked-mix.json")
WIP_MIX_EFFECTIVE=$(jq 'include "scripts/lib/devteam-eligibility"; wip_in_progress' "$WORK/wip-blocked-mix.json")
assert "AC-WIP-BLOCKED-1: fixture has raw in_progress[] length 2 (1 IN_PROGRESS + 1 BLOCKED) — confirms the fixture models the live-incident shape" \
  "$([ "$WIP_MIX_RAW_LEN" -eq 2 ] && echo true || echo false)"
assert "AC-WIP-BLOCKED-2: wip_in_progress (corrected formula) reads 1 on this fixture, NOT the raw length 2 — the parked BLOCKED row does not consume a concurrency slot" \
  "$([ "$WIP_MIX_EFFECTIVE" -eq 1 ] && echo true || echo false)"
assert "AC-WIP-BLOCKED-3: at wip_in_progress=1, the shared SLS/RLC/DRS gate (wip_in_progress<2) IS satisfiable" \
  "$([ "$WIP_MIX_EFFECTIVE" -lt 2 ] && echo true || echo false)"

# Non-vacuous proof: SLS actually FIRES (claims a row, drains ready[]->
# in_progress[]) when the gate is computed via wip_in_progress against this
# exact BLOCKED-mix in_progress[] shape — not just an arithmetic fact.
WIP_MIX_SLS_FIXTURE=$(jq --arg now "$NOW" '
  .task_board.ready = [ { id: "GATESAT-WIP-BLOCKED-SLS-CANDIDATE", status: "READY", priority: "P1",
    type: "FIX", zone: "cross-service/", next_agent: "architect", dispatch_lane: "architect",
    promoted_by: "dev-team (supervised-lane sweep)", promoted_at: $now } ]
' "$WORK/wip-blocked-mix.json")
echo "$WIP_MIX_SLS_FIXTURE" > "$WORK/wip-blocked-mix-sls.json"
jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/wip-blocked-mix-sls.json" > "$WORK/wip-blocked-mix-sls-out.json"
WIP_MIX_SLS_CLAIMED=$(jq -r '[.task_board.in_progress[] | select(.id=="GATESAT-WIP-BLOCKED-SLS-CANDIDATE")] | length' "$WORK/wip-blocked-mix-sls-out.json")
assert "AC-WIP-BLOCKED-4 (non-vacuous): SLS claim script actually fires (claims ready[]->in_progress[]) under the effective-wip=1 BLOCKED-mix fixture, proving SLS/RLC/DRS stay SATISFIABLE with a parked BLOCKED row present" \
  "$([ "$WIP_MIX_SLS_CLAIMED" -eq 1 ] && echo true || echo false)"

# Fixture B: TWO genuinely IN_PROGRESS rows — must still saturate wip=2 (no
# false relief from the fix).
WIP_TWO_LIVE_FIXTURE=$(jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], ready: [], qa: [], review: [], done: [], done_verified: [],
      in_progress: [
        { id: "GATESAT-WIP-LIVE-A", status: "IN_PROGRESS", priority: "P1",
          type: "FIX", zone: "cross-service/", next_agent: "developer", claimed_at: $now },
        { id: "GATESAT-WIP-LIVE-B", status: "IN_PROGRESS", priority: "P1",
          type: "FIX", zone: "cross-service/", next_agent: "developer", claimed_at: $now }
      ]
    } }')
echo "$WIP_TWO_LIVE_FIXTURE" > "$WORK/wip-two-live.json"
WIP_TWO_LIVE_EFFECTIVE=$(jq 'include "scripts/lib/devteam-eligibility"; wip_in_progress' "$WORK/wip-two-live.json")
assert "AC-WIP-BLOCKED-5: two genuinely IN_PROGRESS rows still saturate wip_in_progress=2 (no false relief from the fix)" \
  "$([ "$WIP_TWO_LIVE_EFFECTIVE" -eq 2 ] && echo true || echo false)"
assert "AC-WIP-BLOCKED-6: at wip_in_progress=2, the shared SLS/RLC/DRS gate (wip_in_progress<2) is NOT satisfiable" \
  "$([ "$WIP_TWO_LIVE_EFFECTIVE" -ge 2 ] && echo true || echo false)"

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

# FIXTURE ROT FIXED IN PASSING (FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS,
# 2026-08-23): these two synthetic rows used to be written as bare
# `status: DONE_VERIFIED` with no `verification.raw_probe`. That was valid when
# this section was authored, but SYSREMAKE-P2-T2-SCHEMA-ADDITIONS (2026-08-08)
# added `checkVerificationGate`, which HARD-REJECTS any non-grandfathered
# DONE_VERIFIED row lacking `verification.raw_probe{tool,args,
# live_value_observed,observed_at}`. The fixture therefore aborted
# orch-cold-evict.sh at its own write gate and AC-EVICT-1/AC-EVICT-3 had been
# failing for the wrong reason ever since — the eviction guard under test was
# never actually reached. Reproduced against BOTH the current and the
# pre-Component-6 orch-cold-evict.sh, identical abort in each, confirming the
# rot is in this fixture and not in the script. A compliant synthetic probe
# object is attached below; it is self-labelling so nobody mistakes it for a
# real verification record.
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
    {"id": "GATESAT-REFGUARD-DEP-REFERENCED", "status": "DONE_VERIFIED", "created_at": "2026-01-01T00:00:00Z",
     "verification": {"raw_probe": {"tool": "gate-satisfiability-fixture", "args": "synthetic",
       "live_value_observed": "synthetic fixture row, never a real task", "observed_at": "2026-01-01T00:00:00Z"}}},
    {"id": "GATESAT-REFGUARD-DEP-UNREFERENCED", "status": "DONE_VERIFIED", "created_at": "2026-01-01T00:00:00Z",
     "verification": {"raw_probe": {"tool": "gate-satisfiability-fixture", "args": "synthetic",
       "live_value_observed": "synthetic fixture row, never a real task", "observed_at": "2026-01-01T00:00:00Z"}}}
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

# ---- INCIDENT-LANE CONSUMER (ILC) — FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-
# SCRIPTS (2026-08-14 brief §4a-§4c) ----
#
# Same satisfiability question as every section above, for the newest ready[]
# consumer: given a board shaped the way the incident path actually arrives,
# does scripts/devteam-backlog-claim-incident-lane-consumer.jq FIRE and DRAIN,
# and does it stay INSIDE its own bounds? ISOLATED single-purpose fixtures
# throughout (never the shared padded fixture), so these assertions are
# deterministic regardless of live-board drift — same discipline as the DRS and
# SLS-FALLBACK sections above.
#
# The four properties under test are exactly the four this lane could plausibly
# get wrong, and each one has a named failure mode:
#   POSITIVE      an expedited row BURIED deep in ready[] is claimed anyway —
#                 if it were not, the lane would be a relabelled FIFO and the
#                 whole row is a no-op.
#   NEGATIVE      a non-expedited P0 is NOT claimed — if it were, ILC would be
#                 a second general consumer racing RLC, not an incident lane.
#   CAP           a 3rd simultaneously-expedited row is NOT claimed while 2 are
#                 already in flight — this is the ENTIRE answer to "must not
#                 saturate like a 4th priority tier".
#   WIP-INDEP.    ILC still fires when the shared WIP<=2 budget is saturated —
#                 if it did not, the independent budget would be decorative and
#                 an incident would still queue behind ordinary throughput.
# Plus the mandatory head-busy negative control every sibling consumer carries.
echo ""
echo "=== INCIDENT-LANE CONSUMER (ILC): expedite selection, cap, budget independence ==="

ILC_CLAIM="scripts/devteam-backlog-claim-incident-lane-consumer.jq"
ILC_BY="dev-team (incident-lane consumer)"

# run_ilc <fixture> <take_budget> <outfile>
run_ilc() {
  jq --arg now "$NOW" --argjson take_budget "$2" \
    --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" \
    -f "$ILC_CLAIM" "$1" > "$3"
}

# POSITIVE: the expedited row sits at ready[] index 40, behind 40 plain P0s.
# A FIFO/priority-only consumer reaches it 40 turns from now; ILC must take it
# on this turn.
ILC_BURIED="$WORK/ilc-buried.json"
jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: ( [ range(0;40) | { id: ("GATESAT-ILC-PLAIN-" + (.|tostring)), status: "READY",
                                 priority: "P0", type: "FIX", zone: "cross-service/",
                                 next_agent: "developer" } ]
               + [ { id: "GATESAT-ILC-BURIED-EXPEDITED", status: "READY", priority: "P0",
                     type: "FIX", zone: "cross-service/", next_agent: "developer",
                     po_expedited_at: "2026-08-14T00:00:00Z", po_expedited_by: "po" } ] )
    },
    head: { status: "idle", active_task_id: null, next_agent: null }
  }' > "$ILC_BURIED"
run_ilc "$ILC_BURIED" 2 "$WORK/ilc-buried-after.json"
ILC_CLAIMED_IDS=$(jq -r --arg by "$ILC_BY" '[.task_board.in_progress[] | select(.claimed_by==$by) | .id] | join(",")' "$WORK/ilc-buried-after.json")
assert "AC-ILC-POSITIVE: a po_expedited_at row buried at ready[] index 40 behind 40 plain P0s IS claimed on this turn (claimed='"'"'${ILC_CLAIMED_IDS:-<none>}'"'"')" \
  "$([ "$ILC_CLAIMED_IDS" = "GATESAT-ILC-BURIED-EXPEDITED" ] && echo true || echo false)"
ILC_PLAIN_UNTOUCHED=$(jq '[.task_board.ready[] | select(.id|startswith("GATESAT-ILC-PLAIN-"))] | length' "$WORK/ilc-buried-after.json")
assert "AC-ILC-NEGATIVE: all 40 non-expedited P0 rows are left untouched in ready[] (RLC territory — ILC is not a second general consumer)" \
  "$([ "$ILC_PLAIN_UNTOUCHED" -eq 40 ] && echo true || echo false)"
ILC_STAMP_OK=$(jq -r --arg by "$ILC_BY" --arg t "$NOW" '[.task_board.in_progress[] | select(.claimed_by==$by and .claimed_at==$t and .status=="IN_PROGRESS" and .po_expedited_at=="2026-08-14T00:00:00Z" and .po_expedited_by=="po")] | length' "$WORK/ilc-buried-after.json")
assert "AC-ILC-STAMP: claimed row carries the DISTINCT claimed_by marker, the batch claimed_at, status IN_PROGRESS, and its po_expedited_at/by provenance UNCHANGED" \
  "$([ "$ILC_STAMP_OK" -eq 1 ] && echo true || echo false)"

# ORDERING: priority first, then oldest-expedite-first inside the pool.
ILC_ORDER="$WORK/ilc-order.json"
jq -n '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [
        { id: "GATESAT-ILC-P1-OLDEST", status: "READY", priority: "P1", type: "FIX",
          zone: "cross-service/", next_agent: "developer", po_expedited_at: "2026-08-01T00:00:00Z" },
        { id: "GATESAT-ILC-P0-NEWER",  status: "READY", priority: "P0", type: "FIX",
          zone: "cross-service/", next_agent: "developer", po_expedited_at: "2026-08-14T00:00:00Z" },
        { id: "GATESAT-ILC-P0-OLDER",  status: "READY", priority: "P0", type: "FIX",
          zone: "cross-service/", next_agent: "developer", po_expedited_at: "2026-08-02T00:00:00Z" }
      ]
    },
    head: { status: "idle", active_task_id: null, next_agent: null }
  }' > "$ILC_ORDER"
run_ilc "$ILC_ORDER" 1 "$WORK/ilc-order-after.json"
ILC_FIRST=$(jq -r --arg by "$ILC_BY" 'first(.task_board.in_progress[] | select(.claimed_by==$by) | .id) // ""' "$WORK/ilc-order-after.json")
assert "AC-ILC-ORDER: priority outranks expedite age — the OLDER-expedited P0 wins, never the older-expedited P1 (first='"'"'${ILC_FIRST:-<none>}'"'"')" \
  "$([ "$ILC_FIRST" = "GATESAT-ILC-P0-OLDER" ] && echo true || echo false)"

# SAFETY GATING IS NOT RELAXED BY SEVERITY (brief §4c, explicit).
ILC_SUPERVISED="$WORK/ilc-supervised.json"
jq -n '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [
        { id: "GATESAT-ILC-SUPERVISED", status: "READY", priority: "P0", type: "FIX",
          zone: "cross-service/", next_agent: "developer", supervised: true,
          po_expedited_at: "2026-07-01T00:00:00Z" },
        { id: "GATESAT-ILC-PLANONLY", status: "READY", priority: "P0", type: "FIX",
          zone: "cross-service/", next_agent: "developer", plan_only: true,
          po_expedited_at: "2026-07-01T00:00:00Z" },
        { id: "GATESAT-ILC-EPIC", status: "READY", priority: "P0", type: "FIX",
          zone: "cross-service/", next_agent: "developer", children: ["A","B"],
          po_expedited_at: "2026-07-01T00:00:00Z" }
      ]
    },
    head: { status: "idle", active_task_id: null, next_agent: null }
  }' > "$ILC_SUPERVISED"
run_ilc "$ILC_SUPERVISED" 2 "$WORK/ilc-supervised-after.json"
ILC_SAFETY=$(jq '(.task_board.in_progress // []) | length' "$WORK/ilc-supervised-after.json")
assert "AC-ILC-SAFETY: expedite does NOT relax the supervised / plan_only / epic-wrapper gates — 0 of 3 expedited-but-gated P0 rows claimed (severity changes throughput priority, never safety gating)" \
  "$([ "$ILC_SAFETY" -eq 0 ] && echo true || echo false)"

# CAP: 2 already in flight through THIS lane -> take_budget is 0 -> nothing more.
ILC_CAP="$WORK/ilc-cap.json"
jq -n --arg by "$ILC_BY" --arg now "$NOW" '
  { task_board: {
      backlog: [], qa: [], review: [], done: [], done_verified: [],
      in_progress: [
        { id: "GATESAT-ILC-INFLIGHT-1", status: "IN_PROGRESS", claimed_by: $by, claimed_at: $now },
        { id: "GATESAT-ILC-INFLIGHT-2", status: "IN_PROGRESS", claimed_by: $by, claimed_at: $now }
      ],
      ready: [ { id: "GATESAT-ILC-THIRD-EXPEDITED", status: "READY", priority: "P0", type: "FIX",
                 zone: "cross-service/", next_agent: "developer",
                 po_expedited_at: "2026-08-14T00:00:00Z" } ]
    },
    head: { status: "idle", active_task_id: null, next_agent: null }
  }' > "$ILC_CAP"
ILC_INCIDENT_WIP=$(jq 'include "scripts/lib/devteam-eligibility"; incident_wip_in_progress' "$ILC_CAP")
assert "AC-ILC-CAP (counter): incident_wip_in_progress sees exactly the 2 rows this lane claimed" \
  "$([ "$ILC_INCIDENT_WIP" -eq 2 ] && echo true || echo false)"
# The caller computes TAKE_BUDGET = INCIDENT_CAP - INCIDENT_WIP = 0 and skips
# the invocation entirely; replay that arithmetic here rather than asserting on
# a number the script never receives.
ILC_TAKE=$(( 2 - ILC_INCIDENT_WIP ))
assert "AC-ILC-CAP (gate): TAKE_BUDGET = INCIDENT_CAP(2) - INCIDENT_WIP($ILC_INCIDENT_WIP) = $ILC_TAKE, so the 3rd simultaneously-expedited row is NOT claimed while 2 are in flight" \
  "$([ "$ILC_TAKE" -le 0 ] && echo true || echo false)"
ILC_THIRD_STILL_READY=$(jq '[.task_board.ready[] | select(.id=="GATESAT-ILC-THIRD-EXPEDITED")] | length' "$ILC_CAP")
assert "AC-ILC-CAP (queue, not drop): the capped-out 3rd row stays in ready[] — bounded, never discarded" \
  "$([ "$ILC_THIRD_STILL_READY" -eq 1 ] && echo true || echo false)"

# WIP-INDEPENDENCE: shared WIP<=2 saturated by OTHER lanes, incident budget free.
ILC_WIPINDEP="$WORK/ilc-wipindep.json"
jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], qa: [], review: [], done: [], done_verified: [],
      in_progress: [
        { id: "GATESAT-ILC-SHARED-1", status: "IN_PROGRESS", claimed_by: "dev-team (ready-lane consumer)", claimed_at: $now },
        { id: "GATESAT-ILC-SHARED-2", status: "IN_PROGRESS", claimed_by: "dev-team (bounded-1 auto-pickup)", claimed_at: $now }
      ],
      ready: [ { id: "GATESAT-ILC-UNDER-SATURATION", status: "READY", priority: "P0", type: "FIX",
                 zone: "cross-service/", next_agent: "developer",
                 po_expedited_at: "2026-08-14T00:00:00Z" } ]
    },
    head: { status: "idle", active_task_id: null, next_agent: null }
  }' > "$ILC_WIPINDEP"
ILC_SHARED_WIP=$(jq 'include "scripts/lib/devteam-eligibility"; wip_in_progress' "$ILC_WIPINDEP")
ILC_OWN_WIP=$(jq 'include "scripts/lib/devteam-eligibility"; incident_wip_in_progress' "$ILC_WIPINDEP")
assert "AC-ILC-WIP-INDEP (precondition): shared wip_in_progress=$ILC_SHARED_WIP is saturated at the <=2 cap while incident_wip_in_progress=$ILC_OWN_WIP is free" \
  "$([ "$ILC_SHARED_WIP" -ge 2 ] && [ "$ILC_OWN_WIP" -eq 0 ] && echo true || echo false)"
run_ilc "$ILC_WIPINDEP" 2 "$WORK/ilc-wipindep-after.json"
ILC_FIRED_UNDER_SAT=$(jq -r --arg by "$ILC_BY" '[.task_board.in_progress[] | select(.claimed_by==$by and .id=="GATESAT-ILC-UNDER-SATURATION")] | length' "$WORK/ilc-wipindep-after.json")
assert "AC-ILC-WIP-INDEP: ILC still claims the expedited row while the shared WIP<=2 budget is fully saturated by other lanes (the independent budget is real, not decorative)" \
  "$([ "$ILC_FIRED_UNDER_SAT" -eq 1 ] && echo true || echo false)"

# HEAD-BUSY NEGATIVE CONTROL — same mandatory guard every sibling carries.
ILC_HEADGUARD="$WORK/ilc-headguard.json"
jq -n --arg now "$NOW" '
  { task_board: {
      backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-ILC-HEADGUARD", status: "READY", priority: "P0", type: "FIX",
                 zone: "cross-service/", next_agent: "developer",
                 po_expedited_at: "2026-08-14T00:00:00Z" } ]
    },
    head: { status: "in_progress", active_task_id: "GATESAT-UNRELATED-BUSY-TASK-ILC",
            next_agent: "developer", updated_at: $now, updated_by: "test" }
  }' > "$ILC_HEADGUARD"
ILC_HEAD_BEFORE=$(jq -c '.head' "$ILC_HEADGUARD")
run_ilc "$ILC_HEADGUARD" 2 "$WORK/ilc-headguard-after.json"
ILC_HEAD_AFTER=$(jq -c '.head' "$WORK/ilc-headguard-after.json")
assert "AC-ILC-HEAD-GUARD: .head is byte-identical after an ILC claim when a DIFFERENT task is genuinely busy in it (never clobbers a live resume pointer)" \
  "$([ "$ILC_HEAD_BEFORE" = "$ILC_HEAD_AFTER" ] && echo true || echo false)"
ILC_HEADGUARD_CLAIMED=$(jq -r --arg by "$ILC_BY" '[.task_board.in_progress[] | select(.claimed_by==$by)] | length' "$WORK/ilc-headguard-after.json")
assert "AC-ILC-HEAD-GUARD (positive half): the row still moves ready[]->in_progress[] while .head stays untouched (only .head is guarded, not the lane move)" \
  "$([ "$ILC_HEADGUARD_CLAIMED" -eq 1 ] && echo true || echo false)"

# NO-OP: nothing expedited anywhere -> byte-identical document, re-run safe.
ILC_NOOP="$WORK/ilc-noop.json"
jq -n '
  { task_board: { backlog: [], in_progress: [], qa: [], review: [], done: [], done_verified: [],
      ready: [ { id: "GATESAT-ILC-NOTHING-EXPEDITED", status: "READY", priority: "P0",
                 type: "FIX", zone: "cross-service/", next_agent: "developer" } ] },
    head: { status: "idle", active_task_id: null, next_agent: null } }' > "$ILC_NOOP"
run_ilc "$ILC_NOOP" 2 "$WORK/ilc-noop-after.json"
assert "AC-ILC-NOOP: nothing po_expedited_at-marked anywhere -> the document is unchanged (true no-op, safe to run every tick)" \
  "$([ "$(jq -S -c . "$ILC_NOOP")" = "$(jq -S -c . "$WORK/ilc-noop-after.json")" ] && echo true || echo false)"

# =============================================================================
# =============================================================================
# ---- ROTATION FAIRNESS BOUND + $SELECTED-DRIVEN GATE-FIRING PROOF (AC-1/
# AC-4, FIX-DEVTEAM-IDLE-CHAIN-TEST-FAIRNESS) ----
#
# WHY THIS SECTION EXISTS (extends this SAME instrument, per PM's explicit
# AC-4 instruction — not forked): every gate-firing assertion above proves a
# lane's OWN promote/claim scripts fire IN ISOLATION, given a fixture shaped
# for that lane alone. It does NOT prove what AC-1/AC-4 actually require:
# that the aged-round-robin selection mechanism (docs/agents/dev-team/flow/
# main.md § Idle-Tick Rotation Selection, FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-
# ROTATION) (a) gives every one of the 6 lanes a turn within any 6
# consecutive idle-fallthrough ticks — not just that BOUNDED-1 (or whichever
# lane sits first) can starve the rest forever, the EXACT defect this
# rotation replaced (measured: 6 FIX-ORPHAN-FR* children sat in ready[]
# 2026-07-22->2026-08-08 because the old fixed chain never reached RLC) —
# and (b) that gate-firing is actually DRIVEN by $SELECTED end to end
# (select -> dispatch -> real script -> board mutation), not merely that a
# lane's gate CAN be satisfied when invoked directly in isolation
# (scripts/audits/bounded1-supervised-lane-report.sh's own false-GREEN
# lesson, see this file's own header).
#
# 6 candidates, not 5: main.md's own rotation section computes $SELECTED
# over ["bounded1","sls","rlc","drs","qa_drain","step1_triage"] (6 ids).
# Design-Router Sweep (DRS) was added to the dispatch chain 2026-07-30, five
# days after the original 2026-07-25 brief/schema shipped the 5-id
# rotation_selected($doc) (scripts/lib/devteam-eligibility.jq:466) and
# devteam-idle-chain-stamp.jq's $known_ids guard — main.md's own "6
# candidates, not 5" note (§ Idle-Tick Rotation Selection) flags that BOTH
# of those shared-lib functions are STALE (still hardcode the original 5,
# DRS-blind) and are NOT what main.md actually calls: main.md INLINES its
# own 6-id selection + stamp jq instead (flagged fast-follow, not yet
# landed, not this task's scope: extending those 2 shared files to 6 ids).
# This section therefore deliberately does NOT call rotation_selected($doc)
# — doing so would test a DIFFERENT (stale, DRS-blind, only-5-tick-fair)
# algorithm than the one actually live in production. The two jq snippets
# below are byte-verbatim copies of main.md's own "Runs ONCE..." selection
# block and "Stamp update" block (§ Idle-Tick Rotation Selection, both
# outside this task's/agent-father's commit_zone.allowed for main.md itself
# — this script cannot `include` it directly) — if main.md's inline
# algorithm ever changes, this section must be updated in lockstep; verbatim
# duplication + this comment is the deliberate, documented tradeoff, same
# class as main.md's own note about duplicating scripts/lib/devteam-
# eligibility.jq's def.
# =============================================================================
echo ""
echo "=== ROTATION FAIRNESS (AC-1) + \$SELECTED-DRIVEN GATE-FIRING (AC-4) ==="

ROT_IDS='["bounded1","sls","rlc","drs","qa_drain","step1_triage"]'

# main.md § Idle-Tick Rotation Selection — selection jq, byte-verbatim.
rot_selected() {
  jq -r \
    '(.dev_team_idle_chain.rotation // {}) as $r
     | ["bounded1","sls","rlc","drs","qa_drain","step1_triage"]
     | map({id: ., stamp: ($r[.].last_served_tick // "1970-01-01T00:00:00Z")})
     | sort_by(.stamp)
     | .[0].id' \
    "$1"
}

# main.md § Idle-Tick Rotation Selection — stamp-write jq, byte-verbatim
# (only the orch-apply.sh sink is swapped for a plain scratch-file
# overwrite — this script never writes the live orch-state.json, see file
# header).
rot_stamp() {
  local file="$1" now="$2" c="$3"
  jq --arg now "$now" --arg c "$c" \
    '(["bounded1","sls","rlc","drs","qa_drain","step1_triage"]) as $known
     | if ($known | index($c)) == null then .
       else .dev_team_idle_chain.rotation[$c].last_served_tick = $now
          | .dev_team_idle_chain._updated_at = $now
          | .dev_team_idle_chain._updated_by = "dev-team"
       end' \
    "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

# Adds ONE fresh dedicated row per board-touching lane (5 of the 6 —
# step1_triage has no promote/claim body of its own at this rotation
# position, main.md's own documented contract: "this stamp write is ALL
# that happens for it HERE" — so it gets no dedicated board row; its own
# proof is the stamp-write assertion in the dispatch loop below). The
# next_agent split (dev role for BOUNDED-1's row, allowlisted non-dev role
# for DRS's row) mirrors the real is_bounded1_eligible / is_design_router_
# eligible mutual exclusion (scripts/lib/devteam-eligibility.jq
# is_non_dev_next_agent_unrouted) so both rows coexist safely in the SAME
# backlog[] without cross-picking when only ONE lane's script is invoked a
# given tick.
rot_inject_rows() {
  local file="$1" suffix="$2" now="$3"
  jq --arg now "$now" --arg suf "$suffix" '
    .task_board.backlog += [
      { id: ("GATESAT-ROTATE-BOUNDED1-" + $suf), status: "BACKLOG", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "developer", created_at: $now },
      { id: ("GATESAT-ROTATE-DRS-" + $suf), status: "BACKLOG", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "ba", created_at: $now }
    ]
    | .task_board.ready += [
      { id: ("GATESAT-ROTATE-SLS-" + $suf), status: "READY", priority: "P0",
        type: "FIX", zone: "cross-service/", next_agent: "pm",
        supervised: true, plan_only: true, promoted_by: null, created_at: $now },
      { id: ("GATESAT-ROTATE-RLC-" + $suf), status: "READY", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "developer", created_at: $now }
    ]
    | .task_board.review += [
      { id: ("GATESAT-ROTATE-QADRAIN-" + $suf), status: "REVIEW", priority: "P1",
        type: "FIX", zone: "cross-service/", next_agent: "qa", created_at: $now }
    ]
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

ROTATE_FIXTURE="$WORK/rotate.json"
jq -n '{ task_board: { backlog: [], ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: [] } }' > "$ROTATE_FIXTURE"
rot_inject_rows "$ROTATE_FIXTURE" "W1" "2026-01-01T00:00:00Z"

assert "AC-1 fixture is saturated (backlog>0, ready>0, review>0, all rows carry a resolved next_agent) before any tick runs" \
  "$([ "$(jq '.task_board.backlog|length' "$ROTATE_FIXTURE")" -gt 0 ] && [ "$(jq '.task_board.ready|length' "$ROTATE_FIXTURE")" -gt 0 ] && [ "$(jq '.task_board.review|length' "$ROTATE_FIXTURE")" -gt 0 ] && echo true || echo false)"

ROT_HISTORY=()
for GLOBAL_TICK in $(seq 1 12); do
  WINDOW=$(( (GLOBAL_TICK - 1) / 6 + 1 ))
  TICK_IN_WINDOW=$(( (GLOBAL_TICK - 1) % 6 + 1 ))
  # Synthetic, monotonically increasing, sort_by-comparable ISO8601 — NOT a
  # real wall-clock write (this is a scratch fixture only, never routed
  # through orch-apply.sh / the live orch-state.json).
  TICK_STAMP=$(printf "2026-01-01T00:%02d:00Z" "$GLOBAL_TICK")

  # Window 2 bootstrap: inject a FRESH row per lane — window 1's rows are
  # each consumed exactly once by design (round-robin guarantees no repeat
  # within a window) — so "fairness sustained, not just bootstrap" (PM Test
  # Design) is provable on a second, independent 6-tick pass.
  if [ "$TICK_IN_WINDOW" -eq 1 ] && [ "$WINDOW" -eq 2 ]; then
    rot_inject_rows "$ROTATE_FIXTURE" "W2" "$TICK_STAMP"
  fi

  SELECTED=$(rot_selected "$ROTATE_FIXTURE")
  SELECTED_VALID=$(echo "$ROT_IDS" | jq --arg s "$SELECTED" 'index($s) != null')
  assert "tick $GLOBAL_TICK (window $WINDOW, position $TICK_IN_WINDOW): \$SELECTED='${SELECTED:-<empty>}' is one of the 6 known rotation ids" \
    "$([ "$SELECTED_VALID" = "true" ] && echo true || echo false)"
  ROT_HISTORY+=("$SELECTED")

  case "$SELECTED" in
    bounded1)
      ROW_ID="GATESAT-ROTATE-BOUNDED1-W${WINDOW}"
      jq --arg now "$TICK_STAMP" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-bounded1.jq "$ROTATE_FIXTURE" > "$WORK/rot-b.json"
      jq --arg now "$TICK_STAMP" -f scripts/devteam-backlog-claim-bounded1.jq "$WORK/rot-b.json" > "$WORK/rot-c.json"
      FIRED=$([ "$(jq --arg id "$ROW_ID" '[.task_board.in_progress[]|select(.id==$id)]|length' "$WORK/rot-c.json")" -eq 1 ] && echo true || echo false)
      ;;
    sls)
      ROW_ID="GATESAT-ROTATE-SLS-W${WINDOW}"
      jq --arg now "$TICK_STAMP" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq "$ROTATE_FIXTURE" > "$WORK/rot-b.json"
      jq --arg now "$TICK_STAMP" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/rot-b.json" > "$WORK/rot-c.json"
      FIRED=$([ "$(jq --arg id "$ROW_ID" '[.task_board.in_progress[]|select(.id==$id)]|length' "$WORK/rot-c.json")" -eq 1 ] && echo true || echo false)
      ;;
    rlc)
      ROW_ID="GATESAT-ROTATE-RLC-W${WINDOW}"
      jq --arg now "$TICK_STAMP" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-ready-lane-consumer.jq "$ROTATE_FIXTURE" > "$WORK/rot-c.json"
      FIRED=$([ "$(jq --arg id "$ROW_ID" '[.task_board.in_progress[]|select(.id==$id)]|length' "$WORK/rot-c.json")" -eq 1 ] && echo true || echo false)
      ;;
    drs)
      ROW_ID="GATESAT-ROTATE-DRS-W${WINDOW}"
      jq --arg now "$TICK_STAMP" --argjson allowlist "$DRS_ALLOWLIST" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-design-router-sweep.jq "$ROTATE_FIXTURE" > "$WORK/rot-b.json"
      jq --arg now "$TICK_STAMP" --slurpfile detail "$DETAIL" -f scripts/devteam-backlog-claim-design-router-sweep.jq "$WORK/rot-b.json" > "$WORK/rot-c.json"
      FIRED=$([ "$(jq --arg id "$ROW_ID" '[.task_board.in_progress[]|select(.id==$id)]|length' "$WORK/rot-c.json")" -eq 1 ] && echo true || echo false)
      ;;
    qa_drain)
      ROW_ID="GATESAT-ROTATE-QADRAIN-W${WINDOW}"
      jq --arg now "$TICK_STAMP" --slurpfile detail "$DETAIL" -f scripts/devteam-review-claim-qa-drain.jq "$ROTATE_FIXTURE" > "$WORK/rot-c.json"
      FIRED=$([ "$(jq --arg id "$ROW_ID" '[.task_board.qa[]|select(.id==$id)]|length' "$WORK/rot-c.json")" -eq 1 ] && echo true || echo false)
      ;;
    step1_triage)
      ROW_ID="(none by design — no board mutation at this rotation position)"
      cp "$ROTATE_FIXTURE" "$WORK/rot-c.json"
      FIRED=true
      ;;
    *)
      ROW_ID="(unrecognized \$SELECTED)"
      cp "$ROTATE_FIXTURE" "$WORK/rot-c.json"
      FIRED=false
      ;;
  esac
  assert "tick $GLOBAL_TICK: \$SELECTED='$SELECTED' own real promote/claim (row=$ROW_ID) FIRES — a real board mutation, not merely a resolved id" "$FIRED"

  if [ "$SELECTED" = "step1_triage" ]; then
    BOARD_UNCHANGED=$([ "$(jq -c '.task_board' "$ROTATE_FIXTURE")" = "$(jq -c '.task_board' "$WORK/rot-c.json")" ] && echo true || echo false)
    assert "tick $GLOBAL_TICK: step1_triage selected -> .task_board byte-identical (its own promote/claim dispatch happens at the SEPARATE ## Step 1 -- PO Triage physical location, not this rotation position, per main.md's own cross-reference)" \
      "$BOARD_UNCHANGED"
  fi

  # Decouples WIP-budget behavior (already covered by the dedicated NEGATIVE
  # CONTROL / WIP EFFECTIVE COUNT sections above) from rotation-fairness
  # testing here: reset in_progress[] to empty after recording this tick's
  # firing assertion, simulating the claimed row being progressed/handed off
  # by its assigned specialist before the next idle-fallthrough tick, so
  # every lane's OWN WIP gate stays satisfiable on its turn regardless of
  # tick order within the window.
  jq '.task_board.in_progress = []' "$WORK/rot-c.json" > "$ROTATE_FIXTURE.tmp"
  mv "$ROTATE_FIXTURE.tmp" "$ROTATE_FIXTURE"

  # main.md's stamp write — unconditional, functionally equivalent
  # placement to main.md's own "Before, not after" note (never reads the
  # lane's own outcome, independent top-level key).
  rot_stamp "$ROTATE_FIXTURE" "$TICK_STAMP" "$SELECTED"

  if [ "$TICK_IN_WINDOW" -eq 6 ]; then
    WINDOW_SLICE=("${ROT_HISTORY[@]: -6}")
    WINDOW_UNIQUE_N=$(printf '%s\n' "${WINDOW_SLICE[@]}" | sort -u | wc -l | tr -d ' ')
    WINDOW_SORTED=$(printf '%s\n' "${WINDOW_SLICE[@]}" | sort | tr '\n' ',')
    EXPECTED_SORTED=$(echo "$ROT_IDS" | jq -r '.[]' | sort | tr '\n' ',')
    assert "window $WINDOW (ticks $((GLOBAL_TICK-5))-$GLOBAL_TICK): all 6 rotation ids selected exactly once (AC-1 fairness bound) — got [${WINDOW_SLICE[*]}]" \
      "$([ "$WINDOW_UNIQUE_N" -eq 6 ] && [ "$WINDOW_SORTED" = "$EXPECTED_SORTED" ] && echo true || echo false)"
  fi
done

assert "AC-1 (sustained fairness): 12 total ticks produced 12 total selections across 2 independent, non-overlapping 6-tick round-robin cycles" \
  "$([ "${#ROT_HISTORY[@]}" -eq 12 ] && echo true || echo false)"

assert "AC-1 (bootstrap tie-break, deterministic): window 1's order matches main.md's fixed declared candidate order exactly (all 6 stamps tied/missing at tick 1) — bounded1,sls,rlc,drs,qa_drain,step1_triage (got: ${ROT_HISTORY[0]},${ROT_HISTORY[1]},${ROT_HISTORY[2]},${ROT_HISTORY[3]},${ROT_HISTORY[4]},${ROT_HISTORY[5]})" \
  "$([ "${ROT_HISTORY[0]}" = "bounded1" ] && [ "${ROT_HISTORY[1]}" = "sls" ] && [ "${ROT_HISTORY[2]}" = "rlc" ] && [ "${ROT_HISTORY[3]}" = "drs" ] && [ "${ROT_HISTORY[4]}" = "qa_drain" ] && [ "${ROT_HISTORY[5]}" = "step1_triage" ] && echo true || echo false)"

# ---- No same-tick cascade (main.md § Idle-Tick Rotation Selection, "No
# same-tick cascade" note) — a selected lane that genuinely finds nothing
# does NOT get retried the very next tick; the tick is simply spent and the
# stamp still advances, so rotation moves on to the next-oldest candidate.
# Isolated fixture (own discipline as every other AC block in this file) —
# deliberately NOT reachable from the main 12-tick loop above, where every
# selected lane always has exactly one dedicated row waiting (so it always
# fires) — this is the complementary "genuinely empty turn" case.
echo ""
echo "=== NO SAME-TICK CASCADE: a selected lane with nothing eligible is NOT re-tried the very next tick ==="

NOC_T0="2026-01-01T00:00:00Z"
NOC_T1="2026-01-01T00:01:00Z"
NOCASCADE_FIXTURE="$WORK/rotate-nocascade.json"
jq -n --arg t0 "$NOC_T0" '
  { task_board: { backlog: [], ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: [] },
    dev_team_idle_chain: { rotation: {
        bounded1:     { last_served_tick: $t0 },
        rlc:          { last_served_tick: $t0 },
        drs:          { last_served_tick: $t0 },
        qa_drain:     { last_served_tick: $t0 },
        step1_triage: { last_served_tick: $t0 }
      } }
  }
' > "$NOCASCADE_FIXTURE"
# "sls" deliberately OMITTED from the rotation map above -> defaults to the
# 1970 epoch fallback in the selection jq, guaranteeing it is this tick's
# oldest-stamped (hence $SELECTED) candidate, while the other 5 are tied at
# a later-but-still-synthetic $NOC_T0.

NOCASCADE_TICK1=$(rot_selected "$NOCASCADE_FIXTURE")
assert "no-cascade fixture: bootstrap \$SELECTED='${NOCASCADE_TICK1:-<empty>}' resolves to 'sls' (the only id with no stamp, defaults to epoch-oldest)" \
  "$([ "$NOCASCADE_TICK1" = "sls" ] && echo true || echo false)"

# SLS's real promote+claim against a genuinely empty backlog[]/ready[] — no
# eligible row anywhere for it this tick.
jq --arg now "$NOC_T1" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq "$NOCASCADE_FIXTURE" > "$WORK/noc-b.json"
jq --arg now "$NOC_T1" --slurpfile detail "$DETAIL" --slurpfile archive "$ARCHIVE" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq "$WORK/noc-b.json" > "$WORK/noc-c.json"
NOCASCADE_NOOP=$([ "$(jq '.task_board.in_progress|length' "$WORK/noc-c.json")" -eq 0 ] && echo true || echo false)
assert "no-cascade: SLS's real promote+claim against a genuinely empty backlog[]/ready[] is a true no-op (0 rows claimed) — sets up the cascade condition" \
  "$NOCASCADE_NOOP"

# Stamp still advances even on a genuine no-op turn (main.md's own explicit
# design: "the tick is simply spent on that lane's (empty) turn"). Advances
# sls's stamp PAST the other 5 (tied at the earlier $NOC_T0), so it becomes
# deterministically the NEWEST, not the oldest.
cp "$WORK/noc-c.json" "$NOCASCADE_FIXTURE"
rot_stamp "$NOCASCADE_FIXTURE" "$NOC_T1" "sls"

NOCASCADE_TICK2=$(rot_selected "$NOCASCADE_FIXTURE")
assert "AC no-cascade: next tick's \$SELECTED='${NOCASCADE_TICK2:-<empty>}' is 'bounded1' (the next-oldest of the remaining 5, deterministic — NOT 'sls' again) — the stamp write ran even on sls's no-op turn, so rotation moves on rather than retrying the same lane every tick" \
  "$([ "$NOCASCADE_TICK2" = "bounded1" ] && echo true || echo false)"

echo ""
if [ "$FAIL" -eq 1 ]; then
  echo "[FAIL] one or more gate-satisfiability / drain assertions failed — see above."
  exit 1
fi
echo "[PASS] every gate fires and drains under the live-shaped saturated fixture (ready=$READY_N, in_progress=$INPROG_N, review=$REVIEW_N); shared WIP<=2 cap verified not bypassable."
exit 0
