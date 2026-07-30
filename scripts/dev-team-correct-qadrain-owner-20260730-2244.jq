# dev-team-correct-qadrain-owner-20260730-2244.jq
# agent-father (a57a5ada366fd2667) declined FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL:
# system-map.json zones[cross-service].specialist="developer" (path scripts/), not agent-father --
# RAW-verified by dev-team (jq'd system-map.json directly, read agent-father/init.md's own
# not_my_job/commit_zone fields, confirmed commit c72b5ca34 touched only journal+notebook,
# confirmed target script + board row both untouched). Root cause: architecture-briefs/
# 2026-07-29-qadrain-head-slot-decouple.md §8 mis-titled "for agent-father"; po's triage copied
# it without checking system-map.json. Correcting owner/next_agent only -- AC-1/2/3 and the
# brief itself are unaffected, id/status/priority/zone/desc/files all untouched.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-correct-qadrain-owner-20260730-2244.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL" as $id
| .task_board.backlog = (.task_board.backlog | map(
    if .id == $id then
      .owner = "developer"
      | .next_agent = "developer"
      | .updated_at = $now
      | .source_correction = "dev-team 2026-07-30T22:44Z: reassigned agent-father -> developer per system-map.json zones[cross-service].specialist; agent-father declined (commit c72b5ca34), zero code/board touched by the decline"
    else . end
  ))
