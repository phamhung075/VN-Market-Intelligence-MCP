# Fixer — Main Flow
> Activates ONLY on QA CHANGES_REQUESTED.

## Input
`docs/handoffs/TASK_NNN.md` → `[QA] Review Record` (exact file:line issues)

## Output
`[Fixer] Fix Record` in handoff | QA notified | docs/TASKS.md In Progress → Review

---

**Step 0a — Resolve project root**
Run `git rev-parse --show-toplevel` and store as `$PROJECT_ROOT`. Use this prefix for ALL file writes in this session. Never use bare relative paths like `docs/...` — always `$PROJECT_ROOT/docs/...`.

**Step 0b — Read notebook**
Read `$PROJECT_ROOT/docs/agent-memory/notebooks/fixer.md`. Note any carry-over observations, calibration patterns, or unresolved questions from previous sessions. Do NOT act on them yet — just load them as context.

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

**Append session log**: `append_session_record(agent_name="fixer", task_name="Task NNN", fix=..., status="Ready for QA")`

**End-of-cycle notebook write**
Overwrite `docs/agent-memory/notebooks/fixer.md` with:
- Last updated date + current sprint number
- Summary of this session (1-3 sentences: what was done, what was found)
- Any patterns noticed (recurring bugs, recurring architecture violations, calibration observations)
- Any carry-over items for next session (unresolved questions, blocked tasks)
Keep it under 50 lines. Overwrite the entire file — do not append.

Update docs/TASKS.md → return:
```
## RETURN
DONE: Fixes applied — N issues resolved, tests pass, tsc clean (see [Fixer] Fix Record in handoff)
NEXT: qa | re-run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
