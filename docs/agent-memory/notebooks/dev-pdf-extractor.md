# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

## Working Memory

### 2026-05-14 — 1908a VNM Q4 2025 low-confidence spike (c91)

**Root cause: BCTC-VAL-07 hard fail due to totalAssets positional extraction error.**

`extractSplitBlockAll` mapped sbMap["270"] to `Tài sản dài hạn khác` (957,073 triệu) instead of grand total (~53,312,371 triệu). Since `totalLiabilities (18.8M) > totalAssets (957k) * 5`, VAL-07 hard-fails → confidence_financial=0.00.

Key: the BCTC-VAL-01-POSITION guard (task 1815, 2026-05-02) would have saved VAL-01 (netRevenue > totalAssets * 30x) but VAL-07 fires independently.

**Fix needed:** add plausibility check in `extractBalanceSheet` — if `(currentAssets.total + nonCurrentAssets.total) / totalAssets > 5`, override with the sub-total sum. Option B per report 1908a.

**Reparse required after fix:** DELETE VNM Q4 2025 row, then trigger bctcReparseJob.

**Systemic:** DIG Q4 2025 has same pattern. Banking cohort arrives 2026-05-15 — fix is P1.

---

### 2026-05-11 — 1870a FPT BCTC verify FAIL

FPT PDF layout: balance sheet (pages 4-7, VND), income stmt labels only (page 8), giải trình (page 9, triệu), cash flow (page 10, VND).

Known trap: `P_NET_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe]/i` matches balance-sheet item 421 "Lợi nhuận sau thuế chưa phân phối". Fix: add `(?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i)` negative lookahead.

Corruption note: running `bun -e` while container is alive causes SQLITE_CORRUPT. Always use `docker exec <container> bun -e` from within running container process — this is safe. The issue was the two processes sharing WAL. Recovery via alpine sqlite3 `.recover` worked.

Disk-scan only repopulates MISSING rows (cnt=0). To force reparse of an existing bad row: DELETE the row first, then trigger scan.

1870b follow-up: P_NET_PROFIT fix in `apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts`.

### 2026-05-14 — 1909a cashFlowExtractor expansion (COMPLETE)

Refactored `cashFlowExtractor.ts` to multi-layout parity with balanceSheetExtractor:

Key decisions:
- Split-block for cash flow uses item codes 01-70 (not 100-440 like balance sheet). Codes must be standalone 1-2 digit integers on their own lines or in `(20 = ...)` inline formula labels. Separator: `31/12/2025 Triệu VND` on one line.
- Drift guard fires on all 3 section totals independently (ocfSubtotals, invSubtotals, finSubtotals). Guard only fires when ≥2 non-zero subtotals present (avoids false positives on sparse data).
- E-4 legit zero: both statedTotal AND subtotalSum checked — if either is 0, guard skips. This is different from BS 1908c which only checks both>0 for the override pair.
- `computeCashFlowConfidence`: 5 key fields = operatingCF, investingCF, financingCF, netCashFlow, endingCash. Score = nonZeroCount/5. lowConfidence flag = score > 0 AND score < 0.2.
- Return type kept as `CashFlowStatement` (backward compat). Confidence exposed via separate `computeCashFlowConfidence(cf)` export.

Test fixture trap: VNM split-block fixture needs EXACTLY N codes in label block and N values in value block. Values are position-zipped to codes in sorted order. Extra values silently ignored. Miscounted → wrong semantic mapping. Always count codes and values before asserting test expectations.

SHA: 57cd4352 | Branch: worktree-agent-abcb87d17b89cec2e
22 new tests GREEN | 108 baseline BCTC tests PASS | tsc 0 errors

---

### 2026-05-19 — 1951d BCTC pipeline diagnostic (read-only)

**Task:** Diagnose why only 9 of 39 watchlist stocks have any BCTC data (Q1-2026: 0/39).

**Scope:** mcp-server source + local DB + pull-side logs. No code changes.

**Key findings (3 blockers):**

1. **PRIMARY — SSC-URL dead-end in bctcPdfPullJob:**
   `bctcPdfPullJob` queries `WHERE source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'` only. 34 of 43 pending Q1-2026 queue rows have `staticfile.hsx.vn` SSC portal URLs — never touched, attempts=0, sitting idle since 2026-04-30 (19 days). The pull job runs every 30 min and downloads 0 every time.
   File: `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts:L238`

2. **SECONDARY — pdftoppm + tesseract MISSING from container:**
   Runbook says poppler-utils was added to Dockerfile 2026-04-27, but current container has neither `pdftoppm` nor `tesseract`. The 4 PDFs already pulled (GAS 17MB, EIB 13MB, DHG 8MB, FPT 2.6MB) are all image-based (not text-native). OCR cache is empty for all 4. bctcReparseJob ran 2 attempts on EIB/DHG/FPT and failed. GAS has no feedback row yet.
   File: `apps/mcp-server/Dockerfile`

3. **SECONDARY — bctcBatchSweep never ran:**
   Zero cron_job_runs records for bctcBatchSweepJob. Scheduled for 2026-04-25 09:00 UTC (Q1-2026 season). Either not registered in scheduler or recordJobRun not called.
   File: `apps/mcp-server/src/scheduler/financial-reports/bctcBatchSweepJob.ts`

**DB state:**
- financial_reports: 9 stocks (all Q4-2025, 0 Q1-2026)
- bctc_vps_queue: 43 pending (34 SSC-URL, 9 null-URL), 12 done (all Q4-2025 + 4 Q1-2026), 28 url_not_found (Q4-2025 rows that VPS never cached)
- OCR cache: 13 Q4-2025 files cached, 0 Q1-2026 files cached

**Diagnostic output:** `docs/signals/dev-pdf-extractor-1951d-pipeline-diagnostic.json`

**Remediation owner:** ops (VPS must cache SSC-URL PDFs + Dockerfile must restore poppler-utils+tesseract). Flag to po for combined decision with ops-1951d diagnostic.
