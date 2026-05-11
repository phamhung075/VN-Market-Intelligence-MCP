# Agent Memory — Session Index

> Sessions only. Issues/patterns/modules removed — write-only, never read.

## Recent Sessions

- **[LATEST](sessions/LATEST.md)** — most recent session
- **[2026-04-26 Alert Commander](sessions/2026-04-26-alert-commander.md)**
- **[2026-04-26 Developer](sessions/2026-04-26-developer.md)**
- **[2026-04-26 QA](sessions/2026-04-26-qa.md)**
- **[2026-04-26 Ops](sessions/2026-04-26-ops.md)**

## Write Protocol

End of every work session → `append_session_record(agent_name, task_name, ...)` via MCP tool.
