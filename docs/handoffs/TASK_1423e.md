# TASK_1423e — get_macro_calendar MCP Tool

**Date:** 2026-04-29
**Author:** developer agent
**Status:** IMPL COMPLETE — awaiting QA

---

## What was implemented

### Domain service
`apps/mcp-server/src/domain/services/macro/macroCalendar.ts`

- Pure function `getMacroCalendar(referenceDate?, days?)` — no DB, no HTTP.
- Static 2026 calendar: FOMC x8, GSO CPI x12, GSO GDP x4, Vietnam PMI x12, SBV x4 = 36 events.
- `isPivotMonth(month)` — returns true for months 3, 6, 9, 12.
- `nextPivotWindowLabel(date)` — returns e.g. "June 2026".
- `buildPivotWindowWarning(date)` — non-null string when within 14 days of next pivot month start.
- Events filtered to `[startDate, startDate + days - 1]` and sorted ascending by date.
- Each event annotated with `isPivotWindow` based on its event month.

### MCP tool
`apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts`

- Registers `get_macro_calendar` tool.
- Input: `{ days?: number (1–365, default 60), _testReferenceDate?: string (ISO date for tests) }`.
- Output: `MacroCalendarResult` JSON via standard MCP `content[0].text`.
- `registerCarryTools` exported.

### Registry wiring
- `apps/mcp-server/src/interface/mcp/tools/registry.ts`: import + `registerCarryTools` appended to array (tool count 114 → 115).
- `apps/mcp-server/src/interface/mcp/tools/macro/index.ts`: export added.

### Tests
`apps/mcp-server/src/__tests__/1423e-macro-calendar.test.ts`

23 tests, 110 assertions — all pass.

Covers:
- `isPivotMonth` — all 4 pivot months + all 8 non-pivot months
- 60-day window filtering — inclusive boundaries
- Custom `days` parameter (7, 30, 365)
- Sort order ascending
- `isPivotWindow` annotation correctness (March=true, January=false, June=true)
- `currentMonthIsPivotWindow` (March, January, December)
- `nextPivotWindowLabel` (Jan→March 2026, Apr→June 2026, Dec→March 2027)
- `buildPivotWindowWarning` (non-null ≤14 days before pivot, null otherwise)
- Result shape (all required fields present, date format YYYY-MM-DD)

### tsc --noEmit
Zero errors in new files. Pre-existing errors in `1383-macro-alert-dispatch.test.ts` and `1397c-vn-index-refresh.test.ts` are unrelated.

---

## QA checklist

1. Run `bun test src/__tests__/1423e-macro-calendar.test.ts` from `apps/mcp-server/` — expect 23 pass, 0 fail.
2. Run `bun run tsc --noEmit 2>&1 | grep "1423e\|macroCalendar\|carryTools"` — expect zero output.
3. Confirm `get_macro_calendar` appears in `toolRegistry` array (registry.ts line ~175).
4. Smoke test: call `getMacroCalendar(new Date("2026-02-20"), 60)` — should return events with March events flagged `isPivotWindow=true` and `pivotWindowWarning` non-null.
5. Smoke test: call `getMacroCalendar(new Date("2026-01-15"), 7)` — should return only events in 2026-01-15..2026-01-21 range.

---

## RETURN
DONE: get_macro_calendar MCP tool implemented — pure domain service (macroCalendar.ts), interface layer (carryTools.ts), registry wired, 23 tests green, tsc clean
NEXT: qa | verify TASK-1423e implementation against handoff checklist
HANDOFF: docs/handoffs/TASK_1423e.md
PIPELINE: continue
