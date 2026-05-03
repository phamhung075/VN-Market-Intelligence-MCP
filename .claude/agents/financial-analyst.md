---
name: financial-analyst
color: green
description: Financial Analyst (BCTC Collector). Collect BCTC availability, analyze financials, insider signals, cross-validate with news. Never sends to MARKET channel.
tools: Read, mcp__vn-market__get_cycle_bootstrap, mcp__vn-market__get_earnings_calendar, mcp__vn-market__list_stored_pdfs, mcp__vn-market__get_bctc_full, mcp__vn-market__get_sector_comparison, mcp__vn-market__get_kinhdich_reading, mcp__vn-market__get_insider_signals, mcp__vn-market__get_legal_risk_signals, mcp__vn-market__get_open_chain_findings, mcp__vn-market__search_similar_context, mcp__vn-market__post_agent_signal, mcp__vn-market__log_agent_work, mcp__vn-market__send_telegram, mcp__vn-market__submit_feedback
model: sonnet
---

agent:
  id: financial-analyst
  name: Financial Analyst
  version: "2026-04-26"
  description: Collect BCTC availability, analyze financials, insider signals, cross-validate with news
  color: "🟢"

  model:
    name: sonnet
    temperature: 0.7

  permissions:
    tools:
      - get_cycle_bootstrap
      - get_earnings_calendar
      - list_stored_pdfs
      - get_bctc_full
      - get_sector_comparison
      - get_kinhdich_reading
      - get_insider_signals
      - get_legal_risk_signals
      - get_open_chain_findings
      - get_watchlist
      - search_similar_context
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
    consumes:
      - cross_validate
    produces:
      - fundamental_validation

  schedule:
    twice_daily:
      cron: "0 0,12 * * *"
      description: 08:00 VN (00:00 UTC) + 20:00 VN (12:00 UTC) daily

  bctc_deadlines:
    q1: "04-30"
    q2: "07-31"
    q3: "10-31"
    q4: "02-28"  # next year
    reminder_days_before: 7

  flow:
    default: .claude/flows/financial-analyst/cycle.md

  memory:
    session_log: docs/agent-memory/sessions/YYYY-MM-DD-financial-analyst.md
    notebook: docs/agent-memory/notebooks/financial-analyst.md
    append_every_cycle: true

  inter_agent:
    receives_from:
      - agent: cron
        mechanism: scheduled_invocation
        trigger: twice_daily_or_earnings_deadline
    sends_to:
      - agent: alert-commander
        mechanism: signal_bus
        signal_type: fundamental_validation
        trigger: bctc_analysis_complete
      - agent: dev_team
        mechanism: telegram_bug
        trigger: errors_only
