# Handoff — calendar-source-replacement

**Task ID:** calendar-source-replacement
**Type:** OBSERVE / EVALUATE
**Priority:** LOW
**Zone:** apps/macro-indicators/
**Owner:** dev-macro-indicators
**Created:** 2026-05-18 (c175)

---

## Context

The `investing.com/economic-calendar` endpoint is permanently unreachable:
- FlareSolverr bypass attempted 2026-05-13 — smoke test passed initially
- Subsequent calls always time out (30s → 10s → 5s cap applied in c167)
- The `macroRefresh` cycle blocks/fails silently on this source every run

Current implementation:
- `apps/macro-indicators/src/infrastructure/scrapers/investing-economic-calendar.ts`
- `apps/macro-indicators/src/infrastructure/scrapers/investing_calendar_fetch.py`
- Timeout: 5s (hard cap)
- Returns `[]` on timeout — non-blocking but wastes 5s each cycle

## Task

Evaluate alternatives. Decision required: either:

**Option A — Replacement source:**
- Identify an accessible economic calendar API/endpoint for Vietnam macro events
- Options to evaluate: Trading Economics public API, World Bank event calendar, IMF calendar, Alpha Vantage economic events, stooq.com, or any free alternative
- AC: source must return Vietnam GDP/CPI/interest_rate events without auth OR with a free key

**Option B — Wontfix:**
- If no viable replacement exists, remove the source from the `macroRefresh` cycle entirely
- Mark task wontfix in TASKS.md
- AC: macroRefresh cycle no longer wastes 5s on a dead endpoint

## Decision criteria

- Source reachability from Docker container (no Cloudflare JS challenge)
- Vietnam coverage (GDP, CPI, interest rate release dates)
- Free tier acceptable

## Acceptance Criteria

1. Either a replacement adapter is implemented and tested, OR
2. The dead adapter is removed from the macro refresh cycle and documented as wontfix

## Files to touch

- `apps/macro-indicators/src/infrastructure/scrapers/investing-economic-calendar.ts`
- `apps/macro-indicators/src/infrastructure/scrapers/investing_calendar_fetch.py`
- `apps/macro-indicators/src/application/usecases/macroIndicatorRefreshJob.ts` (if removing)
- `apps/macro-indicators/__tests__/unit/scrapers/investing-economic-calendar.test.ts`

---

## [PM] Section

Task moved to In Progress 2026-05-18 c175. Dispatched to dev-macro-indicators.
Branch: `task/calendar-source-replacement` (already exists on remote — merge status confirmed).

---

## [Developer] Implementation Record

- **Service:** macro-indicators
- **Zone:** apps/macro-indicators/
- **Decision:** Option B — Wontfix. No viable free replacement source for Vietnam economic calendar events exists without authentication. investing.com permanently blocked by Cloudflare Turnstile v2. Trading Economics already integrated as separate adapter.
- **Files modified:**
  - `apps/macro-indicators/src/infrastructure/scrapers/investing-economic-calendar.ts` — Added `NullCalendarAdapter` (implements `InvestingCalendarPort`, returns `[]` immediately). Deprecated `InvestingCalendarAdapter` (dead code, retained as historical reference). Python helper `investing_calendar_fetch.py` retained as reference, not executed.
  - `apps/macro-indicators/src/application/fetch-external-macro.ts` — `DEFAULT_TIMEOUTS.calendar: 5_000 → 0`. Updated JSDoc with wontfix note.
  - `apps/macro-indicators/src/index.ts` — Wire `NullCalendarAdapter` instead of `InvestingCalendarAdapter`. `idleTimeout: 120 → 90` (calendar no longer adds to max budget).
  - `apps/macro-indicators/__tests__/unit/scrapers/investing-economic-calendar.test.ts` — Replaced FetchExternalMacroUseCase tests with 4 NullCalendarAdapter tests.
  - `apps/macro-indicators/__tests__/unit/fetch-external-macro.test.ts` — Updated calendar timeout describe: `DEFAULT_TIMEOUTS.calendar === 0`, null-adapter returns ok+[] immediately, isolation test.
  - `docs/architecture/microservice/macro-indicators/infrastructure.md` — Updated InvestingCalendarAdapter section to NullCalendarAdapter wontfix section.
  - `docs/architecture/microservice/macro-indicators/testing.md` — Updated counts, calendar test table, added NullCalendarAdapter test table.
  - `docs/TASKS.md` — calendar-source-replacement → WONTFIX.
- **Tests written:** 4 new in `investing-economic-calendar.test.ts` — all GREEN
- **Type check:** pre-existing TS errors in unrelated test files (adb-kidb, fred-macro, imf-weo, world-bank-macro) — not introduced by this change; my files type-clean
- **Service tests:** 103 pass / 12 skip / 1 pre-existing fail (world-bank mock, unrelated) — no regressions
- **Docs updated:** infrastructure.md (InvestingCalendarAdapter → NullCalendarAdapter wontfix section), testing.md (counts + test tables updated)
