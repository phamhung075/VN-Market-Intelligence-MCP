# Tool Package — News Scout

**Location:** `.claude/tools/package/news-scout.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-05

## How to Invoke Tools

All VN Market MCP tools are accessed via the `mcp__claude_ai_gateway__call_tool` gateway:

```
mcp__claude_ai_gateway__call_tool(tool_name="<tool_name>", input={...})
```

For detailed parameters and return signatures: `.claude/tools/list/<tool_name>.md`

---

## Tools — News Scout

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "news-scout"` |

### News Fetching & Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `fetch_and_analyze` | Fetch VN news from geo-blocked sources + analyze impact | `watchlist?: string[], keywords?: string[]` |
| `run_impact_chain` | Trace news impact through supply chain and related stocks | `ticker: string, event: string, impact_score: number` |
| `search_similar_context` | Find historical news with similar patterns/catalysts | `query: string, context: object, limit?: number` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_watchlist` | Current watchlist tickers and metadata | — |
| `get_agent_signals` | Recent inter-agent signals (last 24h) | — |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `signal_type: string, payload: object, confidence: number` |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle activity and news findings | `action: string, context: object, signal_ids?: string[]` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

---

## Signal Types Emitted

| Signal | To | When | Confidence |
|--------|----|----|-----------|
| `urgent_news` | Market Watcher | Impact >= 8 | 0.75+ |
| `legal_risk` | Alert Commander | Prosecution/tax penalty | 0.85+ |
| `crisis_velocity` | Alert Commander | 5x mention spike | 0.90+ |
| `chain_catalyst` | All Agents | Watchlist impact >= 7 | 0.80+ |

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | News findings, impact analysis |
| **work** | ✅ | Cycle completion |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap
const bootstrap = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_cycle_bootstrap",
  input={ agent_name: "news-scout" }
);

if (bootstrap.market_context?.trading_window === "closed") {
  // Skip during closed hours
  return;
}
```

### Fetching and Analyzing News

```typescript
// Fetch VN news for watchlist
const newsAnalysis = await mcp__claude_ai_gateway__call_tool(
  tool_name="fetch_and_analyze",
  input={}
);

// newsAnalysis contains:
// - fetched_articles: Article[]
// - impact_by_ticker: Map<ticker, impact_score>
// - alerts: AlertResult[]
```

### Tracing Impact Chain

```typescript
// When we find news about VCB governance issue
const chain = await mcp__claude_ai_gateway__call_tool(
  tool_name="run_impact_chain",
  input={
    ticker: "VCB",
    event: "Board member resignation amid dispute",
    impact_score: 8.5
  }
);

// chain contains:
// - affected_tickers: string[]
// - sector_exposure: number
// - estimated_recovery_days: number
```

### Searching Similar Context

```typescript
// Find similar past events to validate signal
const similar = await mcp__claude_ai_gateway__call_tool(
  tool_name="search_similar_context",
  input={
    query: "board member resignation governance",
    context: {
      ticker: "VCB",
      sector: "banking",
      impact_type: "governance_risk"
    },
    limit: 5
  }
);

if (similar.matches.length > 0) {
  // Use historical data to refine confidence
}
```

### Posting Legal Risk Signal

```typescript
// Post critical legal risk signal
await mcp__claude_ai_gateway__call_tool(
  tool_name="post_agent_signal",
  input={
    signal_type: "legal_risk",
    payload: {
      ticker: "FPT",
      risk_type: "tax_penalty",
      source: "news_article",
      estimated_impact: "10-15% price decline",
      article_url: "..."
    },
    confidence: 0.88
  }
);
```

---

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **MCP Logic:** `.claude/knowledge/mcp-tools.md`
- **Signal Types:** `.claude/knowledge/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `.claude/knowledge/fail-loud-protocol.md`
