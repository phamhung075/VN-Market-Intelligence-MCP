# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · ba

**Sprint goal:** One unified /dashboard/momentum surface carrying BOTH money-flow radar and momentum indicators — without homogenizing the two card contracts.
**Agent:** ba
**Started:** 2026-07-02T05:20:57Z

---

### STEP ba-S1 · ba · 2026-07-02T05:26:25Z
**task-id:** BA-MERGE-MONEY-RADAR-INTO-MOMENTUM
**what-done:** Wrote spec `docs/handoffs/BA-MERGE-MONEY-RADAR-INTO-MOMENTUM.md` (11 sections, 10 ACs). Surveyed both live route files (momentum 481L, money-radar 561L), both proxy routes, TopNav.tsx, 3 test files, frontend-data-coverage-map.json — all by direct Read, no guessing.
**what-considered:**
- FR-2 file placement for the ported money-radar DTO/parser/formatter family: colocate inside `dashboard.momentum.tsx` (mirrors existing precedent — momentum already imports `formatZScore` from sibling route `dashboard.indicator-gauges.tsx`) vs extract to new `app/lib/moneyRadar/` module — CHOSE colocate as the recommendation, flagged as non-blocking PM-RATIFY-1 (no architect step in this SPRINT-S chain).
- Do-not-homogenize scope: found both pages ALREADY share the generic `GaugeCard` UI component verbatim — clarified in spec §5 that the constraint is about the DOMAIN DTO/parser layer (FR-2.1: two distinct type families, no merged DTO), NOT the presentational shell, to prevent pm/dev-frontend misreading "distinct contracts" as "must not share GaugeCard."
- Nav count-bump risk: `FIX-FE-HEADER-NAV-MONEY-RADAR`'s superseded scope implied 27→28; this task does NOT bump the count (relabel only, no new entry) — flagged explicitly in AC5 + §2 table to prevent pm accidentally re-adding the old ARC bump.
**why-decision:** Codebase precedent (route-file colocation, cross-route imports already established) is the lowest-risk, smallest-diff path; PM-RATIFY flag preserves pm's authority to override without a PO round-trip since it's a pure implementation-boundary choice, not a product decision.
**why-change:** No divergence from PO's locked `product_decisions`/`design_constraints` (§3 of spec transposes them verbatim). Two BA-added findings beyond PO's 7 ACs: (a) `frontend-data-coverage-map.json` has ZERO money-radar rows — pre-existing gap opened after the 06-27 freshness-transparency reconciliation, folded in as AC9 rather than left silently orphaned; (b) `ind-p1-momentum-nav.test.tsx` hardcodes the label text 6× and will break on relabel — folded in as AC8 (same-commit requirement) to prevent a red-test window, since main-only (no branches) makes staged breakage costly.
