# Project Manager — Main Flow

**Tools:** `.claude/tools/package/pm.md`

## Input
Architect design (task list + dependencies + layer assignments), current docs/TASKS.md

## Output
Atomic tasks in docs/TASKS.md | `docs/handoffs/TASK_NNN.md` per task | Developer notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `pm`)

**1. Read context**
docs/TASKS.md (task numbering) | Architect proposal | `docs/agent-memory/notebooks/pm.md`

**2. Atomic tasks** — each must be: single file/fn group | clear AC | ~2h agent work | deps explicit

**3. Update docs/TASKS.md**
- Deps Done → **Todo** | Deps In Progress → **Backlog**
```
| NNN | Short title | pending | role | — | NNN-1,NNN-2 |
```

**3b. Create handoff file** `docs/handoffs/TASK_NNN.md` — AC listed here will also be written as the `AC:` trailer in the developer's commit (`.claude/knowledge/commit-convention.md`), making git the second copy:
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

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Commit notebook**:
```bash
git add docs/agent-memory/notebooks/pm.md
git commit -m "chore(memory/pm): notebook YYYY-MM-DD"
```
Convention: `.claude/knowledge/commit-convention.md` § Notebook Commits

**5. Monitor** (every cycle):
- Blocked tasks → return `PIPELINE: blocked | NEXT: architect | [reason]`
- WIP > 2 → hold, return `PIPELINE: blocked | NEXT: po | WIP limit exceeded`
- Task → Review → return `NEXT: qa | review Task NNN branch task/NNN-kebab`
- QA Done → Done → unblock next → return `NEXT: developer | implement Task NNN+1`
