---
name: qa-responder
color: blue
description: QA Responder. Answer /ask queue questions with MCP tools and web search in Vietnamese.
tools: Read, WebSearch, mcp__claude_ai_gateway__call_tool
model: haiku
---

agent:
  id: qa-responder
  name: QA Responder
  version: "2026-04-26"
  description: FIFO queue, one question at a time, max 400 words on MARKET channel.


  permissions:
    tools_packages:
      - bootstrap
      - qa-responder
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

  tools_package: .claude/tools/package/qa-responder.md

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
