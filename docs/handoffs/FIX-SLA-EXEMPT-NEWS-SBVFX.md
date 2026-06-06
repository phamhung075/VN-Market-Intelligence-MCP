# Handoff: FIX-SLA-EXEMPT-NEWS-SBVFX

**Task:** FIX-SLA-EXEMPT-NEWS-SBVFX
**Type:** FIX
**Size:** S
**Zone:** apps/mcp-server/
**Status:** REVIEW

## Trigger

Signal `sau-news-sla-critical-202606062231` fired CRITICAL at 289 min vs 30-min SLA at 2026-06-06T22:31Z (UTC). This is 05:31 VN Sunday morning — overnight publisher quiet hours, not an ingest failure.

## Root Cause

Commit 9e74cf0a added calendar-aware SLA exemption for `price` and `foreign_flow` only. The `news` and `sbv_fx` sources retained flat SLAs, causing false-CRITICAL overnight and on weekends.

## Fix Design

Pattern mirrors FIX-SLA-WEEKEND-AWARE (9e74cf0a): use dynamic off-hours threshold = time-since-last-publish-window + grace (30 min).

- **news**: Active publish window = UTC 00:00–14:59 (= VN 07:00–21:59). Quiet overnight = UTC 15:00–23:59. No trading-day gate (news is 7 days/week). During quiet hours threshold = `minutesSinceLastNewsWindowEnd + 30`.
- **sbv_fx**: SBV publishes FX rates on VN business days (Mon–Fri, excl. holidays) only. On weekend/holiday threshold = `minutesSinceLastSbvWindowEnd + 30`. On business day: tight 30-min SLA.

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` — add `NEWS_QUIET_HOURS_SOURCES`, `SBV_BUSINESS_DAY_ONLY_SOURCES`, `isVnNewsPublishHours`, `isVnSbvBusinessDay`, `lastExpectedNewsWindowEnd`, `minutesSinceLastNewsWindowEnd`, `lastExpectedSbvWindowEnd`, `minutesSinceLastSbvWindowEnd`; extend `getSlaThreshold` for news + sbv_fx
  - `apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts` — import + apply new helpers; update off-hours label
  - `apps/mcp-server/src/interface/mcp/tools/system/vpsProxyTools.ts` — `NEWS_QUIET_HOURS_SERVICES`, `SBV_BUSINESS_DAY_SERVICES`; calendar-aware `isStale`; updated `formatHealth` summary
  - `apps/mcp-server/src/interface/mcp/routes/vpsProxyHealthHandler.ts` — same pattern; `computeStale` + `off_hours` field extended
- **Tests written:** `apps/mcp-server/src/__tests__/FIX-SLA-EXEMPT-NEWS-SBVFX.test.ts` — 31 assertions, GREEN
  - N-1..N-8: news quiet-hours exemption (no false-CRITICAL overnight; breach fires during publish hours)
  - S-1..S-8: sbv_fx weekend/holiday exemption (no false-CRITICAL; breach fires on business day)
- **Git commits:** `d71e3f2e fix(mcp-server): FIX-SLA-EXEMPT-NEWS-SBVFX — extend calendar SLA exemption to news + sbv_fx`
- **Type check:** pre-existing errors in unrelated files (1980-f2-canon-schema.test.ts, tasksMdJanitorJob.ts); no new errors introduced by this task
- **bun test FIX-SLA-WEEKEND-AWARE.test.ts:** 21 pass / 0 fail (baseline W-1..W-10 GREEN)
- **bun test FIX-SLA-EXEMPT-NEWS-SBVFX.test.ts:** 31 pass / 0 fail (new tests GREEN)
- **bun test (both files):** 52 pass / 0 fail
- **Tool count:** 164 (matches pre-task baseline)
- **Scheduler count:** 72 cron.schedule entries (unchanged)
- **Docs updated:** NONE (no new tools or cron jobs)
- **Graphify:** skipped (no docs impacted)

Zone health: freshnessSlaChecker.ts extended ~120L; 4 interface files updated imports+logic; bun test 52 pass 0 fail, 164 tools intact, scheduler 72 | HEALTHY

## [QA] Review Record

- **Date:** 2026-06-07
- **Verdict:** APPROVED
- **QA Agent:** qa

### AC Results

**AC-1 — Baseline W-1..W-10 green:** PASS. 21/21 FIX-SLA-WEEKEND-AWARE tests pass. No regression.

**AC-2 — New quiet-hours tests both directions:** PASS.
- (a) No false-CRITICAL overnight: N-1 at SAT 22:31Z — news age=289 min, threshold=482 (452+30), status=ok. N-1b boundary 452 ok. N-1c 500>482 breaches.
- (b) Breach fires during publish window: N-2 SAT 12:00Z — 60>30 breached. S-2 MON 06:00Z — sbv_fx 60>30 breached.
- 31/31 new tests GREEN.

**AC-3 — Logic review freshnessSlaChecker.ts:** PASS.
- News boundary: `isVnNewsPublishHours` returns true for utcHour<15, false at 15:00 exactly (N-4d confirmed). `lastExpectedNewsWindowEnd` returns same-day 14:59Z during quiet hours; previous-day during publish hours (N-5b).
- SBV: `isVnSbvBusinessDay` delegates to `isVnTradingDay` (same Mon–Fri+holiday gate as market hours — correct). `lastExpectedSbvWindowEnd` uses `isVnTradingDay(windowEnd)` guard, scans back ≤7 days.
- Threshold math: `minutesSince*WindowEnd + OFF_HOURS_GRACE_MINUTES(30)` mirrors 9e74cf0a price/foreign_flow pattern exactly — no copy-paste drift.
- Sunday/holiday: sbv_fx on Saturday returns last-Friday 10:00Z as expected (S-5).

**AC-4 — Off-hours flag consistency (DRY):** PASS.
- All 4 surfaces (freshnessSlaChecker, slaStatusTools, vpsProxyTools, vpsProxyHealthHandler) import helper functions from domain (`isVnNewsPublishHours`, `isVnSbvBusinessDay`, `minutesSinceLastNewsWindowEnd`, `minutesSinceLastSbvWindowEnd`).
- Local `NEWS_QUIET_HOURS_SERVICES`/`SBV_BUSINESS_DAY_SERVICES` sets in vpsProxyTools and vpsProxyHealthHandler use VPS service name strings ("news", "sbv") — intentionally separate from domain `NEWS_QUIET_HOURS_SOURCES`/`SBV_BUSINESS_DAY_ONLY_SOURCES` which use `SignalType` enum values. Not a divergence — correct mapping of different namespaces.
- slaStatusTools off-hours label: `prices/ff: Mon-Fri 02:00-08:59 UTC; news: 00:00-14:59 UTC; sbv_fx: VN business days` — accurate.

**AC-5 — Zone containment:** PASS.
- d71e3f2e: 5 files all in `apps/mcp-server/` (1 domain, 3 interface, 1 test).
- 80ffce66: `docs/handoffs/FIX-SLA-EXEMPT-NEWS-SBVFX.md`, `docs/data/orch/orch-state.json`.
- 6a5dde6c: `docs/agent-memory/notebooks/dev-mcp-server.md`.
- No other zones touched.

### Scans
- **bun test:** 52 pass / 0 fail
- **tsc:** 5 pre-existing errors (1980-f2-canon-schema.test.ts, tasksMdJanitorJob.ts) — NOT in task diff; no new errors
- **DDD:** PASS — domain service zero imports from infrastructure/application
- **Security:** PASS — no process.env, no hardcoded secrets
- **mock-guard:** PASS (exit 0)
