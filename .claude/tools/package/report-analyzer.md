# Tool Package — Report Analyzer

**Location:** `.claude/tools/package/report-analyzer.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-05

## How to Invoke Tools

All VN Market MCP tools are accessed via the `mcp__claude_ai_gateway__call_tool` gateway:

```
mcp__claude_ai_gateway__call_tool(tool_name="<tool_name>", input={...})
```

For detailed parameters and return signatures: `.claude/tools/list/<tool_name>.md`

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
| `log_agent_work` | Log cycle activity and analysis results | `action: string, context: object, signal_ids?: string[]` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

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
const bootstrap = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_cycle_bootstrap",
  input={ agent_name: "report-analyzer" }
);

if (bootstrap.system_status?.bctc_vps_status !== "operational") {
  // BCTC data unavailable, skip detailed analysis
  return;
}
```

### Getting Earnings Calendar

```typescript
// Fetch all filing deadlines
const calendar = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_earnings_calendar",
  input={}
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
const bctc = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_bctc_full",
  input={
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
const comparison = await mcp__claude_ai_gateway__call_tool(
  tool_name="compare_stocks",
  input={
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
const detailed = await mcp__claude_ai_gateway__call_tool(
  tool_name="compare_financials",
  input={
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
const sector = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_sector_comparison",
  input={
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
const watchlist = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_watchlist",
  input={}
);

const results = [];

for (const ticker of watchlist.tickers) {
  const bctc = await mcp__claude_ai_gateway__call_tool(
    tool_name="get_bctc_full",
    input={ ticker: ticker.code }
  );

  const peers = await mcp__claude_ai_gateway__call_tool(
    tool_name="compare_financials",
    input={
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

// Log summary
await mcp__claude_ai_gateway__call_tool(
  tool_name="log_agent_work",
  input={
    action: "comprehensive_report_analysis",
    context: {
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
  await mcp__claude_ai_gateway__call_tool(
    tool_name="post_agent_signal",
    input={
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

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **Financial Reports:** `.claude/tools/list/financial-reports.md`
- **MCP Logic:** `.claude/knowledge/mcp-tools.md`
- **Fail-Loud Protocol:** `.claude/knowledge/fail-loud-protocol.md`
