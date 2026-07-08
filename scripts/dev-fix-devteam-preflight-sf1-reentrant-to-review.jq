# scripts/dev-fix-devteam-preflight-sf1-reentrant-to-review.jq
#
# FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT — backlog[] -> review[] after
# implementation + tests GREEN. developer hands off to qa per
# docs/agents/developer/flow/main.md "Update docs/data/orch/orch-state.json
# .task_board: task status IN_PROGRESS -> REVIEW" (this row skipped
# IN_PROGRESS — router dispatched directly from BACKLOG for a single-cycle
# script fix, same board-lane convention applies).
#
# Syncs .head in the SAME write (known recurring gap called out by the
# dispatch prompt: .head.next_agent must match the board row's next_agent,
# never point back to the flipping agent or go stale).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-devteam-preflight-sf1-reentrant-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.backlog | map(select(.id == "FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "qa",
    reviewed_at: $now,
    reviewed_by: "developer",
    review_note: "Confirmed status_note diagnosis exactly: scripts/agents-flow/dev-team-tick-preflight.sh _step_sf1_claim() inspected only .claimed on a failed claim, unconditionally returning \"peer holds it\" -> SKIP even on self-hold (live-reproduced: 4 consecutive dev-team cron ticks false-SKIP'd while dev-team-cron-singleton was self-held by the calling session, confirmed via task_list_held). Mirrored _step_fire_election()'s existing self-hold branch: compare current_holder.owner_client_session vs self -- self-hold now heartbeat-renews SF-1 and returns 0 (proceed) instead of false-SKIP; genuine peer (different session) unchanged, still SKIPs, still releases nothing. Added T19 (self-hold -> RUN+heartbeat, no release/telegram) + T20 (regression guard: real peer-hold still SKIPs) to dev-team-tick-preflight.test.sh -- 55/55 pass (53 pre-existing + 2 new). Live-verified against the actual production lock: ran the script directly, verdict flipped from the previously-observed SKIP to RUN; task_list_held confirmed both locks still healthy/self-held post-run (TTLs renewed, no corruption). Commit 216205e0c (script + test), ca733ab4a (decision journal). Scope: scripts/agents-flow/ only (cross-service dispatcher fix), no apps/* change, no Docker Close Gate needed."
  })
)
| .task_board.backlog |= map(select(.id != "FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT -> REVIEW)"
| .head = {
    status: "review",
    active_task_id: "FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT",
    next_agent: "qa",
    next_action: "FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT at REVIEW -- qa: verify the SF-1 re-entrant self-hold fix (dev-team-tick-preflight.test.sh 55/55, incl. new T19 self-hold->RUN + T20 peer-hold regression guard) then flip DONE_VERIFIED. No rebuild/deploy needed (bash script + test file only, consumed live by the next dev-team cron tick).",
    updated_at: $now,
    updated_by: "developer"
  }
