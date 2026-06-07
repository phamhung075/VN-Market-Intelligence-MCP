---
sprint: TOOL-SURFACE-UPGRADE
branch: task/TSU-U1-per-call-counter
size: M
zone: apps/mcp-server/src/interface/mcp/
depends_on: []
blocks: ["TSU-DEV-U2-GEN"]
---

# U1: Per-Call Telemetry Counter

## TLDR

Add a server-side per-tool invocation counter that increments on every tool handler entry, surviving across gateway SSE cutover. Counter flushes to `docs/agent-memory/modules/tool-usage-stats.json` every 8h. Deliverable: new `perCallCounterStore.ts` module + hook in `server.ts` + modified `trackSessionToolUsageJob.ts`.

---

## [PM] Planning Context

**Sprint:** TOOL-SURFACE-UPGRADE  
**Unit:** U1 — Per-call telemetry counter  
**Zone:** `apps/mcp-server/src/interface/mcp/`  
**Priority:** P1  
**Type:** Feature (infrastructure)  
**Effort:** ~2h

### Acceptance Criteria

- [x] AC-U1-1: New file `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts` created with singleton counter Map and public API
- [x] AC-U1-2: `incrementTool(name: string)` exported, fire-and-forget synchronous Map.set() — zero blocking I/O
- [x] AC-U1-3: `getSnapshot()` returns shallow copy of counter map; `resetCounters()` exported for job use
- [x] AC-U1-4: Hook location: `apps/mcp-server/src/interface/mcp/server.ts` after line ~220 (after registerAllTools)
- [x] AC-U1-5: Wrap each registered tool handler: iterate `Object.entries(server._registeredTools)`, replace handler with proxy that calls `incrementTool(name)` before original handler
- [x] AC-U1-6: Modified file: `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts` — replace `sessionToolCache.snapshot()` logic with `perCallCounterStore.getSnapshot()`
- [x] AC-U1-7: Output schema change: remove `sessionCount` field (meaningless post-gateway); keep `uniqueTools` = Object.keys(toolCounts).length
- [x] AC-U1-8: QA gate: invoke any tool via gateway wrapper once; within 8h (or force-run job), assert `tool-usage-stats.json toolCounts[<toolName>] >= 1`

### Files to Read First

- `apps/mcp-server/src/interface/mcp/server.ts` — lines 200–220 (registerAllTools call, _registeredTools access pattern already established)
- `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts` — entire file (understand sessionToolCache snapshot pattern, job signature)
- `apps/mcp-server/src/infrastructure/cache/sessionToolCache.ts` — understand why SSE handshake never fires in gateway model

### Files to Create

- `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts` — ~40L module (singleton, Map, 4 functions)

### Files to Modify

- `apps/mcp-server/src/interface/mcp/server.ts` — add 5–8 lines after line 220 (handler proxy loop)
- `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts` — replace sessionToolCache snapshot call with perCallCounterStore.getSnapshot() (3 lines)

### Dependencies

None (standalone infrastructure module, no upstream dependencies within this sprint).

### Knowledge Needed

- `docs/policies/dev-standards.md` — commit convention, test baseline
- `docs/architecture-briefs/2026-06-07-livedb-recovery-runbook.md` — reference for serverside telemetry patterns (if applicable)
- `docs/ARCHITECTURE.md` — MCP server architecture and tool registration flow

### Related Documentation

- Architect design: `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U1: Per-Call Counter Design (lines 322–342)
- Root cause: `sessionToolCache` never populated post-gateway (gateway dials SSE per-call, `server.ts:205` handshake never fires)

---

## Implementation Guidance

### perCallCounterStore.ts Design

```typescript
// infrastructure/telemetry/perCallCounterStore.ts

const counterStore: Map<string, number> = new Map();

export function incrementTool(name: string): void {
  const current = counterStore.get(name) ?? 0;
  counterStore.set(name, current + 1);
}

export function getSnapshot(): Record<string, number> {
  return Object.fromEntries(counterStore);
}

export function resetCounters(): void {
  counterStore.clear();
}

export function getTool(name: string): number {
  return counterStore.get(name) ?? 0;
}
```

**DDD Layer:** Infrastructure (no domain logic, pure telemetry store).

### server.ts Hook Pattern

After `registerAllTools(server)` completes (around line 220):

```typescript
// Wrap registered tool handlers for per-call telemetry
const registeredTools = Object.entries(server._registeredTools as Record<string, any>);
for (const [toolName, toolDef] of registeredTools) {
  const originalHandler = toolDef.handler;
  toolDef.handler = async (args) => {
    incrementTool(toolName);
    return originalHandler(args);
  };
}
```

**Synchronous increment:** Map.set() is instantaneous; tool execution latency not impacted.

### trackSessionToolUsageJob.ts Modification

Replace:
```typescript
const sessionSnapshot = sessionToolCache.snapshot();
```

With:
```typescript
import { getSnapshot as getCounterSnapshot } from '../telemetry/perCallCounterStore';
const sessionSnapshot = getCounterSnapshot();
```

Update output schema:
```typescript
const output = {
  generatedAt: new Date().toISOString(),
  // sessionCount removed (meaningless post-gateway)
  uniqueTools: Object.keys(sessionSnapshot).length,
  toolCounts: sessionSnapshot
};
```

---

## Test Plan

### Unit Tests

1. **T-U1-1:** incrementTool() increments counter for new tool
2. **T-U1-2:** incrementTool() increments existing counter
3. **T-U1-3:** getSnapshot() returns shallow copy (mutations to snapshot don't affect store)
4. **T-U1-4:** resetCounters() clears all entries
5. **T-U1-5:** getTool() returns 0 for absent tool

### Integration Tests

1. **T-U1-6:** Tool handler proxy calls incrementTool before handler execution
2. **T-U1-7:** Tool handler error does not prevent increment
3. **T-U1-8:** jobRun calls getSnapshot() and writes JSON with new schema (no sessionCount field)

### QA Gate

**QA-U1-1:** Invoke a tool via gateway wrapper (any tool, e.g., `call_tool(server="vn-market", tool="get_market_snapshot", arguments={})`). Within 8 hours (or manually trigger the job), verify:
- `tool-usage-stats.json` is written
- `toolCounts["get_market_snapshot"] >= 1`
- `sessionCount` field absent
- `uniqueTools` count > 0

**Anti-False-Green:** Verify test fails if counter is never incremented (inject empty incrementTool() implementation, assert toolCounts field is empty {}, revert).

---

## Risk & Mitigation

**Risk R-U1-1:** server._registeredTools is private field (type cast required). Already used in production (buildToolNameMap pattern, lines 203–219). Safe to extend.

**Mitigation:** Minimal shim (5 lines), same access pattern as existing code.

**Risk R-U1-2:** Handler wrapping could introduce latency if not careful. Solution: Synchronous Map.set() — zero I/O, zero latency.

**Risk R-U1-3:** Job failure prevents counter flush. Solution: Fail-loud per fail-loud-protocol. Log error, skip this cycle, counters persist in-memory until next job run.

---

## Rebuild Required

**Yes.** Any `apps/mcp-server/` code change requires ops to REBUILD:
```bash
docker compose build --no-cache mcp-server
docker compose up -d --no-deps --force-recreate mcp-server
```

QA verifies via `call_tool(...)` wrapper, raw responses (not badges).

---

## Commit Checklist

- [ ] New file created: `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts`
- [ ] `server.ts` hook added after registerAllTools()
- [ ] `trackSessionToolUsageJob.ts` modified (schema + snapshot call)
- [ ] All 8 unit/integration tests pass (tsc exit 0)
- [ ] Anti-false-green test injected and verified red
- [ ] Commit message: `feat(U1): per-call telemetry counter — incrementTool hook + job flush`
- [ ] AC trailer appended per commit-convention.md

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files created:**
  - `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts:52` — singleton counter Map; exports incrementTool/getSnapshot/resetCounters/getTool
  - `apps/mcp-server/src/__tests__/TSU-DEV-U1-per-call-counter.test.ts:115` — 8 unit+integration tests (T-U1-1..T-U1-8)
  - `docs/agent-memory/decisions/sprint-TOOL-SURFACE-UPGRADE-dev-mcp-server.md` — decision journal
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/server.ts` — added `incrementTool` import + handler proxy loop after registerAllTools() (~18L)
  - `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts:65` — full rewrite: reads perCallCounterStore.getSnapshot(); removed sessionCount field; removed SessionToolCache DI
  - `apps/mcp-server/src/scheduler/startScheduler.ts:729` — updated rowsWritten: stats.uniqueTools (sessionCount removed)
  - `apps/mcp-server/src/__tests__/1356b-track-session-tool-usage-job-gaps.test.ts:140` — updated 8 tests for counter-based API
  - `apps/mcp-server/src/__tests__/1299c-session-cache.test.ts` — updated TC-7+TC-8 for new job signature
  - `docs/architecture/microservice/mcp-server/infrastructure.md` — added Telemetry section (perCallCounterStore + sessionToolCache legacy status)
  - `docs/data/orch/orch-state.json` — TSU-DEV-U1 status: TODO→REVIEW
- **Tests written:** `TSU-DEV-U1-per-call-counter.test.ts` — 8 assertions, GREEN
- **Tests updated:** `1356b-track-session-tool-usage-job-gaps.test.ts` (8), `1299c-session-cache.test.ts` TC-7+TC-8 — all GREEN
- **Git commits:** see below
- **Type check:** 0 new errors (1 pre-existing in tool-registry-parity.test.ts — TSU-DEV-U2-GEN scope)
- **bun test:** 24 pass / 0 fail (targeted: TSU-DEV-U1 + 1356b + 1299c + 1862c)
- **Tool count:** 162 tools — matches pre-task baseline
- **Scheduler count:** 76 cron.schedule entries — matches pre-task baseline (baseline 76)
- **Docs updated:** `docs/architecture/microservice/mcp-server/infrastructure.md` — Telemetry section added
- **Graphify:** skipped (infrastructure.md update only, no domain model change)

### G12 DoD Gate Evidence

| Gate | Result |
|------|--------|
| bun test (targeted 24 tests) | 24 pass / 0 fail |
| tsc --noEmit | 0 new errors (1 pre-existing in TSU-DEV-U2-GEN file) |
| Tool count (gen-project-stats --dry-run) | "toolCount": 162 |
| Scheduler count (grep cron.schedule) | 76 |

---

## Related Tasks

- Blocks: TSU-DEV-U2-GEN (parity test uses tool count baseline)
- Independent of: TSU-DEV-U3, TSU-DEV-U4, TSU-DEV-U5, TSU-DEV-U6, TSU-DEV-U2-PARITY (same zone but no file conflict)
