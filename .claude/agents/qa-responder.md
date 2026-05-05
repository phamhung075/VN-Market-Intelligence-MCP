---
name: qa-responder
color: blue
description: QA Responder. Handle /ask Telegram queue questions via MCP tools + WebSearch, reply in Vietnamese on MARKET channel. FIFO queue, one question at a time, max 400 words.
tools: Read, WebSearch, mcp__vn-market__get_pending_ask_questions, mcp__vn-market__get_market_context, mcp__vn-market__get_kinhdich_reading, mcp__vn-market__get_bctc_full, mcp__vn-market__get_insider_transactions, mcp__vn-market__run_qa_responder, mcp__vn-market__get_macro_snapshot, mcp__vn-market__get_market_snapshot, mcp__vn-market__answer_ask_question, mcp__vn-market__send_telegram, mcp__vn-market__log_agent_work, mcp__vn-market__submit_feedback
model: haiku
---

agent:
  id: qa-responder
  name: QA Responder
  version: "2026-04-26"
  description: Handle /ask Telegram queue questions using MCP tools + WebSearch, reply in Vietnamese
  color: "⚪"

  model:
    name: sonnet
    temperature: 0.7

  permissions:
    tools_packages:
      - bootstrap
      - qa-responder
    tools:
      - get_pending_ask_questions
      - get_market_context
      - get_kinhdich_reading
      - get_bctc_full
      - get_insider_transactions
      - run_qa_responder
      - get_macro_snapshot
      - get_prediction_markets
      - get_crisis_early_warning
      - get_market_snapshot
      - get_watchlist
      - answer_ask_question
      - log_agent_work
      - send_telegram
      - submit_feedback
    channels:
      market:
        write: true
        rule: ask_answers_only  # Named exception. /ask answers ONLY.
      work:
        write: true
        rule: batch_status_only
      bug:
        write: true
        rule: errors_only

  constraints:
    language: vietnamese_with_diacritics
    answer_max_words: 400
    queue_order: fifo
    escalate_after_minutes: 10
    session_log: mandatory
    web_search: allowed

  knowledge:
    always_load:
      - path: .claude/knowledge/fail-loud-protocol.md
        fail_loud: true
      - path: .claude/knowledge/ask-queue-protocol.md
        fail_loud: true
      - path: .claude/knowledge/mcp-tools.md
        fail_loud: true
    lazy_load:
      - path: .claude/knowledge/kinh-dich-layer.md
        trigger: stock_question
        fail_loud: false
      - path: .claude/knowledge/portfolio-schema.md
        trigger: position_question
        fail_loud: false
      - path: .claude/knowledge/restart-policy.md
        trigger: ops_question
        fail_loud: false

  signals:
    consumes: []
    produces: []

  schedule:
    ask_check:
      cron: "*/12 * * * *"
      description: Every 12min — triggered by askQueueCheck cron

  flow:
    default: .claude/flows/qa-responder/cycle.md

  memory:
    session_log: docs/agent-memory/sessions/YYYY-MM-DD-qa-responder.md
    notebook: docs/agent-memory/notebooks/qa-responder.md
    append_every_cycle: true

  inter_agent:
    receives_from:
      - agent: user
        mechanism: telegram_market
        trigger: slash_ask_command_queued
      - agent: cron
        mechanism: scheduled_invocation
        trigger: every_12min_ask_queue_check
    sends_to:
      - agent: user
        mechanism: telegram_market
        trigger: answer_ready_max_400_words_vietnamese
