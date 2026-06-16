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
