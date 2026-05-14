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
