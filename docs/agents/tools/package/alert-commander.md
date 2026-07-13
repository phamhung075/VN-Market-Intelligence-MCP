# Tool Package — Alert Commander

**Location:** `docs/agents/tools/package/alert-commander.md`
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

## Tools — Alert Commander

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "alert-commander"` |
| `get_system_status` | Database, source health, data freshness, recent errors | — |
| `get_agent_signals` | Recent inter-agent signals (last 24h) | `agent: string` (req in inbox mode), `signal_type?: string, stock_code?: string` |

### Alert Management
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_alerts` | Fetch alerts | `type?: "system" \| "price" \| "all"` (verified live 2026-07-03 — enum previously documented as `price\|volume\|sector\|risk` does not match the deployed Zod schema) |
| `send_alert_digest` | Batch send alerts via Telegram | `alerts: Alert[], channel: "market" \| "work"` |
| `mark_alert_read` | Mark alert as reviewed | `alert_id: string` |
| `mark_alert_outcome` | Mark alert outcome after firing/suppression | `alert_id: string, outcome: "fired" \| "suppressed"` |
| `write_alert_verdict` | Record pending verdict in alert-verdicts.json after firing MARKET alert. Called after `send_telegram(channel="market")` + `mark_alert_read`. | `ticker, direction, conviction, alertSource, firedAt` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_market_context` | Market snapshot, trading window, VN-Index status | — |
| `get_market_snapshot` | Price, volume, sector sentiment, trading halt status | — |
| `get_watchlist` | Current watchlist tickers and metadata | — |

### Market Indicators (P0 Suite)
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_volatility_indicators` | Volatility metrics: rv_10/20/60d, GK vol, regime band, 252d drawdown (P0 indicator) | — |
| `get_vn_liquidity_state` | OMO curve + liquidity-stress field for market liquidity (P0 indicator) | — |
| `get_foreign_room` | Foreign-room suite: outflow z, room exhaustion (P0 indicator) | — |

### Signal Processing
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_legal_risk_signals` | Legal/prosecution/tax penalty risks | — |
| `get_crisis_early_warning` | Crisis velocity, mention spikes, severity trends | — |
| `get_kinhdich_reading` | Hexagram reading for specific stock | `code: string` (NOT `ticker`) |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `signal_type: string, payload: object, confidence: number` |
| `record_signal_outcome` | Record firing/suppression/confirmation result | `signal_id: string, outcome: "fired" \| "suppressed" \| "confirmed" \| "false_positive"` |

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
  "agent_name": "alert-commander",
  "status": "running"
})
// startResult → { "id": <number> }
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (at bottom of cycle, after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "alert-commander",
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

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | Alert digests, signal confirmations |
| **work** | ✅ | Cycle completion, outcomes recorded |
| **bug** | ✅ | Errors only |

---

Per-tool params + worked example → `docs/agents/tools/list/<tool_name>.md` (lazy-load only when calling an unfamiliar tool)

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
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Signal Types:** `docs/standards/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
