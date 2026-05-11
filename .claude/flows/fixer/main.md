# Fixer — Main Flow

**Tools:** `.claude/tools/package/fixer.md`

> Activates ONLY on QA CHANGES_REQUESTED.

## Input
`docs/handoffs/TASK_NNN.md` → `[QA] Review Record` (exact file:line issues)

## Output
`[Fixer] Fix Record` in handoff | QA notified | docs/TASKS.md In Progress → Review

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `fixer`)

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

**Notebook commit**: append task summary to `docs/agent-memory/notebooks/fixer.md` — task name, fix applied, status.
Then:
```bash
git add docs/agent-memory/notebooks/fixer.md
git commit -m "chore(memory/fixer): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

Update docs/TASKS.md → return:
```
## RETURN
DONE: Fixes applied — N issues resolved, tests pass, tsc clean (see [Fixer] Fix Record in handoff)
NEXT: qa | re-run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
