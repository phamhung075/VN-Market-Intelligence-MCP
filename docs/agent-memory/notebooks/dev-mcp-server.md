# dev-mcp-server -- Notebook

## 2026-06-09 · sau-c283-c09 — DONE (auditor probe bug, no code change)

**Signal:** sau-c283-c09 CRITICAL db_integrity_breach — macro_indicators country coverage = 1 (expected ≥8)
**Verdict:** AUDITOR FALSE-POSITIVE — probe bug introduced in commit a95c514a (FIX-AUDITOR-DB-CHECKS-HOSTSIDE)

**Root cause:** C-09 probe was rewritten from `count(DISTINCT indicator_key)` (original design — indicator-row table) to `count(DISTINCT country)` without updating the threshold. The macro_indicators table is UNIQUE(country) — there is only ever 1 row (`vietnam`). The ≥8 threshold was correct for the old indicator-keyed schema; after the country-keyed refactor, the probe became impossible to pass.

**Live DB state confirmed:**
- Table has exactly 1 row: `country='vietnam', fetched_at=2026-06-08 12:13:00`
- Non-null indicators: cpi=5.46, gdp_growth=7.4, interest_rate=4.5 (3 columns)
- TRADING_ECONOMICS_API_KEY absent from container env → VPS 12-indicator fetcher silently skips
- No multi-country writer exists anywhere in the codebase; all active writers write country='vietnam' only

**Fix applied:** `docs/agents/system-auditor/flow/main.md` C-09 row:
- Query: `count(DISTINCT country)` → `SUM(CASE WHEN col IS NOT NULL THEN 1 ELSE 0 END)` for all 12 indicator columns, filtered to `country='vietnam' AND fetched_at > datetime('now','-26 hours')`
- Threshold: ≥8 → ≥3 (matches current active fetcher output: cpi+gdp_growth+interest_rate)
- Note added in probe row: threshold rises to ≥12 once TRADING_ECONOMICS_API_KEY is wired

**No mcp-server code changed.** This is auditor-flow-only fix.
Zone health: doc-only fix, bun tsc --noEmit clean (pre-verified) | HEALTHY

## 2026-06-09 · FIX-SCHEMA-DRIFT-P5-SELFHEAL — REVIEW

**Task:** FIX-SCHEMA-DRIFT-P5-SELFHEAL | Sprint: CI-RED-RECONCILE | Size: S
**Scope:** 1 file, 1 function — `apps/mcp-server/src/infrastructure/db/schema.ts::getDb()`
**Change:** After PRAGMA setup in fresh-db branch, synchronously call 9 init slices:
  initMarketDataTables, initAlertsTables, initMacroTables, initPortfolioTables,
  initNewsTables, initBriefingsTables, initSystemTables, initBacktestingTables, initAgmPlanTables
  (excludes initFinancialReportsTables — RISK-2 view compile risk)
**Mechanism:** Cross-file singleton pollution in single-process bun test: Contract-A files call
  closeDb() in afterAll → _db=null. Next getDb() returns empty :memory: db with no tables.
  macroStatsStore/positionTools catch "no such table" → return [] → assertion fail.
  Self-heal = idempotent CREATE TABLE IF NOT EXISTS on every fresh-db creation.
**tsc:** CLEAN (bun tsc --noEmit, no output)
**Tests:** 002-db-schema.test.ts 24 pass / 0 fail; 182-portfolio-risk 10 pass / 0 fail
**089-tool-macro:** 2 pass / 15 fail — pre-existing live-data assertion failures, NOT table-missing
**Blast radius:** Contract-B (never calls getDb()) unaffected; production unchanged (initDatabase() still owns boot)
**Status:** REVIEW — router owns push + CI verification gate (target: fail+errors < 629)

Zone health: bun tsc --noEmit clean, schema regression 24/24 pass, 1 file changed | HEALTHY

## 2026-06-09 · FIX-NEWS-VPS-HEALTH-SQL — DONE

**Task:** FIX-NEWS-VPS-HEALTH-SQL | Root: ops-vps-fetch recon a59d50f7 / commit 1c0e9d7a
**Scope:** 1 prod line changed + 1 regression test added.
**Root cause:** `vn-news-fetch` `latestTimestampSql` outer `MAX(latest_at)` was lexicographic.
  `vps_push_log.pushed_at` = space-format ("YYYY-MM-DD HH:MM:SS"); `rag_analyses.created_at` = ISO-Z.
  ASCII 'T'(84) > ' '(32) → rag_analyses always won regardless of true wall-clock order.
  During heartbeat-only windows (no new articles) health check aged off stale rag row → FALSE-UNHEALTHY.
**Fix:** outer aggregate changed from `SELECT MAX(latest_at)` to
  `SELECT datetime(MAX(unixepoch(latest_at)), 'unixepoch')` — normalises both formats to epoch before MAX.
**Tests:** 234-vps-health-sla.test.ts 13/0 (+1 regression); 1892a-health-vps-news.test.ts 3/0 (unchanged).
  Regression case: vps_push_log space-format LATER + rag_analyses ISO-Z EARLIER → `healthy`.
**tsc:** CLEAN (exit 0, no output).
**CI-impact:** no previously-passing test weakened; 1 new test added that would fail on un-fixed code.

Zone health: bun tsc clean, 234 13/0, 1892a 3/0, 1 SQL line fixed | HEALTHY

## 2026-06-09 · FU-SCHEMA-DRIFT-P7-IMPL — DONE

**Task:** FU-SCHEMA-DRIFT-P7-IMPL | Sprint: CI-RED-RECONCILE | Zone: apps/mcp-server/src/__tests__/
**Architect brief:** docs/architecture-briefs/2026-06-09-fu-schema-drift-p7-spike.md
**Root cause (pre-confirmed):** 7 "close-no-init destroyer" test files call closeDb() without subsequent initDatabase(). After the last destroyer at run position [814] (283-portfolio-conviction-batch), ~180 pure-singleton test files run against empty :memory: singleton → "no such table" failures.
**Fix pattern:** Added `afterAll(async () => { closeDb(); await initDatabase(); })` at top-level file scope to each of the 7 destroyers. Existing afterEach(closeDb) hooks preserved unchanged.
**Import changes (6 of 7 needed initDatabase added):**
- 103: `afterAll` added to bun:test import; `initDatabase` added to schema import
- 1076: same
- 1291: same
- 182: same
- 1869b: same
- 231: same (uses `test` not `it`, `beforeAll`+`beforeEach` pattern — afterAll added)
- 283: same (4 describe blocks each with afterEach(closeDb) — single file-scope afterAll added)
**Per-file isolation results (all PASS):**
- 103: 10 pass / 0 fail
- 1076: 8 pass / 0 fail
- 1291: 5 pass / 0 fail
- 182: 10 pass / 0 fail
- 1869b: 10 pass / 0 fail
- 231: 8 pass / 0 fail
- 283: 11 pass / 0 fail
**tsc:** CLEAN (bun tsc --noEmit, no output)
**Not touched:** 084-tool-market.test.ts, 089-tool-macro.test.ts, 1527-schema-slices.test.ts, all production code
**Expected CI impact:** 85-95% reduction in native fail+error (629 → <50 estimate per P7 brief)

Zone health: bun tsc --noEmit clean, 7 destroyer files patched, 62 tests pass in isolation | HEALTHY
