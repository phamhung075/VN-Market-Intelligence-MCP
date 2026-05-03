# Developer — Main Flow

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests on `task/NNN-*` branch | `[Developer] Implementation Record` in handoff | PM/QA notified

---

**Step 0b — Read notebook**
Read `docs/agent-memory/notebooks/developer.md`. Note any carry-over observations, calibration patterns, or unresolved questions from previous sessions. Do NOT act on them yet — just load them as context.

**Pre-code checklist**
1. Confirm task status in docs/TASKS.md
2. Branch setup — run exactly one of:
   - Branch exists: `git checkout task/NNN-kebab-description && git status` — verify clean, on correct branch
   - Branch missing: `git checkout main && git pull origin main && git checkout -b task/NNN-kebab-description`
   - VERIFY: `git branch --show-current` must equal `task/NNN-kebab-description` before touching any file
3. Read `docs/handoffs/TASK_NNN.md` first — use `files_to_read/modify/create` directly, skip redundant scanning
4. `depends_on` not Done → STOP, notify PM
5. Load knowledge files (fail-loud → `send_telegram(channel="bug")`, STOP)
6. **Before creating any new file** → look up canonical location in `.claude/knowledge/docs-organization.md` table.
   Quick ref: source→`apps/mcp-server/src/` | tests→`apps/mcp-server/src/__tests__/` | reports→`reports/` | handoffs→`docs/handoffs/` | never at root.

**TDD workflow**
```
RED    → write src/__tests__/NNN-task-name.test.ts → must FAIL
GREEN  → minimum code to pass → must PASS
REFACTOR → clean → still PASS
REPEAT per acceptance criterion
```

**After code**
1. `bun test src/__tests__/NNN-*.test.ts` — task tests pass
2. `bun test` — no regressions
3. `bun tsc --noEmit` — 0 errors
4. `git add -p && git commit` — format per dev-standards.md

**Doc update + graphify** (after code passes, before QA):
1. Identify related docs touched by this task — check:
   - `docs/analysis-briefs/` for any ticker/sector mentioned in the task
   - `docs/handoffs/` — update the current handoff only
   - `.claude/knowledge/` — update any knowledge file whose domain was changed (e.g. mcp-tools.md if MCP tool added, cron-jobs.md if scheduler changed)
   - `docs/WORK.md` — append a one-liner summary of what changed
2. Edit each found doc to reflect the new behaviour/API/schema — keep changes minimal and factual
3. Run graphify incremental update on changed docs:
   ```
   /graphify docs --update --no-viz
   ```
   This rebuilds only the changed nodes in `graphify-out/graph.json` — do NOT run full `/graphify` (too slow).
4. Skip this step entirely if: no docs are impacted (pure test refactor, fixture-only change)

**Append to handoff** (before QA):
```markdown
## [Developer] Implementation Record
- **Files modified:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **tsc status:** clean ✓
- **Full suite:** N pass / 0 fail ✓
- **Docs updated:** [path — what changed] | NONE if no docs impacted
- **Graphify:** updated ✓ | skipped (no docs impacted)
```

**Append session log** (before QA):
`append_session_record(agent_name="developer", task_name="Task NNN: ...", finding=..., status="Ready for QA")`

**End-of-cycle notebook write**
Overwrite `docs/agent-memory/notebooks/developer.md` with:
- Last updated date + current sprint number
- Summary of this session (1-3 sentences: what was done, what was found)
- Any patterns noticed (recurring bugs, recurring architecture violations, calibration observations)
- Any carry-over items for next session (unresolved questions, blocked tasks)
Keep it under 50 lines. Overwrite the entire file — do not append.

**Update docs/TASKS.md**: In Progress → Review → return:
```
## RETURN
DONE: Implementation complete — CHANGED=[src/foo.ts:40-55, src/__tests__/NNN.test.ts], NEW_PASS=23, tsc clean
NEXT: qa | run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
