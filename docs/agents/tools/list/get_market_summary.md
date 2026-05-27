# get_market_summary

**Category:** Briefings / Market Intelligence

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/summaryTools.ts`

## Purpose

Retrieve a stored periodic market intelligence summary for a given period. Returns cached summary if available; generates on demand if none exists. Use `generate_market_summary` to force a fresh computation.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `period` | enum | Yes | — | Period granularity: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly' |
| `date` | string | No | today | ISO date string (e.g. '2026-03-15') for any day within desired period |

## Return Format

```
MARKET INTELLIGENCE SUMMARY — DAILY 2026-05-05

Highlights:
- VNM profit surge beats consensus by 15%, sparking sector rotation to large-cap financials
- Energy stocks rally 3.5% on OPEC production cut announcement
- Real estate sector weak (-2.1%) amid credit tightening concerns
- VCB consolidating near all-time high; resistance at 32,500 VND

Key Catalysts:
1. VNM Q1 earnings (impact: 8/10) — bullish confirmation of 2026 growth
2. Oil supply shock (impact: 7/10) — supports energy sector outperformance
3. Credit policy tightening (impact: 6/10) — headwind for RE and consumer stocks

Risk Factors:
- Credit cycle peak risk; banks at full valuation
- Geopolitical premium in oil; vulnerable to normalization
- Vietnam foreign ownership caps limiting inflows

Data Summary:
- Total news articles: 247
- Alerts generated: 18 (3 critical, 12 high, 3 medium)
- Sector rotation: large-cap banks gaining, small-cap volatility
- Market breadth: 65% up / 35% down (positive)

[Cached — last updated: 2026-05-05T16:30:00Z]
```

## Period Types

| Period | Range | Typical Use |
|--------|-------|-----------|
| **daily** | One calendar day | End-of-day summary |
| **weekly** | Mon-Sun | Weekly briefing |
| **monthly** | Calendar month | Month-end review |
| **quarterly** | 3-month period (Q1-Q4) | Earnings cycle review |
| **yearly** | Full calendar year | Annual outlook |

## Return Values

Plain text summary including:
- Market highlights and turning points
- Key catalysts by impact score
- Risk factors affecting outlook
- Data statistics (article count, alert count)
- Sector rotation summary
- Last update timestamp (if cached)

## Cache Behavior

1. **Cache hit** (summary exists for period) → return cached text + timestamp
2. **Cache miss** (no summary for period) → generate on demand and cache
3. **Force refresh** → use `generate_market_summary` instead

## Use Cases

- **Digest & Predict** pulls daily summary to include in agent briefing
- **Users** request weekly summary for periodic review
- **Alert Commander** uses monthly summary for context
- **Report Analyzer** compares quarterly summaries for trend analysis
- **Market Watcher** references daily summary during trading

## Related Tools

- `generate_market_summary` — force-generate fresh summary
- `fetch_and_analyze` — feed news into summary generation
- `get_market_snapshot` — real-time market data snapshot

## Notes

- Date parameter accepts ISO 8601 (YYYY-MM-DD) or full timestamp
- Invalid/unparseable dates default to today
- Period boundaries computed automatically (e.g., "2026-05-15" → weekly period 2026-05-12 to 2026-05-18)
- Cached summary shown with `[Cached — last updated: ...]` footer
- Fresh-generated summaries stored in `market_summaries` table
- Max article/alert counts prevent memory bloat in summaries
- Plain text format (no Markdown, no emojis)
