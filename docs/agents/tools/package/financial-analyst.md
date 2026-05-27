# Tool Package — Financial Analyst

**Location:** `docs/agents/tools/package/financial-analyst.md`
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

## Tools — Financial Analyst

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "financial-analyst"` |

### Financial Reports (BCTC)
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `ticker: string, period?: "Q1" \| "Q2" \| "Q3" \| "Q4"` |
| `get_cash_flow` | Full 4-line CF statement + OCF/NI forensic ratio (FA G-step) | `ticker: string, period?: "Q1"–"Q4", year?: number` |
| `get_bctc_ocf` | Focused OCF forensic-gate: operating/investing/financing + confidence + extraction_method | `code: string, period_year: number, period_quarter: number` |
| `list_stored_pdfs` | List available BCTC PDFs for all tickers | — |
| `get_earnings_calendar` | Filing deadlines and status for all watchlist stocks | — |

### Cash Flow Intelligence (FA G-step)

`get_cash_flow` — focused forensic tool for OCF vs NI accrual check.

**Params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `ticker` | string | YES | VN stock ticker, case-insensitive |
| `period` | "Q1"\|"Q2"\|"Q3"\|"Q4" | NO | Quarter filter; omit for latest |
| `year` | number | NO | Fiscal year (e.g. 2025); omit for latest |

**Output shape (found):**
```json
{
  "source_tier": 1,
  "found": true,
  "code": "VCB",
  "period": "Q1/2025",
  "period_year": 2025,
  "period_quarter": 1,
  "operating_cf": 15000,
  "investing_cf": -5000,
  "financing_cf": -2000,
  "capex": -3000,
  "free_cash_flow": 12000,
  "ocf_ni_ratio": 1.5
}
```

`ocf_ni_ratio = operating_cf / net_profit`. Returns `null` when `net_profit` is 0 or null.
All monetary values in VND millions.

**Output shape (not found):**
```json
{ "source_tier": 1, "found": false, "code": "VCB", "period": "Q4/2025" }
```

**Usage note (R3):** Call `get_cash_flow` **after** `get_bctc_full` in the FA G-step — not instead of it.
`get_bctc_full` provides sentiment trend + QoQ/YoY comparison. `get_cash_flow` adds the full CF statement
and the OCF/NI forensic ratio that `get_bctc_full` does not surface.

---

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
| `get_insider_signals` | Insider trading activity and positions | `code: string` (req), `outstandingShares: number` (req), `windowDays?: number` |
| `get_legal_risk_signals` | Legal/prosecution/tax penalty risks | — |
| `get_open_chain_findings` | Findings from impact chain analysis (cross-validation) | — |
| `get_macro_snapshot` | Macro regime snapshot for B-step REGIME detection | `source?: string, regimeType?: string` |

### Macro Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_fed_liquidity_spread` | Compute EFFR-IORB spread (carry cost proxy) | — |
| `get_ism_subcomponents` | ISM Manufacturing PMI sub-components + regime signal | — |
| `get_investment_clock_phase` | Investment clock cycle phase + pyramid tier match (FA H-step) | `ticker?: string` |

### Sector Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_bond_maturity_calendar` | Bond maturity schedule for credit/maturity risk context | `ticker?: string, sector?: string` |

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
  "agent_name": "financial-analyst",
  "status": "running"
})
// startResult → { "id": <number> }
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (at bottom of cycle, after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "financial-analyst",
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
- **Financial Reports:** `docs/agents/tools/list/financial-reports.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **BCTC Extraction:** `docs/protocols/bctc-extraction-runbook.md`
- **Low Confidence Handling:** `docs/{policies,protocols,standards,references}/low-confidence-handling.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
