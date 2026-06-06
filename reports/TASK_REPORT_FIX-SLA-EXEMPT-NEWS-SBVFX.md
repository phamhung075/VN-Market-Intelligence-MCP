## Task Report FIX-SLA-EXEMPT-NEWS-SBVFX
date: 2026-06-07
outcome: APPROVED

changed: [
  apps/mcp-server/src/domain/services/freshnessSlaChecker.ts (+~120L: NEWS_QUIET_HOURS_SOURCES, SBV_BUSINESS_DAY_ONLY_SOURCES, isVnNewsPublishHours, isVnSbvBusinessDay, lastExpectedNewsWindowEnd, minutesSinceLastNewsWindowEnd, lastExpectedSbvWindowEnd, minutesSinceLastSbvWindowEnd, getSlaThreshold extended),
  apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts (import + apply new helpers + off-hours label),
  apps/mcp-server/src/interface/mcp/tools/system/vpsProxyTools.ts (NEWS_QUIET_HOURS_SERVICES, SBV_BUSINESS_DAY_SERVICES, calendar-aware isStale, formatHealth summary),
  apps/mcp-server/src/interface/mcp/routes/vpsProxyHealthHandler.ts (NEWS_QUIET_HOURS_SERVICES, SBV_BUSINESS_DAY_SERVICES, computeStale + off_hours field extended),
  apps/mcp-server/src/__tests__/FIX-SLA-EXEMPT-NEWS-SBVFX.test.ts (31 new tests N-1..N-8, S-1..S-8)
]

tests: 52 pass / 0 fail (31 new FIX-SLA-EXEMPT-NEWS-SBVFX + 21 baseline FIX-SLA-WEEKEND-AWARE) | tsc: 5 pre-existing errors (unrelated files, not in diff) | ddd: PASS | security: PASS | mock-guard: PASS
verdict: APPROVED
