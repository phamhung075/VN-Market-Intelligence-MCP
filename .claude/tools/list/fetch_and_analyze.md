# fetch_and_analyze

**Category:** News-Analysis

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts`

## Purpose

Fetch live news from RSS sources (CafeF, VnExpress, Reuters, VnEconomy), normalize each item into structured AnalysisEntry, store in SQLite RAG memory and vector store, and return a formatted summary of the market intelligence gathered.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `sources` | array | No | all | RSS sources to fetch from: 'cafef', 'vnexpress', 'reuters', 'vneconomy' |
| `limit` | number | No | 20 | Maximum total number of news items to analyze (1-50) |

## Return Format

```
Fetched and analyzed 20 news items (CafeF, VnExpress, Reuters, VnEconomy)

[HIGH] [BULLISH] 2026-05-05 14:35 | impact: 8/10 bullish
  Source  : CafeF
  Domains : Banking, Real Estate
  Stocks  : VCB, VRE
  Summary : VCB posts Q1 profit surge 15% above consensus forecast…

[MEDIUM] [NEUTRAL] 2026-05-05 12:10 | impact: 5/10 neutral
  Source  : VnExpress
  Domains : Energy
  Stocks  : GAS, PVD
  Summary : Government announces new energy efficiency standards…

[HIGH] [BEARISH] 2026-05-04 18:20 | impact: 7/10 bearish
  Source  : Reuters
  Domains : Technology
  Stocks  : FPT, MWG
  Summary : US tech tariffs may impact Vietnamese export sector…

Total: 20 items analyzed | Bullish: 8 | Neutral: 7 | Bearish: 5
High-impact alerts: 5 (impact >= 7)
```

## Data Storage

- **rag_analyses table**: Normalized news entries with metadata
- **Vector store**: Embeddings for semantic search
- **Deduplication**: INSERT OR IGNORE prevents duplicate entries

## News Normalization

Each article is normalized to:
- **ID**: Unique hash of source + timestamp
- **Level**: HIGH (impact >= 7), MEDIUM (4-6), LOW (< 4)
- **Sentiment**: bullish, bearish, neutral
- **Impact Score**: 0-10 (higher = more market-moving)
- **Impact Direction**: directional indicator (up/down/neutral)
- **Affected Domains**: sectors impacted (banking, energy, etc.)
- **Affected Actions**: stock tickers mentioned
- **Time Horizon**: immediate, short-term, medium-term, long-term
- **Summary**: 120-character normalized headline
- **Source**: CafeF, VnExpress, Reuters, VnEconomy

## Use Cases

- **News Scout** calls periodically to ingest latest market intelligence
- **System health check** verifies news feed availability
- **Enrichment chain** feeds headlines into cascade engine
- **RAG pipeline** builds vector index for semantic search

## RSS Sources

| Source | Frequency | Focus |
|--------|-----------|-------|
| **CafeF** | Real-time | Vietnam financial news, stocks |
| **VnExpress** | Hourly | General news with economic bent |
| **Reuters** | Real-time | International financial news |
| **VnEconomy** | Hourly | Vietnam economy and business |

## Related Tools

- `run_impact_chain` — cascade engine analysis of specific headlines
- `search_similar_context` — semantic search through stored analyses
- `post_agent_signal` — signal bus for inter-agent coordination

## Notes

- Empty feeds return "No news items fetched" (network or feed unavailability)
- Limit capped at 50 to prevent memory bloat
- Fetches run in parallel for speed (Promise.all)
- Fallback patterns used for Vietnamese sites (browser User-Agent, multi-tier retry)
- Deduplication key: source_url + published_at
- Missing data shows "—" in output
- Returns plain text, no Markdown or emojis
