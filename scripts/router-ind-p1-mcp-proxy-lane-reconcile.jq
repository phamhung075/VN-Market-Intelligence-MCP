# router-ind-p1-mcp-proxy-lane-reconcile.jq
#
# Router board-hygiene reconciliation for IND-P1-MCP-PROXY-INDICATORS
# (sprint MARKET-INDICATOR-DEPTH-P0).
#
# dev-mcp-server (commit 7e098482) set the row status=REVIEW + next_agent=qa but
# left it PHYSICALLY in the backlog[] lane (status flipped without lane move — the
# same pattern as 5 pre-existing FIX-* rows). Its 3 sibling momentum tasks
# (IND-P1-ROC-MOMENTUM / -RELATIVE-STRENGTH / -52W-HIGH-PROXIMITY) are physically in
# review[]. This transform MOVES the proxy row backlog[] -> review[] so QA processes
# all 4 momentum tasks uniformly and the review->qa transition cannot orphan or
# duplicate a misplaced row (the BA cross-lane-dup defect class).
#
# RAW-verified by router 2026-06-30 (NOT relayed from agent badge):
#   - commit 7e098482 real: 9 files (4 tool files + 423L test + clients.ts +222 +
#     registry.ts +8 + orch-state + tool-registry.json).
#   - 4 tools wired: registry.ts imports L131-134 + toolRegistry array entries
#     L267-270; tool-registry.json carries all 4 tool names.
#   - honest-NULL passthrough confirmed in rocMomentumTools.ts (transparent
#     ...result spread, no default-fill, {error:'...'} contract, never throws).
#   - single board occurrence, NO cross-lane dup.
#   - OPEN (flagged for QA, non-blocking): project-stats.json#toolCount still 178,
#     should be 182 — QA reconciles via 3-way probe (tool-count-ssot-drift rule).
#
# Idempotent guard: if the row is already absent from backlog[] (already moved),
# $row is null and the transform aborts via error() rather than appending null and
# corrupting review[].
#
# Invocation (NEVER raw mv/cp/>):
#   jq -f scripts/router-ind-p1-mcp-proxy-lane-reconcile.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def isTarget: (.id // "") == "IND-P1-MCP-PROXY-INDICATORS";

((.task_board.backlog // []) | map(select(isTarget)) | .[0]) as $row
| if $row == null
  then error("IND-P1-MCP-PROXY-INDICATORS not found in backlog[] — already reconciled/moved; aborting to avoid review[] corruption")
  else . end
| .task_board.backlog = ((.task_board.backlog // []) | map(select(isTarget | not)))
| .task_board.review = ((.task_board.review // []) + [
    $row + {
      "router_lane_reconciled_at": "2026-06-30T02:58:00Z",
      "router_lane_reconcile_note": "router moved backlog->review to match status=REVIEW + next=qa and align with sibling IND-P1 momentum tasks; mcp-server rebuild dispatched; awaiting QA gateway verification of all 4 tools"
    }
  ])
| ._updated_at = "2026-06-30T02:58:00Z"
| ._updated_by = "router:lane-reconcile:IND-P1-MCP-PROXY-INDICATORS"
