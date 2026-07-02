# Dispatch wave-1 of sprint FIX-BCTC-BANK-SUMMARY-MAPPING: move W1 + W4 ready -> in_progress.
# W1 (identity-serve-guard coverage) + W4 (aggregator fixtures) are file-disjoint -> safe concurrent (WIP=2).
# W2/W3 both touch refinedMarkdownParser.ts -> serialize in a later wave. W5 depends W2+W4.
# Usage: ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg ts "$ts" -f scripts/dev-team-fix-bctc-dispatch-w1w4.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ts) as $now
| (["TASK-W1-FIX-BCTC-BANK-SUMMARY-MAPPING-GUARD",
    "TASK-W4-FIX-BCTC-BANK-SUMMARY-MAPPING-AGGREGATOR-FIXTURES"]) as $dispatch
| ([ .task_board.ready[] | select(.id as $id | ($dispatch | index($id)) != null) ]) as $moving
| .task_board.ready |= map(select(.id as $id | ($dispatch | index($id)) == null))
| .task_board.in_progress += ($moving | map(
    .status = "IN_PROGRESS"
    | .next_agent = "dev-mcp-server"
    | .dispatched_at = $now
    | .dispatched_by = "dev-team"
  ))
| .head.status = "in_progress"
| .head.active_task_id = "TASK-W1-FIX-BCTC-BANK-SUMMARY-MAPPING-GUARD"
| .head.next_agent = "dev-mcp-server"
| .head.next_action = "dev-mcp-server implements W1 (identity-serve-guard coverage, AC-4/AC-7) + W4 (bctcScalarAggregator fixtures, AC-9/AC-12) CONCURRENTLY (file-disjoint). Wave 2: W2 (refinedMarkdownParser.ts row-repair) then W3 (detectSection) SERIALIZED (same file). W5 after W2+W4 deployed. On each dev return: dispatcher RAW-verify -> review -> qa."
| .head.updated_by = "dev-team"
| .head.updated_at = $now
| .head.note = "[dev-team 2026-07-01] FIX-BCTC dispatch wave 1: TASK-W1-GUARD + TASK-W4-AGGREGATOR-FIXTURES -> in_progress (WIP=2, file-disjoint), dev-mcp-server x2 backgrounded. Sprint-task locks task:TASK-W1.../task:TASK-W4... held through chains. W2+W3 serialize in wave 2 (both edit refinedMarkdownParser.ts). W5 sequenced after W2+W4."
| ._updated_at = $now
| ._updated_by = "dev-team"
