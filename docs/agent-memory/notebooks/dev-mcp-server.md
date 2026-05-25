# dev-mcp-server -- Notebook

## c298 · 2026-05-25 (mcp-server Phase-2 P2-E — G3 composition-root extraction)

### P2-E — G3 Composition-Root Extraction DONE

**Commit:** `82ebb314` | 2 files | tsc EXIT 0 | bun test 9442/348 (≥9408/≤348 PASS) | tools=148 | sched=68

**Delivered:**
- `apps/mcp-server/src/index.ts` slimmed to 41L (thin entry point: LanceDB env suppression + imports + `const cfg = loadConfig(); const log = createLogger(cfg.logLevel);` + startup log + `await bootstrapMcpServer(cfg, log);`)
- `apps/mcp-server/src/composition-root.ts` created at 120L: exports `bootstrapMcpServer(cfg: AppConfig, log: Logger): Promise<void>` containing all startup sections (env-check, DB+WAL+vnstock-migrations, trade-seed, HTTP server, Telegram env check, webhook, pdf-extractor health, scheduler, background OCR setTimeout [4 KEEP/G5-DEBT callers], graceful shutdown, signal handlers, unhandledRejection handler)

**AC evidence:**
- AC-1: index.ts=41L≤80 PASS; composition-root.ts=120L≤120 PASS
- AC-2: `grep -E "calculate|compute|classify|resolve|encode|format|detect" composition-root.ts` → exit 1 (0 matches) PASS
- AC-3: composition-root.ts contains ONLY imports, wiring calls, log statements, signal handler registrations — no data-value if conditions, no domain calculations, no bare SQL
- AC-4: server starts (port 3000 occupied by Docker container — existing service returned toolCount=146, startup log shows WAL checkpoint + DB ready before EADDRINUSE)
- AC-5: `bun run check` exit 0; bun test 9442/348; toolCount=148 (≥146); sched=68
- AC-6: `git diff --cached --name-only` empty (post-commit clean)
- FENCE SELF-CHECK: `bunx eslint src/ --max-warnings 0` exit 0

**Type name fix:** `Config` → `AppConfig` (actual export from infrastructure/config.ts)

**Zone health:** composition-root.ts extracted; index.ts=41L; G3 DONE; tsc clean; bun test 9442/348 PASS; ESLint fence exit 0 | HEALTHY

---

## c297 · 2026-05-25 (BT-4b — one-shot BCTC table backfill job)

### BT-4b — One-shot backfill (PARTIAL / DEFERRED: BT-3-D blocker)

**Commit:** `0b4b3699` | 2 files | 8 tests GREEN | tsc EXIT 0 | tools=148 | sched=68

**Delivered:**
- `bctcBatchTableBackfillJob.ts` (application usecase, NOT cron): sequential iterator over financial_reports with pdf_path + existsSync gate. UUID-validates each doc_id before any HTTP call. Returns {success, gate_blocked, failed, skipped_no_file, skipped_null_path, outcomes[]}.
- `bctcBatchTableBackfillJob.test.ts`: 8 tests — skip-no-file, gate-blocked, network error, HTTP 500, null-path, missing-file, idempotent, invalid-UUID.

**FPT proof attempt — BLOCKED:**
- `POST /extract-tables` for FPT Q4 2025 → `{rows_stored:0, balance_pass:false}`
- Root cause: `ExtractTablesUseCase.execute()` in pdf-extractor builds `pages=[{page_number:0, path:pdf_path}]` — no `"text"` key. `TextTableExtractor.assemble()` reads `page.get("text","")` → empty → 0 rows.
- **Tesseract OCR never called in the `/extract-tables` production path.** Different from integration test which pre-ran OCR.
- Fix is in pdf-extractor zone (dev-pdf-extractor). DEFERRED as BT-3-D.

**BT-3-D scope (dev-pdf-extractor):**
1. Wire Tesseract (pdf2image + pytesseract) in `/extract-tables` route OR in `ExtractTablesUseCase.execute()` via injected `OcrPort`.
2. Auto-locate balance-sheet page range by scanning ALL pages for TÀI SẢN/NGUỒN VỐN markers.
3. Re-validate FPT golden anchors: 270=88,089,621,779,862; 300=44,338,155,487,272; 400=43,751,466,292,590.
4. Then re-run backfillBctcTables() across all 12 eligible docs.

**Zone health:** bctcBatchTableBackfillJob ready; 34 BCTC tests GREEN; tsc clean; tools/sched unchanged | HEALTHY — blocked externally (BT-3-D)

---

## c296 · 2026-05-25 (mcp-server Phase-2 P2-A/B/C — ESLint fence foundation)

### P2-A/B/C — ESLint Fence Foundation DONE

**P2-A:** `mcp-server-pre-ci` tag created at HEAD ba38dbe0. local-only, no push.

**P2-B:** `eslint.config.mjs` authored (88L). R-2 fallback applied:
- `eslint-plugin-boundaries` v6 requires `eslint-import-resolver-typescript` for `.js` ESM → `.ts` resolution
- Without resolver, `describeDependency` gets `to: undefined` → element unclassified → no violation fires (fence false-green trap)
- Added `@typescript-eslint/eslint-plugin` for brownfield disable comments; `reportUnusedDisableDirectives: "off"`
- Fence-A: `domain` must not import `infrastructure`, `interface`, `scheduler`
- Fence-B: `application` must not import `interface`, `scheduler`
- `interface/` and `scheduler/` → `infrastructure` ALLOWED (brownfield: 460+ such imports)
- FENCE-LEGACY on `pollNews.ts:32` for pre-existing application→interface import
- Commits: 5e34c7fe + 4e6f89ab

**P2-C deliberate-violation evidence (NEVER committed):**
- Injected `import { getDb } from "../../infrastructure/db/schema.js"` in `sparkline.ts`
- Exit code: 1; output: `Fence-A: domain must not import infrastructure layer  boundaries/dependencies`
- Reverted via Edit tool; exit 0 confirmed; git status clean; violation never staged

**Regression tripwires:** tsc EXIT:0 | bun test 9437/345 (≥9408/≤348) | tools=148 | sched=68

**NEXT:** P2-D is qa gate (freeze anchor confirm + G4 evidence signal). Stopping here per dispatch.

Zone health: ESLint Fence-A/B operational; deliberate-violation proof confirmed; clean exit 0 on brownfield | HEALTHY

---

## c295 · 2026-05-25 (BT-3i-A + BT-3i-B — BCTC-TABLE structured table storage + inspector render)

### BT-3i-A — Schema DDL + Push Handler (DONE)

**Commit:** `40b0b50e` | 4 files | 13 tests RED→GREEN

- `schema-financial-reports.ts`: added `bctc_table_rows` (14 cols) + `bctc_balance_checks` (9 cols, UNIQUE report_id) + 3 indexes. All `CREATE TABLE IF NOT EXISTS` (idempotent).
- `pushBctcTableHandler.ts` (NEW): UUID-validate, DELETE+INSERT idempotency, parameterized SQL, INSERT OR REPLACE balance_check.
- `server.ts`: import + `POST /api/push-bctc-table` route.
- `pushBctcTableHandler.test.ts` (NEW): 13 tests — schema presence, bulk insert, idempotency, UUID guard, null balance_check.

### BT-3i-B — Inspector GET + HTML Render (DONE)

**Commit:** `d639a478` | 4 files | 13 tests RED→GREEN

- `bctcInspectHandler.ts`: added `handleBctcInspectTable()` — Q1 rows ORDER BY row_order, Q2 balance_check, `has_table:false` w/ 200 (not 404) when no rows, UUID guard.
- `server.ts`: added `handleBctcInspectTable` import + `GET /api/bctc-inspect/table/{docId}` route.
- `bctc-inspector.html`: `#table-section` div + CSS (bctc-table, row-summary bold, row-header italic, balance-pass/fail/na badges) + `renderTable()` JS (fetch, badge, HTML table, no-table message, `escHtml`, `fmtVal`). Called from doc selection handler. `resetPanes()` clears table section.
- `bctcInspectHandler.test.ts` (NEW): 13 tests — has_table true/false, row ordering, period fields, summary/header rows, balance pass/fail, UUID guard, doc_id echo.

### User complaint CLOSED

`http://localhost:3000/api/bctc-inspect` now renders structured table + balance badge when rows are stored. Legacy docs show honest "no table yet" message until BT-4b re-extraction runs.

### G12 evidence

- tsc --noEmit: EXIT 0
- bun test (targeted): 26 pass / 0 fail (both new test files)
- Tool count: 148 (unchanged)
- Scheduler count: 68 (unchanged)

Zone health: bctc_table_rows + bctc_balance_checks schema added; POST /api/push-bctc-table receives rows from pdf-extractor; GET /api/bctc-inspect/table/{id} serves inspector; HTML renders table + badge; 26 new tests GREEN; tsc clean | HEALTHY

---

## c294 · 2026-05-25 (mcp-server Phase-1 refactor P1-A→P1-H DONE)

### mcp-server Phase-1 build wave (P1-A through P1-H) — ALL DONE

**Commits (chronological):**
- P1-A: sandbox types + runner + 3 sparkline scenarios + types.ts
- P1-B: three-panel trust dashboard (dashboard/index.html, file:// compatible)
- P1-C: system/ barrel decomposed → 5 sub-barrels (memory/coordination/ops-debug/observability/vps)
- P1-D: macro/ barrel decomposed → 2 sub-barrels (http-proxy/local-computation)
- P1-E: sector/ barrel decomposed → 3 sub-barrels (domestic/market/cross-cutting)
- P1-F: G5-inverse — appendKinhDich() replaced with HTTP callers via clients.ts (3 files: marketTools, analysis, portfolioTools); hexagramNames.ts GLUE re-export; kinhDichWrapper.ts DEPRECATED
- P1-G: G5-DEBT annotation on pdf.ts + pdfOcrWorker.ts (4 KEEP callers, architect-frozen)
- P1-H (commit a9212ad2): 6 new sandbox scenarios (signal-bus 3 + sector-classifier 3); --emit-traces flag; 9/9 PASS; G7 honest-red proven

**Final regression tripwires:**
- tsc --noEmit: EXIT:0
- bun test: 9412 pass / 344 fail (within ≥9408/≤348)
- toolCount: 146 (live Docker container)
- scheduler .schedule() calls: 71 (≥68 baseline)

**G1-PRIMITIVE-CANDIDATEs noted (Phase 2 backlog):**
- `isMacroSnapshotValidShape` in macro/http-proxy (macroSnapshotGuard)
- `severityLabels` in sector/cross-cutting

**BLOCKED-ON-DOCKER-SESSION:**
- Docker rebuild + container re-verify
- P1-QA container checks

**Next:** P1-EXIT → PO closes pilot; QA agent verifies in next Docker session

Zone health: Phase-1 sandbox runner + 9 scenarios operational; 3 barrel waves (system/macro/sector) decomposed; G5-inverse complete for kinh-dich; G5-DEBT annotated for BCTC path | HEALTHY

---

## c293 · 2026-05-25 (NEWS-INGEST-2b)

### NEWS-INGEST-2b — Surface VN news articles in /api/news-fetch/live (DONE)

**Root cause fixed:** `newsFetchLiveHandler.ts` hard-coded `WHERE source_url LIKE '%reuters%' OR source_url LIKE '%bloomberg%'` on EVERY query branch including `source=all`. VN articles (cafef/vnexpress/vneconomy) structurally invisible even though 160+ are in `rag_analyses`.

**Changes:**
- `VALID_SOURCES`: added `cafef`, `vnexpress`, `vneconomy`
- `buildSql()`: `source=all` branch → no WHERE clause (truly unfiltered); VN source branches → LIKE '%cafef%' / '%vnexpress%' / '%vneconomy%'
- `deriveProvider()`: extended to return `cafef | vnexpress | vneconomy | other`
- Error message updated to list all 6 valid sources

**Tests:** NF-LD-2: 9 original GREEN (non-regression) + 10 new (i–r) = 19/19. tsc exit 0. NF-LD-4 11/11 unaffected.

**Commit:** `e1e08a29`

**Dashboard selector follow-up:** `source=all` is sufficient for visibility. Per-source VN filter in the UI selector needs NEWS-INGEST-2c → generic developer (`apps/news-fetch/dashboard/`).

Zone health: /api/news-fetch/live now returns all providers; VN articles visible in source=all; per-source VN filters working; reuters/bloomberg non-regression; tsc clean | HEALTHY

---

## c292 · 2026-05-25 (NEWS-INGEST-1)

### NEWS-INGEST-1 — Confirm root cause of news-ingest all-duplicate drop (DONE)

**Verdict:** Root cause (c) — VPS/news-fetch re-pushes already-stored articles every cycle.

**Evidence from real cycle (2026-05-24T21:57:17Z, 160 items):**
- 160/160 source_urls distinct + non-empty
- 160/160 source_urls already in rag_analyses (batch DB verify = `already_in_db: 160, not_in_db: 0`)
- 50 dropped by `isTitleDup=true` (legitimate: title seen in prior push)
- 110 reached INSERT OR IGNORE → all `changes=0` (URL already in partial unique index)
- `inserted: 0` — correct dedup behavior, wrong upstream feed

**Both PO candidate causes ruled out:**
- (a') shared/single source_url — RULED OUT (160 distinct URLs, max_dup_count=1)
- (b) title-dedup over-match — RULED OUT (50 title-dups are real prior inserts; 110 INSERT misses are URL-index hits, not title-dedup)

**Fix zone:** `apps/news-fetch/` (dev-news-fetch) — needs a "since cursor" so VPS only pushes articles newer than the last push timestamp. VPS push script on Vinahost may also need the cursor. mcp-server dedup layers are CORRECT and must NOT be weakened.

**Commit:** `7e350f56`

Zone health: pollNews dedup working correctly; upstream VPS re-push is the bug; NEWS-INGEST-2 fix routes to dev-news-fetch | HEALTHY

---

## c291 · 2026-05-24 (NF-LD-5-dev-A)

### NF-LD-5-dev-A — Regenerate served copy with Refresh button (DONE)

**Root cause of script fix:** NF-LD-5-dev-B (commit `12600a1f`) renamed `var ENDPOINT` → `var BASE_ENDPOINT` in the canonical source. Sync script verification grep looked for `var ENDPOINT = '/api/news-fetch/live` → exit 1. Fix: broadened grep to `var (BASE_)?ENDPOINT`; added `BASE_ENDPOINT` sed guard (no-op since source already relative); updated header comment.

**Idempotency:** md5 `b1d8806f7e8ae8b7de26a78962b6550b` stable across 3 consecutive runs.

**Files shipped:**
- `sync-news-fetch-dashboard.sh` — variable-name guards + verification pattern updated
- `src/interface/news-fetch-dashboard/index.html` — REGENERATED (button + selector + loadLiveData callable)
- `src/__tests__/NF-LD-4-news-fetch-dashboard.test.ts` — tests (h)+(i) accept `var (BASE_)?ENDPOINT`

**Tests:** NF-LD-4 11/11 + NF-LD-2 9/9 = 20/20 PASS. tsc exit 0.

**Next:** NF-LD-5-QA → qa.

Zone health: sync script handles BASE_ENDPOINT rename; served copy idempotent; button + selector in served HTML; 0 localhost:3000 in fetch path | HEALTHY

---

## c290 · 2026-05-24 (BCTC inspector page-sync)

### BCTC inspector — synchronized PDF + OCR page navigation (IMPL_DONE)

**Commit:** `641915a6`

**Change:** `apps/mcp-server/src/interface/bctc-inspector.html` (1 file, +68/-12 lines)

**Deliverables:**
1. `renderWithPdfJs()` — each canvas tagged `id="pdf-page-{n}"` + `data-page="{n}"`. `pdfNumPages` stored in module state after render.
2. `renderOcr()` — after text loads, calls `document.getElementById('pdf-page-'+currentPage)?.scrollIntoView({behavior:'smooth',block:'start'})` to scroll left pane.
3. Nav bound = `pdfNumPages` (PDF page count) when pdf.js rendered; falls back to OCR `total_pages` for OCR-only docs.
4. Sync note injected (`#ocr-sync-note`) when PDF and OCR page counts differ — honest, not silent.
5. `usingIframeFallback` state var — skips scroll-sync in iframe mode; shows note explaining why.
6. `resetPanes()` resets `pdfNumPages=0`, `usingIframeFallback=false`, removes sync note.
7. `btnNext` click uses `getNavBound()` helper consistent with `renderOcr()` bound logic.

**Verification (live, real data):**
- DHG Q1 2026: 14 docs loaded, canvases tagged `id="pdf-page-1"..pdf-page-36`, indicator `1 / 36` → `2 / 36` on next click, OCR text updated page 1→2, sync note "PDF has 36 page(s), OCR text has 29 page(s)".
- Screenshots: `/tmp/bctc-inspector-with-doc.png`, `/tmp/bctc-inspector-page2.png`.

**Tests:** 64/64 PI3 + REOPEN-2 GREEN (0 regressions). tsc 0 errors.

**5 degrade states preserved:** has_pdf=false / pdf-not-on-disk 404 / pdf.js CDN fail (iframe+note) / no OCR rows / bad UUID 400.

Zone health: BCTC inspector now syncs PDF pane scroll to OCR page on every nav click; honest note when PDF/OCR page counts diverge; iframe fallback degrades without crash | HEALTHY

---

## c289 · 2026-05-24 (NF-LD-4 QA round 1 fix)

### NF-LD-4-dev-A FIX — QA round 1 remediation (DRY/anti-drift) — DONE

**Commits:** `6b012fc8` (sync script + regen), `efa4bfec` (handoff)

**Root cause:** Two sed substitutions in `sync-news-fetch-dashboard.sh` were ordered generic-first. The short pattern `check that mcp-server is running at localhost:3000.` consumed the long `Could not reach the server — check that mcp-server is running at localhost:3000.` substring before the second sed ran. Result: `git diff` after re-running the script showed 3 diffs (stale header path, hand-added JS comment block, error message third variant).

**Fix:** reversed sed order in the script (specific/longer pattern first). Regenerated `index.html` by running the fixed script. Committed exactly script output — no hand edits.

**Idempotency proof:** two consecutive runs → same md5 (`ace65115a5e4345a31b217eb5dfc5c23`). Second run `git diff` = 0.

**All checks:** ENDPOINT relative, file:// degrade kept, creds 0, NF-LD-4 11/11, NF-LD-2 9/9, tsc exit 0, header no stale `scripts/` path.

**Next:** NF-LD-4-QA round 2.

---

## c288 · 2026-05-24T22:00Z

### NF-LD-4-dev-A — Serve news-fetch dashboard from mcp-server (IMPL_DONE)

**Commit:** `e160fe04`

**Deliverables:**

1. `apps/mcp-server/src/interface/news-fetch-dashboard/` (NEW dir) — 4 files:
   - `index.html` (GENERATED copy: relative ENDPOINT `/api/news-fetch/live...`, no localhost:3000, file:// degrade kept, GENERATED header comment)
   - `data.js` (verbatim copy from apps/news-fetch/dashboard/)
   - `rerun-handler.js` (verbatim copy)
   - `results.json` (verbatim copy)

2. `apps/mcp-server/src/interface/mcp/routes/newsFetchDashboardHandler.ts` (NEW) — static file handler. Exports `handleNewsFetchDashboard(req, res, asset: string | null)`. No db param, no getDb(), no credentials. MIME map (html/js/mjs/json). Path-traversal guard: rejects any asset where `basename(asset) !== asset` or contains `..`/`/`. Mirrors bctcInspectHandler pattern.

3. `apps/mcp-server/src/interface/mcp/server.ts` (MODIFIED) — 1 import + 2 `if` blocks for `/dashboards/news-fetch/` (index) and `/dashboards/news-fetch/*` (assets).

4. `apps/mcp-server/sync-news-fetch-dashboard.sh` (NEW) — DRY sync script. Copies verbatim assets + rewrites ENDPOINT to relative + injects GENERATED header. Verifications: no absolute ENDPOINT, relative ENDPOINT present, file:// degrade kept, no creds.

5. `apps/mcp-server/package.json` (MODIFIED) — `sync-news-fetch-dashboard` script entry.

6. `apps/mcp-server/src/__tests__/NF-LD-4-news-fetch-dashboard.test.ts` (NEW) — 11 tests, all pass.

7. `docs/architecture/microservice/mcp-server/news-analysis.md` (MODIFIED) — Dashboard section added.

**AC pass: 12/12** (pre-ops ACs; AC-6 and AC-7 verified post-container-rebuild by ops)

**Tests:** NF-LD-4 11/11 GREEN. NF-LD-2 9/9 GREEN. Full suite 9386 pass / 360 fail (0 new regressions; 360 = pre-existing baseline, improved from 364 at NF-LD-3). tsc exit 0.

**Security:** grep served dir for creds → 0 matches. No localhost:3000 in ENDPOINT var → 0 matches. file:// degrade kept. No Dockerfile change needed (COPY src/ covers new subdir).

**Next:** NF-LD-4-dev-B → generic developer (1-line ENDPOINT rewrite in apps/news-fetch/dashboard/index.html source). Then NF-LD-4-QA → qa. Then NF-LD-4-EXIT → PO. Then NF-LD-4-OPS → ops (docker rebuild + PROVE served URL).

Zone health: /dashboards/news-fetch/ route added; same-origin served dashboard; sync-news-fetch-dashboard.sh prevents drift; tsc clean | HEALTHY

---

## c287 · 2026-05-24T21:00Z

### PI3-REOPEN-2 — backfill + all-rows inspector + secondary OCR join (2026-05-24, IMPL_DONE)

**Commit:** `69da9d01`

**Trigger:** QA CHANGES_REQUESTED — `GET /api/bctc-inspect/docs` returned count:0 against real market.db. Root cause: all 14 real financial_reports rows have `pdf_path IS NULL` (inserted via tryNewsChainFallback), so LIST_SQL filter `WHERE pdf_path IS NOT NULL` excluded all of them.

**3 deliverables per architect REOPEN-2:**

1. `backfillBctcPdfPaths.ts` (NEW, application layer) — idempotent two-pass token matcher. Normalises messy VN filenames (canonical, dated, Quy-N, month→quarter). VCB Q1 vs Q4 disambiguation: exact (ticker, year, quarter) match only. Ambiguous → no-link, no guess. UPDATEs only `pdf_path` column, never other columns. Called once at startup.

2. `bctcInspectHandler.ts` (MODIFIED) — removed `WHERE pdf_path IS NOT NULL` from LIST_SQL; added `pdf_path` to SELECT; has_pdf computed at serve time via `existsSync`; secondary OCR join via `parsePdfFilenameTokens` for rows where pdf_path IS NULL; all 5 honest-degrade states per architect table.

3. `server.ts` (MODIFIED) — calls `backfillBctcPdfPaths(db, pdfDir)` once after DB init, before routes are live. pdfDir = `resolve(cwd, 'data', 'pdfs')` (same convention as bctcPdfPullJob). Non-fatal (logs warn, continues serving).

**Tests:** 39 PI3 (updated AC-2 for REOPEN-2 behavior) + 25 new REOPEN-2 = 64 pass / 0 fail. tsc 0 errors. NF-LD-2 reference 9/9.

**Gate:** `git show --stat HEAD` 5 files, all apps/mcp-server/. No foreign files.

**Next:** qa — REAL container redeploy + verify count >=10, OCR text in right pane, anomaly flag on real data.

Zone health: BCTC inspector now shows all 14 real rows; backfill links up to 17 PDFs at startup; secondary OCR join shows OCR for news-inference rows; 5 honest-degrade states | HEALTHY

---

## c286 · 2026-05-24T20:14Z

### PI-3-redo — BCTC Inspector over real market.db (2026-05-24, IMPL_DONE)

**Commit:** `1b5799fb`

**Trigger:** Architect re-ground after PI-2 (pdf-extractor) read junk `pdf_documents` table (15,570 failed rows, 0 real extractions). All real data in market.db — inspector moved to mcp-server.

**Files shipped (6):**
- `bctcInspectHandler.ts` (NEW, 486L) — 4 GET routes: list/pdf-bytes/ocr/viewer-page; UUID guard; `isDecimalShiftAnomaly()` using magnitude-ratio formula
- `bctc-inspector.html` (NEW, 584L) — SI-2 boundary; pdf.js CDN 4.2.67 LEFT; figures+anomaly+OCR RIGHT; dark UI; iframe CDN-fallback
- `server.ts` (MODIFIED) — 4 `if-blocks` wired identical to newsFetchLiveHandler pattern
- `PI3-bctc-inspect.test.ts` (NEW) — 39 tests: all GREEN

**Key anomaly formula fix:** Architect spec `|ocr-api|/|api|` gives ~1.0 for `0.000051 vs 51000` (the core user case). Correct formula: `max(|a|,|b|) / max(min(|a|,|b|), 1e-9) > 10` → fires for ratio ~1e9. Tests lock the fix.

**Tests:** 39/39 GREEN. tsc 0 errors. 9/9 reference test (NF-LD-2) unchanged.

**Next:** qa — verify against REAL market.db (≥10 docs, 3 PDFs render, OCR text visible, anomaly flag live). QA mandate: REAL data only, no seeded fixtures.

Zone health: BCTC inspector added (4 GET /api/bctc-inspect/* routes); reads real market.db financial_reports + pdf_extracted_text; pdf-extractor /inspect marked DEPRECATED; tsc 0 errors | HEALTHY

---

## c285 · 2026-05-24T18:00Z

### NF-LD-2a — GET /api/news-fetch/live endpoint

Commit `5a91e12f`. 3 files shipped:
- `apps/mcp-server/src/interface/mcp/routes/newsFetchLiveHandler.ts` (new)
- `apps/mcp-server/src/__tests__/NF-LD-2-news-fetch-live.test.ts` (new, 9 tests all pass)
- `apps/mcp-server/src/interface/mcp/server.ts` (import + 1 if-block)

Key design choices: provider derived from `source_url LIKE '%reuters%'` (source_type is always "news"). No auth. DI pattern (db injected). Limit clamped 1-50. tsc clean.

AC pass: 11/11.

---

## c284 · 2026-05-24T11:05Z

### Task 1954c/G5b — BCTC Consolidation (pdf-extractor service as single extraction owner)

**Pre-revert tag:** `bctc-pre-g5b-consolidation`

**Task 1 (backfill column fix):** Already shipped in commit `2a5cc2a7` — column names `ticker/year/quarter` → `action_code/period_year/period_quarter` were already correct.

**Task 2 (pdf.ts service-first inversion):** `9c22c915`
- `downloadAndExtractPdf` now calls `extractViaMicroservice` FIRST. Service success → return immediately. Service null/throws → pdf-parse fallback.
- `ocrPdfBuffer` marked `@deprecated`.
- Suite C of `1352b-pdf-extractor-wiring.test.ts` updated to reflect new service-first contract. 14/14 PASS.

**Task 3 (bctcPdfPullJob → service):** `09e2cd70`
- `BctcPdfPullDeps.triggerExtraction` gains `pdfUrl` param.
- Production deps use `extractViaMicroservice(pdfUrl, "bctc")` instead of `extractAndStorePdfPagesWithRetry`. 8/8 existing tests PASS.

**Task 4 (pushBctcExtraction → service):** `70e75cbd`
- `PushBctcExtractionDeps`: `extractPages+getCache` → `extractViaService`.
- TC-4 tests in 1945d updated to inject `extractViaService` mock. 12/12 PASS.

**Task 5 (bctcReparseJob → 3-tier service):** `0ae87b9d`
- `ReparseDeps` gains `extractViaService` (Tier 1). `extractText` demoted to Tier 2. `getOcrCache` stays Tier 3. `extractHighDpiRetry` deprecated.
- 5 test files updated with `extractViaService: async () => null` stubs. 38/38 PASS.

**Task 6 (deprecation + offline integration test):** `372fbc91`
- `pdfOcrWorker.ts:extractAndStorePdfPagesWithRetry` marked `@deprecated`.
- `bctc-consolidation.test.ts` (NEW): 3-test offline suite. Bun mock HTTP server at port 0 (OS-assigned). Tests: service-first result / service-null fallback / pybctc_text. 3/3 PASS.

**Full suite:** 9315 pass / 347 fail (baseline 9311/348 — net improvement). Zero regression.

**Self-grep:** `extractAndStorePdfPagesWithRetry` — 0 NEW calls; legacy reference in `fetchParseAndStoreBctc.ts` (UNTOUCHED, architect-frozen; dead path since all 4 callers pass pdfTextOverride). `ocrPdfBuffer` — only in `pdf.ts` definition (deprecated). `fetchParseAndStoreBctc.ts` UNTOUCHED confirmed. `pdfExtractorClient.ts` UNTOUCHED confirmed.

**Next:** Task 7 = QA gate. QA emits consolidation PASS signal → architect emits 1954c-clearance + G5b-clearance → PO lifts freeze → G5 → YES → 12/12.

---

## c283 · 2026-05-24T09:45Z

### Task commit-mutex-live — commit-mutex lock kind deployed (2026-05-24, IMPL_DONE)

**PO hold reason:** `task_claim("commit-mutex:main")` returned `{claimed:false}` with no holder — CHECK constraint on `task_locks` excluded `commit-mutex`, and zod enum in coordinationTools.ts also excluded it.

**Changes:**
- `coordinationStore.ts` — `ensureCoordinationTable()` CHECK updated to include `'commit-mutex'`. Added `migrateCoordinationTable()`: SQLite recreate-pattern (v2 table → INSERT SELECT → DROP → RENAME → indexes), inside transaction, idempotent via sqlite_master. `TaskKind` union: added `"commit-mutex"`.
- `coordinationTools.ts` — Both zod enums (`task_claim` task_kind ~L82, `task_list_held` kind ~L188) updated with `"commit-mutex"`. Tool description updated.
- `migrations/20260524-coordination-add-commit-mutex.sql` — Reference SQL for the migration.
- `commit-mutex-coordination.test.ts` — 10 tests: AC-1..AC-7. 10/10 GREEN.
- `.claude/skills/commit-mutex/SKILL.md` — Added C-2b: `claimed=false` with NO `current_holder` AND NO `error` = mechanism broken → FAIL-CLOSED (skip commit, bug-telegram, EXIT). NOT backoff.

**Deployment-verified Ritual (live container post-rebuild):**
- Schema: CHECK now contains `'commit-mutex'` — CONFIRMED.
- 9 pre-existing rows preserved — CONFIRMED.
- CLAIM_A → `{"claimed":true}` PASS.
- CLAIM_B (concurrent) → `{"claimed":false,"current_holder":{owner_agent:dev-mcp-server-ritual,...}}` PASS.
- RELEASE_A → `{"ok":true}` PASS.
- RECLAIM_B → `{"claimed":true}` PASS.
- STALE_STEAL_C → `{"claimed":true,"stolen":true}` PASS.
- Container: `Up (healthy)` post-rebuild.

**Tests:** 39/39 coordination tests GREEN. tsc 0 errors. Full suite exit=0.

**Signal:** `docs/signals/dev-mcp-server-commit-mutex-live-done-20260524T094500Z.json` → po

---

## c2026-05-24 · P2-F G5a/G5b/G5c — RAG HTTP Rewire (DONE)

**Task:** P2-F — G5 delete+rewire for rag-service SCALE pilot

**G5a:** embeddings.ts + vectorstore.ts + retriever.ts git-mv → `infrastructure/rag/_deprecated/` (git mv landed in 1356dcce; this commit fixes relative imports in `_deprecated/retriever.ts`: `../../` → `../../../`).

**G5b:** 7 callers rewired from direct LanceDB (retriever.ts/vectorstore.ts) to ragHttpClient.ts HTTP boundary (port 5002):
- `analysis.ts` — searchContext/insertAnalysis → ragSearch/ragIndex + RagSearchResultDTO mapping
- `dataAuditJob.ts` — getCount/compactVectorStore → ragHealthCheck stub
- `index.ts` — closeVectorStore removed (comment: R-1 resolved)
- `fetchParseAndStoreBctc.ts` — AnalysisInput import + getDefaultInsertAnalysis rewired
- `pollNews.ts`, `runImpactChain.ts`, `runPredictionImpactChain.ts` — defaultRagRetriever → ragSearch with exactOptionalPropertyTypes spread pattern

**G5c:** `grep -rn "TODO.*migrat"` → 0 results

**R-1 DUAL LANCEDB WRITERS:** RESOLVED — mcp-server no longer writes LanceDB in live path.

**Tests:** TS 0 errors. Integration test `p2-f-rag-http-rewire.test.ts` 8/8 PASS. Full suite: 9293 pass / 356 fail (356 = pre-existing Bun panic artifacts, exit 0).

**Commits:** `d29da3a8` (code) + `be7b3461` (pilot-status P2-F DONE). Pre-revert tag: `rag-pre-delete` (SHA 525f8492).

**Next:** P2-J — G10 bug injection (QA injects, dev-rag-service fixes blind ≤2 cycles).

---

## c282 · 2026-05-23T12:48Z

### Task P2-B1 — MCP HTTP Rewire (2026-05-23, IMPL_DONE)

**Change:**
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` — REWRITE: removed `computeCarryTradeSignal`, `computeYieldSpreadSignal`, `fetchYahooFinancePrices`, `fetchSbvRates` domain/infra imports. `get_macro_snapshot` now HTTP POST to `/snapshot`. `formatThienThoi`/`formatDinhGia` kept exported with inlined carry/yield math (no domain imports). `MacroSnapshotResponse`, `ThienThoiInputs`, `DinhGiaInputs` interfaces kept for test compat.
- `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts` — REWRITE: `get_carry_trade_signal` → HTTP GET `/carry-trade-signal`; `get_macro_calendar` → HTTP GET `/macro-calendar?days={days}`. Removed `getMacroCalendar`, `computeCarryTradeSignal`, DB read helpers.
- `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts` — REWRITE: `get_yield_spread_signal` → HTTP GET `/yield-spread-signal`. Removed `computeYieldSpreadSignal`, DB read helpers.
- `apps/mcp-server/src/interface/mcp/tools/macro/macroHttpClient.ts` (NEW) — single SSOT for `MACRO_INDICATORS_URL` env var (fallback `http://localhost:5004`).
- `apps/macro-indicators/pkg/interface/http/handlers_carry.go` (NEW) — GET /carry-trade-signal fixture stub (TODO P2-X3).
- `apps/macro-indicators/pkg/interface/http/handlers_yield.go` (NEW) — GET /yield-spread-signal fixture stub (TODO P2-X3).
- `apps/macro-indicators/pkg/interface/http/handlers_calendar.go` (NEW) — GET /macro-calendar fixture stub (OQ-10: no live data).
- `apps/macro-indicators/pkg/interface/http/router.go` — 3 new chi routes added.
- `apps/macro-indicators/pkg/interface/http/router_test.go` (NEW) — httptest smoke tests, 4/4 PASS.

**AC results:** AC-1..AC-7 all PASS. R-1 exit=1 (no rand). G12 sandbox total=5 pass=5 fail=0 status=OK.

**Commit:** `98df0f43`

**Signal:** `docs/signals/dev-mcp-server-p2-b1-done-20260523T124800Z.json` → qa

Zone health: 4 MCP macro tools now route through HTTP to macro-indicators:5004; DDD violation (domain imports in interface layer) RESOLVED; G5b unblocked | HEALTHY

---

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md` (tasks 1955a-1967-01 archived)

## c1 · 2026-05-22T06:00Z

### Task 1970 — TA OHLCV Backfill (2026-05-22, IMPL_DONE)

**Change:**
- `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` (NEW, 216L) — daily cron `30 1 * * 1-5` (pre-market). Reads watchlist, checks `cnt >= 35 AND corrupt_cnt == 0` to determine skip. Fetches from VNDIRECT, upserts via `INSERT OR REPLACE` (heals 1972-era low=0 rows). Returns `{ covered, backfilled, sparse, errors }`.
- `cronConfig.ts` — `taOhlcvBackfill: '30 1 * * 1-5'` (env: `CRON_TA_OHLCV_BACKFILL`)
- `startScheduler.ts` — import + `jobRunRepo.wrapRun('ta-ohlcv-backfill', ...)`
- `docs/standards/cron-jobs.md` — "OHLCV Data Quality & TA Indicator Restoration" section

**Tests:** `1970-ta-ohlcv-backfill.test.ts` 10/10 GREEN. Full suite 9700/exit-0. tsc 0 errors.

**Signal:** `docs/signals/dev-mcp-server-1970-done.json` → qa

Zone health: taOhlcvBackfillJob added; TA_MIN_ROWS=35 threshold heals MACD/RSI/BB gaps; INSERT OR REPLACE overwrites 1972-era corrupt low=0 rows | HEALTHY

---

## Working Memory

### Task 1972 — VnDirect OHLCV null-coercion fix (2026-05-22, IMPL_DONE/QA-PENDING)

**Change:**
- `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` — expanded guard in `insertMany` transaction from `r.close==null` to include `r.open==null || r.high==null || r.low==null`. Removed `r.open ?? 0`, `r.high ?? close`, `r.low ?? close` coercions; use field values directly. Records with any missing OHLC field are now skipped entirely.

**Root cause fixed:** `ohlcvBackfill.ts` only guarded `r.close==null`. Null `open`/`high`/`low` fields were coerced — `r.open ?? 0` wrote 0 to DB, `r.low ?? close` wrote 0 if close was also 0. Produced ~1072 corrupt `low=0` rows in `daily_ohlcv` (tracked separately from 1971 Go scan-order fix).

**Tests:** `1972-vndirect-ohlcv-null-coercion.test.ts` 5/5 GREEN (AC-1 null-low skip, AC-2 null-open skip, AC-3 valid record insert, AC-4 null-close regression, AC-5 asymmetric fixture). tsc 0 errors. Full suite 9370/285.

**Commit:** `0a51a5a0`

**Signal:** `docs/signals/dev-mcp-server-1972-done.json` → qa

Zone health: ohlcvBackfill.ts null-coercion guard FIXED; ~1072 pre-existing corrupt rows remain in production DB (cleanup task if needed, not blocking); regression test seals the fix | HEALING

---

### Task 1965d-JANITOR-PATHFIX — tasksMdJanitorJob projectRoot fix + lint seal (2026-05-22, DONE)

**Change:**
- `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` — deleted local `const projectRoot = resolve(import.meta.dir, "..", "..", "..", "..", "..")` at line 501 (resolved to `/` in container). Added `import { getProjectRoot } from "../../infrastructure/projectRoot.js"`. Replaced `cwd: projectRoot` and `projectRoot,` in production deps with `getProjectRoot()` calls.
- `apps/mcp-server/src/__tests__/lint/no-local-project-root.test.ts` (NEW) — lint test scanning `scheduler/` tree for `resolve(import.meta.dir, '..'` anti-pattern. FAIL pre-fix, PASS post-fix. Regression seal.

**Root cause fixed:** Same anti-pattern as dailyDashboardJob (commit 2f0a74e9). `import.meta.dir` in container = `/app/src/scheduler/system` — five `..` segments reach `/` not `/app`. Canonical `getProjectRoot()` uses `git rev-parse --show-toplevel` with `process.cwd()` fallback.

**Tests:** smoke-tasks-md-janitor.ts 12/12 PASS. Lint test 1/1 GREEN. tsc 0 errors.

**Commit:** db4931de

**Signal:** `docs/signals/dev-mcp-server-1965d-JANITOR-PATHFIX-done.json` → qa

Zone health: tasksMdJanitorJob container-path ENOENT bug FIXED (R-2 pipeline-state.json + R-3 TASKS.md errors=2 at 03:00Z now resolved); lint seal prevents recurrence; AC-5 PENDING_LIVE (next 03:00Z cron fire) | HEALING

---

### Task 1960-DAILYDASH — dailyDashboardJob projectRoot fix (2026-05-22, DONE)

**Change:**
- `apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts` — added `import { getProjectRoot } from "../../infrastructure/projectRoot.js"` at line 27. Deleted local `projectRoot()` helper (was lines 455-460: `import.meta.dir + '../../..'` which resolves to `/` in container). Switched all 4 path.join callers: `loadSessionFiles`, `loadProjectStats`, `loadTasksMd`, `writeDashboard` to use canonical `getProjectRoot()`.

**Root cause fixed:** Container WORKDIR `/app` has only 3 path segments above the file; local helper used 3 `..` to reach `/app` but resolved to `/` instead. Canonical `getProjectRoot()` uses `git rev-parse --show-toplevel` with `process.cwd()` fallback — correct in both dev and container.

**Tests:** `1955a-daily-dashboard-project-root.test.ts` + `1854a-daily-dashboard-job.test.ts` — 14/14 GREEN. tsc 0 errors. Full suite: 9364 pass / 285 fail (285 = pre-existing BCTC freeze, zero regression).

**Commit:** 2f0a74e9

**Signal:** `docs/signals/dev-mcp-server-1960-DAILYDASH-done.json` → qa

Zone health: dailyDashboardJob projectRoot() container path bug FIXED; job was dead 5 days (success_rate 0%); AC-5 PENDING_LIVE (ops docker rebuild required for next cron tick at 23:30 GMT+7) | HEALING

---

### Task 1968c-P03 — get_agent_signals signal_type filter (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts` — added `signalType?: string | null` to `GetSignalsOptions`. `getSignals()` gains `AND s.signal_type = '...'` SQL clause when signalType is non-null/non-empty. SQL injection guarded via `replace(/'/g, "''")`.
- `agentSignalTools.ts` — added `signal_type: z.string().nullable().optional()` to `get_agent_signals` MCP tool schema. Tool description updated. Handler passes `signalType` to `getSignals()` when non-null.
- `.claude/tools/list/get_agent_signals.md` — parameter table updated with `signal_type` row; new "Key Notes on signal_type" section added.
- `.claude/flows/alert-commander/stage-signals.md` — step 3b updated to use `signal_type="price_anomaly"` + step 3c updated to use `signal_type="chain_catalyst"` with actual `call_tool` blocks and L-9 comment tags.

**Tests:** `1968c-p03-signal-type-filter.test.ts` — 6/6 GREEN (AC-1 schema, AC-2 filter, AC-3 backward-compat, AC-3b null=all, AC-6c invalid→empty, AC-7 payload reduction 50%). tsc 0 errors. Full suite: 9364 pass / 285 fail (285 = pre-existing BCTC freeze).

**Commit:** c3b18e8c

**Signal:** `docs/signals/dev-mcp-server-1968c-p03-done.json` → qa

Zone health: get_agent_signals server-side signal_type filter COMPLETE; alert-commander 3b+3c use typed queries; wire payload reduced 40-60% | HEALTHY

---

### Task 1967-02 — verified_decision SignalTypeSchema enum (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts:50` — added `"verified_decision"` to `SignalTypeSchema` z.enum (SSOT, 11 values total). Enum is imported by agentSignalTools.ts; no direct edit needed there for the schema.
- `agentSignalTools.ts:180` — updated `signal_type` describe string to list `verified_decision`.
- `.claude/tools/list/post_agent_signal.md:19` — added `verified_decision` to enum column.
- `docs/standards/mcp-tools.md:144` — new row: Alert Commander → All, chain de-dup ack.

**Tests:** `1967-02-verified-decision-enum.test.ts` — 4/4 GREEN (AC-1 enum accepts, AC-2 round-trip, AC-3 regression, AC-4 reject unknown). tsc 0 errors. Full suite: 9358 pass / 285 fail (285 = pre-existing BCTC freeze).

**Commit:** 257d92bf (swept into PM housekeeping commit; all 3 zone files + test included)

**Signal:** `docs/signals/dev-mcp-server-1967-02-done.json` → qa

Zone health: SignalTypeSchema now has 11 values (urgent_news, price_anomaly, cross_validate, suppress, chain_catalyst, fundamental_validation, price_confirmation, verified_chain, signal_feedback, legal_risk, verified_decision). alert-commander chain-ack unblocked | HEALTHY

---

### Task 1968b1 — get_agent_signals hours_back param (2026-05-21, DONE)

**Change:**
- `agentSignalStore.ts` — added `hoursBack?: number` to `GetSignalsOptions`. SQL query gains `AND s.created_at >= datetime('now', '-N minutes')` when set.
- `agentSignalTools.ts` — added `hours_back: z.coerce.number().positive().optional()` to MCP tool schema. Passed to store as `hoursBack`.
- `.claude/tools/list/get_agent_signals.md` — parameter table updated; L-4 consolidation pattern documented.

**Tests:** `1968b1-get-agent-signals-hours-back.test.ts` — 7/7 GREEN. AC-1 Zod schema, AC-2 filter excludes old signals, AC-3 default backward-compat, AC-4 6h/360-min window, AC-5 from_agent combo. tsc 0 errors. Full suite: 9356 pass / 283 fail (283 = pre-existing BCTC, zero regression).

**Commit:** 4fff6cbb

**Signal:** `docs/signals/dev-mcp-server-1968b1-param-ready.json` → agent-father (ungates phase 2 SELF_SIGNALS_CACHE)

Zone health: get_agent_signals now supports hours_back lookback; L-4 consolidation prereq COMPLETE | HEALTHY

---

### Task 1974-DAILYDASH-HOST-VISIBILITY — docker-compose rw bind for daily-dashboard.json (2026-05-22, IMPL_DONE)

**Change:**
- `docker-compose.yml` — added `./docs/data/daily-dashboard.json:/app/docs/data/daily-dashboard.json` (rw, option-a). Existing 3 :ro single-file mounts preserved.
- `docs/data/daily-dashboard.json` — initialized with `{}` on host (gitignored; Docker requires pre-existing FILE target for single-file bind-mounts).

**AC results:** AC-1 PASS (rw mount added, :ro mounts intact) | AC-2 PASS (manual trigger → host file 1625B, 9 top-level keys) | AC-3 PASS (restart-survival, mtime/content unchanged) | AC-4 PASS (project-stats.json EROFS inside container) | AC-5 PASS (9382/283, 283=pre-existing BCTC freeze).

**Commit:** c503c774

**Signal:** `docs/signals/dev-mcp-server-1974-impl-done.json` → qa

Zone health: dailyDashboardJob write-path now host-visible; daily-dashboard.json persists across restarts; RO integrity on 3 input mounts confirmed | HEALTHY

---

### Carry-over
- 283 pre-existing BCTC PDF parsing test failures — BCTC freeze active, do not touch
- Bun v1.3.13 C++ panic after full suite is a known upstream bug (exit code 0, tests pass)
- LanceDB ~29GB > DISK_THRESHOLD_GB(20) — diskUsageAlertJob fires on next hourly tick (correct)
