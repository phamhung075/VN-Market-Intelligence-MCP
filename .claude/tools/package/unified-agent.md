# Tool Package — Unified Agent

**Location:** `.claude/tools/package/unified-agent.md`
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

## Tools — Unified Agent

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "unified-agent"` |
| `get_system_status` | Database, source health, data freshness, recent errors | — |
| `get_rate_limit_status` | API rate limits across all services | — |
| `get_recent_fixes` | Recent bug fixes and system repairs | `limit?: number` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_market_context` | Market snapshot, trading window, VN-Index status | — |
| `get_market_snapshot` | Price, volume, sector sentiment, trading halt status | — |
| `read_telegram_reports` | Unread Telegram messages and reports | — |

### Financial Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_earnings_calendar` | Filing deadlines and status for all watchlist stocks | — |
| `get_kinhdich_reading` | Hexagram reading for specific stock | `ticker: string` |
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `ticker: string, period?: string` |
| `get_watchlist` | Current watchlist tickers and metadata | — |

### Prediction & Sentiment
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_prediction_markets` | Market-wide prediction accuracy by signal type | — |
| `get_sentiment_trend` | Aggregate sentiment across news and analysis | — |

### Risk & Signal Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_legal_risk_signals` | Legal/prosecution/tax penalty risks | — |
| `get_crisis_early_warning` | Crisis velocity, mention spikes, severity trends | — |
| `get_supply_chain_exposure` | Supply chain risk scores and concentration | — |
| `get_climate_risk_signals` | Climate-related risks by sector and ticker | — |
| `get_energy_grid_signals` | Power supply/demand, stability, import dependence | — |
| `get_insider_signals` | Insider trading activity and positions | — |
| `get_alert_accuracy` | Alert firing accuracy and false positive rate | — |
| `get_signal_effectiveness` | Signal accuracy across all agents | — |

### Portfolio & Position Management
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_positions` | Current portfolio positions | — |
| `get_portfolio_conviction` | Portfolio alignment with signal confidence | — |
| `get_portfolio_risk` | Portfolio VaR, concentration, correlation risks | — |
| `get_rebalancing_signals` | Recommended portfolio adjustments | — |
| `get_target_allocation` | Target asset allocation by sector/ticker | — |
| `get_user_positions_for_analysis` | Positions formatted for financial analysis | — |

### Performance & Metrics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_unreviewed_market_messages` | Unreviewed market intelligence messages | — |
| `get_cascade_metrics` | Inter-agent signal cascade success rate | — |
| `get_prediction_accuracy` | Prediction model accuracy metrics | — |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `from_agent: string, to_agent: string, signal_type: "urgent_news"|"price_anomaly"|"cross_validate"|"suppress"|"chain_catalyst"|"fundamental_validation"|"price_confirmation"|"verified_chain", payload: object {must include root field per TECH_1293}, confidence: number` |

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
| **market** | ✅ | Market synthesis, coordinated signals |
| **work** | ✅ | Cycle completion |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap
const bootstrap = await call_tool(
  server: "vn-market", tool: "get_cycle_bootstrap",
  arguments: { agent_name: "unified-agent" }
);

// Check system health
const systemStatus = await call_tool(
  server: "vn-market", tool: "get_system_status",
  arguments: {}
);

if (systemStatus.any_critical_errors) {
  // Escalate to ops before proceeding
  return;
}
```

### Synthesizing Market Intel

```typescript
// Get market overview
const market = await call_tool(
  server: "vn-market", tool: "get_market_context",
  arguments: {}
);

const sentiment = await call_tool(
  server: "vn-market", tool: "get_sentiment_trend",
  arguments: {}
);

const predictions = await call_tool(
  server: "vn-market", tool: "get_prediction_markets",
  arguments: {}
);

// Synthesize into coherent market picture
```

### Portfolio Analysis

```typescript
// Get full portfolio picture
const positions = await call_tool(
  server: "vn-market", tool: "get_positions",
  arguments: {}
);

const conviction = await call_tool(
  server: "vn-market", tool: "get_portfolio_conviction",
  arguments: {}
);

const risk = await call_tool(
  server: "vn-market", tool: "get_portfolio_risk",
  arguments: {}
);

const rebalancing = await call_tool(
  server: "vn-market", tool: "get_rebalancing_signals",
  arguments: {}
);

// Determine if rebalance needed
if (risk.var_95 > 0.15) {
  // Portfolio risk too high - consider adjustment
}
```

### Checking Signal Performance

```typescript
// Monitor cascade effectiveness
const cascadeMetrics = await call_tool(
  server: "vn-market", tool: "get_cascade_metrics",
  arguments: {}
);

const alertAccuracy = await call_tool(
  server: "vn-market", tool: "get_alert_accuracy",
  arguments: {}
);

const signalEffectiveness = await call_tool(
  server: "vn-market", tool: "get_signal_effectiveness",
  arguments: {}
);

// Identify which agents are performing well and which need review
```

### Reviewing Unread Messages

```typescript
// Check for new intelligence
const telegramReports = await call_tool(
  server: "vn-market", tool: "read_telegram_reports",
  arguments: {}
);

const unreviewed = await call_tool(
  server: "vn-market", tool: "get_unreviewed_market_messages",
  arguments: {}
);

// Process and act on critical messages
```

---

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Signal Types:** `docs/standards/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
