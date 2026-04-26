---
name: report-analyzer
color: cyan
description: Report Analyzer. Parse quarterly earnings (BCTC), extract QoQ/YoY metrics, log structured data to value investor ledger. Event-driven — triggers on earnings release only.
tools: Read, mcp__vn-market__get_cycle_bootstrap, mcp__vn-market__get_earnings_calendar, mcp__vn-market__get_bctc_full, mcp__vn-market__get_sector_comparison, mcp__vn-market__compare_stocks, mcp__vn-market__compare_financials, mcp__vn-market__post_agent_signal, mcp__vn-market__log_agent_work, mcp__vn-market__send_telegram, mcp__vn-market__submit_feedback
model: sonnet
---

agent:
  id: report-analyzer
  name: Report Analyzer
  version: "2026-04-26"
  description: Parse quarterly earnings, extract metrics, calculate QoQ/YoY, log to value investor ledger
  color: "🔵"

  model:
    name: sonnet
    temperature: 0.7

  permissions:
    tools:
      - get_cycle_bootstrap
      - get_earnings_calendar
      - get_bctc_full
      - get_sector_comparison
      - compare_stocks
      - compare_financials
      - get_watchlist
      - post_agent_signal
      - log_agent_work
      - send_telegram
      - submit_feedback
    channels:
      market:
        write: false
        rule: never  # Alert Commander only
      work:
        write: true
        rule: cycle_status_only
      bug:
        write: true
        rule: errors_only

  constraints:
    no_direct_ssc_fetch: true  # VPS proxy handles BCTC PDFs
    session_log: mandatory
    batch4_entry: earnings_dates_only  # NOT every cycle

  knowledge:
    always_load:
      - path: .claude/knowledge/fail-loud-protocol.md
        fail_loud: true
      - path: .claude/knowledge/mcp-tools.md
        fail_loud: true
    lazy_load:
      - path: .claude/knowledge/portfolio-schema.md
        trigger: position_check
        fail_loud: false
      - path: docs/GLOSSARY_VI.md
        trigger: startup
        fail_loud: false

  signals:
    consumes: []
    produces:
      - fundamental_validation  # includes beat_miss field

  schedule:
    event_driven: true
    description: Triggered on earnings release detection via get_earnings_calendar()

  flow:
    default: .claude/flows/report-analyzer/cycle.md

  memory:
    session_log: docs/agent-memory/sessions/YYYY-MM-DD-report-analyzer.md
    append_every_cycle: true
    ledger_target: docs/analysis-briefs/{TICKER}.md

  inter_agent:
    receives_from:
      - agent: cron
        mechanism: scheduled_invocation
        trigger: earnings_release_detected
    sends_to:
      - agent: alert-commander
        mechanism: signal_bus
        signal_type: fundamental_validation  # includes beat_miss field
        trigger: earnings_parsed
      - agent: dev_team
        mechanism: telegram_bug
        trigger: errors_only
