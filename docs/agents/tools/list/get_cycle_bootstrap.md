---
tool: get_cycle_bootstrap
category: system
agents: [news-scout, financial-analyst, report-analyzer, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent]
---

# `get_cycle_bootstrap`

**Category:** system | **Used by:** All Cowork agents
**Description:** Compound bootstrap tool for Cowork agents. Replaces the 3-call opening sequence (get_agent_signals + get_market_context + get_system_status) with a single parallel call.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| agent_name | enum (news-scout, financial-analyst, report-analyzer, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent) | ✅ | — | Agent identifier. Must match a known Cowork agent name. |

## Returns

JSON object containing three sections in parallel:
- `agent_signals` — Recent signals from inter-agent bus (last 24h)
- `market_context` — Market snapshot, price history, and trading window status
- `system_status` — DB status, source health, data freshness, recent errors

Partial failure: failed keys set to null with error details — agent applies fail-loud protocol.

## Usage

```json
{
  "tool_name": "get_cycle_bootstrap",
  "input": {
    "agent_name": "market-watcher"
  }
}
```

## Notes

- Replaces three separate MCP calls for faster agent startup
- Timing metrics included in response (elapsed_ms, sub_call_timings)
- Unknown agent_name triggers Zod validation error before handler runs
