<!-- size-justification: 165L — shared base flow for all 9 dev-* zone agents; carries both TS/Bun and Python/FastAPI TDD workflows, zone-restriction rule, INV-GATEWAY-1 dispatcher-lock comments, doc-review chain, implementation record template, mandatory decision-journal steps, and RETURN schema; splitting would degrade usability for all 9 consumers -->
# Microservice Developer — Main Flow

**Scope:** Any `apps/<service>/` zone (TypeScript/Bun or Python/FastAPI). All 9 dev-* zone agents share this flow. The `apps/mcp-server/` root uses [`main.md`](./main.md) instead.

**Tools:** `docs/agents/tools/package/developer.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests on `task/NNN-*` branch | `[Developer] Implementation Record` in handoff | PM/QA notified

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 3 — main terminal routes by zone (e.g., `apps/stock-price/` → dev-stock-price); parallel tasks in different zones use `isolation: "worktree"` on each Agent call
**Receives:** `docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings` — files to read/modify/create, AC, branch name, target zone `apps/<service>/`
**Produces:** Code + tests on `task/NNN-*` branch within zone | `[Developer] Implementation Record` in handoff | doc-review pass if `docs/architecture/microservice/<service>/` touched | RETURN with `NEXT: qa`
**Hand off to:** main terminal → spawns qa with branch + handoff
**Composes with:** [`doc-review.md`](./doc-review.md) sub-flow (auto-invoked after code, before QA, when service docs are touched); parallel sibling dev-* agents run simultaneously in separate worktrees per tier (disjoint zones are safe)

---

> **DECISION JOURNAL RULE:** Terminal output is STATUS-ONLY (RETURN + caveman). All reasoning → `docs/agent-memory/decisions/sprint-<id>.md` via skill `.claude/skills/decision-journal/SKILL.md`.

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with agent id, e.g. `dev-stock-price`)

**Step 0c — Load service documentation** → read `docs/architecture/microservice/<service>.md` for service context. Lazy-load other docs as needed per DDD layer touched.

**Standard check (three-branch dispatch on BUILD-STANDARD tag in handoff):**
```
if handoff contains `BUILD-STANDARD: full`:
  → Load docs/standards/microservice-build-standard.md (fail_loud: true)
  → Load docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (fail_loud: true)
  → Load docs/architecture-briefs/2026-05-22-refactor/07-phases.md (fail_loud: false)
  → Verify docs/data/pilot-status-<svc>.json exists; create from schema if absent (Phase 0)
  → Apply full three-tier sequence + G1–G12 as mandatory task gates
  → Engage QA at Phase 2 gate (relay required)
if handoff contains `BUILD-STANDARD: lean`:
  → Load docs/standards/microservice-build-standard.md (fail_loud: true)
  → Apply three-tier placement + fence + sandbox/replay + honest red/green DoD
  → Drive end-to-end solo; no relay required
if BUILD-STANDARD: not-applicable or tag absent:
  → Skip standard load (default maintenance mode)
```

**Pre-code checklist**
1. Confirm task status in `docs/data/orch/orch-state.json` `.task_board` (jq `.task_board.active_sprints[].tasks[] | select(.task_id=="NNN")`)
2. Branch setup — run exactly one of:
   - Branch exists: `git checkout task/NNN-kebab-description && git status` — verify clean, on correct branch
   - Branch missing: `git checkout main && git pull origin main && git checkout -b task/NNN-kebab-description`
   - VERIFY: `git branch --show-current` must equal `task/NNN-kebab-description` before touching any file
3. Read `docs/handoffs/TASK_NNN.md` first — use `files_to_read/modify/create` directly, skip redundant scanning
4. `depends_on` not Done → STOP, notify PM
5. Load knowledge files (fail-loud → `send_telegram(channel="bug", message="[dev-<service>] knowledge load failed for task:" + task_id)`, STOP)
6. **Zone restriction** — only touch files in `apps/<service>/`. If changes needed outside zone, STOP and notify PM.

**6b. Sprint-task lock — dispatcher holds it**
```
# INV-GATEWAY-1 (enforced 2026-06-07): commit-mutex/task_claim/task_release MCP calls are the
# dispatcher session's sole responsibility. This specialist agent does NOT call task_claim.
# The outer dev-team dispatcher holds the sprint-task lock for the duration of this spawn.
# Inner agents commit directly (explicit paths) and coordinate via file-based .head atomic writes (WF-1).
# Phase 4 activation: see docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md
```

7. **Before creating any new file** → look up canonical location in `docs/policies/docs-organization.md` table.

**TDD workflow — TypeScript/Bun services**
```
RED    → write apps/<service>/src/__tests__/NNN-task-name.test.ts → must FAIL
GREEN  → minimum code to pass → must PASS
REFACTOR → clean → still PASS
REPEAT per acceptance criterion
```
→ journal (MANDATORY per task): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<task_id from Pre-code checklist step 1 / task_board claim>"] (after implementation approach is chosen — WHY this option, not on terminal; routine work: `what-considered: "only path: <reason>"`, `why-change: "no change from plan"`)

**TDD workflow — Python/FastAPI services (pdf-extractor, rag-service)**
```
RED    → write apps/<service>/__tests__/test_NNN_task_name.py → must FAIL
GREEN  → minimum code to pass → must PASS
REFACTOR → clean → still PASS
REPEAT per acceptance criterion
```
- **After each TDD loop** → heartbeat:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
if hb.ok == false: → stolen-lock protocol per skill § Heartbeat (commit partial, BUG telegram, EXIT)
```

**After code — TypeScript/Bun**
→ journal (MANDATORY — pre-REVIEW gate): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<task_id from Pre-code checklist step 1 / task_board claim>"] (if no earlier entry was written yet for this task, write it now — minimum one entry per task before REVIEW; include any failure adaptation or approach change WHY)
1. `cd apps/<service> && bun test` — service tests pass
2. `bun tsc --noEmit` — 0 errors
3. **Commit directly** (INV-GATEWAY-1 — no mutex skill invocation from this specialist)
   `git add <exact own paths>` (NEVER `-A`/`.`) then `git commit` — format per `docs/policies/commit-convention.md`
   # INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
   # responsibility; this specialist commits directly (explicit paths) — no commit-mutex skill call here.

**After code — Python/FastAPI**
1. `cd apps/<service> && python -m pytest` — service tests pass
2. Type check if configured (mypy/pyright)
3. **Commit directly** (INV-GATEWAY-1 — no mutex skill invocation from this specialist)
   `git add <exact own paths>` (NEVER `-A`/`.`) then `git commit` — format per `docs/policies/commit-convention.md`
   # INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
   # responsibility; this specialist commits directly (explicit paths) — no commit-mutex skill call here.

**Documentation review** (after code passes, before QA):
→ Run flow: `docs/agents/developer/flow/doc-review.md` with `SERVICE=<service>`

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
- **Docs updated:** [docs/architecture/microservice/<service>/... — what changed] | NONE
- **Graphify:** updated ✓ | skipped (no docs impacted)
```

**Commit notebook** (before QA — direct, INV-GATEWAY-1):
```bash
# INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
# responsibility; inner specialist agents commit directly (explicit paths), no mutex skill call.
git add docs/agent-memory/notebooks/developer.md
git commit -m "chore(memory/developer): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**Lock handoff to QA** — same session, no release needed; QA will heartbeat + release.

**End-of-cycle notebook write**
→ skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with agent id; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Zone health observation (mandatory — 1 line):**
Before calling notebook-write, compose one "Zone health:" line summarising the zone state observed this cycle. Append it to the notebook entry:
```
Zone health: <metric or observation — e.g. "test coverage ~78% (-4%), 3 unused fixtures in stock-price module"> | HEALTHY
```
If nothing noteworthy: `Zone health: no drift detected`. This line is consumed by PO channel-audit to surface coverage or doc-drift signals without a user prompt.

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Update `docs/data/orch/orch-state.json` `.task_board`**: task status IN_PROGRESS → REVIEW (atomic write per §2.3) → return:
```
## RETURN
DONE: Implementation complete — SERVICE=<service>, CHANGED=[...], NEW_PASS=N, type-check clean
NEXT: qa | run full QA pipeline on branch task/NNN-kebab
REBUILD_REQUIRED: true — PO must dispatch ops (docker compose up -d --build <svc>) then qa (live verify) before marking DONE. See docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate.
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
