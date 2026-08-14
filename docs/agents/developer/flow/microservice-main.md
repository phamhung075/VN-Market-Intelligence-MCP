<!-- size-justification: 169L (+4L, 2026-08-07 FIX-DEVFLOW-MICROSERVICE-MAIN-NO-ERROR-BOUNDARY AC-1: added missing Error Boundary block pointing to fail-loud-protocol.md dev-pipeline SSOT) — shared base flow for all 9 dev-* zone agents; carries both TS/Bun and Python/FastAPI TDD workflows, zone-restriction rule, INV-GATEWAY-1 dispatcher-lock comments, doc-review chain, implementation record template, mandatory decision-journal steps, and RETURN schema; splitting would degrade usability for all 9 consumers. FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC 2026-08-14 (agent-father triage, `docs/agent-memory/decisions/sprint-TRIAGE-STALE-HEAD-FAMILY-20260814-po.md`): +16L (169→185) — new `.head` idle-reset step inserted on the SUCCESS/completion path, immediately after the task_board IN_PROGRESS→REVIEW update and before RETURN (AC-1), reusing the exact jq already proven at `docs/agents/developer/flow/main.md:72`/`fail-loud-protocol.md:174`, guarded so it only fires when `.head.active_task_id` still names the completing task (AC-2, never blind-null — a concurrent peer's pin must survive), citing `fail-loud-protocol.md:170-171`'s universal-executability sentence inline (AC-3) — closes the SOURCE-side half of the stale-`.head` family (the error/STOP path already had this idle-reset via fail-loud-protocol.md; the success path never did, by construction, for every dev-* specialist that inherits this shared flow). Adjacent drift fix (AC-4): `## Output` line's "on `task/NNN-*` branch" and the RETURN template's `NEXT:` line's "on branch task/NNN-kebab" marked SUPERSEDED (historical markers, not deleted) — same treatment `docs/agents/developer/flow/main.md` received 2026-08-05 (FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH). BLAST-RADIUS (AC-5): confirmed live 2026-08-14 by reading every dev-*/flow/main.md — 8 consumers (`dev-alert-engine`/`dev-api-gateway`/`dev-kinh-dich`/`dev-macro-indicators`/`dev-pdf-extractor`/`dev-rag-service`/`dev-stock-price`/`dev-technical-analysis`) are thin pointers that fully delegate to this file's success path and inherit the fix automatically. THREE do NOT: `dev-frontend`/`dev-mainserver-crawls`/`dev-vps-crawls` each carry their own self-contained flow/main.md with an independent task_board-update + RETURN block that never reaches this file's new step — their `.head` gap is UNFIXED by this change (`dev-mcp-server` is a fourth self-contained flow/main.md but is arguably out of this family per `developer/flow/main.md`'s own "known drift" note — it targets `apps/mcp-server/` root, not a `microservice-main.md` zone). Full coverage is NOT claimed; flagged via RETURN for PO to mint follow-up rows against the 3 (or 4) independent flow files. -->
# Microservice Developer — Main Flow

**Scope:** Any `apps/<service>/` zone (TypeScript/Bun or Python/FastAPI). All 9 dev-* zone agents share this flow. The `apps/mcp-server/` root uses [`main.md`](./main.md) instead.

**Tools:** `docs/agents/tools/package/developer.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests <!-- SUPERSEDED (doc-self-heal 2026-08-14, FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC AC-4): original text read "on `task/NNN-*` branch" — dead branch prose, contradicting CLAUDE.md § Defaults ("NO branches — all work stays on main"); same treatment `docs/agents/developer/flow/main.md` received 2026-08-05 (FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH) — kept here as a historical marker, not deleted. --> committed directly to `main` | `[Developer] Implementation Record` in handoff | PM/QA notified

---

> Error boundary → `docs/protocols/fail-loud-protocol.md` § "Error Boundary — Blocked Flow = EXIT" — the dev-pipeline SSOT for this shared flow (all 8/9 dev-* zone agents resolve here; do NOT use the cowork `.claude/skills/cowork-error-boundary/SKILL.md` contract — it prescribes gateway calls this specialist class holds no grant for and omits the `.head` idle-reset). Step 0 STOP-RELEASE (`.head` idle-reset, plain `jq` + `orch-apply.sh`, no MCP required) is mandatory-FIRST — run it BEFORE the Step 1 BUG telegram.

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
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })
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

**Simplicity gate** (before REVIEW) → skill: `.claude/skills/simplicity-gate/SKILL.md`
Run after all tests GREEN and code committed. Self-check: all 4 questions NO (or simplify + re-run).
Certify in handoff Implementation Record before proceeding to documentation review.

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
git commit -m "chore(memory/developer): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/developer.md
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

**Update `docs/data/orch/orch-state.json` `.task_board`**: task status IN_PROGRESS → REVIEW (atomic write per §2.3).

**`.head` idle-reset — SUCCESS path (FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC AC-1/AC-2/AC-3, mandatory, run immediately after the task_board update above, before RETURN):** this specialist just self-lane-moved its own row into `review[]`/`next_agent=qa` above — INV-GATEWAY-1 means it cannot call `task_release`/write `.head` via MCP, but the `.head` idle-reset below IS executable by all agents (plain `jq` + atomic rename, no MCP needed) and applies to ALL agents regardless of MCP binding — `docs/protocols/fail-loud-protocol.md:170-171`. Reuses the EXACT jq already proven in-repo at `docs/agents/developer/flow/main.md:72` / `fail-loud-protocol.md:174`. **GUARD (AC-2, mandatory, not optional):** reset ONLY when `.head.active_task_id` still names THIS task — never blind-null; a concurrent peer's head pin on a different task must survive.
```bash
head_active_task=$(jq -r '.head.active_task_id' docs/data/orch/orch-state.json)
if [ "$head_active_task" = "$task_id" ]; then
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg s "idle" --arg t "$now" --arg u "dev-<service>" \
    '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
    docs/data/orch/orch-state.json \
    | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
fi
```

**NEXT line note (SUPERSEDED, doc-self-heal 2026-08-14, FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC AC-4):** the RETURN template's `NEXT:` line previously read "run full QA pipeline on branch task/NNN-kebab" — dead branch prose, contradicting CLAUDE.md § Defaults ("NO branches — all work stays on main"); corrected below. Same treatment `docs/agents/developer/flow/main.md` received 2026-08-05 (FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH) — kept here as a historical marker, not silently deleted.

Return:
```
## RETURN
DONE: Implementation complete — SERVICE=<service>, CHANGED=[...], NEW_PASS=N, type-check clean
NEXT: qa | run full QA pipeline
REBUILD_REQUIRED: true — PO must dispatch ops (docker compose up -d --build <svc>) then qa (live verify) before marking DONE. See docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate.
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
