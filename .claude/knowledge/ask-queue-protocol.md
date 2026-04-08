# /ask Queue Protocol — User Question FIFO

**When to read this file:** When implementing or reviewing the /ask queue, QA Responder agent (07), `askQueueCheck` cron job, or `user_requests` DB table. Load only when your task touches user question handling, async answers, or the FIFO queue flow.

---

## Flow Overview

```
User sends /ask <question> or /why <TICKER>
        ↓
Server inserts row into user_requests table (status="pending")
        ↓
askQueueCheck cron (every 12 min)
        ↓
QA Responder agent (07) calls get_user_requests(status="pending")
        ↓
Process FIFO — one question at a time
        ↓
Answer posted to MARKET channel as reply
        ↓
mark_user_request_answered(id)
```

---

## DB Table: user_requests

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| question | TEXT | Full user message after /ask or /why |
| ticker | TEXT | Extracted ticker if /why command, else NULL |
| status | TEXT | "pending" / "answered" / "deferred" |
| created_at | DATETIME | When question was received |
| answered_at | DATETIME | When answer was sent |
| answer_preview | TEXT | First 200 chars of answer (for audit) |

---

## askQueueCheck Cron

- Schedule: every 12 minutes (`*/12 * * * *`)
- File: `src/scheduler/askQueueCheckJob.ts`
- Registered in: `src/scheduler/jobs.ts`
- What it does: calls `get_user_requests(status="pending")` → if any → triggers QA Responder agent

---

## QA Responder Agent (07) Processing Rules

1. **FIFO**: process oldest pending question first
2. **Tools available**: any MCP tool needed for the answer (see `.claude/knowledge/mcp-tools.md` for QA Responder tool list)
3. **Answer format**: plain Vietnamese text, clear and actionable
4. **Reply in MARKET channel**: `send_telegram(channel="market", message=...)`
5. **Mark done**: call `mark_user_request_answered(id)` immediately after sending answer
6. **Never re-answer**: once answered, skip in all future cycles
7. **One question per cycle**: do not batch-answer; process one per cron tick

---

## Long-Running Question Protocol

If a question requires >10 min of reasoning (complex multi-stock analysis, full BCTC deep-dive, prediction scenario modeling):

1. Mark question as "deferred" via `mark_user_request_answered(id, status="deferred")`
2. Send paste-ready prompt to MARKET channel:

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

## MCP Tools for Queue

| Tool | Used by |
|------|---------|
| `get_user_requests(status)` | askQueueCheckJob, QA Responder |
| `mark_user_request_answered(id, status?)` | QA Responder |

---

## Answer Storage for Audit

`answer_preview` column stores first 200 chars of every answer sent.
Full answers are in Telegram message history (MARKET channel).
Dev Team can query answered questions via `get_user_requests(status="answered")`.

---

## Channel Routing

- User question received: MARKET channel
- Answer sent: MARKET channel (same thread as original message if possible)
- QA Responder does NOT send to WORK or BUG
- If QA Responder hits an error answering: file via `submit_feedback` to BUG channel
