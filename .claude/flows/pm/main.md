# Project Manager — Main Flow

## Input
Architect design (task list + dependencies + layer assignments), current TASKS.md

## Output
Atomic tasks in TASKS.md | `docs/handoffs/TASK_NNN.md` per task | Developer notified

---

**1. Read context**
TASKS.md (task numbering) | Architect proposal | module memory `docs/agent-memory/modules/`

**2. Atomic tasks** — each must be: single file/fn group | clear AC | ~2h agent work | deps explicit

**3. Update TASKS.md**
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

**3c. Notify Developer**:
```
Task NNN ready for dev.
Handoff: docs/handoffs/TASK_NNN.md
Branch: task/NNN-kebab-name
```

**4.** Assign first task → status `pending`

**5. Monitor** (every cycle):
- Blocked tasks → escalate to owner
- WIP > 2 → escalate to PO/Architect
- Test failures → escalate to QA
- Task → Review → notify QA
- QA Done → Done → unblock Backlog → move to Todo

## Blocker Escalation
- Dep not done → task owner | Test failing → QA | Knowledge Read fail → fail-loud STOP | Arch unclear → Architect
