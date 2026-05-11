---
tool: answer_ask_question
category: system
agents: [qa-responder]
---

# `answer_ask_question`

**Category:** system | **Used by:** QA Responder
**Description:** Record the answer to a pending /ask question and set its final status.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| id | number (positive integer) | ✅ | — | Row id of the ask_queue entry to answer |
| answer_text | string (1-10000 chars) | ✅ | — | The answer text, escalation note, or failure reason |
| status | enum (answered, escalated, failed) | ✅ | — | Terminal status: 'answered' = fully resolved, 'escalated' = needs human, 'failed' = could not process |

## Returns

JSON object:
```json
{
  "success": true,
  "id": 123,
  "newStatus": "answered"
}
```

## Usage

```json
{
  "tool_name": "answer_ask_question",
  "input": {
    "id": 42,
    "answer_text": "The answer to your question is...",
    "status": "answered"
  }
}
```

## Notes

- Status must be one of: 'answered' (fully resolved), 'escalated' (needs human), 'failed' (could not process)
- Answer text can include notes, escalation reasons, or failure diagnostics
- This tool finalizes a pending question — no further changes allowed
