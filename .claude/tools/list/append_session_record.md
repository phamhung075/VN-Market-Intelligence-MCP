---
tool: append_session_record
category: system
agents: [all-agents]
---

# `append_session_record`

**Category:** system | **Used by:** All agents
**Description:** Append a work session record to agent's session file (creates if missing). Agent must provide task_name; other fields are optional.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| agent_name | enum (developer, qa, ops, architect, ba, po, system-auditor, news-scout, financial-analyst, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent) | ✅ | — | Agent identifier (e.g. developer, news-scout, ops) |
| task_name | string (≥1 char) | ✅ | — | Task identifier and name (e.g. 'Task 1300a: Memory Tools') |
| finding | string | ❌ | — | What was discovered or learned |
| fix | string | ❌ | — | What was implemented or fixed |
| status | string | ❌ | — | Current status (Ready for QA, etc.) |
| duration | string | ❌ | — | Time spent (HH:MM–HH:MM UTC format) |

## Returns

```
Skipped: task_name 'Task 1300a...' already recorded in 2026-05-05-developer.md
```

Or on success:

```
✅ Session record appended to 2026-05-05-developer.md
Path: sessions/2026-05-05-developer.md
Task: Task 1300a: Memory Tools
```

## Usage

```json
{
  "tool_name": "append_session_record",
  "input": {
    "agent_name": "developer",
    "task_name": "Task 1300a: Memory Tools",
    "finding": "Agents need MCP tool to update memory",
    "fix": "Created append_session_record tool",
    "status": "Ready for QA",
    "duration": "14:30–15:45"
  }
}
```

## Notes

- Creates or appends to sessions/YYYY-MM-DD-{agent_name}.md
- Validates agent name (must be from VALID_AGENTS list)
- Deduplicates: skips if task_name already recorded in today's file
- Returns file path written and confirmation
