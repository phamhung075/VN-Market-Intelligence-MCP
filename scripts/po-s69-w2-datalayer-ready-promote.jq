# po-s69: promote FIX-ERRAUDIT-W2-MCP-DATALAYER backlog->ready for the one free coding slot,
# and set the single canonical top-level .head to it for router pickup.
# Pointer: docs/agents/po/flow/main.md (PO is the SOLE .head writer).
# Invoke: jq -f scripts/po-s69-w2-datalayer-ready-promote.jq orch-state.json > tmp && [ -s tmp ] && mv tmp orch-state.json
# COMMIT orch-state by EXPLICIT PATH only.

def TASK: "FIX-ERRAUDIT-W2-MCP-DATALAYER";
def NOW:  "2026-06-16T00:00:00Z";

# 1) pull the row out of backlog, grooming it to READY with promotion provenance
( [ .task_board.backlog[] | select((.id // .task_id) == TASK) ][0]
  | .status        = "READY"
  | .next_agent    = "dev-mcp-server"
  | .route_to      = "dev-mcp-server"
  | .groomed_at    = NOW
  | .groomed_by    = "po-s69"
  | .promoted_from = "backlog"
  | .promoted_at   = NOW
  | .promoted_by   = "po-s69"
  | .promotion_note = "Free coding slot (WIP coding 1/2 — only RASTERIZE running). Inner data layer first: kills confidence_score=50/fabricated-default class at source (/goal#1+#2). dev-mcp-server FREE (cron-scheduler lane is a QA-observe gate, no dev WIP). Dep none. Reuse/extend shared easy-handle helper: safeQuery<T>+runSection/withSection+failLoud — FAIL-LOUD typed degrade, NO fabricated/default served metric, generic across ALL sites (not per-site). Router dispatches via lock-claim+spawn; po did NOT spawn."
) as $row

# 2) write the board: remove from backlog, append to ready
| .task_board.backlog = [ .task_board.backlog[] | select((.id // .task_id) != TASK) ]
| .task_board.ready  += [ $row ]

# 3) board provenance
| .task_board._updated_at = NOW
| .task_board._updated_by = "po-s69"

# 4) set the SINGLE canonical top-level .head (po is the sole .head writer)
| .head = {
    "status": "active",
    "updated_at": NOW,
    "updated_by": "po-s69",
    "active_task_id": TASK,
    "next_agent": "dev-mcp-server",
    "note": "Chosen for the one free coding slot (coding WIP 1/2 — RASTERIZE in-flight on dev-pdf-extractor, do NOT touch/route). FIX-ERRAUDIT-W2-MCP-DATALAYER promoted backlog->ready: inner mcp-server data-layer helpers (safeQuery<T>+runSection/withSection+failLoud) kill confidence_score=50/fabricated-default class at source (/goal#1 no-fake + #2). Continues the user's ACTIVE error-audit. dev-mcp-server FREE (cron-scheduler is a QA market-day OBSERVE gate, no dev WIP). No blocking dep. Router dispatches via lock-claim+spawn; po-s69 did NOT spawn dev. PUSH HELD (PO deferred). Commit orch-state by EXPLICIT PATH."
  }

# 5) top-level provenance
| ._updated_at = NOW
| ._updated_by = "po-s69"
| .updated_at  = NOW
| .updated_by  = "po-s69"
