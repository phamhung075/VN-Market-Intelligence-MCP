# Tool Package — FB Market Poster

**Location:** `docs/agents/tools/package/fb-market-poster.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-06-07 (v3 — phantom tools replaced with live equivalents)

## How to Invoke Tools

All VN Market MCP tools are accessed via the MCP gateway `call_tool` (server="vn-market").

```
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

---

## Tools — FB Market Poster

### Bootstrap & Lifecycle
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch system status + market context | `agent_name: "fb-market-poster"` |
| `log_agent_work` | Log cycle start/end — two-call pattern required | Call 1: `agent_name, status: "running"` → `{ id }`. Call 2: `agent_name, id, status: "completed"\|"error", summary?, findings?, actions?` |

### Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "work" \| "bug"` |
| `submit_feedback` | Submit bug report | `severity: "critical"\|"high"\|"medium"\|"low", title: string` |

**Channel permissions:**
- `work` — cycle status only
- `bug` — errors only
- `market` — NEVER (this agent does not write to MARKET channel)

### Live Market Read Tools (STEP 1b enrichment)

Called after notebook reads to fill missing quantitative fields. All read-only. Each call wrapped in error-skip: if tool errors, log and continue with notebook fallback.

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_market_snapshot` | All indices (VN-Index, VN30, HNX-Index, UPCOM) with value, point change, pct change | (none required) |
| `get_market_context` | Market breadth data: advancers/decliners/unchanged/ceiling-hits (tăng trần)/floor-hits (giảm sàn) when available | (none required) |
| `get_market_foreign_flow` | Market-wide foreign flow aggregate: net buy/sell value (tỷ đồng), top-N buyers/sellers across watchlist | `days` (1–30, optional, default 1), `top_n` (1–20, optional, default 5) |
| `get_ticker_intelligence` | Single-ticker intelligence brief: price, evidence score, insider activity, foreign flow, BCTC outlook, prediction calibration | **REQUIRED:** `code` (stock ticker, e.g. 'VCB', 'FPT'). Call per watchlist ticker (iterate) |

**Usage pattern:**
```
snapshot       = call_tool(server="vn-market", tool="get_market_snapshot",        arguments={})
market_context = call_tool(server="vn-market", tool="get_market_context",         arguments={})
foreign_flow   = call_tool(server="vn-market", tool="get_market_foreign_flow",    arguments={})

# Ticker intelligence: iterate watchlist, call per ticker
watchlist = [query from system-map.json or stock-classification.json]
ticker_intel = {}
for ticker in watchlist:
  ticker_intel[ticker] = call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={"code": ticker})
```
All tools are **read-only**. Do NOT call any write tool in this block.

**Note (2026-06-14 FIX-FB-POSTER-NOARG-MARKET-TOOLS):** `get_foreign_flow()` required `code` and is per-ticker; replaced with `get_market_foreign_flow()` for market-wide aggregate (no code needed). `get_ticker_intelligence()` always requires `code`; iterate watchlist and call per ticker. Previous doc claimed no params required — corrected to match live schemas.

### NOT in scope
| Tool | Why excluded |
|------|-------------|
| Facebook Graph API | Not implemented in MCP fleet — Phase 2 only |
| `post_agent_signal` | This agent does not emit signals to the bus |
| Any trade/order/write tool | This agent is read-only for market data |

---

## `log_agent_work` — Two-Call Recipe

```
// Call 1 — cycle START
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster",
  "status": "running"
})
const logId = startResult.id

// ... do cycle work ...

// Call 2 — cycle END
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster",
  "id": logId,
  "status": "completed",
  "summary": "FB post written for YYYY-MM-DD",
  "findings": "Sources read: ...",
  "actions": ["wrote docs/social/fb-post-YYYY-MM-DD.md"]
})
```

---

## Related Documentation

- **Flow:** `docs/agents/fb-market-poster/flow/main.md`
- **Notebook:** `docs/agent-memory/notebooks/fb-market-poster.md`
- **Deliverable pattern:** `docs/social/fb-post-YYYY-MM-DD.md`
- **Feedback sink:** `docs/social/fb-feedback.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
