# get_market_context

**Module:** `interface/mcp/tools/market-data/marketContextTools.ts`

**Category:** Market Data (Compound)

## Overview

A single compound tool that replaces the 5-call opening sequence every analysis agent performs at the start of each session:

```
get_watchlist → get_market_snapshot → get_macro_snapshot
  → get_alerts → get_analysis_history
```

Returns all 5 labeled sections in one structured text response, reducing agent startup latency and token overhead.

## Tool Signature

```typescript
get_market_context(hours_back?: number) → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `hours_back` | number | no | 24 | How many hours back to look for alerts and analysis entries (1–168, max 7 days) |

## Output Format

Plain text with 5 labeled sections separated by blank lines:

1. **WATCHLIST & PRICES** — all watchlist stocks with last known price and percentage change
2. **MACRO** — latest commodity prices (oil, gold) and macro indicators (USD/VND, CPI, SBV rates)
3. **OPEN ALERTS** — unread alerts within the time window, with severity and timestamp
4. **RECENT ANALYSIS** — latest RAG analysis entries ordered by impact score
5. **SYSTEM STATUS** — health summary with pending alert count and last cycle time

## Data Sources

| Section | Source |
|---------|--------|
| Watchlist & Prices | `watchlist`, `market_prices_history` (latest per exchange) |
| Macro | `commodity_snapshot`, `sbv_rates`, `tracked_indicators` |
| Alerts | `alerts` table (status='unread', created within hours_back) |
| Analysis | `rag_analyses` (ordered by impact, created within hours_back) |
| System Status | `alerts` (pending count), scheduler state (last cycle) |

## Key Characteristics

- Single DB transaction pass for all 5 sections
- Time window: 1–168 hours back (configurable, default 24h)
- All sections use Vietnamese labels and formatting
- Graceful degradation: if a section fails to build, it shows "unavailable" message
- Returns formatted text (no JSON) for agent readability

## Usage Examples

```
Agent (session start) → get_market_context(hours_back=24)
Returns full context snapshot for last 24 hours

Agent (post-lunch check) → get_market_context(hours_back=12)
Returns context for last 12 hours only

Agent (weekly review) → get_market_context(hours_back=168)
Returns context for the full past week
```

## Error Handling

- Returns empty section with "unavailable" label if builder fails
- Never throws; always returns text response
- Database errors logged but don't crash the entire tool

## Integration Notes

- **Mandatory opening sequence:** All analysis agents call this at cycle start (replacing 5-call pattern)
- **Replaces:** `get_watchlist` + `get_market_snapshot` + `get_macro_snapshot` + `get_alerts` + `get_analysis_history`
- **Token reduction:** ~25% savings vs. 5 separate tool calls
- **Used by:** News Scout, Financial Analyst, Report Analyzer, Market Watcher, Alert Commander, Digest & Predict, QA Responder

## Performance

- Single DB transaction: ~100–200ms typical
- Scales with `hours_back` (larger window = more alerts/analysis rows to fetch)
- Capped at 168 hours to prevent runaway queries

---

**Added:** Task 239 (Sprint 037 - Compound Context Tool)
**Status:** STABLE
