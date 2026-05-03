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
```

Append — do not overwrite.

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
