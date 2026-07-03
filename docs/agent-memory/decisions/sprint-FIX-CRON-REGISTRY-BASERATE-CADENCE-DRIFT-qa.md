# Decision Journal — Sprint FIX-CRON-REGISTRY-BASERATE-CADENCE-DRIFT · qa

**Sprint goal:** Sync baseRateComputation cadence text (weekly→daily) across the 2 observability mirror files to match the already-correct docs/standards/cron-jobs.md SSOT.
**Agent:** qa
**Started:** 2026-07-03T06:05:00Z

---

### STEP qa-S1 · qa · 2026-07-03T06:05:00Z
**task-id:** FIX-CRON-REGISTRY-BASERATE-CADENCE-DRIFT
**what-done:** RAW-extracted live values from docs/data/cron-registry.json + docs/data/system-map.json + docs/standards/cron-jobs.md:38 — all three now read "19:00 UTC daily (02:00 VN)" for baseRateComputation, byte-consistent. Re-ran 1190-pipeline-watchdog.test.ts fresh → 16/16 pass. git show 5120100 confirms exactly 2 files touched.
**what-considered:**
- only path: pure doc-sync, no runtime code path involved (mirrors not read by scheduler) — nothing else to verify beyond textual parity + no regression.
**why-decision:** direct 3-way textual comparison is the complete DoD for this drift-closure task; parity confirmed exactly.
**why-change:** no change from plan.
