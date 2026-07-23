#!/usr/bin/env bash
# devteam-bounded1-prose-sequencing-gate-verify.sh
# Regression verifier for FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE
# (dev, 2026-07-23). Mirrors the pattern established by
# scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh.
#
# ROOT CAUSE this closes: PO-authored sequencing constraints written in
# prose fields (`po_sequencing_YYYYMMDD` keys) were INVISIBLE to
# scripts/lib/devteam-eligibility.jq's `effective_depends_on()`, which only
# ever reads `.depends_on`/`.depends`/`.blocked_by`. 2026-07-22:
# dev-team BOUNDED-1 blind-promoted UC-CDC-P5 (its PART-3/3 ordering
# constraint lived ONLY in `.po_sequencing_20260722`) then had to revert —
# a mis-promote+revert churn cycle on a P1 row, acutely contained by
# hand-installing `depends_on` on that one row. The fix
# (`has_unbacked_sequencing_prose` + its conjunct in `is_bounded1_eligible`,
# both in scripts/lib/devteam-eligibility.jq) closes the gate generically
# for the NEXT prose-only-sequenced row: a row carrying a `po_sequencing_*`
# key (board OR detail) with an EMPTY effective `depends_on` is withheld
# from BOUNDED-1 auto-dispatch (conservative-skip) until the ordering is
# machine-encoded. The gate deliberately does NOT parse the prose to infer
# a predecessor task-id (regex-mining English sentences for control flow is
# brittle) — it only detects the unbacked condition and forces the
# dependency to be encoded as real `depends_on`.
#
# Proves:
#   AC-1  (SYNTHETIC): a row carrying a `po_sequencing_*` key with EMPTY
#         depends_on/depends/blocked_by is NEVER bounded1-eligible (NOT
#         promoted), even forced to top priority with every other gate
#         clean.
#   AC-1b (SYNTHETIC): the SAME shape, with `depends_on` populated
#         referencing a predecessor that IS `DONE_VERIFIED` in the same
#         document, IS bounded1-eligible (promoted) — proves the gate is
#         LIFTED the instant the ordering is machine-encoded, not a
#         permanent block on any row that happens to also carry PO prose.
#   AC-1c (SYNTHETIC): same as AC-1 but the `po_sequencing_*` key lives on
#         the DETAIL side (`backlog-detail.json` `.items[<id>]`) instead of
#         inline on the board row, with NO inline board depends_on/depends/
#         blocked_by either — proves the board-OR-detail OR-precedence
#         (mirroring every sibling `effective_*` predicate in the shared
#         library) is honored, not just the inline board case.
#   AC-2  (LIVE, dynamic — NO hardcoded task-id): any CURRENT task_board row
#         (any lane) carrying a `po_sequencing_*` key AND a non-empty
#         `effective_depends_on` that is NOT (yet) satisfied
#         (`deps_satisfied` false) — the live UC-CDC-P5 shape, discovered
#         by predicate, never by literal id — stays `is_bounded1_eligible
#         == false` against the UNMODIFIED live document. Proves the new
#         gate does not spuriously re-flag a row whose ordering IS already
#         machine-encoded (it is correctly held by the pre-existing
#         `deps_satisfied` gate instead, not double-counted).
#   CONTROL (SYNTHETIC): a clean row with NO `po_sequencing_*` key anywhere
#         (board or detail) and otherwise eligible is unaffected by this
#         fix — still bounded1-eligible (promoted). Proves the new gate
#         does not over-block rows that never opted into prose sequencing.
#
# READ-ONLY: never writes back to the live orch-state.json/backlog-detail.json
# (no orch-apply.sh call anywhere) — all fixtures are synthetic copies in a
# mktemp scratch dir, discarded on exit. AC-2's candidate is discovered
# dynamically from live data at runtime (no hardcoded task-id literals,
# grep-verified) and evaluated read-only against the live document.
# AC-1/AC-1b/AC-1c/CONTROL use clearly-labeled synthetic `ZZ-SYNTH-*` ids
# (never real task ids), mirroring the sibling verifier's discipline.
#
# Portability note: written for macOS default /bin/bash 3.2 (no mapfile, no
# nameref) — plain newline-delimited scratch files + `while read` avoided
# entirely here (no live-data pools needed beyond AC-2's single lookup).
#
# Usage: bash scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh
# Exit 0 = all assertions pass (AC-2 is SKIPPED, not failed, if no live
# fixture candidate currently exists for it).
# Exit 1 = a regression was detected — prints which assertion failed.

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATE="docs/data/orch/orch-state.json"
DETAIL="docs/data/orch/archive/backlog-detail.json"
PROMOTE_JQ="scripts/devteam-backlog-promote-bounded1.jq"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

NOW="2026-01-01T00:00:00Z"   # fixed synthetic timestamp — value irrelevant to the assertions
FAIL=0

JQ_DEFS='include "scripts/lib/devteam-eligibility";'

run_promote_picked_id() {
  # $1 = synthetic state json path, $2 = detail json path -> prints picked
  # ready[] id (or empty). Mirrors the sibling verifier's helper.
  jq --arg now "$NOW" --slurpfile detail "$2" -f "$PROMOTE_JQ" "$1" \
    | jq -r '.task_board.ready[0].id // empty'
}

eval_eligible_live() {
  # $1 = id -> prints true/false/MISSING for is_bounded1_eligible evaluated
  # against the CURRENT UNMODIFIED live $STATE + $DETAIL (read-only; no
  # isolation — the point is to prove the REAL live row, with its REAL
  # predecessor statuses, stays held).
  jq -r --arg id "$1" --slurpfile detail "$DETAIL" \
    "$JQ_DEFS"'
    (detail_items_from($detail)) as $detail_items
    | (dep_status_map) as $status_map
    | ( [ .task_board | to_entries[] | select(.value|type=="array")
          | .value[]? | select(type=="object" and .id == $id) ] | first ) as $row
    | if $row == null then "MISSING"
      else ($row | is_bounded1_eligible($detail_items; $status_map) | tostring)
      end
  ' "$STATE"
}

empty_detail() { echo '{"items":[]}' > "$1"; }

# ---------------------------------------------------------------------------
# AC-1: SYNTHETIC. Board-inline po_sequencing_* key, no depends_on anywhere
# -> must NEVER be promoted.
# ---------------------------------------------------------------------------
jq -n '
  { task_board: {
      backlog: [ { id: "ZZ-SYNTH-PROSESEQ-UNBACKED", status: "BACKLOG",
                    priority: "P0", next_agent: "developer",
                    po_sequencing_20260101: "SEQUENCED BY PO: land after a sibling row (prose only, no depends_on installed yet)." } ],
      ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }
' > "$WORK/ac1.json"
empty_detail "$WORK/ac1-detail.json"
AC1_PICKED=$(run_promote_picked_id "$WORK/ac1.json" "$WORK/ac1-detail.json")
if [ "$AC1_PICKED" = "ZZ-SYNTH-PROSESEQ-UNBACKED" ]; then
  echo "[FAIL] AC-1 regression: unbacked-prose-sequencing row WAS promoted"
  FAIL=1
else
  echo "[PASS] AC-1: unbacked-prose-sequencing row NOT promoted (picked='${AC1_PICKED:-<none>}')"
fi

# ---------------------------------------------------------------------------
# AC-1b: SYNTHETIC. SAME shape, but depends_on now references a predecessor
# that IS DONE_VERIFIED in the same doc -> must be promoted (gate lifted the
# instant the ordering is machine-encoded).
# ---------------------------------------------------------------------------
jq -n '
  { task_board: {
      backlog: [ { id: "ZZ-SYNTH-PROSESEQ-BACKED", status: "BACKLOG",
                    priority: "P0", next_agent: "developer",
                    depends_on: ["ZZ-SYNTH-PROSESEQ-PREDECESSOR"],
                    po_sequencing_20260101: "SEQUENCED BY PO: land after ZZ-SYNTH-PROSESEQ-PREDECESSOR (now machine-encoded via depends_on)." } ],
      ready: [], in_progress: [], qa: [], review: [], done: [],
      done_verified: [ { id: "ZZ-SYNTH-PROSESEQ-PREDECESSOR", status: "DONE_VERIFIED" } ]
    } }
' > "$WORK/ac1b.json"
empty_detail "$WORK/ac1b-detail.json"
AC1B_PICKED=$(run_promote_picked_id "$WORK/ac1b.json" "$WORK/ac1b-detail.json")
if [ "$AC1B_PICKED" = "ZZ-SYNTH-PROSESEQ-BACKED" ]; then
  echo "[PASS] AC-1b: same row with depends_on populated (dep DONE_VERIFIED) IS promoted (picked='$AC1B_PICKED')"
else
  echo "[FAIL] AC-1b regression: prose+backed-depends_on row was NOT promoted (picked='${AC1B_PICKED:-<none>}')"
  FAIL=1
fi

# ---------------------------------------------------------------------------
# AC-1c: SYNTHETIC. po_sequencing_* key lives on the DETAIL side instead of
# inline on the board row, no depends_on anywhere -> must NEVER be promoted
# (board-OR-detail OR-precedence, mirrors every sibling effective_* def).
# ---------------------------------------------------------------------------
jq -n '
  { task_board: {
      backlog: [ { id: "ZZ-SYNTH-PROSESEQ-DETAILSIDE", status: "BACKLOG",
                    priority: "P0", next_agent: "developer", detail_ref: "x#ZZ-SYNTH-PROSESEQ-DETAILSIDE" } ],
      ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }
' > "$WORK/ac1c.json"
jq -n '{ items: [ { id: "ZZ-SYNTH-PROSESEQ-DETAILSIDE", po_sequencing_20260101: "SEQUENCED BY PO (detail-side prose): land after a sibling row." } ] }' > "$WORK/ac1c-detail.json"
AC1C_PICKED=$(run_promote_picked_id "$WORK/ac1c.json" "$WORK/ac1c-detail.json")
if [ "$AC1C_PICKED" = "ZZ-SYNTH-PROSESEQ-DETAILSIDE" ]; then
  echo "[FAIL] AC-1c regression: detail-side unbacked-prose-sequencing row WAS promoted"
  FAIL=1
else
  echo "[PASS] AC-1c: detail-side unbacked-prose-sequencing row NOT promoted (picked='${AC1C_PICKED:-<none>}')"
fi

# ---------------------------------------------------------------------------
# AC-2: LIVE, dynamic discovery — NO hardcoded task-id. Any current
# task_board row (any lane) carrying a po_sequencing_* key AND a non-empty
# effective_depends_on that is NOT satisfied (the live UC-CDC-P5 shape) ->
# must stay is_bounded1_eligible == false against the unmodified live doc.
# ---------------------------------------------------------------------------
AC2_ID=$(jq -r --slurpfile detail "$DETAIL" "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | (dep_status_map) as $status_map
  | [ .task_board | to_entries[] | select(.value|type=="array") | .value[]?
      | select(type=="object")
      | select(keys[] | test("^po_sequencing"))
      | select((. | effective_depends_on($detail_items) | length) > 0)
      | select((. | deps_satisfied($detail_items; $status_map)) | not)
      | .id
    ] | first // empty
' "$STATE")

if [ -n "$AC2_ID" ]; then
  AC2_ELIGIBLE=$(eval_eligible_live "$AC2_ID")
  if [ "$AC2_ELIGIBLE" = "false" ]; then
    echo "[PASS] AC-2 (live, dynamic): prose-sequenced + dep-unsatisfied row $AC2_ID stays NOT bounded1-eligible (held by deps_satisfied, not spuriously affected by the new gate)"
  else
    echo "[FAIL] AC-2 regression (live): prose-sequenced + dep-unsatisfied row $AC2_ID is bounded1-eligible='$AC2_ELIGIBLE' (expected false)"
    FAIL=1
  fi
else
  echo "[SKIP] AC-2: no live row currently carries a po_sequencing_* key with a non-empty-but-unsatisfied depends_on"
fi

# ---------------------------------------------------------------------------
# CONTROL: SYNTHETIC. Clean row, no po_sequencing_* key anywhere -> must
# still be promoted (new gate does not over-block rows without prose).
# ---------------------------------------------------------------------------
jq -n '
  { task_board: {
      backlog: [ { id: "ZZ-SYNTH-PROSESEQ-CONTROL-CLEAN", status: "BACKLOG",
                    priority: "P0", next_agent: "developer" } ],
      ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
    } }
' > "$WORK/control.json"
empty_detail "$WORK/control-detail.json"
CONTROL_PICKED=$(run_promote_picked_id "$WORK/control.json" "$WORK/control-detail.json")
if [ "$CONTROL_PICKED" = "ZZ-SYNTH-PROSESEQ-CONTROL-CLEAN" ]; then
  echo "[PASS] control: clean row (no po_sequencing_* key) still promoted (gate does not over-block)"
else
  echo "[FAIL] control regression: clean row was NOT promoted (picked='${CONTROL_PICKED:-<none>}')"
  FAIL=1
fi

exit $FAIL
