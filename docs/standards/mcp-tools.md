# MCP Tools — Logic & Mapping

<!-- size-justification: 185L — atomic SSOT tool catalog: per-agent tool list + renamed tools table + phantom-tool resolution (MSG-3) + mandatory patterns. Splitting fragments lookup surface; all agents read this file together to resolve tool availability. -->

**Load when:** tool selection, agent rewriting, or system capability review.

**Last refreshed:** 2026-06-07 (cowork-refactory-expert: discovered 161 live tools via registry scan)

---

## ⚡ Quick Start — Tool Discovery System

**New in 2026-05-05:** Lazy-loadable tool documentation system. Agents no longer embed tool lists in frontmatter.

| Resource | Purpose | When to Use |
|----------|---------|------------|
| **`docs/agents/tools/list/<tool>.md`** (116 files) | Tool signatures, parameters, examples | Agent needs to call a tool: look up here |
| **`docs/agents/tools/package/<agent>.md`** (22 files) | Agent's permitted tools by category | Agent starting: load this for quick reference |
| **`.claude/agents/<agent>.md`** | Agent definition | Agent spawning: always read first |

**Key change:** All cowork agents now use the MCP gateway `call_tool` (server="vn-market") instead of individual tool permissions.

### MCP Gateway — Correct Call Signature

```
call_tool(
  server: "vn-market",        ← REQUIRED, exact name
  tool: "<tool_name>",        ← e.g. "get_cycle_bootstrap"
  arguments: { ... }          ← tool-specific params
)
```

| Param | Type | Value |
|-------|------|-------|
| `server` | string | **`"vn-market"`** — the only MCP server. NOT `vnmarket-mcp`, NOT `vn_market`, NOT `vnmarket`. |
| `tool` | string | Tool name from `docs/agents/tools/list/<tool>.md` |
| `arguments` | object | Tool input params (see tool doc for schema) |

**Common mistakes:**
- ~~`tool_name`~~ → `tool`
- ~~`input`~~ → `arguments`
- ~~`vnmarket-mcp`~~ / ~~`vnmarket`~~ → `"vn-market"`

Example:
```
call_tool(
  server: "vn-market",
  tool: "get_cycle_bootstrap",
  arguments: { "agent_name": "alert-commander" }
)
```

---

## Tool Count & List

**Live tool count:** 161 tools (as of 2026-06-07)
SSOT: `docs/data/project-stats.json` → `toolCount`
Live verification: `curl -s http://127.0.0.1:3000/health | jq .toolCount`

### Complete Tool Surface (161)

| # | Tool | Category |
|---|------|----------|
| 1 | `add_to_watchlist` | system/watchlist |
| 2 | `answer_ask_question` | system/ask-queue |
| 3 | `append_session_record` | system/memory |
| 4 | `backfill_bctc_scalars` | financial/bctc |
| 5 | `batch_review_market_messages` | briefings/messages |
| 6 | `bctc_skip_queue_item` | financial/bctc |
| 7 | `claim_telegram_report` | briefings/telegram |
| 8 | `close_position` | portfolio |
| 9 | `compare_backtest_runs` | backtesting |
| 10 | `compare_financials` | news-analysis |
| 11 | `compare_stocks` | news-analysis |
| 12 | `compute_accruals` | financial/bctc |
| 13 | `create_prediction_claim` | macro/prediction |
| 14 | `delete_backtest_run` | backtesting |
| 15 | `delete_price_alert` | market-data |
| 16 | `diagnose_foreign_flow_circuit_breaker` | market-data |
| 17 | `emit_pressure_state` | system |
| 18 | `expire_monitoring_reports` | alerts |
| 19 | `explain_hexagram` | macro/kinhdich |
| 20 | `export_backtest_run_csv` | backtesting |
| 21 | `fetch_and_analyze` | news-analysis |
| 22 | `finalize_bctc_refine` | financial/bctc |
| 23 | `generate_market_summary` | briefings |
| 24 | `get_accuracy_context` | news-analysis |
| 25 | `get_agent_signals` | news-analysis |
| 26 | `get_agent_work_log` | system |
| 27 | `get_agm_plan` | financial |
| 28 | `get_alert_accuracy` | alerts |
| 29 | `get_alerts` | alerts |
| 30 | `get_analysis_history` | news-analysis |
| 31 | `get_backtest_run` | backtesting |
| 32 | `get_backtest_runs` | backtesting |
| 33 | `get_bctc_full` | financial/bctc |
| 34 | `get_bctc_ocf` | financial/bctc |
| 35 | `get_bctc_page_image` | financial/bctc |
| 36 | `get_bctc_page_text` | financial/bctc |
| 37 | `get_bctc_pending_refine` | financial/bctc |
| 38 | `get_bctc_refined` | financial/bctc |
| 39 | `get_bctc_series` | financial/bctc |
| 40 | `get_bond_maturity_calendar` | sector |
| 41 | `get_broker_credibility` | sector |
| 42 | `get_calibration_report` | macro |
| 43 | `get_carry_trade_signal` | macro |
| 44 | `get_cascade_metrics` | news-analysis |
| 45 | `get_cascade_outcomes` | news-analysis |
| 46 | `get_cash_flow` | financial/bctc |
| 47 | `get_climate_risk_signals` | sector |
| 48 | `get_company_profile` | market-data |
| 49 | `get_correlation_matrix` | sector |
| 50 | `get_credit_flow_signal` | sector |
| 51 | `get_crisis_early_warning` | sector |
| 52 | `get_cron_health` | alerts |
| 53 | `get_cycle_bootstrap` | system |
| 54 | `get_earnings_calendar` | financial |
| 55 | `get_energy_grid_signals` | sector |
| 56 | `get_evidence_summary` | macro |
| 57 | `get_fed_liquidity_spread` | macro |
| 58 | `get_financial_summary` | financial |
| 59 | `get_foreign_flow` | market-data |
| 60 | `get_hexagram_history` | macro/kinhdich |
| 61 | `get_imf_signals` | macro |
| 62 | `get_insider_signals` | market-data |
| 63 | `get_insider_transactions` | market-data |
| 64 | `get_investment_clock_phase` | macro |
| 65 | `get_ism_subcomponents` | macro |
| 66 | `get_kinhdich_reading` | macro/kinhdich |
| 67 | `get_label_accuracy_report` | alerts |
| 68 | `get_legal_risk_signals` | sector |
| 69 | `get_macro_calendar` | macro |
| 70 | `get_macro_snapshot` | macro |
| 71 | `get_market_cap` | market-data |
| 72 | `get_market_context` | market-data |
| 73 | `get_market_foreign_flow` | market-data |
| 74 | `get_market_message_digest` | briefings |
| 75 | `get_market_snapshot` | market-data |
| 76 | `get_market_summary` | briefings |
| 77 | `get_memory_files` | system/memory |
| 78 | `get_open_chain_findings` | sector |
| 79 | `get_patterns` | market-data |
| 80 | `get_pending_ask_questions` | system/ask-queue |
| 81 | `get_performance_attribution` | portfolio |
| 82 | `get_pharma_signals` | sector |
| 83 | `get_pipeline_health` | alerts |
| 84 | `get_policy_signals` | macro |
| 85 | `get_portfolio_conviction` | portfolio |
| 86 | `get_portfolio_risk` | portfolio |
| 87 | `get_positions` | portfolio |
| 88 | `get_prediction_accuracy` | macro/prediction |
| 89 | `get_prediction_markets` | macro/prediction |
| 90 | `get_price_history` | market-data |
| 91 | `get_public_contracts` | sector |
| 92 | `get_pyramid_tier` | macro |
| 93 | `get_rate_limit_status` | macro |
| 94 | `get_rebalancing_signals` | portfolio |
| 95 | `get_recent_fixes` | system |
| 96 | `get_sector_comparison` | sector |
| 97 | `get_sector_rotation` | sector |
| 98 | `get_sentiment_trend` | news-analysis |
| 99 | `get_signal_effectiveness` | news-analysis |
| 100 | `get_signal_rejection_summary` | news-analysis |
| 101 | `get_sla_status` | alerts |
| 102 | `get_supply_chain_exposure` | sector |
| 103 | `get_system_status` | system |
| 104 | `get_target_allocation` | portfolio |
| 105 | `get_technical_indicators` | market-data |
| 106 | `get_ticker_intelligence` | market-data |
| 107 | `get_transition_probabilities` | macro/prediction |
| 108 | `get_unreviewed_market_messages` | briefings |
| 109 | `get_user_positions_for_analysis` | portfolio |
| 110 | `get_vps_proxy_health` | system |
| 111 | `get_vps_service_health` | system |
| 112 | `get_watchlist` | system/watchlist |
| 113 | `get_yield_spread_signal` | macro |
| 114 | `is_trading_day` | system |
| 115 | `list_alert_rules` | alerts |
| 116 | `list_flagged_bctc_cells` | financial/bctc |
| 117 | `list_stored_pdfs` | financial |
| 118 | `list_unresolved_reports` | briefings/telegram |
| 119 | `log_agent_work` | system |
| 120 | `log_fix` | system |
| 121 | `manage_alert_mute` | alerts |
| 122 | `mark_alert_outcome` | alerts |
| 123 | `mark_alert_read` | alerts |
| 124 | `post_agent_signal` | news-analysis |
| 125 | `process_telegram_report` | briefings/telegram |
| 126 | `push_bctc_refined_unit` | financial/bctc |
| 127 | `read_bctc_pdf` | financial/bctc |
| 128 | `read_telegram_reports` | briefings/telegram |
| 129 | `record_evidence_fragment` | macro |
| 130 | `record_signal_outcome` | alerts |
| 131 | `remove_from_watchlist` | system/watchlist |
| 132 | `reset_foreign_flow_circuit_breaker` | market-data |
| 133 | `restart_vps_service` | system |
| 134 | `review_market_message` | briefings/messages |
| 135 | `run_backtest` | backtesting |
| 136 | `run_bctc_batch_sweep` | financial/bctc |
| 137 | `run_hexagram_backtest` | macro/kinhdich |
| 138 | `run_impact_chain` | news-analysis |
| 139 | `run_qa_responder` | system |
| 140 | `search_memory_by_trigger` | system/memory |
| 141 | `search_similar_context` | news-analysis |
| 142 | `send_alert_digest` | alerts |
| 143 | `send_telegram` | briefings/telegram |
| 144 | `set_position` | portfolio |
| 145 | `set_price_alert` | market-data |
| 146 | `smart_compact` | system |
| 147 | `submit_bctc_correction` | financial/bctc |
| 148 | `submit_feedback` | system |
| 149 | `task_claim` | system/coordination |
| 150 | `task_force_release_orphan` | system/coordination |
| 151 | `task_heartbeat` | system/coordination |
| 152 | `task_list_held` | system/coordination |
| 153 | `task_release` | system/coordination |
| 154 | `trigger_bctc_vps_fetch` | system/debug |
| 155 | `trigger_foreign_flow_vps_fetch` | system/debug |
| 156 | `trigger_news_vps_fetch` | system/debug |
| 157 | `trigger_price_vps_fetch` | system/debug |
| 158 | `trigger_sbv_vps_fetch` | system/debug |
| 159 | `update_memory_file` | system/memory |
| 160 | `update_thresholds` | system/watchlist |
| 161 | `write_alert_verdict` | alerts |

## Renamed/Removed Tools — CRITICAL

| OLD (NEVER use) | NEW |
|-----------------|-----|
| `get_system_health` | `get_system_status` |
| `get_source_health` | `get_system_status` (merged) |
| `get_data_freshness` | `get_system_status` (merged) |
| `get_error_summary` | `get_system_status` (merged) |
| `send_test_telegram` | `send_telegram(channel="market")` |
| `send_telegram_report` | `send_telegram(channel="bug")` |
| `delete_telegram_report` | absorbed into `process_telegram_report` |
| `mute_stock_alerts` | `manage_alert_mute(action="mute")` |
| `unmute_stock_alerts` | `manage_alert_mute(action="unmute")` |
| `get_price_alerts` | `get_alerts(type="price")` |
| `set_target_allocation` | removed — see `docs/data/tool-registry.json` → `removed` |
| `get_market_breadth` | PHANTOM — never implemented (see note below) |
| `get_top_movers` | PHANTOM — never implemented (see note below) |

Full removed list → `docs/data/tool-registry.json` → `removed`

### Phantom Tool Resolution — MSG-3 (2026-06-02) — UPDATED 2026-06-07

`get_market_breadth` and `get_top_movers` are **phantom tools**: they have no implementation
in any `.ts` file (confirmed by grep across the full codebase).

**Resolution (2026-06-07):** Updated `docs/agents/fb-market-poster/flow/main.md` to replace:
- `get_market_breadth` → replaced with `get_market_context` (provides breadth data when available)
- `get_top_movers` → replaced with `get_ticker_intelligence` (provides mover/technical signals)

These replacements are live-tool alternatives that provide analogous functionality. If `market_context`
or `ticker_intel` do not return breadth/mover data, the flow documents this as a data quality gap.
These phantom tools are NOT registered in the vn-market MCP server.

**Do NOT call these tools** via the gateway — they will return a tool-not-found error.
Use `get_market_snapshot` (codes=[watchlist]) + `get_market_foreign_flow` for coverage.
If a full breadth/movers implementation is needed, file a sprint task (data source: SSC
market stats API or VnDirect's stock screening endpoint).

## Tools Per Agent

| Agent | Tools |
|-------|-------|
| News Scout | `get_cycle_bootstrap`, `fetch_and_analyze`, `get_watchlist`, `get_agent_signals`, `run_impact_chain`, `search_similar_context`, `post_agent_signal`, `log_agent_work`, `send_telegram`, `submit_feedback` |
| Financial Analyst | `get_cycle_bootstrap`, `get_earnings_calendar`, `list_stored_pdfs`, `get_bctc_full`, `get_sector_comparison`, `get_kinhdich_reading`, `get_insider_signals`, `get_legal_risk_signals`, `get_open_chain_findings`, `get_watchlist`, `search_similar_context`, `post_agent_signal`, `log_agent_work`, `send_telegram`, `submit_feedback` |
| Report Analyzer | `get_cycle_bootstrap`, `get_earnings_calendar`, `get_bctc_full`, `get_sector_comparison`, `compare_stocks`, `compare_financials`, `get_watchlist`, `post_agent_signal`, `log_agent_work`, `send_telegram`, `submit_feedback` |
| Market Watcher | `get_cycle_bootstrap`, `get_price_history`, `get_sector_comparison`, `get_patterns`, `get_technical_indicators`, `get_ticker_intelligence`, `get_sector_rotation`, `get_supply_chain_exposure`, `get_climate_risk_signals`, `get_energy_grid_signals`, `get_open_chain_findings`, `get_watchlist`, `get_insider_signals`, `get_market_snapshot`, `post_agent_signal`, `log_agent_work`, `send_telegram`, `submit_feedback` |
| Alert Commander | `get_cycle_bootstrap`, `get_market_context`, `get_alerts`, `get_legal_risk_signals`, `get_crisis_early_warning`, `get_market_snapshot`, `get_kinhdich_reading`, `get_watchlist`, `get_agent_signals`, `send_telegram`, `send_alert_digest`, `mark_alert_read`, `record_signal_outcome`, `post_agent_signal`, `log_agent_work`, `submit_feedback` |
| Digest & Predict | `get_cycle_bootstrap`, `get_market_summary`, `get_performance_attribution`, `get_sector_rotation`, `get_earnings_calendar`, `generate_market_summary`, `get_market_snapshot`, `get_open_chain_findings`, `get_legal_risk_signals`, `get_crisis_early_warning`, `get_supply_chain_exposure`, `get_climate_risk_signals`, `get_energy_grid_signals`, `get_kinhdich_reading`, `get_market_hexagram`, `get_bctc_full`, `get_macro_snapshot`, `get_portfolio_risk`, `get_rebalancing_signals`, `get_alert_accuracy`, `get_signal_effectiveness`, `get_cascade_metrics`, `run_hexagram_backtest`, `get_transition_probabilities`, `get_prediction_accuracy`, `get_calibration_report`, `get_correlation_matrix`, `get_sector_comparison`, `get_portfolio_conviction`, `get_evidence_summary`, `create_prediction_claim`, `get_recent_fixes`, `read_telegram_reports`, `get_watchlist`, `get_user_positions_for_analysis`, `get_insider_signals`, `log_agent_work`, `send_telegram`, `submit_feedback`, `append_session_record`, `update_memory_file` |
| Unified Coordinator | `get_cycle_bootstrap`, `get_system_status`, `get_rate_limit_status`, `get_recent_fixes`, `read_telegram_reports`, `get_market_context`, `get_prediction_markets`, `get_sentiment_trend`, `get_legal_risk_signals`, `get_crisis_early_warning`, `get_positions`, `get_portfolio_conviction`, `get_portfolio_risk`, `get_rebalancing_signals`, `get_target_allocation`, `get_supply_chain_exposure`, `get_climate_risk_signals`, `get_energy_grid_signals`, `get_insider_signals`, `get_alert_accuracy`, `get_signal_effectiveness`, `get_unreviewed_market_messages`, `get_cascade_metrics`, `get_prediction_accuracy`, `get_earnings_calendar`, `get_kinhdich_reading`, `get_bctc_full`, `get_watchlist`, `get_user_positions_for_analysis`, `post_agent_signal`, `log_agent_work`, `send_telegram`, `submit_feedback` |
| QA Responder | `get_pending_ask_questions`, `get_market_context`, `get_kinhdich_reading`, `get_bctc_full`, `get_insider_transactions`, `run_qa_responder`, `get_macro_snapshot`, `get_prediction_markets`, `get_crisis_early_warning`, `get_market_snapshot`, `get_watchlist`, `answer_ask_question`, `log_agent_work`, `send_telegram`, `submit_feedback` |
| Dev Team Cron | `read_telegram_reports`, `list_unresolved_reports`, `claim_telegram_report`, `process_telegram_report`, `log_fix`, `get_recent_fixes`, `send_telegram(channel="work")`, `get_system_status`, `get_vps_proxy_health`, `get_cron_health` |

## Shared Tools (Available to All Agents)

| Tool | Purpose | REQ | Added |
|------|---------|-----|-------|
| `validate_signal_price` | Validate signal price vs live market snapshot (±5% tolerance) | 230 | 2026-04-21 |
| `task_claim` | Claim a coordination lock before exclusive work. Returns `{claimed, stolen?, current_holder?}`. Use before any cowork-slot, sprint-task, or dashboard-row. TTL default 3600s. | task-lock Phase 1 | 2026-05-20 |
| `task_heartbeat` | Renew a held lock (prove-alive). Call every 5 min during long tasks. Returns `{ok, expires_at}`. ok=false = lock stolen → abort. | task-lock Phase 1 | 2026-05-20 |
| `task_release` | Release a lock on completion. Scoped to calling session. Returns `{ok}`. ok=false is acceptable (already expired). | task-lock Phase 1 | 2026-05-20 |
| `task_list_held` | List held locks for debug/audit. Filters: kind, owner_agent, expired. Returns `{locks[], count}`. Read-only. | task-lock Phase 1 | 2026-05-20 |

## Mandatory Agent Patterns

Opening sequence (ALL agents):
```
Step 0: get_cycle_bootstrap(agent_name="{agent-name}")
        replaces: get_agent_signals + get_market_context + get_system_status
```

Before reporting a bug:
```
1. get_recent_fixes(10)
2. If issue already in list → SKIP (already fixed)
```

After signal action (Alert Commander only):
```
record_signal_outcome(signal_id, "fired"|"suppressed"|"confirmed"|"false_positive")
```

## Claude-Native Agent Tools

Tools injected by the MCP client — not registered by the server, not in tool-registry.json.

| Tool | Used by | Purpose |
|------|---------|---------|
| `mcp__semble__search` | developer, architect, ba, fixer, code-janitor, system-auditor | Semantic code search by intent or symbol |
| `mcp__semble__find_related` | same | Discover structurally similar code after a search result |

Decision guide → `.claude/skills/semble-search/SKILL.md`

## Signal Bus — Naming Contract

All agents writing to `docs/signals/` MUST comply with the naming contract:

```
docs/signals/{from}-{ISO-8601-timestamp}.json
```

- `{from}` — agent id (e.g. `po`, `cowork-team`, `agent-father`)
- `{ISO-8601-timestamp}` — compact UTC form `YYYYMMDDTHHMMSSz` (e.g. `20260521T194519Z`)
- Full example: `po-20260521T194519Z.json`

**Why:** Dedup fingerprint in `signals.db` relies on the timestamp component. Missing timestamp breaks dedup and makes stale signals hard to prune.

**Anti-pattern (never):** `po-1967-ba-approved.json`, `po-1967b-rerun.json` — sprint references belong in the `payload`, not the filename.

Historical spec (1 line) → `docs/protocols/agent-chaining-protocol.md` § Cross-Team Signal Directory (cross-link only; mcp-tools.md is SSOT).

---

## Inter-Agent Signal Types

> DASHBOARD row prune rule (DONE=immediate, READ=48h aging) → `.claude/skills/signal-dashboard/SKILL.md` § PRUNE

| Signal | From | To | When |
|--------|------|----|------|
| `urgent_news` | News Scout | Market Watcher | Impact >= 8 |
| `price_anomaly` | Market Watcher | Alert Commander | >2sigma move |
| `cross_validate` | Financial Analyst | Alert Commander | CRITICAL BCTC finding |
| `suppress` | Alert Commander | All | False positive |
| `legal_risk` | News Scout | Alert Commander | Prosecution/tax penalty |
| `crisis_velocity` | News Scout | Alert Commander | 5x mention spike |
| `chain_catalyst` | News Scout | All | Impact >= 7 watchlist catalyst |
| `fundamental_validation` | Financial Analyst, Report Analyzer | Alert Commander | BCTC confirms/contradicts catalyst |
| `price_confirmation` | Market Watcher | All | Price confirms catalyst |
| `verified_chain` | Server | Alert Commander | 2+ agent confirmations synthesized |
| `verified_decision` | Alert Commander | All | Chain de-dup ack after alert-commander fires or suppresses |
