---
name: project-root
description: >
  Resolve the git project root at session start and store as $PROJECT_ROOT.
  Must run before any file write to prevent CWD-drift path bugs.
---

## Step 0a — Resolve project root (MANDATORY, run once at session start)

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel)
```

Use `$PROJECT_ROOT` as prefix for **all** file writes in this session.

| Wrong (relative) | Correct (absolute) |
|---|---|
| `docs/agent-memory/notebooks/YYYY-MM-DD-agent.md` | `$PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md` |
| `docs/data/orch/orch-state.json` | `$PROJECT_ROOT/docs/data/orch/orch-state.json` |
| `docs/handoffs/TASK_NNN.md` | `$PROJECT_ROOT/docs/handoffs/TASK_NNN.md` |
| `docs/agent-memory/notebooks/<id>.md` | `$PROJECT_ROOT/docs/agent-memory/notebooks/<id>.md` |

**Why**: agents edit files in subdirectories (e.g. `apps/mcp-server/`), which shifts the
implicit CWD. Relative paths then resolve against the subdirectory, creating stray files
in the wrong location (e.g. `apps/mcp-server/docs/` instead of `docs/`).

**Portable**: `git rev-parse --show-toplevel` always returns the correct absolute root
regardless of machine, user, or OS. Never hardcode the path.
