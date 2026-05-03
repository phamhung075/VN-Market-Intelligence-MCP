# Task Report — 1833h: SLA Market Hours — Weekend & Holiday Gate

**Date:** 2026-05-02
**Branch:** task/1833h-sla-market-hours-trading-day
**Commit:** aef6ff8d
**Status:** COMPLETE — 14 tests pass, 0 fail

---

## Problem

`freshnessSlaChecker.ts` / `freshnessSlaMonitorJob.ts` suppressed SLA escalations outside
UTC 02:00-08:59 (VN off-hours), but had no awareness of weekends or VN public holidays.
On Labour Day 2026-05-01 (a Friday), `isVnMarketHours()` would return `true` at 11:00 VN
time and fire false SLA alerts for `price` and `foreign_flow` — both market-closed signals.

---

## Solution

### `freshnessSlaChecker.ts`

1. Added `VN_PUBLIC_HOLIDAYS: ReadonlySet<string>` — Gregorian YYYY-MM-DD dates in VN TZ
   covering all 2026 public holidays (New Year, Tet, Hung Kings, Liberation Day, Labour Day,
   National Day).

2. Added `toVnDateString(now: Date): string` — private helper, converts UTC Date to
   `YYYY-MM-DD` string in VN timezone (UTC+7) for set lookup.

3. Added `export function isVnTradingDay(now: Date): boolean` — returns `false` for
   Sat/Sun (UNT getUTCDay 0 or 6) or any date in `VN_PUBLIC_HOLIDAYS`.

4. Modified `isVnMarketHours(now)` — added `if (!isVnTradingDay(now)) return false;` as
   the first line. All existing callers in `freshnessSlaMonitorJob.ts` automatically pick
   up the new gate with zero changes.

### `domain/services/index.ts`

Added `isVnTradingDay` to the explicit named exports of `freshnessSlaChecker.js` to allow
consumers to call it directly.

---

## Tests Added (MH-9 through MH-14)

| ID | Scenario | Expected |
|----|----------|----------|
| MH-9 | Saturday 2026-04-25 04:00 UTC + price breach | Escalation NOT called |
| MH-10 | Saturday 2026-04-25 04:00 UTC + foreign_flow breach | Escalation NOT called |
| MH-11 | Saturday 2026-04-25 04:00 UTC + bctc breach | Escalation IS called (24/7) |
| MH-12 | Labour Day 2026-05-01 04:00 UTC + price breach | Escalation NOT called |
| MH-13 | Labour Day 2026-05-01 04:00 UTC + foreign_flow breach | Escalation NOT called |
| MH-14 | First trading day 2026-05-04 04:00 UTC + price breach | Escalation IS called |

All 14 tests (MH-1..MH-14) pass.

---

## Files Changed

- `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` — added `VN_PUBLIC_HOLIDAYS`, `toVnDateString`, `isVnTradingDay`; patched `isVnMarketHours`
- `apps/mcp-server/src/domain/services/index.ts` — export `isVnTradingDay`
- `apps/mcp-server/src/__tests__/1407b-sla-market-hours-gate.test.ts` — added MH-9..MH-14

---

## Maintenance Note

`VN_PUBLIC_HOLIDAYS` must be updated annually per official government decree.
The set is intentionally inline in the domain service (no external config dependency)
to keep the domain layer pure. Update before each new calendar year.

---

## Handoff → QA

QA should verify:
- All 14 MH-x tests pass on a clean checkout of branch `task/1833h-sla-market-hours-trading-day`
- Full suite (`bun test`) passes at 8758+ tests, 0 fail
- No new exports break existing consumers of `domain/services/index.ts`
