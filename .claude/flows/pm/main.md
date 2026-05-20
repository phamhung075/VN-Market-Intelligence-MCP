# Project Manager — Main Flow

**Tools:** `.claude/tools/package/pm.md`

## Input
Architect design (task list + dependencies + layer assignments), current docs/TASKS.md

## Output
Atomic tasks in docs/TASKS.md | `docs/handoffs/TASK_NNN.md` per task | Developer notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `.claude/flows/dev-team/main.md`

**Called from:** dev-team Step 2 final step (all sprint sizes after architect); Step 3 after each tier completes to update docs/TASKS.md and unblock next tier
**Receives:** Step 2: architect output (`[Architect] Brownfield Findings` in `docs/handoffs/TASK_NNN.md`) + current `docs/TASKS.md`; Step 3: completed tier list + QA results
**Produces:** Step 2: atomic task list with dependency tiers in RETURN block (`tier1 (parallel): ...`, `tier2 (after tier1): ...`) + `docs/handoffs/TASK_NNN-*.md` per subtask; Step 3: updated `docs/TASKS.md` (Done statuses) + RETURN unblocking next tier
**Hand off to:** Step 2 → main terminal routes to Step 3 execution; Step 3 → main terminal spawns next tier developers
**Composes with:** architect (receives from), developer + qa (provides task specs to, monitors status of)

Each atomic task must be: single file/fn group | clear AC | ~2h agent work | explicit deps.
WIP > 2 → hold and return `PIPELINE: blocked | NEXT: po | WIP limit exceeded`.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `pm`)

**1. Read context**
docs/TASKS.md (task numbering) | Architect proposal | recent agent notebooks (`docs/agent-memory/notebooks/*.md`)

**2. Atomic tasks** — each must be: single file/fn group | clear AC | ~2h agent work | deps explicit

**3. Update docs/TASKS.md**
- Deps Done → **Todo** | Deps In Progress → **Backlog**
```
| NNN | Short title | pending | role | — | NNN-1,NNN-2 |
```

**3b. Create handoff file** `docs/handoffs/TASK_NNN.md` — AC listed here will also be written as the `AC:` trailer in the developer's commit (`docs/policies/commit-convention.md`), making git the second copy:
```markdown
---
sprint: NNN
branch: task/NNN-kebab-name
size: S|M|L
zone: apps/<service>/   ← MANDATORY — copy from architect handoff § Zone; dev-team Step 3 routes by this
depends_on: []
blocks: []
---

## TLDR
[3 sentences: what, where, why]

## [PM] Planning Context
- **Zone:** apps/<service>/   ← also in body for visibility
- **Acceptance Criteria:**
  - [ ] Criterion 1
- **Files to read first:** [path:lines]
- **Files to create:** [path — purpose]
- **Files to modify:** [path:lines]
- **Dependencies:** [list or "none"]
- **Knowledge needed:** `docs/policies/dev-standards.md` + others
```

**Multi-zone handling:** If architect returned `ZONE: multi`, split the design into one subtask per zone — each subtask carries its own single zone. Never bundle multi-zone work in one task: zone-routed parallel spawns require disjoint scopes.

**3c.** Update docs/TASKS.md (status → pending) → return task list with dependency tiers and zone per task:
```
## RETURN
DONE: Tasks broken down, handoffs created for NNN-a, NNN-b, NNN-c
TASKS:
  tier1 (parallel):
    - NNN-a [zone: apps/stock-price/, files: apps/stock-price/src/foo.ts]
    - NNN-b [zone: apps/alert-engine/, files: apps/alert-engine/src/bar.ts]
  tier2 (after tier1):
    - NNN-c [zone: apps/stock-price/, depends_on: NNN-a, files: apps/stock-price/src/baz.ts]
HANDOFF: docs/handoffs/TASK_NNN-a.md, docs/handoffs/TASK_NNN-b.md, docs/handoffs/TASK_NNN-c.md
PIPELINE: continue
```
`zone:` on every task is mandatory — dev-team Step 3 reads this field to pick the right dev-* specialist.

**3d.** Heartbeat umbrella lock → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + sprint_id })
// ok=false here = sprint umbrella expired or stolen; log only, do not abort planning
```

**4.** Set task status → `in_progress` when developer picks up

**4b.** Heartbeat developer's task lock if pre-existing:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
// silent on ok=false — developer will (re)claim on entry
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**PM commits convention:**
- `chore(memory/pm): notebook YYYY-MM-DD` — notebook only, no trailers (C2-exempt)
- `chore(pm/cNN): <description>` — cycle bookkeeping, no trailers (C2-exempt: cycle ref)
- `chore(pm/NNNN*): <description>` — sprint bookkeeping (decompose, move-to-Done), no trailers (C2-exempt: PM housekeeping)
- `chore(cycle-NN): <description>` — cycle artifact persist, no trailers (C2-exempt: cycle ref)
- Any commit where scope contains a sprint number AND delivers code/config MUST carry `Task:` trailer.

**5. Monitor** (every cycle):
- Blocked tasks → return `PIPELINE: blocked | NEXT: architect | [reason]`
- WIP > 2 → hold, return `PIPELINE: blocked | NEXT: po | WIP limit exceeded`
- Task → Review → return `NEXT: qa | review Task NNN branch task/NNN-kebab`
- QA Done → Done → unblock next → return `NEXT: developer | implement Task NNN+1`
