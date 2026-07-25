# Decision Journal — Sprint FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE · dev-mcp-server

**Sprint goal:** Fix `get_macro_calendar` serving the permanent FDA-4 honest-unavailable stub instead of the already-built static 2026 macro schedule.
**Agent:** dev-mcp-server
**Started:** 2026-07-25T04:27:04Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-25T04:27:04Z
**task-id:** FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE
**what-done:** Verified root cause at source: `carryTools.ts` `get_macro_calendar` HTTP-GETs the Go `/macro-calendar` endpoint, a permanent FDA-4 stub (`handlers_calendar.go`, always `{events:[],status:"unavailable",source_tier:4}`); confirmed `domain/services/macro/macroCalendar.ts#getMacroCalendar()` already exists, pure, unwired, with the full 2026 FOMC/GSO/PMI/SBV schedule.
**what-considered:**
- (a) repoint the MCP tool at the local domain service, drop the HTTP hop entirely — wholly in-zone.
- (b) wire a real live source into the Go `/macro-calendar` handler — cross-zone (apps/macro-indicators), out of zone.
**why-decision:** (a) — data already lives in-repo as a pure function, no upstream fetch needed; keeps the fix entirely inside apps/mcp-server/ per zone restriction. Task explicitly preferred (a).
**why-change:** no change from plan.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-25T04:30:00Z
**task-id:** FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE
**what-done:** RED-confirmed `FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE.test.ts` (7 tests) against unmodified pre-fix code — all 7 failed (fetch called, source_tier=4, status="unavailable", events=[], pivotWindowWarning missing). Applied the repoint in `carryTools.ts`: imports `getMacroCalendar`, drops `withDeadline`/fetch/try-catch, builds `{source_tier:3, is_estimate:true, status:"ok", daysRequested, events, currentMonthIsPivotWindow, nextPivotWindow, pivotWindowWarning}`.
**what-considered:**
- is_estimate:true (honest static-schedule label, precedent: bopTools/tradeBalanceTools PERMANENT is_estimate=true markers) vs is_estimate:false (would overclaim live-confirmed freshness).
- keep HTTP try/catch defensively vs remove (domain call is a pure sync in-process read, no I/O failure mode).
**why-decision:** is_estimate:true matches source_tier:3 "derived" semantics and existing codebase precedent for static/heuristic-derived tiers; removed dead try/catch since there is no longer any failure surface to catch.
**why-change:** no change from plan.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-25T04:33:00Z
**task-id:** FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE
**what-done:** GREEN — new suite 7/7 pass (31 expect calls). Affected/precedent suites (1423c, 1423e-macro-calendar, 1881a-source-tier) + new suite: 70/70 pass, 0 fail. `bunx tsc --noEmit` exit 0. `gen-project-stats.ts --dry-run`: toolCount 184 unchanged (repoint, not a new tool registration).
**what-considered:** n/a — verification step.
**why-decision:** n/a
**why-change:** no change from plan. rebuild_required=true — MCP-server code change, LIVE gateway RAW-verify is QA's post-rebuild gate, not claimed here.
