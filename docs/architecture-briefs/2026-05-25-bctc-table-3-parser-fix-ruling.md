# BCTC-TABLE-3 — Architect Ruling: Parser Fix (BT3-DESIGN)

**Date:** 2026-05-25 | **Sprint:** BCTC-TABLE-3 | **Zone:** `apps/pdf-extractor/` only
**Author:** architect | **Input:** `docs/handoffs/TASK_BCTC-TABLE.md § SPRINT BCTC-TABLE-3`

---

## Decision Summary

| Decision | Ruling |
|---|---|
| Re-parse stored OCR vs zone-OCR | RE-PARSE. Zone-OCR not required. |
| Exact change in `text_table_extractor.py` | Delete block-column state machine (3 functions). Add shared pure `_parse_lines_to_rows()`. Tighten else-branch junk filter. |
| Row contract change (mcp-server) | NONE. Contract is correct. Fix is pdf-extractor-side only. |
| Integration test mandate | Real adapter + real stored FPT OCR text fixture. No `PreloadedTextTableExtractor` subclass. Assert AC-INT-1..AC-INT-11 against spike gold. |

---

## 1. Re-Parse vs Zone-OCR

**Decision: RE-PARSE existing stored Tesseract OCR text. Zero re-OCR.**

The root issue is not that the OCR text lacks structure — it is that the production parser MISREADS a correctly-structured text. The Tesseract OCR already delivers one-line-per-row output: label + code + value_current + value_prior on the same line. The spike's `fpt_balance_sheet_eval.py::lines_to_rows()` (L187-211) proved this produces ~80 correct gold rows from the STORED text alone.

Zone-OCR (render page to PNG, detect table bounding box, re-OCR within zone) is NOT needed because:
- The stored text already has the correct line structure.
- The spike parsed it correctly without zone information.
- Zone-OCR adds host memory load — on the 16GB Mac the kernel watchdog kills the process under concurrent heavy OCR (`project_host_memory_panic`).
- The backfill path must be zero-Tesseract (host-safe): it re-parses the ALREADY STORED text. Zone-OCR would require re-rendering PDFs, which re-triggers Tesseract.

The user's suggestion "ocr zone table first then line by line" is correctly addressed by the existing Tesseract run that already produced the stored text. The "line by line" is the correct fix direction — that is what the spike does and what the production code must do.

Zone-OCR remains DEFERRED. Only reintroduce if a future doc type has label, code, and value on SEPARATE OCR lines (not co-located). Flag to PO if encountered.

---

## 2. Exact Change in `text_table_extractor.py`

### What to Delete

Three functions that constitute the broken block-column state machine:

| Function | Lines (approx) | Why |
|---|---|---|
| `_detect_block_column_layout()` | L359-383 | Triggers wrong code path on pure-code OCR fragment lines |
| `_extract_block_columns()` | L386-471 | Positional-zip state machine that separates label/code/value across regions |
| `_build_rows_from_block_columns()` | L474-518 | Zips code+value lists positionally, hardcodes `label=""` → 44 orphan rows |

Also delete the `if _detect_block_column_layout(lines): ... else: ...` dispatch branch in `TextTableExtractor.assemble()` (L693-720). Replace with a direct call to `_parse_lines_to_rows()` for every page unconditionally.

### What to Add

**`_parse_lines_to_rows()` — module-level pure function:**

```python
def _parse_lines_to_rows(
    lines: List[str],
    page_num: int,
    unit: str,
    period_current: Optional[str],
    period_prior: Optional[str],
    row_order_start: int,
) -> tuple[List[Dict], int]:
    """
    Parse text lines from one OCR page into structured row dicts.
    Pure: no I/O, no Tesseract, no HTTP.
    Used by BOTH the live TextTableExtractor.assemble() path
    AND the pre-supplied-text backfill path.
    Returns (rows, next_row_order_start).
    """
```

Implementation is identical to the CORRECT parts of the existing `_parse_page_lines()` function, with one fix: the else-branch junk filter is tightened (see below).

`_parse_page_lines()` becomes a one-line wrapper calling `_parse_lines_to_rows()`. Preserves any callers of `_parse_page_lines()` in unit tests without breaking them.

### What to Fix (else-branch junk filter)

The existing else-branch emits non-code lines as rows if they pass `not stripped.isdigit() and len(stripped) > 1`. This is too loose — it admits company names, addresses, and header text as junk rows (94 such rows on FPT).

Tightened filter: only emit a non-code line as a header/separator row if the stripped text contains at least 3 consecutive alphabetic characters (Vietnamese or ASCII). This preserves genuine section headers while rejecting numeric-only noise, company addresses, short OCR fragments, and date strings.

```python
# Tightened filter: emit as header row only if content has alphabetic text
if stripped and len(stripped) > 3 and re.search(r'[A-Za-zÀ-ỹ]{3,}', stripped):
    rows.append({...code: None, label: stripped, value_current: None, ...})
```

Note: lines like `"A. TÀI SẢN NGẮN HẠN  100  58.102..."` will match `_try_parse_code_row` Layout 2 BEFORE reaching the else-branch. So stripping junk in the else-branch does not affect genuinely-coded rows.

### Single Canonical Parser — Dual-Path Drift Kill

After this change there is ONE code path for all text:

```
TextTableExtractor.assemble(pages)
  → for each page:
      _parse_lines_to_rows(lines, ...)   ← same function always
  → return {rows, period_current, period_prior}
```

The backfill path (bctcBatchTableBackfillJob → POST /extract-tables → TextTableExtractor.assemble()) calls exactly the same `assemble()` method, which calls the same `_parse_lines_to_rows()`. Zero drift.

---

## 3. Row Contract — UNCHANGED

The existing `bctc_table_rows` schema (mcp-server `market.db`) is correct:
- `code TEXT` — nullable (header rows have None)
- `label TEXT NOT NULL` — must be non-blank for code rows (fix ensures this)
- `value_current REAL` — nullable
- `value_prior REAL` — nullable
- `unit TEXT`
- `is_summary_row INTEGER`
- `row_order INTEGER`
- `page_number INTEGER`
- `statement_section TEXT`
- `period_current TEXT`
- `period_prior TEXT`

No DDL change. No `pushBctcTableHandler.ts` change. No `bctcInspectHandler.ts` change. No `bctc-inspector.html` change.

The bug was the PRODUCER filling `label=""` and dropping `code` and `value_prior`. The fix corrects the producer. The consumer (mcp-server) reads whatever the producer stores — now it will read correct rows.

---

## 4. Integration Test Mandate

The `PreloadedTextTableExtractor` subclass bypass was a false-green: it overrode `assemble()` so the use case never touched the real adapter's parsing logic. Three tasks passed with incorrect production code as a result.

**Replacement test:**
1. Read FPT Q4 pages 4-7 raw Tesseract text from committed fixture `apps/pdf-extractor/__tests__/fixtures/fpt_q4_2025_pages_4-7.txt` (or live DB if fixture not committed yet — fixture preferred for hermeticity).
2. Instantiate `TextTableExtractor()` directly. No subclass.
3. Call `extractor.assemble(pages=[...real text...], statement_section="balance_sheet")`.
4. Assert AC-INT-1 through AC-INT-11 (detailed in handoff § Ruling 4).

Key assertions (non-negotiable):
- Zero rows with `code is not None AND label == ""` (was 44)
- Zero junk rows with `code is None AND value_current is None` + no alphabetic content (was 94)
- Code "100" present, no duplicates
- value_prior populated on ≥90% of coded rows
- Sentinel codes 270/300/400 match spike gold exactly (± 1.0 VND float tolerance)
- Balance identity: 270 == 300 + 400 within 1.0 VND

---

## 5. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Pages 5-7 OCR has multi-line label wraps (86.7% score on p7) | MEDIUM | Integration fixture must include pages 5-7. Dev verifies code coverage across all 4 pages. Spike already handles this via ignoring label-continuation lines (they produce no row). |
| `_PURE_CODE_LINE_RE` lines (`"100"` alone) reach else-branch after block-column deletion | LOW | Tightened junk filter (length < 4, no alphabetic) rejects them. Dev adds unit test: code-only line → no row emitted. |
| Footnote note-number column (e.g. "5" between code and value) consumed as value_current | LOW | `_parse_value_cells()` splits on 2+ spaces; footnote may be single-space from code. `select_period_column` picks first non-empty cell — may pick "5". Dev must verify with fixture line `"I. Tiền...  110  5  10.540.181.640.920  9.315.440.438.884"`. |
| Backfill Tesseract concurrency on Mac triggers kernel panic | NON-NEGOTIABLE | Backfill must be sequential (one doc at a time). `bctcBatchTableBackfillJob` already for-of sequential. Ops confirms before triggering. |
| mcp-server contract change discovered mid-BT3-FIX | STOP condition | dev-pdf-extractor halts and routes back to architect. Do NOT invent a contract change without architect ruling. |

---

## Files Changed (BT3-FIX scope)

All in `apps/pdf-extractor/` — zero mcp-server changes:

| File | Action |
|---|---|
| `infrastructure/text_table_extractor.py` | MODIFY — delete 3 functions + assemble branch; add `_parse_lines_to_rows()`; tighten else-branch filter |
| `__tests__/integration/test_extract_tables_fpt.py` | REPLACE — remove PreloadedTextTableExtractor; drive real adapter on real fixture text; assert AC-INT-1..AC-INT-11 |
| `__tests__/fixtures/fpt_q4_2025_pages_4-7.txt` | CREATE — committed FPT pages 4-7 raw Tesseract OCR text (hermetic fixture) |

**Commit message (suggested):** `fix(pdf-extractor): replace block-column state machine with one-line-per-row parser (BT3-FIX)`
