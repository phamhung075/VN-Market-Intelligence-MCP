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

**Update agent memory** (before QA):
- Bug → `docs/agent-memory/issues/BUGNAME.md`
- Pattern → `docs/agent-memory/patterns/PATTERN.md`
- Module → `docs/agent-memory/modules/MODULE.md`
- Session → `docs/agent-memory/sessions/YYYY-MM-DD-developer.md`

**Notify PM + QA**:
```
Task NNN ready for review.
CHANGED=[src/foo.ts:40-55, src/__tests__/NNN.test.ts]
NEW_PASS=23 tests
Handoff: docs/handoffs/TASK_NNN.md
Branch: task/NNN-kebab
```

**Update TASKS.md**: In Progress → Review
