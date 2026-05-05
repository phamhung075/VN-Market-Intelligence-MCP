---
name: get_pipeline_health
type: tool
package: ops-infrastructure
related_tools: get_vps_service_health, get_system_status
complexity: moderate
---

# get_pipeline_health

Returns **per-ticker OHLCV data quality metrics** for technical analysis readiness. Shows row count, TA readiness (rows ≥ 8 = ready), RSI signal, backfill queue status, and total non-neutral signal count. **Use for instant pipeline verification without waiting for evening report.**

## Arguments

- **ticker** (string) — optional
  - Check single stock only. If omitted, check all watchlist tickers.

- **include_backfill** (boolean) — optional, default: true
  - Include backfill queue diagnostics

## Return Type

```typescript
{
  success: boolean,
  tickers: Array<{
    code: string,
    ohlcv_row_count: number,
    ta_ready: boolean,  // true if rows >= 8
    last_price_update: string,  // ISO timestamp
    rsi_signal: "oversold" | "overbought" | "neutral",
    rsi_value: number,
    signal_count: number  // Non-neutral signals for this ticker
  }>,
  backfill_queue: {
    pending: Array<string>,  // Tickers needing backfill
    in_progress: Array<string>,
    stuck_count: number  // Stuck > 30 min
  },
  summary: {
    total_tickers: number,
    ta_ready_count: number,
    ta_ready_pct: number,
    signal_health: "green" | "yellow" | "red"  // green = >70% ready, red = <40%
  },
  timestamp: string
}
```

## Example Usage

### QA — Pre-Market Verification (7:00 UTC = 14:00 Hanoi)
```typescript
// At market open (before analysis agents start), verify data readiness
const health = await call_tool("vn-market", "get_pipeline_health", {
  include_backfill: true
});

console.log(`Pipeline health: ${health.summary.signal_health}`);
console.log(`TA ready: ${health.summary.ta_ready_count}/${health.summary.total_tickers} (${health.summary.ta_ready_pct.toFixed(1)}%)`);

// Check backfill queue
if (health.backfill_queue.stuck_count > 2) {
  console.log(`⚠️ WARNING: ${health.backfill_queue.stuck_count} tickers stuck in backfill > 30 min`);
  console.log(`  Stuck: ${health.backfill_queue.in_progress.join(", ")}`);

  // Alert: may affect market analysis
  await call_tool("vn-market", "submit_feedback", {
    agent: "qa",
    title: `Pipeline backfill stuck: ${health.backfill_queue.stuck_count} tickers`,
    category: "bug",
    detail: `Tickers stuck > 30min: ${health.backfill_queue.in_progress.join(", ")}. May block analysis cycle.`,
    priority: "high",
    to: "@ops"
  });
}

// If < 60% ready, delay analysis start
if (health.summary.ta_ready_pct < 0.60) {
  console.log(`❌ DELAY START: Only ${health.summary.ta_ready_pct.toFixed(1)}% tickers TA-ready. Waiting for data...`);
  // Retry in 5 minutes
  return;
} else {
  console.log(`✅ Ready to start analysis cycle`);
}
```

### Ops — Single Ticker Troubleshooting
```typescript
// Analyst: "ACB data looks old"
// Ops checks:

const health = await call_tool("vn-market", "get_pipeline_health", {
  ticker: "ACB",
  include_backfill: true
});

const acb = health.tickers[0];
console.log(`ACB data quality:`);
console.log(`  Row count: ${acb.ohlcv_row_count} rows`);
console.log(`  TA ready: ${acb.ta_ready ? "✅ Yes" : "❌ No (need >= 8 rows)"}`);
console.log(`  Last update: ${acb.last_price_update}`);

if (!acb.ta_ready) {
  console.log(`Diagnosis: Insufficient history (${acb.ohlcv_row_count} < 8 rows)`);
  console.log(`  → Check if ACB is new to watchlist or price fetch failed`);
} else if (new Date().getTime() - new Date(acb.last_price_update).getTime() > 3600000) {
  console.log(`Diagnosis: Data stale (> 1 hour old)`);
  console.log(`  → Price update may have failed. Check vn-price-fetch health`);
}
```

### QA — Signal Health Trend
```typescript
// Monitor signal health throughout day
const morning = await call_tool("vn-market", "get_pipeline_health", {});
const midday = await call_tool("vn-market", "get_pipeline_health", {});
const eod = await call_tool("vn-market", "get_pipeline_health", {});

const trend = {
  morning: morning.summary.signal_health,
  midday: midday.summary.signal_health,
  eod: eod.summary.signal_health
};

console.log(`Signal health trend: ${trend.morning} → ${trend.midday} → ${trend.eod}`);

// If degrading (green → yellow → red), investigate
if (trend.eod === "red" && trend.morning !== "red") {
  console.log("⚠️ Signal health DEGRADED during day");
  console.log(`  Morning: ${morning.summary.ta_ready_pct.toFixed(1)}%`);
  console.log(`  EOD: ${eod.summary.ta_ready_pct.toFixed(1)}%`);

  // Check for data gaps
  const degraded = morning.tickers
    .filter(t => t.ta_ready)
    .filter(t => !eod.tickers.find(e => e.code === t.code)?.ta_ready);

  console.log(`  Tickers that lost TA-ready status: ${degraded.map(t => t.code).join(", ")}`);
}
```

### Dev — Pre-Deployment Data Validation
```typescript
// After price fetch code changes, validate data didn't break
const baseline = await call_tool("vn-market", "get_pipeline_health", {});
const baselineTaReady = baseline.summary.ta_ready_pct;

// Deploy changes...

const postDeploy = await call_tool("vn-market", "get_pipeline_health", {});

if (postDeploy.summary.ta_ready_pct < baselineTaReady - 0.05) {
  // > 5% regression
  console.log("❌ REGRESSION: TA-ready percentage dropped");
  console.log(`  Before: ${(baselineTaReady * 100).toFixed(1)}%`);
  console.log(`  After: ${(postDeploy.summary.ta_ready_pct * 100).toFixed(1)}%`);

  // Identify which tickers broke
  const broken = postDeploy.tickers.filter(t => !t.ta_ready && baseline.tickers.find(b => b.code === t.code)?.ta_ready);
  console.log(`  Broken tickers: ${broken.map(t => t.code).join(", ")}`);

  process.exit(1);
}
```

## When to Use

- **Cycle start** — Pre-market health check before analysis begins
- **Incident response** — "Data looks stale?" → Check pipeline health
- **Single ticker debug** — Troubleshoot why specific stock failing
- **Trend monitoring** — Track health throughout day
- **Pre-deployment** — Validate data quality after code changes
- **NOT real-time** — Polled every 10-15 min; check 2-3x per day

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_vps_service_health` | If vn-price-fetch unhealthy, OHLCV won't update |
| `get_system_status` | Overall system health (local MCP) |
| `trigger_bctc_vps_fetch` | Separate pipeline for BCTC (not price data) |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `ta_ready_pct < 40%` | Severe data gap or fetch failure | Check VPS price service; restart if needed |
| `stuck_count > 3` | Backfill process deadlocked | Investigate queue; may need manual reset |
| `all tickers: ohlcv_row_count = 0` | Price fetch not running | Restart docker-compose; check vn-price-fetch service |

## Notes

- **TA ready threshold:** 8 rows = minimum for RSI calculation. More rows = more stable signals.
- **Backfill queue:** Pending tickers are being filled with historical data. Should clear within hours, not days.
- **Signal health colors:**
  - Green: > 70% TA-ready (safe to start analysis)
  - Yellow: 40-70% TA-ready (proceed with caution)
  - Red: < 40% TA-ready (do not start, investigate)
- **Last update:** Timestamp of last price update per ticker. If > 1h old, may be stale.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, trend monitoring, regression detection)
