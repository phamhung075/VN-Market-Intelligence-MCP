# Architecture Brief — BCTC Ingest → Extract → Write RCA
**Date:** 2026-05-19
**Author:** architect
**Slug:** bctc-write-chain-rca
**Status:** READY FOR SPRINT

Trigger: ≥3 fix commits in 24h on the BCTC PDF chain. Zero `financial_reports` rows for period_year=2026, period_type='Q1' despite OCR producing 21K–103K chars. Per recurring-bug escalation policy: structural rethink before any new fix.

---

## §1 — Full Chain Map (end-to-end, code-verified)

### Stage 0 — VPS URL Discovery
**File:** `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`
**Entry:** `runBctcQueueEnricherJob()` — cron every 15 min
**Input:** `bctc_vps_queue` rows WHERE `source_url IS NULL OR LIKE placeholder` AND `status='pending'`
**Work:** calls `discoverHosePdfUrls()` (domain) which tries SSC iboard → CafeF → Vietstock
**Output:** writes real VPS PDF URL back to `bctc_vps_queue.source_url`; sets `status='pending'`
**Persist:** `UPDATE bctc_vps_queue SET source_url=?, status='pending'`
**Owner zone:** dev-mcp-server

### Stage 1 — PDF Download
**File:** `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`
**Entry:** `runBctcPdfPullJob()` — cron every 30 min
**Input:** `bctc_vps_queue` WHERE `status='pending' AND source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'`
**Work:** fetches PDF from VPS with `X-API-Key`; validates ≥10 240 bytes; saves to `data/pdfs/<TICKER>_<YEAR>_Q<N>.pdf`
**Output:** file on disk + marks queue `status='done'`; triggers `triggerExtraction()`
**Persist:** `UPDATE bctc_vps_queue SET status='done'`; calls Stage 2 inline
**Owner zone:** dev-mcp-server
**NOTE:** Stage 1 calls Stage 2 awaited (line 349) — queue row marked done only after extraction returns.

### Stage 2 — OCR Extraction (page-by-page cache write)
**File:** `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts`
**Entry (pull path):** `bctcPdfPullJob.triggerExtraction()` → `extractAndStorePdfPagesWithRetry()` (line 146)
**Entry (push path):** `server.ts:717 setImmediate` → `triggerPushBctcExtraction()` → `extractPages()` → same function
**Input:** `filePath` (absolute path to PDF on disk), `filename` (normalised e.g. `FPT_2026_Q1.pdf`), `actionCode`
**Work:** for each page 1..min(totalPages,80): spawn `pdftoppm | tesseract`; 45s per-page timeout; 2s yield between pages; insert if ≥10 chars
**Output:** rows in `pdf_extracted_text (filename, page_number, text_content, confidence, action_code)`
**Persist:** `INSERT OR REPLACE INTO pdf_extracted_text`
**Owner zone:** dev-mcp-server
**NOTE:** Confidence assigned heuristically: `text.length > 50 ? 0.8 : 0.5` (line 272). No structural confidence scoring.

### Stage 3 — OCR Cache Read + Pipeline Entry
**File (pull path):** `bctcPdfPullJob.ts:triggerExtraction()` (line 158): `getCachedPdfText(filename)`
**File (push path):** `pushBctcExtraction.ts:121`: `deps.getCache(filename)`
**File (reparse path):** `bctcReparseJob.ts:287`: `deps.getOcrCache(payload.filename)`
**Input contract:** `filename` string — must exactly match what Stage 2 wrote to `pdf_extracted_text.filename`
**Work:** `SELECT text_content, confidence FROM pdf_extracted_text WHERE filename=? ORDER BY page_number`
**Guard:** if `cached === null OR cached.text.trim().length < 100` → pipeline skipped, warn logged, return (no financial_reports write)
**Owner zone:** dev-mcp-server

### Stage 4 — Parse + Store Pipeline
**File:** `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts`
**Entry:** `fetchParseAndStoreBctc({ actionCode, year, quarter, pdfTextOverride, pdfUrl })`
**Work:** builds FiscalPeriod → calls `parseBctcReport()` → calls `storeReport()` → embeds into LanceDB
**Owner zone:** dev-mcp-server

### Stage 5 — Domain Parse + Confidence Score
**File:** `apps/mcp-server/src/application/usecases/parseBctcReport.ts`
**Entry:** `parseBctcReport({ rawText, actionCode, period })`
**Work:** runs three extractors (balanceSheet, incomeStatement, cashFlow) → computes `extractionConfidence = nonZeroFields / 16`
**Guard:** `if (extractionConfidence === 0) → storeReport() returns early — NO INSERT` (line 206-216)
**Guard:** `if (extractionConfidence < 0.2) → insert with validation_status='low_confidence'` (line 219)
**Guard:** `if coreFieldsAllZero → confidence capped at 0.05` (line 152-153) → triggers zero-confidence guard
**Owner zone:** dev-mcp-server

### Stage 6 — SQLite Write
**File:** `apps/mcp-server/src/application/usecases/parseBctcReport.ts:storeReport()` (line 198)
**Write:** `INSERT OR REPLACE INTO financial_reports (id, action_code, period_year, period_quarter, period_type, ...)`
**Key insert fields:** `period_year`, `period_quarter` (INTEGER: 1–4), `period_type` (TEXT: 'Q1'–'Q4')
**Owner zone:** dev-mcp-server

---

## §2 — The Write Gap: Why financial_reports = 0 rows

Three independent failure modes compound to produce zero rows. All three must be resolved.

### Failure A — backfillBctcQ12026 schema mismatch (FATAL to queue seeding)

**File:** `apps/mcp-server/src/scheduler/financial-reports/backfillBctcQ12026.ts:53-54`

The INSERT uses column names `(ticker, year, quarter, ...)`:
```sql
INSERT OR IGNORE INTO bctc_vps_queue
  (ticker, year, quarter, source_url, status, attempts, created_at)
VALUES (?, 2026, 'Q1', ?, 'pending', 0, datetime('now'))
```

The actual `bctc_vps_queue` DDL (`schema-financial-reports.ts:122-133`) defines:
```sql
action_code     TEXT    NOT NULL,
period_year     INTEGER NOT NULL,
period_quarter  TEXT    NOT NULL,
```

Column names `ticker`, `year`, `quarter` do not exist. This INSERT fails at runtime with `no such column: ticker`. The 103 pending rows observed by ops came from `server.ts:703` (the push endpoint), NOT from this backfill — the backfill was silently broken.

**Consequence:** `bctcQueueEnricherJob` can only enrich rows that already exist. Any ticker NOT seeded via the push endpoint never enters the pipeline.

### Failure B — OCR cache count = 0 despite OCR producing chars

**Signal evidence:** `ops-1953cf-deploy-verify.json`: `"ocr_cache_count": 0` yet FPT=21,703 chars, GAS=103,728 chars reported.

Two possible explanations — only one is structurally provable without live container access:

**B-1 (most likely):** The OCR worker (`extractAndStorePdfPagesWithRetry`) writes to `pdf_extracted_text` via `getDb()`. If the ops verify SQL ran against a different DB file path than the running container, cache count would show 0 even though rows exist. Specifically: `ocr_cache_count: 0` may have been measured by checking `data/pdfs/` directory (no OCR cache directory found) — a filesystem check, not a SQL count. If the directory path is `data/pdfs/` and OCR writes to `/tmp/ocr-<timestamp>/` only for processing (then cleans up at line 293 `rmSync(tmpDir)`), that matches "no OCR cache directory at expected path."

**B-2 (secondary):** `extractAndStorePdfPages` uses a temporary `tmpPdf = join(tmpDir, "input.pdf")` (line 229-230). The actual `pdf_extracted_text` rows ARE written to SQLite. But `getCachedPdfText(filename)` looks up by `filename` — the exact string passed to `extractAndStorePdfPages`. If the filename used by the pull job (`FPT_2026_Q1.pdf` — line 142 of bctcPdfPullJob) differs from what `getCachedPdfText` queries (which it passes the same `filename` variable), this should match. However: the Stage 3 cache read happens in `triggerExtraction()` IMMEDIATELY after Stage 2 returns. If Stage 2 takes 40min for GAS (76 pages × 2s yield + OCR time), the 30-min pull job cron may have timed out or been superseded before Stage 3 ran.

**B-3:** `extractAndStorePdfPages` uses `db.prepare(...)` which writes to the singleton `getDb()`. If the pull job runs inside the Docker container but a different SQLite DB path is mounted, the `INSERT` succeeds in the container's DB while the ops verify `SELECT` ran against the host machine's DB copy.

**Structural verdict:** Regardless of B-1/B-2/B-3, the proximate cause of `financial_reports = 0` is that Stage 3's cache guard fires (`cached === null || text.length < 100`) and `fetchParseAndStoreBctc` is never called. OCR chars counted by ops are from OCR process stdout (temporary memory), not from confirmed `pdf_extracted_text` rows.

### Failure C — Stage 5 zero-confidence guard would also block even if OCR succeeded

For EIB (3/40 pages, 2,911 chars) and DHG (3/36 pages, 1,401 chars):
- Only 3 pages extracted from a 36–40 page financial report
- The text extractors (`extractBalanceSheet`, `extractIncomeStatement`, `extractCashFlow`) will find 0–1 non-zero key fields from such a fragment
- `computeConfidence()` at line 110-157: `coreFieldsAllZero` (totalAssets=0, netRevenue=0, netProfit=0) → confidence capped at 0.05
- `storeReport()` line 206: `if (extractionConfidence === 0)` → NO INSERT. At 0.05, insert DOES proceed (it's not exactly 0) but with `validation_status='low_confidence'`

**However:** for FPT (10/46 pages) and GAS (42/76 pages): text volume is sufficient (21K/103K chars). If that text reached the pipeline, `parseBctcReport` WOULD produce a non-zero confidence score and the row WOULD be written. The evidence that `financial_reports = 0` rows landed for FPT and GAS means Failure B is the dominant blocker for those two. For EIB and DHG, even if OCR cache was present, the extraction would produce a low-confidence partial row at best.

---

## §3 — Under-extraction Gap: EIB 3/40, DHG 3/36

**Code path:** `pdfOcrWorker.ts:ocrOnePage()` (lines 70-158)

Per-page timeout at line 153: `setTimeout(() => { ppm.kill(); tess.kill(); done(""); }, 45_000)`.
Per-page yield at line 284: `await new Promise(r => setTimeout(r, 2000))`.

For EIB (40 pages, maxPages = min(40,80) = 40):
- Total OCR time: up to 40 × (45s timeout + 2s yield) = 1,880s ≈ 31 min per extraction pass
- If phase 1 confidence < 0.2, DPI 300 retry runs: another 31 min = 62 min total

The 2s yield per page is **architecture debt** — it was added to keep the server responsive but has a major side effect for long PDFs: a 76-page GAS report with 2s/page = 152s minimum OCR time without counting actual tesseract time. For scanned PDFs (EIB/DHG), tesseract on each page approaches the 45s timeout, meaning these reports take up to 31–47 minutes of wall clock time per OCR pass.

**Root cause of low page yield (EIB=3/40, DHG=3/36) — two candidates:**

**C-1: Scanned image PDFs vs vector-text PDFs.** FPT and GAS reports are likely vector-text PDFs where `pdftoppm` converts quickly and tesseract extracts cleanly. EIB and DHG Q1-2026 are likely scanned documents. For scanned PDFs, each `pdftoppm | tesseract` pipe produces more bytes, takes longer, and tesseract confidence is lower. Pages where tesseract returns < 10 chars are counted as `pagesLowChar` and not inserted. With scanned PDFs, many pages return blank or near-blank OCR output even though the page has content — especially if the scan is rotated, faded, or uses a non-Vietnamese OCR engine path. `vie+eng` is specified at line 81, which is correct, but Tesseract's `vie` model requires clean scans.

**C-2: Container resource pressure.** OCR is CPU-intensive. The `nice -n 19` flag (lines 73, 79) gives OCR lowest CPU priority. Under container resource constraints (ECS/Docker memory or CPU limits), `pdftoppm` or `tesseract` may be OOM-killed silently, returning empty strings. The `ppm.on("close", code !== 0)` handler (line 118) calls `tess.kill(); done("")` — these pages are counted as skipped, not as errors. An OOM kill produces exit code 137, which registers as `code !== 0`, silently discarded.

**Verdict on §3:** C-1 (PDF structure) is the primary cause; C-2 (resource pressure) amplifies it. These are distinct from the write gap in §2 — even fixing §2 completely, EIB/DHG would still produce ≤10% page yields and low-confidence records.

---

## §4 — Structural Verdict

**(b) Architectural rot** — the chain has overlapping write paths with inconsistent state management.

The pipeline has three independent code paths that each attempt OCR + `financial_reports` write:
1. `bctcPdfPullJob.triggerExtraction()` — pull path from VPS queue
2. `server.ts setImmediate → triggerPushBctcExtraction()` — push path from VPS agent
3. `bctcReparseJob.reparseSingle()` → `fetchParseAndStoreBctc()` — daily recovery path

All three call `fetchParseAndStoreBctc()` as the write terminus, which is correct. But the upstream OCR cache read uses three different cache-lookup call sites with no coordination: if the pull path runs OCR and marks the queue done, the reparse path re-runs OCR independently the next day. If the queue row is marked `done` but the OCR failed silently, the reparse path's `scanDiskForStrandedPdfs` is the only recovery — but only if the PDF file is on disk AND the filename passes `parseYearQuarterFromFilename()`.

`backfillBctcQ12026.ts` adds a fourth path that is entirely broken (wrong column names), meaning the queue seeding step for a new earnings season is silently non-functional.

**The three sentences:** The system has four queue-entry mechanisms (backfill, push endpoint, enricher, disk-scan recovery) writing to one queue table with inconsistent column naming in the backfill. The OCR stage writes to SQLite inside the same process but with no acknowledgment token between the write and the downstream cache-read — a 30-second gap between `extractAndStorePdfPages` completing and `getCachedPdfText` returning can produce a cache miss if the DB transaction commits after the read. Consolidating to a single write path (pull job owns all writes; push endpoint queues; reparse is the catch-all) with a synchronous cache-read retry after OCR completion eliminates the race and the duplication.

---

## §5 — Sprint Plan (option b: multi-task sequence)

**Phase 1 — Fix the queue seeding gate (unblocks enricher for all tickers)**
- Task 5-A: Fix `backfillBctcQ12026.ts:53` — change column names to `(action_code, period_year, period_quarter, source_url, status, attempts, created_at)` and parameters to match
- Owner: dev-mcp-server | Estimate: 2h
- Prerequisite: none — safe to ship today

**Phase 2 — Fix the OCR cache miss between Stage 2 and Stage 3**
- Task 5-B: In `bctcPdfPullJob.triggerExtraction()` (line 159): after OCR returns, if `getCachedPdfText` returns null, sleep 500ms and retry once before skipping pipeline. Add explicit log of cache miss at warn level with `filename` and `pdf_extracted_text` row count.
- Task 5-C: In `pushBctcExtraction.ts:121`: same retry pattern after `extractPages()` completes.
- Owner: dev-mcp-server | Estimate: 3h combined

**Phase 3 — Fix the reparse/pull coordination (mark reparse-eligible only if OCR rows exist)**
- Task 5-D: `bctcReparseJob.scanDiskForStrandedPdfs()` — before adding a file to `stranded[]`, check `pdf_extracted_text` row count; if >0, use cache directly rather than re-OCRing. This prevents the daily reparse from re-running 31min of OCR on already-extracted files.
- Owner: dev-mcp-server | Estimate: 4h

**Phase 4 — Backfill existing missing rows**
- Task 5-E: One-shot script using `bctcReparseJob.runBctcReparseJob()` directly against production DB. Not a new file — call existing function with `db=getDb()`.
- Owner: dev-mcp-server | Estimate: 1h

PM creates sprint. Tasks 5-A through 5-E are sequential (each gate unlocks the next). Total estimate: ≤2 days.

---

## §6 — Quick Wins (ship today, independent of §5)

**quick-win-1:** `apps/mcp-server/src/scheduler/financial-reports/backfillBctcQ12026.ts:53-54`
Change `(ticker, year, quarter, source_url, status, attempts, created_at)` to `(action_code, period_year, period_quarter, source_url, status, attempts, created_at)`.
Also change `stmt.run(ticker, placeholderUrl)` (line 62) to `stmt.run(ticker, 2026, 'Q1', placeholderUrl, 'pending', 0)`.
Risk: zero — INSERT OR IGNORE, idempotent, schema-matched.

**quick-win-2:** `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts:284`
The 2s inter-page yield was designed to keep the server responsive. For scanned PDFs ≥30 pages, this adds 60+ seconds of pure idle time. Change to `await new Promise(r => setTimeout(r, 200))` (200ms). Server responsiveness at 10× lower cost. Risk: low — the yield is a courtesy pause, not a technical requirement.

**quick-win-3:** Add explicit log in `bctcPdfPullJob.triggerExtraction()` at line 158 BEFORE the null-guard check: log `pdf_extracted_text` row count for this filename. Currently a cache miss is logged as a warn but the operator has no way to distinguish "OCR never ran" vs "OCR ran but wrote 0 rows" vs "OCR wrote rows but filename mismatch". One log line of `{ filename, rowCount: db.query(...).get(filename).c }` enables immediate diagnosis.

**quick-win-4:** `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts:579-605` — `insertFallbackRecord()` inserts with `period_quarter = payload.quarter` where `payload.quarter` is `"Q1"` (a string). But `period_quarter` in the DDL is `TEXT NOT NULL` and the fallback sets `period_quarter = payload.quarter.startsWith('Q') ? payload.quarter : ...` — correct. However `period_quarter` in `bridgeOCFToFinancialReports` is JOIN-matched against `vnstock_cash_flow.quarter` which is `INTEGER`. These fallback records with `period_quarter='Q1'` (TEXT) will NEVER match the OCF bridge UPDATE (which expects `period_quarter=1` INTEGER). Not a blocker for §2 but creates silent data gaps. Fix: store `period_quarter` as INTEGER 1–4 in fallback records, matching what the bridge expects.

---

## §7 — NEXT Directive

```
NEXT: pm | create sprint per §5 (tasks 5-A → 5-E, dev-mcp-server zone, ≤2 days)
```

Quick-win-1 should be shipped immediately as a hotfix (≤2h, unblocks queue seeding for all 30 watchlist tickers before next enricher cycle).
