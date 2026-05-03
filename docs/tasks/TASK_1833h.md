# TASK_1833h — FIX: freshnessSlaMonitorJob market-hours blindness (weekend/holiday false alarms)

**Sprint:** 1833
**Priority:** P2-HIGH
**Type:** BUG
**Owner:** developer
**Branch:** `task/1833h-sla-trading-day-gate`
**Estimated effort:** ~2h
**Depends on:** none

---

## Context

`isVnMarketHours()` in `freshnessSlaChecker.ts` checks only UTC hour range (02:00–08:59), not
day-of-week. On Saturday/Sunday at 04:00 UTC the function returns `true`, which triggers
foreign-flow SLA alerts on non-trading days. Confirmed false alarm: 2026-05-01 (Labour Day)
tracked as 1833d (closed as false alarm); root cause tracked here as 1833h.

---

## Root Cause

```
isVnMarketHours(now) returns true  ← 04:00 UTC Saturday
  → checkDataFreshnessSla detects foreign_flow breach
    → escalation fires to WORK channel
```

`isVnMarketHours` has no weekday or public-holiday awareness.

---

## Changes Required

### File 1 — `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts`

1. Add `VN_PUBLIC_HOLIDAYS` constant — `ReadonlySet<string>` of `YYYY-MM-DD` strings.
   Include at minimum 2025–2026 public holidays (New Year, Tet week, Hung Kings, Liberation Day,
   Labour Day, National Day). Example entry: `"2026-05-01"`.

2. Add helper `toVnDateString(now: Date): string` — returns `YYYY-MM-DD` in UTC+7 timezone.
   Formula: `new Date(now.getTime() + 7 * 60 * 60 * 1000)` then extract date components.

3. Add exported function `isVnTradingDay(now: Date): boolean`:
   - Returns `false` if `now.getUTCDay()` is 0 (Sunday) or 6 (Saturday)
   - Returns `false` if `VN_PUBLIC_HOLIDAYS.has(toVnDateString(now))`
   - Returns `true` otherwise

4. In `isVnMarketHours(now)` — add as first line:
   ```typescript
   if (!isVnTradingDay(now)) return false;
   ```

Estimated: ~35 lines added. No existing lines deleted or modified (additive only except the
one guard line in `isVnMarketHours`).

### File 2 — `apps/mcp-server/src/__tests__/1407b-sla-market-hours-gate.test.ts`

Add 6 new test cases (MH-9 through MH-14) inside the existing `describe` block. Do NOT
modify the existing MH-1 through MH-8 tests.

| Case | Input date | Signal | Expected |
|------|------------|--------|----------|
| MH-9  | Saturday 2026-04-26 04:00 UTC (market-hours window but Sat) | foreign_flow stale 15 min | escalation NOT called |
| MH-10 | Sunday 2026-04-27T00:30 — wait, Sunday at 04:00 UTC | price stale 15 min | escalation NOT called |
| MH-11 | Saturday 2026-04-26 04:00 UTC | bctc stale 400 min | escalation IS called (24/7 source) |
| MH-12 | Labour Day 2026-05-01 04:00 UTC (Friday, holiday) | foreign_flow stale 15 min | escalation NOT called |
| MH-13 | Labour Day 2026-05-01 04:00 UTC (Friday, holiday) | price stale 15 min | escalation NOT called |
| MH-14 | Monday after Labour Day 2026-05-04 04:00 UTC (first trading day) | price stale 15 min | escalation IS called |

Reference constants to add:
```typescript
const SAT_MARKET_HOURS = new Date("2026-04-26T04:00:00.000Z"); // Saturday
const SUN_MARKET_HOURS = new Date("2026-04-27T04:00:00.000Z"); // Sunday (reuse existing OFF_HOURS? No — different semantics, add explicit)
const LABOUR_DAY_MARKET_HOURS = new Date("2026-05-01T04:00:00.000Z"); // Friday holiday
const FIRST_TRADING_DAY = new Date("2026-05-04T04:00:00.000Z"); // Monday post-holiday
```

Estimated: ~80 lines added.

### File 3 — `apps/mcp-server/src/domain/services/index.ts`

Add `isVnTradingDay` to the explicit export list for `freshnessSlaChecker.js`:

```typescript
export {
  checkDataFreshnessSla,
  checkSignalSla,
  classifySeverity,
  isVnMarketHours,
  isVnTradingDay,       // ← add this line
  getSlaThreshold,
  DEFAULT_SLA_CONFIG,
} from "./freshnessSlaChecker.js";
```

Estimated: 1 line added.

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1 | `isVnTradingDay(new Date("2026-04-26T04:00:00.000Z"))` returns `false` (Saturday) |
| AC-2 | `isVnTradingDay(new Date("2026-04-27T04:00:00.000Z"))` returns `false` (Sunday) |
| AC-3 | `isVnTradingDay(new Date("2026-05-01T04:00:00.000Z"))` returns `false` (Labour Day Friday) |
| AC-4 | `isVnTradingDay(new Date("2026-05-04T04:00:00.000Z"))` returns `true` (Monday after holiday) |
| AC-5 | `isVnMarketHours(new Date("2026-04-26T04:00:00.000Z"))` returns `false` (Saturday in UTC window) |
| AC-6 | `isVnMarketHours(new Date("2026-04-27T04:00:00.000Z"))` returns `false` (Sunday in UTC window) |
| AC-7 | MH-9: Saturday + foreign_flow breach → escalation NOT called |
| AC-8 | MH-10: Sunday + price breach → escalation NOT called |
| AC-9 | MH-11: Saturday + bctc breach → escalation IS called (24/7 source unaffected) |
| AC-10 | MH-12: Labour Day + foreign_flow breach → escalation NOT called |
| AC-11 | MH-13: Labour Day + price breach → escalation NOT called |
| AC-12 | MH-14: First trading day post-holiday + price breach → escalation IS called |
| AC-13 | All existing MH-1..MH-8 tests still pass (no regression) |
| AC-14 | `isVnTradingDay` exported from `domain/services/index.ts` (barrel) |
| AC-15 | `tsc --noEmit` passes with zero errors |

---

## Files Touched

```
apps/mcp-server/src/domain/services/freshnessSlaChecker.ts   (+35 lines)
apps/mcp-server/src/__tests__/1407b-sla-market-hours-gate.test.ts   (+80 lines)
apps/mcp-server/src/domain/services/index.ts   (+1 line)
```

Total: ~116 lines across 3 files.

---

## Dependency Map

```
1833h
  ├── no upstream task dependency
  └── touches: freshnessSlaChecker.ts (domain, pure logic — no infra imports)
              1407b test file (additive only)
              domain/services/index.ts (barrel export)
```

---

## Notes

- `VN_PUBLIC_HOLIDAYS` should include at minimum 2025 and 2026 entries. Exact list source:
  Vietnam Ministry of Labour official calendar. Key dates: New Year (01-01), Tet (variable,
  ~Jan/Feb, 5 days), Hung Kings (3rd day 3rd lunar month, ~April), Liberation Day (04-30),
  Labour Day (05-01), National Day (09-02). Developer may hardcode the set for now — dynamic
  calendar fetch is out of scope for this task.
- `isVnTradingDay` is a pure domain function — zero infra imports required.
- The `SUN_MARKET_HOURS` constant at 2026-04-27T04:00 UTC overlaps with existing `MARKET_HOURS_DATE`
  (also 2026-04-27T04:00 UTC, a Monday). Verify: 2026-04-27 is a Monday, not a Sunday.
  Use 2026-04-26T04:00 UTC for Saturday, 2026-04-25T04:00 UTC for Sunday (or any confirmed Sunday).
  Developer must verify date-of-week before hardcoding test constants.
