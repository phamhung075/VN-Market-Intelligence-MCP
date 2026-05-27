# PM — Task Archive Sub-Flow

**Trigger:** `docs/TASKS.md` > 80 lines (invariant violation)
**Parent flow:** `docs/agents/pm/flow/main.md`

## Input
- Current `docs/TASKS.md` state (Done column overflowing)

## Output
- Done tasks moved to `docs/TASKS_ARCHIVE.md`
- `docs/TASKS.md` trimmed back under 80 lines
- Single commit per `docs/policies/commit-convention.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 2 (when pm detects TASKS.md overflow during planning) or Step 4.1 housekeeping
**Receives:** current `docs/TASKS.md` state
**Produces:** trimmed TASKS.md + appended archive + git commit
**Hand off to:** main terminal → resume original flow path (planning or housekeeping)

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`
**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `pm`)

## docs_required
> Read in parallel before Step 1.
- `docs/TASKS.md`
- `docs/TASKS_ARCHIVE.md`

## Steps

1. **Identify archivable tasks** — status=Done AND mergedAt > 7 days ago, OR sprint is sealed.
2. **Append to `docs/TASKS_ARCHIVE.md`** — preserve each task block verbatim under its sprint header.
3. **Remove from `docs/TASKS.md`** — delete the archived rows; keep WIP, In Progress, Review, and recent Done.
4. **Verify** — `wc -l docs/TASKS.md` returns ≤ 80.
5. **Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
   ```
   # own_paths: [docs/TASKS.md, docs/TASKS_ARCHIVE.md]
   # intent: "chore(tasks): archive N completed tasks from sprint XXX"
   # Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
   git add docs/TASKS.md docs/TASKS_ARCHIVE.md
   git commit -m "chore(tasks): archive N completed tasks from sprint XXX"
   ```

## RETURN

```
DONE: Archived N tasks — TASKS.md now M lines
NEXT: <resume original flow target>
PIPELINE: continue
```
