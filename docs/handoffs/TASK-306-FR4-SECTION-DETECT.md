# TASK-306-FR4: Section-boundary content-signal detection

**From:** pm (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT sprint decomposition)  
**To:** dev-pdf-extractor  
**Date:** 2026-06-28  
**Sprint:** FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT  
**Sequence:** 6 of 7  
**Depends:** TASK-305-FR5-DEDUP

---

## Requirement (FR-4)

The calling pipeline supplies `statement_section` as a parameter to `TextTableExtractor.assemble()`. For B02-TCTD (VCB), all pages are supplied under 'balance_sheet' because the PEK engine did not provide income-statement page ranges. This causes income-statement items to be mis-filed under balance_sheet section.

**Required behavior:** The calling pipeline must detect section boundaries from page content signals BEFORE calling `assemble()`. Detection is diacritic-insensitive (uses `.lower()` and keyword substring match):
- Income statement start: page contains "báo cáo kết quả hoạt động kinh doanh" OR "kết quả hoạt động sản xuất kinh doanh" OR "báo cáo thu nhập"
- Cash flow start: "lưu chuyển tiền tệ"
- Balance sheet start: "bảng cân đối kế toán" OR "báo cáo tình hình tài chính"

This must be added in the application/use-case layer (NOT inside TextTableExtractor). It must not branch on issuer identity — it reads page content only. For B02-TCTD bank forms, the income statement section uses the same title keyword "báo cáo kết quả hoạt động kinh doanh" as B01-DN corporate forms.

VCB acceptance impact: Fixes FM-VCB-1 (income-statement and off-balance-sheet items routed to correct sections, not all under balance_sheet).

---

## Design (from [Architect] Brownfield Findings)

### Mechanism: application-layer page filter with content-signal detection

In `apps/pdf-extractor/application/extract_tables_usecase.py`, add two private helper functions:

```python
# FR-4: Section-start keywords (diacritic-insensitive)
_INCOME_STMT_START_KEYWORDS = [
    "báo cáo kết quả hoạt động kinh doanh",
    "bao cao ket qua hoat dong kinh doanh",
    "kết quả hoạt động sản xuất kinh doanh",
    "ket qua hoat dong san xuat kinh doanh",
    "báo cáo thu nhập",
    "bao cao thu nhap",
    "kết quả hoạt động kinh doanh",  # B02-TCTD banking income stmt title
]
_CASH_FLOW_START_KEYWORDS = [
    "lưu chuyển tiền tệ",
    "luu chuyen tien te",
    "báo cáo lưu chuyển tiền tệ",
    "bao cao luu chuyen tien te",
]

def _detect_section_start(page_text: str) -> Optional[str]:
    """
    Detect whether a page STARTS a new BCTC statement section.
    Returns 'income_statement', 'cash_flow', or None (= balance_sheet / continuation).
    Pure: no I/O, no issuer context.
    """
    lower = page_text.lower()
    if any(kw in lower for kw in _INCOME_STMT_START_KEYWORDS):
        return "income_statement"
    if any(kw in lower for kw in _CASH_FLOW_START_KEYWORDS):
        return "cash_flow"
    return None

def _filter_pages_to_section(
    pages: List[Dict], target_section: str
) -> List[Dict]:
    """
    Filter pre-supplied pages to those belonging to target_section.
    - balance_sheet: calls existing select_balance_sheet_section(), then excludes
      pages that detectably START a different section (income_statement/cash_flow).
    - income_statement: includes pages where _detect_section_start == 'income_statement'
      (contiguous run starting from first detected page).
    - cash_flow: same pattern for cash_flow.
    Pure: no I/O.
    """
    if target_section == "balance_sheet":
        # Phase 1: existing BS filter (keeps backward compat with FPT OCR-variant markers)
        bs_pages = select_balance_sheet_section(pages)
        # Phase 2: FR-4 — exclude pages that start a conflicting section
        return [
            p for p in bs_pages
            if _detect_section_start(p.get("text", "")) is None
        ]
    else:
        # income_statement / cash_flow: select contiguous run of target pages
        result: List[Dict] = []
        in_section = False
        for p in pages:
            sig = _detect_section_start(p.get("text", ""))
            if sig == target_section:
                in_section = True
                result.append(p)
            elif in_section and sig is None:
                # Continuation page (no section header) — include if we're in the section
                result.append(p)
            elif in_section and sig != target_section:
                # Next section started — stop
                break
        return result
```

In `execute()` Path A (around L384-408), replace the current call:

```python
# BEFORE:
if statement_section == "balance_sheet":
    pages = select_balance_sheet_section(raw_pages)
else:
    pages = raw_pages

# AFTER (FR-4):
pages = _filter_pages_to_section(raw_pages, statement_section)
```

---

## Acceptance Criteria

- [ ] `_INCOME_STMT_START_KEYWORDS` list added with 6+ Vietnamese variants (with and without diacritics)
- [ ] `_CASH_FLOW_START_KEYWORDS` list added with 3+ Vietnamese variants
- [ ] `_detect_section_start(page_text)` function returns 'income_statement', 'cash_flow', or None
- [ ] `_filter_pages_to_section(pages, target_section)` function filters per section
- [ ] Balance sheet path: calls existing `select_balance_sheet_section()`, then filters out income/cash-flow pages
- [ ] Income/cash-flow path: selects contiguous run of target pages
- [ ] Continuation pages (no section header) included in current section run
- [ ] Test: page with income-statement keyword excluded from balance_sheet call
- [ ] Test: income_statement call selects contiguous run of target pages
- [ ] Test: cash_flow call selects contiguous run of target pages
- [ ] Non-regression: FPT section filtering unchanged (FPT has no income_statement/cash_flow keywords)
- [ ] DDD compliance: both functions are pure (no I/O, no issuer branching)
- [ ] Test added in `__tests__/unit/test_extract_tables_usecase.py`

---

## Files to modify

- `apps/pdf-extractor/application/extract_tables_usecase.py` (add 2 functions ~50 LOC + 1 call site change)
- `apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py` (add tests ~20 LOC)

---

## Non-regression anchors

- FPT 2025Q4 (no income_statement/cash_flow keywords) filtered as before
- All existing `test_extract_tables_usecase.py` tests must pass
- VCB 2026Q1 income-statement pages correctly routed to income_statement section

---

## Risk flags (from architect)

**RISK-4 (MEDIUM):** Over-filter for pages with dual section content. A page containing both a BS summary row AND an income-statement page header (e.g., "Báo cáo kết quả hoạt động kinh doanh" in a page-header footer) would be incorrectly excluded from the BS call.

**Mitigation:** Detection is substring match on `.lower()` — make keywords specific enough (use full title strings, not fragments). Search only in the FIRST 30 lines of the page text (where section headers appear), not the full page. DEVELOPER: add line-limiting logic if needed during implementation.

**RISK-6 (MEDIUM):** FR-4 interaction with Path B (OCR auto-locate). `_filter_pages_to_section` is only applied to Path A (pre-supplied pages). Path B (auto-locate via ocr_port) uses `locate_balance_sheet_pages()` from `PdfOcrAdapter` which does its own section detection. FR-4 does NOT touch Path B. If VCB hits Path B, the fix doesn't apply. DEVELOPER: verify VCB re-extraction uses Path A (it does — uses stored OCR text).

---

## Reference

- Architect design: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § [Architect] Brownfield Findings § FR-4
- BA spec: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 2 § FR-4
- Live failure: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 1.2 § FM-VCB-1
- Edge cases: docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md § Section 5 § EC-3, EC-4
