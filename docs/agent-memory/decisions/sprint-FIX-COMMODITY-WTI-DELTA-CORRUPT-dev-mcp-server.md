# Decision Journal — Sprint FIX-COMMODITY-WTI-DELTA-CORRUPT · dev-mcp-server

**Sprint goal:** Fix commodityTracker data corruption (I10 stuck WTI, I8 null macro deltas, I4 BDI staleness triage)
**Agent:** dev-mcp-server
**Started:** 2026-07-23T21:39:44Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T21:39:44Z
**task-id:** FIX-COMMODITY-WTI-DELTA-CORRUPT
**what-done:** Live-probed named-volume market.db: wti_crude_usd frozen at 95.5 since 2026-04-12 (102d+, 79 identical rows, source=news-regex only, no live fetcher exists). Root cause: two consumers (kinhDichTools.computeMacroScore Hao 6, assembleBriefing step 9 -> morning briefing) read tracked_indicators with NO staleness gate, unlike marketContextBuilder.buildMacroSection which already got the DSI-MACRO-PHANTOM-STALE-GUARD 4h fix for this exact I10 report. Fixed both missed consumers by reusing the existing TRACKED_INDICATOR_STALE_MS guard + listTrackedIndicatorsFromDb (no new threshold invented).
**what-considered:**
- Add a live WTI fetcher (Yahoo CL=F) — rejected as oversized for a P2 targeted fix; the reported corruption is "serving a frozen value as fresh", not "no live source exists" (that's a separate, larger scope change)
- Silently drop stale WTI from the briefing entirely — rejected; task explicitly said "flagged stale/degraded", so appended "[STALE]" marker (reuses buildWatchlistSection's existing convention) instead of hiding it
- Reuse vs reinvent staleness threshold — reused TRACKED_INDICATOR_STALE_MS (4h) already exported from commodityTracker.ts rather than a new constant
**why-decision:** Minimal targeted fix per task constraints; DSI-MACRO-PHANTOM-STALE-GUARD.test.ts's own header comment already promised "assembleBriefing step 9" wiring that was never actually implemented — completing that promise closes the exact gap the live evidence shows (95.5 stuck 102 days) without inventing new mechanism.
**why-change:** I8 (null macro deltas) turned out to be ALREADY FIXED live (commit e55805aa3, apps/macro-indicators Go service, deployed 2026-07-15) — direct HTTP probe of get_macro_snapshot showed real oilUsdDelta=3.55/goldUsdDelta=-75.1; usdVndDelta=null is the documented Q2 SBV-override honesty suppression, not a bug. NO_CHANGE_NEEDED, zero Go-zone edits made (out of my zone anyway). I4 (BDI) confirmed out of scope — live BDI last update 2026-04-07 (107d stale, ^BDI Yahoo still 404), already tracked as its own backlog row FIX-BDI-SHIPPING-STALE-404-GUARD; flagged not fixed, per task instruction.
