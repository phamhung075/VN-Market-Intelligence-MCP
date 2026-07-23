# get_market_sentiment_index

**Purpose:** Market-wide news sentiment index derived from stored rag_analyses.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| — | — | No parameters |

**Returns:** (1) confidence-weighted daily sentiment score (bullish=+1, bearish=-1, neutral=0), (2) z-score vs 60/90-day baseline — null when <21 actual days (no fabricated distribution), (3) 5-day EMA of sentiment, (4) bull/bear/neutral dispersion ratios from last 5 calendar days…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_market_sentiment_index", arguments={})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
