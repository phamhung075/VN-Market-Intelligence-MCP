# po-s54-vn-macro-ba-dispatch.jq
# POST-SPRINT TRIAGE board mutation (atomic temp -> [ -s ] -> jq empty -> rename).
# Three intended edits, all idempotent / id-guarded:
#   1. BA-VN-MACRO-TOOLING in ready[]: set next_agent="ba" (was null) -> router can advance it.
#   2. Append FIX-FB-POSTER-NOARG-MARKET-TOOLS to backlog[] IF id absent in ANY board array
#      (new unboarded health-recheck 18:07Z finding: fb-market-poster calls get_foreign_flow({}) /
#       get_ticker_intelligence({}) which require code:string -> silent notebook fallback every cycle.
#       GENERIC fix: route to no-arg market-movers/aggregate tools, no per-ticker hardcode).
#   3. head -> dispatch BA-VN-MACRO-TOOLING (status active, next_agent ba).
# Usage: jq --arg now "$NOW" -f scripts/po-s54-vn-macro-ba-dispatch.jq docs/data/orch/orch-state.json
# Reusable pattern: "dispatch a READY BA gate + drop one id-guarded backlog FIX + set head" single-pass triage.

# --- id presence across every array in task_board ---
def id_present($id):
  [ .task_board | to_entries[] | .value
    | select(type=="array")[] | select(type=="object") | .id ]
  | any(. == $id);

# --- edit 1: set BA next_agent ---
( .task_board.ready |= map(
    if .id == "BA-VN-MACRO-TOOLING" then .next_agent = "ba" else . end ) )

# --- edit 2: id-guarded backlog append ---
| ( if id_present("FIX-FB-POSTER-NOARG-MARKET-TOOLS") then .
    else .task_board.backlog += [ {
      "id": "FIX-FB-POSTER-NOARG-MARKET-TOOLS",
      "type": "FIX",
      "title": "fb-market-poster calls get_foreign_flow({}) + get_ticker_intelligence({}) with no code= arg -> both fail schema (code:string required) -> silent notebook fallback every cycle. Generic fix: swap to no-arg market-aggregate tools (get_market_foreign_flow for flow; pick/confirm a no-arg market-movers tool for ticker-intel, or pass watchlist iteration) — NO per-ticker hardcode.",
      "priority": "low",
      "size": "S",
      "status": "NEW",
      "zone": "cross-service/",
      "source": "health-recheck 2026-06-14T18:07Z (BUG-NEW-01/02)",
      "generic_mandate": "Fix the tool-selection in the fb-market-poster flow generically — no-arg market-level call, applies to all tickers, no instance hardcode.",
      "created_at": $now,
      "created_by": "po"
    } ]
    end )

# --- edit 3: head dispatch ---
# CANONICAL HEAD = TOP-LEVEL .head ONLY (NEVER .task_board.head — deprecated, see
# orch-state-access.md §4). dev-team flow Step 0b reads top-level .head.
| .head = {
    "status": "active",
    "updated_at": $now,
    "updated_by": "po",
    "active_task_id": "BA-VN-MACRO-TOOLING",
    "next_agent": "ba",
    "note": "PO POST-SPRINT TRIAGE -> dispatch BA-VN-MACRO-TOOLING (decompose 07-06 VN-MACRO-TOOLING sprint to REQ doc). WIP=2 with passive ARCH-CRON-SCHEDULER-RELIABILITY."
  }
| ._updated_at = $now
| ._updated_by = "po"
| .updated_at = $now
| .updated_by = "po"
