# MCP Tools — Logic & Mapping

<!-- size-justification: 137L — atomic SSOT tool catalog: per-agent tool list + renamed tools table + mandatory patterns. Splitting fragments lookup surface; all agents read this file together to resolve tool availability. -->

**Load when:** tool selection, agent rewriting, or system capability review.

---

## ⚡ Quick Start — Tool Discovery System

**New in 2026-05-05:** Lazy-loadable tool documentation system. Agents no longer embed tool lists in frontmatter.

| Resource | Purpose | When to Use |
|----------|---------|------------|
| **`.claude/tools/list/<tool>.md`** (116 files) | Tool signatures, parameters, examples | Agent needs to call a tool: look up here |
| **`.claude/tools/package/<agent>.md`** (22 files) | Agent's permitted tools by category | Agent starting: load this for quick reference |
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
| `tool` | string | Tool name from `.claude/tools/list/<tool>.md` |
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

Live data → `docs/data/project-stats.json`
Live check: `curl -s http://127.0.0.1:3000/health | jq .toolCount`

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

Full removed list → `docs/data/tool-registry.json` → `removed`

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

## Inter-Agent Signal Types

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
