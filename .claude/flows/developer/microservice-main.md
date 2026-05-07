# Microservice Developer — Main Flow

**Tools:** `.claude/tools/package/developer.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests on `task/NNN-*` branch | `[Developer] Implementation Record` in handoff | PM/QA notified

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with agent id, e.g. `dev-stock-price`)

**Step 0c — Load service documentation** → read `docs/microservices/<service>/README.md` for service context. Lazy-load other docs as needed per DDD layer touched.

**Pre-code checklist**
1. Confirm task status in docs/TASKS.md
2. Branch setup — run exactly one of:
   - Branch exists: `git checkout task/NNN-kebab-description && git status` — verify clean, on correct branch
   - Branch missing: `git checkout main && git pull origin main && git checkout -b task/NNN-kebab-description`
   - VERIFY: `git branch --show-current` must equal `task/NNN-kebab-description` before touching any file
3. Read `docs/handoffs/TASK_NNN.md` first — use `files_to_read/modify/create` directly, skip redundant scanning
4. `depends_on` not Done → STOP, notify PM
5. Load knowledge files (fail-loud → `send_telegram(channel="bug")`, STOP)
6. **Zone restriction** — only touch files in `apps/<service>/`. If changes needed outside zone, STOP and notify PM.
7. **Before creating any new file** → look up canonical location in `.claude/knowledge/docs-organization.md` table.

**TDD workflow — TypeScript/Bun services**
```
RED    → write apps/<service>/src/__tests__/NNN-task-name.test.ts → must FAIL
GREEN  → minimum code to pass → must PASS
REFACTOR → clean → still PASS
REPEAT per acceptance criterion
```

**TDD workflow — Python/FastAPI services (pdf-extractor, rag-service)**
```
RED    → write apps/<service>/__tests__/test_NNN_task_name.py → must FAIL
GREEN  → minimum code to pass → must PASS
REFACTOR → clean → still PASS
REPEAT per acceptance criterion
```

**After code — TypeScript/Bun**
1. `cd apps/<service> && bun test` — service tests pass
2. `bun tsc --noEmit` — 0 errors
3. `git add -p && git commit` — format per dev-standards.md

**After code — Python/FastAPI**
1. `cd apps/<service> && python -m pytest` — service tests pass
2. Type check if configured (mypy/pyright)
3. `git add -p && git commit` — format per dev-standards.md

**Documentation review** (after code passes, before QA):
→ Run flow: `.claude/flows/developer/doc-review.md` with `SERVICE=<service>`

**Append to handoff** (before QA):
```markdown
## [Developer] Implementation Record
- **Service:** <service-name>
- **Zone:** apps/<service>/
- **Files modified:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **Type check:** clean ✓
- **Service tests:** N pass / 0 fail ✓
- **Docs updated:** [docs/microservices/<service>/... — what changed] | NONE
- **Graphify:** updated ✓ | skipped (no docs impacted)
```

**Append session log** (before QA):
`append_session_record(agent_name="dev-<service>", task_name="Task NNN: ...", finding=..., status="Ready for QA")`

**End-of-cycle notebook write**
→ skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with agent id)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Update docs/TASKS.md**: In Progress → Review → return:
```
## RETURN
DONE: Implementation complete — SERVICE=<service>, CHANGED=[...], NEW_PASS=N, type-check clean
NEXT: qa | run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
