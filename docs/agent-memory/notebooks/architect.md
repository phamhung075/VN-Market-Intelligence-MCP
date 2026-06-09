# Architect — Notebook

**Last updated:** 2026-06-09 12:30 UTC | **Sprint:** CI-RED-RECONCILE

[3 most recent cycles retained below. Archive in git history.]

## 2026-06-09T12:30Z — FIX-CI-C1134-RESIDUAL-TRIAGE: get_foreign_flow tool, 12 CI fails

**Task:** FIX-CI-C1134-RESIDUAL-TRIAGE (TRIAGE, S, zone: apps/mcp-server/src/__tests__/)

**Method:** Full read of test file (1134), prod handler (foreignFlowTools.ts), domain service
(foreignFlowAnalyzer.ts), git log both files, CI signals (c1-already-shipped, c1124-gate), prior
briefs (C1124 + 1423e patterns), sibling test (1518). Checked for HTTP-proxy rewire, deleted seam,
assertion-vs-envelope mismatch.

**Verdict: REWRITE (stale test infrastructure — 1124-transport-hang signature)**

**Root cause:**
- Prod is correct. foreignFlowTools.ts: pure SQLite, db? injection live, _testFallback seam live. No
  HTTP proxy. git log: 4 commits, none is an HTTP-proxy migration.
- 1134 test uses InMemoryTransport + Client.callTool() with NO afterEach cleanup. 6 it() × 2 native
  CI failures (test timeout + cleanup stall) = 12.
- 1423e-deleted-seam does NOT apply: both _testFallback and db? seams are present in prod.
- REMOVE does not apply: test exercises unique MCP integration path (injection, zero-detection guard,
  insufficient-data guard, Zod validation, JSON envelope) not covered by any sibling.
- Assertions are semantically compatible with the JSON envelope (strings appear in JSON.stringify
  output). The transport hang is the sole failure mechanism.

**Fix spec:**
- ONE file: 1134-get-foreign-flow-tool.test.ts
- Replace McpServer+InMemoryTransport+Client with McpServer+_registeredTools direct handler invocation
- Pattern: same as 1117/1124 (sibling, CI-green); `registerForeignFlowTools(server, db)` already accepts injected db
- Module-level _testDb + _testServer, set in beforeEach (sync — no initDatabase() needed; schema inline)
- callTool(): `_testServer._registeredTools[name].handler(args)`
- Remove: Client import, InMemoryTransport import, buildConnectedPair() function
- AC-4 (days=35): Zod validation may throw instead of returning isError=true on direct handler path; dev to verify and adapt assertion
- NO new mock.module() — pure SQLite, zero mocking needed

**CI victim prefix:** `Task 1134` (12 → 0 projected)
**Brief:** docs/architecture-briefs/2026-06-09-ci-c1134-foreign-flow-triage.md

## 2026-06-09T11:25Z — FIX-CI-C1124-RESIDUAL-TRIAGE: evidence tools Phase B+C, 24 CI fails

**Task:** FIX-CI-C1124-RESIDUAL-TRIAGE (TRIAGE, S, zone: apps/mcp-server/src/__tests__/)

**Method:** Full read of test file (1124), prod handler (evidenceTools.ts), all 3 infra stores (evidenceFragmentStore, predictionClaimStore, likelihoodRatioStore), schema-system.ts DDL section, schema.ts initDatabase, bunfig.toml, CI signals (c1-already-shipped, c5-gate, 1423e-gate), git log 1124 test file, sibling test 1117.

**Verdict: REWRITE (stale test infrastructure — InMemoryTransport+Client → _registeredTools direct call)**

**Root cause:**
- Prod is correct. All 4 tables (evidence_scores, evidence_fragments, evidence_likelihood_ratios, prediction_claims) ARE created by initSystemTables() in schema-system.ts lines 138/156/172/187. Schema fixture is complete.
- evidenceTools.ts: pure SQLite, no HTTP, no fetch. All handlers synchronous at the DB layer. DB arg injected correctly via `registerEvidenceTools(server, db)`.
- The 24 CI fails = 12 it() × 2 native failures each (test timeout + afterEach stall). In CI (Bun 1.3.13 / Ubuntu-latest), InMemoryTransport + Client.callTool() hangs. The `afterEach client?.close()` fix (a43dff49, C3) addresses inter-test transport leak but cannot prevent the intra-test callTool() hang.
- Local (macOS): 12/0 pass. CI: 24/0 fail at ~5000ms each (Bun default timeout fires when bunfig timeout=30000 is not enforced on Linux runner).

**Fix spec:**
- ONE file: 1124-evidence-tools-phase-bc.test.ts
- Replace McpServer+InMemoryTransport+Client with McpServer+_registeredTools direct handler invocation
- Pattern: same as 1117-evidence-tools.test.ts (sibling, already CI-green)
- beforeEach: async initDatabase() + registerEvidenceTools(server, db)
- afterEach: closeDb()
- callTool(): `server._registeredTools[name].handler(args)`
- Remove: Client import, InMemoryTransport import, module-level _currentClient, afterEach client.close()
- NO new mock.module() — evidence tools chain is pure SQLite, zero mocking needed

**CI victim prefix:** `Task 1124` (24 → 0 projected)
**Brief:** docs/architecture-briefs/2026-06-09-ci-c1124-evidence-tools-triage.md

## 2026-06-09T11:00Z — SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY: addendum — brownfield DI audit + nondeterminism fold

**Task:** SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY — Addendum

**Brownfield DI audit confirmed (sha 3663bd12):**
- `analysis.ts` handler calls `runImpactChain({ newsText, watchlist })` with NO injections. `_testCommodityFetcher`/`_testSbvFetcher`/`_testRagRetriever` absent from Zod schema. **Production change REQUIRED**: add 3 `z.any().optional()` params + pass through. Risk-4 flagged: use `z.function().optional()` to avoid TS type errors vs `RunCascadeInput` typed function signatures.
- `retriever.js` mock in 123 confirmed dead (G5b complete; zero production import chain). Remove it = zero-risk (Risk-2 RESOLVED).
- grep confirms 083 and 123 are the ONLY files installing `mock.module()` for sbv.js/yahooFinance.js. No other contaminator.
- All 4 `fetch_and_analyze` tests in 083 are network-agnostic (typeof string asserts + allSettled+outer-catch). Risk-1 downgraded to LOW.

**Nondeterminism finding folded:**
- Empirical: same test content produces 135 vs 138 fail across two CI runs (±3 band). Gate threshold: must land CLEARLY below 132.
- Projected post-fix: ~113 (22 victims cleared) → 19-count headroom above 132 noise floor. Robust.
- Per-victim verification: assert named tests (028/1487/025/1423a) flip fail→pass in CI log, not just global delta.

**Brief updated:** `docs/architecture-briefs/2026-06-09-spike-ci-c5-contam-safe-restrategy.md` (Sections 5, 6-Addendum, 7, 8 rewritten)

## 2026-06-09T10:00Z — SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY: contamination-safe respec for sbv/yahoo/ragHttpClient null-in-CI

**Task:** SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY (SPIKE, 120m, zone: apps/mcp-server/src/__tests__/)

**Method:** Full read of 028/025/1423a/1487/ddd-1b victim test files, sbv.ts + yahooFinance.ts + ragHttpClient.ts production modules, 083 + 123 contaminator test files, runImpactChain.ts application seam, analysis.ts interface seam. Cross-referenced C5 gate signal (22470e44 regression +10) and 3663bd12 baseline.

**Root mechanism confirmed:**
- 083 and 123 install file-top `mock.module()` stubs for `sbv.js` and `yahooFinance.js` (and 083 also for `ragHttpClient.js`).
- Bun 1.3.13 ESM cache is process-scoped; these stubs persist for all subsequent files in run order.
- Victim files (028/025/1423a/1487) correctly inject mock httpClient into `fetchSbvRates(client)` / `fetchYahooFinancePrices(client)`, but the function they receive IS the stub (`async () => null`) not the real function — so the mock client arg is irrelevant and null is always returned.
- `ddd-1b` uses correct per-test `globalThis.fetch` save-and-restore pattern — no change needed there.
- C5 failed cure: adding more `mock.module()` in ddd-1b (the re-registration) re-spread contamination to new files (+24 rag, +24 Task1124).

**Pattern chosen:** (b) DI injection at call-site. BOTH production functions already have optional `httpClient?` seams. Both victim tests already USE those seams correctly. The fix is to remove the file-top `mock.module()` from 083 and 123, and replace with injection via `RunCascadeInput.commodityFetcher?` / `sbvFetcher?` / `ragRetriever?` seams (already exist in runImpactChain.ts) where 083/123 need null-return behavior.

**Per-file plan:**
- `083-tool-analysis.test.ts`: Remove 3 file-top mock.module() calls (lines 15-26). Pass `_testCommodityFetcher/sbvFetcher/ragRetriever` through callTool args where needed.
- `123-integration-mcp.test.ts`: Remove 2 file-top mock.module() calls (lines 35-40). Pass `_testCommodityFetcher/sbvFetcher` for run_impact_chain test (RT2 third test) via callTool args.
- `ddd-1b-rag-http-client.test.ts`: NO CHANGE — already correct.
- `028/025/1423a/1487`: NO CHANGE — already correct DI pattern; they pass once 083/123 stop contaminating ESM cache.
- `analysis.ts` (production): Conditional seam addition for `_testCommodityFetcher`/`_testSbvFetcher`/`_testRagRetriever` args if not already present in the `run_impact_chain` handler (same `_test*` injection pattern as `_testHoseClient` in `get_market_snapshot`).

**Projected drop:** 135 → ~113 native fail+error (22 victims cleared: 028=9, 025=7, 1423a=3, 1487=3)

**Brief:** `docs/architecture-briefs/2026-06-09-spike-ci-c5-contam-safe-restrategy.md`

## 2026-06-09T08:30Z — CI-172-RESIDUAL-FILESCOPE: file-scope confirmation for C1/C3/C4

**Task:** SCOPE-CONFIRMATION / sha 7bea53d0 / 172 fail / 0 errors

**Method:** grep CI log /tmp/ci_80266839417.log (345 raw fail lines / 2 = 172 native). Per-cluster file-scope confirmed. kinhDichTools.ts production audit. C3 error-type determination from "a beforeEach/afterEach hook timed out" log evidence.

**C1 confirmed (42 fails, 9 files, NOT 5 files as spike plan assumed):**
- 028-sbv-rates (9), 025-yahoo-finance (7), 1423a-us10y (3), 1487-yahoo-extended (3), 1833l-yahoo-404 (1), 239-macro-indicator-refresh (3), 239-market-context (1), 239c-macro-refresh-integration (1 — cron-fixture, C5 overlap), 1352a-macro-marketscan (2). ALL test-only. Fix = globalThis.fetch mock + JSON-field asserts per 1881a template.

**C3 confirmed (20 fails, 4 files — root cause DIFFERENT from P7 destroyers):**
- 1129 (5), 1173 (3), 1124 (6): "beforeEach/afterEach hook timed out" = InMemoryTransport stall; fix = `afterEach(async () => { await client?.close(); })`.
- 1295d (6): SQLiteError FOREIGN KEY constraint on `DELETE FROM agent_signals`; fix = `PRAGMA foreign_keys=OFF` wrapper or delete FK children first. All test-only.

**C4 confirmed (25 fails, 5 file-groups — PROD touches required):**
- kinhDichTools.ts (714), 285-kinhdich (7), 1416-wave5 (9), 1472-diacritics-batch2 (1), 1410-sweep (1).
- RULING (A): production fix. kinhDichTools.ts has ASCII placeholders and missing explain_hexagram sections (judgment/image/haos). Fix via QUE_DATA local library (Path A — no Go service change). leadershipTools.ts and formatAccuracyReport also need diacritics.
- Source-scan test (1414) asserts `| Quẻ ${r.hexagramNumber}` but prod uses `r.hexagram` — variable name alignment needed; check KinhDichHistoryResponse type.

**Net projection: 42+20+25 = 87 of 172 → 0. Remaining after C1+C3+C4: ~85 (C5+C6+C7+C8+C9).**

**Brief:** `docs/architecture-briefs/2026-06-09-ci-172-residual-filescope.md`

## 2026-06-09T06:30Z — SPIKE-CI-C1-MACRO-INJECT-SEAM: C1 macro seam audit + verdict

**Task:** SPIKE-CI-C1-MACRO-INJECT-SEAM (SPIKE, 90m, zone: apps/mcp-server/src/interface/mcp/tools/macro/)

**Method:** git log --follow macroTools.ts → key commit 98df0f43 (2026-05-23 P2-B1). git show 98df0f43 diff to find seam removal context. Read current macroTools.ts (521L), Go dtos.go (MacroSnapshotResponse shape), all 5 affected test files (089, 1423d, 1423f, 1570c, 1903a), plus passing reference 1881a.

**Verdict: (A) INTENTIONAL + partial (B) FORMAT CHANGE**
- P2-B1 (98df0f43, 2026-05-23) removed `_testSbvClient`/`_testCommodityClient`/`_testDinhGiaInputs` as a deliberate architecture change: macroTools.ts rewired from TS-only fetcher to HTTP proxy calling Go macro-indicators at `/snapshot`.
- Go service returns structured JSON (`MacroSnapshotResponse`), NOT text sections. No `[Commodity Prices]`, no `=== Macro Snapshot ===`. Production format is `{ source_tier, text: JSON.stringify(goResponse), fetchedAt }`.
- 71 tests across 5 files fail because they (a) pass dead injection params now silently ignored, and (b) assert section headers that no longer exist in any layer.
- `formatThienThoi()` and `formatDinhGia()` remain exported as pure helpers; their unit tests (TT-01..TT-06, formatDinhGia units) still pass. Only integration tests using callTool() fail.
- 1881a-source-tier.test.ts already demonstrates the correct new injection pattern (globalThis.fetch mock) and PASSES.

**Count partition (~71):** ~40 need fetch-mock injection rewrite; ~31 need assertion update to match `{ source_tier, text: JSON, fetchedAt }` shape.

**Production severity: MEDIUM.** Signals are live and correct from Go service. Format change (text → JSON) is intentional. Cowork agents parsing `get_macro_snapshot` output may receive raw JSON dump instead of formatted sections.

**Brief:** `docs/architecture-briefs/2026-06-09-spike-ci-c1-macro-inject-seam.md`

## 2026-06-09T05:50Z — RE-PROFILE-CI-241-RESIDUAL: 241-residual fresh taxonomy

**Task:** RE-PROFILE-CI-241-RESIDUAL (SPIKE, 120m, NO CODE CHANGE, zone: apps/mcp-server/)

**Method:** CI log pull (gh run view --job=80254121788), Python dedup on test-description strings, error-message inspection for root-cause per cluster.

**9 fresh clusters (241 native fails, 0 errors):**

1. **C1 MACRO_INJECT_SEAM (71):** `macroTools.ts` removed `_testSbvClient`/`_testCommodityClient`/`_testDinhGiaInputs` seams; 071 tests still pass obsolete params → sections missing from output. Prod-risk HIGH. **RECURRING-BUG FLAG: second major CI event in macroTools.ts — needs dedicated SPIKE before dev touch.**
2. **C2 UNDEFINED_GETMARKETMESSAGEDIGEST (21):** Functions implemented in `marketMessageStore.ts`; test uses `require()` CJS/ESM interop → named exports resolve as undefined in Bun. Prod-risk LOW.
3. **C3 DB_SINGLETON_SIGNAL_OUTCOMES (43):** `signal_outcomes`/`evidence_scores`/`prediction_claims` tables wiped by singleton pollution from an earlier `closeDb()` without reinit. Pattern = P7-type destroyer. Prod-risk MEDIUM.
4. **C4 KINH_DICH_DIACRITICS (24):** `kinhDichTools.ts` lines 734/1008/1032/1033/1035/1038 use ASCII not UTF-8; `explain_hexagram` missing sections. Prod-risk LOW.
5. **C5 FILE_FIXTURE_ASSERTIONS (12):** Config/fixture evolved without updating test expectations (scheduler count, cowork-schedule schema, orch-state v3, docker-compose, `ttl_seconds: 180`). Prod-risk LOW.
6. **C6 FOREIGN_FLOW (12):** `daily_ohlcv` foreign-flow columns missing in test DB after singleton pollution OR tool logic drift. Prod-risk MEDIUM.
7. **C7 RAG_HTTP_CLIENT (12):** `globalThis.fetch` mock no longer intercepts ragHttpClient call path; response shape changed. Prod-risk LOW-MEDIUM.
8. **C8 CONVICTION_ALERTS (8):** `conviction_debounce` table lost to singleton; `bbAlertScanJob` count drift; `notifyTelegramAlert` severity gate changed. Prod-risk MEDIUM.
9. **C9 MISC_ASSERTION_TIMEOUT (38):** Mix of network-timeout tests without CI guard, assertion drifts, E2E behavior changes. Prod-risk MIXED.

**Attack order:** C3 → C4 → C2 → C9 → C5 → C1(after dedicated SPIKE) → C6 → C7 → C8

**Brief:** `docs/architecture-briefs/2026-06-09-ci-241-residual-taxonomy.md`

## 2026-06-09T07:00Z — FU-CI-PROFILE-629: full-suite failure taxonomy spike

**Task:** FU-CI-PROFILE-629 (SPIKE, 120m, NO CODE CHANGE, zone: apps/mcp-server/)

**Method:** CI log profiling only (gh run view job 80229060413, /tmp/ci-629-full.txt, 64,683 lines). Native summary tally = authoritative. 3 local spot-runs only (089-tool-macro, 234-system-status-merge, 028-sbv-rates).

**6 clusters identified (629 native fails + errors):**

1. **MCP-SDK mock contamination (~355 total):** `1862c-transport-session-eviction.test.ts` at CI position #316 replaces entire `@modelcontextprotocol/sdk/server/mcp.js` with a MockMcpServer lacking `.tool()`/`.registerTool()`. Bun ESM cache propagates to all 69+ subsequent files. Single-file LOW-cost fix. RANK 1.
2. **ENOENT broken symlink (~91):** `apps/mcp-server/data` = git mode 120000 symlink → `../../data` (git-ignored, absent in CI). setup.ts swallows ENOENT silently. Fix: CI `mkdir -p` step or replace symlink. LOW cost. RANK 2.
3. **ASSERTION/LOGIC (~159):** sbv mock contamination sub-class (add `mock.restore()` to 123-integration-mcp + 083-tool-analysis) + parser/format drifts + RED-phase stragglers. HIGH cost for full triage. RANK 4/6.
4. **UNDEFINED-FN (~21):** `getMarketMessageDigest` not implemented; 1168-market-message-digest.test.ts. MEDIUM cost. RANK 5.
5. **DEAD-MODULE (2 errors):** `_deprecated/` test files import deleted reuters.js. LOW cost (delete files). RANK 3.
6. **Schema-drift (~4, PARKED):** P4–P8 exhausted. Do not re-open.

**Attack order after this spike:** Cluster 1 → 2 → 5 → 3-sbv-subclass → 4 → 3-remainder. Clusters 1+2+5 = 448 failures, all LOW-cost, eliminates 71% before any ASSERTION/LOGIC triage.

**Brief:** `docs/architecture-briefs/2026-06-09-ci-629-failure-taxonomy.md`

## 2026-06-09T03:50Z — FU-SCHEMA-DRIFT-P8: recurring-bug spike, direction (a) — DDL reconcile + P5 self-heal

**Task:** FU-SCHEMA-DRIFT-P8 (SPIKE, 120m, zone: apps/mcp-server/, 6th touch CI-test-schema)

**Direction chosen:** (a) — Reconcile 3 drifted `created_at` DDL entries + re-apply P5 self-heal in `getDb()` + add preload `await initDatabase()` to `setup.ts`.

**DDL drift pinpointed (3 tables, 2 files):**
- `rag_analyses.created_at`: `TEXT NOT NULL` (no DEFAULT) — schema-news.ts line 22
- `agent_feedback.created_at`: `TEXT NOT NULL` (no DEFAULT) — schema-system.ts line 109
- `signal_quality_audit.created_at`: `TEXT NOT NULL` (no DEFAULT) — schema-system.ts line 430
All 3 need `DEFAULT (datetime('now'))` added. These were the exact cause of P5's +6 regression.

**Why NOT direction (b):** Global preload `await initDatabase()` runs ONCE. Cannot auto-reinit after every closeDb() without ESM monkey-patching. Any auto-reinit hook = mechanically identical to P5 (getDb() self-heal). Not a distinct mechanism.

**Per-table owning map:** agent_signals→schema-news.ts initNewsTables; sbv_rates_history+commodity_prices+commodity_prices_history+imf_indicators→schema-macro.ts initMacroTables; positions→schema-portfolio.ts initPortfolioTables; daily_ohlcv→schema-market-data.ts initMarketDataTables. All tables already in canonical initDatabase(). No DDL additions needed — only DEFAULT reconciliation on 3 drift tables.

**Dev task files:** schema-news.ts (rag_analyses), schema-system.ts (agent_feedback + signal_quality_audit), schema.ts (getDb() self-heal re-apply), setup.ts (await initDatabase() preload init).

**Brief:** `docs/architecture-briefs/2026-06-09-fu-schema-drift-p8-spike.md`

**Gate:** native fail+error must DROP below 629 AND agent_signals/sbv_rates_history/positions/commodity_prices* buckets shrink toward zero.

## 2026-06-09T03:12Z — FU-SCHEMA-DRIFT-P7: recurring-bug spike, premise correction + 7 destroyers identified

**Task:** FU-SCHEMA-DRIFT-P7 (SPIKE, 120m, zone: apps/mcp-server/, 5th touch CI-test-schema surface)

**Key finding — premise correction:** P7 task said "canonical initDatabase() NEVER CREATES these tables." EMPIRICALLY FALSE. Full audit of all 9 schema slices: all 16 residual tables (agent_signals, sbv_rates_history, positions, commodity_prices*, imf_indicators, evidence_scores, cron_job_runs, daily_ohlcv, vnstock_trading_stats, signal_quality_audit, insider_transactions, deep_fetch_queue, watchlist, vps_service_health) ARE present in canonical initDatabase() via their respective slices. Adding DDL would be no-op.

**True root cause:** 7 test files call closeDb() without ever calling initDatabase() — identified via Python analysis stripping block comments (grep missed block-comment false positives). Files at run positions [53], [77], [236], [574], [638], [751], [814] destroy the shared singleton permanently. After position [814] (283-portfolio-conviction-batch), 180 pure-singleton files across positions [815]–[1032] get empty :memory: DB → production modules with internal getDb() calls hit "no such table". P6 fixed positions [508] (1527) only — destroyers at [574]/[638]/[751]/[814] were never addressed.

**Why P6 had zero improvement:** After 1527 reinit at [508], destroyers at [574] (182-portfolio-risk) → [638] (1869b) → [751] (231-signal-validator) → [814] (283-conviction-batch) killed the singleton again. Pure-singleton files after [814] still got empty DB.

**Correct fix:** Add `afterAll(async () => { closeDb(); await initDatabase(); })` to ALL 7 close-no-init files. NO production code changes. Test files only.

**Expected drop:** 85-95% of 629 failures. Estimated native fail+error < 50.

**Brief:** `docs/architecture-briefs/2026-06-09-fu-schema-drift-p7-spike.md`

**Files (dev task):** 103-job-market-scan.test.ts, 1076-market-scan-noise-retirement.test.ts, 1291-foreign-flow-duplicate-dedup-migration.test.ts, 182-portfolio-risk.test.ts, 1869b-watchlist-threshold-wiring.test.ts, 231-signal-validator-integration.test.ts, 283-portfolio-conviction-batch.test.ts — each gets `afterAll(async () => { closeDb(); await initDatabase(); })`.

## 2026-06-09T05:45Z — FU-SCHEMA-DRIFT-P6: recurring-bug spike, slice DDL audit + P5 regression diagnosis

**Task:** FU-SCHEMA-DRIFT-P6 (SPIKE, 120m, zone: apps/mcp-server/)

**Key finding:** P6 task hypothesis DISPROVED. All 9 standalone slice DDLs are column-correct for `created_at`. No slice omits `created_at` on any table where consuming production code queries it. The P5 `created_at ×3` regression was from a different mechanism: self-heal created tables with `TEXT NOT NULL` (no DEFAULT) on `agent_feedback`, `signal_quality_audit`, `rag_analyses`; Contract-B tests that previously inlined looser DDL hit NOT NULL violations.

**Drift table completed:** 64 tables across 9 slices. Tables with `created_at` in slice but NO DEFAULT: `rag_analyses`, `agent_feedback`, `signal_quality_audit`, `broker_sanctions`. `telegram_reports.created_at` is INTEGER (epoch) not TEXT — pre-existing semantic drift.

**Direction chosen:** (b) — 3 Contract-A singleton-killer files modify `afterAll(() => closeDb())` to `afterAll(async () => { closeDb(); await initDatabase(); })`. Uses full canonical `initDatabase()` (not partial 9-slice). Zero production code changes. 3 files only.

**Brief:** `docs/architecture-briefs/2026-06-09-fu-schema-drift-p6-spike.md`

**Files (dev task):** 084-tool-market.test.ts, 089-tool-macro.test.ts, 1527-schema-slices.test.ts — 1 change each (afterAll async reinit). `182-portfolio-risk.test.ts` unchanged.

**Gate:** native bun test fail+error < 629.

## 2026-06-09T04:00Z — FU-SCHEMA-DRIFT-P5: recurring-bug spike, full-suite singleton pollution

**Task:** FU-SCHEMA-DRIFT-P5 (SPIKE, timebox 120m, zone: apps/mcp-server/)

**Premise correction:** Phase 4 isolation-audit approach was empirically wrong. P4 dev ran 44+ pure-singleton files referencing the 6 failing table classes in isolation — all pass (rc=0). The residual 629 failures are NOT a per-file schema-missing problem.

**Pollution mechanism:** bun test 1.3.13 = single-process sequential. `_db` singleton in schema.ts shared across all 1033 test files. Contract-A files with `closeDb()` in `afterAll` nullify `_db` (084-tool-market, 089-tool-macro, 1527-schema-slices, 182-portfolio-risk). Production modules with non-injectable `getDb()` calls (macroStatsStore lines 36/118, positionTools lines 218/260/299) then receive a fresh empty `:memory:` db. Their `try/catch` guards return `[]` silently; test assertions fail on empty result.

**Decision: Option (b) self-healing getDb().** Modify `getDb()` in `schema.ts`: when creating fresh `:memory:` db, synchronously call `initMarketDataTables`, `initAlertsTables`, `initMacroTables`, `initPortfolioTables`, `initNewsTables`, `initBriefingsTables`, `initSystemTables`, `initBacktestingTables`, `initAgmPlanTables`. Excludes `initFinancialReportsTables` (RISK-2 view compile). **Bounded file set: 1 file, 1 function.**

**Verification gate:** native `bun test` fail+errors < 629 (native-to-native; marker method over-counts ~2×).

**PM task:** `FIX-SCHEMA-DRIFT-P5-SELFHEAL` → dev-mcp-server, timebox 30m, 1 file.

**Brief updated:** Phase 4 REVISED addendum appended to `docs/architecture-briefs/2026-06-09-ci-test-schema-fixture-spike.md`

## 2026-06-08T23:10Z — CI-TEST-SCHEMA-FIXTURE-SPIKE: recurring-bug, schema-fixture design

**Task:** CI-TEST-SCHEMA-FIXTURE-SPIKE (SPIKE, M, zone: apps/mcp-server/)

**Root cause of 9454baad regression (+219 failures):** Three independent failure classes from mechanized injection: E1 (32 bare CREATE TABLE collide with injected init), E2 (~200 missing columns in inline DDLs), E3 (~32 NOT NULL violations). 176 test files carry self-contained partial inline DDL — injection is structurally incompatible.

**Decision: Two-contract model.** Contract A (initDatabase() singleton, idempotent) for integration tests; Contract B (explicit inline DDL, IF NOT EXISTS, complete per-SUT columns) for unit tests. No injection sweep ever. Per-failure-class additive fixes.

**Corpus inventory:** 1033 test files; 494 pure-singleton (47%), 300 isolated-inline-only (29%), 181 singleton+initDatabase (17%), 58 hybrid (5%). Top divergence: watchlist (116 files), rag_analyses (64), daily_ohlcv (73).

**Brief:** `docs/architecture-briefs/2026-06-09-ci-test-schema-fixture-spike.md`

**NEXT:** PO receives brief_complete → PM decomposes into FIX-SCHEMA-DRIFT-P1/P2/P4 tasks → dev-infrastructure.

## 2026-06-08T21:35Z — SPIKE-CI-COVERAGE-OFF-MECHANISM: recurring-bug, CI coverage suppression

**Task:** SPIKE-CI-COVERAGE-OFF-MECHANISM (SPIKE, S, zone: apps/mcp-server/ + .github/)

**Root cause:** bun 1.3.13 `--coverage` is boolean-only (no `=value`). `--coverage=false` = parse error; separate bunfig via `-c` or env var does NOT override default.

**Decision: A1.** `coverage=false` in bunfig.toml + bare `bun test` → no coverage table, clean exit. Local recovery: `scripts/test-coverage.sh` (trap-based bunfig rename+restore). All 4 files changed and in working tree. Dev-mcp-server to verify + commit.

**Brief:** `docs/architecture-briefs/2026-06-08-ci-coverage-off-mechanism.md`

## 2026-06-08T20:30Z — CI-TEST-ISOLATION-SPIKE: bun-test 639-failure root-cause diagnosis

**Task:** CI-TEST-ISOLATION-SPIKE (SPIKE, M, HIGH, zone: apps/mcp-server/)

**Findings:** CI has NEVER been green (703 fails trending to 639). THREE independent failure classes:
- Class A (~80–150): Injectable seam removed from `macroTools.ts` `get_macro_snapshot`; tests still pass obsolete `_testSbvClient`/`_testCommodityClient`. Also: `sbv.ts` constants baked at import time.
- Class B (~300–400): Real code not yet implemented — TDD RED tests as living spec.
- Class C (~100–150): Network isolation — 5000ms timeouts, no external API access.

**Decision:** Rename to CI-BUN-TEST-MULTI-CLASS-FIX. Three sequential fix batches: Fix 1+2 (Class A), Fix 3 (Class C — CI skip guards), Fix 4 (Class B — per-test triage).

**NEXT:** PO triage needed for Class B (retire vs implement per test).

## 2026-06-08T13:22Z — ARCH-DFR-P2 + ARCH-DFR-P3: directed design, Phase 2 + Phase 3

**Tasks:** ARCH-DFR-P2 (deep-fetch pipeline, 3-zone split) + ARCH-DFR-P3 (FTS+RRF hybrid search)

**P2 design:** Gate (3-signal OR: ticker/sector/impact>=7), Queue (deep_fetch_queue + deep_fetch_stats), Executors (VPS max 10/cycle + main-server Playwright max 5/cycle), Re-index (`_deep` suffix, no delete), Zone split (mcp-server / vps-crawls / mainserver-crawls).

**P3 design:** FTS 2-call pattern, Hybrid `.vector().text()` + RRF reranker, mcp-server `hybrid?: boolean` field, Opt-in (pollNews vector-only; CHEF/bctc-analyst hybrid=true).

**Briefs:** `docs/architecture-briefs/2026-06-08-dfr-p2-deepfetch-blueprint.md` + `...dfr-p3-hybrid-search-blueprint.md`

**NEXT:** po → ba (decompose P2 3-way + P3) → pm (atomic tasks) → dev-{mcp-server,vps-crawls,mainserver-crawls,rag-service} → qa.

## 2026-06-08T08:20Z — A20-EVENTLOOP-STARVATION-ARCHITECT: event-loop blocking in PdfplumberExtractionEngine

**Task:** A20-EVENTLOOP-STARVATION-ARCHITECT (UNBLOCK, M, P1, 4th recurrence, zone: apps/pdf-extractor/)

**Root cause:** `extract_tables()` + `extract_text_ocr()` declared `async def` but run pdfplumber + pytesseract synchronously on uvicorn event loop. Blocks /health during OCR. cpus:2.0 makes block run faster, does NOT allow interleave.

**Decision: Option B — asyncio.to_thread() wrappers.** Extract sync logic to `_extract_tables_sync()` + `_extract_text_ocr_sync()` helpers; thin async wrappers. No caller changes, no RSS impact.

**AC:** /health returns 200 within 5s WHILE /extract OCR job in flight (>=15min persistent, multi-probe).

**NEXT:** dev-pdf-extractor implements → targeted rebuild (NEVER down&&up) → FIX-AUDITOR-A20-MULTIPROBE

