# TECH-047: BCTC Extraction Repair

status: APPROVED_BY_ARCHITECT
req_ref: REQ-047

---

## Brownfield Impact

- **Files modified**:
  - `src/domain/services/balanceSheetExtractor.ts` (FR-1, FR-2, FR-3 partial)
  - `src/domain/services/incomeStatementExtractor.ts` (FR-3)
  - `src/application/usecases/fetchParseAndStoreBctc.ts` (FR-4)
  - `src/application/usecases/checkSscReports.ts` (FR-5)

- **Files created**:
  - `src/__tests__/287-balance-sheet-unit-header.test.ts`
  - `src/__tests__/288-income-stmt-diacritic.test.ts`
  - `src/__tests__/289-fetch-pdfurl-bypass.test.ts`
  - `src/__tests__/290-check-ssc-quarter-derive.test.ts`
  - `src/__tests__/291-bctc-smoke-vnm.test.ts`

- **Files deleted**: none

- **Breaking changes**: No. All existing public function signatures are preserved.
  `FetchParseAndStoreBctcParams` gains an optional field — callers without `pdfUrl`
  are unaffected. `extractBalanceSheet` and `extractIncomeStatement` signatures
  are unchanged; the NFC step is transparent to existing synthetic test samples.

---

## Architecture Decision

All five bugs live in exactly three layers: domain (extractors), application
(pipeline orchestration), and application (SSC checker). Each fix is contained
within its own layer with zero cross-layer import changes. The NFC normalization
approach (preprocess the entire `rawText` once before splitting lines) is chosen
over per-pattern dual-regex because it is simpler, faster, and covers all
decomposed-diacritic edge cases in a single pass rather than doubling the number
of regex objects. The `pdfUrl` bypass in `fetchParseAndStoreBctc` is implemented
as an optional param rather than a new overload to remain consistent with the
existing injectable-dependency pattern already used by `sscHttpClient`,
`pdfHttpClient`, and `pdfTextOverride`.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `extractBalanceSheet` — unit header | domain | `src/domain/services/balanceSheetExtractor.ts` | MODIFY |
| `extractBalanceSheet` — row-code guard | domain | `src/domain/services/balanceSheetExtractor.ts` | MODIFY |
| `extractBalanceSheet` — NFC normalization | domain | `src/domain/services/balanceSheetExtractor.ts` | MODIFY |
| `extractIncomeStatement` — NFC + ASCII fallback | domain | `src/domain/services/incomeStatementExtractor.ts` | MODIFY |
| `fetchParseAndStoreBctc` — pdfUrl param | application | `src/application/usecases/fetchParseAndStoreBctc.ts` | MODIFY |
| `checkSscReports` — defaultPipeline fix | application | `src/application/usecases/checkSscReports.ts` | MODIFY |
| Task 287 unit tests | test | `src/__tests__/287-balance-sheet-unit-header.test.ts` | NEW |
| Task 288 unit tests | test | `src/__tests__/288-income-stmt-diacritic.test.ts` | NEW |
| Task 289 unit tests | test | `src/__tests__/289-fetch-pdfurl-bypass.test.ts` | NEW |
| Task 290 unit tests | test | `src/__tests__/290-check-ssc-quarter-derive.test.ts` | NEW |
| Task 291 smoke test | test | `src/__tests__/291-bctc-smoke-vnm.test.ts` | NEW |

---

## Interface Contracts

### FR-1 + FR-2 + FR-3 partial: `balanceSheetExtractor.ts`

No exported interface changes. Internal changes only:

```typescript
// Step 1 — NFC normalization (top of extractBalanceSheet)
const normalized = rawText.normalize("NFC");
const lines = normalized.split("\n");

// Step 2 — Unit header detection (before any findValue calls)
function detectUnitMultiplier(lines: string[]): number {
  const P_UNIT_TRIEU = /[đd][oơ]n\s+v[iị]\s+(t[íi]nh|:)\s*:?\s*(tri[eệ]u|trieu)/i;
  const P_UNIT_TY    = /[đd][oơ]n\s+v[iị]\s+(t[íi]nh|:)\s*:?\s*t[yỷ]/i;
  for (const line of lines) {
    if (P_UNIT_TRIEU.test(line)) return 1;
    if (P_UNIT_TY.test(line))    return 1000;
  }
  // No header found — default 1, caller logs warning
  return 1;
}

// Step 3 — Row-code guard: findValue skips lines where the trailing token
// is a whole integer multiple of 10 in [10, 990].
// This replaces the current findValue() body with:
function findValue(lines: string[], pattern: RegExp): number {
  for (const line of lines) {
    if (!pattern.test(line)) continue;
    const val = extractNumber(line);
    if (val === null) continue;
    // Guard: skip row-code artifacts (multiples of 10 in [10, 990])
    if (Number.isInteger(val) && val >= 10 && val <= 990 && val % 10 === 0) continue;
    return val;
  }
  return 0;
}

// Step 4 — Apply multiplier to every monetary field in the returned BalanceSheet
// (all fields except EPS, which does not exist on BalanceSheet)
// After all findValue calls, before the return statement:
function applyMultiplier(bs: BalanceSheet, m: number): BalanceSheet {
  if (m === 1) return bs;
  // Deep-multiply every numeric leaf; structural objects are re-assigned inline.
  // Implementation: multiply each leaf field (no reflection needed — field list is fixed).
}
```

Key constraint: `detectUnitMultiplier` must scan the same `lines` array used for
extraction; do not split `rawText` twice.

### FR-3: `incomeStatementExtractor.ts`

Chosen approach: **single NFC + diacritic-strip preprocessing** (simpler than
per-pattern dual regex; also keeps existing patterns unchanged).

```typescript
// Strip combining diacritical marks from a string (pure ASCII output).
function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function extractIncomeStatement(rawText: string): IncomeStatement {
  // Primary: NFC-normalized lines (handles NFD decomposition artifacts)
  const primaryLines = rawText.normalize("NFC").split("\n");

  // Fallback: fully ASCII-stripped lines (handles complete diacritic loss)
  const fallbackLines = stripDiacritics(rawText.normalize("NFC")).split("\n");

  // findValue tries primary first; falls back to ASCII lines if result is 0.
  // Implementation: refactor findValue to accept two line arrays.
  ...
}
```

The `fallbackLines` approach requires rewriting `findValue` to accept an optional
second array:

```typescript
function findValue(
  primaryLines: string[],
  pattern: RegExp,
  fallbackLines?: string[],
  fallbackPattern?: RegExp,
): number {
  // Try primary
  for (const line of primaryLines) {
    if (pattern.test(line)) {
      const val = extractNumber(line);
      if (val !== null) return val;
    }
  }
  // Try fallback
  if (fallbackLines) {
    const fp = fallbackPattern ?? pattern;
    for (const line of fallbackLines) {
      if (fp.test(line)) {
        const val = extractNumber(line);
        if (val !== null) return val;
      }
    }
  }
  return 0;
}
```

For the income statement, the ASCII-stripped lines will match the existing
diacritic-tolerant character-class patterns in the majority of cases (since the
patterns already use `[àa]`, `[ảa]`, etc.) BUT they will fail on full ASCII
because the character classes don't include plain ASCII. Therefore companion
ASCII-only patterns must be added for each field.

**ASCII companion patterns** (each has the same logical structure as the primary
but uses only plain a-z letters):

| Primary constant | ASCII companion |
|---|---|
| `P_GROSS_REVENUE` `/doanh\s+thu\s+b[áa]n\s+h[àa]ng/i` | `P_GROSS_REVENUE_ASCII` `/doanh\s+thu\s+ban\s+hang/i` |
| `P_REVENUE_DEDUCTIONS` `/gi[ảa]m\s+tr[ừu]\s+doanh\s+thu/i` | `P_REVENUE_DEDUCTIONS_ASCII` `/giam\s+tru\s+doanh\s+thu/i` |
| `P_NET_REVENUE` `/doanh\s+thu\s+thu[ầa]n/i` | `P_NET_REVENUE_ASCII` `/doanh\s+thu\s+thuan/i` |
| `P_COGS` `/gi[áa]\s+v[ốo]n\s+h[àa]ng\s+b[áa]n/i` | `P_COGS_ASCII` `/gia\s+von\s+hang\s+ban/i` |
| `P_GROSS_PROFIT` `/l[ợo]i\s+nhu[ậa]n\s+g[ộo]p/i` | `P_GROSS_PROFIT_ASCII` `/loi\s+nhuan\s+gop/i` |
| `P_FINANCIAL_INCOME` `/doanh\s+thu\s+ho[ạa]t\s+[đd][ộo]ng\s+t[àa]i\s+ch[ía]nh/i` | `P_FINANCIAL_INCOME_ASCII` `/doanh\s+thu\s+hoat\s+dong\s+tai\s+chinh/i` |
| `P_FINANCIAL_EXPENSES` `/chi\s+ph[ía]\s+t[àa]i\s+ch[ía]nh/i` | `P_FINANCIAL_EXPENSES_ASCII` `/chi\s+phi\s+tai\s+chinh/i` |
| `P_INTEREST_EXPENSES` `/chi\s+ph[ía]\s+l[ãa]i\s+vay/i` | `P_INTEREST_EXPENSES_ASCII` `/chi\s+phi\s+lai\s+vay/i` |
| `P_SHARE_OF_ASSOCIATES` `/ph[ầa]n\s+l[ãa]i[\/\s]l[ỗo]\s+.*li[êe]n\s+k[ếe]t/i` | `P_SHARE_OF_ASSOCIATES_ASCII` `/phan\s+lai.{0,10}lien\s+ket/i` |
| `P_SELLING_EXPENSES` `/chi\s+ph[ía]\s+b[áa]n\s+h[àa]ng/i` | `P_SELLING_EXPENSES_ASCII` `/chi\s+phi\s+ban\s+hang/i` |
| `P_ADMIN_EXPENSES` `/chi\s+ph[ía]\s+qu[ảa]n\s+l[ýy]\s+doanh\s+nghi[ệe]p/i` | `P_ADMIN_EXPENSES_ASCII` `/chi\s+phi\s+quan\s+ly\s+doanh\s+nghiep/i` |
| `P_OPERATING_PROFIT` (complex alternation) | `P_OPERATING_PROFIT_ASCII` `/loi\s+nhuan\s+thuan\s+tu\s+.{0,20}hoat\s+dong\s+kinh\s+doanh/i` |
| `P_OTHER_INCOME` `/thu\s+nh[ậa]p\s+kh[áa]c/i` | `P_OTHER_INCOME_ASCII` `/thu\s+nhap\s+khac/i` |
| `P_OTHER_EXPENSES` `/chi\s+ph[ía]\s+kh[áa]c/i` | `P_OTHER_EXPENSES_ASCII` `/chi\s+phi\s+khac/i` |
| `P_OTHER_PROFIT` `/l[ợo]i\s+nhu[ậa]n\s+kh[áa]c/i` | `P_OTHER_PROFIT_ASCII` `/loi\s+nhuan\s+khac/i` |
| `P_PROFIT_BEFORE_TAX` (complex alternation) | `P_PROFIT_BEFORE_TAX_ASCII` `/loi\s+nhuan\s+.{0,20}truoc\s+thue/i` |
| `P_INCOME_TAX_CURRENT` | `P_INCOME_TAX_CURRENT_ASCII` `/thue\s+TNDN\s+hien\s+hanh|thue\s+.{0,10}hien\s+hanh/i` |
| `P_INCOME_TAX_DEFERRED` | `P_INCOME_TAX_DEFERRED_ASCII` `/thue\s+TNDN\s+hoan\s+lai|thue\s+.{0,10}hoan\s+lai/i` |
| `P_TOTAL_INCOME_TAX` | `P_TOTAL_INCOME_TAX_ASCII` `/tong\s+chi\s+phi\s+thue\s+TNDN/i` |
| `P_NET_PROFIT` `/l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe]/i` | `P_NET_PROFIT_ASCII` `/loi\s+nhuan\s+sau\s+thue/i` |
| `P_MINORITY_INTEREST` | `P_MINORITY_INTEREST_ASCII` `/loi\s+ich\s+.{0,10}co\s+dong\s+khong\s+kiem\s+soat/i` |
| `P_NET_PROFIT_PARENT` | `P_NET_PROFIT_PARENT_ASCII` `/LNST\s+cua\s+co\s+dong\s+cong\s+ty\s+me|loi\s+nhuan\s+sau\s+thue\s+cua\s+co\s+dong\s+cong\s+ty\s+me/i` |
| `P_EPS` `/l[ãa]i\s+c[ơo]\s+b[ảa]n\s+tr[êe]n\s+c[ổo]\s+phi[ếe]u/i` | `P_EPS_ASCII` `/lai\s+co\s+ban\s+tren\s+co\s+phieu/i` |
| `P_DILUTED_EPS` | `P_DILUTED_EPS_ASCII` `/lai\s+suy\s+giam\s+tren\s+co\s+phieu|lai\s+pha\s+loang\s+tren\s+co\s+phieu/i` |

Every `findValue` call in `extractIncomeStatement` is updated to pass the
corresponding ASCII companion:

```typescript
const netRevenue = findValue(primaryLines, P_NET_REVENUE, fallbackLines, P_NET_REVENUE_ASCII);
```

### FR-4: `fetchParseAndStoreBctc.ts` — interface extension

```typescript
export interface FetchParseAndStoreBctcParams {
  actionCode: string;
  year: number;
  quarter: QuarterString;
  pdfUrl?: string;            // NEW — if set, skip listSscDocuments (Step 1)
  sscHttpClient?: BrowserFactory;
  pdfHttpClient?: HttpClient;
  pdfTextOverride?: string;
  insertAnalysisFn?: InsertAnalysisFn;
}
```

Step 1 branching logic:

```typescript
let doc: { url: string; publishedAt: string };

if (params.pdfUrl && params.pdfUrl.trim().length > 0) {
  logger.info(`${tag} [step 1 SKIPPED — pdfUrl provided]`);
  doc = { url: params.pdfUrl, publishedAt: "" };
} else {
  logger.info(`${tag} step 1: listing SSC documents`);
  const docs = await listSscDocuments(actionCode, "quarterly", year, sscHttpClient);
  if (docs.length === 0) {
    logger.warn(`${tag} no documents found — aborting`);
    return null;
  }
  doc = docs[0]!;
  logger.info(`${tag} using document`, { url: doc.url, publishedAt: doc.publishedAt });
}
```

The rest of the pipeline (Step 2 through Step 4) is unchanged. `pdfTextOverride`
continues to take precedence over real PDF download because its check (`if
(pdfTextOverride !== undefined)`) is the first branch in Step 2, regardless of
whether `pdfUrl` was used.

### FR-5: `checkSscReports.ts` — quarter derivation helper + defaultPipeline fix

New private helper (pure function, no I/O):

```typescript
/**
 * Derive a fiscal quarter string from an SSC document's publishedAt date.
 * Applies Vietnamese reporting calendar:
 *   Jan–Apr  → Q4 of previous year  (annual/Q4 deadline is April)
 *   May–Jul  → Q1 of current year
 *   Aug–Oct  → Q2 of current year
 *   Nov–Dec  → Q3 of current year
 *
 * @param publishedAt - Date string, "DD/MM/YYYY" or ISO "YYYY-MM-DD"
 * @returns { year: number; quarter: QuarterString }
 */
function deriveQuarterFromPublishedAt(publishedAt: string): {
  year: number;
  quarter: import("./fetchParseAndStoreBctc.js").QuarterString;
} {
  let date: Date | null = null;

  // Try DD/MM/YYYY
  const ddmmyyyy = publishedAt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    date = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
  }

  // Try ISO 8601
  if (!date || isNaN(date.getTime())) {
    const iso = new Date(publishedAt);
    if (!isNaN(iso.getTime())) date = iso;
  }

  const fallbackYear = new Date().getFullYear();

  if (!date || isNaN(date.getTime())) {
    logger.warn(`[checkSscReports] cannot parse publishedAt="${publishedAt}" — defaulting to Q1/${fallbackYear}`);
    return { year: fallbackYear, quarter: "Q1" };
  }

  const month = date.getMonth() + 1; // 1-based
  const calYear = date.getFullYear();

  if (month >= 1 && month <= 4)  return { year: calYear - 1, quarter: "Q4" };
  if (month >= 5 && month <= 7)  return { year: calYear,     quarter: "Q1" };
  if (month >= 8 && month <= 10) return { year: calYear,     quarter: "Q2" };
  /* month 11–12 */               return { year: calYear,     quarter: "Q3" };
}
```

Updated `defaultPipeline`:

```typescript
async function defaultPipeline(params: PipelineParams): Promise<unknown> {
  const { fetchParseAndStoreBctc } = await import("./fetchParseAndStoreBctc.js");
  const { QuarterString } = await import("./fetchParseAndStoreBctc.js"); // type only

  const { year, quarter } = deriveQuarterFromPublishedAt(params.publishedAt);

  return fetchParseAndStoreBctc({
    actionCode: params.actionCode,
    year,
    quarter,
    pdfUrl: params.pdfUrl,
  });
}
```

---

## Task Breakdown (for PM)

Suggested atomic tasks in dependency order matching TASKS.md numbering:

1. **Task 287** — Domain: `balanceSheetExtractor` repairs (FR-1 + FR-2 + FR-3 partial NFC)
   - Subtask 287a: `detectUnitMultiplier()` + `applyMultiplier()` + multiplier wiring
   - Subtask 287b: row-code guard in `findValue()` (multiple-of-10 heuristic)
   - Subtask 287c: NFC normalization at top of `extractBalanceSheet()`
   - New test file: `287-balance-sheet-unit-header.test.ts`
   - Backward-compatibility check: all 5 tests in `042-bctc-balance-sheet.test.ts` must pass

2. **Task 288** — Domain: `incomeStatementExtractor` NFC + ASCII fallback (FR-3)
   - Add `stripDiacritics()` helper
   - Add ASCII companion patterns for all 24 field patterns
   - Refactor `findValue()` to accept optional fallback lines + fallback pattern
   - New test file: `288-income-stmt-diacritic.test.ts`
   - Backward-compatibility check: all 7 tests in `043-bctc-income-stmt.test.ts` must pass

3. **Task 289** — Application: `fetchParseAndStoreBctc` optional `pdfUrl` param (FR-4)
   - Depends on: nothing (independent of 287/288)
   - New test file: `289-fetch-pdfurl-bypass.test.ts`

4. **Task 290** — Application: `checkSscReports` `defaultPipeline` fix (FR-5)
   - Depends on: Task 289 (imports `QuarterString` type and calls updated pipeline)
   - Add `deriveQuarterFromPublishedAt()` helper
   - Replace `defaultPipeline` body
   - New test file: `290-check-ssc-quarter-derive.test.ts`

5. **Task 291** — Integration smoke test VNM real PDF (FR-6)
   - Depends on: 287, 288, 289, 290
   - New test file: `291-bctc-smoke-vnm.test.ts`
   - Skip if PDF file absent (`existsSync` guard)
   - Assert both `extractBalanceSheet` and `extractIncomeStatement` magnitude ranges

---

## Implementation Notes by Task

### Task 287 — balanceSheetExtractor

**`detectUnitMultiplier` placement**: call it before the first `findValue` call.
Store result in `const multiplier = detectUnitMultiplier(lines)`.

**`applyMultiplier` implementation**: The `BalanceSheet` type has 3 nested objects
(`currentAssets`, `nonCurrentAssets`, `currentLiabilities`, `longTermLiabilities`,
`equity`) each with their own numeric fields plus top-level scalar fields
(`totalAssets`, `totalLiabilities`, `totalLiabilitiesAndEquity`). Rather than
reflection, multiply each field explicitly. There are approximately 30 numeric
leaf fields — this is mechanical but unambiguous.

**Row-code guard boundary case**: the existing test `SAMPLE_MINIMAL` contains
`totalAssets = 1_000_000` and `equity.total = 400_000` — both are above 990, so
the guard does not interfere. `SAMPLE_FULL` has no values in [10, 990]. The guard
is safe for all existing test samples.

**NFC transparency**: all existing synthetic samples in `042-bctc-balance-sheet.test.ts`
use pre-composed Unicode (standard keyboard input); NFC normalization is a no-op
on already-composed text.

**`detectUnitMultiplier` must scan only the first N lines** (e.g. first 20) to
avoid false positives in body text. In practice the unit header appears in the
first 5-10 lines of a BCTC PDF, but scanning all lines is also acceptable since
the patterns are specific enough to not appear in financial data rows.

### Task 288 — incomeStatementExtractor

**`extractNumber` duplication**: both `balanceSheetExtractor.ts` and
`incomeStatementExtractor.ts` define their own local `extractNumber` — this
duplication is pre-existing and must NOT be consolidated in this sprint (out of
scope; would require a new shared domain utility and touches unrelated tests).

**`findValue` signature change in income extractor**: the new signature
`findValue(primaryLines, pattern, fallbackLines?, fallbackPattern?)` is
backward-compatible — the two-argument call `findValue(lines, pattern)` still
works if `fallbackLines` is undefined.

**ASCII patterns and the `d` / `đ` problem**: When diacritics are fully stripped,
`đ` (U+0111) becomes `d`. The existing patterns already account for this with
`[đd]`. The ASCII companion patterns can therefore use only `d` since the
fallback lines will have no `đ` characters.

**`P_OPERATING_PROFIT` and `P_PROFIT_BEFORE_TAX`**: these use complex alternation
regexes. The ASCII companions should use a liberal `.*` to handle variations:
- `P_OPERATING_PROFIT_ASCII`: `/loi\s+nhuan\s+thuan\s+tu\s+.{0,30}kinh\s+doanh/i`
  also captures the "HDKD" abbreviation form via:
  `/loi\s+nhuan\s+thuan\s+tu\s+H[DĐ]KD/i` (the primary already handles this)
  For the ASCII fallback use: `/loi\s+nhuan\s+thuan\s+tu\s+(hoat\s+dong\s+kinh\s+doanh|HDKD)/i`
- `P_PROFIT_BEFORE_TAX_ASCII`: `/loi\s+nhuan\s+.{0,30}truoc\s+thue/i`

**EPS vs diluted EPS ordering**: the comment in the original code notes that
diluted EPS must be searched BEFORE basic EPS. This order is preserved in the
refactored implementation.

### Task 289 — fetchParseAndStoreBctc

**`doc.publishedAt` when pdfUrl is provided**: set to `""` in the synthetic
`doc` object. The existing line `report.source.publishedAt = doc.publishedAt ||
report.source.parsedAt` already handles the empty-string case by falling back
to `parsedAt` — no additional change needed.

**`pdfUrl` with `ssc-adf://` scheme**: this is explicitly called out in the REQ
edge cases. The existing Step 2 branch `else if (doc.url.startsWith("ssc-adf://"))`
handles it. When `pdfUrl` is set to an `ssc-adf://` URI, `doc.url` will be that
value and the existing Puppeteer CDP branch fires correctly — no additional
special-casing needed.

### Task 290 — checkSscReports

**`QuarterString` import**: `QuarterString` is exported from
`fetchParseAndStoreBctc.ts`. Import it as a type:
```typescript
import type { QuarterString } from "./fetchParseAndStoreBctc.js";
```
This import is already implicitly used (the `quarter: "Q1"` hard-code in the old
`defaultPipeline` was type-checked against `QuarterString`). Making the import
explicit is safe.

**Date parsing edge case**: `new Date("15/08/2025")` returns `Invalid Date` in
V8 — the DD/MM/YYYY branch must use the manual regex parse
`${year}-${month}-${day}` to construct a valid ISO string before passing to
`Date`. The helper above already does this correctly.

**`publishedAt` format from real SSC scraper**: the existing `SscDocument` type
in `src/infrastructure/fetchers/ssc.ts` — verify the actual format the scraper
returns. If it returns ISO 8601, the ISO branch fires; if it returns DD/MM/YYYY,
the regex branch fires. Both are covered.

### Task 291 — Smoke test

**Skip guard**:
```typescript
import { existsSync } from "node:fs";
const PDF_PATH = "data/pdfs/BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf";
const PDF_EXISTS = existsSync(PDF_PATH);

it.skipIf(!PDF_EXISTS)("VNM consolidated PDF — balance sheet magnitudes", async () => {
  ...
});
```

**pdf-parse import**: `pdf-parse` is already in `package.json` (used by
`src/infrastructure/fetchers/pdf.ts`). Import directly in the test:
```typescript
import pdfParse from "pdf-parse";
import { readFileSync } from "node:fs";
```

**Balance-sheet range assertions (in triệu đồng)**:
- `totalAssets`: `>= 50_000_000 && <= 70_000_000`
- `totalLiabilitiesAndEquity`: within 1% of `totalAssets`
  (`Math.abs(bs.totalLiabilitiesAndEquity - bs.totalAssets) / bs.totalAssets < 0.01`)

**Income-statement assertions**: `> 0` checks only (exact magnitudes are unknown
until the real PDF is parsed):
- `netRevenue > 0`, `grossProfit > 0`, `netProfit > 0`, `eps > 0`

**Unit header for VNM**: VNM's annual consolidated report uses "Đơn vị tính: Triệu đồng"
(multiplier = 1). If it uses "Tỷ đồng" instead, the multiplier converts
automatically and the range assertions still pass since 60,000 × 1000 = 60,000,000.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| NFC normalization changes existing test output | Low | High | NFC is idempotent on pre-composed text (all synthetic samples); run `042` and `043` tests first |
| Row-code guard accidentally skips legitimate small values (e.g. treasury-share counts) | Low | Medium | Guard fires only on multiples of 10 in [10, 990]; VNM/FPT/VCB values are in millions, far above 990 |
| `applyMultiplier` misses a field (edit omission) | Medium | High | After implementation, assert `totalAssets` == sum of sub-totals for the tỷ-unit test sample |
| `detectUnitMultiplier` false-positive on body text | Low | High | Patterns are highly specific (require "đơn vị" + "tính" + unit name together); body text never contains this phrase |
| `deriveQuarterFromPublishedAt` returns wrong quarter for edge months (Apr/May, Jul/Aug, Oct/Nov) | Low | Medium | Unit test Task 290 covers all 12 months explicitly |
| Real VNM PDF uses different column layout than assumed (e.g. 3 columns) | Medium | High | `extractNumber` takes the last token — prior-year column is still a valid large number; smoke test assertions use wide ranges |
| `pdf-parse` output encoding varies by PDF version | Medium | Medium | NFC + ASCII-strip double-pass covers all known pdf-parse encoding artifacts |
| `pdfUrl` passthrough test requires mocking `listSscDocuments` | Low | Low | Injectable `sscHttpClient` is already the mock vector; test verifies it is never called |

---

## Security Review

- SQL parameterized? Yes — no new SQL queries added in this sprint.
- File paths validated (no `../`)? Yes — `pdfUrl` is passed through to the existing
  Step 2 branch which already validates URL scheme prefixes. The smoke test uses a
  hard-coded relative path guarded by `existsSync`; no user-controlled input.
- External HTTP rate-limited? N/A — FR-4 reduces HTTP calls (skips SSC listing).
- Secrets via Bun.env only? Yes — no new secrets introduced.
