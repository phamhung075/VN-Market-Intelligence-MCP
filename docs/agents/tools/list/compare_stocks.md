# compare_stocks

**Category:** News-Analysis / Comparison

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/compareTools.ts`

## Purpose

Side-by-side comparison of 2-5 Vietnamese stocks across price, financial, and alert metrics. Returns a plain-text table showing relative valuations and alert activity. No network calls (all data from local SQLite).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `stocks` | array | Yes | — | List of 2-5 stock codes (e.g. ['VNM', 'VCB', 'HPG']) |

## Return Format

```
Stock Comparison — 5 stocks

Code  Exchange Price (VND) Change% P/E     ROE %   Alert7d Conviction
─────────────────────────────────────────────────────────────────────
VNM   HOSE    87,500      +1.2%   18.5    12.3%   2       0.78
VCB   HOSE    32,400      -0.5%   12.1    15.8%   1       0.85
HPG   HOSE    28,750      +2.1%   9.3     18.2%   5       0.62
GAS   HOSE    18,200      -1.8%   11.4    10.5%   0       0.70
VRE   HOSE    15,850      +0.8%   22.1    8.9%    3       0.58
```

## Metrics Explained

| Column | Source | Definition |
|--------|--------|-----------|
| **Code** | watchlist | Stock ticker |
| **Exchange** | watchlist | HOSE, HNX, or UPCOM |
| **Price (VND)** | market_prices | Last traded price |
| **Change%** | market_prices | Percentage change (1d or last update) |
| **P/E** | financial_reports | Price-to-earnings (latest sort_key per stock) |
| **ROE %** | financial_reports | Return on equity (latest period) |
| **Alert7d** | alerts table | Count of active alerts in last 7 days |
| **Conviction** | conviction_history | Latest conviction score (0.0-1.0, if available) |

## Use Cases

- **Report Analyzer** compares sector peers to identify relative value
- **Market Watcher** shows investor comparisons across watchlist
- **Alert Commander** prioritizes stocks with multiple alerts
- **Digest & Predict** includes comparison in weekly briefings

## Data Sources

All data from local SQLite (zero network overhead):
- `market_prices` — current price and % change
- `financial_reports` — P/E, ROE, net revenue (latest per stock)
- `alerts` — count alerts affecting each stock in 7-day window
- `conviction_history` — conviction score (optional table)

## Related Tools

- `compare_financials` — deeper BCTC metric comparison
- `get_sector_comparison` — sector-wide metrics
- `get_ticker_intelligence` — detailed single-stock intelligence

## Notes

- Accepts 2-5 stocks; rejects >5 or <2
- Missing data shows "—" in table
- P/E and ROE require financial_reports; blank if unavailable
- Conviction optional; shows "—" if table missing or no data
- All prices in Vietnamese Dong (VND, millions implied by context)
- Plain text format (no Markdown, no emojis) for consistency
- Sorted by input order (not by price or P/E)
