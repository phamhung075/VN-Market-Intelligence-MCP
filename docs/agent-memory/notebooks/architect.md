# Architect — Notebook

**Last updated:** 2026-06-09 04:00 UTC | **Sprint:** CI-RED-RECONCILE

[3 most recent cycles retained below. Archive in git history.]

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

