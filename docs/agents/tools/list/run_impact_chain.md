# run_impact_chain

**Category:** News-Analysis / Cascade Engine

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts`

## Purpose

Run causal cascade engine on a news headline to predict affected stocks and domains. Matches headline against sector-specific rules (oil/aviation/banking/real_estate/steel/securities) and outputs a causal chain with affected stocks and predicted direction.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `newsText` | string | Yes | — | Event or news headline to analyze, Vietnamese or English (e.g. 'Oil prices surge 10% on supply shock') |
| `source` | string | No | user | Source of the headline ('cafef', 'reuters', 'user', etc.) |
| `stocks` | array | No | [] | Optional pre-selected stocks to override cascade detection |

## Return Format

```
Impact Chain Analysis — "Oil prices surge 10% on supply shock"

Domain Matches:
  1. energy/oil (confidence: 95%)
  2. shipping (confidence: 45%)

Affected Stocks:
  PTL (Petrolimex)         → BUY (confidence: 85%)
  GAS (PV Gas)             → BUY (confidence: 82%)
  PVD (PV Drilling)        → BUY (confidence: 78%)
  VSC (Vosco)              → BUY (confidence: 62%)

Sector Rules Triggered:
  - oil_gas_up (rule confidence: 85%, historical win rate: 82%)

Time Horizon: short-term (3-7 days)
Summary: Oil supply shock likely to benefit domestic energy producers. Highest conviction in Petrolimex and PV Gas. Monitor for sector rotation from bonds to energy.

Severity: HIGH
Related News: 3 similar historical events (2023-05, 2024-02, 2024-11)
```

## Cascade Rule Logic

Rules match headlines using:
- **Keyword matching**: domain-specific terminology (e.g., "oil", "refinery", "supply")
- **Sentiment analysis**: negative (decline) vs. positive (growth)
- **Magnitude scoring**: severity of impact (small/medium/large)
- **Sector rules**: oil_gas_up/down, aviation_down, banking_up/down/neutral, etc.

## Output Fields

| Field | Definition |
|-------|-----------|
| **Domain Matches** | Sectors detected in headline (confidence %) |
| **Affected Stocks** | Predicted impacted stocks with direction and confidence |
| **Sector Rules Triggered** | Which cascade rules fired (rule confidence + historical win rate) |
| **Time Horizon** | Immediate, short-term (3-7d), medium-term (1-4w), long-term (>4w) |
| **Summary** | Narrative interpretation and trading implications |
| **Severity** | LOW, MEDIUM, HIGH based on impact score and rule confidence |
| **Related News** | Historical similar events for context |

## Use Cases

- **News Scout** analyzes breaking news to post urgent_news signals
- **Alert Commander** prioritizes alerts based on impact chain severity
- **Market Watcher** trades technical confirmations after cascade prediction
- **Financial Analyst** correlates cascade predictions with BCTC fundamentals

## Related Tools

- `fetch_and_analyze` — feed headlines into cascade engine
- `search_similar_context` — find historical similar events
- `post_agent_signal` — broadcast cascade findings to other agents

## Confidence Levels

| Confidence | Meaning |
|-----------|---------|
| **85-100%** | Clear domain match + strong rule trigger + high historical accuracy |
| **70-84%** | Good domain match + rule trigger + confirmed accuracy |
| **50-69%** | Partial domain match + rule suggestion + moderate accuracy |
| **< 50%** | Weak match; consider with caution |

## Notes

- Cascade rules are defined in `cascadeEngine.ts`
- Rule matching is keyword + sentiment + magnitude
- Historical win rates pull from `cascade_rule_hits` table
- Related news from semantic search in RAG vector store
- Empty headline returns error message
- Stocks parameter overrides cascade detection if provided
- Time horizon inferred from keyword context + historical patterns
