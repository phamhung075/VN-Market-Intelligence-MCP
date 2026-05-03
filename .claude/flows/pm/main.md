# Project Manager — Main Flow

## Input
Architect design (task list + dependencies + layer assignments), current docs/TASKS.md

## Output
Atomic tasks in docs/TASKS.md | `docs/handoffs/TASK_NNN.md` per task | Developer notified

---

**Step 0a — Resolve project root**
Run `git rev-parse --show-toplevel` and store as `$PROJECT_ROOT`. Use this prefix for ALL file writes in this session. Never use bare relative paths like `docs/...` — always `$PROJECT_ROOT/docs/...`.

**Step 0b — Read notebook**
Read `$PROJECT_ROOT/docs/agent-memory/notebooks/pm.md`. Note any carry-over observations, calibration patterns, or unresolved questions from previous sessions. Do NOT act on them yet — just load them as context.

**1. Read context**
docs/TASKS.md (task numbering) | Architect proposal | `docs/agent-memory/sessions/LATEST.md`

**2. Atomic tasks** — each must be: single file/fn group | clear AC | ~2h agent work | deps explicit

**3. Update docs/TASKS.md**
- Deps Done → **Todo** | Deps In Progress → **Backlog**
```
| NNN | Short title | pending | role | — | NNN-1,NNN-2 |
```

**3b. Create handoff file** `docs/handoffs/TASK_NNN.md`:
```markdown
---
sprint: NNN
branch: task/NNN-kebab-name
size: S|M|L
depends_on: []
blocks: []
---

## TLDR
[3 sentences: what, where, why]

## [PM] Planning Context
- **Acceptance Criteria:**
  - [ ] Criterion 1
- **Files to read first:** [path:lines]
- **Files to create:** [path — purpose]
- **Files to modify:** [path:lines]
- **Dependencies:** [list or "none"]
- **Knowledge needed:** `.claude/knowledge/dev-standards.md` + others
```

**3c.** Update docs/TASKS.md (status → pending) → return task list with dependency tiers:
```
## RETURN
DONE: Tasks broken down, handoffs created for NNN-a, NNN-b, NNN-c
TASKS:
  tier1 (parallel): NNN-a [files: src/foo.ts], NNN-b [files: src/bar.ts]
  tier2 (after tier1): NNN-c [depends_on: NNN-a, files: src/baz.ts]
HANDOFF: docs/handoffs/TASK_NNN-a.md, docs/handoffs/TASK_NNN-b.md, docs/handoffs/TASK_NNN-c.md
PIPELINE: continue
```

**4.** Set task status → `in_progress` when developer picks up

**End-of-cycle notebook write**
Overwrite `docs/agent-memory/notebooks/pm.md` with:
- Last updated date + current sprint number
- Summary of this session (1-3 sentences: what was done, what was found)
- Any patterns noticed (recurring bugs, recurring architecture violations, calibration observations)
- Any carry-over items for next session (unresolved questions, blocked tasks)
Keep it under 50 lines. Overwrite the entire file — do not append.

**5. Monitor** (every cycle):
- Blocked tasks → return `PIPELINE: blocked | NEXT: architect | [reason]`
- WIP > 2 → hold, return `PIPELINE: blocked | NEXT: po | WIP limit exceeded`
- Task → Review → return `NEXT: qa | review Task NNN branch task/NNN-kebab`
- QA Done → Done → unblock next → return `NEXT: developer | implement Task NNN+1`
