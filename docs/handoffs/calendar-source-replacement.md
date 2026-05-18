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
