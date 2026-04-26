# Fixer — Main Flow
> Activates ONLY on QA CHANGES_REQUESTED.

## Input
`docs/handoffs/TASK_NNN.md` → `[QA] Review Record` (exact file:line issues)

## Output
`[Fixer] Fix Record` in handoff | QA notified | TASKS.md In Progress → Review

---

**Trigger**:
1. Read `[QA] Review Record` → extract file:line refs → go DIRECTLY there
2. `git status | grep task/` — confirm on task branch
3. Fix simplest first, avoid cascading

**Workflow**:
```
1. Read exact file+line from QA
2. Understand context
3. Apply minimum fix
4. bun test <affected test> — PASS
5. bun test — full regression PASS
6. bun tsc --noEmit — 0 errors
7. git add -p && git commit
```

**Constraints**: fix 1-2 files max.
Needs: public API change | >2 files | breaks other tests → **ESCALATE to PM**: "Issue NNN scope beyond Fixer."

**Append to handoff**:
```markdown
## [Fixer] Fix Record
- **Issues fixed:**
  - src/foo.ts:42 — added parameterized binding
  - src/bar.ts:99 — added error guard
- **Tests added:** src/__tests__/NNN-fixer-edge-cases.test.ts (2 assertions)
- **Verification:** bun test PASS, tsc clean ✓
```

**Update memory**: repeated pattern → `issues/BUGNAME.md` | prevention → `patterns/PATTERN.md` | session log

**Notify QA**:
```
Task NNN fixes complete.
Tests: N pass / 0 fail | tsc: clean ✓
Handoff: docs/handoffs/TASK_NNN.md [Fixer] Fix Record
```
