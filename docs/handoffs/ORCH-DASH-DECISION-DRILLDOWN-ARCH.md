# [Architect] Blueprint — ORCH-DASH-DECISION-DRILLDOWN
**Sprint:** ORCH-DASH-DECISION-DRILLDOWN
**Architect task:** ARCH-ORCH-DASH-DECISION-DRILLDOWN
**Written:** 2026-06-05T21:30:00Z
**Next:** pm (break into atomic subtasks per zone, dispatch F1→F2→F3 sequentially)

---

## [Architect] Brownfield Findings

- **Zone:** multi — three zones, sequential dependency, PM must create per-zone subtasks
  - F1: `docs/agents/` + `.claude/skills/decision-journal/` → zone = `agent-father`
  - F2: `apps/mcp-server/` → zone = `dev-mcp-server`
  - F3: `apps/frontend/` → zone = `dev-frontend`

- **BUILD-STANDARD: lean** — all three zones have existing apps/services; this is a new feature on existing surfaces; no new microservice scaffolded.

- **Verified paths:**
  - `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` — CONFIRMED live serving layer for GET /api/orchestration; `buildOrchestrationDto` pure function + `handleGetOrchestration` HTTP handler; no Go api-gateway plane involved (not deployed)
  - `apps/mcp-server/src/infrastructure/orchStateStore.ts` — `readOrchState`, `writeOrchStateAtomic`, type definitions; F2 `journalStore.ts` must live in same `infrastructure/` folder, NOT in `interface/`
  - `apps/mcp-server/src/__tests__/1977-orchestration-endpoint.test.ts` — existing orchestration test; F2 unit tests must be `1978-journal-store.test.ts` + `1979-orchestration-decisions.test.ts` (next free numbers after 1977)
  - `apps/frontend/app/routes/dashboard.orchestration.tsx` — Remix loader + `DoneTaskGroup` component already exists at line 408; accordion state (`expanded` useState) already used at line 409 for the "show all" toggle pattern; F3 extends this component
  - `.claude/skills/decision-journal/SKILL.md` — current STEP format lacks `task-id` line; F1 adds it as optional between header and `**what-done:**`
  - `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md` — already exists (po + ba entries); F2 parser must handle existing entries without task-id correctly

- **Reuse patterns:**
  - F2: extend `buildOrchestrationDto` in `orchestrationHandler.ts` additively — do NOT duplicate the function; inject `journalStore.ts` as a pure dependency
  - F3: extend existing `DoneTaskGroup` component — do NOT create a new route file; the accordion pattern (`useState(false)` toggle) is already proven in this component for the "show all" toggle
  - F3: reuse `ClientTimestamp` component (already imported in dashboard.orchestration.tsx at line 28) for step timestamps
  - F2 mtime cache: module-level singleton `Map<string, {mtime: number; steps: StepDto[]}>` — same pattern as `orchStateStore.ts` module-level constants

- **Scan clean:** true

---

## Architect Rulings (blockers resolved)

### RULING-1: Join-Key — CONFIRMED BOTH

Adopt both strategies as specified in the BA spec:
- (a) Optional `**task-id:** <task_id or omit>` line in STEP block format — inserted between the header line and `**what-done:**`
- (b) Sprint-level fallback bucket — all STEP blocks without task-id surface under `sprint_bucket[sprint_id]`

Parse contract: if `**task-id:**` line is present and non-empty → entry goes into `by_task[task_id][]`. If absent or empty → entry goes into `sprint_bucket[sprint_id][]`. A task_id that appears in `by_task` but matches no task in `task_board` is an **orphan** — kept in `by_task`, front-end renders it; entries are never silently dropped.

### RULING-2: Serving Layer — CONFIRMED apps/mcp-server

`GET /api/orchestration` is served by `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts`. Proxy chain verified by direct code read:
- Remix loader (`dashboard.orchestration.tsx`) → `${origin}/api/orchestration`
- Frontend proxy route (`api.orchestration.tsx`) → mcp-server `:3000/api/orchestration`
- `handleGetOrchestration` → `buildOrchestrationDto` → returns `OrchestrationDto`

The Go api-gateway (`:4000`) is NOT deployed on this host and is NOT in the serving chain. F2 zone = `dev-mcp-server` exclusively.

### RULING-3: Sprint-ID Discovery Scope — UNION ALL sprint_goal.entries

Use the union of:
1. `sprint_goal.entries[*].sprint_id` — ALL entries regardless of status (including `CLOSED`)
2. `task_board.active_sprints[*].id`

Rationale: A sprint may be closed the same session its last task is marked DONE. If discovery only looks at `active` entries, decisions for just-closed sprints become invisible on the dashboard — breaking the primary feature contract. The union + file-existence guard (missing file = empty decisions, no crash) covers all states at negligible cost (typically <10 files, each <600 lines).

Dedup: build a `Set<string>` of sprint IDs to avoid loading the same file twice if an ID appears in both sources.

### RULING-4: Latency — Per-Sprint mtime Cache

Implement a **singleton in-memory mtime cache** in `journalStore.ts`:

```typescript
// Module-level singleton — shared for the lifetime of the Hono/Node process
const _cache = new Map<string, { mtime: number; steps: StepDto[] }>();
```

On each `getDecisionsForSprints(sprintIds, decisionsDir)` call:
1. For each sprint ID, compute `filePath = path.join(decisionsDir, `sprint-${id}.md`)`.
2. `stat(filePath)` — if ENOENT → return `[]` for this sprint (no crash).
3. If cached and `cache.mtime === stat.mtimeMs` → return cached steps (fast path, O(1)).
4. If not cached or mtime changed → read + parse → update cache → return steps.

This reduces parse overhead on the 5-second polling loop to zero when no agent is writing. The cache is process-scoped and does not survive a container restart (acceptable — the file will be re-parsed on next request).

### RULING-5: Accordion UX — Multi-Open

F3 must implement **multi-open** accordion: each DONE task row has independent toggle state. Use a `Set<string>` of open task IDs in a single `useState<Set<string>>`:

```typescript
const [openTaskIds, setOpenTaskIds] = useState<Set<string>>(new Set());
const toggle = (id: string) =>
  setOpenTaskIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
```

Rationale: The decision journal is an audit surface. Operators compare decisions across tasks simultaneously. Single-open (close previous on new open) breaks comparison workflows. Multi-open imposes no extra complexity cost over single-open with this pattern.

---

## Design Decisions — File Map

### F1: decision-journal SKILL.md + flow injection (zone: agent-father)

**Files to modify:**
- `.claude/skills/decision-journal/SKILL.md` — § Write Entry template: add `**task-id:** <task_id or omit>` line between header and `**what-done:**`; add field rule in § Rules block
- `docs/agents/developer/flow/main.md` — journal-write step: inject `task-id: <current task_id>` if task_id is in scope
- `docs/agents/architect/flow/main.md` — same injection
- `docs/agents/qa/flow/main.md` — same injection (check if journal-write step exists; add if missing)
- cowork agent flows (unified-agent, chef, market-watcher, news-scout, etc.) — any flow that has a `decision-journal/SKILL.md` § Write Entry call must pass task-id when a task_id is in scope

**DDD Layer:** skill/flow (cross-cutting, not in apps/)

**No production code changed. No journal files backfilled.**

Updated STEP format (F1 output, consumed as F2 parser fixture):
```markdown
### STEP <agent-id>-S<N> · <agent-id> · <ISO-timestamp>
**task-id:** <task_id or omit if no task in scope>
**what-done:** <one sentence>
**what-considered:**
- <bullet>
**why-decision:** <one sentence>
**why-change:** <one sentence>
```
The `**task-id:**` line is OPTIONAL. Parser must not throw if absent.

---

### F2: Journal parse + DTO extension (zone: dev-mcp-server)

**Files to create:**
- `apps/mcp-server/src/infrastructure/journalStore.ts` — pure infrastructure module (no HTTP, no domain imports)
  - `StepDto` type (as defined in BA spec)
  - `DecisionsDto` type (as defined in BA spec)
  - `parseJournalFile(content: string, sprintId: string): StepDto[]` — pure function, testable in isolation
  - `getDecisionsForSprints(sprintIds: string[], decisionsDir: string): DecisionsDto` — uses mtime cache, calls parseJournalFile
  - Module-level `_cache: Map<string, { mtime: number; steps: StepDto[] }>`

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts`
  - Add `DecisionsDto` + `StepDto` imports from `../../../infrastructure/journalStore.js`
  - Add `decisions: DecisionsDto` field to `OrchestrationDto` interface
  - In `buildOrchestrationDto`: compute sprint ID union set from `state.sprint_goal.entries[*].sprint_id` + `state.task_board.active_sprints[*].id`; call `getDecisionsForSprints`; include `decisions` in returned DTO
  - `decisions` must always be present (never null/undefined); use `{ by_task: {}, sprint_bucket: {} }` as the zero-value
  - **HC-2 safety note:** decision fields (what_done, etc.) are informational prose — not signal payloads. The HC-2 boundary (no raw payload blobs) is not violated. No changes to existing HC-2 guards.

**Files to create (tests):**
- `apps/mcp-server/src/__tests__/1978-journal-store.test.ts`
  - T1: fixture with task-id → appears in `by_task[task_id]`
  - T2: fixture without task-id → appears in `sprint_bucket[sprint_id]`
  - T3: missing journal file → returns empty maps, no exception
  - T4: malformed STEP (missing field) → empty string fallbacks, no throw
  - T5: CAP-REACHED sentinel → entries before sentinel returned, entries after discarded
  - T6: multiple sprints → `by_task` merges entries from all files ordered by timestamp
- `apps/mcp-server/src/__tests__/1979-orchestration-decisions.test.ts`
  - T1: `buildOrchestrationDto` with fixture orch-state + fixture journal → DTO includes `decisions` with correct by_task entries
  - T2: `buildOrchestrationDto` with no journal files → `decisions = { by_task: {}, sprint_bucket: {} }`
  - T3: regression — existing fields (`head`, `task_board`, `signal_queue`, `sprint_goal`, `narrative`) byte-identical to pre-F2 output when decisions=empty

**DDD Layer assignment:**
- `journalStore.ts` → **infrastructure** (file I/O, no domain logic)
- `StepDto` / `DecisionsDto` types → **interface** (DTO, in orchestrationHandler.ts)
- `parseJournalFile` → infrastructure (pure parse function, no domain rules)
- `getDecisionsForSprints` → infrastructure (file read + cache)
- `buildOrchestrationDto` extension → **interface** (DTO assembly, existing layer)

**Parser contract (pseudocode — implementer must match this exactly):**

```
parseJournalFile(content, sprintId):
  steps = []
  capReached = false
  for each line in content:
    if line matches /^### CAP-REACHED/:
      capReached = true; break
    if line matches /^### STEP (\S+) · (\S+) · (\S+)/:
      push current step if any
      current = { step_id, agent_id, timestamp, task_id: null,
                  what_done: "", what_considered: [], why_decision: "", why_change: "" }
    elif current exists:
      if line matches /^\*\*task-id:\*\* (.+)/:
        current.task_id = trim(match[1]) || null
      elif line matches /^\*\*what-done:\*\* (.+)/:
        current.what_done = match[1]
      elif line matches /^\*\*what-considered:\*\*/:
        inWhatConsidered = true
      elif inWhatConsidered and line matches /^- (.+)/:
        current.what_considered.push(match[1])
      elif line matches /^\*\*why-decision:\*\* (.+)/:
        inWhatConsidered = false; current.why_decision = match[1]
      elif line matches /^\*\*why-change:\*\* (.+)/:
        current.why_change = match[1]
  push final current step if any
  return steps

buildDecisionsDto(allSteps: {sprintId, step}[]):
  by_task = {}
  sprint_bucket = {}
  for each {sprintId, step}:
    if step.task_id:
      by_task[step.task_id] ??= []
      by_task[step.task_id].push(step)
    else:
      sprint_bucket[sprintId] ??= []
      sprint_bucket[sprintId].push(step)
  return { by_task, sprint_bucket }
```

---

### F3: Remix accordion UI (zone: dev-frontend)

**Files to modify:**
- `apps/frontend/app/routes/dashboard.orchestration.tsx`

**Type additions (additive, no removal):**
```typescript
interface StepDto {
  step_id: string;
  agent_id: string;
  timestamp: string;
  task_id: string | null;
  what_done: string;
  what_considered: string[];
  why_decision: string;
  why_change: string;
}
interface DecisionsDto {
  by_task: Record<string, StepDto[]>;
  sprint_bucket: Record<string, StepDto[]>;
}
// Extend OrchState (backward-compat: optional)
interface OrchState {
  // ... existing fields unchanged ...
  decisions?: DecisionsDto;
}
```

**Component changes:**
- `DoneTaskGroup` receives `decisions?: DecisionsDto` as prop (optional, safe if undefined)
- Add `useState<Set<string>>(new Set())` for `openTaskIds`
- Each DONE task row: add `cursor-pointer` class + `aria-expanded` attribute + chevron indicator
- Chevron: reuse the `▾` pattern already at line 430 (rotate-180 on expanded)
- `onClick` on row → call `toggle(task.id)` (multi-open Set pattern from RULING-5)
- Below each expandable row: conditionally render `<DecisionAccordion>` component (inline, same file)

**New component `DecisionAccordion` (inline in same file):**
```typescript
// Props: taskId, sprintId, decisions
// Logic:
// 1. taskSteps = decisions?.by_task[taskId] ?? []
// 2. sprintSteps = decisions?.sprint_bucket[sprintId] ?? []
// 3. if taskSteps.length === 0 && sprintSteps.length === 0:
//      render: "No decisions recorded for this task."
// 4. if taskSteps.length > 0:
//      render sorted-by-timestamp StepCards
// 5. if taskSteps.length === 0 && sprintSteps.length > 0:
//      render: "Sprint-level decisions (no task-id assigned)" + sorted StepCards
// 6. Never dangerouslySetInnerHTML — all fields are plain strings/arrays
```

**New component `StepCard` (inline in same file):**
```typescript
// Renders one StepDto:
// - step_id + agent_id header
// - <ClientTimestamp iso={step.timestamp}> 
// - "What was done:" what_done
// - "What was considered:" what_considered as <ul>
// - "Why this decision:" why_decision
// - "Why it changed:" why_change
// CSS: max-width + overflow-wrap: break-word on accordion container (EC-5 guard)
```

**`DoneTaskGroup` receives `sprintId` prop** (needed for fallback bucket lookup). The existing `TaskBoardPanel` must pass `sprintId` down. The sprint ID for a task can be derived from the `OrchStateTaskBoardSprint` object that contains the task — this requires `TaskBoardPanel` to thread `sprintId` into `DoneTaskGroup`. PM must ensure dev-frontend accounts for this in the subtask.

**Keyboard accessibility:**
- Trigger element on the task row: `tabIndex={0}` + `onKeyDown` handler for Enter/Space → toggle
- `aria-expanded={openTaskIds.has(task.id)}`
- `role="button"` on the clickable row cell or a wrapper

**No `dangerouslySetInnerHTML` anywhere in the accordion path.** All decision fields rendered as plain text or mapped arrays.

---

## Test Strategy

| Level | File | What |
|---|---|---|
| Unit | `1978-journal-store.test.ts` | parseJournalFile (6 cases above) |
| Unit | `1979-orchestration-decisions.test.ts` | buildOrchestrationDto extension (3 cases above) |
| Integration | `1977-orchestration-endpoint.test.ts` (extend) | GET /api/orchestration returns `decisions` field — JSON not markdown string |
| Frontend unit | `dashboard.orchestration.test.tsx` (new or extend) | DoneTaskGroup with decisions populated → accordion renders; with empty → shows "No decisions recorded" |

Existing 47-pass test suite must remain green (NFR-3). The only risk is the `1977` integration test — it must be extended (not replaced) to assert `decisions` is present and is an object, not a string.

---

## Risk Flags

| ID | Severity | Description | Mitigation |
|---|---|---|---|
| R-1 | MED | `buildOrchestrationDto` is a pure function currently — injecting `getDecisionsForSprints` (which does file I/O) makes it impure | Inject `decisionsDir` as a parameter (already string-injectable via orchStatePath context); unit tests pass a fixture tmpdir path |
| R-2 | MED | mtime cache is a module-level singleton — Bun's test runner runs tests in the same process; cache from one test could bleed into another | Tests must use unique tmpdir paths per test to get unique cache keys; OR expose a `_clearCacheForTesting()` export |
| R-3 | LOW | `DoneTaskGroup` currently takes `tasks: TaskRow[]` only — adding `decisions` + `sprintId` props changes its signature | TaskBoardPanel already owns the sprint context; additive prop with `?` makes it backward-compat during deploy window (NFR-3) |
| R-4 | LOW | Sprint-id in filename vs sprint-id in task_board may diverge (hand-authored journal vs machine sprint) | File-existence guard (missing file = empty decisions) already covers this; EC-1 confirmed in BA spec |
| R-5 | LOW | Parser must tolerate CRLF line endings (Windows git default) | Use `.split(/\r?\n/)` not `.split('\n')` in parseJournalFile |
| R-6 | LOW | CAP-REACHED sentinel uses `###` prefix — parser must not mistake it for a STEP block header | Parser checks for literal `### CAP-REACHED` before the STEP header regex; order in parser matters |

---

## Dependency + Dispatch Order

```
F1 (agent-father)
  ↓ STEP format committed to SKILL.md + flow files
F2 (dev-mcp-server)
  ↓ F1 format used as parser test fixture
  ↓ journalStore.ts + handler extension + tests shipped + mcp-server container rebuilt
F3 (dev-frontend)
  ↓ F2 DTO contract (decisions field in OrchestrationDto) consumed by Remix loader
  ↓ accordion UI shipped + frontend container rebuilt
QA
  ↓ verify live dashboard + API JSON not markdown + DONE task accordion renders correctly
```

F2 can be developed concurrently with F1 for everything except the unit test fixture (T1 in 1978 needs a STEP block with the new task-id line); F2 parser tests must be finalized only after F1 SKILL.md is committed.

F3 TypeScript types depend on F2's `OrchestrationDto` being merged (or at least the DTO type being published as a shared contract).

Sequential dispatch. No parallelism. Shared SSOT files involved (orch-state.json, SKILL.md, agent flow .md files) → sequential per dev-standards.

---

## PM Subtask Spec

PM must create the following sequential subtasks:

**ARCH-ORCH-F1** — zone: agent-father
- Edit `.claude/skills/decision-journal/SKILL.md` § Write Entry template + § Rules
- Edit `docs/agents/developer/flow/main.md`, `docs/agents/architect/flow/main.md`, `docs/agents/qa/flow/main.md` — inject task-id at journal-write step
- Audit and update any other agent flow that calls `decision-journal/SKILL.md § Write Entry`
- AC: SKILL.md template shows optional task-id line; developer/qa/architect flows stamp task-id at journal-write; a manually-written STEP with the new field parses correctly in F2 test fixture

**ARCH-ORCH-F2** — zone: dev-mcp-server
- Create `apps/mcp-server/src/infrastructure/journalStore.ts`
- Extend `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts`
- Create `1978-journal-store.test.ts` and `1979-orchestration-decisions.test.ts`
- Extend `1977-orchestration-endpoint.test.ts` (decisions field present, not markdown string)
- Rebuild mcp-server container after merge
- AC: all unit/integration tests pass; `GET /api/orchestration` returns `decisions` field as JSON; existing fields byte-identical; tsc 0 errors

**ARCH-ORCH-F3** — zone: dev-frontend
- Extend `apps/frontend/app/routes/dashboard.orchestration.tsx`
- Add types: StepDto, DecisionsDto; extend OrchState with optional decisions
- Extend DoneTaskGroup: decisions + sprintId props; multi-open Set state; aria-expanded
- Add DecisionAccordion + StepCard inline components
- Extend TaskBoardPanel to thread sprintId + decisions into DoneTaskGroup
- Rebuild frontend container after merge
- AC: DONE task accordion renders; non-DONE rows inert; empty state correct; keyboard accessible; tsc 0 errors

**ARCH-ORCH-QA** — zone: qa
- Verify `GET /api/orchestration` response has `decisions` as object (not markdown string)
- Verify DONE task row is clickable → accordion expands with STEP fields readable
- Verify non-DONE task row has no accordion affordance
- Verify "No decisions recorded" state for task with no journal entries
- Verify mcp-server + frontend containers rebuilt (not stale image)
- Sign-off via raw dashboard observation (not green badge)
