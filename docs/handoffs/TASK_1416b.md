# TASK 1416b — FPT 2025-Q4 composite=0.00 / financial=0.00 (HIGH)

## Symptom

FPT Q4-2025: `composite = 0.00`, `financial = 0.00`. No usable financial data surfaces in scoring.

DB record confirmed:
- `financial_reports`: 1 row — `period_year=2025`, `period_quarter=4`, `total_assets=2`, `extraction_confidence=0.875`, `confidence_financial=0`, `validation_status=low_confidence`, `extraction_method=pdf-parse`
- `pdf_extracted_text`: 46 pages extracted (pages 1-46), `confidence=0.8` per page, `extracted_at=2026-04-29`
- `bctc_vps_queue`: status=`done`, 1 attempt, PDF pulled from VPS on 2026-04-27

## Diagnosis

### PDF is present and extracted — but wrong pages were used

The PDF exists on disk: `/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf`

The balance sheet is spread across pages 4-7 of the PDF:
- Page 4: Current assets (labels + values in raw VND)
- Page 5: Non-current assets + `TỔNG CỘNG TÀI SẢN (270 = 100 + 200)` with grand total `~84 trillion VND raw`
- Page 6: Liabilities block
- Page 7: Equity + `TỔNG CỘNG NGUỒN VỐN (440=300+400) = 88,089,621,779,862 VND`

But the extractor was only called against pages 42-46 (subsidiary listing pages). Pages 4-7 contain the actual balance sheet.

### Root cause: page-range selection mismatch

FPT uses a **non-banking format** (Mẫu B01-DN/HN) with the unit declared as `Đơn vị: VND` (raw VND, not triệu). The split-block parser expects a date+unit header of the form `"31/12/2025 VND"` or `"Triệu VND"` to locate the separator.

Page 4 contains both:
- Date: `31/12/2025` appears in the values column header
- Unit: `VND` appears on the same line (`"MẪU SỐ B 01-DN/HN  Đơn vị: VND  31/12/2025  31/12/2024"`)

The UNIT_CONTAINS regex in `parseSplitBlockBalanceSheet`:
```
/tri[eệ]u\s+VND|(?<![\/\d])VND(?!\d)/i
```
requires `"Triệu VND"` OR bare `"VND"`. Page 4's OCR text has `"Đơn vị: VND"` — the negative lookbehind `(?<![\/\d])` should match. However, the FPT balance sheet is NOT split-block: labels and values appear **on the same lines** (inline format), not in separate label/value blocks. So `parseSplitBlockBalanceSheet` returns `null`, and the code falls through to `findValue`.

The real failure is `confidence_financial = 0` and `total_assets = 2`. This points to `findValue` matching incorrectly on the wrong pages. The extractor may have been called on concatenated pages 42-46 (thuyết minh), which contain subsidiary tables — not the balance sheet rows. The pattern `P_TOTAL_ASSETS` (`/t[ổo]ng\s+(?:c[ộo]ng\s+)?t[àa]i\s+s[ảa]n/i`) would fail to find a match on subsidiary pages, returning 0. After multiplier inference, `total_assets=2` suggests a misparse of a small integer.

The unit is `VND` (raw), so `detectUnitMultiplier` returns `-1` (bare VND sentinel). With `totalAssets = 0`, the magnitude branch never fires, and `effectiveMultiplier` is set to `1`. The raw value `2` passes through — which maps to `2 triệu` stored in the DB.

### Page feeding issue

The `bctcReparseJob` or equivalent must be feeding only certain pages (likely the last N pages as thuyết minh) to the extractor, skipping pages 4-7. This is a pipeline configuration bug, not an extractor logic bug.

## Files to Investigate

- The job that invokes `extractBalanceSheet` for a given ticker's PDF — locate how it selects which pages to pass as `rawText`
- `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts` — confirm `findValue` behavior when `rawText` contains no balance sheet rows
- `apps/mcp-server/src/domain/services/financial-reports/extractorGuards.ts` — check if `guardBalanceSheet` zeros out implausibly small values
- The page stitching logic: how pages from `pdf_extracted_text` are concatenated before calling `extractBalanceSheet`

## Acceptance Criteria

- After fix: `total_assets` for FPT Q4-2025 > 80,000,000 (triệu VND — i.e. ~80 trillion VND raw ÷ 1,000,000)
- `confidence_financial > 0` (non-zero financial confidence)
- `validation_status` != `low_confidence`
- Balance sheet identity check: `|total_assets - (total_liabilities + equity_total)| / total_assets < 0.01`
- Pages 4-7 of the FPT PDF are included in the text fed to `extractBalanceSheet`
- Unit multiplier `÷1,000,000` is applied (raw VND detected via sentinel `-1`, magnitude > 1B triggers `0.000001` multiplier)

## Architect Decision

### Confirmed root cause — full trace

`getCachedPdfText` in `pdfOcrWorker.ts` (line 282) runs:
```sql
SELECT text_content, confidence
FROM pdf_extracted_text
WHERE filename = ?
ORDER BY page_number
```
No page-range filter. All 46 pages are concatenated with `\n\n` and passed as `rawText` to `extractBalanceSheet`.

`extractSplitBlockAll` is called first. FPT uses inline format (Mẫu B01-DN/HN) — labels and values on the same line, not a split-block — so `parseSplitBlockBalanceSheet` returns `null` for every logical page in the text, and `extractSplitBlockAll` returns `null`. The `fv()` helper then falls back to `findValue(lines, ...)` for every field.

`findValue` scans the entire 46-page flat string from line 1. The balance-sheet content IS present (pages 4-7) but so are pages 42-46 (thuyết minh subsidiary tables). `P_TOTAL_ASSETS` (`/t[ổo]ng\s+(?:c[ộo]ng\s+)?t[àa]i\s+s[ảa]n/i`) matches a thuyết minh line before it reaches the correct page-5 line (or the page-5 line is shadowed by a subsidiary-table total that returns a small value like `2`). Result: `total_assets = 2`, `extraction_confidence ≈ 0`, `validation_status = low_confidence`.

**The bug is not in page selection upstream** (the reparse job and `fetchParseAndStoreBctc` correctly pass all pages — that is the right behaviour for VCB which needs pages from multiple logical sections). The bug is that `extractBalanceSheet` has no concept of which pages in a multi-page text blob are the balance sheet pages — it `findValue`-scans the entire corpus.

### Fix: balance-sheet window detector inside `extractBalanceSheet`

Add a `trimToBalanceSheetWindow` helper that runs before the `findValue` pass. It scans the lines array for the balance-sheet section anchor and returns a trimmed sub-array. The `findValue` calls then operate on the window only. `extractSplitBlockAll` is unaffected — it operates on the full text and handles page-boundary logic internally.

**Algorithm for `trimToBalanceSheetWindow(lines: string[]): string[]`:**

1. Find `windowStart`: the index of the first line matching any of:
   - `/[Mm][aẫâ][ụu]\s+[Ss][ốo]\s+B\s*0[12]/i` — Mẫu B01 or B02 header
   - `/[Bb][áa]o\s+c[áa]o\s+t[iì]nh\s+h[iì]nh\s+t[àa]i\s+ch[ií]nh/i` — the report title (already used in `extractSplitBlockAll`)

2. Find `windowEnd`: starting from `windowStart`, find the next line matching a thuyết minh boundary:
   - `/[Tt]huy[ếe]t\s+minh\s+(?:b[áa]o\s+c[áa]o|c[áa]c\s+ch[ỉi]\s+ti[êe]u)/i` — "Thuyết minh báo cáo tài chính" section header
   - `/[Bb][áa]o\s+c[áa]o\s+k[ếe]t\s+qu[ảa]/i` — income statement header (next statement)
   - `/[Ll][ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+t[ệe]/i` — cash flow statement header
   - Must be at least 80 lines after `windowStart` (minimum balance sheet body).

3. If `windowStart === -1`: return `lines` unchanged (defensive — unknown format, let the existing logic try).
4. If `windowEnd === -1`: return `lines.slice(windowStart)` (balance sheet to end of text).
5. Otherwise: return `lines.slice(windowStart, windowEnd)`.

This window is then used for all `findValue` calls. `extractSplitBlockAll` continues to receive the full `normalized` string because it handles its own page-splitting.

**Exact change to `extractBalanceSheet` in `balanceSheetExtractor.ts`:**

```typescript
// ADD this helper function before extractBalanceSheet:

/**
 * Trim a multi-page OCR text to the balance-sheet section only.
 *
 * Prevents findValue from matching patterns in thuyết minh / subsidiary
 * tables that appear after the balance sheet in long consolidated PDFs.
 *
 * Returns the original array unchanged when no anchor is found (unknown
 * format — existing behaviour is preserved).
 *
 * Task 1416b: fixes FPT Q4-2025 where pages 42-46 (thuyết minh) shadowed
 * the correct total_assets value on page 5.
 */
function trimToBalanceSheetWindow(lines: string[]): string[] {
  const P_BS_ANCHOR = /[Mm][aẫâ][ụu]\s*[Ss][ốo]\s*B\s*0[12]|[Bb][áa]o\s+c[áa]o\s+t[iì]nh\s+h[iì]nh\s+t[àa]i\s+ch[ií]nh/i;
  const P_BS_END = /[Tt]huy[ếe]t\s+minh\s+(?:b[áa]o\s+c[áa]o|c[áa]c\s+ch[ỉi]\s+ti[eê]u)|[Bb][áa]o\s+c[áa]o\s+k[ếe]t\s+qu[ảa]|[Ll][ưu]u\s+chuy[ểe]n\s+ti[ềe]n\s+t[ệe]/i;
  const MIN_BS_LINES = 80;

  let windowStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (P_BS_ANCHOR.test(lines[i]!)) {
      windowStart = i;
      break;
    }
  }
  if (windowStart === -1) return lines; // unknown format — no change

  let windowEnd = -1;
  for (let i = windowStart + MIN_BS_LINES; i < lines.length; i++) {
    if (P_BS_END.test(lines[i]!)) {
      windowEnd = i;
      break;
    }
  }

  return windowEnd === -1
    ? lines.slice(windowStart)
    : lines.slice(windowStart, windowEnd);
}
```

```typescript
// CHANGE in extractBalanceSheet — replace the single lines declaration:

// BEFORE:
const lines = normalized.split("\n");

// AFTER:
const allLines = normalized.split("\n");
const lines = trimToBalanceSheetWindow(allLines);
```

`extractSplitBlockAll(normalized)` call on the line below is unchanged — it still receives the full text.

### Why this is safe for VCB

VCB's text contains `"Báo cáo tình hình tài chính"` as the anchor. The window end detector will find `"Lưu chuyển tiền tệ"` (cash flow statement) or `"Thuyết minh báo cáo"` after the balance sheet section. All balance-sheet pages (including the multi-page split-block for VCB) fall between those two anchors. `extractSplitBlockAll` is independent and unaffected.

### Why total_assets = 2 specifically

`findValue` scanning 46 pages hits a subsidiary-table line that matches `P_TOTAL_ASSETS` and `extractNumber` returns `2` from something like `"Tổng cộng tài sản  2  100%"` (a subsidiary count or percentage column). The window fix eliminates this by confining the scan to pages 4-7 only.

### Test plan

**Unit tests** (new file `apps/mcp-server/src/__tests__/1416b-fpt-page-window.test.ts`):

1. Build a synthetic `rawText` that concatenates:
   - A balance-sheet block (pages 4-7 content with `"Mẫu B 01-DN/HN"` header and a `P_TOTAL_ASSETS` line returning value `84000000000000`)
   - A thuyết minh block (pages 42-46 with a `P_TOTAL_ASSETS`-matching line returning value `2`)
   In document order. Call `extractBalanceSheet(rawText)`. Assert `result.totalAssets > 1_000_000` (i.e. the large value was used, not `2`).

2. Test `trimToBalanceSheetWindow` directly:
   - Input: lines with Mẫu B01 header at line 10, then 100 lines of BS content, then "Báo cáo kết quả" at line 120.
   - Assert output starts at line 10, ends at line 119.
   - Input: no anchor → assert output === input (safety).

3. Regression test: pass a VNM split-block text through `extractBalanceSheet`. Assert `totalAssets` is unchanged vs the existing test fixture (split-block path unaffected).

**Integration / reparse check:**
- Trigger `runBctcReparseJob` for FPT Q4-2025 (or manually call `reparseSingle` for `20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf`).
- Assert: `total_assets > 80_000_000` (triệu), `confidence_financial > 0`, `validation_status != 'low_confidence'`.
- Assert: `ABS(total_assets - (total_liabilities + equity_total)) / total_assets < 0.01`.
- Unit multiplier: raw VND path fires (`detectUnitMultiplier` returns `-1`), `totalAssets > 1_000_000_000` raw triggers `effectiveMultiplier = 0.000001`, stored value = raw ÷ 1,000,000 triệu.

---
*Spec authored: 2026-04-29 | BA agent | Sprint 1416b*
*Architecture decision: 2026-04-29 | Architect | Sprint 1416*
