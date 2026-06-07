# Tool Package — BCTC Analyst

**Location:** `docs/agents/tools/package/bctc-analyst.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-29
**Supersedes:** `financial-analyst.md` + `report-analyzer.md` (merged per 2026-05-29 architect brief)

## How to Invoke Tools

All VN Market MCP tools are accessed via the MCP gateway `call_tool` (server="vn-market").

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

## Tools — BCTC Analyst

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "bctc-analyst"` |

### Financial Reports (BCTC)
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `ticker: string, period?: "Q1"\|"Q2"\|"Q3"\|"Q4"` |
| `get_cash_flow` | Full 4-line CF statement + OCF/NI forensic ratio | `ticker: string, period?: "Q1"–"Q4", year?: number` |
| `get_bctc_ocf` | Focused OCF forensic-gate: operating/investing/financing | `code: string, period_year: number, period_quarter: number` |
| `list_stored_pdfs` | List available BCTC PDFs for all tickers | — |
| `list_flagged_bctc_cells` | List BCTC cells flagged for human review | `ticker: string, limit?: number` |
| `submit_bctc_correction` | Submit human correction for BCTC cell | `ticker: string, cell_id: string, corrected_value: any` |
| `get_earnings_calendar` | Filing deadlines and status for all watchlist stocks | — |

### Report Comparison & Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `compare_stocks` | Side-by-side comparison of multiple stocks | `tickers: string[], metrics?: string[]` |
| `compare_financials` | Detailed financial comparison (peers, sectors, historical) | `ticker: string, comparison_type: "peers"\|"sector"\|"historical"` |
| `get_sector_comparison` | Detailed metrics and rankings by sector | `ticker?: string, metric?: string` |
| `search_similar_context` | Find historical BCTC patterns with similar characteristics | `query: string, context: object, limit?: number` |

### Cash Flow Intelligence (Forensic Gate)

`get_cash_flow` — focused forensic tool for OCF vs NI accrual check.

**Output shape (found):**
```json
{
  "source_tier": 1,
  "found": true,
  "code": "VCB",
  "period": "Q1/2025",
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

**Usage:** Call `get_cash_flow` AFTER `get_bctc_full` in the FA G-step — not instead of it.

---

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_watchlist` | Current watchlist tickers and metadata | — |
| `get_kinhdich_reading` | Hexagram reading for specific stock | `ticker: string` |
| `get_insider_signals` | Insider trading activity and positions | `code: string` (req), `outstandingShares: number` (req), `windowDays?: number` |
| `get_legal_risk_signals` | Legal/prosecution/tax penalty risks | — |
| `get_open_chain_findings` | Findings from impact chain analysis (cross-validation) | — |
| `get_macro_snapshot` | Macro regime snapshot for REGIME detection | `source?: string, regimeType?: string` |

### Macro Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_fed_liquidity_spread` | Compute EFFR-IORB spread (carry cost proxy) | — |
| `get_ism_subcomponents` | ISM Manufacturing PMI sub-components + regime signal | — |
| `get_investment_clock_phase` | Investment clock cycle phase + pyramid tier match | `ticker?: string` |
| `get_bond_maturity_calendar` | Bond maturity schedule for credit/maturity risk context | `ticker?: string, sector?: string` |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `signal_type: string, payload: object, confidence: number` |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle lifecycle — two-call pattern required (see below) | Call 1: `agent_name, status: "running"` → `{ id }`. Call 2: `agent_name, id, status: "completed"\|"error"` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "work"\|"bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: string, title: string` |

#### `log_agent_work` — Two-Call Recipe

```
// Call 1 — session START (at top of cycle, before any work)
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "bctc-analyst",
  "status": "running"
})
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "bctc-analyst",
  "id": logId,
  "status": "completed",  // or "error"
  "summary": "one-line description",
  "findings": "signals found, E1 trick passes run, etc.",
  "actions": ["list of actions taken"]
})
```

---

### Task-Lock Coordination
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim a coordination lock before exclusive work | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew a held lock every 5 min | `task_id` |
| `task_release` | Release lock on completion | `task_id` |

Full protocol: `docs/protocols/task-lock-protocol.md` | Skill: `.claude/skills/task-lock/SKILL.md`

---

## Signal Types Emitted

| Signal | To | When | Confidence |
|--------|----|----|-----------|
| `cross_validate` | Alert Commander | CRITICAL BCTC finding | 0.90+ |
| `fundamental_validation` | Alert Commander | BCTC confirms/contradicts catalyst | 0.75+ |
| `bctc_signal` | Signal bus (docs/signals/) | Every analysis cycle | varies |

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | No | Alert Commander only |
| **work** | Yes | Cycle status only |
| **bug** | Yes | Errors only |

---

## Related Documentation

- **All Tools Index:** `docs/agents/tools/list/README.md`
- **Financial Reports:** `docs/agents/tools/list/financial-reports.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **BCTC Extraction:** `docs/protocols/bctc-extraction-runbook.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
- **E1 Pass Schema:** `docs/agents/bctc-analyst/init.md § trick_pass_schema`
- **E3 Cache Spec:** `docs/agents/bctc-analyst/init.md § idempotency_cache`
