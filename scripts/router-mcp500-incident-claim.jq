# Router P0-incident zone reservation: claim FIX-MCP-500-SYMBOL-TO-STRING into in_progress[].
# Surfaced by the cowork-team dispatcher tick (2026-06-14 ~09:05Z) while matching refine-bctc-slot-1:
# call_tool(get_bctc_pending_refine) failed "dial vn-market: failed to connect: Internal Server Error".
# RAW-corroborated (NOT a false-positive per the false-infra-failure corroboration gate):
#   - mcp-server container "Up 49 min (healthy)" — Docker healthcheck GREEN (liveness only).
#   - public https://zenmidi.com/vn-market/mcp -> HTTP 500.
#   - mcp-server logs: "[createBunServer] Unhandled request error: Cannot convert a symbol to a string"
#     on EVERY request incl SSE handshake (open->error->close), consistent for ~49 min.
#   - "passive health masks dead data" pattern: shallow healthcheck passes while real MCP requests 500.
# Scope = the MCP tool-call surface (all cowork agents + any call_tool consumer). Frontend dashboard
# UNAFFECTED (FIX-FE qa pulled live prices via the frontend's own /api route minutes earlier).
# Running image built 2026-06-14T08:05:41Z; latest apps/mcp-server commit in it = 9088c052
# (ALLZERO-OHLCV-FETCH "purge zero candles + normalize contam + read guard") = PRIME SUSPECT — the
# read-guard runs on the request hot path. Secondary suspect: 7cbca67a (FIX-ALERT-ORPHAN-CORRELATION).
# This reservation exists so the hourly dev-team cron (:07) WIP/zone guard does NOT double-dispatch
# dev-mcp-server while the router-spawned dev-mcp-server is already in flight.
# GUARD: refuse unless in_progress[] EMPTY (WIP=0, no zone collision) and no FIX-MCP-500* already present.
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b reconcile / Step 1 PO triage drains this).
# Usage: jq --arg now "$NOW" -f scripts/router-mcp500-incident-claim.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $wip
| if (($wip | length) != 0) then error("in_progress[] not empty (\($wip|map(.id?))) — WIP guard, refuse")
  elif ([.task_board[]?[]? | select(type=="object" and (.id|type=="string") and (.id|startswith("FIX-MCP-500")))] | length != 0)
    then error("a FIX-MCP-500* task already on board — refuse duplicate")
  else . end
| .task_board.in_progress = [{
    id: "FIX-MCP-500-SYMBOL-TO-STRING",
    title: "mcp-server returns HTTP 500 on every MCP request — \"Cannot convert a symbol to a string\"",
    priority: "P0",
    zone: "apps/mcp-server/",
    status: "IN_PROGRESS",
    depends_on: null,
    next_agent: "dev-mcp-server",
    claimed_at: $now,
    claimed_by: "router",
    origin: "cowork-team dispatcher tick 2026-06-14T09:05Z (refine-bctc-slot-1 fan-out aborted — downstream MCP 500)",
    symptom: "Every MCP request 500s incl SSE handshake. Log: [createBunServer] Unhandled request error: Cannot convert a symbol to a string. Container healthy (passive-health masks dead data). Running since ~08:16Z.",
    prime_suspect: "9088c052 ALLZERO-OHLCV-FETCH (read-guard on request hot path); secondary 7cbca67a FIX-ALERT-ORPHAN-CORRELATION",
    scope_note: "MCP tool-call surface only (all cowork agents + call_tool). Frontend dashboard UNAFFECTED.",
    acceptance: "Root-cause the Symbol->string TypeError; targeted code fix in apps/mcp-server (NOT a blind revert unless RCA points there); mcp-server build + unit/integration green; ops rebuild --no-cache mcp-server + up -d --no-deps --force-recreate; LIVE proof: public /vn-market/mcp returns 200 on a real tool handshake AND call_tool(get_market_snapshot or get_bctc_pending_refine) returns a valid payload (not 500); logs clean of the symbol error for >=2 min. Then -> review (qa).",
    dispatch_note: "Dispatched dev-mcp-server \($now) by router on P0 cowork-tick escalation. Fix root cause definitif (CLAUDE.md), not a symptom mask. If RCA confirms 9088c052 read-guard, fix the guard's coercion (do not drop the zero-candle purge — that closed the user chart bug DATA half). Run mcp-server tests BEFORE handing to ops for rebuild (RED-PREPUSH strands fleet). Verify LIVE via call_tool through the gateway, not just rows_stored/200."
  }]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-MCP-500-SYMBOL-TO-STRING",
    next_agent: "dev-mcp-server",
    note: "P0: mcp-server 500s on every MCP request (Cannot convert a symbol to a string), masked by healthy container. Surfaced by cowork tick (refine fan-out aborted). dev-mcp-server in flight (router-spawned). Prime suspect 9088c052 ALLZERO read-guard. Fleet cowork layer DOWN until fixed; frontend dashboard OK."
  }
