# Router/cowork-dispatcher signal reconcile (ONE atomic write, signal_queue ONLY — NO task_board mutation).
# Context: cowork-team tick 2026-06-14T09:53Z. The 09:08Z gw-outage (mcp-server HTTP 500 on every request,
# "Cannot convert a symbol to a string") has RECOVERED — RAW-verified by the router this tick:
#   - public https://zenmidi.com/vn-market/mcp initialize -> HTTP 200 (valid serverInfo).
#   - real gateway call_tool(get_market_snapshot) -> valid payload (VN-Index 1,791.65 -0.39%, fresh 09:51Z).
#   - mcp-server logs: 0 "Cannot convert a symbol to a string" hits in last 200 lines; ALLZERO zero-candle
#     purge still active (ohlcvBackfill post-normalize guard rejecting zero_ohlc rows).
#   - container "Up 4 min (healthy)" — RESTARTED ~09:46Z on the SAME image (imageCreated 2026-06-14T08:05:41Z).
# ROOT CAUSE NOT FIXED — this is a restart-mask of a KNOWN RECURRING fault (per dev-mcp-server notebook
# FIX-PENDING-REFINE-LIMIT-CHECKKIND, 2026-06-13): "@modelcontextprotocol/sdk 1.29.0 + zod 3.25.76 produce
# Bun 1.3.13 JIT module-state corruption; process-state specific; Docker restart clears it." package.json
# STILL pins sdk:1.29.0 + zod:^3.23.0 — the recurrence vector is live. The router-spawned dev-mcp-server agent
# (aa64f9a4) ended WITHOUT a code fix, leaving only +3 uncommitted DIAGNOSTIC lines in server.ts (url+stack
# in the unhandled-error log). FIX-MCP-500-SYMBOL-TO-STRING stays in_progress[] (board, ba5aab16) for dev-team.
# This write: (1) APPEND an authoritative successor signal to po (recovery + SHARPENED definitive-fix scope per
# the /goal "fix root cause definitif not recurrent symptom"); (2) SUPERSEDE the stale 09:08Z NEW outage row so
# po does not dispatch ops to chase a non-existent outage. Lawful cowork-dispatcher scope (signal drain/reconcile
# + cross-team escalation row). orch-state.json verified CLEAN before write (no dirty-board capture risk).
# GUARD: refuse if the successor id already exists (idempotent re-run safe).
# Pointer: docs/agents/cowork-team/flow/main.md (Step 0a drain / cross-team signal escalation).
# Usage: jq --arg now "$NOW" -f scripts/router-mcp500-recovery-signal.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ("cowork-team-20260614T0953-mcp500-recovered-rootcause-open") as $newid
| (.signal_queue.rows // []) as $rows
| if ([$rows[] | select(.id == $newid)] | length) != 0
    then error("successor signal \($newid) already present — refuse duplicate")
  else . end
# (2) supersede the stale 09:08Z outage row (NEW -> SUPERSEDED), if still present and not already handled
| .signal_queue.rows = [ $rows[]
    | if (.id == "cowork-team-20260614T090913-gw-outage" and (.status == "NEW"))
        then . + {status:"SUPERSEDED", disposition:"recovered via container restart ~09:46Z; root cause open — superseded by \($newid)", superseded_at:$now}
        else . end ]
# (1) append the authoritative successor
| .signal_queue.rows += [{
    id: $newid,
    from: "cowork-team",
    to: "po",
    type: "infra-recovery-rootcause-open",
    severity: "MEDIUM",
    status: "NEW",
    summary: "mcp-server 500 outage (09:05-09:46Z, \"Cannot convert a symbol to a string\") RECOVERED via container restart — RAW-verified live: public /vn-market/mcp 200, gateway call_tool(get_market_snapshot) returns valid VN-Index payload, 0 symbol-errors in logs, ALLZERO purge intact. NO ROOT-CAUSE FIX SHIPPED: this is a restart-mask of the KNOWN recurring Bun-JIT-module-state-corruption (sdk:1.29.0 + zod:3.25.76, documented dev-mcp-server notebook 2026-06-13). package.json STILL pins the corrupting combo; recurrence vector live. Router-spawned dev-mcp-server agent aa64f9a4 ended with NO code fix (left +3 uncommitted diagnostic lines in server.ts). FIX-MCP-500-SYMBOL-TO-STRING remains in_progress[] for dev-team.",
    recommended_action: "Dev-team (:07 cron) re-dispatch dev-mcp-server to land a DEFINITIVE fix that ELIMINATES the recurrence vector (NOT another restart): pin @modelcontextprotocol/sdk to a Bun-JIT-stable version OR pin/upgrade zod off 3.25.76 OR refactor the ZodNumber._def.checks usage that trips ZodNumber._parse — whichever the agent's RCA proves. Commit the aa64f9a4 diagnostic server.ts (url+stack) as part of it. Run mcp-server bun tests BEFORE ops rebuild (RED-PREPUSH strands fleet); ops targeted rebuild --no-cache mcp-server + up -d --no-deps --force-recreate; LIVE re-verify call_tool + logs clean >=2min; then review (qa) -> done_verified. Per /goal: root cause definitif, not recurrent symptom.",
    payload_ref: "FIX-MCP-500-SYMBOL-TO-STRING",
    disposition: "",
    ts: $now
  }]
