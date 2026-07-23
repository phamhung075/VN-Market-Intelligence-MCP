# Decision Journal — Sprint DS-DEGRADE-01-FIX · dev-mcp-server

**Sprint goal:** Audit-then-fix whether get_public_contracts flags empty-upstream-while-stale as degraded, or masks the outage.
**Agent:** dev-mcp-server
**Started:** 2026-07-23T19:54:41Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T19:56:00Z
**task-id:** DS-DEGRADE-01-FIX
**what-done:** Traced muasamcong pipeline at source; ran a live probe against the REAL initDatabase()/getDb() path (not test-local :memory: fixtures) and confirmed `public_contracts` table does not exist in production schema.
**what-considered:**
- Assume prior fix (commit 815ccaedd, 2026-06-10) already covers this — reject: its own test suite uses a hand-rolled isolated `:memory:` DB that masks the missing table; never proven against real init path.
- Trust `quality-checklist.json` PASS badge for DS-DEGRADE-01 — reject per NO-FABRICATION GUARD; verify runtime behavior at source instead.
**why-decision:** Probe script (seed+select through real initDatabase()) threw "no such table: public_contracts" for both INSERT and SELECT — objective proof the stale-detection code is dead in production.
**why-change:** Confirms genuine gap distinct from what the task literally asked ("serve empty as fresh") — actual defect is "designed stale/degraded signal can never fire", same failure class (silent non-observability).

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-23T19:58:00Z
**task-id:** DS-DEGRADE-01-FIX
**what-done:** Registered `public_contracts` CREATE TABLE (+ 2 indexes) inside `initMacroTables()` in schema-macro.ts, wired into `initDatabase()`. No change to publicContractsStore.ts or publicInvestmentTools.ts — their existing DS-DEGRADE-01 logic is now reachable.
**what-considered:**
- Add ad-hoc `CREATE TABLE IF NOT EXISTS` inline inside publicContractsStore.ts/publicInvestmentTools.ts (self-healing, no schema-file touch) — rejected: violates codebase convention (all persistent tables created via schema-*.ts initXTables at startup).
- Add to schema-market-data.ts vs schema-macro.ts — chose schema-macro.ts (external macro/sector-sourced data, matches commodity_prices/bond_maturity pattern).
**why-decision:** Minimal, targeted, convention-matching fix that reactivates already-written degradation logic rather than duplicating it.
**why-change:** none — matches FIX SHAPE guidance ("existing degradation-signal pathway if one exists").

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-23T19:59:00Z
**task-id:** DS-DEGRADE-01-FIX
**what-done:** Added `DS-DEGRADE-01-FIX-muasamcong-table-missing.test.ts` (5 tests, through real initDatabase()/getDb() path): table-exists guard, empty+no-row→unavailable, empty+stale-row(>168h)→stale:true, non-empty→normal listing unaffected, store-write succeeds.
**what-considered:**
- Extend existing vacuous CHIJ FIX-5 test ("stale OR unavailable" always-true assertion) — rejected: doesn't prove the specific branch fires; new file with a strict `stale===true` assertion is a real regression guard.
**why-decision:** Reproduces the exact scenario stated in task (empty-upstream + stale-stored) with a real seeded row, asserting the precise `stale:true` shape — not a shape-only literal check.
**why-change:** none.
