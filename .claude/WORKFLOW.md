# MAS Workflow — Auto-Running Engine

## Agent Chain

```
PO → BA → Architect → PM → Developer → QA → (Fixer if needed) → merge to main
```

## State Files

| File | Owner | Cap | Purpose |
|------|-------|-----|---------|
| `docs/data/orch/orch-state.json .task_board` | PM | 80 active tasks | Sprint kanban + archive |
| `docs/data/orch/orch-state.json .sprint_goal` | PO | 15 entries | Sprint vision history |
| `docs/data/orch/orch-state.json .head` | dev-team pipeline agents | — | Pipeline routing state |
| `docs/data/orch/orch-state.json .signal_queue` | signal-dashboard SKILL | 200 rows | Cowork agent inbox |
| `docs/handoffs/TASK_NNN.md` | PM→Architect→Developer→QA→Fixer | ~80 lines | Progressive task context — file paths, decisions, review results. Agents read this FIRST to avoid re-discovery. Delete when task archived. |

## Handoff Triggers

| From → To | Trigger | Output | Handoff File |
|-----------|---------|--------|-------------|
| Human → PO | New idea | `orch-state.json .sprint_goal` entry | — |
| PO → BA | Vision approved | `docs/REQ_NNN.md` | — |
| BA → Architect | Spec ready | `docs/TECH_NNN.md` | — |
| Architect → PM | Design approved | Tasks in `orch-state.json .task_board` | writes `[Architect]` block to `docs/handoffs/TASK_NNN.md` |
| PM → Developer | Task In Progress | Code on `task/NNN-*` branch | creates `docs/handoffs/TASK_NNN.md` with `[PM]` block |
| Developer → QA | Task in Review | `reports/TASK_REPORT_NNN.md` | appends `[Developer]` block |
| QA APPROVED → PM | Merge done | Next task pulled | appends `[QA]` block, file archived |
| QA CHANGES_REQUESTED → Fixer | Blocking issues | Minimum fix | Fixer reads `[QA]` block for file+line |
| Fixer → QA | Fix ready | Task back in Review | appends `[Fixer]` block |
| All Done → QA → PO | Smoke test | Sprint close | handoff files deleted |

## Gatekeeper (human pause points)

Only pause for human at:
1. **Smoke test ready** → user approves merge to main
2. **Sprint complete** → user reviews, sets next goal
3. **Blocker from BA** → user answers domain questions

Everything else handled internally by agent chain.

## Branch Hygiene

Full checklist → `docs/policies/dev-standards.md`

Key rules:
- Every task ends on `main` with clean working tree
- Delete merged branches (local + remote)
- Remove worktrees under `.claude/worktrees/`
- No overnight feature branches — push WIP, return to main
- Delete `docs/handoffs/TASK_NNN.md` when task is archived
