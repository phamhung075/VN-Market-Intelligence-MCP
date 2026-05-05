---
name: export_backtest_run_csv
type: tool
package: unified-coordination
related_tools: get_backtest_run, delete_backtest_run
complexity: simple
---

# export_backtest_run_csv

Export trade-level backtest results to CSV format for analysis in Excel, Python, or R. Returns file path and summary stats (trade count, win rate, Sharpe ratio). Data includes: entry_date, entry_price, exit_date, exit_price, pnl_vnd, pnl_pct, holding_days, signal_reason.

**Use case:** Run backtest → export CSV → open in Excel for manual analysis, regress for correlations, or feed to machine learning.

## Arguments

- **run_id** (string) — **required**
  - Backtest run ID (from `run_backtest()` or `get_backtest_run()`)

- **include_chart** (boolean) — optional, default: false
  - If true, also generate CSV with daily equity curve (date, portfolio_value, drawdown_pct)

- **filter_winners_only** (boolean) — optional, default: false
  - If true, export only profitable trades (PnL > 0)

- **output_format** (enum) — optional, default: "csv"
  - `"csv"` — Plain CSV (compatible with Excel)
  - `"json"` — JSON array (for code analysis)

## Return Type

```typescript
{
  success: boolean,
  run_id: string,
  export_path: string,  // File path (e.g., /app/data/exports/backtest_2026050401_trades.csv)
  summary: {
    total_trades: number,
    winning_trades: number,
    losing_trades: number,
    win_rate_pct: number,
    gross_pnl_vnd: number,
    avg_pnl_per_trade_vnd: number,
    max_dd_pct: number,
    sharpe_ratio: number
  },
  csv_rows: number,
  chart_path?: string,  // If include_chart=true
  timestamp: string
}
```

## Example Usage

### Analyst — Trade Analysis in Excel
```typescript
// Export results for manual analysis
const exported = await call_tool("vn-market", "export_backtest_run_csv", {
  run_id: "bt_2026050401_fpt-breakout-v3",
  include_chart: true,
  filter_winners_only: false,
  output_format: "csv"
});

console.log(`✅ Exported ${exported.csv_rows} trades to ${exported.export_path}`);
console.log(`Summary:`);
console.log(`  Win rate: ${exported.summary.win_rate_pct.toFixed(1)}%`);
console.log(`  Avg PnL: ${exported.summary.avg_pnl_per_trade_vnd.toLocaleString()} VND`);
console.log(`  Max DD: ${exported.summary.max_dd_pct.toFixed(1)}%`);
console.log(`  Sharpe: ${exported.summary.sharpe_ratio.toFixed(2)}`);

// Download file from server and open in Excel
console.log(`📊 Open in Excel: ${exported.export_path}`);

// Also exported equity curve
if (exported.chart_path) {
  console.log(`📈 Equity curve: ${exported.chart_path}`);
}
```

### Data Scientist — Python Analysis
```typescript
// Export JSON for Python pandas/scikit-learn analysis
const exported = await call_tool("vn-market", "export_backtest_run_csv", {
  run_id: "bt_2026050401_fpt-breakout-v3",
  output_format: "json"
});

console.log(`✅ Exported to ${exported.export_path}`);

// Python script can then:
// import json
// with open(exported.export_path) as f:
//   trades = json.load(f)
// df = pd.DataFrame(trades)
// df.groupby('signal_reason').agg({'pnl_pct': ['mean', 'std']})
```

### Analyst — Winners-Only Analysis
```typescript
// Analyze what makes winning trades vs losing trades
const winnersExport = await call_tool("vn-market", "export_backtest_run_csv", {
  run_id: "bt_2026050401_fpt-breakout-v3",
  filter_winners_only: true,
  output_format: "csv"
});

const losersExport = await call_tool("vn-market", "export_backtest_run_csv", {
  run_id: "bt_2026050401_fpt-breakout-v3",
  filter_winners_only: false,
  output_format: "csv"
});

console.log(`Winners (${winnersExport.csv_rows} trades):`);
console.log(`  Avg holding: ? days (need to analyze CSV)`);
console.log(`  Avg profit: ${winnersExport.summary.avg_pnl_per_trade_vnd.toLocaleString()} VND`);

console.log(`\nAll trades (${losersExport.csv_rows} trades):`);
console.log(`  Win rate: ${losersExport.summary.win_rate_pct.toFixed(1)}%`);

// Use CSV diff to find differences (holding time, signal reason, entry price vs RSI level, etc)
```

### PO — Strategy Comparison Report
```typescript
// Compare 3 strategy versions side-by-side
const strategies = [
  "bt_2026050401_strategy-fpt-breakout-v1",
  "bt_2026050401_strategy-fpt-breakout-v2",
  "bt_2026050401_strategy-fpt-breakout-v3"
];

const results = [];

for (const stratId of strategies) {
  const exported = await call_tool("vn-market", "export_backtest_run_csv", {
    run_id: stratId,
    filter_winners_only: false
  });

  results.push({
    strategy: stratId.split("-").pop(),
    trades: exported.summary.total_trades,
    winRate: exported.summary.win_rate_pct,
    avgPnL: exported.summary.avg_pnl_per_trade_vnd,
    sharpe: exported.summary.sharpe_ratio
  });
}

// Create comparison table
const comparison = `
| Strategy | Trades | Win Rate | Avg PnL | Sharpe |
|----------|--------|----------|---------|--------|
${results.map(r => `| ${r.strategy} | ${r.trades} | ${r.winRate.toFixed(1)}% | ${r.avgPnL} | ${r.sharpe.toFixed(2)} |`).join("\n")}
`;

console.log(comparison);
await call_tool("vn-market", "send_telegram", {
  channel: "work",
  message: `Strategy Backtest Comparison\n\`\`\`\n${comparison}\n\`\`\``
});
```

## When to Use

- **After backtest completes** — Export results for offline analysis
- **Manual trade review** — Open CSV in Excel to spot-check signals
- **Data science** — Feed JSON to Python/R for statistical analysis
- **Strategy comparison** — Export multiple runs, compare side-by-side
- **Regulatory audit** — Archive CSV for record-keeping

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_backtest_run` | List available runs to export |
| `delete_backtest_run` | Clean up after exporting (avoid table bloat) |
| `compare_backtest_runs` | Structured comparison tool (alternative to manual Excel) |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `run_id not found` | Run doesn't exist | Check run IDs via get_backtest_run |
| `export_path: null` | Disk full or permission denied | Check disk space, file permissions |
| `csv_rows: 0` | Run had no trades (all signals blocked) | Review signal parameters |

## Notes

- **File location:** CSVs saved to `docs/data/backtest-exports/`. Not in git (in .gitignore).
- **Equity curve:** If include_chart=true, separate CSV with daily equity snapshots for charting.
- **CSV schema:** Standard columns: date, entry_price, exit_price, pnl_vnd, pnl_pct, holding_days, signal_reason, exit_reason.
- **JSON schema:** Same data as CSV but array of objects (easier to parse programmatically).
- **Filtering:** filter_winners_only subset, not separate export. Use CSV diff or Python to manually separate.
- **Large exports:** If trade count > 10,000, may take 10-30s to generate. Consider time this appropriately.

## Last Updated

Generated: 2026-05-04 (new tool, Sprint 1846)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, comparative analysis, data science patterns)
