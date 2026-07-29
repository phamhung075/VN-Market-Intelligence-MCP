---
name: session-log-cowork
description: >
  End-of-cycle memory write for cowork agents. Appends structured cycle summary
  to the agent's notebook and commits it.
---

## End-of-cycle memory write

Append cycle summary to `$PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md`:

```markdown
## Cycle — HH:MM UTC

- **cycle_date**: YYYY-MM-DD
- **findings**: [key findings, 1-3 bullets]
- **actions**: [signals posted / alerts sent / tasks created]
- **next_cycle_hint**: [what to watch next cycle]
- **estimated_tokens**: [step_count × 500]
```

`estimated_tokens` heuristic: count the number of MCP tool calls made in the cycle, multiply by 500 (baseline cost per tool call). Example: 6 tool calls → `estimated_tokens: 3000`. Use 0 if cycle was blocked before any tool call.

Append — do not overwrite. Then commit:

```bash
git add docs/agent-memory/notebooks/<agent-id>.md
git commit -m "chore(memory/<agent-id>): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/<agent-id>.md
```

Convention: `docs/policies/commit-convention.md` § Notebook Commits

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
