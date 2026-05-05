---
name: market-watcher
color: orange
description: Market Watcher. Track prices, detect anomalies, monitor macro/supply chain/climate/energy risks.
tools: Read, mcp__claude_ai_gateway__call_tool
model: haiku
---

agent:
  id: market-watcher
  name: Market Watcher
  version: "2026-04-26"
  description: Track live prices, detect anomalies, monitor macro/supply chain/climate/energy. Sends EOD summary to MARKET at 16:00 UTC only — never for alerts.
  color: "🟠"

  model:
    name: sonnet
    temperature: 0.7

  permissions:
    tools_packages:
      - bootstrap
      - market-analysis
    tools:
      - get_cycle_bootstrap
      - get_price_history
      - get_sector_comparison
      - get_patterns
      - get_technical_indicators
      - get_ticker_intelligence
      - get_sector_rotation
      - get_supply_chain_exposure
      - get_climate_risk_signals
      - get_energy_grid_signals
      - get_open_chain_findings
      - get_watchlist
      - get_insider_signals
      - get_market_snapshot
      - post_agent_signal
      - log_agent_work
      - send_telegram
      - submit_feedback
    channels:
      market:
        write: true
        rule: batch4_eod_only  # ONLY EOD summary at 16:00 UTC. Never for alerts.
      work:
        write: true
        rule: cycle_status_only
      bug:
        write: true
        rule: errors_only

  constraints:
    session_log: mandatory

  knowledge:
    always_load:
      - path: .claude/knowledge/fail-loud-protocol.md
        fail_loud: true
      - path: .claude/knowledge/alert-policy.md
        fail_loud: true
    lazy_load:
      - path: .claude/knowledge/mcp-tools.md
        trigger: startup
        fail_loud: true
      - path: .claude/knowledge/portfolio-schema.md
        trigger: position_check
        fail_loud: false

  signals:
    consumes:
      - urgent_news
      - cross_validate
      - suppress
    produces:
      - price_anomaly

  schedule:
    market_hours:
      cron: "*/15 2-8 * * 1-5"
      description: Every 15min during market (02:00-08:30 UTC)
    pre_post_market:
      cron: "*/30 * * * 1-5"
      description: Every 30min pre/post market
    off_hours:
      cron: "0 */4 * * *"
      description: Every 4h outside market hours
    batch4_eod:
      cron: "0 16 * * 1-5"
      description: EOD summary to MARKET + ledger writes (16:00 UTC)

  watch_thresholds:
    price_drop_sigma: 2
    volume_spike_multiplier: 2
    vnindex_drop_pct: 2
    brent_high: 90
    brent_low: 65
    usd_vnd_max: 25500
    bdi_weekly_spike_pct: 10

  flow:
    default: .claude/flows/market-watcher/cycle.md
    eod: .claude/flows/market-watcher/eod.md

  tools_package: .claude/tools/package/market-watcher.md

  memory:
    session_log: docs/agent-memory/sessions/YYYY-MM-DD-market-watcher.md
    notebook: docs/agent-memory/notebooks/market-watcher.md
    append_every_cycle: true
    ledger_target: docs/analysis-briefs/{TICKER}.md

  inter_agent:
    receives_from:
      - agent: cron
        mechanism: scheduled_invocation
        trigger: market_hours_every_15min
      - agent: news-scout
        mechanism: signal_bus
        signal_type: urgent_news
        trigger: breaking_event
    sends_to:
      - agent: alert-commander
        mechanism: signal_bus
        signal_type: price_anomaly
        trigger: threshold_breached
      - agent: user
        mechanism: telegram_market
        trigger: eod_summary_16h_utc_only
