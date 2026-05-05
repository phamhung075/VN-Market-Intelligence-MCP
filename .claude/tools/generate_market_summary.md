---
name: generate_market_summary
type: tool
package: digest-synthesis, unified-coordination
related_tools: get_evidence_summary, send_telegram
complexity: moderate
---

# generate_market_summary

Force-generate a fresh periodic market intelligence summary and store it. **Overwrites any existing cached summary** for the specified period. Returns the newly generated plain-language summary text. Used by Digest & Predict to synthesize daily/weekly/monthly intelligence for MARKET channel briefing.

## Arguments

- **period** (enum) — **required**
  - `"daily"` — Market recap for today
  - `"weekly"` — Week overview (Mon-Fri)
  - `"monthly"` — Full month recap
  - `"custom"` — Specified date range (requires start_date + end_date)

- **start_date** (string) — optional if period is not "custom"
  - ISO format (e.g., "2026-05-01"). Required for `period: "custom"`.

- **end_date** (string) — optional if period is not "custom"
  - ISO format (e.g., "2026-05-07"). Required for `period: "custom"`.

- **include_predictions** (boolean) — optional, default: true
  - Include outstanding prediction claims in summary

- **force_regenerate** (boolean) — optional, default: false
  - If true, ignore cache and regenerate from scratch (slower). Useful if underlying data changed.

## Return Type

```typescript
{
  success: boolean,
  summary: {
    period: string,
    date_range: {
      start: string,
      end: string
    },
    narrative: string,  // Plain-language market summary (500-1000 words)
    key_metrics: {
      market_return_pct: number,
      sector_performance: {
        [sector: string]: number  // %
      },
      watchlist_avg_return: number,
      volatility_vix_style: number
    },
    highlights: string[],  // Top 5 market-moving events
    risks: string[],  // Key downside risks
    opportunities: string[],  // Key upside opportunities
    predictions: {
      outstanding_claims: number,
      next_resolution_date: string
    }
  },
  cache_status: "created" | "regenerated",
  generated_at: string,
  timestamp: string
}
```

## Example Usage

### Digest & Predict — Daily Market Summary Generation
```typescript
// At 16:00 UTC (market close), generate daily summary
const daily = await call_tool("vn-market", "generate_market_summary", {
  period: "daily",
  include_predictions: true,
  force_regenerate: false  // Use cache if available
});

console.log(`Daily Summary Generated: ${daily.summary.period}`);
console.log(`Market return: ${daily.summary.key_metrics.market_return_pct > 0 ? "↑" : "↓"} ${Math.abs(daily.summary.key_metrics.market_return_pct).toFixed(2)}%`);

// Send to MARKET channel
const message = `
📊 **Daily Market Summary — ${daily.summary.date_range.start}**

${daily.summary.narrative}

**Sector Performance:**
${Object.entries(daily.summary.key_metrics.sector_performance)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([sector, ret]) => `  ${sector}: ${ret > 0 ? "↑" : "↓"} ${Math.abs(ret).toFixed(2)}%`)
  .join("\n")}

**Highlights:**
${daily.summary.highlights.slice(0, 3).map((h, i) => `  ${i + 1}. ${h}`).join("\n")}

**Next Prediction Resolution:** ${daily.summary.predictions.next_resolution_date}
`;

await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: message
});
```

### Digest & Predict — Weekly Strategic Review
```typescript
// At end of week (Friday 16:00 UTC), generate weekly summary
const weekly = await call_tool("vn-market", "generate_market_summary", {
  period: "weekly",
  include_predictions: true,
  force_regenerate: true  // Force fresh analysis (new data may have come in)
});

// Extract key insights for strategy memo
const strategicMemo = `
📈 **Weekly Market Review** (${weekly.summary.date_range.start} to ${weekly.summary.date_range.end})

**Performance:** ${weekly.summary.key_metrics.market_return_pct > 0 ? "✅ Positive" : "❌ Negative"} (${weekly.summary.key_metrics.market_return_pct.toFixed(2)}%)

**Watchlist Avg:** ${weekly.summary.key_metrics.watchlist_avg_return.toFixed(2)}%

**Sector Rotation:**
${Object.entries(weekly.summary.key_metrics.sector_performance)
  .sort((a, b) => b[1] - a[1])
  .map(([sector, ret]) => `  • ${sector}: ${ret.toFixed(2)}%`)
  .join("\n")}

**Top Opportunities:**
${weekly.summary.opportunities.slice(0, 3).map((opp, i) => `  ${i + 1}. ${opp}`).join("\n")}

**Key Risks:**
${weekly.summary.risks.slice(0, 3).map((risk, i) => `  ${i + 1}. ${risk}`).join("\n")}
`;

// Log to WORK channel (internal team, not external briefing)
await call_tool("vn-market", "send_telegram", {
  channel: "work",
  message: strategicMemo
});

// Also store in memory for next week's comparison
await call_tool("vn-market", "append_session_record", {
  category: "weekly_review",
  content: weekly.summary
});
```

### Unified Agent — Monthly Calibration Review
```typescript
// At month-end, generate full month summary for calibration check
const monthly = await call_tool("vn-market", "generate_market_summary", {
  period: "monthly",
  include_predictions: true,
  force_regenerate: true
});

// Compare predictions made vs actual outcomes
const predictionAccuracy = await call_tool("vn-market", "get_calibration_report", {});

const calibrationMemo = `
📊 **Monthly Calibration Review** (${monthly.summary.date_range.start})

Market Performance: ${monthly.summary.key_metrics.market_return_pct.toFixed(2)}%

Prediction Accuracy: ${predictionAccuracy.overall_accuracy.toFixed(2)}%
• 80%+ conviction claims: ${predictionAccuracy.conviction_80_plus.accuracy.toFixed(2)}% accurate
• 60-80% conviction claims: ${predictionAccuracy.conviction_60_80.accuracy.toFixed(2)}% accurate
• 40-60% conviction claims: ${predictionAccuracy.conviction_40_60.accuracy.toFixed(2)}% accurate

**Calibration Gap:**
${Math.abs(predictionAccuracy.overall_accuracy - 50) < 10 ? "✅ Well calibrated" : "⚠️ Poorly calibrated"}

**Outstanding Predictions:** ${monthly.summary.predictions.outstanding_claims}
**Next Resolution:** ${monthly.summary.predictions.next_resolution_date}
`;

// Store for QA review
await call_tool("vn-market", "log_agent_work", {
  agent_name: "unified-agent",
  status: "completed",
  summary: `Monthly calibration review: ${calibrationMemo.split("\n")[0]}`,
  findings: [
    `Prediction accuracy: ${predictionAccuracy.overall_accuracy.toFixed(2)}%`,
    `${monthly.summary.predictions.outstanding_claims} predictions still outstanding`
  ],
  actions: ["Generated monthly market summary", "Reviewed prediction calibration", "Identified threshold adjustments needed"]
});
```

### Custom Date Range Summary
```typescript
// Generate summary for specific period (e.g., after a major event)
const eventSummary = await call_tool("vn-market", "generate_market_summary", {
  period: "custom",
  start_date: "2026-05-01",
  end_date: "2026-05-10",  // Post-earnings period
  include_predictions: true,
  force_regenerate: true
});

// Use for event impact analysis
const impact = eventSummary.summary.key_metrics.market_return_pct;
console.log(`Market impact during earnings period: ${impact > 0 ? "Positive" : "Negative"} ${Math.abs(impact).toFixed(2)}%`);
```

## When to Use

- **Daily 16:00 UTC** — Digest & Predict generates daily summary for MARKET briefing
- **Weekly Friday 16:00 UTC** — Weekly strategic review for WORK channel
- **Monthly month-end** — Unified Agent monthly calibration check
- **Post-event** — After major news, manually generate summary for impact analysis
- **NOT real-time** — Summaries are periodic; data is snapshot at generation time

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_evidence_summary` | Raw data that feeds into summary narrative |
| `send_telegram` | Broadcast generated summary to MARKET/WORK channels |
| `get_calibration_report` | Compare summary predictions vs actual outcomes |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `narrative: null, cache_status: "failed"` | Underlying data fetch failed | Fall back to last-cached summary or manual briefing |
| `sector_performance: {}` | Insufficient data points | Use last-known sector allocations |
| `highlights: []` | No significant events | Proceed with neutral summary |

## Notes

- **Narrative generation:** Uses RAG (retrieval-augmented generation) to synthesize from evidence database. Quality improves as more context is logged.
- **Caching:** Daily/weekly/monthly summaries cached for 1 hour. Call with `force_regenerate: true` to bypass cache.
- **Predictions included:** Only if `include_predictions: true`. Useful for excluding stale predictions in historical summaries.
- **Sector mapping:** See `.claude/knowledge/stock-classification.md` for sector definitions.
- **Volatility calculation:** VIX-style measure from realized option IV and price swings (not actual VIX, which doesn't exist for Vietnam).

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, caching, custom date ranges, calibration)
