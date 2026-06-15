<!-- size-justification: 197L — zone-specialist flow; 4-tier build-order constraint table, TDD entry points per tier (3 variants), DDD layer rules table, gateway contract, G12 DoD Gate (MVR render-gate + streak rule, blocking from Day 0), ESLint fence Phase-2 note, INV-GATEWAY-1 comments, implementation record template, mandatory decision-journal step, and doc-self-heal chain are all zone-specific mandatory content with no factoring seam -->
# dev-frontend — Main Flow

**Zone:** `apps/frontend/`
**Specialist for:** Remix SSR dashboard, Tailwind CSS + shadcn/ui components, API service layer against api-gateway

**Tools:** `docs/agents/tools/package/developer.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests committed | `[Developer] Implementation Record` in handoff | QA notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

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
1. Confirm task status in `docs/data/orch/orch-state.json` `.task_board`
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
3. **Commit directly** (INV-GATEWAY-1 — no mutex skill invocation from this specialist)
   `git add <exact own paths>` (NEVER `-A`/`.`) then `git commit -m "..."` — format per `docs/policies/commit-convention.md`
   Mandatory trailers for task commits: `Sprint:`, `Task:`, `AC:` (slash-separated, terse).
   **NEVER use `git commit -am` or `git commit -a`**
   # INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
   # responsibility; this specialist commits directly (explicit paths) — no commit-mutex skill call here.

---

## G12 DoD Gate (MVR — Playwright render-green — mandatory — blocking from Day 0)

**Do not mark any task DONE / do not write the RETURN block until BOTH gates pass:**

| Gate | Command | Must show |
|------|---------|-----------|
| Vitest (unit) | `cd apps/frontend && npm test` | 0 failures — all formatter + view-model tests PASS |
| Playwright (render) | `cd apps/frontend && npm run test:e2e` | 3/3 render checks PASS (`npm run test:e2e` via `tests/e2e/render-check.spec.ts`) |

Both commands must exit 0 before the task is DONE.

If Vitest exits non-zero:
- The task is NOT done.
- Fix the failing test before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

If Playwright exits non-zero:
- The task is NOT done even if Vitest is green.
- A formatter extraction that breaks the render gate is a regression — fix the route file import before DONE.

**Evidence requirement:** paste the `npm test` summary line AND the Playwright summary line into the task handoff doc before writing the RETURN block. No evidence = task is NOT accepted.

**MVR Streak Rule (G12 — 3-task streak):**
The three G12 streak tasks are P1-B1, P1-B2, and P1-C (see `docs/architecture-briefs/2026-05-22-refactor/scale/frontend-phase-1-task-plan.md` §G12 Streak Tasks). Each must carry Playwright render-gate evidence pasted into its handoff before it is marked DONE. The streak is broken if ANY task in the sequence ships without render-green evidence. If the streak is broken, reopen the task, re-run both gates, and re-paste evidence before re-marking DONE.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12; `docs/architecture-briefs/2026-05-22-refactor/scale/frontend-phase-1-task-plan.md` §MVR-vs-FULL Scope Verdict

---

## ESLint Fence (G4 — Phase 2 concern for MVR track)

**Phase 1 does NOT require ESLint fence enforcement.** Goal G4 is STILL-UNMET after Phase 1 (see task plan §Goals Roadmap).

**Phase 2 target:** An ESLint rule (via `eslint-plugin-import` or `eslint-plugin-boundaries`) that blocks cross-layer imports — specifically preventing `app/domain/formatters/` from importing anything in `app/lib/api/`. This is the TypeScript/Remix equivalent of the `depguard` fence used in Go services (SI-3 design; NOT `depguard` which is Go-only).

**When Phase 2 fence work begins:** lazy-load `docs/architecture-briefs/2026-05-22-refactor/scale/frontend-charter.md` (trigger: `g4_eslint_fence_task`). The fence config lives at `apps/frontend/.eslintrc.cjs` or `apps/frontend/eslint.config.js` depending on the Remix version in use. Verify existing config before creating a new one.

**Do not implement the ESLint fence during Phase 1 MVR tasks** — any ESLint config change in Phase 1 is out of scope and will be rejected by QA.

Reference: `docs/architecture-briefs/2026-05-22-refactor/scale/frontend-phase-1-task-plan.md` §Goals Roadmap (G4 row); `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G4

---

**Documentation review** (after code passes, before QA):
→ Run flow: `docs/agents/developer/flow/doc-review.md` with `SERVICE=frontend`

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

**Notebook write** (before QA) → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `dev-frontend`; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Zone health observation (mandatory — 1 line):**
Before calling notebook-write, compose one "Zone health:" line:
```
Zone health: <e.g. "test coverage ~65%, Tier 3 api layer complete, Tier 4 routes 2/8 done"> | HEALTHY
```

**Commit notebook** (direct — INV-GATEWAY-1):
```bash
# INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
# responsibility; inner specialist agents commit directly (explicit paths), no mutex skill call.
git add docs/agent-memory/notebooks/dev-frontend.md
git commit -m "chore(memory/dev-frontend): notebook YYYY-MM-DD"
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Skills available to this zone (lazy-load — load only when the task requires it):**
- UI design / visual polish → skill: `.claude/skills/frontend-design/SKILL.md` (distinctive production-grade interfaces; trigger: user asks to build/style a component, page, or dashboard)
- Multi-component React artifacts (shadcn/ui) → skill: `.claude/skills/web-artifacts-builder/SKILL.md` (trigger: complex artifact with state management or shadcn components)
- Apply consistent theme/palette to artifact → skill: `.claude/skills/theme-factory/SKILL.md` (trigger: user requests theming or color scheme on any artifact)
- Playwright UI testing → skill: `.claude/skills/webapp-testing/SKILL.md` (trigger: task requires browser automation or E2E verification beyond G12 render-gate)

**Decision journal** (mandatory — before REVIEW):
→ skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<active task_id from task_board — e.g. TASK-NNN>"]
Write at minimum ONE entry per task stamped with its task-id (record WHY implementation choices — build tier, approach). Routine: `what-considered: "only path: <reason>"`, `why-change: "no change from plan"`.

**Update `docs/data/orch/orch-state.json` `.task_board`**: task status IN_PROGRESS → REVIEW (atomic write per §2.3) → return:
```
## RETURN
DONE: Implementation complete — SERVICE=frontend, TIER=N, CHANGED=[...], NEW_PASS=N, tsc clean
NEXT: qa | run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
