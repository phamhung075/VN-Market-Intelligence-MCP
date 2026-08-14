---
sprint: UC-CDC-P1
branch: task/2008a-calendar-status-injectable-deps
size: M
zone: apps/mcp-server/
depends_on: []
blocks: [TASK_2008b, TASK_2008c]
---

## TLDR

Wire `calendar_status` computation into `emitPressureStateTool.ts` via injectable-deps pattern (FR-A1), add `SESSION_STATUSES` const to `vnTradingCalendar.ts` as SSOT (FR-A2), implement WARN+recompute enforcement inside `runEmitPressureState` rather than hard Zod-boundary reject to preserve the tool's documented never-throws contract.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Task ID:** TASK_2008a (dev-mcp-server specialist)
- **Parent:** UC-CDC-P1 (3-way decomposition)
- **Acceptance Criteria:**
  - [ ] **FR-A1 Implemented:** `calendar_status` computed via `isVnTradingDay(getTodayVnDate()).session_status` when caller omits the arg
    - New `computeCalendarStatusFn: () => SessionStatus` field added to `EmitPressureStateDeps` interface
    - `defaultDeps.computeCalendarStatusFn = () => isVnTradingDay(getTodayVnDate()).session_status`
    - L409 changed from `args.calendar_status ?? "unknown"` → `args.calendar_status ?? deps.computeCalendarStatusFn()`
    - Imports added: `{ isVnTradingDay, getTodayVnDate, type SessionStatus }` from `../../../../domain/services/vnTradingCalendar.js`
  - [ ] **FR-A2 Session Status Enum Gate:** Add runtime SSOT to avoid type-only alias drift
    - `export const SESSION_STATUSES = ["open", "holiday", "half_day", "weekend", "unknown"] as const;` added to `vnTradingCalendar.ts` above L22
    - Redefine `export type SessionStatus = typeof SESSION_STATUSES[number]` (identical resulting type)
    - `SESSION_STATUSES` imported into `emitPressureStateTool.ts`
  - [ ] **FR-A2 Enforcement:** Implement inside `runEmitPressureState`, NOT at Zod boundary
    - Wire-level field remains `z.string().optional()` (unchanged)
    - Inside `runEmitPressureState`: add validation logic:
      ```typescript
      const override = args.calendar_status;
      const valid = override && (SESSION_STATUSES as readonly string[]).includes(override);
      calendar_status: valid ? override! : deps.computeCalendarStatusFn()
      ```
    - Add `console.warn` when `override && !valid` (mirrors existing error/log pattern)
    - Rationale: Protects tool's documented never-throws invariant on MANDATORY `telemetry.md` Step 6.0 WORK-path call
  - [ ] **Blast Radius Fixed:** All 4 test-construction sites now build `EmitPressureStateDeps` with new field
    - `apps/mcp-server/src/__tests__/emit-pressure-state.test.ts` buildDeps() helper L578-594 gets `computeCalendarStatusFn` entry
    - `makeRunDeps()` L659-676 gets `computeCalendarStatusFn` entry
    - Standalone literal L793-802 gets `computeCalendarStatusFn` entry
    - Standalone literal L860-873 gets `computeCalendarStatusFn` entry
    - L827 assertion `Object.keys(parsed)).toHaveLength(9)` remains valid (no new field added to the output shape, only default-computation path changed)
  - [ ] **Test Coverage:** Existing pressure-state test suite passes; no new test failures introduced

- **Files to read first:**
  - `docs/handoffs/UC-CDC-P1-BA-spec.md` § [Architect] Brownfield Findings (full FR-by-FR spec, blast radius, risk flags)
  - `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts` (L302-322 injectable-deps pattern, L354-411 runEmitPressureState, L459-461 schema, L482 docstring)
  - `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` (L21-22 SessionStatus, L70 isVnTradingDay, L153 getTodayVnDate)
  - `apps/mcp-server/src/__tests__/emit-pressure-state.test.ts` (4 construction sites to update)

- **Files to modify:**
  - `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` (add SESSION_STATUSES const, redefine SessionStatus type)
  - `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts` (new EmitPressureStateDeps field, validation logic in runEmitPressureState, import SESSION_STATUSES)
  - `apps/mcp-server/src/__tests__/emit-pressure-state.test.ts` (4 test-construction sites)

- **Dependencies:** None (FR-A3, FR-A4, FR-A5 are independent)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (commit boundary, testing)
  - `apps/mcp-server/src/` DDD layer organization (application orchestration vs. domain services)
  - TypeScript `as const` pattern for runtime SSOT
  - Injectable-deps pattern already used by `signal_backlog`, `dev_queue_depth`, `container_vm_headroom_mb` in the same file

## Design Rationale

**Never-throws contract is load-bearing:** The `emit_pressure_state` tool is documented as "NEVER throws" in `telemetry.md` Step 6.0, which is a MANDATORY, un-skippable call in the dispatcher's WORK path. If Zod rejects an out-of-domain override at the schema boundary, it may surface as a tool-error or protocol-level rejection depending on MCP SDK behavior (not verified this cycle). To avoid any risk of breaking that contract, validation is moved **inside** `runEmitPressureState` with a WARN+recompute fallback — identical to the tool's own error-handling philosophy (returns `{success:false, reason}` on internal errors, never throws).

**DDD-layer parity:** FR-A1 mirrors existing pattern: `signal_backlog`, `dev_queue_depth`, `container_vm_headroom_mb` are all server-computed via injectable-deps function fields, not inline calls. Wiring `calendar_status` the same way maintains consistency and testability.

## Architect Verification (2026-08-14)

- All file/line targets re-verified live this cycle
- FR-A1 dependencies confirmed: `isVnTradingDay` and `getTodayVnDate` already used by sibling `isTradingDayTool.ts` from same relative path
- Blast radius bounded to 4 test sites (no hidden construction sites)
- Risk flags: never-throws contract real and specific to this tool's MANDATORY call site; mitigation sound

---

## RETURN (to be filled by developer)

Task complete → git commit with `Task: TASK_2008a` trailer + acceptance criteria list

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` — FR-A2: added `export const SESSION_STATUSES = ["open","holiday","half_day","weekend","unknown"] as const` above the type; redefined `export type SessionStatus = (typeof SESSION_STATUSES)[number]` (identical resulting type — verified `tsc --noEmit` clean, zero call-site edits needed anywhere else in the codebase).
  - `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts` — FR-A1: imported `{ isVnTradingDay, getTodayVnDate, SESSION_STATUSES, type SessionStatus }` from `vnTradingCalendar.js`; added `computeCalendarStatusFn: () => SessionStatus` to `EmitPressureStateDeps`; `defaultDeps.computeCalendarStatusFn = () => isVnTradingDay(getTodayVnDate()).session_status`; `runEmitPressureState`'s old `calendar_status: args.calendar_status ?? "unknown"` line replaced with the in-domain/out-of-domain branch below. FR-A2 enforcement: in-domain override honored as-is; out-of-domain override `console.warn`'d (`SESSION_STATUSES.join("|")` listed in the message) and discarded in favor of `deps.computeCalendarStatusFn()` — Zod wire-level schema stays bare `z.string().optional()` (unchanged, per Design Rationale — no hard reject). Tool description string + field `.describe()` text updated to match the new default-computation behavior (was stale "Defaults to 'unknown'" prose).
  - `apps/mcp-server/src/__tests__/emit-pressure-state.test.ts` — all 4 blast-radius test-construction sites updated with `computeCalendarStatusFn` stub (`buildDeps` L578-594, `makeRunDeps` L659-676, standalone literal ~L793-802, standalone literal ~L860-873); new describe block `runEmitPressureState — calendar_status (TASK_2008a FR-A1/FR-A2)` with 4 tests (omitted→server-compute, in-domain override wins, out-of-domain WARN+recompute via `spyOn(console,"warn")`, wire-level never-throws on out-of-domain value). L827 9-key assertion untouched/still valid (no new output key, only the default-computation path changed).
- **Tests written:** `emit-pressure-state.test.ts` — 4 new tests (GREEN), 35/35 total in file. RED confirmed pre-implementation (3/4 new tests failed — the 4th, "in-domain override wins", passed trivially since that was already the pre-existing behavior).
- **Git commits:** (pending — see commit below)
- **Type check:** clean (`bun tsc --noEmit`)
- **bun test (isolated file):** `src/__tests__/emit-pressure-state.test.ts` — 35 pass / 0 fail / 100 expect() calls
- **bun test (consumer regression):** `DWF-is-trading-day.test.ts` + `FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL.test.ts` + `ALPHA-S1-STARTUP-CANDLE-GUARD.test.ts` + `PRED-RESOLVER-GAP-FIX.test.ts` (all 4 import/exercise `vnTradingCalendar.ts` or `emitPressureStateTool.ts`) — 64 pass / 0 fail / 144 expect() calls
- **bun test (full suite, non-isolated, bare `bun test`):** 15291 pass / 40 skip / 51 fail / 48289 expect() calls, 484.02s. Below the documented ~55-57 pre-existing-noise band from the last 2 dev-mcp-server cycles (VPS-proxy-health DB tests, task_heartbeat/task_release Zod schema tests, 5000ms MCP-tool timeout flakes under parallel-run load — Task 1146/1518/251, Task 1858c logVpsPush, Task 1193 push-prices). Grepped every `(fail)` line for `pressure|calendar|vnTrading|isTradingDay` — zero matches; none of the 51 fails touch this task's files.
- **Gate 2b (server boot):** `PORT=3099 bun run src/index.ts` → `/health` 200, `{"status":"ok","toolCount":183}`
- **Gate 2c/2d (tool/scheduler count):** `toolCount`=183, `cronJobCount`=88 — both match documented pre-task baseline (no barrel edit)
- **Tool count:** 183 tools — matches pre-task baseline
- **Scheduler count:** 88 cron jobs — matches pre-task baseline
- **Docs updated:** `docs/architecture/microservice/mcp-server/domain-model.md` (new `vnTradingCalendar.ts` row under Domain Services § Specialized, documenting `SESSION_STATUSES` SSOT), `docs/architecture/microservice/mcp-server/system.md` (added the previously-undocumented `emit_pressure_state` tool row to the Tools table, including the FR-A1/FR-A2 calendar_status contract), `docs/architecture/microservice/mcp-server/testing.md` (new `emit-pressure-state.test.ts` row under Core Infrastructure), `docs/WORK.md` (one-liner)
- **Graphify:** skipped — docs touched are all `docs/architecture/microservice/mcp-server/*` (service-doc tier), not the `docs/{policies,protocols,standards,references}/` knowledge-graph tier
- **Simplicity gate:** PASS — Q1 scope clean (wires exactly the AC-specified seam, no new knob beyond `computeCalendarStatusFn`); Q2 no single-use abstractions (`SESSION_STATUSES` is consumed by both the enforcement check and the Zod-describe text); Q3 senior-dev test clean (matches the existing `signal_backlog`/`dev_queue_depth`/`container_vm_headroom_mb` injectable-deps pattern exactly); Q4 ratio well under 50% (net diff is ~35 lines of production code across 2 files for a well-bounded FR pair)
