# Decision Journal — Sprint MARKET-INDICATOR-DEPTH-P0 · dev-frontend

**Sprint goal:** P1 momentum indicators frontend surface (TASK-502-MOMENTUM-FRONTEND)
**Agent:** dev-frontend
**Started:** 2026-06-30T08:00:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-30T08:05:00Z
**task-id:** TASK-502-MOMENTUM-FRONTEND AC-M1
**what-done:** Extracted GaugeCard from dashboard.indicator-gauges.tsx to shared ~/components/GaugeCard.tsx with optional expandContent prop.
**what-considered:**
- Option A: duplicate GaugeCard inline in momentum page
- Option B (chosen): extract to shared component per ARCH-RATIFY M1 decision
**why-decision:** M1 arch-ratify mandated shared component; avoids 2x divergent copies; expandContent prop enables P1 InfoCardExpand without breaking P0 callers.
**why-change:** no change from plan

### STEP dev-frontend-S2 · dev-frontend · 2026-06-30T08:15:00Z
**task-id:** TASK-502-MOMENTUM-FRONTEND AC-1/AC-2/AC-M2/AC-M4
**what-done:** Created proxy route api.momentum-indicators.tsx, dashboard.momentum.tsx with 4 GaugeCards, formatRSComposite, and InfoCardExpand source-link dropdowns.
**what-considered:**
- only path: mirror P0 proxy+dashboard pattern exactly; build against mocked DTO (TASK-501 not deployed)
**why-decision:** proxyUpstream pattern proven; honest-NULL required by NFR-2; safeFetch handles 502/network gracefully.
**why-change:** no change from plan

### STEP dev-frontend-S3 · dev-frontend · 2026-06-30T08:20:00Z
**task-id:** TASK-502-MOMENTUM-FRONTEND AC-3/AC-4/AC-5/AC-6
**what-done:** Added TopNav "Động Lực P1" entry; 4 GAP coverage-map rows; 49 vitest assertions GREEN; updated 3 existing nav count tests to 27/34.
**what-considered:**
- only path: update pre-existing nav count tests when ANALYST_NAV grows (UPDATE RULE in FE-HEADER-SSOT)
**why-decision:** nav count assertions must track true state; previous tests pinned 26 (now 27); required by test SSOT rule.
**why-change:** no change from plan; QUE test failures are pre-existing (unrelated to TASK-502)
