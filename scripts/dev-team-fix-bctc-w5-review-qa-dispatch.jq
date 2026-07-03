# FIX-BCTC-BANK-SUMMARY-MAPPING — W5 dev→review flip + head→terminal-qa dispatch
# Context: dev session 3340d049 died after committing W5 (b630277c) but before the board flip.
#          Session d3292ca4 adopted all 5 orphaned sprint-task locks (redispatch_count=1),
#          verified tree-hygiene clean (zero uncommitted mods in apps/mcp-server), and
#          RAW-verified W5 GREEN (bun test 4 pass / 0 fail, fence clean, journal present).
# Usage: jq --arg now "$NOW" -f scripts/dev-team-fix-bctc-w5-review-qa-dispatch.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: array-shape preserved on both lanes; W5 object mutated via map(), never rebuilt.

def w5id: "TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST";

# 1. Append the (mutated) W5 row to review[]
.task_board.review += [
  .task_board.in_progress[]
  | select(.id == w5id)
  | .status = "REVIEW"
  | .adopted_at = $now
  | .assigned_to = "(session-scrubbed)"
  | .tree_hygiene_note = "tree-hygiene: 0 files reverted (zone apps/mcp-server fully committed by dead worker before crash)"
  | .review_note = "dispatcher RAW-verified GREEN (adopted): dev b630277c, bun test 4/4 pass, fence clean (6 files all in-zone), DJ journal present"
]
# 2. Remove W5 from in_progress[]
| .task_board.in_progress = [ .task_board.in_progress[] | select(.id != w5id) ]
# 3. head → terminal qa AC-13 dispatch
| .head = {
    status: "in_progress",
    active_task_id: w5id,
    next_agent: "qa",
    next_action: "terminal qa AC-13 (W1-W5 sprint close): single mcp-server rebuild on clean fully-committed apps/mcp-server tree (verify new image ID actually serving) -> CTG re-ingest via scripts/migrations/reingest-bctc-report.ts (VERIFY first; honor its data-loss guard — all 56 CTG units are FAILED/empty-markdown, so --apply is expected to refuse with exit 3 and print the manual fresh-transcription step; do NOT force) -> RAW-probe named-volume market.db CTG total_assets unfrozen from 0 (only reachable after valid re-ingest) -> 3-serve-tool live verify CTG + non-regression VCB/FPT/HPG/VNM -> flip W1-W5 review->done_verified + release task:W1..W5 sprint-task locks",
    updated_by: "dev-team",
    updated_at: $now,
    note: "[dev-team " + $now + "] SF-1 STOLEN from expired peer 3340d049 (heartbeat 93min stale, TTL backstop). Adopted 5 orphaned sprint-task locks (redispatch_count=1). Probe-tree-first: W5 commit b630277c already in history — dev work DONE, no re-dispatch of dev-mcp-server. W5 RAW-verified GREEN -> REVIEW. Background qa spawned for AC-13 by session d3292ca4; do NOT respawn while task:W5 lock held."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
