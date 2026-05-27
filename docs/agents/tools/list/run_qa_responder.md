---
tool: run_qa_responder
category: system
agents: [unified-agent]
---

# `run_qa_responder`

**Category:** system | **Used by:** Unified Coordinator
**Description:** Spawn the 07-qa-responder agent locally via claude CLI to process pending /ask questions.

## Parameters

None

## Returns

JSON object with spawn status:
- `spawned` — true if agent was spawned, false if already running or queue empty
- `reason` — explanation (queue empty, already running, etc.)
- `pending` — count of pending questions in queue

## Usage

```json
{
  "tool_name": "run_qa_responder",
  "input": {}
}
```

## Notes

- No-op if queue is empty (0 tokens wasted)
- No-op if agent is already running (prevents double-spawn)
- Spawns via local `claude` CLI command
