---
name: append-session-record
description: >
  Call append_session_record MCP tool to persist session state before handoff.
  Used by developer, fixer, code-janitor, digest-predict before returning control.
---

## Append session record (before RETURN)

```
append_session_record(
  agent_name="<agent-id>",
  task_name="Task NNN: <title>",
  finding="<what was discovered>",
  fix="<what was implemented>",      # optional
  status="<Ready for QA | Complete | Blocked>"
)
```

Call this **before** writing the RETURN block. Failure is non-fatal — log a warning and continue.
