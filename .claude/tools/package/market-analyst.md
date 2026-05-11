# Tool Package — Market Analyst

**Location:** `.claude/tools/package/market-analyst.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read file contents, backtest results, reports |
| Glob | Find test runs, CSV exports, historical data |
| Grep | Search analysis logs and result summaries |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `export_backtest_run_csv` | Export backtest run results to CSV format |
| `compare_backtest_runs` | Compare metrics across multiple backtest runs |

## Constraints & Permissions

- **Read-heavy:** Primarily analyzes existing data, not writing new data
- **Backtest focus:** Works with backtesting infrastructure and results
- **No direct code edits:** Analysis only; changes via developer agent
- **Stock watchlist:** Reference `/docs/data/user-watchlist.md` for 30-ticker portfolio

## Usage

**Backtesting workflow:**
```bash
# Export a specific run
export_backtest_run_csv(run_id="run-20260505-001", output_format="csv")

# Compare two runs
compare_backtest_runs(run_ids=["run-20260505-001", "run-20260504-999"])

# Read backtest results
Read file: /docs/data/backtest-results.json
```

## Knowledge Loaded at Start

- `docs/{policies,protocols,standards,references}/stock-classification.md` — sector mapping, liquidity tiers
- `docs/policies/alert-policy.md` — alert thresholds and severity (lazy-load)
- `docs/GLOSSARY_VI.md` — Vietnamese financial terms (lazy-load on demand)

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| market | write | analysis_reports_only |
| work | read | none |
| bug | read | none |
