# dev-team-flip-ucaslp6-review-20260731-0115.jq
# Moves UC-ASL-P6 backlog -> review, status BACKLOG -> REVIEW, next_agent -> qa.
#
# agent-father (af206873fb233a1c1) completed the doc-purge work (commit 2728636fd, RAW-verified
# by dev-team: all 5 claimed files diffed and match — 3 residual bare "DASHBOARD.md" mentions in
# system-auditor/init.md lengthened to name docs/data/DASHBOARD.md + scripts/emit-dashboard-row.sh;
# main.md RETURN block "NEXT: po (via DASHBOARD.md)" corrected to the real .signal_queue consumer
# path; signal-dashboard/SKILL.md Write protocol line corrected to name scripts/orch-apply.sh
# directly instead of a stale bare temp-then-rename). Correctly declined to touch orch-state.json
# itself -- agent-father's own init.md commit_zone excludes it except a signal-queue DONE-mark,
# which this direct po-manual-dispatch row has none of. Router (dev-team) applies the lane-move.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-flip-ucaslp6-review-20260731-0115.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/agent-father-return-20260731T0115Z" as $src
| "UC-ASL-P6" as $id

| (.task_board.backlog[] | select(.id == $id)) as $picked
| .task_board.backlog = [ .task_board.backlog[] | select(.id != $id) ]
| .task_board.review = ([ $picked
    | .status = "REVIEW"
    | .next_agent = "qa"
    | .updated_at = $now
    | .updated_by = $src
  ] + .task_board.review)
