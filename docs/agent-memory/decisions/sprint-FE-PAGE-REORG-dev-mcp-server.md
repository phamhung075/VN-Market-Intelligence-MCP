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

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-16T07:55:00Z
**task-id:** FIX-OHLCV-STRANDED-ROWS-REPAIR-P1
**what-done:** Added purgeStrandedSeedRows() to allzeroOhlcvBackfill.ts; wired as synchronous startup call in startScheduler.ts; TDD regression suite (7 tests) covering DCR/H11/DAG incident rows + generic + safety + idempotency.
**what-considered:**
- Option A: Recompute-on-read — serve real close from prior real row; stranded row stays but read path bypasses it. REJECTED: leaves corrupt data in DB; future readers without the guard re-serve poison.
- Option B: Delete-synthetic-bar (shape predicate) — purge rows with vol=0 AND O=H=L=C. Selected: no fake data stays in DB, idempotent, safe (vol>0 real candles immune), runs at startup so live DB repaired on next container restart.
**why-decision:** Option B satisfies /goal#1 (no fake data served) and /goal#2 (generic shape predicate, no date/ticker literals). Running at startup ensures the live named-volume DB is repaired immediately on the ops rebuild+deploy.
**why-change:** No change from design; FR-S1 in writeOhlcvBatch already blocks NEW synthetic bars — this repair only handles pre-fix residue.
