# Fixer — Main Flow

**Tools:** `docs/agents/tools/package/fixer.md`

> Activates ONLY on QA CHANGES_REQUESTED.

## Input
`docs/handoffs/TASK_NNN.md` → `[QA] Review Record` (exact file:line issues)
Signal payload may include `handoff_delta: { last_read_anchor, last_read_at }` from QA round.

## Output
`[Fixer] Fix Record` in handoff | QA notified | `orch-state.json .task_board` task status IN_PROGRESS → REVIEW

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 3 — triggered exclusively by qa CHANGES_REQUESTED (round < 2); round ≥ 2 escalates to architect instead
**Receives:** `docs/handoffs/TASK_NNN.md` → `[QA] Review Record` with exact file:line issues; same `task/NNN-*` branch developer used
**Produces:** `[Fixer] Fix Record` in handoff (issues fixed, tests added, verification) | `orch-state.json .task_board` task status IN_PROGRESS → REVIEW | RETURN with `NEXT: qa`
**Hand off to:** main terminal → re-spawns qa for full re-run on same branch
**Composes with:** qa (receives CHANGES_REQUESTED from, returns to); architect (escalation path when fixer ceiling hit)

Hard constraints: fix 1-2 files max | minimum targeted change only | NEVER refactor during fix.
Escalate to PM immediately if: public API change needed | >2 files touched | fix breaks other tests.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `fixer`)

**Step 0c — Delta-read handoff** → skill: `.claude/skills/handoff-delta-read/SKILL.md`
```
Read handoff using delta-read skill:
  path: docs/handoffs/TASK_NNN.md
  last_read_anchor: <from signal payload handoff_delta.last_read_anchor, or null>
  last_read_at:     <from signal payload handoff_delta.last_read_at, or null>
→ seek to [QA] Review Record section; read only the delta since last fixer/QA round
→ store anchor_out + read_at into context (emit in RETURN block as handoff_delta for QA re-run)
```

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
7. **Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
   git add <exact own paths> (NEVER -A/.) then git commit
   Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
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
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/fixer.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/fixer.md
git commit -m "chore(memory/fixer): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**Decision journal** (mandatory — before marking task REVIEW):
→ skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<active task_id from the handoff — e.g. TASK-NNN>"]
Write at minimum ONE entry per task stamped with its task-id (record WHY this fix approach — which issue was targeted, why this minimum change was the chosen path). Routine fix: `what-considered: "only path: minimum targeted change per QA file:line"`, `why-change: "no change from plan"`.

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

Update `docs/data/orch/orch-state.json` `.task_board` task status (atomic write per §2.3) → return:
```
## RETURN
DONE: Fixes applied — N issues resolved, tests pass, tsc clean (see [Fixer] Fix Record in handoff)
NEXT: qa | re-run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
HANDOFF_DELTA: { "last_read_anchor": "<anchor_out>", "last_read_at": "<read_at>" }
PIPELINE: continue
```
