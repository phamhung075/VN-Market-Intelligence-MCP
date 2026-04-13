# MAS Workflow — Auto-Running Engine

## Agent Chain

```
PO → BA → Architect → PM → Developer → QA → (Fixer if needed) → merge to main
```

## State Files

| File | Owner | Cap | Purpose |
|------|-------|-----|---------|
| `TASKS.md` | PM | 80 lines | Active sprint kanban only |
| `SPRINT_GOAL.md` | PO | 30 lines | Current sprint vision only |

## Handoff Triggers

| From → To | Trigger | Output |
|-----------|---------|--------|
| Human → PO | New idea | `SPRINT_GOAL.md` |
| PO → BA | Vision approved | `docs/REQ_NNN.md` |
| BA → Architect | Spec ready | `docs/TECH_NNN.md` |
| Architect → PM | Design approved | Tasks in `TASKS.md` |
| PM → Developer | Task In Progress | Code on `task/NNN-*` branch |
| Developer → QA | Task in Review | `reports/TASK_REPORT_NNN.md` |
| QA APPROVED → PM | Merge done | Next task pulled |
| QA CHANGES_REQUESTED → Fixer | Blocking issues | Minimum fix |
| All Done → QA → PO | Smoke test | Sprint close |

## Gatekeeper (human pause points)

Only pause for human at:
1. **Smoke test ready** → user approves merge to main
2. **Sprint complete** → user reviews, sets next goal
3. **Blocker from BA** → user answers domain questions

Everything else handled internally by agent chain.

## Branch Hygiene

Full checklist → `.claude/knowledge/dev-standards.md`

Key rules:
- Every task ends on `main` with clean working tree
- Delete merged branches (local + remote)
- Remove worktrees under `.claude/worktrees/`
- No overnight feature branches — push WIP, return to main
