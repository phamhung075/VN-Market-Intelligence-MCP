#!/usr/bin/env bash
# scripts/audits/po-goahead-producer-verify.sh
#
# Regression verifier for FIX-WF2-SUPERVISED-HOLD-NO-PO-SIDE-GOAHEAD-PRODUCER.
#
# PROBLEM (as filed): dev-team/flow/main.md:467-483's WF-2 SUPERVISED-HOLD gate
# (should_hold jq) requires a key matching `^po_goahead` on the row or `.head`
# before it will resume a supervised in_progress/review/qa task — but
# `grep -rn 'po_goahead' docs/agents/po/ docs/protocols/ .claude/skills/`
# returned zero hits outside the gate's own consumer-side predicate: nothing
# in po/flow/main.md ever instructed PO to WRITE that key. The stamp existed
# only because a PO happened to hand-author the exact pattern ad hoc
# (po_goahead_20260722, po_goahead_20260730T0905 — see
# docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md STEP po-5).
# Same structural class as FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER
# (2026-07-21) — a documented consumer with no documented producer.
#
# This script proves TWO things, neither provable by reading prose alone:
#   DOC CHECK   — docs/agents/po/flow/supervised-goahead.md (the new PO-side
#                 producer step) actually exists and instructs a
#                 `po_goahead_` stamp.
#   MECHANISM   — replaying dev-team/flow/main.md's OWN should_hold predicate
#                 (byte-identical jq, not reimplemented) against a synthetic
#                 fixture: BEFORE the documented stamp is applied,
#                 should_hold=true (the live bug); AFTER applying EXACTLY the
#                 jq pattern documented in supervised-goahead.md, should_hold
#                 flips to false — proving the documented producer's output
#                 shape actually satisfies the documented consumer's gate,
#                 not just that a doc paragraph exists.
#
# Touches NO live file — synthetic fixtures only, no docs/data/orch/
# orch-state.json I/O, no orch-apply.sh call.
#
# Usage: bash scripts/audits/po-goahead-producer-verify.sh

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

fail=0

# --- DOC CHECK: the producer step must exist and instruct the right key shape ---
DOC="docs/agents/po/flow/supervised-goahead.md"
if [ ! -f "$DOC" ]; then
  echo "FAIL: $DOC does not exist — no documented PO-side po_goahead producer." >&2
  fail=1
elif ! grep -qE 'po_goahead_' "$DOC"; then
  echo "FAIL: $DOC exists but does not instruct a po_goahead_ stamp." >&2
  fail=1
else
  echo "[OK] $DOC exists and documents a po_goahead_ stamp."
fi

if ! grep -qE 'supervised-goahead\.md' docs/agents/po/flow/main.md; then
  echo "FAIL: docs/agents/po/flow/main.md has no pointer to supervised-goahead.md — producer step unreachable from PO's dispatch table." >&2
  fail=1
else
  echo "[OK] docs/agents/po/flow/main.md routes to supervised-goahead.md."
fi

# --- MECHANISM: replay dev-team's WF-2 should_hold predicate on synthetic fixtures ---
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

TID="SYNTH-GOAHEAD-1"

cat > "$WORK/detail.json" <<'JSON'
{"items": []}
JSON

# BEFORE: supervised row, no po_goahead anywhere.
cat > "$WORK/before.json" <<JSON
{
  "head": {"active_task_id": "$TID", "next_agent": "developer", "status": "in_progress"},
  "task_board": {
    "in_progress": [{"id": "$TID", "supervised": true, "plan_only": true, "next_agent": "developer"}],
    "review": [],
    "qa": []
  }
}
JSON

should_hold_before=$(jq -r --arg tid "$TID" \
  --slurpfile detail "$WORK/detail.json" \
  -L scripts/lib \
  'include "devteam-eligibility";
   (detail_items_from($detail)) as $detail_items
   | ( [ (.task_board.in_progress // [])[], (.task_board.review // [])[], (.task_board.qa // [])[] ]
       | map(select(.id == $tid or .task_id == $tid)) | first ) as $row
   | (($row != null) and ($row | effective_supervised($detail_items))) as $supervised
   | ( (($row // {}) | keys) + ((.head // {}) | keys) | any(test("^po_goahead"))) as $goahead
   | ($supervised and ($goahead | not)) | tostring' \
  "$WORK/before.json")

if [ "$should_hold_before" != "true" ]; then
  echo "UNEXPECTED: BEFORE fixture did not reproduce should_hold=true (got: $should_hold_before) — WF-2 gate no longer reproducible as documented." >&2
  fail=1
else
  echo "[OK] BEFORE: supervised row + no po_goahead stamp -> should_hold=true (reproduces the live gap)."
fi

# AFTER: apply the EXACT jq pattern documented in supervised-goahead.md — a
# single jq walking in_progress[]/review[]/qa[] and stamping the matching row.
NOW="20260730T163000"
AFTER=$(jq --arg tid "$TID" --arg key "po_goahead_$NOW" --arg note "SYNTH ratification for regression test" \
  '(.task_board.in_progress[], .task_board.review[], .task_board.qa[] | select(.id == $tid or .task_id == $tid)) |= (. + {($key): $note})' \
  "$WORK/before.json")
printf '%s' "$AFTER" > "$WORK/after.json"

should_hold_after=$(jq -r --arg tid "$TID" \
  --slurpfile detail "$WORK/detail.json" \
  -L scripts/lib \
  'include "devteam-eligibility";
   (detail_items_from($detail)) as $detail_items
   | ( [ (.task_board.in_progress // [])[], (.task_board.review // [])[], (.task_board.qa // [])[] ]
       | map(select(.id == $tid or .task_id == $tid)) | first ) as $row
   | (($row != null) and ($row | effective_supervised($detail_items))) as $supervised
   | ( (($row // {}) | keys) + ((.head // {}) | keys) | any(test("^po_goahead"))) as $goahead
   | ($supervised and ($goahead | not)) | tostring' \
  "$WORK/after.json")

if [ "$should_hold_after" != "false" ]; then
  echo "FAIL: AFTER applying the documented po_goahead_ stamp, should_hold did not flip to false (got: $should_hold_after) — the documented producer's output does not satisfy the consumer's gate." >&2
  fail=1
else
  echo "[OK] AFTER: documented po_goahead_ stamp applied to the row -> should_hold=false (WF-2 hold releases)."
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "PASS: po_goahead producer is documented (supervised-goahead.md, routed from main.md) and its stamp shape satisfies dev-team's WF-2 should_hold predicate."
  exit 0
else
  echo "FAIL: see above."
  exit 1
fi
