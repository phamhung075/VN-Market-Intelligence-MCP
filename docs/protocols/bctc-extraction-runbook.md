# BCTC PDF Extraction Runbook

<!-- size-justification: 125L — detailed operational runbook: architecture diagram + job specs + VPS/Docker integration details + diagnostics. Tightly coupled procedure flow; splitting into micro-docs would require readers to jump between files. Atomic operational manual for on-call debugging. -->

> Lazy-load this file when: diagnosing BCTC extraction failures, BCTC pipeline health checks, any work touching bctcPdfPullJob / bctcReparseJob / pdfOcrWorker.

---

## Architecture: Pull-Based (current as of 2026-04-27)

```
VPS ($VINAHOST_IP:8765)  ← jq '.project.infrastructure.vps | {host, port}' docs/data/system-map.json
  └─ /bctc-files/<filename>  ← HTTP endpoint, auth: X-API-Key

mcp-server container
  └─ bctcPdfPullJob (every 30 min)
       └─ polls bctc_vps_queue WHERE source_url LIKE 'http://$VINAHOST_IP:8765/bctc-files/%'
       └─ downloads PDF → saves /app/data/pdfs/<TICKER>_<YEAR>_Q<N>.pdf
       └─ calls runBctcReparseJob (extraction trigger)
       └─ marks queue row 'done'
```

**NOT the old push flow** — `/api/push-bctc-pdf` and `fetch-bctc.sh` are legacy. The `pdf-extractor` microservice (`POST /extract`) is also NOT used by this pipeline.

---

## Extraction Chain

```
runBctcReparseJob
  ├─ reads agent_feedback WHERE agent='data-auditor' AND stranded_bctc_pdf AND status='new'
  ├─ for each row → reparseSingleWithOcrFallback
  │    ├─ Tier 1: pdf-parse (text-native PDFs)
  │    ├─ Tier 2: OCR cache (pdf_extracted_text table)
  │    └─ Tier 3: pdftoppm + tesseract (DPI 200 → 300 retry)
  └─ if feedbackRows == 0 → disk-scan fallback (scans /app/data/pdfs/)
```

**Critical path:** disk-scan fallback only runs when `agent_feedback` returns 0 rows. Stale rows block it.

---

## Known Failure Modes

### A. Stale HOST-path feedback rows (most common post-Docker)
- **Symptom:** `[bctc-reparse-job] file disappeared before reparse` with `/Users/admin/...` path
- **Cause:** Rows written before Docker migration have macOS host paths
- **Effect:** Blocks disk-scan fallback → newly downloaded PDFs never extracted
- **Fix:** Update detail JSON to `/app/data/pdfs/<file>` or DELETE if PDF absent

```bash
# Find stale rows
docker exec vn-market-mcp-server-1 python3 -c "
import sqlite3; conn = sqlite3.connect('/app/data/market.db')
cur = conn.cursor()
cur.execute(\"SELECT id, detail FROM agent_feedback WHERE agent='data-auditor' AND status='new' AND title LIKE '[AUDIT] stranded_bctc_pdf%'\")
for r in cur.fetchall(): print(r[0], r[1][:120])
"
```

### B. `pdftoppm` missing → OCR silently disabled
- **Symptom:** `isOcrAvailable()` returns false; scanned PDFs produce 0 chars with no retry
- **Fix:** `docker exec mcp-server-1 apt-get install -y poppler-utils`
- **Permanent fix:** Added to `apps/mcp-server/Dockerfile` (2026-05-19, sprint 1953b). The 2026-04-27 runbook claim was aspirational — the Dockerfile header comment stated "tesseract and poppler are skipped" and the apt-get install block never included these packages until 1953b.
- **Note:** `isOcrAvailable()` is module-level cached — container restart needed after install

### C. Ops agent false positive: "44/45 url=MISSING"
- **Cause:** Ops agent checks `bctc_vps_queue.source_url` for SSC portal URLs — these are irrelevant
- **Reality:** Pull-based rows use `http://$VINAHOST_IP:8765/bctc-files/` prefix (VPS host → `jq '.project.infrastructure.vps.host' docs/data/system-map.json`)
- **Correct check:** Look at PDFs on disk + feedback table + OCR availability

---

## Diagnostic Commands

```bash
# 1. PDFs on disk
docker exec vn-market-mcp-server-1 ls /app/data/pdfs/

# 2. Blocking feedback rows
docker exec vn-market-mcp-server-1 python3 -c "
import sqlite3; conn = sqlite3.connect('/app/data/market.db'); cur = conn.cursor()
cur.execute(\"SELECT id, detail FROM agent_feedback WHERE agent='data-auditor' AND status='new' AND title LIKE '[AUDIT] stranded_bctc_pdf%'\")
for r in cur.fetchall(): print(r)
"

# 3. OCR available
docker exec vn-market-mcp-server-1 which pdftoppm

# 4. Extracted reports
docker exec vn-market-mcp-server-1 python3 -c "
import sqlite3; conn = sqlite3.connect('/app/data/market.db'); cur = conn.cursor()
cur.execute('SELECT action_code, period_type, period_year, extraction_method FROM financial_reports ORDER BY rowid DESC LIMIT 10')
for r in cur.fetchall(): print(r)
"

# 5. Manually trigger reparse
docker exec vn-market-mcp-server-1 bun -e "
const { runBctcReparseJob } = await import('./src/scheduler/financial-reports/bctcReparseJob.js');
const r = await runBctcReparseJob();
console.log(JSON.stringify(r));
"
```

---

## Low-Text-Density OCR Rasterize Path (FIX-BCTC-BANK-PDF-OCR-RASTERIZE, 2026-06-15)

**Symptom:** Scanned / image-only PDFs (VCB, CTG) yield ~0 text-chars from pdfplumber → BS-marker scan finds no markers → fallback to pages [4,5,6,7] → Tesseract on wrong pages → chars:0 → 0 rows.

**Root cause:** Scanned bank PDFs have images only; pdfplumber extracts "" → BS markers never found.

**Fix (generic — no ticker allowlist):**
1. `detect_low_text_density(pdf_path, max_sample_pages=10)` — averages pdfplumber chars/page across up to 10 pages. Returns True when avg < `BCTC_LOW_TEXT_DENSITY_THRESHOLD` (default 50.0, env-configurable). Falls back False on exception.
2. `locate_balance_sheet_pages()` — when low-text-density detected, skips BS-marker scan and wide-scans all pages up to `_MAX_BS_PAGES=8` cap (host-safety D6).
3. `ocr_pages()` — when Tesseract yields < `BCTC_LOW_TESSERACT_PAGE_CHARS` (default 30) chars, tries PaddleOCR rasterize fallback via `_rasterize_and_ocr_page()`.
4. `_rasterize_and_ocr_page()` — fitz rasterize at `BCTC_RASTERIZE_DPI` (default 200 DPI), RGBA/grayscale→RGB, PaddleOCR (use_gpu=False). PaddleOCR instance lazy-initialized and cached per adapter instance.

**Env knobs (all optional, defaults shown):**
- `BCTC_LOW_TEXT_DENSITY_THRESHOLD=50.0` — chars/page threshold below which PDF is treated as scanned
- `BCTC_LOW_TESSERACT_PAGE_CHARS=30` — Tesseract char floor below which PaddleOCR fallback fires
- `BCTC_RASTERIZE_DPI=200` — DPI for fitz rasterization

**Non-regression:** text-native PDFs (FPT, VNM avg >>50 chars/page) → `detect_low_text_density()` returns False → standard Tesseract-only path unchanged.

---

## PEK table-OCR text backend — `OCR_TEXT_BACKEND` and the per-region rescue

Distinct from the scanned-PDF fallback above: this governs the *table* path
(`PekEngineAdapter._run_table_extraction` → `OcrBackendPort.recognize_text`),
one call per detected table region.

`OCR_TEXT_BACKEND` ∈ `tesseract-vie` (default, and what production runs —
the var is unset in compose) | `paddleocr` | `auto`.

**Do not swap the default to `paddleocr`.** Ruled closed 2026-08-25 on a valid
`lang="vi"` benchmark: 2.4x tesseract's latency, cgroup peak pinned at
`memory.max` with 1444 hard-limit hits, and diacritics still garbled because
`paddleocr==2.10.0` maps `"vi"` into a generic 30-language `"latin"` rec bucket
with no dedicated Vietnamese model.

`auto` = tesseract-vie by default, PaddleOCR as a **per-region rescue** when the
tesseract confidence for that region falls below `OCR_FALLBACK_THRESHOLD`
(default 0.5). The rescue must stay rare — PaddleOCR carries the diacritic
penalty above, so a rescue that fires everywhere is a fleet-wide regression.

**Reading the fire rate in production:** every fire logs at INFO from
`infrastructure.ocr_backends`:

```
AutoFallbackOcrBackend: RESCUE FIRED — Tesseract confidence 0.174 < threshold 0.500;
PaddleOCR returned 0.644 (433 chars vs 79); keeping paddleocr result
```

The non-firing path is deliberately silent. Measured on FPT Q4 2025
(`e71f845d-ffa5-48f9-8f09-30ac2cd09c65`): **1 fire in 51 table regions / 30
table units**, and 29 of 30 units byte-identical to a `tesseract-vie` run. If
you see a fire rate materially above that, treat the confidence discriminator as
regressed — do not raise the threshold to silence it.

**Confidence is `min(precision, recall)`,** not mean-conf. See
`docs/REQ_PEK-INTEGRATE.md` § "Confidence-scoring contract" for the definition
and the measured rejection of the alternatives, and the "Recall-aware
confidence" block in `infrastructure/ocr_backends.py` for the per-metric
separation table.

**Re-measuring:** `bash scripts/audits/ocr-backend-bench.sh [tesseract-vie|paddleocr|auto]`
(ephemeral `docker compose run --rm`, emits table-phase wall, cgroup
peak/events, per-unit markdown digests, and the rescue-fire list).
`bash scripts/audits/ocr-confidence-probe.sh` dumps every candidate
discriminator per table region for a document. Never run either during VN market
hours (02:00-08:59 UTC weekdays).

**FAIL-LOUD preserved:** if OCR rasterization still yields 0 rows, existing `enrich_failed` gate (989654f2) keeps it visible — status `enrich_failed`, NOT `done`.

**Trigger:** Rebuild `pdf-extractor` container (force-recreate ONLY — never `docker compose down`). Then re-trigger `runBctcReparseJob` for VCB/CTG.

**Verification:**
```bash
# RAW check via direct host-bind read after container rebuild + reparse (FIX-DB-INTEGRITY-
# SIDECAR-NAMED-VOLUME-DRIFT, 2026-08-06: the docker named volume was retired 2026-07-15 —
# the live DB is now the host bind mount data/live/market.db)
sqlite3 "file:data/live/market.db?immutable=1" "SELECT COUNT(*) FROM bctc_table_rows WHERE report_id IN (SELECT id FROM financial_reports WHERE action_code='VCB');"
# Expected: > 0 rows (was 0 before this fix)
```

---

## B02-TCTD Bank Form Parse Path (FIX-BCTC-ENRICH-SILENT-0ROWS, 2026-06-15)

**Symptom:** Bank tickers (VCB, CTG, etc.) have `bctc_table_rows=0` + `bctc_md_tables=0` while corporate tickers (FPT) parse fine.

**Root cause:** `_try_parse_code_row()` in `apps/pdf-extractor/infrastructure/text_table_extractor.py` — Layouts 1-5 all require 2-3 digit numeric codes. B02-TCTD bank form uses Roman numeral section codes (I–XIII) and single-digit sub-codes (1-9). Every line returns `None` from the code parser → 0 rows assembled; header row still inserted silently.

**Fix:** Layouts 6 and 7 added to `_try_parse_code_row()`:
- Layout 6: `_try_parse_roman_code_row()` — anchored Roman regex (longest-first: XIII…I), requires Vietnamese number in line, rejects section headers (period after code)
- Layout 7: `_try_parse_single_digit_code_row()` — single digit 1-9 at line start, same guards

**Non-regression:** Layouts 1-5 take priority; Layout 6+7 only reached when all prior layouts return `None`. Corporate codes (100, 270, 440) are handled by Layout 1 before reaching Layout 6.

**Trigger:** Rebuild `pdf-extractor` container to deploy. Then re-trigger `runBctcReparseJob` (see Diagnostic #5) for VCB/bank tickers.

**Verification:**
```bash
# RAW check via direct host-bind read after container rebuild + reparse (FIX-DB-INTEGRITY-
# SIDECAR-NAMED-VOLUME-DRIFT, 2026-08-06: the docker named volume was retired 2026-07-15 —
# the live DB is now the host bind mount data/live/market.db)
sqlite3 "file:data/live/market.db?immutable=1" "SELECT COUNT(*) FROM bctc_table_rows WHERE report_id IN (SELECT id FROM financial_reports WHERE action_code='VCB');"
```
Expected: > 0 rows per report.

---

## Key Files

| File | Role |
|------|------|
| `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` | Downloads PDFs from VPS HTTP endpoint |
| `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` | Extracts text, runs pipeline for stranded PDFs |
| `apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts` | pdftoppm + tesseract OCR, SQLite cache |
| `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` | Full parse→store pipeline |
| `apps/mcp-server/Dockerfile` | Must include `poppler-utils` (pdftoppm) + `tesseract-ocr` + `tesseract-ocr-vie` (sprint 1953b) |

---

## Data Tables

| Table | DB | Purpose |
|-------|----|---------|
| `bctc_vps_queue` | market.db | Download queue; pull rows have VPS URL prefix |
| `agent_feedback` | market.db | Stranded PDF tracking; HOST paths = stale |
| `pdf_extracted_text` | market.db | OCR cache keyed by filename |
| `financial_reports` | market.db | Final extracted + parsed reports |
| `pdf_documents` | pdf_extractor.db | **LEGACY** — 442 failed rows from old push flow, ignore |
