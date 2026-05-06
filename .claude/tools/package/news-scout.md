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

| Signal Type | To Agent | When | Confidence | Required `finding_data` Fields |
|-------------|----------|------|------------|------|
| `urgent_news` | alert-commander | Breaking news, impact >= 8 | 0.75+ | `headline` (string), `source` (string), `severity` (low\|medium\|high\|critical) |
| `chain_catalyst` | all | Watchlist impact >= 7, multi-agent trigger | 0.80+ | `event_type`, `direction`, `confidence`, `affected_stocks[]`, `affected_sectors[]`, `headline`, `source` |
| `price_confirmation` | market-watcher | Price move validates catalyst | 0.85+ | `price_change_pct`, `volume_ratio`, `confirms_direction`, `fully_priced`, `confidence` |
| `cross_validate` | analyst | Multi-source validation | 0.70+ | `direction` (bullish\|bearish\|neutral), `confidence`, `summary` |

**Important:** All required fields in `finding_data` must be present. Missing any required field will cause validation rejection with detailed error message.

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

### Posting Urgent News Signal

```typescript
// Post urgent breaking news signal
// Required finding_data fields: headline, source, severity
await mcp__claude_ai_gateway__call_tool(
  tool_name="post_agent_signal",
  input={
    from_agent: "news-scout",
    to_agent: "alert-commander",
    signal_type: "urgent_news",
    stock_code: "VNM",
    payload: {
      title: "Emergency news",
      detail: "Central bank announces rate policy",
      impact_score: 8.5
    },
    finding_data: {
      headline: "Central bank emergency rate decision",
      source: "sbv_official",
      severity: "critical",
      catalyst_stock_code: "VNM",
      catalyst_direction: "bullish"
    },
    ttl_minutes: 120
  }
);
```

**Note:** The `severity` field is **required** and must be one of: `"low" | "medium" | "high" | "critical"`. Missing or invalid severity values will reject the signal with validation error.

---

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **MCP Logic:** `.claude/knowledge/mcp-tools.md`
- **Signal Types:** `.claude/knowledge/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `.claude/knowledge/fail-loud-protocol.md`
