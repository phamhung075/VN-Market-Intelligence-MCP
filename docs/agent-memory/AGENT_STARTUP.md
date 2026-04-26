# Agent Memory — Startup Protocol

**Do not read agent-memory at startup.** Use your task context instead:

- **Dev Team agents**: read `docs/handoffs/TASK_NNN.md` (PM provides everything needed)
- **Analysis Team agents**: call `get_cycle_bootstrap(agent_name)` MCP tool

---

## End of Work — Append Session Log

Call `append_session_record` MCP tool when your task is done:

```
append_session_record({
  agent_name: "developer",       // your agent name
  task_name: "Task 1341a: ...",  // task + short title
  finding: "...",                // optional: surprising discovery
  fix: "...",                    // optional: what you changed
  status: "Ready for QA",        // current state
  duration: "14:30–15:45 UTC"   // optional
})
```

Writes to: `docs/agent-memory/sessions/YYYY-MM-DD-{agent_name}.md`

---

## What no longer exists

`issues/`, `patterns/`, `modules/`, `manifests/` — all deleted 2026-04-26. Do not create them.
