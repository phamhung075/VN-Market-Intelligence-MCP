# Developer — Main Flow

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests on `task/NNN-*` branch | `[Developer] Implementation Record` in handoff | PM/QA notified

---

**Pre-code checklist**
1. Confirm task status in TASKS.md
2. `git checkout task/NNN-kebab-description`
3. Read `docs/handoffs/TASK_NNN.md` first — use `files_to_read/modify/create` directly, skip redundant scanning
4. `depends_on` not Done → STOP, notify PM
5. Load knowledge files (fail-loud → `send_telegram(channel="bug")`, STOP)

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

**Append to handoff** (before QA):
```markdown
## [Developer] Implementation Record
- **Files modified:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **tsc status:** clean ✓
- **Full suite:** N pass / 0 fail ✓
```

**Append session log** (before QA):
`append_session_record(agent_name="developer", task_name="Task NNN: ...", finding=..., status="Ready for QA")`

**Update TASKS.md**: In Progress → Review → return:
```
## RETURN
DONE: Implementation complete — CHANGED=[src/foo.ts:40-55, src/__tests__/NNN.test.ts], NEW_PASS=23, tsc clean
NEXT: qa | run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
