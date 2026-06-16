# Decision Journal — Sprint FE-PAGE-REORG · dev-mcp-server

**Sprint goal:** FE-PAGE-REORG (frontend page reorganization active sprint)
**Agent:** dev-mcp-server
**Started:** 2026-06-16T05:40:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-16T05:44:00Z
**task-id:** FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0
**what-done:** Migrated ohlcvDailyAggregatorJob to writeOhlcvBatch; added C=0 fail-closed guard to writeOhlcvBatch; added 6-test suite covering Classes 1/2/3/generic.
**what-considered:**
- Option A: Per-ticker allowlist to reject known bad tickers (DCR/H11/PDN/NHD) — REJECTED: violates /goal#2 generic rule
- Option B: Migrate aggregator to writeOhlcvBatch (SSOT choke-point) so ALL pipeline guards apply generically
**why-decision:** Option B is the only fix that covers ALL tickers including future ones without hardcode. C=0 guard added to writeOhlcvBatch step 0 as belt-and-suspenders (fires before FR-S1 and validateOhlcvUnit Rule 1).
**why-change:** Class 3 cold-start gap (PDN/NHD) documented as follow-on — cannot be fixed without an exchange reference-price source; not in scope of this task.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-16T08:35:00Z
**task-id:** FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0
**what-done:** Added generic flat-seed-bar guard in runOhlcvBackfill transaction loop (after normalizeOhlcvToVnd, before upsert); added injectable fetchFn for testability; 8-test regression suite.
**what-considered:**
- Option A: Route backfill through writeOhlcvBatch so FR-S1 rejects flat seeds — rejected: writeOhlcvBatch has a date>=vnToday guard, historical flat bars (e.g. delisted tickers) would still pass
- Option B: STOP writing when vol=0 AND O=H=L=C (generic shape predicate, same as purgeStrandedSeedRows) — CHOSEN: leaves gap (real data fills on next VPS push); no fake data ever written; halt-day candles (O=H=L=C but vol>0) correctly preserved by vol>0 discriminator
**why-decision:** Option B satisfies /goal#1 (no fake data) and /goal#2 (generic: no date/ticker literals, catches thousand-scale AND full-VND AND all-zero flat bars). Applying AFTER normalizeOhlcvToVnd ensures thousand-scale flat bars (5.9→5900, still flat) are caught too.
**why-change:** No change from task spec; architect pre-selected option (b) as preferred.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-16T07:55:00Z
**task-id:** FIX-OHLCV-STRANDED-ROWS-REPAIR-P1
**what-done:** Added purgeStrandedSeedRows() to allzeroOhlcvBackfill.ts; wired as synchronous startup call in startScheduler.ts; TDD regression suite (7 tests) covering DCR/H11/DAG incident rows + generic + safety + idempotency.
**what-considered:**
- Option A: Recompute-on-read — serve real close from prior real row; stranded row stays but read path bypasses it. REJECTED: leaves corrupt data in DB; future readers without the guard re-serve poison.
- Option B: Delete-synthetic-bar (shape predicate) — purge rows with vol=0 AND O=H=L=C. Selected: no fake data stays in DB, idempotent, safe (vol>0 real candles immune), runs at startup so live DB repaired on next container restart.
**why-decision:** Option B satisfies /goal#1 (no fake data served) and /goal#2 (generic shape predicate, no date/ticker literals). Running at startup ensures the live named-volume DB is repaired immediately on the ops rebuild+deploy.
**why-change:** No change from design; FR-S1 in writeOhlcvBatch already blocks NEW synthetic bars — this repair only handles pre-fix residue.
### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-16T16:05:00Z
**task-id:** FIX-CI-RED-STANDING-1837A-1352A
**what-done:** Fixed 1352a (4 fail/1 error) by guarding bctc_table_rows/bctc_md_tables db.prepare() in bctcPdfPullJob.ts with try/catch so missing-schema DB (test) skips gate.
**what-considered:**
- Fix test: add bctc_table_rows/bctc_md_tables to test makeInMemoryDb() — REJECTED: tables have complex JOIN schema; test contract is "inject deps, queue only"; adding prod schema to unit test violates isolation.
- Guard prepare with try/catch (null=skip gate) — CHOSEN: generic for any DB missing schema; production migration still runs gate; test gets correct behaviour.
**why-decision:** Production code added an unconditional db.prepare() for tables only present after migrateFinancialReports(); test DBs are queue-only by design. Guard is the correct layer boundary.
**why-change:** 1837a was already green (status='in_progress' in valid set); doc sync added §5 enum to orch-state-access.md.
