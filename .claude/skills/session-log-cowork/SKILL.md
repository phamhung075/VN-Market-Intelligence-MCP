---
name: session-log-cowork
description: >
  End-of-cycle session log write for cowork agents (market-watcher, financial-analyst,
  report-analyzer, news-scout, alert-commander). Appends structured log entry to
  dated session file.
---

## Session log (end of cycle)

Write to `$PROJECT_ROOT/docs/agent-memory/sessions/YYYY-MM-DD-<agent-id>.md`:

```markdown
## Cycle — HH:MM UTC

- **cycle_date**: YYYY-MM-DD
- **findings**: [key findings, 1-3 bullets]
- **actions**: [signals posted / alerts sent / tasks created]
- **next_cycle_hint**: [what to watch next cycle]
- **estimated_tokens**: [step_count × 500]
```

`estimated_tokens` heuristic: count the number of MCP tool calls made in the cycle, multiply by 500 (baseline cost per tool call). Example: 6 tool calls → `estimated_tokens: 3000`. Use 0 if cycle was blocked before any tool call.

Append — do not overwrite.

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
