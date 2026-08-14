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
