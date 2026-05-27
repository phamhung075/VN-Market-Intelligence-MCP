# Tool Package — Report Analyzer

**Location:** `docs/agents/tools/package/report-analyzer.md`
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

## Tools — Report Analyzer

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "report-analyzer"` |

### Financial Reports & Earnings
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_earnings_calendar` | Filing deadlines and status for all watchlist stocks | — |
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `ticker: string, period?: string` |
| `list_stored_pdfs` | List available BCTC PDFs for all tickers | — |

### Report Comparison & Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `compare_stocks` | Side-by-side comparison of multiple stocks | `tickers: string[], metrics?: string[]` |
| `compare_financials` | Detailed financial comparison (peers, sectors, historical) | `ticker: string, comparison_type: "peers" \| "sector" \| "historical"` |
| `get_sector_comparison` | Detailed metrics and rankings by sector | `metric?: string` |

### Watchlist & Market Context
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_watchlist` | Current watchlist tickers and metadata | — |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `signal_type: string, payload: object, confidence: number` |

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
  "agent_name": "report-analyzer",
  "status": "running"
})
// startResult → { "id": <number> }
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (at bottom of cycle, after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "report-analyzer",
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

| Signal | To | When | Confidence |
|--------|----|----|-----------|
| `fundamental_validation` | Alert Commander | BCTC confirms/contradicts catalyst | 0.75+ |

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | Report findings, comparative analysis |
| **work** | ✅ | Cycle completion |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap
const bootstrap = await call_tool(
  server: "vn-market", tool: "get_cycle_bootstrap",
  arguments: { agent_name: "report-analyzer" }
);

if (bootstrap.system_status?.bctc_vps_status !== "operational") {
  // BCTC data unavailable, skip detailed analysis
  return;
}
```

### Getting Earnings Calendar

```typescript
// Fetch all filing deadlines
const calendar = await call_tool(
  server: "vn-market", tool: "get_earnings_calendar",
  arguments: {}
);

// calendar contains all watchlist stocks with:
// - ticker, company_name
// - filing_deadline (next expected)
// - status: "ĐÃ NỘP" (submitted), "QUÁ HẠN" (late), "SẮP ĐẾN" (upcoming)
// - days_to_deadline
// - last_filing_date

// Filter for upcoming or overdue
const urgent = calendar.tickers.filter(t =>
  t.status === "SẮP ĐẾN" && t.days_to_deadline <= 10
);
```

### Full BCTC Analysis

```typescript
// Get comprehensive financial snapshot
const bctc = await call_tool(
  server: "vn-market", tool: "get_bctc_full",
  arguments: {
    ticker: "VCB",
    period: "Q1"
  }
);

// bctc contains three sections:
// 1. snapshot: { revenue, gross_profit, ebit, net_profit, assets, equity, eps, ... }
// 2. comparison: { QoQ_growth%, YoY_growth%, vs_sector_avg, peer_ranking, ... }
// 3. sentiment_trend: { 30d_slope, confidence_level, positive_articles%, ... }
// 4. filing_info: { date_submitted, next_deadline, status, ... }
```

### Side-by-Side Stock Comparison

```typescript
// Compare multiple competitors
const comparison = await call_tool(
  server: "vn-market", tool: "compare_stocks",
  arguments: {
    tickers: ["VCB", "ACB", "CTG"],
    metrics: ["ROE", "Net Profit Margin", "P/E Ratio"]
  }
);

// comparison contains:
// - metrics_by_stock: { VCB: {ROE: 0.15}, ACB: {ROE: 0.12}, ... }
// - rankings: { ROE: ["VCB", "CTG", "ACB"], ... }
// - trend_direction: { VCB: improving, ACB: declining, ... }
```

### Detailed Financial Comparison

```typescript
// Deep dive into financial position
const detailed = await call_tool(
  server: "vn-market", tool: "compare_financials",
  arguments: {
    ticker: "VCB",
    comparison_type: "peers"
  }
);

// detailed contains:
// - full_financials: all metrics for VCB
// - peer_averages: across banking sector
// - outperformance: metrics where VCB leads
// - underperformance: metrics where VCB trails
// - trends: 3-year historical trends
// - forecast: analyst consensus vs historical
```

### Sector Analysis

```typescript
// Understand sector dynamics
const sector = await call_tool(
  server: "vn-market", tool: "get_sector_comparison",
  arguments: {
    metric: "ROE"
  }
);

// sector contains:
// - sector_rankings: [sector_name: { average_roe, min, max, companies }]
// - leaders: top 3 sectors
// - laggards: bottom 3 sectors
// - historical_trend: 12-month evolution
```

### Comprehensive Report Cycle

```typescript
// Full analysis workflow
const watchlist = await call_tool(
  server: "vn-market", tool: "get_watchlist",
  arguments: {}
);

const results = [];

for (const ticker of watchlist.tickers) {
  const bctc = await call_tool(
    server: "vn-market", tool: "get_bctc_full",
    arguments: { ticker: ticker.code }
  );

  const peers = await call_tool(
    server: "vn-market", tool: "compare_financials",
    arguments: {
      ticker: ticker.code,
      comparison_type: "peers"
    }
  );

  // Synthesize findings
  const finding = {
    ticker: ticker.code,
    latest_quarter: bctc.snapshot,
    growth_vs_peers: peers.outperformance.length > peers.underperformance.length ? "strong" : "weak",
    sentiment_trend: bctc.sentiment_trend.slope > 0 ? "improving" : "deteriorating"
  };

  results.push(finding);
}

// Log summary — Call 2 of two-call pattern (Call 1 was at cycle start)
await call_tool(
  server: "vn-market", tool: "log_agent_work",
  arguments: {
    agent_name: "report-analyzer",
    id: logId,
    status: "completed",
    summary: "comprehensive_report_analysis",
    actions: {
      tickers_analyzed: results.length,
      strong_performers: results.filter(r => r.growth_vs_peers === "strong").length,
      improving_sentiment: results.filter(r => r.sentiment_trend === "improving").length
    }
  }
);
```

### Posting Analysis Signal

```typescript
// When report analysis reveals important finding
if (someSignificantFinding) {
  await call_tool(
    server: "vn-market", tool: "post_agent_signal",
    arguments: {
      signal_type: "fundamental_validation",
      payload: {
        ticker: "FPT",
        finding: "Q1 profit margin expansion despite competitive pressure",
        vs_peers: "outperforming sector by 150bps",
        confidence_factors: [
          "3-quarter improving trend",
          "Revenue growth + margin expansion",
          "Above-sector peer comparison"
        ]
      },
      confidence: 0.84
    }
  );
}
```

---

## Task-Lock Coordination Tools (Phase 2 Ready)

Tool ready — flow-level claim/heartbeat wiring lands in Phase 2/3 (not yet active in cycle.md).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim a coordination lock before exclusive work | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew a held lock every 5 min (prove-alive) | `task_id` |
| `task_release` | Release lock on completion | `task_id` |
| `task_list_held` | List held locks for debug/audit | `kind?, owner_agent?, expired?` |

Full protocol: `docs/protocols/task-lock-protocol.md` | Skill: `.claude/skills/task-lock/SKILL.md`

---

## Related Documentation

- **All Tools Index:** `docs/agents/tools/list/README.md`
- **Financial Reports:** `docs/agents/tools/list/financial-reports.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
