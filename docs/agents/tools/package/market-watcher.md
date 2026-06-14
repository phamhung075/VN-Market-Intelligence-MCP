# Tool Package — Market Watcher

**Location:** `docs/agents/tools/package/market-watcher.md`
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

## Tools — Market Watcher

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "market-watcher"` |

### Price & Technical Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_price_history` | OHLCV and price trends for a single ticker | `code: string, days: number` |
| `get_patterns` | Detected chart patterns (head-and-shoulders, flags, etc.) | `stockCode: string` (req), `eventKeyword: string` (req) |
| `get_technical_indicators` | RSI, MACD, Bollinger Bands, ADX, etc. | `code: string` |
| `get_ticker_intelligence` | Price momentum, volatility, correlation, support/resistance | `code: string` |

### Market Rotation & Flows
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_sector_rotation` | Relative performance across 16 sectors | — |
| `get_sector_comparison` | Compare a watchlist stock vs sector peers (PE/PB/ROE/price/FII) | `code: string` (required — watchlist ticker, e.g. "VCB") |
| `get_market_snapshot` | VN-Index, foreign flow, trading halts, sector leaders | — |

### Macro & Risk Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_supply_chain_exposure` | Supply chain risk scores and concentration | — |
| `get_climate_risk_signals` | Climate-related risks by sector and ticker | — |
| `get_energy_grid_signals` | Power supply/demand, stability, import dependence | — |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_watchlist` | Current watchlist tickers and metadata | — |
| `get_insider_signals` | Insider trading activity and positions | — |
| `get_open_chain_findings` | Findings from impact chain analysis (validate news impact) | — |
| `get_kinhdich_reading` | Hexagram reading for specific stock | `code: string` (NOT `ticker`) |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `from_agent: string, to_agent: string, signal_type: string, payload: object` |

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
  "agent_name": "market-watcher",
  "status": "running"
})
// startResult → { "id": <number> }
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (at bottom of cycle, after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "market-watcher",
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
| `price_anomaly` | Alert Commander | >2sigma move | 0.85+ |
| `price_confirmation` | All Agents | Price confirms catalyst | 0.80+ |

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | EOD summary only (16:00 UTC batch4). NEVER for cycle alerts, anomaly observations, or tech errors. |
| **work** | ✅ | Cycle completion status only |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap
const bootstrap = await call_tool(
  server: "vn-market", tool: "get_cycle_bootstrap",
  arguments: { agent_name: "market-watcher" }
);

if (bootstrap.market_context?.trading_window === "closed") {
  // Skip analysis during closed hours
  return;
}
```

### Getting Price History

```typescript
// Fetch price data for watchlist
const priceData = await call_tool(
  server: "vn-market", tool: "get_price_history",
  arguments: {
    tickers: ["VCB", "ACB", "FPT"],
    days: 60
  }
);

// priceData contains:
// - [ticker]: { ohlcv[], trend, ma20, ma50, volatility }
```

### Detecting Technical Patterns

```typescript
// Identify chart patterns
const patterns = await call_tool(
  server: "vn-market", tool: "get_patterns",
  arguments: { stockCode: "VCB", eventKeyword: "breakout" }
);

// patterns contains:
// - detected: [ { type: "head_and_shoulders", confidence: 0.78, ... } ]
// - support_level, resistance_level
// - expected_breakout_days: number
```

### Analyzing Technical Indicators

```typescript
// Get full technical picture
const indicators = await call_tool(
  server: "vn-market", tool: "get_technical_indicators",
  arguments: { ticker: "FPT" }
);

// indicators contains:
// - rsi, macd, bollinger_bands, adx, stochastic
// - momentum_score, overbought/oversold status
// - signal_strength: "strong" | "moderate" | "weak"
```

### Monitoring Sector Rotation

```typescript
// Track relative sector performance
const rotation = await call_tool(
  server: "vn-market", tool: "get_sector_rotation",
  arguments: {}
);

// rotation contains:
// - leaders: [ "banking", "steel", ... ]
// - laggards: [ "retail", "energy", ... ]
// - momentum_by_sector: Map<sector, momentum_score>
// - 1d, 7d, 30d performance comparison
```

### Detecting Price Anomalies

```typescript
// Check for unusual moves
const intelligence = await call_tool(
  server: "vn-market", tool: "get_ticker_intelligence",
  arguments: { ticker: "VCB" }
);

if (intelligence.today_move_zscore > 2.0) {
  await call_tool({
    server: "vn-market", tool: "post_agent_signal",
    arguments: {
      from_agent: "market-watcher",
      to_agent: "alert-commander",
      signal_type: "price_anomaly",
      stock_code: "VCB",
      payload: { title: "VCB anomaly >2σ", detail: "...", impact_score: 7 },
      ttl_minutes: 120,
      chain_depth: 0,
      finding_data: {
        move_pct: intelligence.today_move_pct,
        move_sigma: intelligence.today_move_zscore,
        ref_price: 90000,
        window_days: 30
      }
    }
  });
}
```

### Analyzing Risk Exposure

```typescript
// Check macro risks
const supplyChainRisk = await call_tool(
  server: "vn-market", tool: "get_supply_chain_exposure",
  arguments: {}
);

const climateRisk = await call_tool(
  server: "vn-market", tool: "get_climate_risk_signals",
  arguments: {}
);

const energyRisk = await call_tool(
  server: "vn-market", tool: "get_energy_grid_signals",
  arguments: {}
);

// Synthesize risks for macro outlook
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
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Signal Types:** `docs/standards/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
