---
tool: get_pending_ask_questions
category: system
agents: [qa-responder]
---

# `get_pending_ask_questions`

**Category:** system | **Used by:** QA Responder
**Description:** Return up to 10 pending /ask questions from the ask_queue in FIFO order (oldest first).

## Parameters

None

## Returns

JSON array of up to 10 question objects, each containing:
- `id` — Row ID in ask_queue table
- `message` — The user's question text
- `received_at` — ISO 8601 timestamp when question was submitted

## Usage

```json
{
  "tool_name": "get_pending_ask_questions",
  "input": {}
}
```

## Notes

- Returns questions in FIFO order (oldest first)
- Used by 07-qa-responder agent to fetch its work queue
- Each question must be answered via `answer_ask_question` tool
