# PM — Task Archive Sub-Flow

**Trigger:** `docs/data/orch/orch-state.json` `.task_board` task count > 80 (invariant violation)
**Parent flow:** `docs/agents/pm/flow/main.md`

## Input
- Current `docs/data/orch/orch-state.json` `.task_board` state (Done tasks accumulating)

## Output
- Done tasks moved to `.task_board.archive[]`
- Active `.task_board.active_sprints[].tasks` count trimmed back under 80
- Single commit per `docs/policies/commit-convention.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 2 (when pm detects `.task_board` task count overflow during planning) or Step 4.1 housekeeping
**Receives:** current `docs/data/orch/orch-state.json` `.task_board` state
**Produces:** archived tasks moved to `.task_board.archive[]` + active task count reduced + git commit
**Hand off to:** main terminal → resume original flow path (planning or housekeeping)

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`
**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `pm`)

## docs_required
> Read in parallel before Step 1.
- `docs/data/orch/orch-state.json` (full file — will modify `.task_board` section only)

## Steps

1. **Identify archivable tasks** — status=DONE AND closed_at > 7 days ago, OR sprint is sealed (status="closed").
2. **Move to `.task_board.archive[]`** — append each task object with `closed_at` field to `archive[]`.
3. **Remove from `.task_board.active_sprints[].tasks[]`** — delete the archived task objects; keep WIP, IN_PROGRESS, REVIEW, and recent DONE.
4. **Verify** — `jq '[.task_board.active_sprints[].tasks[]] | length' docs/data/orch/orch-state.json` returns ≤ 80.
5. **Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
   ```
   # own_paths: [docs/data/orch/orch-state.json]
   # intent: "chore(tasks): archive N completed tasks from sprint XXX"
   # Protocol: task_claim commit-mutex:main (TTL=60s) → atomic write orch-state.json → verify jq . → git add → git commit → task_release
   git add docs/data/orch/orch-state.json
   git commit -m "chore(tasks): archive N completed tasks from sprint XXX"
   ```

## RETURN

```
DONE: Archived N tasks — TASKS.md now M lines
NEXT: <resume original flow target>
PIPELINE: continue
```
