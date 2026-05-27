# generate_market_summary

**Category:** Briefings / Market Intelligence

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/summaryTools.ts`

## Purpose

Force-generate a fresh periodic market intelligence summary and store it. Overwrites any existing cached summary for the specified period. Useful for triggering immediate updates when market conditions change significantly.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `period` | enum | Yes | — | Period granularity: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly' |
| `date` | string | No | today | ISO date string (e.g. '2026-03-15') for any day within desired period |

## Return Format

```
MARKET INTELLIGENCE SUMMARY — DAILY 2026-05-05 [FRESH]

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

Generated: 2026-05-05T17:15:00Z [FRESH COMPUTATION]
```

## Generation Process

1. Query all news articles within period window
2. Compute alert statistics (counts by severity)
3. Analyze sector rotation using price/performance data
4. Identify key catalysts (impact >= 7) from RAG analyses
5. Summarize in plain Vietnamese/English narrative
6. Store in `market_summaries` table with timestamp
7. Overwrite prior cached version (if exists)

## Use Cases

- **News Scout** triggers fresh summary after major market event (earnings, regulatory change)
- **Digest & Predict** forces daily summary regeneration before briefing
- **Alert Commander** updates summary during crisis (circuit breaker, gap move)
- **Report Analyzer** regenerates quarterly summary after month-end close

## Return Fields

| Field | Definition |
|-------|-----------|
| **Highlights** | Top 3-5 market-moving developments |
| **Key Catalysts** | Events with impact >= 7, ranked by score |
| **Risk Factors** | Potential headwinds or vulnerabilities |
| **Data Summary** | Article count, alert count, sector rotation, breadth |
| **Generated** | Timestamp of generation |

## Storage & Caching

- Stored in `market_summaries` table with:
  - `period_type`: daily, weekly, monthly, quarterly, yearly
  - `period_start`: computed period boundary
  - `period_end`: computed period boundary
  - `summary_text`: generated narrative
  - `updated_at`: generation timestamp
- Overwrites existing record for same period/period_start
- Next `get_market_summary` call returns cached version (no recomputation)

## Related Tools

- `get_market_summary` — retrieve cached summary (faster)
- `fetch_and_analyze` — feed news into summary generation pipeline
- `post_agent_signal` — agents trigger summary update via signal bus

## Notes

- Computation time varies (3-15s depending on data volume)
- Date parameter specifies any day in desired period; boundaries auto-computed
- Overwrites prior cache; no version history kept (only latest per period)
- All sources (rag_analyses, alerts, market_prices) included in generation
- Plain text output (no Markdown, no emojis)
- Cache invalidated on next period boundary (auto-expiry)
- Performance: queries optimized for <100K article lookups
