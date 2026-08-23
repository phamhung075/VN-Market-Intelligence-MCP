#!/usr/bin/env bash
# devteam-deps-satisfied-sole-failure-report.sh
#
# FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION (P0), architect brief
# docs/architecture-briefs/2026-08-08-donelane-doneverified-producer.md §2
# Component 5 (AC-6 regression instrument).
#
# ROOT CAUSE this detects: scripts/lib/devteam-eligibility.jq deps_satisfied()
# requires EVERY dep to resolve to the exact string DONE_VERIFIED — a dep
# sitting at plain DONE (or MISSING, or anything else non-terminal-verified)
# starves its successor forever, silently, unless someone hand-derives the jq
# each time (as PO did by hand on 2026-07-30,
# scripts/po-triage-20260730T2148-donelane-doneverified-producer-starvation.jq
# 's own header — "leg 1"). This script MECHANIZES that hand-derivation so the
# class is detectable next time without re-deriving it from scratch (AC-6).
#
# Read-only, live board — NEVER calls orch-apply.sh, never mutates
# docs/data/orch/orch-state.json. Reuses is_bounded1_eligible's 7 sub-gates +
# deps_satisfied/dep_status_map from the REAL scripts/lib/devteam-eligibility.jq
# verbatim (no reimplementation — AC-6's own wording requires this), threaded
# through the SAME --slurpfile detail / --slurpfile archive pattern every
# other picker/report in this file family uses (scripts/lib/archive-glob-cat.sh
# for the cold-archive union, so a dep that resolved DONE_VERIFIED in a prior
# month's cold file is not misread as MISSING — same guard
# FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING already fixed one
# level up).
#
# Candidate lane: task_board.backlog[] + task_board.ready[] (matches
# is_bounded1_eligible's own intended scope — the auto-pickup-eligible
# lanes, NOT in_progress[]/review[]/qa[]/done[], which have their own
# reachability stories).
#
# Selects every candidate that fails is_bounded1_eligible with
# deps_satisfied() as the SOLE failing gate (every other sub-gate passes) —
# i.e. rows that are otherwise completely eligible for auto-dispatch and are
# ONLY blocked by the DONE-vs-DONE_VERIFIED token gap. For each such row,
# reports every unmet dep with its RAW resolved status (DONE, MISSING, or any
# other non-DONE_VERIFIED value) — directly satisfies AC(5)'s "any row still
# starved must have a named reason."
#
# Exit code: ALWAYS 0. Pure reporting/detection tool, same informational
# posture as bounded1-supervised-lane-report.sh's SECONDARY section — there is
# no "is the mechanism reachable" claim to falsify here; this script IS the
# detector, not a reachability gate. A non-empty starved set is not itself a
# test failure (whether it's currently non-empty is exactly the fact this
# script exists to surface, not adjudicate).
#
# Usage:
#   bash scripts/audits/devteam-deps-satisfied-sole-failure-report.sh          # human table
#   bash scripts/audits/devteam-deps-satisfied-sole-failure-report.sh --json   # {"starved":[...]}
#
# Pointer: docs/agents/dev-team/flow/main.md — informational instrument, no
# call site required for it to satisfy its own AC (read-only, run on demand).
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATE="docs/data/orch/orch-state.json"
DETAIL="docs/data/orch/archive/backlog-detail.json"
MODE="table"
if [ "${1:-}" = "--json" ]; then
  MODE="json"
fi

JQ_PROG='
include "scripts/lib/devteam-eligibility";

(detail_items_from($detail)) as $detail_items
| (dep_status_map($archive)) as $status_map
| [ (.task_board.backlog + .task_board.ready)[]
    | select(
        (effective_supervised($detail_items) != true)
        and (is_epic_wrapper($detail_items) != true)
        and (is_detail_deferred($detail_items) != true)
        and (is_non_dev_owner_unrouted($detail_items) != true)
        and (effective_plan_only($detail_items) != true)
        and (is_non_dev_next_agent_unrouted($detail_items) != true)
        and (has_unbacked_sequencing_prose($detail_items) != true)
      )
    | select(deps_satisfied($detail_items; $status_map) | not)
    | (effective_depends_on($detail_items)) as $deps
    | { id, priority,
        unmet: [ $deps[] | ($status_map[.] // "MISSING") as $s
                 | select($s != "DONE_VERIFIED") | {dep: ., status: $s} ] }
  ]
'

RESULT="$(jq -c --slurpfile detail "$DETAIL" --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
  "$JQ_PROG" "$STATE")"

if [ "$MODE" = "json" ]; then
  echo "$RESULT" | jq -c '{starved: .}'
  exit 0
fi

echo "=== deps_satisfied()-sole-failure report — backlog[] + ready[], is_bounded1_eligible's other 7 gates all PASS ==="
echo "  (mechanizes evidence_raw_verified_20260730T2148 leg 1 — every row below is otherwise fully auto-dispatch-eligible and ONLY blocked because an unmet dep resolves to something other than the exact string DONE_VERIFIED)"
echo ""
printf '%-52s %-9s %s\n' "ID" "PRIORITY" "UNMET DEP(S) [status]"
printf '%-52s %-9s %s\n' "----------------------------------------------------" "---------" "----------------------"
echo "$RESULT" | jq -r '.[] | [.id, .priority, ([.unmet[] | .dep + " [" + .status + "]"] | join(", "))] | @tsv' \
  | while IFS=$'\t' read -r id priority reasons; do
      printf '%-52s %-9s %s\n' "$id" "$priority" "$reasons"
    done

TOTAL=$(echo "$RESULT" | jq 'length')
echo ""
echo "Starved rows (deps_satisfied sole failure): $TOTAL"
echo ""
echo "[INFO] read-only detector, always exits 0 — a non-empty count is a finding to triage, not a gate failure."
exit 0
