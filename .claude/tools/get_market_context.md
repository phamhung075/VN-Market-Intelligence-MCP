---
name: get_market_context
type: tool
package: market-analysis, unified-coordination
related_tools: get_watchlist, get_macro_snapshot, get_alerts, get_kinhdich_reading
complexity: moderate
---

# get_market_context

One-shot compound context fetch for analysis agents. Returns a single response with 5 labeled sections: (1) **WATCHLIST & PRICES** — all watchlist stocks with last known price/change; (2) **MACRO** — latest commodity prices and macro indicators (oil, gold, USD/VND, CPI); (3) **OPEN ALERTS** — unread alerts within the time window; (4) **RECENT ANALYSIS** — latest RAG analysis entries ordered by impact score; (5) **SYSTEM STATUS** — health summary with pending alert count and last cycle time.

**Use this at the start of every agent session** instead of calling `get_watchlist` + `get_market_snapshot` + `get_macro_snapshot` + `get_alerts` + `get_analysis_history` separately. Reduces latency and ensures consistent context snapshot across all agent subsystems.

## Arguments

- **hours_back** (number) — optional, default: 6
  - Time window for recent alerts and analysis (in hours). Typical: 6 for market hours, 24 for overnight analysis.

- **include_regime** (boolean) — optional, default: true
  - Include current market regime assessment (bullish/neutral/bearish). Used for threshold conditioning.

## Return Type

```typescript
{
  success: boolean,
  context: {
    watchlist: Array<{
      code: string,
      price: number,
      change_pct: number,
      last_updated: string
    }>,
    macro: {
      oil_price: number,
      gold_price: number,
      usdvnd: number,
      cpi_trend: string
    },
    open_alerts: number,
    recent_analysis: Array<{
      signal_type: string,
      impact_score: number,
      timestamp: string
    }>,
    system_status: {
      alert_queue_size: number,
      last_cycle_time_ms: number,
      vps_healthy: boolean
    },
    market_regime: string
  },
  timestamp: string
}
```

## Example Usage

### Alert Commander — Cycle Start
```typescript
const context = await call_tool("vn-market", "get_market_context", {
  hours_back: 6,
  include_regime: true
});

// Alerts threshold: bullish regime → 65%, neutral → 70%, bearish → 75%
const threshold = context.context.market_regime === "bullish" ? 0.65 : 0.70;
const openAlerts = context.context.open_alerts;
if (openAlerts > 10) {
  // Queue is high — process with higher conviction threshold
  console.log(`High alert queue (${openAlerts}) — raising threshold to ${threshold + 0.05}`);
}
```

### Market Watcher — Sector Rotation Analysis
```typescript
const context = await call_tool("vn-market", "get_market_context", {
  hours_back: 24,
  include_regime: true
});

// Identify sector momentum from watchlist prices
const sectorMomentum = {};
for (const stock of context.context.watchlist) {
  const sector = getStockSector(stock.code); // e.g., "Energy"
  if (!sectorMomentum[sector]) sectorMomentum[sector] = [];
  sectorMomentum[sector].push(stock.change_pct);
}

// Log and post rotation signals
const rotationSignal = identifyRotation(sectorMomentum);
await call_tool("vn-market", "post_agent_signal", {
  agent: "market-watcher",
  signal_type: "sector_rotation",
  data: rotationSignal
});
```

### Digest & Predict — Daily Synthesis
```typescript
const context = await call_tool("vn-market", "get_market_context", {
  hours_back: 24
});

// Compile daily briefing from context
const briefing = {
  summary: `Market regime: ${context.context.market_regime}. Macro: Oil ${context.context.macro.oil_price}, USD/VND ${context.context.macro.usdvnd}. Alerts processed: ${context.context.system_status.alert_queue_size}.`,
  watchlist_snapshot: context.context.watchlist.slice(0, 10), // Top 10 movers
  analysis_highlights: context.context.recent_analysis.slice(0, 5)
};

await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: formatBriefing(briefing)
});
```

## When to Use

- **At every cycle start** — Cowork agents (News Scout, Financial Analyst, Market Watcher, Alert Commander, Digest & Predict) call this first to establish context
- **Before decision-making** — When evaluating signal thresholds or regime-conditioned rules
- **For unified snapshots** — When you need coordinated market state across multiple subsystems
- **NOT for real-time alerts** — Use `get_alerts()` directly if you only need new alerts (this call is heavier)

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_watchlist` | Just stock list + prices (lighter if you don't need macro/alerts) |
| `get_macro_snapshot` | Detailed macro analysis (oil, FX, rates, supply chain) |
| `get_alerts` | Real-time alerts only (faster for alert-commander cycle) |
| `get_kinhdich_reading` | Hexagram confidence for regime confirmation |
| `get_market_snapshot` | Price depth and order book (for technical analysis) |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `context: null` | No data available in window | Log to WORK, retry with larger `hours_back` |
| `vps_healthy: false` | VPS down or unreachable | Submit feedback to @ops, use cached context if available |
| `alert_queue_size > 100` | System backlog | Raise thresholds, skip low-conviction signals |
| `macro` fields missing | Macro update failed | Use last-known values from persistent storage |

## Notes

- **Caching:** Context is cached for 60 seconds. Calls within 60s return identical data.
- **Market regime:** Inferred from 5-day RSI and sector rotation. Cached daily.
- **Watchlist:** Always includes all 30+ stocks. Filter client-side if needed.
- **Batch call:** Use this instead of 5 separate calls to save ~200ms latency.
- **Stale alerts:** Open alerts include only unread items. Mark alerts read via `mark_alert_read()` to clean queue.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — return schema, 3 workflow examples, error handling, related tools)
