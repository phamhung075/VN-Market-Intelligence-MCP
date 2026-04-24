# Skill Manifest — Sprint 1299

Updated: 2026-04-23
Purpose: SSOT for skill → tool mapping. Developer mirrors the JSON block below in `agentBootstrap.ts` as a static TypeScript const.

Source: `.claude/knowledge/mcp-tools.md` (per-agent tool lists) + `docs/TECH_1299.md` (digest_predict trim).

---

## JSON Manifest (machine-readable)

```json
{
  "news_scout": [
    "get_agent_signals",
    "get_market_context",
    "fetch_and_analyze",
    "run_impact_chain",
    "search_similar_context",
    "get_prediction_markets",
    "get_rate_limit_status",
    "post_agent_signal",
    "get_recent_fixes",
    "submit_feedback",
    "get_legal_risk_signals",
    "get_crisis_early_warning",
    "record_evidence_fragment",
    "log_agent_work"
  ],
  "financial_analyst": [
    "get_cycle_bootstrap",
    "get_user_positions_for_analysis",
    "get_earnings_calendar",
    "list_stored_pdfs",
    "get_bctc_full",
    "read_bctc_pdf",
    "get_financial_summary",
    "compare_stocks",
    "get_sentiment_trend",
    "get_sector_comparison",
    "get_kinhdich_reading",
    "post_agent_signal",
    "get_open_chain_findings",
    "get_market_summary",
    "generate_market_summary",
    "get_market_snapshot",
    "get_legal_risk_signals",
    "get_insider_signals",
    "get_insider_transactions",
    "record_evidence_fragment",
    "send_telegram",
    "get_recent_fixes",
    "submit_feedback",
    "log_agent_work"
  ],
  "market_watcher": [
    "get_agent_signals",
    "get_market_context",
    "get_market_snapshot",
    "get_price_history",
    "get_patterns",
    "get_sector_rotation",
    "get_sector_comparison",
    "get_kinhdich_reading",
    "get_market_hexagram",
    "get_supply_chain_exposure",
    "get_alerts",
    "get_positions",
    "get_portfolio_risk",
    "compare_stocks",
    "get_sentiment_trend",
    "get_open_chain_findings",
    "post_agent_signal",
    "manage_alert_mute",
    "get_recent_fixes",
    "submit_feedback",
    "get_energy_grid_signals",
    "get_climate_risk_signals",
    "get_crisis_early_warning",
    "get_foreign_flow",
    "record_evidence_fragment",
    "log_agent_work"
  ],
  "alert_commander": [
    "get_agent_signals",
    "get_system_status",
    "get_market_context",
    "get_alerts",
    "mark_alert_read",
    "send_telegram",
    "send_alert_digest",
    "record_signal_outcome",
    "get_alert_accuracy",
    "manage_alert_mute",
    "list_alert_rules",
    "post_agent_signal",
    "get_recent_fixes",
    "submit_feedback",
    "delete_price_alert",
    "get_kinhdich_reading",
    "get_legal_risk_signals",
    "get_crisis_early_warning",
    "get_cron_health"
  ],
  "digest_predict": [
    "get_cycle_bootstrap",
    "get_user_positions_for_analysis",
    "get_watchlist",
    "get_evidence_summary",
    "get_calibration_report",
    "create_prediction_claim",
    "get_market_summary",
    "generate_market_summary",
    "get_bctc_full",
    "compare_financials",
    "get_macro_snapshot",
    "get_portfolio_conviction",
    "get_correlation_matrix",
    "get_alert_accuracy",
    "get_performance_attribution",
    "get_portfolio_risk",
    "get_rebalancing_signals",
    "get_sector_rotation",
    "get_sector_comparison",
    "get_earnings_calendar",
    "get_signal_effectiveness",
    "get_cascade_metrics",
    "get_prediction_accuracy",
    "get_supply_chain_exposure",
    "get_kinhdich_reading",
    "get_market_hexagram",
    "run_hexagram_backtest",
    "get_transition_probabilities",
    "explain_hexagram",
    "get_hexagram_history",
    "get_open_chain_findings",
    "get_market_snapshot",
    "send_telegram",
    "get_recent_fixes",
    "submit_feedback",
    "get_legal_risk_signals",
    "get_policy_signals",
    "get_bond_maturity_calendar",
    "get_public_contracts",
    "get_credit_flow_signal",
    "get_insider_signals",
    "get_climate_risk_signals",
    "get_energy_grid_signals",
    "get_crisis_early_warning",
    "get_pharma_signals",
    "get_foreign_flow",
    "log_agent_work",
    "post_agent_signal",
    "get_agent_signals"
  ],
  "dev_team": [
    "read_telegram_reports",
    "claim_telegram_report",
    "process_telegram_report",
    "log_fix",
    "get_recent_fixes",
    "send_telegram",
    "get_system_status",
    "get_vps_proxy_health",
    "get_cron_health"
  ],
  "qa_responder": [
    "get_pending_ask_questions",
    "answer_ask_question",
    "run_qa_responder",
    "fetch_and_analyze",
    "get_market_context",
    "get_positions",
    "get_kinhdich_reading",
    "get_market_hexagram",
    "get_bctc_full",
    "get_sentiment_trend",
    "get_legal_risk_signals",
    "send_telegram",
    "get_foreign_flow",
    "get_insider_transactions"
  ],
  "unified_coordinator": [
    "get_agent_signals",
    "get_system_status",
    "get_market_context",
    "get_macro_snapshot",
    "get_alerts",
    "get_prediction_markets",
    "get_sentiment_trend",
    "get_positions",
    "get_portfolio_conviction",
    "get_portfolio_risk",
    "get_correlation_matrix",
    "get_rebalancing_signals",
    "get_performance_attribution",
    "get_alert_accuracy",
    "get_signal_effectiveness",
    "get_cascade_metrics",
    "get_prediction_accuracy",
    "get_supply_chain_exposure",
    "get_open_chain_findings",
    "claim_telegram_report",
    "read_telegram_reports",
    "process_telegram_report",
    "submit_feedback",
    "get_recent_fixes",
    "send_telegram",
    "get_legal_risk_signals",
    "get_policy_signals",
    "get_bond_maturity_calendar",
    "get_public_contracts",
    "get_credit_flow_signal",
    "get_insider_signals",
    "get_climate_risk_signals",
    "get_energy_grid_signals",
    "get_crisis_early_warning",
    "get_pharma_signals",
    "get_cron_health",
    "get_agent_work_log",
    "get_calibration_report",
    "get_foreign_flow",
    "get_insider_transactions"
  ],
  "_always_on": [
    "get_cycle_bootstrap",
    "submit_feedback",
    "get_recent_fixes",
    "log_agent_work",
    "send_telegram",
    "post_agent_signal",
    "get_agent_signals"
  ]
}
```

---

## Per-Skill Detail

### news_scout (14 tools)

Agent 01 — News Scout. Fetches + analyzes VN/global news via causal chain.

| Tool | Role |
|------|------|
| `get_agent_signals` | Read incoming signals from other agents |
| `get_market_context` | Combined macro + sector + watchlist context |
| `fetch_and_analyze` | Primary: fetch news and run impact analysis |
| `run_impact_chain` | Execute causal chain for a catalyst |
| `search_similar_context` | RAG lookup for similar past analyses |
| `get_prediction_markets` | Check active prediction contracts |
| `get_rate_limit_status` | Verify fetch quota before crawling |
| `post_agent_signal` | Broadcast findings to Market Watcher / Alert Commander |
| `get_recent_fixes` | De-dup before bug reports |
| `submit_feedback` | Error reporting |
| `get_legal_risk_signals` | Detect prosecution / regulatory risk catalysts |
| `get_crisis_early_warning` | Detect early macro/market crisis signals |
| `record_evidence_fragment` | Store evidence supporting a thesis |
| `log_agent_work` | Record task completion |

Token estimate: ~8.4k (14 × ~600)

---

### financial_analyst (24 tools)

Agent 02 — Financial Analyst. Deep BCTC extraction and fundamental analysis.

| Tool | Role |
|------|------|
| `get_cycle_bootstrap` | Opening sequence |
| `get_user_positions_for_analysis` | Load positions for context |
| `get_earnings_calendar` | Upcoming earnings dates |
| `list_stored_pdfs` | Discover available BCTC PDFs |
| `get_bctc_full` | Full BCTC extraction |
| `read_bctc_pdf` | Direct PDF text read |
| `get_financial_summary` | KPI summary from stored BCTC |
| `compare_stocks` | Multi-ticker financial comparison |
| `get_sentiment_trend` | Sentiment over time |
| `get_sector_comparison` | Sector-level valuation comparison |
| `get_kinhdich_reading` | Kinh Dich context for fundamental calls |
| `post_agent_signal` | Broadcast fundamental_validation to Alert Commander |
| `get_open_chain_findings` | Review pending chain findings |
| `get_market_summary` | Recent market summary |
| `generate_market_summary` | Generate fresh summary |
| `get_market_snapshot` | Live index snapshot |
| `get_legal_risk_signals` | Legal risk context |
| `get_insider_signals` | Insider trading patterns |
| `get_insider_transactions` | Specific insider transaction records |
| `record_evidence_fragment` | Store BCTC evidence fragment |
| `send_telegram` | Report findings to market/work channel |
| `get_recent_fixes` | De-dup before bug reports |
| `submit_feedback` | Error reporting |
| `log_agent_work` | Record task completion |

Token estimate: ~14.4k (24 × ~600)

---

### market_watcher (26 tools)

Agent 04 — Market Watcher. Monitors live price, volume, and technical signals.

| Tool | Role |
|------|------|
| `get_agent_signals` | Read incoming signals |
| `get_market_context` | Combined market context |
| `get_market_snapshot` | Live index + top movers |
| `get_price_history` | OHLCV history |
| `get_patterns` | Technical chart patterns |
| `get_sector_rotation` | Capital rotation detection |
| `get_sector_comparison` | Sector metric comparison |
| `get_kinhdich_reading` | Kinh Dich reading |
| `get_market_hexagram` | Market state hexagram |
| `get_supply_chain_exposure` | Supply chain risk map |
| `get_alerts` | Active price alerts |
| `get_positions` | Open positions |
| `get_portfolio_risk` | Portfolio risk metrics |
| `compare_stocks` | Multi-ticker comparison |
| `get_sentiment_trend` | Sentiment trend |
| `get_open_chain_findings` | Open causal chain findings |
| `post_agent_signal` | Broadcast price_anomaly / price_confirmation |
| `manage_alert_mute` | Mute/unmute ticker alerts |
| `get_recent_fixes` | De-dup before bug reports |
| `submit_feedback` | Error reporting |
| `get_energy_grid_signals` | Energy grid signals |
| `get_climate_risk_signals` | Climate risk signals |
| `get_crisis_early_warning` | Crisis early warning |
| `get_foreign_flow` | Net foreign flow |
| `record_evidence_fragment` | Store price evidence |
| `log_agent_work` | Record task completion |

Token estimate: ~15.6k (26 × ~600)

---

### alert_commander (19 tools)

Agent 05 — Alert Commander. Sole sender of market channel alerts.

| Tool | Role |
|------|------|
| `get_agent_signals` | Read cross-validate / urgent_news signals |
| `get_system_status` | System health check before firing |
| `get_market_context` | Full context for alert enrichment |
| `get_alerts` | All active alerts |
| `mark_alert_read` | Mark fired alerts as read |
| `send_telegram` | Fire alert to market channel (exclusive) |
| `send_alert_digest` | Batch alert digest to market channel |
| `record_signal_outcome` | Log fired/suppressed/confirmed/false_positive |
| `get_alert_accuracy` | Precision/recall report |
| `manage_alert_mute` | Mute overactive tickers |
| `list_alert_rules` | Review active alert rules |
| `post_agent_signal` | Broadcast suppress signal |
| `get_recent_fixes` | De-dup before bug reports |
| `submit_feedback` | Error reporting |
| `delete_price_alert` | Remove stale price alerts |
| `get_kinhdich_reading` | Kinh Dich confirmation layer |
| `get_legal_risk_signals` | Legal risk context |
| `get_crisis_early_warning` | Crisis signal check |
| `get_cron_health` | Verify schedulers running before digest |

Token estimate: ~11.4k (19 × ~600)

---

### digest_predict (49 tools — trimmed per TECH_1299.md)

Agent 06 — Digest & Predict. Daily briefing + prediction calibration. Trimmed from ~52 → 49 tools.

**Removed tools:** `read_telegram_reports`, `get_agent_work_log`, `get_label_accuracy_report` (dev-team/QA-specific, no use case for analysis agent).

| Tool | Role |
|------|------|
| `get_cycle_bootstrap` | Opening sequence |
| `get_user_positions_for_analysis` | Position context |
| `get_watchlist` | Watchlist for briefing scope |
| `get_evidence_summary` | Evidence aggregation |
| `get_calibration_report` | Calibration curve |
| `create_prediction_claim` | New trackable prediction |
| `get_market_summary` | Recent summary |
| `generate_market_summary` | Fresh summary generation |
| `get_bctc_full` | BCTC context |
| `compare_financials` | Financial ratio comparison |
| `get_macro_snapshot` | Macro indicators |
| `get_portfolio_conviction` | Conviction scores |
| `get_correlation_matrix` | Correlation matrix |
| `get_alert_accuracy` | Alert accuracy |
| `get_performance_attribution` | Return attribution |
| `get_portfolio_risk` | Portfolio risk |
| `get_rebalancing_signals` | Rebalancing signals |
| `get_sector_rotation` | Sector rotation |
| `get_sector_comparison` | Sector comparison |
| `get_earnings_calendar` | Earnings calendar |
| `get_signal_effectiveness` | Signal effectiveness |
| `get_cascade_metrics` | Cascade execution metrics |
| `get_prediction_accuracy` | Prediction accuracy |
| `get_supply_chain_exposure` | Supply chain risk |
| `get_kinhdich_reading` | Kinh Dich reading |
| `get_market_hexagram` | Market hexagram |
| `run_hexagram_backtest` | Hexagram backtest |
| `get_transition_probabilities` | Hexagram transition probs |
| `explain_hexagram` | Hexagram explanation |
| `get_hexagram_history` | Past hexagram outcomes |
| `get_open_chain_findings` | Open chain findings |
| `get_market_snapshot` | Live snapshot |
| `send_telegram` | Send briefing to market/work channels |
| `get_recent_fixes` | De-dup before bug reports |
| `submit_feedback` | Error reporting |
| `get_legal_risk_signals` | Legal risk context |
| `get_policy_signals` | Policy change signals |
| `get_bond_maturity_calendar` | Bond maturity calendar |
| `get_public_contracts` | Public procurement signals |
| `get_credit_flow_signal` | Credit flow signals |
| `get_insider_signals` | Insider trading signals |
| `get_climate_risk_signals` | Climate risk signals |
| `get_energy_grid_signals` | Energy grid signals |
| `get_crisis_early_warning` | Crisis early warning |
| `get_pharma_signals` | Pharma sector signals |
| `get_foreign_flow` | Net foreign flow |
| `log_agent_work` | Record task completion |
| `post_agent_signal` | Inter-agent coordination |
| `get_agent_signals` | Signal inbox |

Token estimate: ~29.4k (49 × ~600) — under 30k target

---

### dev_team (9 tools)

Dev Team Cron. Bug triage and fix pipeline.

| Tool | Role |
|------|------|
| `read_telegram_reports` | Read unclaimed bug reports |
| `claim_telegram_report` | Claim ownership of a bug report |
| `process_telegram_report` | Process claimed report to resolution |
| `log_fix` | Record shipped fix |
| `get_recent_fixes` | De-dup check |
| `send_telegram` | Status updates to work channel |
| `get_system_status` | System health before fix verification |
| `get_vps_proxy_health` | VPS proxy health check |
| `get_cron_health` | Scheduler health check |

Token estimate: ~5.4k (9 × ~600)

---

### qa_responder (14 tools)

Agent 07 — QA Responder. Answers user /ask questions via Telegram.

| Tool | Role |
|------|------|
| `get_pending_ask_questions` | Fetch unanswered /ask questions |
| `answer_ask_question` | Post answer to user question |
| `run_qa_responder` | Full responder cycle |
| `fetch_and_analyze` | Deep news analysis for complex questions |
| `get_market_context` | Market context for question framing |
| `get_positions` | Position context for portfolio questions |
| `get_kinhdich_reading` | Kinh Dich context |
| `get_market_hexagram` | Market hexagram context |
| `get_bctc_full` | BCTC data for fundamental questions |
| `get_sentiment_trend` | Sentiment context |
| `get_legal_risk_signals` | Legal risk context |
| `send_telegram` | Deliver answer to market channel |
| `get_foreign_flow` | Foreign flow context |
| `get_insider_transactions` | Insider transaction context |

Token estimate: ~8.4k (14 × ~600)

---

### unified_coordinator (40 tools)

Unified Coordinator. Cross-agent orchestration and system-wide oversight.

| Tool | Role |
|------|------|
| `get_agent_signals` | Read all agent signals |
| `get_system_status` | System health overview |
| `get_market_context` | Full market context |
| `get_macro_snapshot` | Macro indicators |
| `get_alerts` | All active alerts |
| `get_prediction_markets` | Active prediction contracts |
| `get_sentiment_trend` | Sentiment trends |
| `get_positions` | Open positions |
| `get_portfolio_conviction` | Conviction scores |
| `get_portfolio_risk` | Portfolio risk |
| `get_correlation_matrix` | Correlation matrix |
| `get_rebalancing_signals` | Rebalancing signals |
| `get_performance_attribution` | Return attribution |
| `get_alert_accuracy` | Alert accuracy |
| `get_signal_effectiveness` | Signal effectiveness |
| `get_cascade_metrics` | Cascade metrics |
| `get_prediction_accuracy` | Prediction accuracy |
| `get_supply_chain_exposure` | Supply chain risk |
| `get_open_chain_findings` | Open chain findings |
| `claim_telegram_report` | Claim bug reports |
| `read_telegram_reports` | Read bug reports |
| `process_telegram_report` | Process bug reports |
| `submit_feedback` | Error reporting |
| `get_recent_fixes` | Recent fix de-dup |
| `send_telegram` | Cross-channel messaging |
| `get_legal_risk_signals` | Legal risk |
| `get_policy_signals` | Policy signals |
| `get_bond_maturity_calendar` | Bond maturity calendar |
| `get_public_contracts` | Public contracts |
| `get_credit_flow_signal` | Credit flow |
| `get_insider_signals` | Insider signals |
| `get_climate_risk_signals` | Climate risk |
| `get_energy_grid_signals` | Energy grid |
| `get_crisis_early_warning` | Crisis warning |
| `get_pharma_signals` | Pharma signals |
| `get_cron_health` | Scheduler health |
| `get_agent_work_log` | Agent work audit |
| `get_calibration_report` | Calibration report |
| `get_foreign_flow` | Foreign flow |
| `get_insider_transactions` | Insider transactions |

Token estimate: ~24k (40 × ~600)

---

## Always-On Tools (7)

Injected into every skill's resolved tool set regardless of skill selection.

| Tool | Reason |
|------|--------|
| `get_cycle_bootstrap` | Opening sequence for all agents — replaces 3 separate calls |
| `submit_feedback` | Error reporting — mandatory for all agents |
| `get_recent_fixes` | De-dup before bug reports — mandatory for all agents |
| `log_agent_work` | Work logging — mandatory for all agents |
| `send_telegram` | Reporting channel — required by most agents |
| `post_agent_signal` | Inter-agent coordination |
| `get_agent_signals` | Signal inbox |

---

## Unused Tools (not in any skill above)

These tools exist in `docs/data/tool-registry.json` but do not appear in any skill above. Candidates for deprecation review in Sprint 1302+.

| Tool | Category | Notes |
|------|----------|-------|
| `add_to_watchlist` | Watchlist | User-facing CLI only |
| `remove_from_watchlist` | Watchlist | User-facing CLI only |
| `update_thresholds` | Watchlist | User-facing CLI only |
| `get_analysis_history` | Alerts | Not in any agent list |
| `set_price_alert` | Price | User-facing CLI only |
| `get_price_history` | Price | In market_watcher above |
| `set_position` | Portfolio | User-facing CLI only |
| `close_position` | Portfolio | User-facing CLI only |
| `get_target_allocation` | Portfolio | Not in any agent list |
| `compare_financials` | Financial Reports | In digest_predict only |
| `get_broker_credibility` | Broker Intel | No agent assignment |
| `get_vps_service_health` | VPS Health & SLA | No agent assignment |
| `get_sla_status` | VPS Health & SLA | No agent assignment |
| `get_pipeline_health` | System & Ops | No agent assignment |
| `get_cascade_outcomes` | Observability | Not in any agent list |
| `get_unreviewed_market_messages` | Market Message Review | No agent assignment |
| `review_market_message` | Market Message Review | No agent assignment |
| `get_market_message_digest` | Market Message Review | No agent assignment |
| `batch_review_market_messages` | Market Message Review | No agent assignment |
| `get_ticker_intelligence` | Ticker Intelligence | No agent assignment |
| `get_technical_indicators` | Technical Analysis | No agent assignment |
| `get_memory_files` | Agent Memory | MCP tool-surface only |
| `search_memory_by_trigger` | Agent Memory | MCP tool-surface only |
| `append_session_record` | Agent Memory | MCP tool-surface only |
| `update_memory_file` | Agent Memory | MCP tool-surface only |
| `validate_signal_price` | Alerts | Shared tool, inline use |
