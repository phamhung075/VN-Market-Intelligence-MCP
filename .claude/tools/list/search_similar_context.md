# search_similar_context

**Category:** News-Analysis / RAG Search

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts`

## Purpose

RAG semantic search for similar past analyses. Finds historically similar market contexts (news events, price patterns, fundamental shifts) to inform current decisions. Includes optional recency weighting and per-result confidence scores.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query (e.g., 'oil price shock impact on energy stocks') |
| `limit` | number | No | 10 | Max results to return (1-50) |
| `recency_days` | number | No | 365 | Prefer results from last N days (1-1000); 0 = no preference |
| `stock_code` | string | No | — | Filter to analyses affecting specific stock (e.g. 'VNM'), optional |

## Return Format

```
RAG Search Results — "oil price shock impact on energy stocks" (10 results)

Recency weight applied: last 180 days

1. [Q1 2024-02] Oil surge 8% on OPEC cut
   Confidence: 92%
   Stocks affected: PTL (+8.2%), GAS (+6.5%), VSC (+4.1%)
   Summary: OPEC supply cut led to 8-week rally in energy sector.
            Petrolimex outperformed broader market +12%.
   Published: 2024-02-15 (14 months ago)
   RAG ID: rag_2024021502_energy_surge

2. [Q4 2023-11] Geopolitical tensions spike oil demand
   Confidence: 88%
   Stocks affected: PTL (+5.3%), GAS (+4.8%), PVD (+3.2%)
   Summary: Red Sea shipping tensions support Middle East oil premium.
            Energy stocks rallied 3-5% over 2 weeks.
   Published: 2023-11-10 (19 months ago)
   RAG ID: rag_2023111001_geopolitical

3. [Q2 2024-05] Oil prices collapse on recession fears
   Confidence: 85%
   Stocks affected: PTL (-6.1%), GAS (-5.2%), VSC (-3.8%)
   Summary: Demand destruction concerns outweighed supply constraints.
            Energy sector underperformed 8% over 3 weeks.
   Published: 2024-05-22 (11 months ago)
   RAG ID: rag_2024052215_recession

[…7 more results…]

---
Search stats: 23 articles indexed | 3 high-confidence (>85%) | 7 medium (70-85%) | 13 low (<70%)
Recency boost applied: +15% weight to last 180 days
```

## Recency Weighting

Task 1107 adds `recency_weight` re-ranking:
- Results from `recency_days` window get +boost in ranking
- Older results still returned but ranked lower (useful context, less immediate)
- `recency_days=0` disables weighting (chronological order only)

## Confidence Scoring

| Score | Source | Definition |
|-------|--------|-----------|
| **90-100%** | RAG embedding + domain keywords | Highly similar context |
| **75-89%** | Good embedding match + partial keywords | Strong context |
| **60-74%** | Moderate embedding match | Suggestive context |
| **<60%** | Weak match | Low relevance |

## Use Cases

- **News Scout** finds historical similar events for context
- **Market Watcher** searches for past technical patterns
- **Financial Analyst** finds prior BCTC patterns
- **Report Analyzer** discovers correlations between events
- **Alert Commander** validates current alerts against historical false positives

## Return Fields (Per Result)

| Field | Definition |
|-------|-----------|
| **Period** | Quarterly reference (Q#-YYYY) |
| **Event** | Headline of historical analysis |
| **Confidence** | Similarity score (50-100%) |
| **Stocks affected** | Tickers impacted with price deltas |
| **Summary** | 1-2 sentence context and outcome |
| **Published** | Date + relative time (months/years ago) |
| **RAG ID** | Database identifier for full retrieval |

## Related Tools

- `fetch_and_analyze` — feed news into RAG vector store
- `run_impact_chain` — cascade analysis for current headline
- `get_sentiment_trend` — historical sentiment patterns

## Notes

- Query can be headline, domain name, stock code, or abstract concept
- Vector embeddings computed via LanceDB for fast similarity search
- Recency window default 365 days (full year); can be 1-1000 days
- Max 50 results per call; default 10 to balance speed/coverage
- Confidence floor 50%; lower scores filtered out automatically
- Older results (>1 year) lower ranked if recency_days specified
- Missing RAG data (empty store) returns "No similar contexts found"
- Plain text output, no Markdown
