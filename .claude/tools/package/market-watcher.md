# Tool Package — Market Watcher

**Location:** `.claude/tools/package/market-watcher.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-05

## How to Invoke Tools

All VN Market MCP tools are accessed via the `mcp__claude_ai_gateway__call_tool` gateway:

```
mcp__claude_ai_gateway__call_tool(tool_name="<tool_name>", input={...})
```

For detailed parameters and return signatures: `.claude/tools/list/<tool_name>.md`

---

## Tools — Market Watcher

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "market-watcher"` |

### Price & Technical Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_price_history` | OHLCV and price trends for single or multiple tickers | `tickers: string[], days?: number` |
| `get_patterns` | Detected chart patterns (head-and-shoulders, flags, etc.) | `ticker: string` |
| `get_technical_indicators` | RSI, MACD, Bollinger Bands, ADX, etc. | `ticker: string` |
| `get_ticker_intelligence` | Price momentum, volatility, correlation, support/resistance | `ticker: string` |

### Market Rotation & Flows
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_sector_rotation` | Relative performance across 16 sectors | — |
| `get_sector_comparison` | Detailed metrics and rankings by sector | `metric?: string` |
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
| `get_kinhdich_reading` | Hexagram reading for specific stock | `ticker: string` |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `signal_type: string, payload: object, confidence: number` |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle activity and market observations | `action: string, context: object, signal_ids?: string[]` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

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
| **market** | ✅ | Market observations, technical signals |
| **work** | ✅ | Cycle completion |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap
const bootstrap = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_cycle_bootstrap",
  input={ agent_name: "market-watcher" }
);

if (bootstrap.market_context?.trading_window === "closed") {
  // Skip analysis during closed hours
  return;
}
```

### Getting Price History

```typescript
// Fetch price data for watchlist
const priceData = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_price_history",
  input={
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
const patterns = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_patterns",
  input={ ticker: "VCB" }
);

// patterns contains:
// - detected: [ { type: "head_and_shoulders", confidence: 0.78, ... } ]
// - support_level, resistance_level
// - expected_breakout_days: number
```

### Analyzing Technical Indicators

```typescript
// Get full technical picture
const indicators = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_technical_indicators",
  input={ ticker: "FPT" }
);

// indicators contains:
// - rsi, macd, bollinger_bands, adx, stochastic
// - momentum_score, overbought/oversold status
// - signal_strength: "strong" | "moderate" | "weak"
```

### Monitoring Sector Rotation

```typescript
// Track relative sector performance
const rotation = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_sector_rotation",
  input={}
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
const intelligence = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_ticker_intelligence",
  input={ ticker: "VCB" }
);

if (intelligence.today_move_zscore > 2.0) {
  // Significant price move detected
  await mcp__claude_ai_gateway__call_tool(
    tool_name="post_agent_signal",
    input={
      signal_type: "price_anomaly",
      payload: {
        ticker: "VCB",
        move_zscore: intelligence.today_move_zscore,
        magnitude: intelligence.today_move_pct,
        volume_confirmation: intelligence.volume_zscore,
        volatility_context: intelligence.current_iv
      },
      confidence: 0.88
    }
  );
}
```

### Analyzing Risk Exposure

```typescript
// Check macro risks
const supplyChainRisk = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_supply_chain_exposure",
  input={}
);

const climateRisk = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_climate_risk_signals",
  input={}
);

const energyRisk = await mcp__claude_ai_gateway__call_tool(
  tool_name="get_energy_grid_signals",
  input={}
);

// Synthesize risks for macro outlook
```

---

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **MCP Logic:** `.claude/knowledge/mcp-tools.md`
- **Signal Types:** `.claude/knowledge/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `.claude/knowledge/fail-loud-protocol.md`
