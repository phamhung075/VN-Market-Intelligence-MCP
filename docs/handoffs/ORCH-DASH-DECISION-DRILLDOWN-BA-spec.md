# BA Spec — ORCH-DASH-DECISION-DRILLDOWN
**Sprint:** ORCH-DASH-DECISION-DRILLDOWN
**BA task:** BA-ORCH-DASH-DECISION-DRILLDOWN
**Written:** 2026-06-05T21:10:02Z
**Next:** architect (confirm join-key design + serving layer, then dispatch F1/F2/F3)

---

## Context (BA raw-read, not relayed)

The feature: on `/dashboard/orchestration` each DONE task row becomes clickable and expands an accordion showing that task's Decision Journal trail (what-done / what-considered / why-decision / why-change, per STEP block).

**Serving layer confirmed (data-serve-integrity check):**
- `/api/orchestration` is served by `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts`
- Proxy chain: `apps/frontend/app/routes/api.orchestration.tsx` → mcp-server `:3000/api/orchestration` → `orchestrationHandler.ts` → `orchStateStore`
- NOT the undeployed Go api-gateway (`:4000`). Zone owner for F2 = `dev-mcp-server`.

**Decision journal format SSOT:** `.claude/skills/decision-journal/SKILL.md`
**Journal entries location:** `docs/agent-memory/decisions/sprint-<sprint-id>.md`
**STEP block format:**
```
### STEP <agent-id>-S<N> · <agent-id> · <ISO-timestamp>
**what-done:** ...
**what-considered:** bullet list
**why-decision:** ...
**why-change:** ...
```

**Join-key problem:** STEP blocks carry NO `task-id` today. The sprint-id is inferable from the filename; but individual STEP blocks cannot be matched to a specific `task_board` task.

**Adopted join-key strategy (both):**
- (a) Add optional `task-id:` field to the STEP block format — future entries map precisely to a task row
- (b) Sprint-level fallback bucket — all STEP blocks with no task-id surface under a single sprint bucket per task, zero crash on legacy/missing data

---

## Requirements

### FR-1: Journal STEP format — optional task-id field
**DDD layer:** skill / agent-flow (not infrastructure or domain)
**Owner zone:** agent-father (edits `.claude/skills/decision-journal/SKILL.md` + journal-write step injection in developer / qa / architect / cowork flows)

- FR-1-1: The STEP block format gains one optional line `**task-id:** <task_id>` inserted between the header line and `**what-done:**`.
- FR-1-2: The field is optional. If omitted, the block is still valid (no parse crash). Existing entries with no task-id remain valid legacy.
- FR-1-3: The SKILL.md write-entry template must show the optional field with a clear label (e.g. `**task-id:** <task_id or omit>`) so agents writing journal entries know it exists.
- FR-1-4: Any flow that calls the journal-write step (developer, qa, architect, cowork) must be updated to inject `task-id: <current task_id>` at the write step if a task_id is in scope. If no task_id is in scope (e.g. sprint-level reflections), the field is omitted.
- FR-1-5: The change is forward-only. No backfill of existing journal entries.

**AC (F1):**
- SKILL.md template shows the optional task-id line.
- Developer flow, QA flow, architect flow each have the journal-write step updated to stamp task-id.
- A manually-written STEP block with the new field parses correctly by the F2 server-side parser (verified by F2 unit test fixture).
- A STEP block without the field also parses correctly (backward-compat test fixture).
- No change to any journal file already committed.

---

### FR-2: API — server-side markdown parse + DTO extension
**DDD layer:** infrastructure (journal file read) + interface (DTO projection + HTTP handler)
**Owner zone:** dev-mcp-server (`apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` + supporting infra module)

The `GET /api/orchestration` response must carry a new top-level field `decisions` alongside existing fields. The markdown MUST be parsed server-side; raw markdown must never reach the browser.

#### FR-2-1: Journal file discovery
- Discover all `docs/agent-memory/decisions/sprint-*.md` files at request-time (no startup cache — files are written during agent runs; stale cache = stale UI).
- Filter to files whose sprint-id matches any sprint referenced in the current `task_board` (i.e. `sprint_goal.entries[*].sprint_id` and any `task_board.active_sprints[*].id`). Do not load arbitrary journal files for security/performance.
- If a journal file is missing (sprint active but no journal file yet), return an empty decisions map for that sprint — no crash.

#### FR-2-2: Markdown parse → structured STEP objects
Parse each discovered journal file into an array of structured STEP objects. Parser rules:
- Detect STEP block header: `^### STEP <step-id> · <agent-id> · <ISO-timestamp>`
- Extract fields: `what-done`, `what-considered` (multi-line bullet list → string array), `why-decision`, `why-change`
- Extract optional `task-id` if present (between header and `what-done`)
- Ignore non-STEP markdown (headers, prose, horizontal rules, cap-sentinel)
- If a field is absent (malformed entry), use empty string / empty array — never throw

#### FR-2-3: Decision keying — per-task + sprint fallback
Build a decisions map with two keys:
```ts
interface DecisionsDto {
  by_task: Record<string, StepDto[]>;     // task_id → STEP entries with that task-id
  sprint_bucket: Record<string, StepDto[]>; // sprint_id → all STEP entries without task-id
}
interface StepDto {
  step_id: string;          // e.g. "agent-father-S1"
  agent_id: string;
  timestamp: string;        // ISO-8601
  task_id: string | null;   // null = legacy/untagged
  what_done: string;
  what_considered: string[];
  why_decision: string;
  why_change: string;
}
```
- A STEP with `task-id: BAL-0` maps to `by_task["BAL-0"][]`
- A STEP with no task-id maps to `sprint_bucket["<sprint-id>"][]`
- A task_id that matches no task in `task_board` still appears in `by_task` (display as orphan, front-end renders it; do not drop it)

#### FR-2-4: DTO extension (additive — no regression)
Extend `OrchestrationDto` in `orchestrationHandler.ts`:
```ts
export interface OrchestrationDto {
  // ... existing fields unchanged ...
  decisions: DecisionsDto;  // new field — always present, never null
}
```
`decisions` is always present (empty maps if no journal files exist). This is additive; existing dashboard sections are not touched.

#### FR-2-5: HC-2 safety boundary
- `decisions` is read-only (GET only, no write path).
- STEP content fields (what-done etc.) are free-form strings — expose as-is; they contain no raw orch-state payloads or agent instructions in the signal sense. HC-2 concern is already scoped to `signal_queue.payload` (excluded in existing handler). Decision fields are informational prose.

**AC (F2):**
- Unit test: journal fixture with task-id field → `by_task["<task-id>"]` contains the STEP.
- Unit test: journal fixture without task-id → `sprint_bucket["<sprint-id>"]` contains the STEP.
- Unit test: missing journal file → `decisions` returns empty maps, no exception.
- Unit test: malformed STEP block (missing field) → parsed with empty string fallbacks, no exception.
- Integration: `GET /api/orchestration` response includes `decisions` field (JSON, not markdown string).
- No change to existing fields in the response (regression-free: `head`, `task_board`, `signal_queue`, `sprint_goal`, `narrative` byte-identical for an unchanged orch-state.json).
- TypeScript compiles clean (tsc 0 errors).

---

### FR-3: Remix UI — DONE-task accordion with decision trail
**DDD layer:** interface (Remix route component)
**Owner zone:** dev-frontend (`apps/frontend/app/routes/dashboard.orchestration.tsx`)

#### FR-3-1: DONE-only expandable rows
- Only rows where `status === "DONE"` (exact string match, case-sensitive per existing `taskStatusClasses`) are expandable/clickable.
- Non-DONE rows (TODO, IN_PROGRESS, BACKLOG, custom status) are NOT clickable and show no accordion affordance.
- The DONE task table row (within `DoneTaskGroup`) gains a clickable affordance (chevron icon or highlight cursor) indicating it can expand.

#### FR-3-2: Click → accordion expansion
- Clicking a DONE task row toggles an accordion panel immediately below the row (inline expansion, not a modal or navigation).
- Only one accordion may be open at a time per task group (click a different task → previous closes, new opens) OR multiple may be open simultaneously. Architect/dev-frontend decides based on UX; both are acceptable. Document choice in implementation.
- The accordion is keyboard-accessible: `Enter` / `Space` on a focused row toggles it. `aria-expanded` attribute tracks state.

#### FR-3-3: Accordion content — STEP entries
Inside the accordion:
- List each StepDto (from `decisions.by_task[task.id]`) as a card/block, ordered by timestamp ascending.
- Each card shows: step_id, agent_id, timestamp (human-readable via `ClientTimestamp`), then the four fields each labeled clearly:
  - "What was done": `what_done`
  - "What was considered": bullet list from `what_considered`
  - "Why this decision": `why_decision`
  - "Why it changed": `why_change`
- The label text MUST be English (dashboard is operator-facing).

#### FR-3-4: Empty state — no decisions recorded
- If `decisions.by_task[task.id]` is absent or empty AND `decisions.sprint_bucket[<sprint-id>]` is empty: show a clean "No decisions recorded for this task." message inside the accordion. Do not crash. Do not show raw markdown.
- If `decisions.by_task[task.id]` is absent but `decisions.sprint_bucket[<sprint-id>]` has entries: show a section labeled "Sprint-level decisions (no task-id assigned)" with those entries listed. This handles legacy/untagged workflow entries.

#### FR-3-5: No raw markdown in DOM
The Remix loader receives structured `StepDto[]` from the API. The component renders the structured fields directly. No client-side markdown parsing. No `dangerouslySetInnerHTML` on decision fields (all are plain strings / string arrays).

#### FR-3-6: Type update
- Extend `OrchState` interface in the dashboard route to include `decisions: DecisionsDto` (matching F2 DTO contract).
- `decisions` is optional in the TypeScript interface (`decisions?: DecisionsDto`) for backward-compat during rolling deploy.

**AC (F3):**
- A DONE task row shows a clickable affordance; clicking it expands an inline accordion.
- A non-DONE task row has no clickable affordance and no accordion.
- A DONE task with journal entries shows all STEP fields rendered as structured text (no raw `### STEP` markdown visible in DOM).
- A DONE task with no journal entries shows "No decisions recorded for this task." — no crash, no blank panel.
- A DONE task with only sprint-bucket entries (legacy, no task-id) shows the sprint-bucket section correctly.
- `aria-expanded` is set correctly on the trigger element.
- Frontend TypeScript compiles clean (tsc 0).
- Unit test: render `DoneTaskGroup` with a task that has `decisions.by_task` populated → accordion content visible on click; verify "No decisions recorded" renders when map is empty.

---

## NFRs

- **NFR-1 No raw markdown to browser.** Server-side parse only (F2). F3 never receives a markdown string for the decisions field.
- **NFR-2 No crash on missing data.** Every null/undefined guard path (missing journal file, missing task-id key in map, malformed STEP block) returns clean empty state. Both F2 (empty maps) and F3 (empty state message) must be covered.
- **NFR-3 Additive only — no regression.** The `decisions` field extends the existing DTO; all existing fields and dashboard sections are byte-for-byte unchanged when no journal parsing occurs. Existing 47-pass test suite must remain green.
- **NFR-4 Forward-only task-id.** No backfill of existing journal entries with task-id. Legacy entries surface via sprint_bucket only.
- **NFR-5 Read-only surface.** No write, no edit, no delete from the UI. Dashboard remains read-only throughout.
- **NFR-6 Rebuild required.** After F2 ships (mcp-server change), ops must rebuild the mcp-server container. After F3 ships (frontend change), ops must rebuild the frontend container. QA verifies on the running containers, not against a badge.

---

## Edge Cases

- **EC-1 Sprint-id mismatch:** A journal file `sprint-FOO.md` exists but no sprint `FOO` is in the current task_board → journal file is skipped (not loaded). No crash.
- **EC-2 CAP-REACHED sentinel:** If journal file contains `### CAP-REACHED`, the parser stops processing further entries after that line. Entries before the sentinel are returned normally.
- **EC-3 Multiple sprints active:** `by_task` merges STEP entries from all loaded journal files. If two sprints have a STEP tagged `task-id: BAL-0`, both appear in `by_task["BAL-0"]` (ordered by timestamp).
- **EC-4 No DONE tasks:** `DoneTaskGroup` receives an empty `tasks` array — no accordion rendering, no error.
- **EC-5 Very long decision text:** `what_considered` can be long prose. The accordion must not overflow the page width — CSS `max-width + overflow-wrap` on the accordion container.
- **EC-6 Dashboard polling revalidation (5s):** The loader calls `/api/orchestration` which now also parses journal files. File-parse is synchronous + in-memory — must not introduce >100ms overhead for typical journal sizes (<600 lines per file). No database call. If architect judges file-parse latency unacceptable, cache parsed decisions per sprint file keyed by (path, mtime) for the lifetime of the Hono request handler (singleton in-memory map, invalidated on mtime change).

---

## Blockers (BA-identified — for architect resolution)

- **BLOCKER-1 (architect-level, not PO):** Confirm BOTH join-key strategies (F1 task-id field + F2 sprint fallback bucket) as the design. The router recommends BOTH; architect formally confirms or overrides before F1/F2 dispatch. This is a 1-line ruling, not a spike.
- **BLOCKER-2 (dev-mcp-server, not PO):** F2 journal file discovery must know which sprint-ids to load. The current `OrchState` has `sprint_goal.entries[*].sprint_id` and `task_board.active_sprints[*].id`. Architect must specify whether to use both or only active_sprints. Recommendation: use both (union), so decisions from recently-closed sprints still appear on their DONE tasks.
- **BLOCKER-3 (F1→F2 dependency):** F2 parser unit tests need a STEP fixture with the new task-id field (from F1). F1 format must be finalized before F2 parser tests are written. Architect gates F2 on F1 format being committed to SKILL.md.

---

## Dependency Chain

```
F1 (agent-father — SKILL.md format + flow injection)
   ↓ format spec consumed by
F2 (dev-mcp-server — server-side parser + DTO extension)
   ↓ DTO contract consumed by
F3 (dev-frontend — Remix accordion UI)
```

F1 and F2 are not strictly deployment-sequential (F2 can ship with its parser ready before F1 agents write any tagged entries — the sprint fallback bucket handles the gap). But F1 format MUST be committed before F2 parser tests are finalized, and F3 TypeScript types depend on F2 DTO being merged.

Recommended dispatch order: F1 first (fast, skill + flow edit only) → F2 (mcp-server + rebuild) → F3 (frontend + rebuild).

---

## DDD Layer Map

| Sub-task | Layer | Module |
|---|---|---|
| F1: STEP format task-id field | Skill/flow (cross-cutting) | `.claude/skills/decision-journal/SKILL.md` + agent flow files |
| F1: Flow injection (developer/qa/architect/cowork) | Skill/flow | `docs/agents/*/flow/main.md` |
| F2: Journal file discovery + markdown parse | Infrastructure | new `journalStore.ts` or inline in `orchestrationHandler.ts` |
| F2: DecisionsDto / StepDto types | Interface (DTO) | `orchestrationHandler.ts` |
| F2: buildOrchestrationDto extension | Interface | `orchestrationHandler.ts` |
| F3: DecisionsDto type import | Interface | `dashboard.orchestration.tsx` |
| F3: DoneTaskRow accordion component | Interface | `dashboard.orchestration.tsx` |
| F3: Loader data shape extension | Interface (Remix loader) | `dashboard.orchestration.tsx` |

---

## Architect Hand-off Items

1. Confirm join-key design (BOTH = F1 task-id optional field + F2 sprint fallback bucket).
2. Confirm serving layer = `apps/mcp-server orchestrationHandler.ts` (BA already verified; architect sign-off for dispatch clearance).
3. Decide sprint-id discovery scope for F2 journal file loading (recommendation: union of sprint_goal.entries + task_board.active_sprints).
4. Decide per-task-accordion UX: single-open or multi-open (delegate to dev-frontend if no strong opinion).
5. Assess EC-6 latency risk: decide whether to add per-sprint mtime cache in F2 or accept synchronous parse per request.
6. Dispatch F1 (agent-father) → F2 (dev-mcp-server) → F3 (dev-frontend) in that order.
