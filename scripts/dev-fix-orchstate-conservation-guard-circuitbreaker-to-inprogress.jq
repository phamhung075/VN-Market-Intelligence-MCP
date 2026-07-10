# scripts/dev-fix-orchstate-conservation-guard-circuitbreaker-to-inprogress.jq
#
# FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER — backlog[] -> in_progress[].
# Router-adjudicated DIRECT dispatch (supervised:true, bypasses BOUNDED-1 FIFO)
# — row was still in backlog[] when dev-mcp-server picked it up, so this
# specialist performs both the backlog->in_progress and in_progress->review
# moves itself (see companion -to-review.jq).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-orchstate-conservation-guard-circuitbreaker-to-inprogress.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.backlog | map(select(.id == "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER"))) as $claimed
| .task_board.in_progress += ($claimed | map(. + {
    status: "IN_PROGRESS",
    claimed_at: $now,
    claimed_by: "dev-mcp-server"
  })
)
| .task_board.backlog |= map(select(.id != "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER"))
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-mcp-server (FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER -> IN_PROGRESS)"
| .head = {
    status: "in_progress",
    active_task_id: "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER",
    next_agent: "dev-mcp-server",
    next_action: "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER implementation in progress (dev-mcp-server).",
    updated_at: $now,
    updated_by: "dev-mcp-server"
  }
