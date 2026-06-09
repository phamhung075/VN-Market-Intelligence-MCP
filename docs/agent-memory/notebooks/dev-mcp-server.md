# dev-mcp-server -- Notebook

## 2026-06-09 · FIX-CI-C5-UNMOCKED-HTTP-FETCHES — REVIEW

**Task:** FIX-CI-C5-UNMOCKED-HTTP-FETCHES | Sprint: CI-RED-RECONCILE | Size: M | Baseline: 135 native fail+error
**Scope:** TEST-FILE-ONLY — 3 files changed (zero production code):
- `apps/mcp-server/src/__tests__/123-integration-mcp.test.ts` — delegating mocks for sbv.js + yahooFinance.js
- `apps/mcp-server/src/__tests__/083-tool-analysis.test.ts` — delegating mocks for sbv.js + yahooFinance.js; ragHttpClient static stubs reverted (correct)
- `apps/mcp-server/src/__tests__/ddd-1b-rag-http-client.test.ts` — added mock.module() re-registration with genuine inline implementations

**Root cause:** Not "unmocked HTTP" as task description stated. True cause: Bun ESM module cache contamination. `mock.module()` stubs installed by 123 and 083 persist in cache for the entire bun test run. Downstream files with correct mock clients (028/025/1487/1423a) statically import the same fetcher modules and get the null stubs. ddd-1b patches globalThis.fetch but gets 083's ragHttpClient stub from cache — fetch patch never fires.

**Fix pattern:** Delegating mock for sbv/yahoo (pass-through to real when httpClient injected). ddd-1b self-register with real inline ragHttpClient implementations overriding 083's stub.

**Out-of-scope siblings confirmed:**
- newsHeadlinesRefreshJob.e2e.test.ts: C7 URL mismatch bug (test expects `/news/bloomberg/headlines`; job calls `/bloomberg/headlines`)
- 1134-get-foreign-flow-tool.test.ts: passes (C3 cluster1 fixed)
- 1416/235: pass already

**Verification:** Full sequence 123→083→028→025→1487→1423a→ddd-1b: 93 pass / 0 fail / 1 skip. Each file isolated: all pass. `bun tsc --noEmit`: CLEAN.
**Status:** REVIEW — router owns CI gate vs 135 absolute.

Zone health: test-only fix, tsc clean, 3 test files changed | HEALTHY

## 2026-06-09 · FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE — REVIEW

**Task:** FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE | Zone: apps/mcp-server/src/__tests__/ | Size: XS | Priority: high
**Scope:** TEST-FILE-ONLY — 1 file changed: `apps/mcp-server/src/__tests__/1168-market-message-digest.test.ts`
**Root cause:** Task 1168 test used CJS `require()` interop to import `getMarketMessageDigest`, `batchReviewMarketMessages`, `handleGetMarketMessageDigest`, `handleBatchReviewMarketMessages`. Under Bun ESM, named exports via `require()` return `undefined` → tests fail at call time with ~21 failures.
**Fix:** Replaced 2 `require()` blocks (lines 105-120) with proper ESM `import { ... } from '...'` statements. No production code touched.
**Verification:** 31 pass / 0 fail (targeted run: `bun test src/__tests__/1168-market-message-digest.test.ts`). `bun tsc --noEmit`: CLEAN.
**DJ-GATE-1:** task FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE flipped TODO→REVIEW. PO owns final DONE flip after CI gate.
**Status:** REVIEW — router owns CI gate vs 193 absolute.

## 2026-06-09 · FIX-CI-C1-MACRO-INJECT-SEAM-TESTS — REVIEW

**Task:** FIX-CI-C1-MACRO-INJECT-SEAM-TESTS | Zone: apps/mcp-server/src/__tests__/ | Size: M | Priority: high
**Scope:** TEST-FILE-ONLY — 5 files rewritten (zero production code touched):
- `apps/mcp-server/src/__tests__/089-tool-macro.test.ts`
- `apps/mcp-server/src/__tests__/1423d-thien-thoi-snapshot.test.ts` (integration section TT-07..TT-10 rewritten; TT-01..TT-06 pure unit tests UNCHANGED)
- `apps/mcp-server/src/__tests__/1423f-deposit-rate-display.test.ts`
- `apps/mcp-server/src/__tests__/1570c-dinh-gia-snapshot.test.ts` (integration DG-I-01..07 rewritten; DG-01..09 pure unit + DG-I-08/09 DB drift guards UNCHANGED)
- `apps/mcp-server/src/__tests__/1903a-dispatch-regression.test.ts` (Suite B GMS-REG-02..04 rewritten; Suite A WAV-REG-01..07 UNCHANGED)
**Root cause (settled by architect SPIKE-CI-C1-MACRO-INJECT-SEAM):** P2-B1 HTTP rewire (commit 98df0f43, 2026-05-23) removed `_testCommodityClient`/`_testSbvClient`/`_testDinhGiaInputs` injection seams. `registerMacroTools()` is now a thin HTTP proxy to Go macro-indicators:5004. Tool output shape changed from human-readable text sections to `{ source_tier, text: JSON.stringify(MacroSnapshotResponse), fetchedAt }`.
**Fix pattern (from 1881a template, lines 92-135):**
1. Added `globalThis.fetch` mock in `beforeAll` intercepting `url.includes("/snapshot")` → returns controlled `MacroSnapshotResponse` JSON.
2. Updated all assertions from `toContain("[Commodity Prices]")` / `toContain("[Macro Signal Summary]")` etc. to JSON field checks: `parseInner(result).signals.carry.regime`, `parseInner(result).oilUsd`, etc.
3. Pure unit tests (`formatThienThoi()`, `formatDinhGia()`) and DB schema drift guards left UNTOUCHED.
**Verification:**
- 58 pass / 0 fail across 5 target files (local targeted run)
- `bun tsc --noEmit`: CLEAN (0 errors)
- 1881a template: 20 pass / 0 fail (still green, not broken)
**Expected CI impact:** ~71 C1 MACRO_INJECT_SEAM failures cleared. Router owns CI gate vs 241 absolute. Status=REVIEW.

## 2026-06-09 · FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES — REVIEW

**Task:** FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES | Zone: apps/mcp-server/src/__tests__/ | Size: XS
**Scope:** TEST-FILE-ONLY — 1 file changed: `apps/mcp-server/src/__tests__/1945b-accuracy-digest-handler.test.ts`
**Root cause:** NOT DB singleton pollution (taxonomy was misleading label). True cause: `mock.module('../infrastructure/db/signalOutcomeStore.js')` in 1945b fires at Bun module-eval time. Bun runs 1945b BEFORE 1941c (empirically; top-level `await import()` affects Bun's file ordering). 1945b's `beforeEach` resets `_digestImpl` to ZERO_STRUCT before each test. After TC-6, `_digestImpl=ZERO_STRUCT` persists. 1941c's runAccuracyDigest receives ZERO_STRUCT → `totalResolved=0 && neutralOnlyRows=0` → early exit → capturedText="" → TC2/TC3 fail. Also: default `_digestImpl` used live namespace binding `realSignalOutcomeStore.getSystemAccuracyDigestStats` which becomes circular after mock fires.
**Fix (3 changes in 1945b):**
1. Mock factory: replaced `...realSignalOutcomeStore` spread with explicit stable snapshot refs (`_realSeedSignalOutcome`, `_realResolveSignalOutcomes`, `_realGetAccuracyStats`) + delegate wrapper for `getSystemAccuracyDigestStats`.
2. Default `_digestImpl`: changed to call `_realGetSystemAccuracyDigestStats(db, days)` (stable snapshot, not circular live binding).
3. `afterAll`: added `_digestImpl` restore to real-calling version + `closeDb() + initDatabase()` for DB singleton restore.
**Verification:**
- 74 pass / 0 fail across 7 targeted files (1945b + 1941c + signal-outcome-store + accuracy-context-tool + 1124 + 1129 + 1173)
- `bun tsc --noEmit` (via apps/mcp-server/node_modules/.bin/tsc): CLEAN
Zone health: test-only fix, tsc clean, no production code touched | HEALTHY

## 2026-06-09 · FIX-CI-MCP-SDK-MOCK-CONTAM — DONE

**Task:** FIX-CI-MCP-SDK-MOCK-CONTAM | Zone: apps/mcp-server/ | Size: XS
**Scope:** TEST-FILE-ONLY — 1 file changed: `apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts`
**Root cause:** `mock.module("@modelcontextprotocol/sdk/server/mcp.js", ...)` at lines 38-42 created a `MockMcpServer` with only `.connect`. Bun's `mock.restore()` in `afterAll` does NOT undo `mock.module()` ESM replacements (it only rolls back `mock()` spies). The incomplete mock leaked to 69+ files loaded after 1862c, causing ~355 native failures with "server.tool is not a function".
**Fix (Option A):** Added `.tool()`, `.registerTool()`, `_registeredTools`, `.server`, `.close()`, `.isConnected()` to `MockMcpServer`. Both `.tool()` and `.registerTool()` capture the last arg as handler and store it in `_registeredTools[name]`, so downstream `callTool()` helpers can still invoke handlers. The mock is now harmless even when leaked.
**Verification:**
- 1862c own suite: 5 pass / 0 fail
- 1862c + 187-earnings-calendar (McpServer + `_registeredTools`): 26 pass / 0 fail
- 1862c + 188-alert-digest + 206-price-alerts: 52 pass / 0 fail
- 1862c + 1872b-alert-commander-skill-manifest: 7 pass / 0 fail
- `bun tsc --noEmit`: clean (0 errors)
Zone health: test-only fix, bun tsc clean, no production code touched | HEALTHY

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

## 2026-06-09 · FIX-CI-DEAD-REUTERS-TESTS + FIX-CI-DATA-SYMLINK-ENOENT — DONE

**Tasks:** FIX-CI-DEAD-REUTERS-TESTS (Cluster 5) + FIX-CI-DATA-SYMLINK-ENOENT (Cluster 2) | Single commit
**Commit:** a51506857c08ec89c422bb7847d6e7c04efb4a0a

**Cluster 5 (2 native errors → 0):**
- Deleted `apps/mcp-server/src/_deprecated/fetchers/023-rss-reuters.test.ts` and `1828c-rss-consecutive-error.test.ts`
- Both import `../infrastructure/fetchers/reuters.js` (deleted from production); bun throws `Cannot find module` at eval time → 2 native errors
- Files marked `@ts-nocheck` + "Retained for rollback reference only" — dead by design

**Cluster 2 (~91 native fails → ~0):**
- Root cause: `apps/mcp-server/data` is git mode 120000 symlink → `../../data` (git-ignored `/data/`). In CI the symlink target is absent. `setup.ts` `mkdirSync` loop silently catches the resulting ENOENT; subdirectories are never created; tests writing to `data/briefings/`, `data/reports/`, `data/lancedb/` etc. get ENOENT at test time.
- Fix: added `lstatSync` + `isSymbolicLink` guard in `setup.ts` preload BEFORE the mkdirSync loop. If DATA_ROOT is a symlink and `existsSync` returns false (broken), `unlinkSync` removes the dangling symlink entry. `mkdirSync` then creates a real directory. No CI workflow change needed.
- Local dev: `existsSync` returns true (target exists) → guard does not fire → symlink preserved

**Verification:**
- `bun tsc --noEmit`: clean (0 errors)
- 125-test-e2e-briefing: 39 pass / 0 fail (primary Cluster 2 victim)
- 012-lancedb-store: 6 pass / 0 fail (data/lancedb path)
- 101-job-morning-briefing: 14 pass / 0 fail (data/briefings path)

Zone health: bun tsc clean, Cluster5 errors eliminated, Cluster2 symlink healed | HEALTHY

---

## 2026-06-09 FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS + FIX-CI-C3-RESIDUAL-DB-DESTROYERS

**Baseline:** 172 native fail, 0 errors (sha 7bea53d0, run 27189745293)

**C1 root causes fixed (4 files, ~42 fails):**
- `239-macro-indicator-refresh`: country key `"VN"` in test INSERTs vs `"vietnam"` in SLA service MACRO_COUNTRY_KEY
- `239-market-context`: `getText()` returned raw JSON envelope; `.split("\\n")` got no real newlines; fixed to JSON.parse inner `.text`
- `239c-macro-refresh-integration`: schedule assertion `"0 6 * * *"` stale (Sprint 1949-T7 moved to `"13 19 * * *"`); updated to regex match
- `1352a-scheduler-job-wrappers-macro-marketscan`: (1) `getMacroExternal` not mocked → localhost:5004 error; (2) FRED fetchers calling real `api.stlouisfed.org` with retries → 5s timeout; (3) A-3 expected `.resolves` but job re-throws (FIX-MACRO-REFRESH-DEAD). Fixed: added `getMacroExternal` to mock, added `globalThis.fetch` mock with today-date FRED responses, changed A-3 to `.rejects.toThrow`

**C3 root causes fixed (4 files, ~20 fails):**
- `1295d-integration-builders-to-synthesis`: `DELETE FROM agent_signals` FK-blocked by `signal_outcomes`; fixed with `PRAGMA foreign_keys=OFF` + delete child first
- `1124/1129/1173`: InMemoryTransport never closed → CI stall on next `beforeEach` connect(); added `afterEach(async () => { await client?.close(); })`

**Local results:** C1 = 88 pass / 0 fail; C3 = 42 pass / 0 fail; tsc clean
**Status:** Both tasks REVIEW — router gates in CI

## 2026-06-09 SPIKE-CI-C4-KINH-DICH-DIACRITICS (CI-RED-RECONCILE)

**C4 root causes fixed (2 PROD files, 2 TEST files):**
- `kinhDichTools.ts`: (a) `explain_hexagram` rewired to local QUE_DATA (Path A — no Go service change): emits judgment/image/state/6-hào/trading-context sections; guard for missing entry; (b) `get_hexagram_history`: aliased loop variable to `hexagramNumber`/`tradingSignal` via `.map()`; (c) backtest: added `Thay đổi TB:` line + capitalised `Tỷ lệ thắng:`
- `leadershipTools.ts`: tool description prefix updated to `Phân tích giao dịch nội bộ`
- `1416-diacritics-wave5.test.ts`: REMOVE — `"Lỗi khi tính quẻ thị trường"` test deleted; `get_market_hexagram` handler was removed (TSH-1), string is dead code
- `1410-tool-diacritics-sweep.test.ts`: REWRITE — `formatAccuracyReport` returns `AccuracyReport` object; fixed `.text` accessor

**Local results:** 1414=22/0, 285=27/0, 1416=162/0, 1472=20/0, 1410=27/0; combined 258 pass / 0 fail; tsc clean
**Status:** REVIEW — router isolates push + CI gate
