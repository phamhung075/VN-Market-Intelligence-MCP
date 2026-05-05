---
name: get_cycle_bootstrap
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# get_cycle_bootstrap

Compound bootstrap tool for Cowork agents. Replaces the 3-call opening sequence (get_agent_signals + get_market_context + get_system_status) with a single parallel call. Returns { agent_signals, market_context, system_status }. Partial failure: failed keys set to null with error details — agent applies fail-loud protocol. Valid agent_name values: news-scout, financial-analyst, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent.



## Arguments

- **agent_name** (string) — **required**
  - Name of agent requesting bootstrap
  - Valid values: `"news-scout"`, `"financial-analyst"`, `"market-watcher"`, `"alert-commander"`, `"digest-predict"`, `"qa-responder"`, `"unified-agent"`, `"report-analyzer"`

## Return Type

```typescript
{
  agent_signals: {
    urgent_news: Signal[],
    price_anomaly: Signal[],
    chain_catalyst: Signal[],
    ...
  },
  market_context: {
    vn_index: number,
    last_update: string,
    day_change: number,
    ...
  },
  system_status: {
    db_healthy: boolean,
    data_freshness: number,
    recent_errors: string[],
    ...
  },
  cycle_id: string
}
```

## Example Usage

### Alert Commander Startup (Mandatory Pattern)
```typescript
const result = await call_tool("vn-market", "get_cycle_bootstrap", {
  agent_name: "alert-commander"
});

// Returns:
// {
//   agent_signals: {
//     urgent_news: [
//       { signal_id: "sig_1", stock_code: "ACB", ... },
//       { signal_id: "sig_2", stock_code: "VNM", ... }
//     ],
//     price_anomaly: [ ... ],
//     ...
//   },
//   market_context: {
//     vn_index: 1285.5,
//     day_change: 0.8,
//     last_update: "2026-05-04T14:35:00Z"
//   },
//   system_status: {
//     db_healthy: true,
//     data_freshness_minutes: 2,
//     vps_status: "operational"
//   },
//   cycle_id: "cycle_2026050414"
// }

// Agent logic:
if (!result.system_status.db_healthy) {
  await call_tool("vn-market", "send_telegram", {
    channel: "work",
    message: "⚠️ Alert Commander: DB unhealthy, cycle skipped"
  });
  return;
}

// Process signals...
```

### Market Watcher Startup
```typescript
const result = await call_tool("vn-market", "get_cycle_bootstrap", {
  agent_name: "market-watcher"
});

// Use result.market_context to detect anomalies
// Use result.agent_signals to check if other agents have posted about same stocks
```

### Unified Agent Startup
```typescript
const result = await call_tool("vn-market", "get_cycle_bootstrap", {
  agent_name: "unified-agent"
});

// Coordinator uses ALL 3 sections:
// - agent_signals: synthesize cross-agent findings
// - market_context: last-mile validation
// - system_status: health check before proceeding
```

## Mandatory Pattern (from mcp-tools.md)

```
Step 0: Every agent must call get_cycle_bootstrap(agent_name="{agent-name}")
        at startup, before any other tool calls.

Replaces the 3-call opening sequence:
  - OLD: get_agent_signals + get_market_context + get_system_status
  - NEW: get_cycle_bootstrap (parallel, single call)
```

## Return Fields Explained

### agent_signals (Inter-agent Signal Bus)
- Signals posted by other agents in current cycle
- Keyed by signal_type (urgent_news, price_anomaly, chain_catalyst, etc.)
- Filtered by stock_code if relevant to this agent
- Use to understand what other agents discovered

### market_context (Market State)
- VN-Index + sector trends
- Latest price updates (from market_watcher)
- Macro indicators (from macro snapshot)
- Age of data (freshness_minutes)

### system_status (Health Check)
- `db_healthy` — if false, skip cycle (database unavailable)
- `data_freshness_minutes` — minutes since last data update
- `vps_status` — VPS proxy health (for geo-blocked fetches)
- `recent_errors` — any errors in last cycle to alert on

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `invalid_agent_name` | Typo in agent_name | Use valid names: news-scout, market-watcher, etc. |
| `cycle_bootstrap_timeout` | System overloaded, 3-call parallel failed | Retry once; if persists → send to work channel |
| `partial_failure` | One of 3 subsystems failed | Some keys will be null; check system_status.recent_errors |
| `db_unavailable` | Database offline | Log to work channel; return early, don't process alerts |

## Fail-Loud Protocol (from fail-loud-protocol.md)

If bootstrap returns partial failure (null fields):

```typescript
if (!result.system_status) {
  await call_tool("vn-market", "send_telegram", {
    channel: "work",
    message: `🚨 BOOTSTRAP FAILED: ${agent_name}\nSystem unavailable, cycle skipped. Details: check logs.`
  });
  process.exit(1); // Fail loud
}
```

## Notes

- **Mandatory at startup**: Every agent MUST call this before processing (encoded in all agent flows)
- **Parallel execution**: MCP server fetches signals + context + health in parallel (faster than sequential calls)
- **15-min window**: agent_signals are current cycle signals only (TTL enforced by server)
- **Idempotent**: Safe to call multiple times in same cycle
- **Agent-specific**: Results filtered by agent_name (e.g., alert-commander doesn't see all signals, only relevant ones)

## Related Tools

- `get_agent_signals` — Fine-grained signal query by type/stock/age (if bootstrap signals insufficient)
- `get_market_context` — Fetch fresh market context if bootstrap is stale
- `get_system_status` — System health only (if you only need to check DB/VPS, not signals)

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — mandatory pattern, bootstrap flow, error handling, fail-loud integration)
