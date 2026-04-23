# MCP Tool Index — Sprint 1299

Total: 108 tools | 41 categories | Updated: 2026-04-23

Note: tool-registry.json `toolCount` field reads 107 (off-by-one stale). Actual category sum = 108. Live check: `curl -s http://127.0.0.1:3000/health | jq .toolCount`

Source: `docs/data/tool-registry.json`

---

## Agent Communication (4 tools)

| Tool | Description |
|------|-------------|
| `get_agent_signals` | Read pending inter-agent signals from inbox |
| `get_signal_effectiveness` | Report per-signal type success/suppression rates |
| `post_agent_signal` | Send typed signal to target agent |
| `record_signal_outcome` | Log fired/suppressed/confirmed/false_positive outcome |

## Agent Memory (4 tools)

| Tool | Description |
|------|-------------|
| `append_session_record` | Append structured record to agent memory session log |
| `get_memory_files` | Load agent memory files by agent name and task type |
| `search_memory_by_trigger` | Search agent memory index by trigger keyword |
| `update_memory_file` | Update an existing agent memory file with new content |

## Agent Work Log (2 tools)

| Tool | Description |
|------|-------------|
| `get_agent_work_log` | Retrieve recent agent work log entries for audit |
| `log_agent_work` | Record agent task completion with findings |

## Alert Management (2 tools)

| Tool | Description |
|------|-------------|
| `list_alert_rules` | List active price and signal alert rules |
| `manage_alert_mute` | Mute or unmute alerts for a specific ticker |

## Alerts (5 tools)

| Tool | Description |
|------|-------------|
| `get_alert_accuracy` | Report alert precision/recall by signal type |
| `get_alerts` | Fetch active alerts filtered by type |
| `get_analysis_history` | Retrieve past analysis runs for a ticker |
| `mark_alert_read` | Mark one or more alerts as read |
| `validate_signal_price` | Validate signal price against live snapshot within 5% tolerance |

## Analysis (3 tools)

| Tool | Description |
|------|-------------|
| `fetch_and_analyze` | Fetch news and run causal impact chain analysis |
| `run_impact_chain` | Execute global-to-stock causal chain for a catalyst |
| `search_similar_context` | Search RAG memory for semantically similar past analyses |

## Ask Queue (3 tools)

| Tool | Description |
|------|-------------|
| `answer_ask_question` | Post answer to a pending /ask user question |
| `get_pending_ask_questions` | Fetch unanswered user questions from /ask queue |
| `run_qa_responder` | Run full QA responder cycle for pending questions |

## Broker Intel (1 tool)

| Tool | Description |
|------|-------------|
| `get_broker_credibility` | Score broker research credibility by historical accuracy |

## Calibration (2 tools)

| Tool | Description |
|------|-------------|
| `get_calibration_report` | Report agent prediction calibration curve and Brier score |
| `get_label_accuracy_report` | Report label accuracy for QA signal classification |

## Capital Protection (3 tools)

| Tool | Description |
|------|-------------|
| `get_bond_maturity_calendar` | List upcoming corporate bond maturities for risk assessment |
| `get_legal_risk_signals` | Fetch prosecution, tax penalty, and regulatory risk signals |
| `get_policy_signals` | Fetch government policy change signals affecting markets |

## Climate + Energy (2 tools)

| Tool | Description |
|------|-------------|
| `get_climate_risk_signals` | Fetch climate event signals impacting VN agriculture and energy |
| `get_energy_grid_signals` | Fetch power grid capacity and electricity tariff signals |

## Comparison & Sector (4 tools)

| Tool | Description |
|------|-------------|
| `compare_stocks` | Compare financial and price metrics across multiple tickers |
| `get_correlation_matrix` | Compute price correlation matrix for a ticker set |
| `get_sector_rotation` | Detect capital rotation patterns across market sectors |
| `get_sentiment_trend` | Trend sentiment scores over time for a ticker or sector |

## Compound (3 tools)

| Tool | Description |
|------|-------------|
| `get_bctc_full` | Fetch full BCTC financial report with extraction and summary |
| `get_cycle_bootstrap` | Opening bootstrap: signals + market context + system status |
| `get_market_context` | Fetch combined macro, sector, and watchlist context |

## Crisis Radar (1 tool)

| Tool | Description |
|------|-------------|
| `get_crisis_early_warning` | Detect early warning signals for market or macro crises |

## Cron Health (1 tool)

| Tool | Description |
|------|-------------|
| `get_cron_health` | Report scheduler job health and last execution timestamps |

## Dev Team (4 tools)

| Tool | Description |
|------|-------------|
| `claim_telegram_report` | Claim ownership of a bug report from the Telegram bug channel |
| `log_fix` | Record a shipped fix with affected file and description |
| `process_telegram_report` | Process a claimed Telegram bug report to resolution |
| `read_telegram_reports` | Read unclaimed bug reports from the Telegram bug channel |

## Earnings (1 tool)

| Tool | Description |
|------|-------------|
| `get_earnings_calendar` | Fetch upcoming earnings announcement dates for watchlist tickers |

## Evidence & Prediction (3 tools)

| Tool | Description |
|------|-------------|
| `create_prediction_claim` | Create a trackable prediction with confidence and deadline |
| `get_evidence_summary` | Summarise evidence fragments supporting a thesis |
| `record_evidence_fragment` | Record a new evidence fragment tied to a thesis ID |

## Financial Reports (4 tools)

| Tool | Description |
|------|-------------|
| `compare_financials` | Compare financial ratios across quarters or fiscal years |
| `get_financial_summary` | Fetch financial KPI summary for a ticker from stored BCTC |
| `list_stored_pdfs` | List BCTC PDF reports available in local storage |
| `read_bctc_pdf` | Extract and read text from a stored BCTC PDF |

## Foreign Flow (1 tool)

| Tool | Description |
|------|-------------|
| `get_foreign_flow` | Fetch net foreign buy/sell flow for a ticker or market |

## Insider Transactions (1 tool)

| Tool | Description |
|------|-------------|
| `get_insider_transactions` | Fetch insider buy/sell transaction records for a ticker |

## Kinh Dich (6 tools)

| Tool | Description |
|------|-------------|
| `explain_hexagram` | Explain hexagram meaning in context of current market state |
| `get_hexagram_history` | Retrieve past hexagram readings and outcomes |
| `get_kinhdich_reading` | Get current Kinh Dich hexagram reading for market state |
| `get_market_hexagram` | Map market technical state to a Kinh Dich hexagram |
| `get_transition_probabilities` | Compute hexagram-to-hexagram transition probability matrix |
| `run_hexagram_backtest` | Backtest hexagram signals against historical price data |

## Macro (1 tool)

| Tool | Description |
|------|-------------|
| `get_macro_snapshot` | Fetch macro indicators: GDP, CPI, VND/USD, SBV rate |

## Macro Catalyst (3 tools)

| Tool | Description |
|------|-------------|
| `get_credit_flow_signal` | Fetch bank credit flow signals for sector exposure analysis |
| `get_insider_signals` | Fetch insider trading pattern signals for watchlist tickers |
| `get_public_contracts` | Fetch public procurement contract signals for construction sector |

## Market (2 tools)

| Tool | Description |
|------|-------------|
| `get_market_snapshot` | Fetch real-time HOSE/HNX/UPCOM index and top movers |
| `get_patterns` | Detect technical chart patterns for a ticker |

## Market Message Review (4 tools)

| Tool | Description |
|------|-------------|
| `batch_review_market_messages` | Batch review multiple market messages with accept/reject verdicts |
| `get_market_message_digest` | Fetch digest of reviewed market messages for a date range |
| `get_unreviewed_market_messages` | List market messages pending human or agent review |
| `review_market_message` | Submit accept/reject/escalate verdict for a market message |

## Observability (3 tools)

| Tool | Description |
|------|-------------|
| `get_cascade_metrics` | Report causal chain execution metrics and latency |
| `get_cascade_outcomes` | Retrieve causal chain outcome records for accuracy analysis |
| `get_recent_fixes` | List recently shipped fixes to avoid duplicate bug reports |

## Performance (1 tool)

| Tool | Description |
|------|-------------|
| `get_performance_attribution` | Break down portfolio return by factor and holding period |

## Pharma Radar (1 tool)

| Tool | Description |
|------|-------------|
| `get_pharma_signals` | Fetch drug approval, import-export, and pricing signals |

## Portfolio (8 tools)

| Tool | Description |
|------|-------------|
| `close_position` | Close an open position and record exit price |
| `get_portfolio_conviction` | Score portfolio positions by current conviction level |
| `get_portfolio_risk` | Compute portfolio-level risk metrics and drawdown estimates |
| `get_positions` | List all open portfolio positions with entry price and size |
| `get_rebalancing_signals` | Generate rebalancing signals based on target allocation drift |
| `get_target_allocation` | Fetch target sector and asset class allocation weights |
| `get_user_positions_for_analysis` | Fetch user positions formatted for analysis agent consumption |
| `set_position` | Open or update a portfolio position with conviction score |

## Prediction Markets (2 tools)

| Tool | Description |
|------|-------------|
| `get_prediction_accuracy` | Report agent prediction accuracy by category and time window |
| `get_prediction_markets` | Fetch active prediction market contracts for VN stocks |

## Price (3 tools)

| Tool | Description |
|------|-------------|
| `delete_price_alert` | Delete an existing price alert by alert ID |
| `get_price_history` | Fetch OHLCV price history for a ticker and date range |
| `set_price_alert` | Create a price alert with target level and direction |

## Sector Context (2 tools)

| Tool | Description |
|------|-------------|
| `get_open_chain_findings` | Fetch open causal chain findings pending confirmation |
| `get_sector_comparison` | Compare sector-level performance and valuation metrics |

## Summaries (2 tools)

| Tool | Description |
|------|-------------|
| `generate_market_summary` | Generate and store a new market summary for current session |
| `get_market_summary` | Fetch the most recent stored market summary |

## Supply Chain (1 tool)

| Tool | Description |
|------|-------------|
| `get_supply_chain_exposure` | Map ticker supply chain exposure to global commodity risks |

## System & Ops (4 tools)

| Tool | Description |
|------|-------------|
| `get_pipeline_health` | Report data pipeline ingestion health and lag metrics |
| `get_rate_limit_status` | Report per-host rate limiter state and quota remaining |
| `get_system_status` | Fetch system health: services, DB, cache, scheduler status |
| `submit_feedback` | Submit error or feedback to the work channel for dev team |

## Technical Analysis (1 tool)

| Tool | Description |
|------|-------------|
| `get_technical_indicators` | Compute RSI, MACD, Bollinger Bands for a ticker |

## Telegram (2 tools)

| Tool | Description |
|------|-------------|
| `send_alert_digest` | Send formatted alert digest to the market Telegram channel |
| `send_telegram` | Send message to market, work, or bug Telegram channel |

## Ticker Intelligence (1 tool)

| Tool | Description |
|------|-------------|
| `get_ticker_intelligence` | Fetch aggregated intelligence profile for a ticker |

## VPS Health & SLA (3 tools)

| Tool | Description |
|------|-------------|
| `get_sla_status` | Report VPS service SLA compliance and uptime percentage |
| `get_vps_proxy_health` | Check VPS proxy connectivity and geo-unblock status |
| `get_vps_service_health` | Fetch health status of all 5 VPS systemd services |

## Watchlist (4 tools)

| Tool | Description |
|------|-------------|
| `add_to_watchlist` | Add a ticker to the user watchlist with alert thresholds |
| `get_watchlist` | Fetch current watchlist with tickers and threshold settings |
| `remove_from_watchlist` | Remove a ticker from the user watchlist |
| `update_thresholds` | Update price or volume alert thresholds for a watchlist ticker |
