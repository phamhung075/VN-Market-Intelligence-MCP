# /ask Queue Protocol — User Question FIFO

**When to read this file:** When implementing or reviewing the /ask queue, the `07-qa-responder` Cowork agent, the `askQueueCheck` cron job, or the `ask_queue` DB table. Load only when your task touches user question handling, async answers, or the FIFO queue flow.

---

## Flow Overview

```
User sends /ask <question>  (Telegram bot command)
        ↓
Server inserts row into ask_queue table (status="pending")
        ↓
askQueueCheck cron (every 12 min)  — src/scheduler/askQueueCheckJob.ts
        ↓
post_agent_signal(to="07-qa-responder", signal_type="pending_questions")
        ↓
07-qa-responder wakes → get_pending_ask_questions()
        ↓
Process FIFO — one question at a time
        ↓
send_telegram(channel="market", message=<answer>)
        ↓
answer_ask_question(id, answer_text, status="answered" | "escalated" | "failed")
```

---

## DB Table: ask_queue

| Column        | Type     | Description                                        |
|---------------|----------|----------------------------------------------------|
| id            | INTEGER  | Primary key                                        |
| question      | TEXT     | Full user message after /ask                       |
| ticker        | TEXT     | Extracted ticker if detected, else NULL            |
| status        | TEXT     | "pending" / "processing" / "answered" / "escalated" / "failed" |
| created_at    | DATETIME | When question was received                         |
| answered_at   | DATETIME | When terminal status was set                       |
| answer_text   | TEXT     | Full answer body (or escalation prompt / failure reason) |

---

## askQueueCheck Cron

- Schedule: every 12 minutes (`*/12 * * * *`)
- File: `src/scheduler/askQueueCheckJob.ts`
- Registered in: `src/scheduler/jobs.ts`
- Behaviour: if `get_pending_ask_questions()` returns a non-empty list → `post_agent_signal(to_agent="07-qa-responder", signal_type="pending_questions")`.

---

## 07-qa-responder Processing Rules

1. **FIFO**: oldest `pending` row first.
2. **One at a time**: never batch-answer. One question per iteration.
3. **Kinh Dịch mandatory** for stock-specific questions — always call `get_kinhdich_reading(ticker)`.
4. **Tools**: any MCP tool relevant to the question (`get_market_context`, `fetch_and_analyze`, `get_bctc_full`, etc.) plus `WebSearch` for live/foreign context.
5. **Answer format**: concise Vietnamese, max ~400 words, actionable, with citations (MCP tool name or URL).
6. **Send**: `send_telegram(channel="market", message=<answer>)` — this is the DOCUMENTED EXCEPTION to Alert Commander's MARKET exclusivity.
7. **Mark done**: `answer_ask_question(id, answer_text=<full>, status="answered")` immediately after sending.
8. **Never re-answer** a row once its status is terminal.

---

## Long-Running Question Protocol ( > 10 min reasoning )

If a question clearly requires > 10 minutes of reasoning (deep multi-stock analysis, full BCTC deep-dive, scenario modelling):

1. Do NOT block the queue.
2. Compose a paste-ready prompt the user can run in a fresh session.
3. `answer_ask_question(id, answer_text=<paste_ready_prompt>, status="escalated")`.
4. `send_telegram(channel="market", message=...)` with a short Vietnamese explanation of why it was escalated and the paste-ready prompt inline.

Template:
```
Câu hỏi "{question_preview}" cần phân tích sâu hơn 10 phút.
Để nhận phân tích đầy đủ, hãy mở một session mới với prompt sau:

---
[PASTE-READY PROMPT]
Phân tích câu hỏi: "{question}"
Context:
- Danh mục theo dõi: {watchlist}
- Vị thế hiện tại: {positions}
- Dữ liệu thị trường: {market_context_summary}
Yêu cầu: phân tích đầy đủ, không giới hạn thời gian.
---
```

---

## Failure Protocol

If processing cannot complete (MCP unreachable, tool error, irrecoverable parse failure):
1. `answer_ask_question(id, answer_text=<failure_reason>, status="failed")`.
2. `submit_feedback(severity="high", title="/ask processing failed", detail=..., agent="07-qa-responder")` → BUG channel.
3. Do NOT guess an answer. Do NOT post a partial answer to MARKET.

---

## MCP Tools for the Queue

| Tool                          | Used by                           |
|-------------------------------|-----------------------------------|
| `get_pending_ask_questions`   | askQueueCheckJob, 07-qa-responder |
| `answer_ask_question`         | 07-qa-responder                   |

Terminal `status` values accepted by `answer_ask_question`: `"answered"`, `"escalated"`, `"failed"`.

---

## Channel Routing

- User question received: MARKET channel (via Telegram bot `/ask` handler).
- Answer sent: MARKET channel (documented exception to Alert Commander exclusivity).
- 07-qa-responder never posts to WORK except for fail-loud knowledge-load notices.
- Errors and bug reports: BUG channel via `submit_feedback`.

---

## Fallback

If 07-qa-responder is down or `pending_questions` signals remain unacknowledged > 30 min, `unified-agent.md` is the fallback handler and follows the same protocol.
