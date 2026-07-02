# Dev-team tick 2026-07-02T01:07Z — S4 auto-close CLEAN-DELETE-STRAY-BUN-CACHE-MCP-SERVER
# qa worker a74668aae05248563 RAW-verified by dispatcher:
#   - [ ! -d "./apps/mcp-server/~" ] → gone; git ls-files -- "apps/mcp-server/~" → 0
#   - mock-guard --full re-run: ZERO hits under apps/mcp-server/~ (bun-cache FP class eliminated;
#     remaining HARD-FAIL = known Go test-stub FP → FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO)
#   - DJ-GATE-1 journal STEP qa-S1 in docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-qa.md
# Usage: jq --arg now "$NOW" -f scripts/dev-team-close-clean-bun-cache-20260702-0107.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (no-op if row absent from in_progress); lane-scoped writes only.

def cleanid: "CLEAN-DELETE-STRAY-BUN-CACHE-MCP-SERVER";

([.task_board.in_progress[] | select(.id == cleanid)]) as $rows
| if ($rows | length) == 0 then .
  else
    .task_board.in_progress |= map(select(.id != cleanid))
    | .task_board.done += [($rows[0]
        + {status: "DONE",
           completed_at: $now,
           completed_by: "qa",
           status_note: ($rows[0].status_note
             + " | CLOSED " + $now + ": dir deleted (RAW: dir gone, 0 tracked, mock-guard re-run zero ~-cache hits); DJ-GATE-1 journal STEP qa-S1 verified; S4 auto-close by dispatcher.")})]
    | .task_board._updated_at = $now
    | .task_board._updated_by = "dev-team"
  end
