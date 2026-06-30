# Decision Journal — Sprint FRONTEND-FRESHNESS-TRANSPARENCY · architect

**Sprint goal:** Display last-update freshness indicator on every frontend data surface
**Agent:** architect
**Started:** 2026-06-27T20:00Z

---

### STEP architect-S1 · architect · 2026-06-27T20:00Z
**task-id:** ARCH-FRONTEND-FRESHNESS-TRANSPARENCY
**what-done:** Ratified all 4 ARCH-RATIFY-FFT items; produced brownfield findings + risk flags; appended to handoff; multi-zone split confirmed for PM
**what-considered:**
- FFT-3 injectable: `coverageMapPath?: string` (BA rec) vs `injectedRows?: CoverageMapRow[]` (DDD-clean)
- DDD rule: domain/ = zero I/O imports; file-reading must live in scheduler (interface layer), not domain service
**why-decision:** Override FFT-3 to injectedRows — mirrors `injectedSignalAges` pattern already in freshnessSlaMonitorJob.ts (L357); no new pattern introduced; test isolation preserved without FS access
**why-change:** DDD golden rule enforced; BA recommendation was architecturally unsound (domain service cannot read files)
