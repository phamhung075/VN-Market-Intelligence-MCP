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
# RAW check vs named volume after container rebuild + reparse
docker run --rm -v vn-market-intelligence-mcp_market_data:/db keinos/sqlite3 \
  sqlite3 /db/market.db "SELECT COUNT(*) FROM bctc_table_rows WHERE report_id IN (SELECT id FROM financial_reports WHERE action_code='VCB');"
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
