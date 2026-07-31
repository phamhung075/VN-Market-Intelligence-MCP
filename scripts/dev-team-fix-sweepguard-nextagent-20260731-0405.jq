# dev-team-fix-sweepguard-nextagent-20260731-0405.jq
# agent-father correctly declined FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-
# MISADJUDICATION: implementing it requires editing scripts/git-hooks/pre-commit
# (production bash, outside agent-father's commit_zone/forbidden_outputs) plus
# flipping .task_board via orch-apply.sh (also excluded). This was dev-team's own
# dispatch error -- the architect brief's own "agent-father implements" line
# (§ Status) was never cross-checked against agent-father's actual scope rules
# before dispatching. Correcting next_agent (still stale at agents-architect,
# whose piece -- the brief -- is already delivered) to developer, per
# .claude/skills/dispatch/SKILL.md "bug / broken (code) -- tracked fix" routing.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-fix-sweepguard-nextagent-20260731-0405.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/sweepguard-reroute-developer-20260731T0405Z" as $src

| .task_board.in_progress = [ .task_board.in_progress[]
    | if .id == "FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION" then
        .next_agent = "developer"
        | .owner = "developer"
        | .updated_at = $now
        | .updated_by = $src
        | .agentfather_decline_note = "agent-father correctly declined 2026-07-31T04:00Z: implementation requires scripts/git-hooks/pre-commit (production code, outside commit_zone/forbidden_outputs) + orch-state.json task_board flip (also excluded). Re-routed to developer per dispatch/SKILL.md. Brief (docs/architecture-briefs/2026-07-31-sweepguard-escalation-actuator-and-triage-mechanism-check.md, commit 7cfe64c8b) is implementation-ready, no re-design needed."
      else . end
  ]

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
