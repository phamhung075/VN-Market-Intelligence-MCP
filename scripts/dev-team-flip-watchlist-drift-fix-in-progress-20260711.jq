# Developer team-lead tick — flip WATCHLIST-DB-SYSMAP-DRIFT-FIX READY -> IN_PROGRESS
# lane-move ready[] -> in_progress[]; dispatching to dev-mcp-server (zone: apps/mcp-server/).
# Usage: jq --arg now "$NOW" -f flip-watchlist-drift-in-progress.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def taskid: "WATCHLIST-DB-SYSMAP-DRIFT-FIX";

([.task_board.ready[] | select(.id == taskid)]) as $rows
| if ($rows | length) == 0 then .
  else
    .task_board.ready |= map(select(.id != taskid))
    | .task_board.in_progress += [($rows[0]
        + {status: "IN_PROGRESS",
           dispatched_to: "dev-mcp-server",
           dispatch_note: ("developer team-lead " + $now + ": zone verdict apps/mcp-server/ (SqliteWatchlistRepository.ts, watchlistReadStore.ts, seedWatchlist.ts, schema.ts) — routed to dev-mcp-server per zone_dispatch. Root-cause pre-analysis in handoff: seedWatchlist.ts WATCHLIST_SEED hardcoded 34-ticker list independent of system-map.json SSOT, runs unconditionally every server init (schema.ts:202) — pure DB resync will not survive next restart without fixing the seeder derivation too.")})]
    | .task_board._updated_at = $now
    | .task_board._updated_by = "developer"
  end
