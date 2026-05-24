<!-- size-justification: 142L — zone-specialist flow; 4-tier build-order constraint table, TDD entry points per tier (3 variants), DDD layer rules table, gateway contract, implementation record template, and doc-self-heal chain are all zone-specific mandatory content with no factoring seam -->
# dev-frontend — Main Flow

**Zone:** `apps/frontend/`
**Specialist for:** Remix SSR dashboard, Tailwind CSS + shadcn/ui components, API service layer against api-gateway

**Tools:** `.claude/tools/package/developer.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests committed | `[Developer] Implementation Record` in handoff | QA notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `.claude/flows/dev-team/main.md`

**Called from:** dev-team Step 3 — main terminal routes `apps/frontend/` tasks here
**Receives:** `docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings` — files to read/modify/create, AC, branch name, zone
**Produces:** Code + tests on branch | `[Developer] Implementation Record` in handoff | RETURN with `NEXT: qa`
**Hand off to:** main terminal → spawns qa with branch + handoff

---

## Build Order Constraint (ENFORCED — never skip)

Before touching any file, identify the build tier of the task:

| Tier | What | Gate |
|------|------|------|
| 1 | Base theme (`app/styles/theme.css`, `tailwind.config.ts`) | No gate — must exist first |
| 2 | Router skeleton (`app/root.tsx`, `app/routes/_index.tsx`) | Tier 1 files exist |
| 3 | API service layer (`app/lib/api/*.ts`) + fetch tests | Tier 2 type-check passes |
| 4 | Feature routes + UI components | Tier 3 tests GREEN |

If your task is Tier 4 and Tier 3 tests are not GREEN: **STOP, notify PM**.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `dev-frontend`)

**Step 0c — Load service documentation** → read `docs/architecture/microservice/frontend/` directory if it exists. Lazy-load other docs per DDD layer touched.

**Pre-code checklist**
1. Confirm task status in `docs/TASKS.md`
2. Branch setup — run exactly one of:
   - Branch exists: `git checkout task/NNN-kebab-description && git status` — verify clean, on correct branch
   - Branch missing: `git checkout main && git pull origin main && git checkout -b task/NNN-kebab-description`
   - VERIFY: `git branch --show-current` must equal `task/NNN-kebab-description` before touching any file
3. Read `docs/handoffs/TASK_NNN.md` — use `files_to_read/modify/create` directly, skip redundant scanning
4. `depends_on` not Done → STOP, notify PM
5. Load knowledge files (fail-loud → `send_telegram(channel="bug")`, STOP)
6. Check build tier (table above) — verify gate conditions are met
7. **Before creating any new file** → look up canonical location in `docs/policies/docs-organization.md` table

**TDD workflow**
```
RED    → write apps/frontend/app/__tests__/NNN-task-name.test.ts → must FAIL
GREEN  → minimum code to pass → must PASS
REFACTOR → clean → still PASS
REPEAT per acceptance criterion
```

TDD entry points by tier:
- Tier 3 (API service): `apps/frontend/app/__tests__/NNN-api-<endpoint>.test.ts` — mock `fetch`, test request shape + response mapping
- Tier 4 (loader): `apps/frontend/app/__tests__/NNN-<route>-loader.test.ts` — test loader data transform, not HTTP
- Tier 4 (component): `apps/frontend/app/__tests__/NNN-<component>.test.tsx` — test render + user interaction

**DDD layer rules for this zone**

| Building | Layer | Folder |
|----------|-------|--------|
| Data shape / market type | domain | `apps/frontend/app/domain/` |
| fetch wrapper, API call | infrastructure | `apps/frontend/app/lib/api/` |
| Data transform, usecase logic | application | `apps/frontend/app/lib/` (non-api) |
| Remix loader / action | interface | `apps/frontend/app/routes/` |
| React component | interface | `apps/frontend/app/components/` |

Golden rule: `app/domain/` has ZERO imports from `app/lib/api/` or `app/components/`.
Loaders call `app/lib/api/` — never call api-gateway `fetch` directly inside a component.

**Gateway contract**
- ALL backend calls go through `http://api-gateway:4000` (env: `API_GATEWAY_URL`)
- NEVER call microservice ports (5000–5008) directly from the frontend
- Use the typed client at `app/lib/api/client.ts` for all requests

**After code**
1. `cd apps/frontend && npx vitest run` — all tests pass (0 failures)
2. `cd apps/frontend && npx tsc --noEmit` — 0 errors
3. `git add -p && git commit -m "..."` — format per `docs/policies/commit-convention.md`
   Mandatory trailers for task commits: `Sprint:`, `Task:`, `AC:` (slash-separated, terse).
   **NEVER use `git commit -am` or `git commit -a`**

**Documentation review** (after code passes, before QA):
→ Run flow: `.claude/flows/developer/doc-review.md` with `SERVICE=frontend`

**Append to handoff** (before QA):
```markdown
## [Developer] Implementation Record
- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** [1 / 2 / 3 / 4]
- **Files modified:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **Type check:** clean
- **Service tests:** N pass / 0 fail
- **Docs updated:** [docs/architecture/microservice/frontend/... — what changed] | NONE
- **Graphify:** updated | skipped (no docs impacted)
```

**Notebook write** (before QA) → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `dev-frontend`)

**Zone health observation (mandatory — 1 line):**
Before calling notebook-write, compose one "Zone health:" line:
```
Zone health: <e.g. "test coverage ~65%, Tier 3 api layer complete, Tier 4 routes 2/8 done"> | HEALTHY
```

**Commit notebook**:
```bash
git add docs/agent-memory/notebooks/dev-frontend.md
git commit -m "chore(memory/dev-frontend): notebook YYYY-MM-DD"
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Update docs/TASKS.md**: In Progress → Review → return:
```
## RETURN
DONE: Implementation complete — SERVICE=frontend, TIER=N, CHANGED=[...], NEW_PASS=N, tsc clean
NEXT: qa | run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
