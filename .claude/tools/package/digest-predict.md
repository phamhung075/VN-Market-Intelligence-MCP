# Tool Package — Digest & Predict

**Location:** `.claude/tools/package/digest-predict.md`
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

## Tools — Digest & Predict

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "digest-predict"` |
| `get_recent_fixes` | Recent bug fixes and system repairs | `limit?: number` |
| `read_telegram_reports` | Unread Telegram messages and reports | — |

### Market Summary & Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_market_summary` | Daily/weekly market summary and key metrics | — |
| `get_market_snapshot` | Price, volume, sector sentiment, trading halt status | — |
| `generate_market_summary` | Generate synthesized market report | `period?: "daily" \| "weekly"` |
| `get_performance_attribution` | Attribution of returns to factors (sector, style, etc.) | — |

### Financial Reports & Earnings
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_earnings_calendar` | Filing deadlines and status for all watchlist stocks | — |
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `ticker: string, period?: string` |
| `get_sector_comparison` | Detailed metrics and rankings by sector | `metric?: string` |

### Market Rotation & Risk
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_sector_rotation` | Relative performance across 16 sectors | — |
| `get_supply_chain_exposure` | Supply chain risk scores and concentration | — |
| `get_climate_risk_signals` | Climate-related risks by sector and ticker | — |
| `get_energy_grid_signals` | Power supply/demand, stability, import dependence | — |

### Risk & Signal Processing
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_legal_risk_signals` | Legal/prosecution/tax penalty risks | — |
| `get_crisis_early_warning` | Crisis velocity, mention spikes, severity trends | — |
| `get_open_chain_findings` | Findings from impact chain analysis | — |

### Kinh Dich (I-Ching) & Prediction
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_kinhdich_reading` | Hexagram reading for specific stock | `ticker: string` |
| `get_market_hexagram` | Market-wide hexagram (VN-Index + macro) | — |
| `run_hexagram_backtest` | Accuracy test of trading signals vs prices | `strategy: string, date_range: string` |
| `get_transition_probabilities` | Markov transitions (hex → next hex) | `ticker?: string` |
| `compare_backtest_runs` | Compare 2+ backtests side-by-side | `run_ids: string[]` |

### Prediction & Calibration
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_prediction_accuracy` | Prediction model accuracy metrics | — |
| `get_calibration_report` | Calibration analysis of prediction confidence | — |
| `create_prediction_claim` | Create timestamped prediction claim for tracking | `ticker: string, prediction: string, confidence: number` |
| `get_macro_snapshot` | Macro environment (rates, FX, credit, inflation) | — |

### Portfolio & Evidence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_portfolio_conviction` | Portfolio alignment with signal confidence | — |
| `get_portfolio_risk` | Portfolio VaR, concentration, correlation risks | — |
| `get_rebalancing_signals` | Recommended portfolio adjustments | — |
| `get_correlation_matrix` | Asset correlation analysis for diversification | — |
| `get_evidence_summary` | Aggregated evidence for current market thesis | — |

### Performance Metrics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_alert_accuracy` | Alert firing accuracy and false positive rate | — |
| `get_signal_effectiveness` | Signal accuracy across all agents | — |
| `get_cascade_metrics` | Inter-agent signal cascade success rate | — |

### Watchlist & Positions
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_watchlist` | Current watchlist tickers and metadata | — |
| `get_user_positions_for_analysis` | Positions formatted for financial analysis | — |
| `get_insider_signals` | Insider trading activity and positions | — |

### Memory & Session
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `append_session_record` | Append summary to agent session memory | `content: string` |
| `update_memory_file` | Update persistent agent memory file | `file_key: string, content: string` |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `signal_type: string, payload: object, confidence: number` |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle activity and predictions | `action: string, context: object, signal_ids?: string[]` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | Digests, predictions, market summaries |
| **work** | ✅ | Cycle completion, backtest results |
| **bug** | ✅ | Errors only |

---

## Example Invocation

### Opening Sequence (Required)

```typescript
// Step 0: Bootstrap
const bootstrap = await call_tool(
  server: "vn-market", tool: "get_cycle_bootstrap",
  arguments: { agent_name: "digest-predict" }
);

if (bootstrap.system_status?.any_critical_errors) {
  // Escalate to ops
  return;
}
```

### Generating Daily Digest

```typescript
// Get comprehensive market summary
const summary = await call_tool(
  server: "vn-market", tool: "get_market_summary",
  arguments: {}
);

const generated = await call_tool(
  server: "vn-market", tool: "generate_market_summary",
  arguments: { period: "daily" }
);

// Send to market channel
await call_tool(
  server: "vn-market", tool: "send_telegram",
  arguments: {
    message: generated.summary_text,
    channel: "market"
  }
);
```

### Running Hexagram Backtest

```typescript
// Test strategy accuracy
const backtest = await call_tool(
  server: "vn-market", tool: "run_hexagram_backtest",
  arguments: {
    strategy: "kinh-dich-high-confidence",
    date_range: "2025-01-01:2025-12-31"
  }
);

// backtest contains:
// - total_return, max_drawdown, sharpe_ratio
// - win_rate, avg_win, avg_loss
// - per_ticker_breakdown
// - equity_curve: daily values
```

### Making Prediction Claims

```typescript
// Record prediction for tracking accuracy
const market_hex = await call_tool(
  server: "vn-market", tool: "get_market_hexagram",
  arguments: {}
);

if (market_hex.hexagram_id === 11) {
  // Hexagram 11: Peace/Prosperity
  // Make directional prediction
  await call_tool(
    server: "vn-market", tool: "create_prediction_claim",
    arguments: {
      ticker: "^VNINDEX",
      prediction: "Uptrend likely to continue; target +2% over 20 days",
      confidence: 0.72
    }
  );
}
```

### Portfolio Analysis & Rebalancing

```typescript
// Full portfolio assessment
const conviction = await call_tool(
  server: "vn-market", tool: "get_portfolio_conviction",
  arguments: {}
);

const risk = await call_tool(
  server: "vn-market", tool: "get_portfolio_risk",
  arguments: {}
);

const rebalance = await call_tool(
  server: "vn-market", tool: "get_rebalancing_signals",
  arguments: {}
);

// Determine if portfolio needs adjustment
if (rebalance.actions.length > 0) {
  await call_tool(
    server: "vn-market", tool: "send_telegram",
    arguments: {
      message: `Portfolio rebalance recommended:\n${rebalance.actions.map(a => a.description).join('\n')}`,
      channel: "market"
    }
  );
}
```

### Comparing Backtest Runs

```typescript
// Compare strategy performance
const comparison = await call_tool(
  server: "vn-market", tool: "compare_backtest_runs",
  arguments: {
    run_ids: ["run_uuid_1", "run_uuid_2"]
  }
);

// comparison contains:
// - side_by_side metrics
// - winner (which strategy performed better)
// - risk/return comparison
```

### Calibration Check

```typescript
// Verify prediction confidence is well-calibrated
const calibration = await call_tool(
  server: "vn-market", tool: "get_calibration_report",
  arguments: {}
);

if (calibration.overconfident) {
  // We've been too confident relative to accuracy
  // Reduce confidence scaling on future predictions
}
```

### Updating Session Memory

```typescript
// Record key findings for persistence
await call_tool(
  server: "vn-market", tool: "append_session_record",
  arguments: {
    content: "Daily digest complete. Market hexagram: 11 (Peace). Sentiment +0.68. Backtest accuracy: 62.5%. Rebalance recommended for 2 positions."
  }
);

// Update strategic memory
await call_tool(
  server: "vn-market", tool: "update_memory_file",
  arguments: {
    file_key: "digest_memory",
    content: `Last update: ${new Date().toISOString()}\nMarket theme: ${market_hex.interpretation}\n...`
  }
);
```

---

## Related Documentation

- **All Tools Index:** `.claude/tools/list/README.md`
- **Kinh Dich:** `.claude/tools/list/kinhdich.md`
- **Backtesting:** `.claude/tools/list/backtesting.md`
- **MCP Logic:** `.claude/knowledge/mcp-tools.md`
- **Fail-Loud Protocol:** `.claude/knowledge/fail-loud-protocol.md`
