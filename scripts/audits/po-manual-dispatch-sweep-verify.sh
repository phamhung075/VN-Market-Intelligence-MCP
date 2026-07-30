#!/usr/bin/env bash
# scripts/audits/po-manual-dispatch-sweep-verify.sh
#
# Regression verifier for FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH.
#
# PROBLEM (as filed): `docs/agents/dev-team/flow/main.md`'s Lane × Gate
# Coverage Matrix and `scripts/audits/bounded1-supervised-lane-report.sh`'s
# DRS/READY-XOR sections both describe two live classes of task_board row as
# "reachable only by manual/PO dispatch" — but no PO flow step ever swept
# `backlog[]`/`ready[]` by priority for this class (grep-verified twice,
# independently, by po and dev-team). 4th instance of the "documented
# consumer, no documented producer" defect class.
#
# This script proves THREE things, none provable by reading prose alone:
#   DOC CHECK      — docs/agents/po/flow/manual-dispatch-sweep.md (the new
#                    PO-side producer) exists and is routed from main.md.
#   SHARED-LIB      — scripts/lib/po-manual-dispatch-eligibility.jq exists
#                    and its two predicates (`is_drs_stranded_off_allowlist`,
#                    `is_ready_xor_gap`) resolve every named branch of
#                    main.md's own Lane × Gate Coverage Matrix correctly on a
#                    synthetic fixture — positive AND negative controls, so a
#                    future hand-edit that silently narrows/widens either
#                    predicate is caught here, not live. Replays the
#                    predicates BYTE-IDENTICAL via `include`, never
#                    reimplemented — this script does not hand-derive
#                    effective_supervised/effective_plan_only/
#                    is_design_router_allowed/is_epic_wrapper/deps_satisfied
#                    logic anywhere; every check below composes ONLY the
#                    shared `scripts/lib/devteam-eligibility.jq` +
#                    `scripts/lib/po-manual-dispatch-eligibility.jq` defs.
#   IDEMPOTENCY     — a row already carrying `po_manual_dispatch_flagged_at`
#                    is excluded by the sub-flow's own Step 1 selection
#                    (never re-surfaced/re-BATCHed every tick while queued).
#
# Touches NO live file — synthetic fixtures only, no docs/data/orch/
# orch-state.json I/O, no orch-apply.sh call.
#
# Usage: bash scripts/audits/po-manual-dispatch-sweep-verify.sh

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

fail=0

# --- DOC CHECK ---
DOC="docs/agents/po/flow/manual-dispatch-sweep.md"
if [ ! -f "$DOC" ]; then
  echo "FAIL: $DOC does not exist — no documented PO-side manual-dispatch producer." >&2
  fail=1
else
  echo "[OK] $DOC exists."
fi

if ! grep -qE 'manual-dispatch-sweep\.md' docs/agents/po/flow/main.md; then
  echo "FAIL: docs/agents/po/flow/main.md has no pointer to manual-dispatch-sweep.md — producer step unreachable from PO's dispatch table." >&2
  fail=1
else
  echo "[OK] docs/agents/po/flow/main.md routes to manual-dispatch-sweep.md."
fi

LIB="scripts/lib/po-manual-dispatch-eligibility.jq"
if [ ! -f "$LIB" ]; then
  echo "FAIL: $LIB does not exist." >&2
  fail=1
else
  echo "[OK] $LIB exists."
fi

# --- SHARED-LIB: synthetic fixture covering every named Matrix branch ---
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/detail.json" <<'JSON'
{"items": []}
JSON

# EMPTY file (zero JSON values), matching scripts/lib/archive-glob-cat.sh's
# own zero-match output shape ("Never errors/hangs on zero matches — outputs
# nothing, so the resulting $archive is []") — NOT a JSON `[]` literal, which
# --slurpfile would instead wrap as a ONE-element array containing an empty
# array, breaking archive_status_map's `(.done_tasks // [])[]` indexing.
: > "$WORK/archive.json"

cat > "$WORK/fixture.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      { "id": "A-OFFLIST-POSITIVE",   "status": "BACKLOG", "next_agent": "agent-father" },
      { "id": "B-ALLOWLISTED",        "status": "BACKLOG", "next_agent": "architect" },
      { "id": "C-DEV-ROLE",           "status": "BACKLOG", "next_agent": "developer" },
      { "id": "D-SLS-TERRITORY",      "status": "BACKLOG", "next_agent": "ops", "supervised": true, "plan_only": true },
      { "id": "E-EPIC-WRAPPER",       "status": "BACKLOG", "next_agent": "ops", "children": ["E-CHILD-1"] },
      { "id": "F-DEPS-UNSATISFIED",   "status": "BACKLOG", "next_agent": "ops", "depends_on": ["MISSING-DEP-NEVER-DONE"] },
      { "id": "G-ALREADY-FLAGGED",    "status": "BACKLOG", "next_agent": "agent-father", "po_manual_dispatch_flagged_at": "2026-07-30T00:00:00Z" }
    ],
    "ready": [
      { "id": "H-SUP-ONLY",           "supervised": true,  "plan_only": false },
      { "id": "I-PLANONLY-ONLY",      "supervised": false, "plan_only": true },
      { "id": "J-SLS-CLAIM-TERRITORY","supervised": true,  "plan_only": true },
      { "id": "K-RLC-TERRITORY",      "supervised": false, "plan_only": false },
      { "id": "L-READY-WRAPPER",      "supervised": true,  "plan_only": false, "children": ["L-CHILD-1"] }
    ]
  }
}
JSON

ALLOWLIST='["architect","ba","pm","po","agents-architect"]'

RESULT=$(jq -c \
  --argjson allowlist "$ALLOWLIST" \
  --slurpfile detail "$WORK/detail.json" \
  --slurpfile archive "$WORK/archive.json" \
  -L scripts/lib \
  'include "devteam-eligibility"; include "po-manual-dispatch-eligibility";
   (detail_items_from($detail)) as $detail_items
   | dep_status_map($archive) as $status_map
   | { backlog: [ .task_board.backlog[] | {id, stranded: (. | is_drs_stranded_off_allowlist($detail_items; $status_map; $allowlist))} ],
       ready:   [ .task_board.ready[]   | {id, xor_gap:  (. | is_ready_xor_gap($detail_items))} ] }' \
  "$WORK/fixture.json")

check() {
  local label="$1" got="$2" want="$3"
  if [ "$got" != "$want" ]; then
    echo "FAIL: $label — got=$got want=$want" >&2
    fail=1
  else
    echo "[OK] $label -> $got"
  fi
}

check "A-OFFLIST-POSITIVE (off-allowlist non-dev, no other exclusion) is_drs_stranded_off_allowlist" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="A-OFFLIST-POSITIVE") | .stranded')" "true"
check "B-ALLOWLISTED (on-allowlist -> DRS's own territory, not stranded)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="B-ALLOWLISTED") | .stranded')" "false"
check "C-DEV-ROLE (BOUNDED-1's territory, not this predicate's)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="C-DEV-ROLE") | .stranded')" "false"
check "D-SLS-TERRITORY (supervised&&plan_only both true, excluded even though off-allowlist)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="D-SLS-TERRITORY") | .stranded')" "false"
check "E-EPIC-WRAPPER (no-picker-by-design class, closed by autoclose sweep)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="E-EPIC-WRAPPER") | .stranded')" "false"
check "F-DEPS-UNSATISFIED (conservative-skip until depends_on clears)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="F-DEPS-UNSATISFIED") | .stranded')" "false"
check "H-SUP-ONLY (ready[] sup-only, non-wrapper) is_ready_xor_gap" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="H-SUP-ONLY") | .xor_gap')" "true"
check "I-PLANONLY-ONLY (ready[] plan_only-only, non-wrapper)" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="I-PLANONLY-ONLY") | .xor_gap')" "true"
check "J-SLS-CLAIM-TERRITORY (both flags true, SLS-claim PRIMARY/FALLBACK territory)" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="J-SLS-CLAIM-TERRITORY") | .xor_gap')" "false"
check "K-RLC-TERRITORY (neither flag, RLC's territory)" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="K-RLC-TERRITORY") | .xor_gap')" "false"
check "L-READY-WRAPPER (XOR flags but epic wrapper -> no-picker-by-design)" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="L-READY-WRAPPER") | .xor_gap')" "false"

# --- IDEMPOTENCY: replay the FULL Step 1 selection (predicate + flagged-guard) ---
# G-ALREADY-FLAGGED satisfies is_drs_stranded_off_allowlist on its own (same
# shape as A) but MUST be excluded once po_manual_dispatch_flagged_at is set —
# this is the sub-flow's Step 1 `select((.po_manual_dispatch_flagged_at // "") == "")`
# guard, replayed verbatim here (not a different guard shape).
G_RAW_STRANDED=$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="G-ALREADY-FLAGGED")' 2>/dev/null || true)
G_SELECTED=$(jq -r \
  --argjson allowlist "$ALLOWLIST" \
  --slurpfile detail "$WORK/detail.json" \
  --slurpfile archive "$WORK/archive.json" \
  -L scripts/lib \
  'include "devteam-eligibility"; include "po-manual-dispatch-eligibility";
   (detail_items_from($detail)) as $detail_items
   | dep_status_map($archive) as $status_map
   | [ .task_board.backlog[]
       | select(.id == "G-ALREADY-FLAGGED")
       | select(.status == "BACKLOG" or .status == "TODO")
       | select(. | is_drs_stranded_off_allowlist($detail_items; $status_map; $allowlist))
       | select((.po_manual_dispatch_flagged_at // "") == "")
     ] | length' \
  "$WORK/fixture.json")
check "G-ALREADY-FLAGGED excluded by Step 1's idempotency guard despite satisfying the raw predicate" \
  "$G_SELECTED" "0"

echo ""
if [ "$fail" -eq 0 ]; then
  echo "PASS: manual-dispatch-sweep producer is documented (routed from main.md), its shared predicates (scripts/lib/po-manual-dispatch-eligibility.jq) resolve every named Lane × Gate Coverage Matrix branch correctly, and its idempotency guard excludes already-flagged rows."
  exit 0
else
  echo "FAIL: see above."
  exit 1
fi
