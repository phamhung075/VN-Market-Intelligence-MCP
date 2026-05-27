# Architect — Post-Merge Review Sub-Flow

**Trigger:** SPRINT-L only — after final sprint task merged into `main`
**Parent flow:** `docs/agents/architect/flow/main.md`

## Input
- Merge SHA (most recent on `main`)
- Sprint AC checklist (from po sign-off)
- `docs/handoffs/TASK_NNN.md` for every task in the sprint

## Output
- Sign-off appended to architect notebook
- OR cleanup tasks (type=CLEAN or FIX) appended to `docs/TASKS.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 2 SPRINT-L — after pm reports all sprint tasks DONE and final QA merge lands on `main`
**Receives:** merge SHA, sprint AC, list of TASK_NNN handoffs in the sprint
**Produces:** Sign-off log entry (sign-off path) OR new cleanup tasks (cleanup path)
**Hand off to:** main terminal → po for final sprint sign-off (sign-off path) | pm to plan cleanup work (cleanup path)

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`
**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `architect`)

## docs_required
> Read in parallel before Step 1.
- merge diff: `git show <SHA>`
- every sprint TASK_NNN handoff in `docs/handoffs/`
- `docs/ARCHITECTURE.md` — DDD invariants (see "## DDD Layer Order" section)

## Steps

1. **Architectural drift check** — did the merged code introduce new layers, ports, or cross-boundary calls not in the original briefs?
2. **AC coverage** — every AC item maps to ≥1 test in the merged code?
3. **Dead code** — files listed in handoffs as `files_to_create` but never referenced?
4. **DDD compliance** — domain layer free of infra imports; ports defined at boundaries.

## Decision

- All checks pass → SIGN-OFF (append entry to `docs/agent-memory/notebooks/architect.md`)
- Issue found → append CLEAN or FIX task to `docs/TASKS.md`, hand back to pm

## RETURN

```
DONE: Post-merge review — [SIGN-OFF | N cleanup tasks added]
NEXT: po (sign-off path) | pm (cleanup path)
PIPELINE: continue | complete
```
