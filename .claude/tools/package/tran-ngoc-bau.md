# Tool Package — Tran Ngoc Bau (Strategy Quality Supervisor)

**Location:** `.claude/tools/package/tran-ngoc-bau.md`
**Load when:** Agent starts, before first MCP call
**Access level:** FULL — all vn-market tools available for quality rechecking

**Anti-discovery:** Even with full access, NEVER call `list_servers` / `search_tools` / `list_server_tools`.
Use `.claude/tools/list/INDEX.md` to find tool names at design time only.

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

**Wrong** → ~~`tool_name`~~ use `tool` | ~~`input`~~ use `arguments` | ~~`vnmarket-mcp`~~ use `"vn-market"`

For detailed parameters and return signatures: `.claude/tools/list/<tool_name>.md`

---

## Full Tool Access

This agent has access to **ALL tools** on the vn-market MCP server.
Complete index → `.claude/tools/list/INDEX.md`

### Primary Tools (Quality Audit)

| Tool | Purpose |
|------|---------|
| `read_telegram_reports` | Read MARKET/BUG messages for quality audit |
| `get_unreviewed_market_messages` | Find messages not yet quality-checked |
| `review_market_message` | Label message as signal/noise after audit |
| `send_telegram` | Send quality report to WORK, escalation to BUG |
| `get_agent_signals` | All signals in last 24h — dedup + confidence check |
| `get_signal_effectiveness` | Signal quality metrics — hit rate per type |
| `get_alert_accuracy` | Alert accuracy trends — Brier scores |
| `record_signal_outcome` | Mark signal as audited |

### Cross-Validation Tools (Recheck Data)

| Tool | Purpose |
|------|---------|
| `get_macro_snapshot` | Verify REGIME extraction accuracy |
| `get_market_snapshot` | Verify current prices match alerts |
| `get_market_context` | Market overview for context |
| `get_price_history` | Verify price anomaly sigma claims |
| `get_sector_comparison` | Verify sector move claims |
| `compare_financials` | Verify earnings beat/miss claims |
| `compare_stocks` | Side-by-side stock comparison |
| `get_sentiment_trend` | Verify sentiment claims |
| `get_watchlist` | Current watchlist for ticker validation |
| `get_positions` | Current positions for portfolio context |
| `get_portfolio_risk` | Portfolio risk assessment |
| `get_portfolio_conviction` | Conviction scores across portfolio |

### Signal & Cascade Tools

| Tool | Purpose |
|------|---------|
| `get_cascade_metrics` | Rule hit rates for cascade validation |
| `get_cascade_outcomes` | Cascade outcomes with price impact |
| `get_open_chain_findings` | Open findings for enrichment audit |
| `run_impact_chain` | Re-run impact chain to verify original |
| `fetch_and_analyze` | Re-fetch news to verify analysis accuracy |
| `search_similar_context` | RAG search for historical precedent |
| `get_kinhdich_reading` | Verify Kinh Dich signal accuracy |

### Risk & Intelligence Tools

| Tool | Purpose |
|------|---------|
| `get_legal_risk_signals` | Legal risk verification |
| `get_crisis_early_warning` | Crisis signal verification |
| `get_insider_signals` | Insider transaction verification |
| `get_climate_risk_signals` | Climate/energy risk verification |
| `get_supply_chain_exposure` | Supply chain risk verification |
| `get_energy_grid_signals` | Energy grid risk verification |
| `get_pharma_signals` | Pharma sector signals |
| `get_public_investment_signals` | Public investment signals |
| `get_credit_flow_signals` | Credit flow verification |
| `get_sector_rotation` | Sector rotation detection |
| `get_rebalancing_signals` | Portfolio rebalancing signals |

### Macro & Calibration Tools

| Tool | Purpose |
|------|---------|
| `macro_calibration` | Calibration data for Brier scores |
| `macro_carry` | Carry trade regime verification |
| `macro_dinhGia` | Valuation assessment |
| `macro_evidence` | Evidence accumulator data |
| `macro_imfSignals` | IMF signal verification |
| `macro_policy` | Policy analysis |
| `macro_prediction` | Prediction tracking |

### System Health Tools

| Tool | Purpose |
|------|---------|
| `get_system_status` | Infrastructure health check |
| `get_cron_health` | Cron job execution status |
| `get_pipeline_health` | Data pipeline health |
| `get_sla_status` | SLA compliance check |
| `get_vps_proxy_health` | VPS proxy status |
| `get_vps_service_health` | VPS service status |

### Dev & Workflow Tools

| Tool | Purpose |
|------|---------|
| `log_agent_work` | Log audit cycle lifecycle — **two-call pattern required** (see recipe below) |
| `get_agent_work_log` | Read other agents' work logs |
| `get_recent_fixes` | Check recently-fixed issues |
| `submit_feedback` | Submit bug or feature request |

#### `log_agent_work` — Two-Call Recipe

```
// Call 1 — session START (at top of cycle, before any work)
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "tran-ngoc-bau",
  "status": "running"
})
// startResult → { "id": <number> }
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (at bottom of cycle, after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "tran-ngoc-bau",
  "id": logId,
  "status": "completed",
  "summary": "one-line description of what was done",
  "findings": "optional: signals audited, verdicts recorded, etc.",
  "actions": ["optional: list of actions taken"]
})
// Returns → { "ok": true, "id": <number> }
```

**Error path:** if cycle errors, pass `status: "error"` in Call 2 instead of `"completed"`. The `id` from Call 1 is always required for Call 2.

## File System Tools

| Tool | Purpose |
|------|---------|
| `Read` | Read flow files, session logs, knowledge files |
| `Edit` | Auto-cure flow files (methodology violations) |
| `Write` | Create session logs, update notebook |
| `Glob` | Find agent session files, flow files |
| `Grep` | Search for patterns in flows and logs |

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | No | Read-only audit |
| **work** | Yes | Quality reports, improvement proposals |
| **bug** | Yes | Quality escalations only |

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

- **All Tools Index:** `.claude/tools/list/INDEX.md`
- **Full Tools List:** `.claude/tools/list/all-tools.md`
- **Signal Types:** `docs/standards/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
