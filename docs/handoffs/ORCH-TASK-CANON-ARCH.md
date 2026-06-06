# ORCH-TASK-CANON — Architect Brownfield Findings

**Sprint:** ORCH-TASK-CANON
**Architect task:** ARCH-ORCH-TASK-CANON
**Written:** 2026-06-06T20:15:00Z
**Input:** docs/handoffs/ORCH-TASK-CANON-BA-spec.md (commit f9a269cc) + docs/architecture-briefs/2026-06-06-workflow-fluidity-audit.md (F-4/F-5 addendum)
**Next:** pm

---

## [Architect] Brownfield Findings

### Zone

Multi-zone sprint — four distinct zones:

| Feature | Zone | Dev agent |
|---|---|---|
| F1a: flow + skill edits | `docs/agents/` + `.claude/skills/` | agent-father |
| F1b: one-shot jq migration | `docs/data/orch/` (script file only) | agent-father (runs migration as part of F1b) |
| F4: decision-journal SKILL + dev-team triage flow + sprint-2026-06-06.md rewrite | `.claude/skills/` + `docs/agents/dev-team/` + `docs/agent-memory/decisions/` | agent-father |
| F2: serving layer DTO + counts | `apps/mcp-server/` | dev-mcp-server |
| F3: done-group source swap | `apps/frontend/` | dev-frontend |

PM must split into per-agent subtasks: agent-father (F1a+F1b+F4 merged), dev-mcp-server (F2), dev-frontend (F3), qa.

---

### Verified Paths

**apps/mcp-server/ (F2)**
- `apps/mcp-server/src/infrastructure/orchStateStore.ts:49–83` — `OrchStateTaskBoardTask`, `OrchStateTaskBoard`. Both need new optional fields; `OrchStateTaskBoard.done?` is absent today.
- `apps/mcp-server/src/infrastructure/orchStateStore.ts:251–273` — `countTasksFromTaskBoard()`: counts only `active_sprints`. Must be replaced with `done?.length ?? 0` rule.
- `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts:62–86` — `OrchTaskDto` (no `status_note`, no `created_at`), `OrchTaskBoardDto` (no `done[]` field).
- `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts:143–159` — `projectTask()`: coalesces `task_id||id` and `title||resolvedId` — extend to also pass through `status_note` and `created_at`.
- `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts:232–296` — `buildOrchestrationDto()`: add `doneTasks` projection from `taskBoard.done ?? []` with `flatMap` nested-container guard.
- `apps/mcp-server/src/infrastructure/journalStore.ts:284–300` — `getDecisionsForSprints()`: currently resolves a SINGLE file path per sprint id (`sprint-${id}.md`). Must change to glob `sprint-${id}-*.md` pattern (per-agent file fix from F-4 audit addendum). See F2 journalStore extension below.

**apps/frontend/ (F3)**
- `apps/frontend/app/routes/dashboard.orchestration.tsx:84–88` — `TaskBoard` interface: add `done?: TaskRow[]`.
- `apps/frontend/app/routes/dashboard.orchestration.tsx:325–343` — `TaskBoardPanel`: `done` derivation currently `tasks.filter((t) => t.status === "DONE")`. Replace with `board.done ?? []`.

**docs/ (F1a, F1b, F4)**
- `.claude/skills/decision-journal/SKILL.md:17–21` — `§ Resolve Sprint ID`: buggy jq expression (`entries[0].id` instead of `entries[] | select(.status == "active") | .sprint_id`). Fix in F4.
- `.claude/skills/decision-journal/SKILL.md:20–21` — `JOURNAL_PATH`: must change from `sprint-${SPRINT_ID}.md` to `sprint-${SPRINT_ID}-${AGENT_ID}.md` (per-agent files, F-4 addendum).
- `docs/agents/po/flow/sprint-kickoff.md` — backlog shape `{id, summary, priority}` → canonical.
- `docs/agents/po/flow/triage-signals.md` — repair_task_request + zone_missing_tier3 → canonical.
- `docs/agents/po/flow/channel-audit.md` — task entries → canonical.
- `docs/agents/pm/flow/main.md:58` — task JSON template: add `zone`, `created_at` fields.
- `docs/agents/ba/flow/main.md` — output block backlog shape → canonical.
- `.claude/skills/anomaly-task-bridge/SKILL.md` — backlog append → canonical.
- `docs/agents/dev-team/flow/` (triage/drain sub-flows) — journal write must call SKILL `§ Write Entry` format, not freeform `## STEP`.
- `docs/agent-memory/decisions/sprint-2026-06-06.md:1–21` — freeform block → rewrite as `### STEP rtr-S1 · dev-team · 2026-06-06T12:37:13Z` block (no task-id, ambient triage).
- `docs/data/orch/` — migration jq script (new file, F1b); run against `docs/data/orch/orch-state.json`.

---

### Blocker Rulings (4 BA-identified)

**BLOCKER-1 (schema SSOT location) — RULING: BOTH (A + B), authoritative = TypeScript interface**

The schema SSOT lives in TWO places with clear authority hierarchy:

1. **`apps/mcp-server/src/infrastructure/orchStateStore.ts` — machine-authoritative.** The `OrchStateTaskBoardTask` interface is already the canonical TypeScript type for all task rows. It must be updated to:
   - Rename: canonical field becomes `id` (not `task_id`) — matches BA FR-1-1 ("BANNED: task_id in new tasks; use id"). The TypeScript interface must be refactored from `task_id: string` to `id: string` as the mandatory field; `task_id?: string` becomes the legacy-tolerance optional (reverse of current). Note: this is a breaking change to the interface — `projectTask()` coalesce logic stays the same, but the field declarations invert. See design note below.
   - Add optional `status_note?: string`, `created_at?: string`, `closed_at?: string`, `sprint?: string`, `priority?: string`, `size?: string`, `type?: string`, `files?: string[]`, `depends?: string | null`, `note?: string`.
   - Add `OrchStateTaskBoard.done?: OrchStateTaskBoardTask[]`.
   - Add a JSDoc comment block above `OrchStateTaskBoardTask` declaring the canonical schema, the closed status enum, and the banned fields — this is the **machine-adjacent SSOT** (TypeScript enforces the shape; the JSDoc makes the intent explicit to all writers).

2. **`docs/standards/task-schema.md` (new file) — human-readable reference.** Contains the full schema prose, the closed 7-value status enum, the banned field list, and the status normalization rules from FR-1-1. Linked from the TypeScript JSDoc. This is the document that agent-father references when updating flow files. It is NOT a second source of truth — it is a rendered view of the TypeScript contract.

**Risk note on `task_id` → `id` rename in TypeScript interface:** The existing `projectTask()` function already coalesces `task_id || id`. After the rename, it coalesces `id || task_id` (same logic, reversed field priority). The `writeOrchStateAtomic()` guard checks `.task_board` presence only — not individual field names — so the rename is safe at the atomic-write layer. The SSOT JSON file today has rows using both keys; post-migration all rows use `id` exclusively. The TypeScript interface rename is load-bearing for correctness; it must go into F2 together with the migration (F1b). TIMING: F1b migration (jq script normalizes JSON to use `id`) and F2 TypeScript rename must ship in sequence — F1b first, F2 second.

**BLOCKER-2 (counts.done rule) — RULING: `done[].length` is sole authoritative source**

`counts.done = (taskBoard.done ?? []).length`

Active-sprint tasks with `status=DONE` are transitional (PM will move them to `done[]` at sprint close). They are NOT counted in `counts.done`. They remain in `counts.in_progress` + `counts.backlog` (their existing bucket via `countTasksFromTaskBoard`).

Implementation: replace `countTasksFromTaskBoard()` call contribution to `counts.done` with `(taskBoard.done ?? []).length`. The `countTasksFromTaskBoard()` function itself can remain unchanged for `inProgress` and `backlog` counts — only `counts.done` source changes.

Rationale: avoids EC-7 double-counting; keeps the counting function's existing logic intact; simplest correct rule as BA recommended.

**BLOCKER-3 (F3 rollout order) — RULING: `board.done ?? []` as primary, no filter fallback**

F3 ships AFTER F1b migration and F2 REBUILD are verified live. Rollout order:
```
F1a+F4 → F1b (migration verified in SSOT) → F2 REBUILD → F3 REBUILD → QA
```

F3 uses `board.done ?? []` as primary done-group source. No `startsWith("DONE")` filter fallback is needed because: (a) F1b migration runs before F3 deploy, normalizing all status strings; (b) F2 projects `done[]` directly from the migrated SSOT. If for any reason F2 is not yet deployed when F3 ships (deployment gap), the done group shows empty (not broken) — `board.done ?? []` is `[]` when the DTO does not carry `done`. This is the correct degraded state (visible as "0 done tasks" to operator, not a crash).

The BA-proposed `startsWith("DONE")` interim fallback on the `tasks[]` array is explicitly NOT adopted — it re-entrenches the freeform-status antipattern we are eliminating. Operator tolerates empty done group for the deployment gap window (seconds to minutes in practice).

**BLOCKER-4 (migration runner) — RULING: agent-father runs the migration as F1b**

Migration runner = agent-father. Rationale:

1. F1b is a pure file-level operation on `docs/data/orch/orch-state.json` — no TypeScript compilation, no container rebuild required for the migration itself. dev-mcp-server's expertise is TypeScript code; running a jq migration on a data file is ops-lane work appropriate for agent-father.
2. F1b must be committed and its sentinel verified BEFORE F2 ships (TypeScript interface rename assumes `id` is the canonical field in the JSON). Having agent-father own F1b keeps the ordering gate clear: F1b commit is the green light for F2.
3. dev-mcp-server is spared a multi-concern task (migration + TypeScript + REBUILD). Clean separation.

Migration commit: agent-father commits the jq script file + the migrated `orch-state.json` together under commit-mutex, using `chore(data): ORCH-TASK-CANON F1b — migrate done[] to canonical schema (jq atomic, sentinel verified)`.

---

### Design Decisions

**D-1: Per-agent journal files (F-4 + F-5 addendum)**

The workflow-fluidity audit F-4 finding (parallel-agent shared journal file → lost writes) and F-5 (600L CAP-REACHED silently breaks mandatory rule) require changes to the decision-journal SKILL that extend the scope of F4 as defined in the BA spec.

Decision: fold both F-4 and F-5 fixes into F4 (agent-father).

Per-agent journal path: `docs/agent-memory/decisions/sprint-${SPRINT_ID}-${AGENT_ID}.md`

This requires the following coordinated changes:

1. **decision-journal SKILL `§ Resolve Sprint ID`**: fix the jq resolver bug (BA FR-4-1) AND set `JOURNAL_PATH` to include `${AGENT_ID}` suffix. The `AGENT_ID` value is available in every agent's context from their `init.md` `agent.id` field — agent-father must add `AGENT_ID` as a required variable in the SKILL's calling context.

2. **decision-journal SKILL `§ Cap Check`**: replace "Ops concern only" stop with: append `### CAP-REACHED` sentinel AND `send_telegram(channel="bug", "[decision-journal] sprint-${SPRINT_ID}-${AGENT_ID} CAP-REACHED — mandatory entries silently dropped; archive sprint journal")` AND roll to continuation file `sprint-${SPRINT_ID}-${AGENT_ID}-2.md` (continuation file follows the same per-agent naming convention). This ensures the mandatory rule is never silently broken.

3. **decision-journal SKILL `§ Commit Rule`**: update the git add path from `sprint-<id>.md` to `sprint-<id>-<agent-id>.md`.

4. **journalStore.ts `getDecisionsForSprints()`** (F2 extension): change single-file lookup to glob. The `statSync` + `readFileSync` approach must become a `readdirSync(decisionsDir).filter(name => name.startsWith("sprint-${id}-") && name.endsWith(".md"))` pattern. All matching files for a sprint ID are parsed and their steps merged. Legacy single-file (`sprint-${id}.md`, no agent suffix) is included if present (back-compat: `sprint-${id}.md` OR `sprint-${id}-*.md`). The mtime cache key remains the absolute file path — multiple files per sprint are each cached independently.

5. **All flow files referencing `sprint-<id>.md`** by explicit path: audit and update to per-agent pattern. This is agent-father's sweep.

6. **Back-compat**: the existing `sprint-2026-06-06.md` and `sprint-ORCH-DASH-DECISION-DRILLDOWN.md` (single-file, no agent suffix) remain readable. The glob includes `sprint-${id}.md` (no suffix) as a match. These legacy files need not be renamed.

**D-2: F1a and F4 are disjoint at the file level — MERGE into one agent-father task**

BA correctly identified that F1a (flow edits) and F4 (SKILL + triage flow + journal rewrite) are disjoint files. Both are agent-father's domain. Merging into a single dispatch is more efficient: one context load, one commit-mutex acquire, one commit. PM creates one agent-father task (`AF-ORCH-F1A-F4`) covering all six sub-items.

File scope of merged task:
- `docs/standards/task-schema.md` (new)
- `.claude/skills/decision-journal/SKILL.md`
- `docs/agents/po/flow/sprint-kickoff.md`
- `docs/agents/po/flow/triage-signals.md`
- `docs/agents/po/flow/channel-audit.md`
- `docs/agents/pm/flow/main.md`
- `docs/agents/ba/flow/main.md`
- `.claude/skills/anomaly-task-bridge/SKILL.md`
- `docs/agents/dev-team/flow/` (triage sub-flow journal write enforcement)
- `docs/agent-memory/decisions/sprint-2026-06-06.md` (freeform block rewrite)

F1b (migration) is a SEPARATE agent-father task (`AF-ORCH-F1B`) — it touches a live data file and must be committed after F1A-F4 is merged (to avoid a race on the flow files and data file in the same commit-mutex window).

**D-3: journalStore.ts glob extension is F2 scope (dev-mcp-server)**

The per-agent file change (D-1 item 4) requires modifying `journalStore.ts`, which lives in `apps/mcp-server/`. This is dev-mcp-server's file. Dev-mcp-server must implement the glob in `getDecisionsForSprints()` as part of F2. The SKILL change (D-1 items 1–3) is agent-father's job in F1A-F4. These two changes are coordinated: SKILL writes to `sprint-${SPRINT_ID}-${AGENT_ID}.md`; journalStore reads via glob. They are independently deployable (SKILL change is a docs-only change; journalStore glob is a TypeScript change requiring REBUILD). Ship order: F1A-F4 → F1B → F2 REBUILD. The glob reads legacy single-file names too, so journalStore is backward compatible from day 1.

**D-4: orchStateStore.ts `OrchStateTaskBoardTask` interface — canonical field is `id`, not `task_id`**

Post-migration, every task row in the JSON uses `id` as the canonical field. The TypeScript interface must reflect this. Current state:
```ts
task_id: string;   // mandatory today
id?: string;       // legacy optional today
```
Post-F2 state:
```ts
id: string;         // mandatory — canonical
task_id?: string;   // legacy-tolerance only (read path — never write)
```
`projectTask()` coalesce becomes `str(task.id, "") || str(task.task_id, "")` — same invariant, reversed priority. All downstream consumers (`buildOrchestrationDto`, `countTasksFromTaskBoard`) already use the projected `id` field; no other callers touch `task_id` directly.

**D-5: `OrchStateTaskBoard.done` type — optional, starts empty if absent**

```ts
export interface OrchStateTaskBoard {
  // ... existing fields ...
  done?: OrchStateTaskBoardTask[];  // absent in legacy states → treated as []
}
```

`writeOrchStateAtomic()` guard checks `.task_board` presence only — the `done` field being optional does not trigger any guard failure. The SSOT already has `done: [...]` (66 rows confirmed), so the guard-upgrade question is moot for the current live file.

**D-6: Counts double-count prevention (EC-7)**

After F1b migration, tasks that are in `done[]` SSOT are NOT in `active_sprints[].tasks[]` — they are in a separate array. The dual-location risk (EC-7) only exists if PM moves a task to `done[]` without removing it from `active_sprints[].tasks[]`. This is a PM process invariant, not a code invariant. Document in the task-schema.md: "A task ID MUST NOT appear in both `done[]` and any `active_sprints[].tasks[]` simultaneously." No runtime dedup guard is needed in F2 — the serve layer does not check for duplicates (EC-4 accepted: duplicate rows in done[] appear twice in the done group but do not crash).

---

### Test Strategy

**F1A-F4 (agent-father — docs/skills only, no TypeScript)**
- Acceptance: `jq '.sprint_goal.entries[] | select(.status == "active") | .sprint_id'` returns `"ORCH-TASK-CANON"` (resolver fix smoke test).
- Acceptance: `parseJournalFile(content, "2026-06-06")` on rewritten `sprint-2026-06-06.md` returns `steps.length >= 2`.
- Acceptance: zero `{id, summary, priority}` shaped objects (no `title` key) created by po/pm/ba/anomaly-bridge flows after F1A ships — verified by a one-off jq scan of orch-state backlog[] post-fix.
- No TypeScript unit tests for docs-only change.

**F1B (agent-father — migration)**
- Pre-migration: `jq '.task_board.done | length'` = 66.
- Sentinel verify (mandatory before mv): `[ -s tmp ] && jq -e '.task_board.done[0].id' tmp`.
- Post-migration assertions (run after mv):
  - `jq '[.task_board.done[] | select(has("id") | not)] | length'` = 0
  - `jq '[.task_board.done[] | select(has("title") | not)] | length'` = 0
  - `jq '[.task_board.done[] | select(.id == "ORCH-DASH-DECISION-DRILLDOWN")] | length'` = 0 (container dropped)
  - `jq '[.task_board.done[] | select(has("task_id"))] | length'` = 0 (banned field absent)
  - `jq '[.task_board.done[].status] | unique | map(select(test("DONE-LIVE-VERIFIED|DONE-VERIFIED|SUPERSEDED|RESOLVED-BY"))) | length'` = 0

**F2 (dev-mcp-server — TypeScript)**
- Unit tests in `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.test.ts`:
  - `buildOrchestrationDto` with a state containing `done: [{id: "T1", title: "x", status: "DONE", owner: "dev", zone: "apps/mcp-server/"}]` → DTO `.task_board.done[0].id === "T1"`.
  - `buildOrchestrationDto` with `done` absent → DTO `.task_board.done` is `[]`.
  - Nested container in `done[]` → children projected, container row absent.
  - `counts.done` equals `done.length` (not active_sprint DONE count).
- journalStore unit tests:
  - `getDecisionsForSprints(["S1"], dir)` where dir contains `sprint-S1-dev-mcp-server.md` and `sprint-S1.md` → both files parsed, steps merged.
- Live AC: `curl :3000/api/orchestration | jq '.task_board.done | length'` = 71 (66 original + 6 from ORCH-DASH-DECISION-DRILLDOWN nested container children - 1 container row = 71). Note: actual count = migrated done[] length — QA must verify against SSOT.
- TypeScript compilation: zero errors.

**F3 (dev-frontend — TypeScript/Remix)**
- No new unit tests required — component is additive data-source swap.
- QA live AC: Dashboard done group non-empty; at least one done task with journal entries shows STEP accordion on click.

**QA (live end-to-end)**
- `curl :3000/api/orchestration | jq '.task_board.done[] | select(.id == "FIX-VPS-SSC-CURL-SCRAPER")'` → non-empty.
- Dashboard SSR render shows done group with >1 task.
- Click a done task with `decisions.by_task[id]` entry → accordion renders STEP fields (not empty).
- `decisions.by_task` join populated: requires at least one agent to have written a per-agent journal file (`sprint-ORCH-TASK-CANON-architect.md`) before QA runs.

---

### Risk Flags

**R-1 (HIGH): journalStore.ts glob — `readdirSync` on large decisions dir**
`docs/agent-memory/decisions/` will grow unboundedly as per-agent files accumulate. `readdirSync` on every poll cycle (5s) with O(N) file list scan could become a performance issue at N>100 files. Mitigation: mtime cache at the individual file level already handles re-parse cost; the `readdirSync` itself is cheap (metadata only, no read). At current scale (4 files) this is not a concern. Flag for system-auditor Tier-3 disk-size watch.

**R-2 (MEDIUM): F1b migration — `task_id` field removal may break downstream consumers that reference `task_id` directly**
After F1b, the `task_id` key is absent from all done[] rows. The TypeScript interface retains `task_id?: string` as legacy-optional for safety, but any bash script or jq query in flows that uses `.task_id` on a done[] row will get `null`. Mitigation: the only active jq usage verified is in `countTasksFromTaskBoard` (TypeScript, uses `.task_id` today → becomes `.id` after D-4 rename) and the migration script itself. No bash script verified to directly read `.task_board.done[].task_id`. agent-father must grep flows before committing F1b.

**R-3 (MEDIUM): ORCH-DASH-DECISION-DRILLDOWN nested container — 6 child tasks inherit closed_at from parent**
The nested container row has no `closed_at`. Its 6 child tasks have their own `status` fields. After migration, the 6 children become top-level done[] rows. Their `created_at` will fallback to `"unknown"` if they lack the field (FR-1-2 rule: `created_at ← created_at // closed_at // "unknown"`). Verify in post-migration sentinel: `jq '[.task_board.done[] | select(.created_at == "unknown")] | length'` and surface count to operator. Acceptable — `"unknown"` is valid per schema.

**R-4 (LOW): Per-agent journal path breaks if `AGENT_ID` is not set in SKILL calling context**
The SKILL's `§ Resolve Sprint ID` must set `AGENT_ID` before building `JOURNAL_PATH`. Every agent that calls the SKILL must have `AGENT_ID` available. Current agents all have `agent.id` defined in their `init.md`. agent-father must add `AGENT_ID` as an explicit required variable declaration in the SKILL header and verify all callers pass it.

**R-5 (LOW): `writeOrchStateAtomic` sentinel check does NOT verify `done[]` field presence**
The existing guard in `writeOrchStateAtomic()` checks `.head`, `.task_board`, `.signal_queue` only. After F2, if a writer somehow serializes a state without `done[]` (e.g. legacy caller), the guard passes and the write succeeds. This is by design (`.done` is optional). No change to the guard needed — optional field omission is valid behavior. Document explicitly in the function JSDoc.

---

### Out-of-Scope References (Fluidity Audit — Separate Follow-up Sprint)

The workflow-fluidity audit identified issues that are NOT in scope for ORCH-TASK-CANON. PM should queue these as backlog items:

- **F-12/F-2 (DEADLOCK-RISK HIGH):** developer/qa/fixer STOP paths do not call `task_release` or reset `.head.status = "idle"`. Separate sprint: `FAIL-LOUD-STOP-RELEASE`.
- **F-9/F-3 (CONFLICT MEDIUM):** concurrent cowork-team + auditor Tier-2 orch-state.json signal_queue writes — FU-ORCH-HEAD-CAS class bug. Separate sprint: promote FU-ORCH-HEAD-CAS from backlog to active sprint.
- **F-8 (BOTTLENECK MEDIUM):** dev-team agents lack MCP gateway binding for direct `task_claim`. Separate documentation task.
- **F-10/F-11/F-13 (BOTTLENECK LOW):** WIP telemetry, signal_queue drain window, c44 gate. Separate backlog items.

---

### Dispatch Order (Architect-confirmed)

```
AF-ORCH-F1A-F4  (agent-father — flows + SKILL + journal rewrite + task-schema.md)
                [no dependency on code; can start immediately]
        ↓
AF-ORCH-F1B     (agent-father — jq migration, commit-mutex, sentinel verify)
                [must run AFTER F1A-F4 commit is merged, before F2 TypeScript rename]
        ↓
F2-MCP          (dev-mcp-server — orchStateStore types + orchHandler done[] + journalStore glob + REBUILD)
                [depends on F1B: JSON uses `id` field; TypeScript interface rename aligns]
        ↓
F3-FE           (dev-frontend — TaskBoard done? field + board.done source + REBUILD)
                [depends on F2 REBUILD live-verified]
        ↓
QA              (live end-to-end verify: curl + SSR + accordion click)
```

**F1A-F4 and F1B serialization:** even though F1A-F4 is docs-only and F1B is data-only (no overlap), agent-father must NOT run them in the same commit-mutex window. Two separate claims, two separate commits. This prevents a race on the SSOT during migration.

**F1A-F4 and F4 merged:** confirmed. One agent-father task covers both. No separate F4 dispatch.

---

### BUILD-STANDARD

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: All three zones (mcp-server, frontend, docs/agents) are existing services/flows.
      No new service primitives. dev-mcp-server and dev-frontend drive end-to-end in their zones.
```

---

### Scan Clean

- `apps/mcp-server/src/infrastructure/orchStateStore.ts` — read, interface confirmed.
- `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` — read, projection logic confirmed.
- `apps/mcp-server/src/infrastructure/journalStore.ts` — read, single-file lookup confirmed, glob extension required.
- `apps/frontend/app/routes/dashboard.orchestration.tsx:84–343` — read, `TaskBoard.done` absent, filter on `tasks[]` confirmed.
- `.claude/skills/decision-journal/SKILL.md` — read, resolver bug (`entries[0].id`) confirmed, per-agent path absent confirmed.
- `docs/data/orch/orch-state.json` — `.task_board.done | length` = 66 (live confirmed), active sprint IDs read.
- `docs/agent-memory/decisions/sprint-ORCH-TASK-CANON.md` — exists, 17L, 1 BA step.

**Scan clean: true**

---

## RETURN

```
DONE: Technical design complete. Blocker rulings issued (all 4). Fluidity audit F-4/F-5 addendum folded.
ZONE: multi (docs/agents/ + .claude/skills/ + apps/mcp-server/ + apps/frontend/ + docs/data/orch/)
NEXT: pm | create AF-ORCH-F1A-F4 (agent-father, merged) + AF-ORCH-F1B (agent-father, separate) + F2-MCP (dev-mcp-server) + F3-FE (dev-frontend) + QA tasks
HANDOFF: docs/handoffs/ORCH-TASK-CANON-ARCH.md
PIPELINE: continue
```
