# Tool Package — Market Analyst

**Location:** `docs/agents/tools/package/market-analyst.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-19

## How to Invoke Tools

All VN Market MCP tools are accessed via the MCP gateway `call_tool` (server="vn-market").
Server name: **`vn-market`** (exact, no variants). See `docs/data/system-map.json` → `project.microservices[id=mcp-server].mcp_server_name`.

```
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

**Wrong** → ~~`tool_name`~~ use `tool` | ~~`input`~~ use `arguments` | ~~`vnmarket-mcp`~~ use `"vn-market"`

For detailed parameters and return signatures: `docs/agents/tools/list/<tool_name>.md`

---

## Anti-Discovery

NEVER call `list_servers`, `search_tools`, or `list_server_tools` at runtime.
Use `docs/agents/tools/list/INDEX.md` to find tool names at design time only.
If a needed tool is not in this package → `post_agent_signal(to="po", signal_type="bug-escalation")` → EXIT cycle.

---

## Tools — Market Analyst

### Bootstrap & Lifecycle

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Session context: market hours, last cycle time, agent signals | `agent_name` (req) |
| `log_agent_work` | Log cycle start/end (two-call pattern — see recipe below) | `agent_name`, `status`, `id` (end call) |
| `post_agent_signal` | Emit signal to signal bus | `from_agent`, `to_agent`, `signal_type`, `payload` |
| `send_telegram` | Send message to WORK channel | `channel`, `message` |

#### `log_agent_work` — Two-Call Recipe

```
// Call 1 — START
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "market-analyst",
  "status": "running"
})
const logId = startResult.id

// Call 2 — END
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "market-analyst",
  "id": logId,
  "status": "completed",
  "summary": "<one-line description>"
})
```

---

### Foreign Flow Intelligence

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_market_foreign_flow` | Get market-wide foreign investor flow buy/sell | `period?: "1D" \| "1W" \| "1M"` |
| `diagnose_foreign_flow_circuit_breaker` | Diagnose foreign flow circuit breaker trip reason | `breaker_id?: string` |
| `reset_foreign_flow_circuit_breaker` | Reset foreign flow circuit breaker | `breaker_id?: string` |

### Accuracy & Calibration

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_label_accuracy_report` | Get accuracy report for signal labels | `label_type?: "alert" \| "signal"` |

### Macro & Regime Tools

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_macro_snapshot` | VN macro regime: TIGHTENING/EASING/NEUTRAL, USD/VND, oil, BDI | none required |

**Example:**
```
call_tool(
  server: "vn-market",
  tool: "get_macro_snapshot",
  arguments: {}
)
```
**Returns:** `{ regime: "TIGHTENING|EASING|NEUTRAL", carry_regime: "...", us10y_signal: "...", dxy_signal: "...", ... }`
**Failure:** If empty/error → log `[SKIP] get_macro_snapshot failed: <error>` → use NEUTRAL defaults → continue.

---

### News & Impact Chain Tools

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `fetch_and_analyze` | Fetch latest VN market news and run sentiment analysis | `tickers[]` (opt), `limit` (opt, default 20) |
| `run_impact_chain` | Run global→country→sector→stock impact chain for a news event | `event_id` (req), `tickers[]` (opt) |

**Example — fetch_and_analyze:**
```
call_tool(
  server: "vn-market",
  tool: "fetch_and_analyze",
  arguments: { "tickers": ["VCB", "HPG"], "limit": 20 }
)
```
**Returns:** Array of `{ article_id, title, sentiment, impact_score, tickers_mentioned[] }`
**Failure:** Empty array → log `[SKIP] No news items returned` → continue to next step.

**Example — run_impact_chain:**
```
call_tool(
  server: "vn-market",
  tool: "run_impact_chain",
  arguments: { "event_id": "<article_id>", "tickers": ["VCB"] }
)
```
**Returns:** `{ chain: [{ layer: "global|country|sector|stock", impact: "...", confidence: 0.0–1.0 }] }`
**Failure:** Error → log `[SKIP] run_impact_chain failed: <error>` → skip chain for this event.

---

### Alert Tools

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_alerts` | Active alerts in the last N minutes | `minutes_back` (opt, default 60), `severity` (opt) |

**Example:**
```
call_tool(
  server: "vn-market",
  tool: "get_alerts",
  arguments: { "minutes_back": 120 }
)
```
**Returns:** Array of `{ alert_id, ticker, severity, message, fired_at }`
**Failure:** Error → log `[SKIP] get_alerts failed: <error>` → continue without alert context.

---

### Financial & BCTC Tools

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_bctc_full` | Full quarterly financials for a ticker (income, balance sheet, cash flow) | `code` (req), `quarters` (opt, default 4) |
| `get_financial_summary` | Concise financial KPIs: EPS, P/E, ROE, debt ratio | `actionCode: string` (req, NOT `code` or `ticker`) |
| `get_sector_comparison` | Stock vs sector metrics (relative performance, sector average P/E) | `code` (req) |

**Example — get_bctc_full:**
```
call_tool(
  server: "vn-market",
  tool: "get_bctc_full",
  arguments: { "code": "VCB", "quarters": 4 }
)
```
**Returns:** `{ ticker: "VCB", quarters: [{ period, revenue, net_profit, ... }] }`
**Failure:** Empty → log `[SKIP] No BCTC data for <code>` → note in analysis output.

**Example — get_financial_summary:**
```
call_tool(
  server: "vn-market",
  tool: "get_financial_summary",
  arguments: { "actionCode": "HPG" }
)
```
**Returns:** `{ ticker, eps, pe, roe, debt_ratio, ... }`
**Failure:** Error or null → log `[SKIP] get_financial_summary failed for <code>` → skip KPI section.

**Example — get_sector_comparison:**
```
call_tool(
  server: "vn-market",
  tool: "get_sector_comparison",
  arguments: { "code": "VCB" }
)
```
**Returns:** `{ ticker, sector, stock_pe, sector_avg_pe, relative_perf_pct, ... }`
**Failure:** Error → log `[SKIP] get_sector_comparison failed for <code>` → skip sector context.

---

### Backtest Tools

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `export_backtest_run_csv` | Export backtest run results to CSV | `run_id` (req), `output_format` (opt, default "csv") |
| `compare_backtest_runs` | Compare metrics across multiple backtest runs | `run_ids[]` (req, min 2) |

**Example — export_backtest_run_csv:**
```
call_tool(
  server: "vn-market",
  tool: "export_backtest_run_csv",
  arguments: { "run_id": "run-20260519-001", "output_format": "csv" }
)
```

**Example — compare_backtest_runs:**
```
call_tool(
  server: "vn-market",
  tool: "compare_backtest_runs",
  arguments: { "run_ids": ["run-20260519-001", "run-20260518-999"] }
)
```

---

## File System Tools

| Tool | Purpose |
|------|---------|
| `Read` | Read flow files, backtest results, knowledge files |
| `Glob` | Find test runs, CSV exports, historical data files |
| `Grep` | Search analysis logs and result summaries |

---

## Knowledge Loaded at Start

- `docs/{policies,protocols,standards,references}/stock-classification.md` — sector mapping, liquidity tiers
- `docs/policies/alert-policy.md` — alert thresholds and severity (lazy-load)
- `docs/GLOSSARY_VI.md` — Vietnamese financial terms (lazy-load on demand)

---

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| market | write | analysis_reports_only |
| work | write | cycle_status_only |
| bug | write | escalations_only |

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
