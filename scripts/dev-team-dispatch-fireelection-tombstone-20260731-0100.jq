# dev-team-dispatch-fireelection-tombstone-20260731-0100.jq
# Moves FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE backlog -> in_progress.
#
# po's daily triage (a79912507646c3cb1, tick 2026-07-31T00:37Z) re-escalated this row P2->P1
# and cleared plan_only, discharging AC-3's "someone must probe first" gate with production
# evidence: 2 duplicate fire-election spawns in 27h (bctc-analyst-slot-3 2026-07-30T21:00Z,
# slot-4 2026-07-31T00:00Z), both snapping to the same minute-precision cron:cowork:<TICK> key.
# RAW-verified by dev-team before dispatching (read the row directly, matches po's RETURN
# verbatim). WIP was 1/2 (FU-MACRO-SNAPSHOT-TIER-WORSTOF/dev-mcp-server in_progress) at the
# time of this write -- confirmed room for exactly 1 more before dispatching.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-dispatch-fireelection-tombstone-20260731-0100.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/po-batch-dispatch-20260731T0100Z" as $src
| "FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE" as $id

| (.task_board.backlog[] | select(.id == $id)) as $picked
| .task_board.backlog = [ .task_board.backlog[] | select(.id != $id) ]
| .task_board.in_progress = ([ $picked
    | .status = "IN_PROGRESS"
    | .updated_at = $now
    | .updated_by = $src
    | .claimed_at = $now
    | .claimed_by = "dev-team (step 3 direct dispatch, po BATCH)"
  ] + .task_board.in_progress)

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
