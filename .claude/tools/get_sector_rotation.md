---
name: get_sector_rotation
type: tool
package: market-analysis, market-analyst-research
related_tools: get_macro_snapshot, get_market_snapshot, get_watchlist
complexity: moderate
---

# get_sector_rotation

Detect sector rotation on the Vietnamese stock market. Groups stocks by sector and classifies each sector as **'DONG TIEN VAO' (inflow)**, **'DONG TIEN RA' (outflow)**, or **'ON DINH' (neutral)** based on 5-day and 1-day returns. Sectors are ranked by 5-day return. If a watchlist stock is in an outflow sector, a warning is flagged.

## Arguments

- **lookback_days** (number) — optional, default: 5
  - Time window for rotation analysis. Typical: 5 for week-long trends, 20 for monthly patterns.

- **min_stocks_per_sector** (number) — optional, default: 3
  - Minimum stocks in a sector to consider rotation valid. Filters out noise from single-stock sectors.

## Return Type

```typescript
{
  success: boolean,
  sectors: Array<{
    name: string,
    status: "DONG_TIEN_VAO" | "DONG_TIEN_RA" | "ON_DINH",
    return_5d_pct: number,
    return_1d_pct: number,
    avg_volume_trend: "increasing" | "decreasing" | "stable",
    stock_count: number,
    top_gainers: string[],  // Top 3 stocks in this sector
    top_losers: string[]
  }>,
  watchlist_warnings?: Array<{
    stock_code: string,
    sector: string,
    status: "DONG_TIEN_RA",
    message: string  // e.g., "VIC (Retail) in outflow sector, consider reducing"
  }>,
  rotation_summary: {
    strongest_inflow_sector: string,
    strongest_outflow_sector: string,
    rotation_intensity: "high" | "moderate" | "low"
  },
  timestamp: string
}
```

## Example Usage

### Market Watcher — Daily Sector Rotation Monitoring
```typescript
const rotation = await call_tool("vn-market", "get_sector_rotation", {
  lookback_days: 5
});

// Flag outflow sectors for watchlist stocks
if (rotation.watchlist_warnings && rotation.watchlist_warnings.length > 0) {
  const warning = rotation.watchlist_warnings[0];

  // Post signal to reduce positions in headwind sectors
  await call_tool("vn-market", "post_agent_signal", {
    agent: "alert-commander",
    signal_type: "sector_rotation",
    confidence: 0.65,
    data: {
      message: warning.message,
      watchlist_stock: warning.stock_code,
      outflow_sector: warning.sector,
      action: "consider_trim"
    }
  });

  // Alert user
  await call_tool("vn-market", "send_telegram", {
    channel: "market",
    message: `⚠️ Sector Rotation Alert: ${warning.message}`
  });
}

// Identify inflow opportunity
const inflowSector = rotation.sectors.find(s => s.status === "DONG_TIEN_VAO");
if (inflowSector && inflowSector.return_5d_pct > 5.0) {
  console.log(`Strong inflow: ${inflowSector.name} +${inflowSector.return_5d_pct.toFixed(2)}% (5d)`);
  console.log(`  Top gainers: ${inflowSector.top_gainers.join(", ")}`);
}
```

### Market Analyst — Weekly Rotation Report
```typescript
const rotation = await call_tool("vn-market", "get_sector_rotation", {
  lookback_days: 20  // Monthly view
});

// Rank sectors by return for portfolio rebalancing
const sortedByReturn = rotation.sectors
  .sort((a, b) => b.return_5d_pct - a.return_5d_pct);

const rotationReport = `📊 **Sector Rotation Report (20-day)**

**Inflow Sectors:**
${sortedByReturn
  .filter(s => s.status === "DONG_TIEN_VAO")
  .slice(0, 3)
  .map(s => `  • ${s.name}: +${s.return_5d_pct.toFixed(2)}% (${s.stock_count} stocks)`)
  .join("\n")}

**Outflow Sectors:**
${sortedByReturn
  .filter(s => s.status === "DONG_TIEN_RA")
  .slice(0, 3)
  .map(s => `  • ${s.name}: ${s.return_5d_pct.toFixed(2)}% (${s.stock_count} stocks)`)
  .join("\n")}

Rotation Intensity: ${rotation.rotation_summary.rotation_intensity}`;

await call_tool("vn-market", "send_telegram", {
  channel: "work",
  message: rotationReport
});

// Post signal for synthesis agents
await call_tool("vn-market", "post_agent_signal", {
  agent: "digest-predict",
  signal_type: "sector_rotation",
  confidence: 0.70,
  data: { rotation_report: rotation }
});
```

### Alert Commander — Rotation-Conditioned Thresholds
```typescript
const rotation = await call_tool("vn-market", "get_sector_rotation", {
  lookback_days: 5
});

// Sectors in strong inflow get lower alert threshold (faster entry signals)
const inflow = rotation.sectors.find(s => s.status === "DONG_TIEN_VAO");
const outflow = rotation.sectors.find(s => s.status === "DONG_TIEN_RA");

let baseThreshold = 0.70;
if (inflow && inflow.return_5d_pct > 5.0) {
  baseThreshold = 0.65;  // Raise conviction sensitivity in strong inflow
  console.log(`Inflow sector detected: lowering threshold to ${baseThreshold}`);
}
if (outflow && outflow.return_5d_pct < -5.0) {
  baseThreshold = 0.75;  // Lower conviction sensitivity in strong outflow
  console.log(`Outflow sector detected: raising threshold to ${baseThreshold}`);
}

// Apply threshold to incoming signals
const signals = await call_tool("vn-market", "get_agent_signals", {
  agent: "alert-commander"
});

for (const sig of signals.signals) {
  if (sig.confidence >= baseThreshold) {
    // Send alert...
  }
}
```

## When to Use

- **Daily market opens** — Market Watcher checks sector momentum
- **Portfolio rebalancing** — Analyst uses rotation to identify trim/add opportunities
- **Alert threshold tuning** — Alert Commander uses rotation intensity to adjust conviction thresholds
- **Macro context** — Rotation patterns validate macro cascade signals (oil up → energy inflow)
- **NOT intraday** — Sector rotation is sticky; check daily, not hourly

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_macro_snapshot` | Macro catalyst (oil spike) often drives sector rotation |
| `get_market_snapshot` | Individual stock details within rotating sectors |
| `get_watchlist` | Cross-check: which watched stocks are in inflow/outflow sectors |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `sectors: []` | Market data gap or holiday | Log to WORK, use yesterday's rotation |
| `min_stocks_per_sector` too high | Filtering out valid small sectors | Lower threshold or skip filter |
| `watchlist_warnings: []` | No watched stocks in outflow sectors | Normal; no action needed |

## Notes

- **Rotation intensity:** Calculated from variance across sector returns. High variance = clear rotation; low variance = flat market.
- **Volume confirmation:** `avg_volume_trend: "increasing"` validates inflow (real money moving, not just price spikes).
- **Sector mapping:** Sectors are standardized (Energy, Banking, Retail, etc.). See `.claude/knowledge/stock-classification.md`.
- **Persistence:** Sector rotation typically persists 5-20 days. Useful for medium-term positioning.
- **Contrarian edge:** Strong outflow sectors sometimes bounce quickly. Monitor for reversal setups.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 3 workflow examples, threshold tuning, volume confirmation)
