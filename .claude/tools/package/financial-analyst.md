# Tool Package — Financial Analyst

**Location:** `.claude/tools/package/financial-analyst.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-05

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

For detailed parameters and return signatures: `.claude/tools/list/<tool_name>.md`

---

## Tools — Financial Analyst

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "financial-analyst"` |

### Financial Reports (BCTC)
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `ticker: string, period?: "Q1" \| "Q2" \| "Q3" \| "Q4"` |
| `list_stored_pdfs` | List available BCTC PDFs for all tickers | — |
| `get_earnings_calendar` | Filing deadlines and status for all watchlist stocks | — |

### Financial Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_sector_comparison` | Compare financial metrics across sector peers | `ticker: string, metric?: string` |
| `search_similar_context` | Find historical BCTC patterns with similar characteristics | `query: string, context: object, limit?: number` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_watchlist` | Current watchlist tickers and metadata | — |
| `get_kinhdich_reading` | Hexagram reading for specific stock | `ticker: string` |
| `get_insider_signals` | Insider trading activity and positions | — |
| `get_legal_risk_signals` | Legal/prosecution/tax penalty risks | — |
| `get_open_chain_findings` | Findings from impact chain analysis (cross-validation) | — |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `signal_type: string, payload: object, confidence: number` |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle activity and findings | `action: string, context: object, signal_ids?: string[]` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

---

## Signal Types Emitted

| Signal | To | When | Confidence |
|--------|----|----|-----------|
| `cross_validate` | Alert Commander | CRITICAL BCTC finding | 0.90+ |
| `fundamental_validation` | Alert Commander | BCTC confirms/contradicts catalyst | 0.75+ |

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | Financial analysis findings |
| **work** | ✅ | Cycle completion |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap
const bootstrap = await call_tool(
  server: "vn-market", tool: "get_cycle_bootstrap",
  arguments: { agent_name: "financial-analyst" }
);

// Check if BCTC pipeline is healthy
if (bootstrap.system_status?.bctc_vps_status !== "operational") {
  // Log issue and skip analysis
  return;
}
```

### Getting Full BCTC Analysis

```typescript
// Comprehensive financial snapshot
const bctcData = await call_tool(
  server: "vn-market", tool: "get_bctc_full",
  arguments: {
    ticker: "VCB",
    period: "Q1"
  }
);

// bctcData contains:
// - snapshot: { revenue, profit, assets, equity, ... }
// - comparison: { QoQ_growth, YoY_growth, vs_sector_avg }
// - sentiment_trend: { 30d_slope, confidence }
// - filing_status: { submitted_date, next_deadline }
```

### Checking Filing Calendar

```typescript
// Get all upcoming deadlines
const calendar = await call_tool(
  server: "vn-market", tool: "get_earnings_calendar",
  arguments: {}
);

// calendar contains watchlist tickers with:
// - filing_deadline: Date
// - status: "ĐÃ NỘP" | "QUÁ HẠN" | "SẮP ĐẾN"
// - days_to_deadline: number
```

### Sector Comparison

```typescript
// Compare metrics with peers
const comparison = await call_tool(
  server: "vn-market", tool: "get_sector_comparison",
  arguments: {
    ticker: "VCB",
    metric: "ROE"
  }
);

// Understand competitive positioning
if (comparison.ticker_rank === 1) {
  // VCB is top in ROE for banking sector
}
```

### Posting Cross-Validation Signal

```typescript
// Alert Commander found price anomaly - validate with BCTC
const bctc = await call_tool(
  server: "vn-market", tool: "get_bctc_full",
  arguments: { ticker: "ACB" }
);

if (bctc.comparison.YoY_growth > 0.20 && bctc.sentiment_trend.slope > 0) {
  // Fundamental support for price move
  await call_tool(
    server: "vn-market", tool: "post_agent_signal",
    arguments: {
      signal_type: "fundamental_validation",
      payload: {
        ticker: "ACB",
        original_signal: "price_anomaly",
        bctc_support: {
          revenue_growth: bctc.comparison.YoY_growth,
          profit_trend: bctc.sentiment_trend.slope,
          vs_sector: bctc.comparison.vs_sector_avg
        }
      },
      confidence: 0.87
    }
  );
}
```

### Searching Similar Historical Patterns

```typescript
// Find similar BCTC transitions to validate signal
const similar = await call_tool(
  server: "vn-market", tool: "search_similar_context",
  arguments: {
    query: "sharp revenue increase with margin compression",
    context: {
      ticker: "FPT",
      sector: "technology",
      metric_change: { revenue: "+35%", margin: "-2%" }
    },
    limit: 3
  }
);

// Use historical outcomes to forecast likely price action
```

---

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **Financial Reports:** `.claude/tools/list/financial-reports.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **BCTC Extraction:** `docs/protocols/bctc-extraction-runbook.md`
- **Low Confidence Handling:** `docs/{policies,protocols,standards,references}/low-confidence-handling.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
