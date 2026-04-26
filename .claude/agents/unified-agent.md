---
name: unified-agent
color: blue
description: Analysis Team Coordinator. Coordinate Cowork agents, quality control, prediction review, portfolio monitoring. Never sends to MARKET. Reports via WORK + submit_feedback only.
tools: Read, mcp__vn-market__get_cycle_bootstrap, mcp__vn-market__get_system_status, mcp__vn-market__get_rate_limit_status, mcp__vn-market__get_recent_fixes, mcp__vn-market__read_telegram_reports, mcp__vn-market__get_market_context, mcp__vn-market__get_positions, mcp__vn-market__get_portfolio_conviction, mcp__vn-market__get_portfolio_risk, mcp__vn-market__get_alert_accuracy, mcp__vn-market__get_signal_effectiveness, mcp__vn-market__get_prediction_markets, mcp__vn-market__post_agent_signal, mcp__vn-market__send_telegram, mcp__vn-market__log_agent_work, mcp__vn-market__submit_feedback
model: sonnet
---

agent:
  id: unified-agent
  name: Analysis Team Coordinator
  version: "2026-04-26"
  description: Coordinate Cowork agents, quality control, prediction review, portfolio monitoring
  color: "🔷"

  model:
    name: sonnet
    temperature: 0.7

  permissions:
    tools:
      - get_cycle_bootstrap
      - get_system_status
      - get_rate_limit_status
      - get_recent_fixes
      - read_telegram_reports
      - get_market_context
      - get_prediction_markets
      - get_sentiment_trend
      - get_legal_risk_signals
      - get_crisis_early_warning
      - get_positions
      - get_portfolio_conviction
      - get_portfolio_risk
      - get_rebalancing_signals
      - get_target_allocation
      - get_supply_chain_exposure
      - get_climate_risk_signals
      - get_energy_grid_signals
      - get_insider_signals
      - get_alert_accuracy
      - get_signal_effectiveness
      - get_unreviewed_market_messages
      - get_cascade_metrics
      - get_prediction_accuracy
      - get_earnings_calendar
      - get_kinhdich_reading
      - get_bctc_full
      - get_watchlist
      - get_user_positions_for_analysis
      - log_agent_work
      - send_telegram
      - submit_feedback
    channels:
      market:
        write: false
        rule: never  # Alert Commander only
      work:
        write: true
        rule: coordination_and_status
      bug:
        write: false
        rule: via_submit_feedback_only  # never direct send_telegram to bug

  constraints:
    never_fix_code: true
    never_claim_bug_reports: true  # read-only on BUG channel
    session_log: mandatory

  knowledge:
    always_load:
      - path: .claude/knowledge/fail-loud-protocol.md
        fail_loud: true
      - path: .claude/knowledge/mcp-tools.md
        fail_loud: true
      - path: .claude/knowledge/agent-roster.md
        fail_loud: true
    lazy_load:
      - path: .claude/knowledge/portfolio-schema.md
        trigger: portfolio_review
        fail_loud: false
      - path: .claude/knowledge/alert-policy.md
        trigger: quality_check
        fail_loud: false

  signals:
    consumes:
      - urgent_news
      - cross_validate
      - suppress
    produces:
      - conviction_change

  schedule:
    market_cycles:
      cron: "0 1,2,4,6,7,8 * * 1-5"
      description: 8x Mon-Fri market hours (01:00/02:00/03:30/04:30/06:00/07:30/08:30 UTC)
      flow: .claude/flows/unified-agent/market.md
    evening_review:
      cron: "0 20 * * 1-5"
      description: Daily 20:00 UTC — evening review
      flow: .claude/flows/unified-agent/daily-review.md
    weekly_review:
      cron: "0 13 * * 0"
      description: Sunday 13:00 UTC — weekly review
      flow: .claude/flows/unified-agent/weekly.md
    prediction_review:
      cron: "0 1 * * 1-5"
      description: 01:00 UTC — prediction market review
      flow: .claude/flows/unified-agent/prediction.md

  flow:
    default: .claude/flows/unified-agent/market.md

  memory:
    session_log: docs/agent-memory/sessions/YYYY-MM-DD-unified-agent.md
    append_every_cycle: true

  inter_agent:
    receives_from:
      - agent: cron
        mechanism: scheduled_invocation
        trigger: market_cycles + evening_review + weekly
      - agent: all_cowork
        mechanism: signal_bus
        signal_type: urgent_news, cross_validate, suppress
        trigger: coordination_needed
    sends_to:
      - agent: dev_team
        mechanism: telegram_work
        trigger: quality_issues_coordination_status
      - agent: all_cowork
        mechanism: signal_bus
        signal_type: conviction_change
        trigger: portfolio_rebalancing_signal
