# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · dev-frontend

**Sprint goal:** One unified /dashboard/momentum surface carrying BOTH money-flow radar and momentum indicators — without homogenizing the two card contracts.
**Agent:** dev-frontend
**Started:** 2026-07-02T05:50:56Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-07-02T05:50:56Z
**task-id:** BA-MERGE-MONEY-RADAR-INTO-MOMENTUM (WU-1-MERGE-PAGES + WU-2-COVERAGE-MAP)
**what-done:** Merged dashboard.money-radar.tsx's DTO/parser/formatter/fetcher family + 4 GaugeCards verbatim into dashboard.momentum.tsx as Section B ("Radar Dòng Tiền"), colocated per PM-RATIFY-1 (no app/lib/moneyRadar/ module). New combined loader() uses Promise.allSettled on fetchMomentumIndicators + fetchMoneyRadarComposite (per-feed isolation). dashboard.money-radar.tsx collapsed to a loader-only 302 redirect (no default export — Remix never renders it, loader always redirects before render). Relabeled ANALYST_NAV[26] "Động Lực P1" → "Động Lực & Dòng Tiền" (TopNav.tsx label + route-doc-comment). Backfilled 4 rows in frontend-data-coverage-map.json for /dashboard/momentum (score, components.foreign_accum_z_market, components.rel_vol_z_20, divergence.flag), status=LIVE (radar renders non-null, unlike momentum's DEPTH_THIN siblings); summary.rows 45→49, LIVE 35→39.
**what-considered:**
- Colocate radar logic in dashboard.momentum.tsx (BA/PM-RATIFY-1) vs extract to app/lib/moneyRadar/ — chose colocate, ratified, no change.
- Page-level FreshnessBadge: pick older(momentum.generated_at, radar.generated_at) via olderGeneratedAt() helper — avoids silently hiding either feed's staleness (FR-3 recommendation).
- Added visible `<h2>` section headings above each grid (codebase precedent: dashboard.global-markets.tsx/sector-cascade.tsx) in addition to the spec'd aria-label — makes "labelled sections" (AC1) legible to sighted users, not just screen readers; low-risk addition, no non-goal violated.
**why-decision:** BA spec (FR-1/FR-2/FR-3/FR-4) is prescriptive and complete; followed literally. h2 headings are the only unscripted addition, justified by AC1's "labelled sections" wording and existing codebase pattern.
**why-change:** BA's grep for "Động Lực P1" occurrences (§2 file inventory) missed 2 additional hardcoded assertions outside the 2 files it named: `ind-p1-indicator-gauges-nav.test.tsx:91` and `task17-page19-news-buzz-nav.test.tsx:87` (both `expect(last!.label).toBe("Động Lực P1")`, regression guards from earlier TASK-502/IND-P1 sprints referencing ANALYST_NAV's last entry). Updated both in the SAME commit — required to satisfy AC7 ("full frontend test suite GREEN") and AC8's zero-red-test-window intent, even though these 2 files weren't in BA's/PM's explicit file list. FE-HEADER-SSOT-top-nav.test.tsx confirmed truly unaffected (comment-only mention at L31, no assertion) — left untouched per BA's explicit scope call.
