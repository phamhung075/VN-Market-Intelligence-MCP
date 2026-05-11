# /ask Queue Protocol

**Load when:** implementing /ask queue, `07-qa-responder`, `askQueueCheck` cron, or `ask_queue` DB table.

## Flow

```
/ask <question> (Telegram) → ask_queue row (status="pending")
→ askQueueCheck cron (*/12 min, src/scheduler/askQueueCheckJob.ts)
→ post_agent_signal(to="07-qa-responder", signal_type="pending_questions")
→ 07-qa-responder: get_pending_ask_questions() → FIFO, one at a time
→ send_telegram(channel="market", message=<answer>)
→ answer_ask_question(id, answer_text, status="answered"|"escalated"|"failed")
```

## DB Table: ask_queue

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | PK |
| question | TEXT | Full text after /ask |
| ticker | TEXT | Extracted ticker or NULL |
| status | TEXT | pending / processing / answered / escalated / failed |
| created_at | DATETIME | Received time |
| answered_at | DATETIME | Terminal status time |
| answer_text | TEXT | Answer, escalation prompt, or failure reason |

## askQueueCheck Cron

- Schedule: `*/12 * * * *` | File: `src/scheduler/askQueueCheckJob.ts`
- If `get_pending_ask_questions()` non-empty → `post_agent_signal(to_agent="07-qa-responder", signal_type="pending_questions")`

## 07-qa-responder Rules

1. FIFO — oldest pending first
2. One question per iteration, never batch
3. Kinh Dich mandatory for stock questions — call `get_kinhdich_reading(ticker)`
4. Use any relevant MCP tool + `WebSearch` for live/foreign context
5. Answer: concise Vietnamese, max ~400 words, actionable, with citations
6. `send_telegram(channel="market", <answer>)` — documented MARKET exception
7. `answer_ask_question(id, answer_text, status="answered")` immediately after send
8. Never re-answer a terminal-status row

## Long-Running Protocol (>10 min reasoning)

1. Do NOT block the queue
2. Compose paste-ready prompt for user to run in fresh session
3. `answer_ask_question(id, answer_text=<paste_prompt>, status="escalated")`
4. `send_telegram(channel="market")` with Vietnamese explanation + paste prompt inline

Escalation template:
```
Câu hỏi "{question_preview}" cần phân tích sâu hơn 10 phút.
Để nhận phân tích đầy đủ, hãy mở một session mới với prompt sau:
---
Phân tích câu hỏi: "{question}"
Context:
- Danh mục theo dõi: {watchlist}
- Vị thế hiện tại: {positions}
- Dữ liệu thị trường: {market_context_summary}
Yêu cầu: phân tích đầy đủ, không giới hạn thời gian.
---
```

## Failure Protocol

1. `answer_ask_question(id, answer_text=<reason>, status="failed")`
2. `submit_feedback(severity="high", title="/ask processing failed", agent="07-qa-responder")` → BUG
3. Do NOT guess or post partial answer to MARKET

## MCP Tools

| Tool | Used by |
|------|---------|
| `get_pending_ask_questions` | askQueueCheckJob + 07-qa-responder |
| `answer_ask_question` | 07-qa-responder |

Terminal status values: `"answered"`, `"escalated"`, `"failed"`

## Channel Routing

- User question in → MARKET | Answer out → MARKET (documented exception)
- 07-qa-responder never posts to WORK except fail-loud notices
- Errors → BUG via `submit_feedback`
- Fallback: if 07-qa-responder down or signals unacknowledged >30 min → `unified-agent.md` handles with same protocol
