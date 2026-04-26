# Agent Memory — Session Log Only

Write-only audit trail. Agents append sessions after completing work.

## Structure

```
docs/agent-memory/
├── sessions/        ← append here after each task
│   ├── LATEST.md   ← most recent session summary
│   └── YYYY-MM-DD-{agent}.md
└── README.md
```

## How to write

Use MCP tool at end of work:
```
append_session_record({
  agent_name: "developer",
  task_name: "Task 1341a: ...",
  finding: "...",
  fix: "...",
  status: "Ready for QA"
})
```

## What NOT to do

- Do not read sessions as startup context — use handoff files and `get_cycle_bootstrap()` instead
- Do not create issues/, patterns/, or modules/ files — nobody reads them
