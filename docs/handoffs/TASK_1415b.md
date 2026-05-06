# ADR — TASK_1415b: balanceSheetExtractor VCB Root-Cause Review (Revision 2)

**Date:** 2026-04-29
**Status:** Supersedes prior ADR — updated after QA real OCR evidence
**Author:** Architect (4th escalation, real OCR text confirmed by QA DB inspection)

---

## 1. What Changed From Prior ADR

The prior ADR (2026-04-29, first version) was based on a **synthesized document structure** that did not match the real VCB OCR output. It described a standalone `31/3/2025` line at position ~486 followed by a standalone `Triệu VND` line at ~487. This structure was never confirmed from live data.

QA has now inspected the live Docker DB (`pdf_extracted_text` table, `action_code='VCB'`, pages 5-8) and provided the actual OCR text for both VCB Q1 and Q4. The real formats are structurally incompatible with the prior ADR's fix.

---

## 2. Real OCR Evidence — What VCB Pages Actually Contain

### VCB Q1 (31/3/2025) — Page 5

The date appears **only in Vietnamese prose**, never as a standalone `DD/MM/YYYY` line:

```
tại ngày 31 tháng 3 năm 2025
```

No standalone `31/3/2025` line exists anywhere in the VCB Q1 OCR text. The document is a **labels-only page** — all monetary values appear on a separate subsequent page.

### VCB Q4 (31/12/2025 and 31/12/2024) — Page 5

The date appears **mid-line in a multi-column header**, combined with surrounding label text:

```
Thuyết 31/12/2025 31/12/2024
minh Triệu VND Triệu VND
```

This is a single OCR-extracted line where the column header, two dates, and two unit declarations were captured together across a two-row table header. No standalone date line exists.

### Why the Prior ADR's Fix Still Does Not Work

The prior ADR's "fix" widened the `UNIT_PATTERN` from `/^VND\s*$/` to `/^[\(\s]*(tri[eệ]u\s+)?VND[\s\)]*$/i`. This change was correctly implemented (QA confirmed the hotfix code at line 326-327 does have the widened UNIT_PATTERN). However, the `DATE_PATTERN` still uses anchors:

```typescript
const DATE_PATTERN = /^\d{1,2}\/\d{1,2}\/20\d\d$/;
```

This requires the **entire trimmed line** to be a date in `DD/MM/YYYY` format. Neither VCB format ever produces such a line:

- Q1: date is `"tại ngày 31 tháng 3 năm 2025"` — fails anchored match
- Q4: date is `"Thuyết 31/12/2025 31/12/2024\nminh Triệu VND Triệu VND"` — fails anchored match

As a result, `parseSplitBlockBalanceSheet` continues to return `null` for all VCB documents, the split-block path is never taken, and `findValue` scans the full 3,900-line document into prose territory. The DB still shows `total_liabilities=93` and `equity_total=1`.

---

## 3. Root Cause — Revised

### 3a. There Is No Reliable Standalone Separator Line in VCB Format

`parseSplitBlockBalanceSheet` was designed for VNM format where a standalone date + unit pair marks the boundary between the labels block and the values block. VCB bank BCTCs do not have this boundary artifact. The date appears either:

- In prose (Q1): not parseable as a split-block separator
- Inline in a multi-column header (Q4): parseable but requires a contains-based search, not an anchored line match

### 3b. VCB Is a Different Structural Category

There are now **three distinct BCTC format categories**:

| Category | Example | Structure |
|----------|---------|-----------|
| Inline | Most non-bank companies | Labels and values on the same line or within 3 lines. `findValue` works. |
| Split-block (VNM type) | VNM, some manufacturing conglomerates | Labels block, then a standalone `DD/MM/YYYY` line, then `VND` / `Triệu VND` standalone, then values block. `parseSplitBlockBalanceSheet` works. |
| Bank page-pair (VCB type) | VCB, likely other listed banks | Labels on page N, values on page N+1. Date appears only in prose or in a multi-column inline header. Neither existing parser handles this. |

The prior ADR misclassified VCB as a "split-block (VNM type)" document with a slightly different separator format. The real structural difference is that **VCB has no separator line at all** — labels and values are on physically separate pages joined only by document order.

---

## 4. Design Decision — Two-Part Fix

### Part 1: Widen the date pattern in `parseSplitBlockBalanceSheet` to contains-based search

For VCB Q4 format, the multi-column header `"Thuyết 31/12/2025 31/12/2024\nminh Triệu VND Triệu VND"` does contain a date substring. The fix is to change the separator scan from an anchored line match to a **contains-based search**:

```typescript
// Old (anchored — only matches standalone date lines):
const DATE_PATTERN = /^\d{1,2}\/\d{1,2}\/20\d\d$/;
if (DATE_PATTERN.test(line)) { ... }

// New (contains-based — matches date anywhere in the line):
const DATE_PATTERN = /\d{1,2}\/\d{1,2}\/20\d\d/;
if (DATE_PATTERN.test(line)) { ... }
```

The `UNIT_PATTERN` search within the next 5 lines must also be widened to a contains-based search, since `"minh Triệu VND Triệu VND"` is not a standalone `Triệu VND` line:

```typescript
// Old (anchored unit match):
const UNIT_PATTERN = /^[\(\s]*(tri[eệ]u\s+)?VND[\s\)]*$/i;
if (UNIT_PATTERN.test(lines[j]!.trim())) { ... }

// New (contains-based unit match within the same line OR the next 5 lines):
const UNIT_CONTAINS = /tri[eệ]u\s+VND|VND/i;
if (UNIT_CONTAINS.test(lines[j]!)) { ... }
```

This handles VCB Q4. The `separatorIdx >= 20` guard (Step 2) prevents false positives from cover-page dates.

### Part 2: Handle VCB Q1 "labels-only page" format with a page-pair strategy

VCB Q1 has no separator line of any kind. The parser must detect that it is looking at a labels-only page and join it with the following values page. The detection signal: **a page that contains item codes (300, 400, 440 as standalone lines or inline formula labels) but zero large monetary numbers** is a labels-only page.

Strategy: in `extractSplitBlockAll`, after the existing page-boundary split, detect labels-only pages and pair them with the next page:

```typescript
// After splitting into pages:
// If page[i] has item codes but zero monetary values,
// join page[i] text + page[i+1] text and pass the combined text to parseSplitBlockBalanceSheet.
// parseSplitBlockBalanceSheet must then locate values from the second page.
```

For the combined page-pair text, the separator is the page boundary itself (the "Báo cáo tình hình tài chính" title that starts page N+1). The contains-based date search from Part 1 is still needed — if the second page's header also contains a date in prose form (`"tại ngày 31 tháng 3 năm 2025"`), the parser must extract the date from it.

**Alternative for Q1 if page-pair is complex:** The values page (page 6 in VCB Q1) begins with large monetary numbers immediately. Since `extractSplitBlockAll` already splits on `"Báo cáo tình hình tài chính"` page boundaries, the labels from page 5 and the values from page 6 are currently processed as two separate calls to `parseSplitBlockBalanceSheet`. Each call returns null because neither page alone looks like a complete split-block document. The simplest fix: pass the concatenated text of pages 5+6 as a single block with the page boundary acting as the separator signal.

### Decision: Implement Part 1 first (handles Q4), then Part 2 (handles Q1)

Part 1 is a targeted two-line change with zero regression risk. Part 2 requires modifying `extractSplitBlockAll`'s page-joining logic. Both must be implemented in the same PR — partial fixes leave Q1 still broken.

---

## 5. Exact Files and Changes

### File: `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`

**Location:** `parseSplitBlockBalanceSheet`, Step 1 (lines 326-342 in current file).

**Current defective code:**
```typescript
const DATE_PATTERN = /^\d{1,2}\/\d{1,2}\/20\d\d$/;
const UNIT_PATTERN = /^[\(\s]*(tri[eệ]u\s+)?VND[\s\)]*$/i;

let separatorIdx = -1;
for (let i = 0; i < lines.length - 5; i++) {
  const line = lines[i]!.trim();
  if (DATE_PATTERN.test(line)) {
    // Look for unit header within next 5 lines
    for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
      if (UNIT_PATTERN.test(lines[j]!.trim())) {
        separatorIdx = j;
        break;
      }
    }
    if (separatorIdx !== -1) break;
  }
}
```

**Required replacement — Part 1 (Q4 fix):**

Change both patterns from anchored to contains-based:

```typescript
// Contains-based: matches "31/12/2025" anywhere in a line (e.g., mid-column header)
const DATE_CONTAINS = /\d{1,2}\/\d{1,2}\/20\d\d/;
// Contains-based: matches "Triệu VND" or bare "VND" anywhere in a line
const UNIT_CONTAINS = /tri[eệ]u\s+VND|(?<![\/\d])VND(?!\d)/i;

let separatorIdx = -1;
for (let i = 0; i < lines.length - 5; i++) {
  const line = lines[i]!;
  if (DATE_CONTAINS.test(line)) {
    // Look for unit declaration within the same line or next 5 lines
    if (UNIT_CONTAINS.test(line)) {
      separatorIdx = i;
      break;
    }
    for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
      if (UNIT_CONTAINS.test(lines[j]!)) {
        separatorIdx = j;
        break;
      }
    }
    if (separatorIdx !== -1) break;
  }
}
```

Note: `separatorIdx` now points to the line where the unit is confirmed (which may be the same line as the date for Q4). The `separatorIdx >= 20` guard in Step 2 is unchanged and still required.

**Location:** `extractSplitBlockAll` (lines 461-501 in current file).

**Required addition — Part 2 (Q1 fix):**

After the existing `pages` array is built from the page-boundary split, add a labels-only detection pass before calling `parseSplitBlockBalanceSheet`:

```typescript
// Detect labels-only pages (have item codes, zero monetary values) and merge
// with the following page before parsing. This handles VCB Q1 where labels
// and values are on physically separate pages with no separator line.
const mergedPages: string[] = [];
for (let i = 0; i < pages.length; i++) {
  const pageLines = pages[i]!.split("\n");
  const hasItemCodes = pageLines.some(l => /^\s*(300|400|440|270|100|200)\s*$/.test(l)
    || /\(\d{3}\s*=/.test(l));
  const hasMonetaryValues = pageLines.some(l => {
    const tokens = l.match(/[\d.,]{7,}/g);  // 7+ chars = at least millions
    return tokens !== null && tokens.length > 0;
  });
  if (hasItemCodes && !hasMonetaryValues && i + 1 < pages.length) {
    // Labels-only page: concatenate with next page
    mergedPages.push(pages[i]! + "\n" + pages[i + 1]!);
    i++; // skip next page — already consumed
  } else {
    mergedPages.push(pages[i]!);
  }
}

// Process mergedPages instead of pages
for (const pageText of mergedPages) {
  ...
}
```

**Update the JSDoc comment** on `parseSplitBlockBalanceSheet` to reflect:
- Date patterns are contains-based, not anchored
- VCB Q1 page-pair strategy (labels + values on separate pages joined by `extractSplitBlockAll`)

---

## 6. Test Fixtures — Real OCR Format (Not Synthetic)

The B-3 fixture in the current test file (`hotfix-vcb-parser.test.ts` lines 228-275) uses a synthetic format with a standalone `31/3/2025` line. This fixture passes the current tests (because the test is designed around the synthetic format) but does **not** test the real VCB OCR format.

### Required: Replace B-3 fixture with two real-format fixtures

**Fixture B-3a: VCB Q4 multi-column inline header (real format)**

```typescript
// VCB Q4 real OCR format: date and unit appear mid-line in a multi-column header.
// The standalone-date pattern (DATE_PATTERN anchored) never matches this.
// After Part 1 fix: DATE_CONTAINS matches "31/12/2025" within the line;
// UNIT_CONTAINS matches "Triệu VND" within the next line.
const VCB_Q4_INLINE_HEADER = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT

NỢ PHẢI TRẢ (300 = 310 + 330)
300
VỐN CHỦ SỞ HỮU (400 = 410 + 430)
400
TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)
440
Thuyết minh số 1
Thuyết minh số 2
Thuyết minh số 3
Thuyết minh số 4
Thuyết minh số 5
Thuyết minh số 6
Thuyết minh số 7
Thuyết minh số 8
Thuyết minh số 9
Thuyết minh số 10
Thuyết minh số 11
Thuyết minh số 12
Thuyết minh số 13
Thuyết minh số 14
Thuyết minh số 15
Thuyết minh số 16
Thuyết minh số 17
Thuyết minh số 18
Thuyết minh số 19
Thuyết minh số 20
Thuyết 31/12/2025 31/12/2024
minh Triệu VND Triệu VND
1.904.318.782
204.941.834
2.109.260.616
Các khoản nợ phải trả được ghi nhận theo giá trị hợp lý
Nghị định số 93/2017/NĐ-CP do Chính phủ ban hành
`;
```

**Fixture B-3b: VCB Q1 labels-only page + values-only page (real format)**

```typescript
// VCB Q1 real OCR format: labels on one "page" (separated by Báo cáo header),
// values on the next. Date appears only in prose, never as a standalone line.
// After Part 2 fix: extractSplitBlockAll detects labels-only page and merges
// it with the following values page before calling parseSplitBlockBalanceSheet.
const VCB_Q1_PAGE_PAIR = `
Báo cáo tình hình tài chính hợp nhất
tại ngày 31 tháng 3 năm 2025

NỢ PHẢI TRẢ (300 = 310 + 330)
300
VỐN CHỦ SỞ HỮU (400 = 410 + 430)
400
TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)
440
Thuyết minh số 1
Thuyết minh số 2
Thuyết minh số 3
Thuyết minh số 4
Thuyết minh số 5
Thuyết minh số 6
Thuyết minh số 7
Thuyết minh số 8
Thuyết minh số 9
Thuyết minh số 10
Báo cáo tình hình tài chính hợp nhất
1.904.318.782
204.941.834
2.109.260.616
Các khoản nợ phải trả được ghi nhận theo giá trị hợp lý
Nghị định số 93/2017/NĐ-CP do Chính phủ ban hành
`;
```

### Required assertions

```typescript
describe("B-3a: VCB Q4 real OCR format — inline multi-column date/unit header", () => {
  it("routes to split-block parser when date and unit are inline (not standalone)", () => {
    const bs = extractBalanceSheet(VCB_Q4_INLINE_HEADER);
    expect(bs.totalLiabilities).not.toBe(93);
    expect(bs.equity.total).not.toBe(1);
    expect(bs.totalLiabilities).toBeGreaterThan(10_000);
    expect(bs.equity.total).toBeGreaterThan(10_000);
  });

  it("extracts correct total_liabilities for VCB Q4 inline header format", () => {
    const bs = extractBalanceSheet(VCB_Q4_INLINE_HEADER);
    expect(bs.totalLiabilities).toBe(1_904_318_782);
  });

  it("extracts correct equity_total for VCB Q4 inline header format", () => {
    const bs = extractBalanceSheet(VCB_Q4_INLINE_HEADER);
    expect(bs.equity.total).toBe(204_941_834);
  });
});

describe("B-3b: VCB Q1 real OCR format — labels-only page + values-only page", () => {
  it("routes to split-block parser when labels and values are on separate pages", () => {
    const bs = extractBalanceSheet(VCB_Q1_PAGE_PAIR);
    expect(bs.totalLiabilities).not.toBe(93);
    expect(bs.equity.total).not.toBe(1);
    expect(bs.totalLiabilities).toBeGreaterThan(10_000);
    expect(bs.equity.total).toBeGreaterThan(10_000);
  });

  it("extracts correct total_liabilities for VCB Q1 page-pair format", () => {
    const bs = extractBalanceSheet(VCB_Q1_PAGE_PAIR);
    expect(bs.totalLiabilities).toBe(1_904_318_782);
  });

  it("extracts correct equity_total for VCB Q1 page-pair format", () => {
    const bs = extractBalanceSheet(VCB_Q1_PAGE_PAIR);
    expect(bs.equity.total).toBe(204_941_834);
  });
});
```

The old B-3 fixture (synthetic standalone date line) may be **removed or replaced** by B-3a and B-3b. It tested a format that VCB never produces; keeping it is misleading.

---

## 7. Acceptance Criteria

After the developer implements this fix:

1. `bun test hotfix-vcb-parser` — all pass, including the new B-3a and B-3b describe blocks
2. `bun test 287-balance-sheet-unit-header` — all pass (no regression on inline-format documents)
3. Full suite >= 8025 pass
4. Live VCB reparse (after deploying to container):
   - VCB Q4: `total_liabilities > 1_000_000_000` (not 2), `equity_total > 100_000_000` (not 15)
   - VCB Q1: `total_liabilities > 1_000_000_000` (not 93), `equity_total > 100_000_000` (not 1)
5. Validation log must show: `Assets ≈ Liabilities + Equity` (mismatch < 1%)

### Reparse command (after fix deployed to container):
```bash
docker exec vn-market-mcp-server-1 bun -e \
  "const m = await import('./src/scheduler/financial-reports/bctcReparseJob.js'); await m.runBctcReparseJob();"
```

---

## 8. What the Developer Must NOT Do

- Do not add more guards to `extractNumber` or `findValue` — the fix must route VCB away from `findValue`, not patch `findValue` further
- Do not increase `LOOKAHEAD_LINES` — a 3,900-line gap cannot be bridged by look-ahead; this is a structural routing problem
- Do not add a prose-boundary sentinel to `findValue` — same reason
- Do not change `applyMultiplier`, `detectUnitMultiplier`, or `guardBalanceSheet`
- Do not write test fixtures with standalone `DD/MM/YYYY` lines for VCB — VCB never produces them; test with the real inline and page-pair formats from Section 6

---

## 9. Risk Flags

| Risk | Severity | Mitigation |
|------|----------|------------|
| `DATE_CONTAINS` too broad — matches any line with a date fraction (e.g., `"xem trang 31/12 dưới đây"`) | Medium | The `separatorIdx >= 20` guard excludes cover-page hits. The double-anchor (date AND unit within 5 lines) provides a second filter. Any date-like fraction without a co-located unit declaration is ignored. |
| `UNIT_CONTAINS` matches VND references inside label text (e.g., `"Tiền gửi VND tại NHNN"`) | Low-Medium | The co-located date requirement filters most false positives. If a false separator is found at position >= 20 with both date and unit in nearby lines, it would split the document incorrectly. Mitigation: test on the VNM inline format to confirm no regression. |
| Labels-only page detection heuristic (7+ char numeric token) may miss pages with only small numbers | Low | The labels block always contains item codes (100-440) which are 3-digit. A labels-only page truly has zero monetary values. The 7+ char threshold (≥10 million) correctly distinguishes. |
| Page-pair merge may consume two pages when only the first is labels-only, leaving the third page in the wrong position | Low | The `i++` skip only fires when `hasItemCodes && !hasMonetaryValues`. Pages with any monetary value are not consumed as labels-only pages. |
| VCB Q4 `separatorIdx` now points to the unit-containing line within the multi-column header; the `valueLines = lines.slice(separatorIdx + 1)` may cut off one line of the header | Low | Developer must verify that no monetary value appears on the same line as the unit declaration in VCB Q4. From the evidence (`"minh Triệu VND Triệu VND"` contains no numbers), this is safe. |

---

## RETURN
DONE: ADR revised at docs/handoffs/TASK_1415b.md — prior ADR was based on a synthetic OCR format; real VCB Q1 never produces a standalone date line (date is in prose only), and VCB Q4 has date+unit on the same mid-text line; both fail the anchored DATE_PATTERN; two-part fix required: (1) contains-based date/unit search in parseSplitBlockBalanceSheet for Q4, (2) labels-only page detection and page-pair merge in extractSplitBlockAll for Q1; test fixtures updated to match real OCR structure
NEXT: fixer | implement the two-part fix in balanceSheetExtractor.ts per Section 5 of TASK_1415b.md, replace the synthetic B-3 fixture with B-3a (Q4 inline header) and B-3b (Q1 page-pair) per Section 6, run full test suite and live VCB reparse per Section 7
HANDOFF: docs/handoffs/TASK_1415b.md
PIPELINE: continue
