# BA Spec — ORCH-TASK-CANON
**Sprint:** ORCH-TASK-CANON
**BA task:** BA-ORCH-TASK-CANON
**Written:** 2026-06-06T19:10:00Z
**Next:** architect (confirm schema SSOT location + migration strategy + ops-lane task shape, then dispatch F1/F2/F3/F4/QA)

---

## Context (BA raw-read, not relayed)

Sprint ORCH-TASK-CANON closes the 3-layer creation/serving/rendering gap that leaves decision trails invisible on the orchestration dashboard. The PO diagnosis is requirement-grade; this spec verifies, maps, and surfaces edge cases only.

**Raw-verified source state (2026-06-06):**

### LAYER 1 — Creation (task shape chaos)
- `docs/data/orch/orch-state.json` `.task_board.done[]` = 66 rows
- Field presence: 65/66 have `task_id` (1 null = nested container), 52/66 have `title`, 21/66 have `owner`, 48/66 have `zone`, 2/66 have `created_at`, 5/66 have `id` (legacy)
- Status strings across done[] only: `DONE` (45), `DONE-LIVE-VERIFIED` (15), `SUPERSEDED` (2), `DONE-VERIFIED` (2), `RESOLVED-BY-SSL-FIX` (1), `DONE-RECONCILED` (1)
- Status strings across ALL arrays (done + active_sprints tasks + backlog): 27 distinct freeform strings
- 1 nested container in done[]: `{id: "ORCH-DASH-DECISION-DRILLDOWN", tasks: [...6 items]}` — the ORCH-DASH-DECISION-DRILLDOWN sprint was stored as a sprint-container in done[] instead of being flattened. Its 6 child tasks already have canonical fields (task_id/title/owner/status/zone).
- Task-creating flows emit non-canonical shapes today:
  - po/flow/sprint-kickoff.md line 28: backlog entry as `{id: "BA-NNN", summary: "...", priority: "..."}` (no title/owner/status/zone/created_at)
  - po/flow/triage-signals.md: backlog append uses `{id: "...", summary: "...", priority: "..."}` shape (repair_task_request + zone_missing_tier3 handlers)
  - pm/flow/main.md line 58: task shape `{task_id, title, type, owner, depends, status, size}` — missing zone in template (zone mentioned as mandatory in prose but not enforced in JSON snippet)
  - ba/flow/main.md output block uses `{id: "BA-NNN", summary: "...", priority: "..."}` — backlog shape, not canonical task
  - anomaly-task-bridge SKILL: backlog append `{id: "{check_id}-FIX", summary: "...", priority: "..."}` — no title/owner/status/zone/created_at
  - po/flow/channel-audit.md: task entries with zone but no standard shape enforced
  - dev-team drain/triage flows: task_claim/task_release wrappers do not write tasks to task_board

### LAYER 2 — Serving (orchestrationHandler.ts)
- File: `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` (327L, already read)
- `buildOrchestrationDto` flattens `task_board.active_sprints[].tasks[]` only → serves 157 tasks from active_sprints, zero from done[]
- `OrchTaskBoardDto.tasks` = active sprint tasks only; `done` field NOT in DTO (done count is in `counts.done` from orchStateStore countTasksFromTaskBoard, but no done[] array)
- Recent tasks (ARCH-ORCH-F1, FIX-VPS-SSC-CURL-SCRAPER) ARE in `active_sprints` tasks — confirmed by raw jq; they are served in `tasks[]`. But done[] rows (66 items) are never served.
- `decisions.by_task` join depends on served `tasks[].id` matching a journal STEP `task_id` — if done tasks are not in `tasks[]`, clicking a done task shows empty (join starved)
- `projectTask()` already coalesces `task_id || id` for the id field, and falls back `title || resolvedId` for title — coalesce logic is present but never reaches done[]
- `orchStateStore.ts` `OrchStateTaskBoardTask`: uses `task_id` as canonical field; `id` optional legacy. No `created_at` field in the TypeScript interface yet.
- `countTasksFromTaskBoard()` counts from `active_sprints` only — done count is from iterating those tasks with DONE status, NOT from `.task_board.done[]`

### LAYER 3 — Frontend + Journal
- `apps/frontend/app/routes/dashboard.orchestration.tsx` line 339: `tasks.filter((t) => t.status === "DONE")` exact-string filter — misses 15 variants (`DONE-LIVE-VERIFIED`, `DONE-VERIFIED`, etc.)
- `DoneTaskGroup` and `DecisionAccordion` components already exist and are shipped (ORCH-DASH-DECISION-DRILLDOWN F3 complete)
- `TaskBoard` interface in frontend has `tasks: TaskRow[]` only — no `done: TaskRow[]` field yet
- `sprint-2026-06-06.md` freeform structure (lines 1-21): uses `## STEP —` heading format + free prose, not parseable by journalStore's `RE_STEP_HEADER = /^### STEP (\S+) · (\S+) · (\S+)/`. PO entry (lines 22-31) IS in correct format (written as live proof).
- Decision-journal SKILL `§ Resolve Sprint ID` resolves via `jq -r '.sprint_goal.entries[0].id // empty'` — but entries carry `sprint_id` not `id` → always empty → silent date fallback `YYYY-MM-DD` → journal file mismatch for sprint-named journals

**Serving layer CONFIRMED:** `apps/mcp-server` orchestrationHandler.ts. NOT the Go api-gateway. Zone owner for F2 = `dev-mcp-server`.

---

## Requirements

### FR-1: Canonical Task Schema Contract + One-Shot Migration
**DDD layer:** domain (schema definition) + infrastructure (migration) + all flows (creation enforcement)
**Owner zone:** F1a = agent-father (flow + skill edits) | F1b = agent who runs the migration script (ops or dev-mcp-server)

#### FR-1-1: Schema SSOT definition
The canonical task object SSOT must be authored as a formal definition block (comment block in orchStateStore.ts or a dedicated docs/standards/ file, architect decides location).

Mandatory-at-creation fields:
```
id          — string, unique, kebab-case (e.g. "FIX-VPS-SSC-CURL-SCRAPER")
title       — string, ≤120 chars, human-readable description
owner       — string, agent-id (e.g. "dev-mcp-server", "ops", "qa")
status      — string, MUST be one of the closed enum below
zone        — string, one of: "apps/<service>/", "multi", "cross-service/", "docs/agents/", "infra-vps", "corpus", "qa"
created_at  — string, ISO-8601 UTC (e.g. "2026-06-06T18:32:39Z")
```

Closed status enum (7 values):
```
TODO | IN_PROGRESS | REVIEW | DONE | BLOCKED | CANCELLED | DEFERRED
```

Optional standard fields (allowed, not required at creation):
```
type        — string (e.g. "sprint-task", "CHORE", "FIX", "SPIKE")
sprint      — string, sprint_id this task belongs to
priority    — string ("high", "normal", "low")
size        — string ("XS", "S", "M", "L")
files       — string[], file paths this task touches
depends     — string | null, task_id of blocking task
note        — string, free-form context
status_note — string, nuance on the status (replaces freeform suffixes like "-LIVE-VERIFIED")
closed_at   — string, ISO-8601 UTC
```

**BANNED forward (must not appear in any new task):** `task_id` (use `id`), `desc` (use `title`), `label` (use `title`), `summary` (use `title`).

Status normalization rule: freeform status strings (DONE-LIVE-VERIFIED, DONE-VERIFIED, DONE-RECONCILED, DONE-WITH-CAVEATS, DONE-CODE-LIVE-PENDING-BACKFILL, etc.) must become `status: "DONE" + status_note: "<prior suffix>"`. SUPERSEDED → `CANCELLED` + `status_note: "superseded"`. RESOLVED-BY-SSL-FIX → `DONE` + `status_note: "resolved-by-ssl-fix"`. PARTIAL-DONE-ACCEPTED → `DONE` + `status_note: "partial-done-accepted"`.

DEFERRED-* variants (DEFERRED-INFRA, DEFERRED-PRODUCT, DEFERRED-SEQUENCED, etc.) → `DEFERRED` + `status_note: "<suffix>"`.

BACKLOG (used in active_sprints tasks) → `TODO`. BATCHED → `IN_PROGRESS` or `TODO` per context. BLOCKED-UPSTREAM → `BLOCKED` + `status_note: "blocked-upstream"`. CLOSED-NO-CHANGE / CLOSED-NOT-REPRO → `CANCELLED` + `status_note: "closed-no-change"` or `"closed-not-repro"`.

#### FR-1-2: One-shot migration of done[] rows
Migration is a jq script (written to file, run via `jq -f migration.jq`, atomic temp→rename + sentinel verify — jq-empty-guard lesson):

Migration rules per row in `.task_board.done[]`:
- `id` ← `task_id // id` (coalesce; prefer task_id)
- `title` ← `title // desc // label // id` (coalesce; never null)
- `owner` ← `owner // "unknown"` (null → "unknown"; do not drop)
- `status` ← normalize per FR-1-1 status normalization rule
- `status_note` ← if status was freeform, capture suffix; else omit
- `zone` ← `zone // "unknown"` (null → "unknown"; do not drop)
- `created_at` ← `created_at // closed_at // "unknown"` (best-available)
- Remove banned fields: `task_id`, `desc`, `label`, `summary` from migrated rows

Migration of nested container: the one entry with `tasks` key (ORCH-DASH-DECISION-DRILLDOWN container) must be flattened — its 6 child tasks promoted directly into `done[]` as flat rows (they already have canonical fields). The container row itself is dropped.

After migration: done[] must have all `id`, `title`, `owner`, `status`, `zone`, `created_at` fields on every row. Verify with jq sentinel before rename.

#### FR-1-3: All task-creating flows fixed to emit canonical shape
Flows that create tasks and must be updated by agent-father:

1. **po/flow/sprint-kickoff.md** — BA backlog entry: change from `{id, summary, priority}` to canonical shape. Minimum: `{id, title, owner: "ba", status: "TODO", zone: "multi", created_at: <ISO-UTC>}`.

2. **po/flow/triage-signals.md** — `repair_task_request` handler and `zone_missing_tier3` handler: backlog append must use canonical shape.

3. **po/flow/channel-audit.md** — task entries emitted for bugs/corrections: canonical shape.

4. **pm/flow/main.md** — task JSON shape comment (line 58): add `zone`, `created_at` to the required fields in the template.

5. **ba/flow/main.md** — output block uses old backlog `{id, summary, priority}` shape: update to canonical task shape.

6. **anomaly-task-bridge SKILL** — backlog append: canonical shape.

7. **ops lane** (wherever ops creates tasks in orch-state): canonical shape if applicable.

**AC (F1):**
- Schema SSOT exists as a formal definition (location per architect).
- done[] in SSOT has 0 rows without `id`, `title`, `owner`, `status`, `zone`, `created_at` after migration.
- ORCH-DASH-DECISION-DRILLDOWN container is absent; its 6 tasks are top-level done[] rows.
- done[] has 0 rows with `task_id`, `desc`, `label`, `summary` keys.
- All status strings in done[] are in `{TODO,IN_PROGRESS,REVIEW,DONE,BLOCKED,CANCELLED,DEFERRED}` after migration.
- At least one task created by po/pm/ba/dev-team after F1 ships validates against the schema (zero banned keys).
- BA-ORCH-TASK-CANON itself carries canonical schema (dogfood — already verified in orch-state.json).
- Migration uses `jq -f` + `[ -s tmp ]` + `jq -e '.task_board.done[0].id'` sentinel before rename.

---

### FR-2: Serving Layer — Coalesce, Flatten, Serve done[]
**DDD layer:** interface (DTO projection + HTTP handler) + infrastructure (orchStateStore type update)
**Owner zone:** dev-mcp-server (`apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts`, `apps/mcp-server/src/infrastructure/orchStateStore.ts`)

#### FR-2-1: OrchTaskBoardDto gains done[] field
```ts
export interface OrchTaskBoardDto {
  counts: { done: number; in_progress: number; backlog: number };
  tasks: OrchTaskDto[];   // active sprint tasks (existing, unchanged)
  done: OrchTaskDto[];    // NEW — projected from task_board.done[] SSOT
}
```

#### FR-2-2: OrchTaskDto gains status_note + created_at
```ts
export interface OrchTaskDto {
  id: string;
  title: string;
  status: string;
  owner: string;
  zone: string;
  status_note?: string;    // NEW — optional
  created_at?: string;     // NEW — optional
}
```

#### FR-2-3: projectTask() extended — coalesce id//task_id, title//desc//label
`projectTask()` already handles `task_id || id` for id and `title || resolvedId` for title. Extend to also coalesce:
- `title` fallback chain: `title // desc // label // resolvedId`
- `status_note` if present: pass through
- `created_at` if present: pass through
- Never crash on missing fields — all fallbacks are already defined.

#### FR-2-4: buildOrchestrationDto serves done[]
```ts
// Project done[] from SSOT (legacy-tolerant, same projectTask() coalesce)
const doneTasks: OrchTaskDto[] = (taskBoard.done ?? []).flatMap((item) => {
  // Flatten nested containers: if item has .tasks[], project each child
  if (Array.isArray((item as Record<string, unknown>)["tasks"])) {
    return ((item as Record<string, unknown>)["tasks"] as OrchStateTaskBoardTask[])
      .map(projectTask);
  }
  return [projectTask(item as OrchStateTaskBoardTask)];
});
```
This handles any residual nested container that survives F1 migration — no-crash invariant.

#### FR-2-5: orchStateStore.ts type update
`OrchStateTaskBoardTask` gains optional fields:
```ts
status_note?: string;
created_at?: string;
```
`OrchStateTaskBoard` gains:
```ts
done?: OrchStateTaskBoardTask[];  // may be absent in legacy states
```

#### FR-2-6: Legacy-tolerant, no-crash
- `taskBoard.done` absent → `done: []` in DTO
- Nested container in done[] → flatten via tasks[] child projection
- Any missing field in a done[] row → fallback strings (never null/undefined in DTO output)

#### FR-2-7: Counts — include done[] rows
Current `countTasksFromTaskBoard` counts DONE tasks only from active_sprints. After F2, `counts.done` must equal `taskBoard.done?.length ?? 0` + active_sprint DONE tasks (or just `done[].length` — architect decides precedence; recommend: SSOT done[] length is authoritative, active_sprint DONE tasks are in counts.in_progress transitional period).

**Simplest correct rule:** `counts.done = (taskBoard.done ?? []).length`. Active sprint tasks with DONE status are transitional; they migrate to done[] at close. Architect confirms.

#### FR-2-8: REBUILD required
After F2 ships, mcp-server container MUST be rebuilt (not restarted). QA verifies on running container.

**AC (F2):**
- `curl :3000/api/orchestration | jq '.task_board.done | length'` returns 66 (SSOT count, post-migration) or non-null.
- `curl :3000/api/orchestration | jq '.task_board.done[] | select(.id == "FIX-VPS-SSC-CURL-SCRAPER")'` returns a non-empty object.
- `curl :3000/api/orchestration | jq '.task_board.done[] | select(.id == "ARCH-ORCH-F1")'` returns a non-empty object (from flattened nested container).
- `decisions.by_task["FIX-VPS-SSC-CURL-SCRAPER"]` is joinable (journal must have a task-id stamped entry — F4 enables this for new tasks; legacy = sprint_bucket).
- No TypeScript compilation errors.
- Existing fields (`head`, `task_board.tasks`, `signal_queue`, `sprint_goal`, `narrative`, `decisions`) are byte-for-byte unchanged for unchanged orch-state.json input.

---

### FR-3: Frontend — Done-Group Filter Normalization
**DDD layer:** interface (Remix route component)
**Owner zone:** dev-frontend (`apps/frontend/app/routes/dashboard.orchestration.tsx`)

#### FR-3-1: TaskBoard interface gains done[]
```ts
interface TaskBoard {
  counts: TaskBoardCounts;
  tasks: TaskRow[];
  done?: TaskRow[];   // NEW — optional for backward-compat during rolling deploy
}
```

#### FR-3-2: Done group source changed
`DoneTaskGroup` currently receives `tasks.filter((t) => t.status === "DONE")` — which misses 15 DONE variants. After F2 ships done[] in the DTO, the done group source changes to `board.done ?? []`. The filter `tasks.filter(...)` is removed for the done group.

If F2 has not yet shipped (rolling deploy tolerance): fall back to `tasks.filter((t) => t.status === "DONE" || t.status.startsWith("DONE"))` as interim. Architect decides which deploy path.

**Note:** After F1 migration, all status strings in done[] are closed enum. The `startsWith("DONE")` fallback is only needed if F3 ships before F1 migration completes — prefer shipping F1 migration first.

#### FR-3-3: Live dropdown verify
QA must click a DONE task that has `decisions.by_task[id]` populated in the API response and confirm the accordion renders STEP fields. This is the live end-to-end proof — not a green badge.

**AC (F3):**
- Dashboard done group is non-empty and includes ex-`DONE-LIVE-VERIFIED` tasks (now `DONE` + note) that were previously hidden.
- At least one done task with journal entries shows STEP detail on click.
- TypeScript compiles clean.
- Existing accordion components (`DecisionAccordion`, `DoneTaskGroup`) function identically — this is an additive data-source fix, not a component rewrite.

---

### FR-4: Journal Format Enforcement + Skill Resolver Bug Fix
**DDD layer:** skill (cross-cutting) + agent-flow (dev-team triage)
**Owner zone:** agent-father (SKILL.md + dev-team triage flow + freeform entry rewrite)

#### FR-4-1: SKILL resolver bug fix
Decision-journal SKILL `§ Resolve Sprint ID` currently resolves via:
```bash
SPRINT_ID=$(jq -r '.sprint_goal.entries[0].id // empty' docs/data/orch/orch-state.json 2>/dev/null)
```
The field is `sprint_id`, not `id`. Fix:
```bash
SPRINT_ID=$(jq -r '
  .sprint_goal.entries[]
  | select(.status == "active" or .status == "OPEN")
  | .sprint_id
  | select(. != null and . != "")
' docs/data/orch/orch-state.json 2>/dev/null | head -1)
[ -z "$SPRINT_ID" ] && SPRINT_ID=$(date -u +"%Y-%m-%d")
```
This resolves the active sprint_id correctly. If no active entry exists, falls back to date (existing behavior for ambient/triage cycles).

#### FR-4-2: dev-team triage flow — journal write enforcement
The current dev-team triage flow writes freeform `## STEP —` blocks (not `### STEP` SKILL format). The freeform section in `sprint-2026-06-06.md` lines 1-21 is unparseable by `RE_STEP_HEADER`.

Fix: dev-team triage post-cycle step (or drain-esc-dispatch) must call the decision-journal SKILL `§ Write Entry` exactly, producing parseable `### STEP <step-id> · <agent-id> · <ISO-timestamp>` blocks. Dev-team triage cycles do not have a single task_id in scope (they process multiple); they should stamp `task-id:` on each STEP they write if a specific task is in scope, or omit it (sprint_bucket fallback) for ambient triage observations.

#### FR-4-3: Rewrite sprint-2026-06-06.md freeform entries
The freeform block (lines 6-21 in sprint-2026-06-06.md) must be rewritten as a valid STEP block so the existing triage decisions gain journalStore visibility. The PO entry (lines 22-31) is already correctly formatted and must not be touched.

Rewrite rule: one new `### STEP rtr-S1 · dev-team · 2026-06-06T12:37:13Z` block covering the existing triage decision content. No `task-id:` (ambient triage = sprint_bucket). Extract: `what-done`, `what-considered` (≤4 bullets), `why-decision`, `why-change`. 12-line cap per STEP.

**AC (F4):**
- `jq -r '.sprint_goal.entries[] | select(.status == "active") | .sprint_id'` returns `"ORCH-TASK-CANON"` (live test after sprint is active).
- Decision-journal SKILL resolves to `sprint-ORCH-TASK-CANON.md` for the active sprint, not to `sprint-2026-06-06.md`.
- `parseJournalFile(content, "2026-06-06")` called on the rewritten `sprint-2026-06-06.md` returns `steps.length >= 2` (the rewritten triage step + the PO step).
- A fresh dev-team triage cycle's journal entry is discoverable via `curl :3000/api/orchestration | jq '.decisions.sprint_bucket["2026-06-06"]'` — non-null.
- Zero `## STEP` (freeform h2) blocks in any agent-produced journal file going forward.

---

## NFRs

- **NFR-1 Atomic writes.** Every orch-state.json mutation uses `jq -f file.jq` (not inline heredoc), writes to sibling tmp, verifies `[ -s "$tmp" ] && jq -e '.task_board.done[0].id' "$tmp"` sentinel, then `mv tmp target`. No inline jq heredoc filters (jq-empty-guard lesson).
- **NFR-2 No-crash invariant.** F2 serving must tolerate any legacy shape in done[] (missing fields, nested containers) without crashing the GET /api/orchestration endpoint. Defensive fallbacks on every field.
- **NFR-3 Commit-mutex for orch-state writes.** All direct orch-state.json writes (migration, flow task creations) must acquire commit-mutex before the write+commit step.
- **NFR-4 No branches.** All work on main.
- **NFR-5 REBUILD, not restart.** After F2 (mcp-server) and F3 (frontend) ship, ops must rebuild the respective container. QA verifies on running container, not against a build badge.
- **NFR-6 Dogfood.** Every task created for this sprint (architect task, pm tasks, dev tasks) carries canonical schema from creation. BA-ORCH-TASK-CANON already carries canonical schema (verified: has id, title, owner, status, zone, created_at in orch-state.json).
- **NFR-7 Decision entry per task.** Before DONE/REVIEW, every ORCH-TASK-CANON task must have a journal entry in `sprint-ORCH-TASK-CANON.md` stamped with its task-id. This is how the sprint self-dogfoods the decision-visibility feature.

---

## Edge Cases

- **EC-1 done[] absent in SSOT.** Before F1 migration runs, the `.task_board` may have no `done` key at all (if schema drift removed it). F2 must handle `taskBoard.done ?? []` — no crash.
- **EC-2 Nested container survives migration.** If agent-father migration script fails to flatten the ORCH-DASH-DECISION-DRILLDOWN container, F2's `flatMap` guard (check for `.tasks[]` key) must still serve its children rather than crashing. The container row itself returns no task (filtered out as non-task by the guard).
- **EC-3 Status string outside enum in done[] post-migration.** Migration should normalize all 27 variants. Any residual freeform string in done[] must still render in the frontend (the `status` field in OrchTaskDto is `string`, not a literal union — display is best-effort).
- **EC-4 duplicate ids in done[].** If migration produces duplicate `id` values (two rows with same task_id), `decisions.by_task` still works (multiple rows with same id just appear twice in the done group). Not an F2 crash risk.
- **EC-5 Journal file for ORCH-TASK-CANON does not exist yet.** `getDecisionsForSprints(["ORCH-TASK-CANON"], dir)` returns empty maps — no crash. AC: `sprint-ORCH-TASK-CANON.md` must exist with at least one parseable STEP before QA verifies the end-to-end join.
- **EC-6 sprint_goal.entries has no active entry.** Skill resolver fallback to date is correct behavior for ambient triage cycles. The fix must not break this fallback.
- **EC-7 `counts.done` double-counting.** If active_sprint tasks with DONE status are also moved to done[], they must not be double-counted. Architect decides the counting rule (simplest: done[].length is authoritative; active_sprint DONE tasks are excluded from counts once migrated).

---

## Blockers (BA-identified — for architect resolution)

**No PO blockers.** All decisions are encoded in the sprint goal. The following are architect-level decisions needed before dispatch:

- **BLOCKER-1 (schema SSOT location):** Where does the canonical task schema definition live? Options: (A) comment block in `orchStateStore.ts` interface `OrchStateTaskBoardTask` (co-located with the TypeScript type), (B) `docs/standards/task-schema.md` prose file, (C) both. Recommendation: A (TypeScript interface is the authoritative enforcer; prose in docs/ is optional). Architect confirms before agent-father edits flows.
- **BLOCKER-2 (counts.done rule):** After done[] is served, `counts.done` must be authoritative. Confirm: `counts.done = (taskBoard.done ?? []).length` and active_sprint DONE tasks are excluded from counts (they are transitional — PM moves them to done[] at sprint close). Architect confirms.
- **BLOCKER-3 (F3 rollout order):** F3 ships after F2 (done[] in DTO). Confirm F3 can use `board.done ?? []` as primary source, with no filter fallback needed (relying on F1 migration normalizing all status strings before F3 deploy). Architect confirms or specifies interim fallback.
- **BLOCKER-4 (migration runner):** Who runs the one-shot migration jq script? Options: (A) dev-mcp-server as part of F2 (script in repo, run manually on deploy), (B) agent-father as part of F1 flow edits (runs the migration commit). Recommendation: A — dev-mcp-server owns the migration, commits it, runs it as part of F2 prep. Architect assigns.

---

## Dependency Chain

```
F1a: agent-father — schema SSOT + all task-creating flows fixed
F1b: migration script — one-shot done[] normalization + nested-container flatten
F4:  agent-father — skill resolver bug fix + dev-team triage flow + 2026-06-06 rewrite
  (F1a and F4 are disjoint files — parallel)
       ↓
F2:  dev-mcp-server — OrchTaskBoardDto.done[] + counts.done + projectTask() extension + REBUILD
       ↓
F3:  dev-frontend — board.done as done group source + REBUILD
       ↓
QA:  live-verify whole join (curl + SSR markup + decision accordion)
```

---

## DDD Layer Map

| Sub-feature | DDD Layer | Module |
|---|---|---|
| F1a: Schema SSOT definition | Domain (value object constraint) | orchStateStore.ts interface OR docs/standards/ |
| F1a: Flow fixes (po/pm/ba/anomaly-bridge) | Skill/flow (cross-cutting) | docs/agents/*/flow/*.md + .claude/skills/ |
| F1b: Migration jq script | Infrastructure (data migration) | jq script file, run against docs/data/orch/orch-state.json |
| F2: OrchStateTaskBoard.done[] type | Infrastructure (store type) | orchStateStore.ts |
| F2: OrchTaskBoardDto.done[] + OrchTaskDto extension | Interface (DTO) | orchestrationHandler.ts |
| F2: buildOrchestrationDto done[] projection | Interface (projection) | orchestrationHandler.ts |
| F2: Nested-container flatten guard | Interface (projection) | orchestrationHandler.ts |
| F3: TaskBoard interface done[] | Interface (Remix loader type) | dashboard.orchestration.tsx |
| F3: Done group source board.done | Interface (Remix component) | dashboard.orchestration.tsx |
| F4: SKILL resolver bug fix | Skill (cross-cutting) | .claude/skills/decision-journal/SKILL.md |
| F4: dev-team triage journal enforcement | Skill/flow | docs/agents/dev-team/flow/ |
| F4: sprint-2026-06-06.md freeform rewrite | Infrastructure (data) | docs/agent-memory/decisions/sprint-2026-06-06.md |

---

## Architect Hand-off Items

1. Confirm schema SSOT location (BLOCKER-1) — TypeScript interface vs docs/standards/ vs both.
2. Confirm counts.done rule (BLOCKER-2) — `done[].length` authoritative; active_sprint DONE tasks excluded once migrated.
3. Confirm F3 rollout order (BLOCKER-3) — `board.done ?? []` primary source after F1 migration.
4. Assign migration runner (BLOCKER-4) — recommend dev-mcp-server.
5. Dispatch: F1a + F4 (agent-father, parallel, disjoint files) → F1b migration → F2 (dev-mcp-server + REBUILD) → F3 (dev-frontend + REBUILD) → QA.
6. Confirm EC-7 counts double-counting rule before F2 implementation.
