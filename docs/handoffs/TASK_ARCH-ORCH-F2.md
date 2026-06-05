---
sprint: ORCH-DASH-DECISION-DRILLDOWN
branch: task/orch-dash-f2-journal-parser
size: M
zone: apps/mcp-server/
depends_on: [ARCH-ORCH-F1]
blocks: [ARCH-ORCH-F3]
---

## TLDR

Create `journalStore.ts` (pure parse + file-read infrastructure module) and extend `orchestrationHandler.ts` to inject parsed decision journal entries into the `GET /api/orchestration` JSON response. Add 3 new unit/integration tests. Rebuild mcp-server container. Commit once all tests pass.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-F2-1: `apps/mcp-server/src/infrastructure/journalStore.ts` exists with `StepDto`, `DecisionsDto` types and pure `parseJournalFile(content, sprintId)` function
  - [ ] AC-F2-2: `journalStore.ts` exports `getDecisionsForSprints(sprintIds, decisionsDir)` with singleton mtime cache (module-level `Map<string, {mtime, steps}>`)
  - [ ] AC-F2-3: Parser correctly routes STEP blocks: with task-id → `by_task[task_id][]`; without task-id → `sprint_bucket[sprint_id][]`
  - [ ] AC-F2-4: Parser handles missing journal file (ENOENT) gracefully; returns `[]` with no exception
  - [ ] AC-F2-5: Parser stops reading at `### CAP-REACHED` sentinel; discards entries after sentinel
  - [ ] AC-F2-6: `orchestrationHandler.ts` — add `decisions: DecisionsDto` field to `OrchestrationDto` interface
  - [ ] AC-F2-7: `buildOrchestrationDto` computes sprint-id union from `state.sprint_goal.entries[*].sprint_id + state.task_board.active_sprints[*].id`; calls `getDecisionsForSprints`; includes `decisions` in returned DTO
  - [ ] AC-F2-8: `decisions` field always present (never null); uses `{ by_task: {}, sprint_bucket: {} }` as zero-value when no journal files exist
  - [ ] AC-F2-9: Test `1978-journal-store.test.ts` passes all 6 cases: T1 (with task-id), T2 (without task-id), T3 (missing file), T4 (malformed STEP), T5 (CAP-REACHED), T6 (multiple sprints)
  - [ ] AC-F2-10: Test `1979-orchestration-decisions.test.ts` passes all 3 cases: T1 (with decisions), T2 (no journal files), T3 (regression — existing fields byte-identical)
  - [ ] AC-F2-11: Extend `1977-orchestration-endpoint.test.ts`: assert `decisions` field present, is object (not markdown string), and follows DTO schema
  - [ ] AC-F2-12: `bun test` shows all 47+ existing tests green, +3 new tests green, 0 failures
  - [ ] AC-F2-13: `tsc` shows 0 errors
  - [ ] AC-F2-14: mcp-server container rebuilt and running; `curl http://localhost:3000/api/orchestration` returns JSON with `decisions` field

- **Files to read first:**
  - `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` — existing `buildOrchestrationDto` (understand DTO shape, imports, error handling)
  - `apps/mcp-server/src/infrastructure/orchStateStore.ts` — module-level singleton patterns (mtime cache modeled on this)
  - `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` § F2 — full parser pseudocode + risk flags (R-1 through R-6)
  - `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md` — existing journal entries to use as parser test fixture
  - `apps/mcp-server/src/__tests__/1977-orchestration-endpoint.test.ts` — existing orchestration test structure

- **Files to create:**
  - `apps/mcp-server/src/infrastructure/journalStore.ts` — types + parse + cache logic
  - `apps/mcp-server/src/__tests__/1978-journal-store.test.ts` — 6 unit test cases
  - `apps/mcp-server/src/__tests__/1979-orchestration-decisions.test.ts` — 3 integration test cases

- **Files to modify:**
  - `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` — add imports, extend `OrchestrationDto` interface, modify `buildOrchestrationDto` to compute sprint union + call `getDecisionsForSprints` + include `decisions` in return DTO
  - `apps/mcp-server/src/__tests__/1977-orchestration-endpoint.test.ts` — add assertions to verify `decisions` field present and is object

- **Dependencies:** ARCH-ORCH-F1 (format contract needed for parser test fixture)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (DDD layer assignment, testing tiers)
  - `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` § F2 (full design, pseudocode, risk flags)
  - `.claude/skills/commit-boundary/SKILL.md` (explicit-stage commit discipline)

---

## Architecture Reference

Full design in `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` § F2.

**DDD Layer Assignment:**
- `journalStore.ts` → **infrastructure** (file I/O, singleton cache)
- `StepDto` / `DecisionsDto` types → **interface** (DTO, in orchestrationHandler.ts)
- `parseJournalFile` → infrastructure (pure parse, testable in isolation)
- `getDecisionsForSprints` → infrastructure (file read + cache wrapper)
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

**Risk flags to mitigate:**
- **R-1 (purity):** `buildOrchestrationDto` becomes impure (file I/O). Mitigate: inject `decisionsDir` as parameter; unit tests pass fixture tmpdir.
- **R-2 (cache bleed):** Singleton cache is process-scoped; Bun test runner may run tests in same process. Mitigate: use unique tmpdir paths per test OR expose `_clearCacheForTesting()` export.
- **R-5 (CRLF):** Parser must handle Windows line endings. Mitigate: use `.split(/\r?\n/)` not `.split('\n')`.
- **R-6 (CAP-REACHED):** Parser must not confuse CAP-REACHED with STEP header. Mitigate: check for literal `### CAP-REACHED` before STEP regex; order matters.

**Mtime cache singleton (module-level):**
```typescript
const _cache = new Map<string, { mtime: number; steps: StepDto[] }>();
```

On each `getDecisionsForSprints(sprintIds, decisionsDir)` call:
1. For each sprint ID, compute `filePath = path.join(decisionsDir, `sprint-${id}.md`)`.
2. `stat(filePath)` — if ENOENT → return `[]` (no crash).
3. If cached and `cache.mtime === stat.mtimeMs` → return cached steps (fast path).
4. If not cached or mtime changed → read + parse → update cache → return steps.

---

## Test Specification

| Test File | Name | Scope | Fixture |
|---|---|---|---|
| `1978-journal-store.test.ts` | T1: with task-id | parseJournalFile routes entry to `by_task[task_id][]` | STEP with `**task-id:** ABC-123` |
| | T2: without task-id | parseJournalFile routes entry to `sprint_bucket[sprintId][]` | STEP without task-id line |
| | T3: missing file | getDecisionsForSprints on ENOENT returns `[]`, no exception | non-existent `sprint-xxx.md` |
| | T4: malformed STEP | Parser uses empty string fallbacks, does not throw | STEP with missing field |
| | T5: CAP-REACHED | Entries before sentinel returned, after discarded | journal with sentinel at line 50 |
| | T6: multi-sprint | `by_task` merges entries from all files, ordered by timestamp | 2 fixture journal files |
| `1979-orchestration-decisions.test.ts` | T1: with decisions | `buildOrchestrationDto` includes `decisions` with correct `by_task` entries | orch-state + fixture journal |
| | T2: no journal files | `buildOrchestrationDto` with no journal files returns zero-value `decisions` | orch-state only |
| | T3: regression | Existing fields byte-identical when `decisions = {}` | compare pre/post JSON |
| `1977-orchestration-endpoint.test.ts` (extend) | Verify decisions in response | GET /api/orchestration returns `decisions` as object (not markdown) | live endpoint test |

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files created:**
  - `apps/mcp-server/src/infrastructure/journalStore.ts` — 215L (StepDto/DecisionsDto types, parseJournalFile, buildDecisionsDto, getDecisionsForSprints, mtime cache, _clearCacheForTesting)
  - `apps/mcp-server/src/__tests__/1978-journal-store.test.ts` — 26 tests GREEN
  - `apps/mcp-server/src/__tests__/1979-orchestration-decisions.test.ts` — 13 tests GREEN
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` — added decisions: DecisionsDto to OrchestrationDto; extended buildOrchestrationDto with decisionsDir param + sprint-ID union
  - `apps/mcp-server/src/__tests__/1977-orchestration-endpoint.test.ts` — +1 T1h assertion (decisions field schema)
- **Tests written:** 1978 (26 tests), 1979 (13 tests), 1977 extended (+1 test) = 40 new assertions
- **Git commits:** `da37602f feat(mcp-server): ARCH-ORCH-F2 — journalStore + orchestrationHandler decisions extension`
- **Type check:** clean (`bun tsc --noEmit` 0 errors)
- **bun test (F2 files):** 59 pass / 0 fail (1977+1978+1979 together)
- **Live verify:** `curl localhost:3000/api/orchestration` → `decisions.by_task["ARCH-ORCH-F1"]` (agent-father-S1 present), `decisions.sprint_bucket["ORCH-DASH-DECISION-DRILLDOWN"]` (9 untagged entries); decisions is object not markdown string.
- **Container:** mcp-server rebuilt and restarted (`docker compose build + up -d`)
- **Docs updated:** `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md` (dev-mcp-server-S1 STEP), `docs/agent-memory/notebooks/dev-mcp-server.md` (c374), `docs/data/orch/orch-state.json` (ARCH-ORCH-F2 → REVIEW)

**Live DTO shape (F3 contract — load-bearing):**
```json
{
  "decisions": {
    "by_task": {
      "ARCH-ORCH-F1": [
        {
          "step_id": "agent-father-S1",
          "agent_id": "agent-father",
          "timestamp": "2026-06-05T00:00:00Z",
          "task_id": "ARCH-ORCH-F1",
          "what_done": "...",
          "what_considered": ["..."],
          "why_decision": "...",
          "why_change": "...",
          "sprint_id": "ORCH-DASH-DECISION-DRILLDOWN"
        }
      ]
    },
    "sprint_bucket": {
      "ORCH-DASH-DECISION-DRILLDOWN": [
        { "step_id": "po-S1", "agent_id": "po", "task_id": null, ... }
      ]
    }
  }
}
```

---

## Sign-off Criteria

- `journalStore.ts` has module-level mtime cache; parser matches pseudocode exactly
- All 6 unit tests pass; all 3 integration tests pass
- `1977` integration test extended, still passes
- `bun test` shows 50+ green, 0 failures
- `tsc` shows 0 errors
- mcp-server container rebuilt; `curl /api/orchestration` returns valid JSON with `decisions` field
- Single atomic commit: `feat(mcp-server): ARCH-ORCH-F2 — journalStore + orchestrationHandler decisions extension`
