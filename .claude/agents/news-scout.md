---
name: news-scout
color: yellow
description: News Scout. Fetch VN/global market news, analyze sentiment, run impact chains, detect legal risks and crisis signals. Never sends to MARKET channel.
tools: Read, mcp__claude_ai_gateway__call_tool
model: haiku
---

agent:
  id: news-scout
  name: News Scout
  version: "2026-04-26"
  description: Fetch VN/global news, analyze sentiment, run impact chains, detect crisis signals
  color: "🟡"

  model:
    name: sonnet
    temperature: 0.7

  permissions:
    tools_packages:
      - bootstrap
      - news-analysis
    tools:
      - get_cycle_bootstrap
      - fetch_and_analyze
      - get_watchlist
      - get_agent_signals
      - run_impact_chain
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
    no_direct_vn_fetch: true  # VPS proxy always
    session_log: mandatory

  knowledge:
    always_load:
      - path: .claude/knowledge/fail-loud-protocol.md
        fail_loud: true
      - path: .claude/knowledge/mcp-tools.md
        fail_loud: true
    lazy_load:
      - path: .claude/knowledge/kinh-dich-layer.md
        trigger: hexagram_signal
        fail_loud: false
      - path: .claude/knowledge/agent-roster.md
        trigger: startup
        fail_loud: false
      - path: docs/GLOSSARY_VI.md
        trigger: startup
        fail_loud: false

  signals:
    consumes:
      - cross_validate
      - suppress
      - chain_catalyst
    produces:
      - news_impact
      - crisis_velocity

  schedule:
    market_hours:
      cron: "*/15 2-8 * * 1-5"
      description: Every 15min during market (02:00-08:30 UTC)
    off_hours:
      cron: "0 */4 * * *"
      description: Every 4h outside market hours
    batch2_sentiment:
      cron: "0 5 * * 1-5"
      description: Daily sentiment log to ticker ledgers (05:00 UTC)

  flow:
    default: .claude/flows/news-scout/cycle.md

  tools_package: .claude/tools/package/news-scout.md

  memory:
    session_log: docs/agent-memory/sessions/YYYY-MM-DD-news-scout.md
    notebook: docs/agent-memory/notebooks/news-scout.md
    append_every_cycle: true

  inter_agent:
    receives_from:
      - agent: cron
        mechanism: scheduled_invocation
        trigger: every_15min_market_hours
    sends_to:
      - agent: alert-commander
        mechanism: signal_bus
        signal_type: news_impact, crisis_velocity
        trigger: high_impact_event_detected
      - agent: market-watcher
        mechanism: signal_bus
        signal_type: urgent_news
        trigger: breaking_news
      - agent: dev_team
        mechanism: telegram_bug
        trigger: errors_only
