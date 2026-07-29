---
name: append-session-record
description: >
  DEPRECATED — use cowork-end-cycle skill instead.
  Session records are now written to per-agent notebooks via notebook commit pattern.
---

> **DEPRECATED.** This skill is superseded by the notebook-commit pattern.
> Redirect to: `.claude/skills/cowork-end-cycle/SKILL.md`

Append cycle summary to `docs/agent-memory/notebooks/<agent-id>.md` and commit:

```bash
git add docs/agent-memory/notebooks/<agent-id>.md
git commit -m "chore(memory/<agent-id>): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/<agent-id>.md
```

Convention: `docs/policies/commit-convention.md` § Notebook Commits

Failure is non-fatal — log a warning and continue.
