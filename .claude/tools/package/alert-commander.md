# Tool Package — Alert Commander

**Location:** `.claude/tools/package/alert-commander.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-05

## How to Invoke Tools

All VN Market MCP tools are accessed via the `mcp__claude_ai_gateway__call_tool` gateway:

```
mcp__claude_ai_gateway__call_tool(tool_name="<tool_name>", input={...})
```

For detailed parameters and return signatures: `.claude/tools/list/<tool_name>.md`

---

## Tools — Alert Commander

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "alert-commander"` |
| `get_system_status` | Database, source health, data freshness, recent errors | — |
| `get_agent_signals` | Recent inter-agent signals (last 24h) | — |

### Alert Management
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_alerts` | Fetch price/volume/sector/risk alerts | `type?: "price" \| "volume" \| "sector" \| "risk"` |
| `send_alert_digest` | Batch send alerts via Telegram | `alerts: Alert[], channel: "market" \| "work"` |
| `mark_alert_read` | Mark alert as reviewed | `alert_id: string` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_market_context` | Market snapshot, trading window, VN-Index status | — |
| `get_market_snapshot` | Price, volume, sector sentiment, trading halt status | — |
| `get_watchlist` | Current watchlist tickers and metadata | — |

### Signal Processing
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_legal_risk_signals` | Legal/prosecution/tax penalty risks | — |
| `get_crisis_early_warning` | Crisis velocity, mention spikes, severity trends | — |
| `get_kinhdich_reading` | Hexagram reading for specific stock | `ticker: string` |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `signal_type: string, payload: object, confidence: number` |
| `record_signal_outcome` | Record firing/suppression/confirmation result | `signal_id: string, outcome: "fired" \| "suppressed" \| "confirmed" \| "false_positive"` |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle activity and decisions | `action: string, context: object, signal_ids?: string[]` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | Alert digests, signal confirmations |
| **work** | ✅ | Cycle completion, outcomes recorded |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap in parallel
const bootstrap = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_cycle_bootstrap",
  input={ agent_name: "alert-commander" }
);

if (bootstrap.agent_signals) {
  // Process recent signals from other agents
}
if (bootstrap.market_context?.trading_window === "closed") {
  // Skip alerts if market closed
  return;
}
```

### Processing an Alert Chain

```typescript
// Get high-risk alerts
const alerts = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_alerts",
  input={ type: "risk" }
);

// Validate against live market
for (const alert of alerts) {
  // Check if price still valid
}

// Send batch digest
await mcp__claude_ai_gateway__call_tool(
  tool_name="send_alert_digest",
  input={
    alerts: filteredAlerts,
    channel: "market"
  }
);

// Record outcomes
await mcp__claude_ai_gateway__call_tool(
  tool_name="record_signal_outcome",
  input={
    signal_id: alert.signal_id,
    outcome: "fired"
  }
);
```

### Posting a Verified Chain

```typescript
// Alert Commander receives "cross_validate" from Financial Analyst
await mcp__claude_ai_gateway__call_tool(
  tool_name="post_agent_signal",
  input={
    signal_type: "verified_chain",
    payload: {
      ticker: "VCB",
      original_signal: "price_anomaly",
      validator: "financial-analyst",
      bctc_evidence: "Q1 revenue +25%"
    },
    confidence: 0.92
  }
);
```

---

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **MCP Logic:** `.claude/knowledge/mcp-tools.md`
- **Signal Types:** `.claude/knowledge/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `.claude/knowledge/fail-loud-protocol.md`
