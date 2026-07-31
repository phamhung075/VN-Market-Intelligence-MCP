# dev-team-dispatch-po-batch-20260731-0141.jq
# Moves 2 of po's 4 new rows backlog -> in_progress (TE-T08 handled via on-demand
# mutex-wrap, no lane-move needed for agent-father's maintenance-lane pattern).
#
# po's daily triage (a4c26a8609db8b7f6, tick 2026-07-31T01:32Z-ish) minted 4 rows +
# corrected 3 existing rows. Per po's own explicit dispatch note: "entry #1 is the
# only one that should take the free dev slot. #2 routes to agents-architect...
# neither consumes a dev WIP slot". WIP confirmed 1/2 (only FIX-COWORK-FIRE-ELECTION-
# TICK-TOMBSTONE in_progress) before this write -- room for exactly 1 more dev-track
# task. RAW-verified by dev-team before dispatching: read both rows directly, matches
# po's RETURN verbatim (root_cause/evidence fields present and consistent).
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-dispatch-po-batch-20260731-0141.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/po-batch-dispatch-20260731T0141Z" as $src

| (.task_board.backlog[] | select(.id == "FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A")) as $head_stamp
| (.task_board.backlog[] | select(.id == "FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION")) as $sweepguard

| .task_board.backlog = [ .task_board.backlog[]
    | select(.id != "FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A")
    | select(.id != "FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION")
  ]

| .task_board.in_progress = ([
    ($head_stamp
      | .status = "IN_PROGRESS"
      | .next_agent = "developer"
      | .updated_at = $now
      | .updated_by = $src
      | .claimed_at = $now
      | .claimed_by = "dev-team (step 3 direct dispatch, po BATCH #1, takes free dev WIP slot)"
    ),
    ($sweepguard
      | .status = "IN_PROGRESS"
      | .next_agent = "agents-architect"
      | .updated_at = $now
      | .updated_by = $src
      | .claimed_at = $now
      | .claimed_by = "dev-team (step 3 direct dispatch, po BATCH #2, routes to agents-architect per po's own routing note, does not consume dev WIP slot)"
    )
  ] + .task_board.in_progress)

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
