# Tool Package — News Scout

**Location:** `docs/agents/tools/package/news-scout.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-15

## How to Invoke Tools

All VN Market MCP tools are accessed via the MCP gateway `call_tool` (server="vn-market").
Server name: **`vn-market`** (exact, no variants).

```
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

⚠️ **Wrong** → ~~`tool_name`~~ use `tool` | ~~`input`~~ use `arguments` | ~~`vnmarket-mcp`~~ use `"vn-market"`

For detailed parameters and return signatures: `docs/agents/tools/list/<tool_name>.md`

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
| `run_impact_chain` | Trace news impact through supply chain and related stocks | `newsText: string, includeWatchlist?: boolean` |
| `search_similar_context` | Find historical news with similar patterns/catalysts | `query: string, context: object, limit?: number` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_watchlist` | Current watchlist tickers and metadata | — |
| `get_agent_signals` | Recent inter-agent signals (last 24h) | `from_agent: string` (req in sender-history mode); `agent: string` (req in inbox mode) |
| `get_macro_snapshot` | Macro regime snapshot for 0b regime detection | `source?: string, regimeType?: string` |

### US Monetary Chain
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_fed_liquidity_spread` | Compute EFFR-IORB spread (carry cost proxy) | — |
| `get_ism_subcomponents` | ISM Manufacturing PMI sub-components + regime signal | — |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `from_agent: string, to_agent: string, signal_type: string, payload: object` |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle lifecycle — **two-call pattern required** (see recipe below) | Call 1: `agent_name, status: "running"` → `{ id }`. Call 2: `agent_name, id, status: "completed"\|"error", summary?, findings?, actions?` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

#### `log_agent_work` — Two-Call Recipe

```
// Call 1 — session START (at top of cycle, before any work)
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "news-scout",
  "status": "running"
})
// startResult → { "id": <number> }
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (at bottom of cycle, after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "news-scout",
  "id": logId,
  "status": "completed",
  "summary": "one-line description of what was done",
  "findings": "optional: signals found, alerts fired, etc.",
  "actions": ["optional: list of actions taken"]
})
// Returns → { "ok": true, "id": <number> }
```

**Error path:** if cycle errors, pass `status: "error"` in Call 2 instead of `"completed"`. The `id` from Call 1 is always required for Call 2.

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
const bootstrap = await call_tool(
  server: "vn-market", tool: "get_cycle_bootstrap",
  arguments: { agent_name: "news-scout" }
);

if (bootstrap.market_context?.trading_window === "closed") {
  // Skip during closed hours
  return;
}
```

### Fetching and Analyzing News

```typescript
// Fetch VN news for watchlist
const newsAnalysis = await call_tool(
  server: "vn-market", tool: "fetch_and_analyze",
  arguments: {}
);

// newsAnalysis contains:
// - fetched_articles: Article[]
// - impact_by_ticker: Map<ticker, impact_score>
// - alerts: AlertResult[]
```

### Tracing Impact Chain

```typescript
// When we find news about VCB governance issue
const chain = await call_tool(
  server: "vn-market", tool: "run_impact_chain",
  arguments: {
    newsText: "VCB board member resignation amid dispute — governance risk",
    includeWatchlist: true
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
const similar = await call_tool(
  server: "vn-market", tool: "search_similar_context",
  arguments: {
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
await call_tool(
  server: "vn-market", tool: "post_agent_signal",
  arguments: {
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

## Task-Lock Coordination Tools (Phase 2 Ready)

Tool ready — flow-level claim/heartbeat wiring lands in Phase 2/3 (not yet active in cycle.md).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim a coordination lock before exclusive work | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew a held lock every 5 min (prove-alive) | `task_id` |
| `task_release` | Release lock on completion | `task_id` |

Full protocol: `docs/protocols/task-lock-protocol.md` | Skill: `.claude/skills/task-lock/SKILL.md`

---

## Related Documentation

- **All Tools Index:** `docs/agents/tools/list/README.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Signal Types:** `docs/standards/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
