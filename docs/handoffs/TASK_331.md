---
sprint: FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT
branch: task/331-fr4-section-boundary-detect
size: M
zone: apps/pdf-extractor/
depends_on: [TASK_330]
blocks: [TASK_332]
---

## TLDR
Add section-boundary content-signal detection to application layer (`extract_tables_usecase.py`) to route pages to correct statement sections (balance_sheet, income_statement, cash_flow) before calling TextTableExtractor. New pure functions `_detect_section_start()` and `_filter_pages_to_section()` detect Vietnamese section-title keywords. Resolves FM-VCB-1 (income-statement items mis-classified in balance_sheet). No per-issuer branches; B01-DN and B02-TCTD use same keywords.

## [PM] Planning Context

**FR:** FR-4 — Section-boundary content-signal detection (Architect design §FR-4)

**Zone:** `apps/pdf-extractor/application/extract_tables_usecase.py`

**Why this order:** Depends on FR-5 (clean row set from infrastructure). Resolves FM-VCB-1 (section mis-routing). Load-bearing for VCB acceptance (income-statement rows must be in correct section). RISK-6 notes interaction with Path B (OCR auto-locate) — must verify VCB re-extraction uses Path A.

**Acceptance Criteria:**
- [ ] AC-1: New function `_detect_section_start(page_text: str) → Optional[str]` added
- [ ] AC-2: Detects section START via Vietnamese keyword substrings (diacritic-insensitive):
  - [ ] Income statement: "báo cáo kết quả hoạt động kinh doanh", "kết quả hoạt động sản xuất kinh doanh", "báo cáo thu nhập"
  - [ ] Cash flow: "lưu chuyển tiền tệ", "báo cáo lưu chuyển tiền tệ"
  - [ ] Returns "income_statement", "cash_flow", or None (= balance_sheet / continuation)
- [ ] AC-3: New function `_filter_pages_to_section(pages, target_section)` added
  - [ ] balance_sheet: calls existing `select_balance_sheet_section()`, then excludes pages starting conflicting section
  - [ ] income_statement/cash_flow: selects contiguous run of target-section pages
- [ ] AC-4: Both functions are PURE (no I/O, no HTTP, no DB)
- [ ] AC-5: Application-layer integration: `extract()` method Path A (pre-supplied pages) calls `_filter_pages_to_section()` instead of direct `select_balance_sheet_section()`
- [ ] AC-6: New test added to `test_extract_tables_usecase.py`:
  - [ ] Page with income_statement keyword → `_detect_section_start()` returns "income_statement"
  - [ ] Mixed pages (BS + IS) in balance_sheet call → IS pages excluded
  - [ ] income_statement call with mixed pages → IS pages selected (contiguous run)
  - [ ] Off-balance-sheet pages (no IS/CF keywords) → remain in balance_sheet
- [ ] AC-7: Non-regression: FPT pages (no section keywords) → all classified as balance_sheet (existing behavior)
- [ ] AC-8: No per-issuer branches; detection uses form-structure keywords (same for B01-DN and B02-TCTD)
- [ ] AC-9: RISK-6 mitigation: verify VCB re-extraction via `POST /api/bctc-eval/recompute/:id` uses Path A (confirmed by PO; no code change needed)

**Code change site (architect design):**
- `apps/pdf-extractor/application/extract_tables_usecase.py` (L384-408 area, Path A)
- Add 2 new private functions: `_detect_section_start()` (~15L), `_filter_pages_to_section()` (~25L)
- Modify `execute()` Path A: replace direct `select_balance_sheet_section()` call with `_filter_pages_to_section()` (~2L)

**Test files to modify:**
- `apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py` — add FR-4 tests (~20L)

**Knowledge needed:**
- Architect design: `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md` §FR-4 + RISK-6
- Current code: `apps/pdf-extractor/application/extract_tables_usecase.py` §`execute()` (L384-408)
- Existing function: `select_balance_sheet_section()` from `domain/primitives/select_balance_sheet_section/primitive.py`
- Context: FM-VCB-1 shows income-statement items (code='I' "Thu nhập lãi thuần") mis-classified in balance_sheet section

## [Developer] Execution Record

**Status:** REVIEW  
**Implemented by:** dev-pdf-extractor  
**Date:** 2026-06-28

### Summary
FR-4 section-boundary content-signal detection implemented as two pure private helpers in `application/extract_tables_usecase.py`. TextTableExtractor (infrastructure) untouched — DDD boundary maintained. FPT routing unaffected (zero IS/CF keywords on FPT balance-sheet pages).

### AC checklist
- [x] AC-1: `_detect_section_start(page_text: str) -> Optional[str]` added as module-level pure function
- [x] AC-2: Detects IS start via 7 keywords (accented + unaccented variants); CF start via 4 keywords; returns None for BS/continuation pages
- [x] AC-3: `_filter_pages_to_section(pages, target_section)` added — balance_sheet calls `select_balance_sheet_section()` then excludes IS/CF pages; IS/CF select contiguous run
- [x] AC-4: Both functions are PURE (no I/O, no HTTP, no DB, deterministic)
- [x] AC-5: `execute()` Path A now calls `_filter_pages_to_section(raw_pages, statement_section)` instead of manual if/else around `select_balance_sheet_section()`
- [x] AC-6: 14 new tests added to `test_extract_tables_usecase.py`:
  - [x] IS keyword (accented + unaccented + B02-TCTD variant) → "income_statement"
  - [x] CF keyword (accented + unaccented) → "cash_flow"
  - [x] No keyword → None (BS page, continuation page)
  - [x] IS contiguous run (pages 2-3, stops at CF header page 4)
  - [x] CF page selected correctly
  - [x] BS call excludes IS pages; excludes CF pages
  - [x] Off-balance-sheet page ("Cam kết ngoại bảng") → None (stays in BS)
  - [x] Case-insensitive detection (uppercase OCR output)
- [x] AC-7: FPT non-regression test confirms all FPT BS pages return None from `_detect_section_start` and are not dropped by `_filter_pages_to_section`
- [x] AC-8: Zero per-issuer branches — both B01-DN and B02-TCTD use same keyword lists (NFR-1 verified by inspection: no `if issuer == ...`, no `if form_id == ...`)
- [x] AC-9: RISK-6 mitigation — VCB re-extraction via `POST /api/bctc-eval/recompute/:id` uses Path A (confirmed by PO; no dev action needed)

### Test results
- Unit tests: **6 failed / 941 passed** — 6 pre-existing env failures (PIL ABI + rasterizer PDF absent), 14 new FR-4 tests all GREEN. Zero new failures.
- Full pytest: **11 failed / 1080 passed** — 11 pre-existing env/integration failures (unchanged from baseline). Zero new failures.

### Sandbox G12
- Primitive tier: **29 PASS + 6 intentional-fail** (5 known_bad canaries + 1 failure_mismatch canary) — matches pre-existing baseline from TASK_329
- Module tier: **1 PASS** (financial_reports/multi_primitive_story.json)
- Sandbox PYTHONPATH: `PYTHONPATH=apps/pdf-extractor python3 sandbox/runner.py --tier=<tier> --scenario=<file>`

### DDD compliance
- `_detect_section_start` and `_filter_pages_to_section` are module-level pure functions in `application/extract_tables_usecase.py`
- They import `select_balance_sheet_section` from `domain.primitives.select_balance_sheet_section.primitive` (application → domain: ALLOWED)
- `infrastructure/text_table_extractor.py`: ZERO changes (stays pure)
- No upward domain → application imports introduced

### Risk mitigations applied
- RISK-4 (over-filter for dual-content pages): keywords are specific full title strings, not fragments. The `_detect_section_start` searches full page text with `.lower()` substring match; section titles are sufficiently specific to avoid false positives from footers.
- RISK-6: VCB re-extraction via recompute endpoint confirmed to use Path A (PO-confirmed, no code change needed).

### Files changed
- `apps/pdf-extractor/application/extract_tables_usecase.py` — added FR-4 constants + 2 pure helpers + modified Path A (~85 LOC added, 20 LOC modified)
- `apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py` — added FR-4 import + 14 tests (~100 LOC added)

---

## [Developer] Implementation Notes

### Code structure
```python
# At top of extract_tables_usecase.py, add imports if needed
from typing import Optional

# FR-4: Section-start keywords (diacritic-insensitive via .lower())
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

# In execute() method, Path A (pre-supplied pages):
# BEFORE:
if statement_section == "balance_sheet":
    pages = select_balance_sheet_section(raw_pages)
else:
    pages = raw_pages

# AFTER (FR-4):
pages = _filter_pages_to_section(raw_pages, statement_section)
```

### Test cases
```python
# In test_extract_tables_usecase.py
def test_fr4_detect_section_start():
    # Test 1: Income statement keyword detected
    page_text = "Báo cáo kết quả hoạt động kinh doanh\nNăm 2026\n..."
    assert _detect_section_start(page_text) == "income_statement"
    
    # Test 2: Cash flow keyword detected
    page_text = "Báo cáo lưu chuyển tiền tệ năm 2026"
    assert _detect_section_start(page_text) == "cash_flow"
    
    # Test 3: No section keyword → None (balance_sheet / continuation)
    page_text = "Tiền mặt\n100.000\nTiền gửi\n500.000"
    assert _detect_section_start(page_text) is None
    
    # Test 4: Diacritic-insensitive
    page_text = "bao cao ket qua hoat dong kinh doanh"  # Without diacritics
    assert _detect_section_start(page_text) == "income_statement"

def test_fr4_filter_pages_to_section():
    # Setup: mixed pages
    pages = [
        {"text": "Tiền mặt 100.000\nTiền gửi 500.000", "page_num": 1},  # BS
        {"text": "Báo cáo kết quả hoạt động kinh doanh\nDoanh thu 1.000.000", "page_num": 2},  # IS header
        {"text": "Chi phí 500.000", "page_num": 3},  # IS continuation
        {"text": "Báo cáo lưu chuyển tiền tệ\nHoạt động kinh doanh", "page_num": 4},  # CF header
    ]
    
    # Test balance_sheet filter: should exclude IS and CF pages
    bs_pages = _filter_pages_to_section(pages, "balance_sheet")
    # Should only have page 1 (BS pages; pages 2+ have section headers)
    # Note: select_balance_sheet_section() has its own logic; test should reflect actual behavior
    
    # Test income_statement filter: should select pages 2-3 (contiguous run)
    is_pages = _filter_pages_to_section(pages, "income_statement")
    assert len(is_pages) == 2
    assert is_pages[0]["page_num"] == 2
    assert is_pages[1]["page_num"] == 3
    
    # Test cash_flow filter: should select page 4 (no more pages after)
    cf_pages = _filter_pages_to_section(pages, "cash_flow")
    assert len(cf_pages) == 1
    assert cf_pages[0]["page_num"] == 4
```

## [QA] Review Record

**Status:** APPROVED
**QA agent:** qa
**Date:** 2026-06-28
**Commit reviewed:** 892c9efb

### Verdict: APPROVED

All checks passed. TASK_332 (FR-6) is unblocked.

### AC checklist
- [x] AC-1: `_detect_section_start(page_text: str) -> Optional[str]` present at L141
- [x] AC-2: IS keywords (7 — accented + unaccented + B02-TCTD banking variant); CF keywords (4); returns "income_statement"/"cash_flow"/None. 8 `_detect_section_start` tests all PASS.
- [x] AC-3: `_filter_pages_to_section(pages, target_section)` at L166 — balance_sheet calls `select_balance_sheet_section()` then excludes IS/CF pages; IS/CF select contiguous run. 6 filter tests PASS.
- [x] AC-4: Both functions PURE (no I/O, no HTTP, no DB). Confirmed by inspection of L141-216.
- [x] AC-5: `execute()` Path A (L496): `pages = _filter_pages_to_section(raw_pages, statement_section)` — manual if/else replaced.
- [x] AC-6: 14 new FR-4 tests — all 14 PASS.
- [x] AC-7: FPT non-regression: `test_fr4_fpt_non_regression_no_section_keywords` PASS — all FPT BS pages return None, none dropped. FPT live: exact_dup_count=0, Stage 6 GREEN.
- [x] AC-8: Zero per-issuer branches — grep for `if issuer/if form/if ticker` in production diff returns empty. B01-DN + B02-TCTD share same keyword lists.
- [x] AC-9: RISK-6 VCB re-extraction via recompute endpoint uses Path A (PO-confirmed).

### DDD purity
- `infrastructure/text_table_extractor.py`: ZERO changes in commit 892c9efb (git show --stat confirmed).
- No static `from.*infrastructure` imports added. Dynamic `importlib.import_module("infrastructure.ocr_worker")` is pre-existing, not new.
- Application → domain import: L90 `from domain.primitives.select_balance_sheet_section import select_balance_sheet_section` — correct direction.

### Test results
- Unit (target): **14/14 FR-4 tests PASS** (live run)
- Full unit suite: **6 failed / 941 passed** — pre-existing baseline (PIL ABI + rasterizer; zero new failures)
- Full pytest: **11 failed / 1080 passed** — pre-existing baseline unchanged
- Sandbox G12 primitive tier: **29 PASS + 6 intentional-fail** (5 known_bad canaries + 1 failure_mismatch)
- Sandbox G12 module tier: **1 PASS**

### VCB section-routing effect
- POST /api/bctc-eval/recompute/bdcfa5e0-093f-4da1-9412-07197c8e4c48 (VCB Q4-2025)
- `cross_section_dup_count: 0` — FM-VCB-1 resolved; IS items no longer mis-filed under balance_sheet
- Stage 4 remains RED due to code_coverage=0.393 (TASK_332/FR-6 dependency) + exact_dup_count=3 (within-section; expected)
- Note: full VCB Stage 4 GREEN requires FR-6 (TASK_332, not yet done) — expected per task spec

### Crash reconciliation
Previous QA run crashed mid-execution (tool-call parse error after ~35 tool calls). Left TASK_331 cleanly in REVIEW status in orch-state — no partial flip, no partial [QA] Review Record. This is a full idempotent re-verification from scratch.

---

## [QA] Acceptance Procedure

1. Verify functions: `_detect_section_start()` and `_filter_pages_to_section()` added and pure (no I/O)
2. Verify keyword lists: income_statement and cash_flow keywords complete
3. Verify logic: balance_sheet excludes conflicting-section pages; income_statement/cash_flow select contiguous runs
4. Verify integration: `execute()` Path A calls `_filter_pages_to_section()` instead of `select_balance_sheet_section()`
5. Verify AC-1 through AC-9 complete
6. Run test: `pytest apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py::test_fr4_detect_section_start -xvs`
7. Run test: `pytest apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py::test_fr4_filter_pages_to_section -xvs`
8. Run full suite: `pytest apps/pdf-extractor/__tests__/unit/ -xvs` (verify non-regression)
9. Confirm RISK-6 mitigation: VCB re-extraction via `POST /api/bctc-eval/recompute/:id` uses Path A (PO confirmed; no dev action needed)
10. Mark TASK_331 DONE; unblock TASK_332

---

**Depends on:** TASK_330  
**Blocks:** TASK_332  
**Estimated:** ~2.5h (code + test + verify)
