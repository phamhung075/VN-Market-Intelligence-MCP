# dev-team-dispatch-po-batch-20260731-2257.jq
#
# Dispatches both rows minted/surfaced by po's triage tick 2026-07-31T22:37Z
# (agent af23bd889bcb7970a, task:po-triage-20260731):
#   1. FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L — type FIX, zone
#      apps/technical-analysis/ (explicit, Tier-1 zone-detect) -> dev-technical-analysis.
#      Consumes the free dev WIP slot (WIP confirmed 1/2 before this write —
#      only FIX-FOREIGN-FLOW-DEAD-ENDPOINT in_progress).
#   2. TE-T14 — type CLEAN, next_agent already set to "agent-father" on the row
#      per PO ARTIFACT-CLASS ROUTING RULING 2026-07-21T18:42Z (docs/agents/**
#      instruction-prose artifact routes to agent-father, not qa/developer;
#      zone-detect has no path to agent-father by design, so this row requires
#      deliberate router dispatch — mirrors the BATCH #2 precedent in
#      scripts/dev-team-dispatch-po-batch-20260731-0141.jq). Does NOT consume
#      the dev WIP slot.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-dispatch-po-batch-20260731-2257.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/po-batch-dispatch-20260731T2257Z" as $src

| (.task_board.backlog[] | select(.id == "FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L")) as $sizelint
| (.task_board.backlog[] | select(.id == "TE-T14")) as $tet14

| .task_board.backlog = [ .task_board.backlog[]
    | select(.id != "FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L")
    | select(.id != "TE-T14")
  ]

| .task_board.in_progress = ([
    ($sizelint
      | .status = "IN_PROGRESS"
      | .next_agent = "dev-technical-analysis"
      | .updated_at = $now
      | .updated_by = $src
      | .claimed_at = $now
      | .claimed_by = "dev-team (step 3 direct dispatch, FIX type skips straight to execution per main.md Step 2, takes free dev WIP slot)"
    ),
    ($tet14
      | .status = "IN_PROGRESS"
      | .updated_at = $now
      | .updated_by = $src
      | .claimed_at = $now
      | .claimed_by = "dev-team (step 3 direct dispatch, next_agent=agent-father per po_routing_ruling_20260721 already on row, does not consume dev WIP slot)"
    )
  ] + .task_board.in_progress)

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
