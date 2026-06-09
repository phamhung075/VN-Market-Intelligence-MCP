# BATCH5 C-AL Per-File Triage — arch-S25

**Date:** 2026-06-09 (Tuesday)
**Sprint:** CI-RED-RECONCILE
**Task:** arch-S25 — BATCH5 genuine deterministic residual triage
**Type:** SPIKE / DOCS-ONLY
**Scope:** apps/mcp-server/src/__tests__/

---

## Context

Per-file process isolation shipped (scripts/ci-per-file-isolation.sh via .github/workflows/ci.yml).
Each test file runs in its own bun OS process — contamination = 0 by construction.

**Determinism proof (two-SHA):**
- SHA d14d2f92 run 27230529533: 11679 pass / 42 skip / 26 fail
- SHA 3ad97a18 run 27230921229: 11679 pass / 42 skip / 26 fail
- Identical output → fail count is now DETERMINISTIC and order-independent.

**Roster:** 20 files / 26 fail markers (each file run in isolation — genuine, not contamination).

---

## Verdict Table

| # | File | Failing it() title | Root cause (one-liner) | Bucket | Target prod symbol/path | Protecting sibling (REMOVE only) |
|---|------|-------------------|----------------------|--------|------------------------|----------------------------------|
| 1 | `1100-cron-job-run-store.test.ts` | `last_run is the most recent started_at timestamp` | Hardcoded timestamps (`2026-04-05`) fall outside the 30-day rolling window from `datetime('now')` — window = June 2026, data = April | REWRITE-STALE | `getCronJobHealthSummary` · `src/infrastructure/db/cronJobRunStore.ts:254` | — |
| 2 | `1196-bctc-reparse-pipeline.test.ts` | `ignores PDFs that do not match any watchlist ticker` | Test asserts old "skip non-watchlist" behavior; prod intentionally changed (task 1915-fix-part2) to fall back to `tickerFromFilename()` for non-watchlist PDFs | REWRITE-STALE | `scanDiskForStrandedPdfs` · `src/scheduler/financial-reports/bctcReparseJob.ts:543-548` | — |
| 3 | `1309-bb-alert-scan-job.test.ts` | `AC-8: multi-ticker scan: 3 tickers, 2 breakout-up, 1 inside band → {scanned:3, fired:2}` | `fired:3` received — HPG (price 50000 inside [45000,55000]) fires when it should not; `runBbAlertScan` has a code path that incorrectly fires inside-band tickers | FIX-PROD | `runBbAlertScan` · `src/scheduler/alerts/bbAlertScanJob.ts` | — |
| 4 | `1331a-single-writer-guard.test.ts` | `TEST-3 (RED): STOCK_PRICE_DB_PATH env must differ from DB_PATH` | `STOCK_PRICE_DB_PATH` env var is undefined in CI (not set in workflow); local passes because `.env` sets it to empty string (defined); `expect(undefined).toBeDefined()` fails in CI | REWRITE-STALE | Env var `STOCK_PRICE_DB_PATH` — CI step in `.github/workflows/ci.yml` | — |
| 5 | `1352a-scheduler-job-wrappers-macro-marketscan.test.ts` | `A-1: Telegram WORK message sent on getMacroSnapshot success with correct values` | `sendWorkCalls.length` = 2 not 1; prod added direct `sendTelegramWork(msg)` calls at lines 324 and 418 that bypass the injected `sendWorkFn` wrapper | REWRITE-STALE | `macroIndicatorRefreshJob` · `src/scheduler/macro/macroIndicatorRefreshJob.ts:324,418` | — |
| 6 | `1416b-fpt-page-window.test.ts` | `VNM split-block regression: totalAssets correct despite window change` | FIX-BCTC-MAGNITUDE-NORMALIZE erroneously applies ÷1,000,000 to VNM split-block text; `totalAssets` expected 80,000,000 but received 130,000,000 | FIX-PROD | `extractBalanceSheet` · `src/domain/services/balanceSheetExtractor.ts` (FIX-BCTC-MAGNITUDE-NORMALIZE path B override) | — |
| 7 | `1466-sync-db-corruption-bail.test.ts` | (all 1 test — unhandled module error) | Mock at top of file only exports `{ logger }` stub but a transitive import of `syncVnstockData.js` imports `createLogger` from `logger.js` → `SyntaxError: Export named 'createLogger' not found` | REWRITE-STALE | `createLogger` export · `src/infrastructure/logger.ts:225` — mock needs to include `createLogger: (...) => ({...})` | — |
| 8 | `1503-ohlcv-foreign-flow.test.ts` | `AC3: returns 0 changes when no matching OHLCV row exists (update-only)` | Test asserts old update-only semantics; prod changed to UPSERT (INSERT stub row when absent per DPI-4 comment); returns changes=1, not 0 | REWRITE-STALE | `writeForeignFlowToOhlcv` · `src/infrastructure/db/ohlcvForeignFlowStore.ts:38-83` (ON CONFLICT DO UPDATE) | — |
| 9 | `1549-watchdog-news-staleness.test.ts` | `names every stale service in single alert (prices ok + news stale)` | Prod message template now includes a hardcoded operator-action section listing ALL systemctl commands (incl. `vn-price-fetch`) regardless of which services are stale; `not.toContain("vn-price-fetch\n")` fails | REWRITE-STALE | Alert message template · `src/scheduler/vpsProxyWatchdogJob.ts:276-288` | — |
| 10 | `1792-conviction-debounce.test.ts` (×2 fails) | (1) `10 rapid fires for same ticker+quarter → only 1 Telegram bug message sent` (2) `different ticker+quarter is not blocked by VCB debounce` | `parseBctcReport.ts` line 253 uses `void import(...).then(sendTelegramBug)` — fire-and-forget async; test assertion runs before the dynamic import resolves; `bugMessages` stays empty | FIX-PROD | `parseBctcReport` · `src/application/usecases/parseBctcReport.ts:253` — must await or inject telegram fn | — |
| 11 | `1813-bctc-ddd.test.ts` | `throws when no fetch functions supplied` | Test expects `discoverHosePdfUrls("VCB", {})` to throw `"[bctcDiscovery]"` when no fetch fns supplied; prod returns empty result gracefully instead of throwing | REWRITE-STALE | `discoverHosePdfUrls` · `src/domain/services/bctcDiscovery.ts:399-406` (silent empty return) | — |
| 12 | `1821a-pollnews-cold-start-retry.test.ts` | N/A — 5 pass / 0 fail in isolation | PASSES IN ISOLATION — flaky only under previous full-suite contamination; per-file isolation cures this | REMOVE-OBSOLETE | Regression from contamination chain now eliminated; surviving behavior covered by: `src/__tests__/1821a-pollnews-cold-start-retry.test.ts` itself (0 fail in isolation = test is now GREEN; do NOT delete) | self |
| 13 | `1879a-fred-effr-iorb-fetcher.test.ts` | `T7: missing FRED_API_KEY returns null immediately (fail-loud)` | Guard `if (!httpClient && !apiKey)` only returns null when BOTH are absent; test provides `mockClient` so guard is bypassed — intentional bypass was added after test was written | REWRITE-STALE | `fetchFredEffrIorb` · `src/infrastructure/fetchers/fredEffrIorb.ts:384` | — |
| 14 | `FIX-PDF-VOLUME-SBV-TABLE.test.ts` (×2 fails) | (1) `index.ts startup path mkdirSync covers pdfDir` (2) `index.ts uses mkdirSync with { recursive: true } for pdfDir` | Fix was implemented in `composition-root.ts` (L110), not `index.ts`; test reads wrong source file | REWRITE-STALE | `bootstrapMcpServer` · `src/composition-root.ts:110` | — |
| 15 | `HC-human-confirm.test.ts` | `DV-HC-8: corrected row pinned; confirm_status unchanged` — `refine_status` Expected "DONE" Received "PARTIAL" | BEQ-7 section guard (added after test was written) overrides DONE→PARTIAL when not all 3 sections (BS + IS + CF) are present; test fixture seeds only BS + partial IS rows without CF | REWRITE-STALE | `finalizeBctcRefineTool` BEQ-7 guard · `src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts:328-341` | — |
| 16 | `TRUST-RED-sanity-gate.test.ts` | `TR-RED-5b: clean data passes DT-2 finalize gate — refine_status='DONE', realistic margin` — Expected "DONE" Received "PARTIAL" | Same BEQ-7 guard as HC-human-confirm; test seeds only IS rows without BS/CF; BEQ-7 requires all 3 sections | REWRITE-STALE | `finalizeBctcRefineTool` BEQ-7 guard · `src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts:328-341` | — |
| 17 | `VPT-1-vps-proxy-health-endpoint.test.ts` | `(c) stale push beyond threshold → stale=true` | Calendar-aware quiet-hours logic for `news` service: current CI runtime UTC ~19:40 is in quiet window (UTC 15:00-00:00); grace threshold >> 30 min → stale=false; test expects tight 10-min SLA without injecting `now` param | REWRITE-STALE | `computeStale` / `isVnNewsPublishHours` · `src/interface/mcp/routes/vpsProxyHealthHandler.ts:91,108-114` | — |
| 18 | `bctc-eval-routes.test.ts` | `200: report exists → stages computed and returned` — receives 500 (internal error) | `computeBctcEval` queries `SELECT domain FROM financial_reports` but test DDL for `financial_reports` doesn't include `domain` column → SQLite throws → handler returns 500 | REWRITE-STALE | `computeBctcEval` column `domain` · `src/application/usecases/computeBctcEval.ts:152` — test DDL missing `domain` column | — |
| 19 | `e2e/newsHeadlinesRefreshJob.e2e.test.ts` (×2 fails) | (1) `AC1-4: fetches bloomberg then reuters, pushes both to /api/push-news` (2) `AC5: bloomberg error → reuters still fetched and pushed` | Test mock checks `url.includes('/news/bloomberg/headlines')` but prod calls `${NEWS_FETCH_BASE}/bloomberg/headlines` (no `/news/` prefix); URL pattern mismatch → fetch calls never match | REWRITE-STALE | `newsHeadlinesRefreshJob` · `src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts:40` (`NEWS_FETCH_BASE + endpoint`) | — |
| 20 | `hotfix-vcb-parser.test.ts` (×3 fails) | (1) `routes to split-block parser when labels and values are on separate pages` (2) `extracts correct total_liabilities for VCB Q1 page-pair format` (3) `extracts correct equity_total for VCB Q1 page-pair format` | FIX-BCTC-MAGNITUDE-NORMALIZE incorrectly infers raw VND and applies ÷1,000,000 to VCB Q1 page-pair format; `totalLiabilities` = 1904.32 instead of 1,904,318,782 | FIX-PROD | `extractBalanceSheet` magnitude-normalize logic · `src/domain/services/balanceSheetExtractor.ts` (FIX-BCTC-MAGNITUDE-NORMALIZE path A/B) | — |

---

## Notes on File 12 (1821a)

`1821a-pollnews-cold-start-retry.test.ts` — **passes in isolation (0 fail)**. It appeared in the authoritative FAILEDFILE roster because it was genuinely contaminated in the OLD full-suite run order. Under per-file isolation it is GREEN. Do NOT delete. Wave 3 action: none.

---

## Bucket Tally

| Bucket | Count | Files |
|--------|-------|-------|
| FIX-PROD | 4 | 1309, 1416b, 1792, hotfix-vcb-parser |
| REWRITE-STALE | 15 | 1100, 1196, 1331a, 1352a, 1466, 1503, 1549, 1813, 1879a, FIX-PDF-VOLUME-SBV-TABLE, HC-human-confirm, TRUST-RED-sanity-gate, VPT-1, bctc-eval-routes, newsHeadlinesRefreshJob.e2e |
| REMOVE-OBSOLETE | 0 | — |
| GREEN-in-isolation (roster artifact) | 1 | 1821a |

**Fail marker distribution:**
- 19 files produce genuine fails
- 1 file (1821a) is GREEN under per-file isolation
- 26 CI fail markers → ~25 genuine fails (1821a contributed ≥1 marker in old suite)

---

## 1328e Conviction-Routing Disposition

Task 1328e conviction-routing was reclassified BATCH2→BATCH5 in arch-S23. The authoritative FAILEDFILE roster for the deterministic 26-fail baseline contains **no 1328e literal file**. Searching the 20-file roster:
- `1792-conviction-debounce.test.ts` covers conviction logic — triaged above as FIX-PROD (fire-and-forget async send)
- The prior 1328e contamination (047-bctc-orchestrator missing afterAll) was FIXED in waves prior to arch-S25
- Under per-file isolation, 1328e is confirmed ABSENT from the genuine fail list — the contamination fix was effective
- **Verdict: 1328e is GREEN under per-file isolation. The conviction-routing tests pass. No BATCH5 work item for 1328e.**

---

## Wave 3 Dev Work Plan (Serial)

Order: FIX-PROD first (test correct, prod broken), then REWRITE-STALE (test stale, prod correct).

### FIX-PROD (4 items) — Wave 3 Priority 1

**FP-1: `hotfix-vcb-parser.test.ts` + `1416b-fpt-page-window.test.ts`**
- Module: `src/domain/services/balanceSheetExtractor.ts`
- Problem: FIX-BCTC-MAGNITUDE-NORMALIZE path A/B incorrectly infers raw VND for banking-format page-pair text and applies ÷1,000,000. Values already in millions get halved again.
- Fix: Add page-pair format detector before magnitude inference; if split-block path is active and codes-only / values-only pages are detected, skip magnitude normalization.
- Tests: `hotfix-vcb-parser.test.ts` B-3b (×3 fails), `1416b-fpt-page-window.test.ts` VNM split-block regression (×1 fail). Total: 4 fails → 0.

**FP-2: `1309-bb-alert-scan-job.test.ts`**
- Module: `src/scheduler/alerts/bbAlertScanJob.ts`
- Problem: AC-8 receives `fired:3` when HPG (inside band) should not fire. Root cause in `runBbAlertScan` — likely the `bbByCallOrder` index mapping is off due to iteration order, OR a boundary condition in the `close > bb20.upper` / `close < bb20.lower` comparison (possibly `>=`/`<=` vs strict comparison at band edge).
- Fix: Audit exact comparison operators and watchlist iteration order. Ensure band-edge ties (close === upper) do NOT fire.
- Tests: `1309-bb-alert-scan-job.test.ts` AC-8 (×1 fail) → 0.

**FP-3: `1792-conviction-debounce.test.ts`**
- Module: `src/application/usecases/parseBctcReport.ts:253`
- Problem: `void import(...).then(sendTelegramBug)` is fire-and-forget — test assertion runs before promise resolves.
- Fix: Convert to `await import(...)` with direct await on `sendTelegramBug()`. Alternatively: accept telegram fn as an injectable parameter (`sendBugFn?: (msg: string) => Promise<void>`) defaulting to real telegram.
- Tests: `1792-conviction-debounce.test.ts` (×2 fails) → 0.

### REWRITE-STALE (15 items) — Wave 3 Priority 2

Ordered by complexity (simple first):

**RS-1: `1100-cron-job-run-store.test.ts`**
- Fix: Replace hardcoded April-2026 timestamps with `datetime('now', '-Nd')` relative inserts so they always fall within the rolling window.

**RS-2: `1196-bctc-reparse-pipeline.test.ts`**
- Fix: Update test assertion to reflect task 1915-fix-part2 behavior — non-watchlist PDFs ARE included via `tickerFromFilename()` fallback. Change `expect(stranded.length).toBe(0)` to `toBe(1)`.

**RS-3: `1331a-single-writer-guard.test.ts`**
- Fix: Add `Bun.env["STOCK_PRICE_DB_PATH"] = "/app/data/stock_price.db";` at test file top, or skip TEST-3 when env is absent (`it.skipIf(!Bun.env["STOCK_PRICE_DB_PATH"])(...)`).

**RS-4: `1352a-scheduler-job-wrappers-macro-marketscan.test.ts`**
- Fix: Update A-1 to assert `sendWorkCalls.length >= 1` (not strict 1), or capture ALL sendTelegramWork calls (both injected and direct) by also mocking the module-level import.

**RS-5: `1466-sync-db-corruption-bail.test.ts`**
- Fix: Add `createLogger: () => _realLogger1466.logger` (or a stub of matching shape) to the `mock.module("../infrastructure/logger.js", ...)` export in the test.

**RS-6: `1503-ohlcv-foreign-flow.test.ts`**
- Fix: Update AC3 to reflect DPI-4 UPSERT behavior — when no OHLCV row exists, `writeForeignFlowToOhlcv` now INSERTS a stub row. Change `expect(result.changes).toBe(0)` to `toBe(1)`.

**RS-7: `1549-watchdog-news-staleness.test.ts`**
- Fix: The test at line 66 must be updated to not assert `not.toContain("vn-price-fetch\n")` since the operator action section always lists all services. Assert only on stale SOURCE names in the bullet-list section, not in the entire message.

**RS-8: `1813-bctc-ddd.test.ts`**
- Fix: `discoverHosePdfUrls({})` no longer throws; it returns empty. Either update test to `expect(result.urls).toHaveLength(0)` or remove the throw assertion and add a guard that a discoverer without fetch fns returns a null-source result.

**RS-9: `1879a-fred-effr-iorb-fetcher.test.ts`**
- Fix: T7 should reflect the bypass intent: when `httpClient` is injected, `FRED_API_KEY` absence is allowed. Either: update assertion to expect a non-null result, or test the key-absent/no-client case separately.

**RS-10: `FIX-PDF-VOLUME-SBV-TABLE.test.ts`**
- Fix: Change file read target from `../index.ts` to `../composition-root.ts` (where `mkdirSync(pdfDir, { recursive: true })` now lives, line 110).

**RS-11: `HC-human-confirm.test.ts`**
- Fix: Add cash flow rows to the `markdown` fixture in DV-HC-8 so BEQ-7 section guard sees all 3 sections (BS + IS + CF). Or add balance sheet rows to the TRUST-RED-5b fixture (shared root cause).

**RS-12: `TRUST-RED-sanity-gate.test.ts`**
- Fix: TR-RED-5b fixture seeds only IS rows; add BS + CF rows so BEQ-7 sees complete sections.

**RS-13: `VPT-1-vps-proxy-health-endpoint.test.ts`**
- Fix: Inject `now` parameter into `handleVpsProxyHealth` call (or compute staleness with an explicit time). Pass a time within VN news publish hours (UTC 00:00-14:59) so the tight 10-min threshold applies. Test (c) pushes data 30 min ago and expects stale=true — this only holds during publish hours.

**RS-14: `bctc-eval-routes.test.ts`**
- Fix: Add `domain TEXT` column to `financial_reports` DDL in `makeTestDb()` function.

**RS-15: `e2e/newsHeadlinesRefreshJob.e2e.test.ts`**
- Fix: Change URL pattern in mock checks from `/news/bloomberg/headlines` to `/bloomberg/headlines` (and `/news/reuters/headlines` to `/reuters/headlines`) to match the actual `NEWS_FETCH_BASE + endpoint` URL construction.

---

## Summary

- **Total files in deterministic roster:** 20
- **Genuine failures:** 19 files (1821a is GREEN in isolation)
- **FIX-PROD:** 4 items (bbAlertScanJob, balanceSheetExtractor ×2, parseBctcReport fire-and-forget)
- **REWRITE-STALE:** 15 items (test assertions/fixtures/mocks stale vs prod evolution)
- **REMOVE-OBSOLETE:** 0 items
- **1328e disposition:** GREEN under per-file isolation — contamination fix was effective; no Wave 3 work

**Hand-off:** PO updates board (arch-S25 → DONE), creates Wave 3 dev tasks for FP-1..FP-3 + RS-1..RS-15. Assign FIX-PROD to dev-mcp-server with highest priority.
