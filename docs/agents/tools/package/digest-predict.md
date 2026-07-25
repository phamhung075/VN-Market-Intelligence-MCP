# Tool Package — Digest & Predict

**Location:** `docs/agents/tools/package/digest-predict.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-15

Invoke via gateway: call_tool(server="vn-market", tool="<name>", arguments={...}) — grammar SSOT: project CLAUDE.md § MCP Tools. Wrong: tool_name/input/vnmarket-mcp.

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
| `get_market_summary` | Daily/weekly market summary and key metrics | `period: 'daily'\|'weekly'\|'monthly'\|'quarterly'\|'yearly'` (req) |
| `get_market_snapshot` | Price, volume, sector sentiment, trading halt status | — |
| `generate_market_summary` | Generate synthesized market report | `period?: "daily" \| "weekly"` |
| `get_performance_attribution` | Attribution of returns to factors (sector, style, etc.) | — |
| `get_volatility_indicators` | Market volatility metrics: rv_10/20/60d, GK vol, regime band, 252d drawdown (P0 indicator) | — |
| `get_breadth_thrust` | McClellan/Zweig/breadth-z indicators (P0 indicator) | — |

### Financial Reports & Earnings
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_earnings_calendar` | Filing deadlines and status for all watchlist stocks | — |
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `code: string` (req, NOT `ticker`) |
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
| `get_kinhdich_reading` | Hexagram reading for specific stock | `code: string` (NOT `ticker`) |
| `get_market_hexagram` | Market-wide hexagram (VN-Index + macro) | — |
| `run_hexagram_backtest` | Accuracy test of trading signals vs prices | `strategy: string, date_range: string` |
| `get_transition_probabilities` | Markov transitions (hex → next hex) | `hexagram_number: number` (req, NOT `ticker`) |
| `compare_backtest_runs` | Compare 2+ backtests side-by-side | `run_ids: string[]` |

### Prediction & Calibration
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_prediction_accuracy` | Prediction model accuracy metrics | — |
| `get_calibration_report` | Calibration analysis of prediction confidence | — |
| `create_prediction_claim` | Create timestamped prediction claim for tracking | `stock: string, claim_text: string, probability: number, horizon_days: number, resolution_criteria: string(JSON)` (verified param names — see daily-predict.md flow; NOT ticker/prediction/confidence) |
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
| `get_insider_signals` | Insider trading activity and positions | `code: string` (req) |

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
| `log_agent_work` | Log cycle lifecycle — **two-call pattern required** (see recipe below) | Call 1: `agent_name, status: "running"` → `{ id }`. Call 2: `agent_name, id, status: "completed"\|"error", summary?, findings?, actions?` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

Lifecycle recipe (2 calls, id round-trip) → `docs/agents/tools/list/log_agent_work.md`

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | Digests, predictions, market summaries |
| **work** | ✅ | Cycle completion, backtest results |
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

Full protocol: `docs/protocols/task-lock-protocol.md` | Skill: `.claude/skills/task-lock/SKILL.md`

---

## Related Documentation

- **All Tools Index:** `docs/agents/tools/list/README.md`
- **Kinh Dich:** `docs/agents/tools/list/kinhdich.md`
- **Backtesting:** `docs/agents/tools/list/backtesting.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
