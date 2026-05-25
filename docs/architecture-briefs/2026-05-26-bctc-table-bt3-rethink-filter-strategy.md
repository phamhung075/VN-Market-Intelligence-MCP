# BT3-RETHINK — Filter Strategy Root-Cause Ruling

**Brief ID:** 2026-05-26-bctc-table-bt3-rethink-filter-strategy
**Date:** 2026-05-26
**Author:** architect
**Task:** BT3-RETHINK (recurring-bug escalation — 6th false-green, FIX4 ruling revoked by PO)
**Sprint:** BCTC-TABLE-3
**Zone:** `apps/pdf-extractor/` (sole zone — no mcp-server changes)
**Supersedes:** `docs/architecture-briefs/2026-05-26-bctc-table-bt3-fix4-parser-hardening.md` (revoked)
**Evidence base:**
- Live endpoint `GET /api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` — 95 rows, 23 orphans (PO verified 2026-05-26)
- Committed fixture `__tests__/fixtures/fpt_q4_2025_pages_4-7.txt` — 79 rows, 0 orphans in FIX4 fixture run (PyMuPDF substrate)
- FIX4 ruling code deployed: commit `c66a7ff7` is live in the container
- PO independent live verification: 4 sentinels exact, balance_pass=true, 23 code=null orphans, codes 222/223/226/131/319/421b absent or orphaned

---

## 0. Why FIX4 False-Greened — The Substrate Mismatch

FIX4's unit tests and its integration fixture both ran against `__tests__/fixtures/fpt_q4_2025_pages_4-7.txt`. That file was captured from the spike's **PyMuPDF/fitz rasterizer** at 200 DPI. The live production pipeline uses **poppler** (`pdf2image`) as the rasterizer.

These two rasterizers produce OCR text with different diacritic fidelity and different noise patterns from the same PDF. The fixture therefore presented a different character set than what poppler emits in production. Every skip-string and every regex in FIX4 was calibrated against the fixture's PyMuPDF character set. On the live poppler substrate, the three root-failure classes below all manifested simultaneously.

**This is not a parser-complexity problem. It is an OCR-substrate mismatch problem in the test layer.** The fix strategy must be rasterizer-agnostic — immune to diacritic variation — rather than adding more literal strings that will false-green again the moment a new document or rasterizer variation is encountered.

---

## 1. The Three Live Failure Classes

All evidence from PO's live triage (`docs/po-decisions/2026-05-26-bctc-table-bt3-fix4-false-green-rethink.md`).

### Class 1 — Diacritics Mismatch (3 header + 2 date rows = 5 orphans)

**Root cause:** every junk-line check and every date regex in `_parse_lines_to_rows()` operates on the raw OCR string using diacritic-sensitive comparisons.

FIX4 examples that fail on poppler:

| Skip key / regex | Expected (fixture, PyMuPDF) | Actual (live, poppler) | Outcome |
|---|---|---|---|
| `"bảng cân"` substring | `"BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT"` | `"BANG CÂN ĐỐI KẾ TOÁN HỢP NHẬT"` | "bang cân" not in skip list → miss |
| `"tại ngày"` substring | `"Tại ngày 31 thang 12 năm 2025"` | `"Tai ngày 31 thang 12 năm 2025"` | "Tai" ≠ "tại" even after `.lower()` → miss |
| `re.search(r"ngày\s+\d{1,2}\s+tháng", ...)` | matches `"tháng"` | poppler emits `"thang"` (no diacritic) | regex requires "tháng" → no match → miss |

The pattern is clear: poppler strips or mangles diacritics inconsistently across glyphs, so literal Vietnamese strings and accented regexes fail silently. Adding more accented literals or regexes cannot fix this — it just shifts the false-green to the next document or the next page.

### Class 2 — Garbled Signature Noise (estimated 8-12 orphans from last page)

**Root cause:** negative skip-list strategy is architecturally insufficient for arbitrary OCR garbage.

Poppler produces noise in the signature and footer section that no literal list can enumerate:
```
": \:| /PTP) 7), y2"
"ụ So i ide"
"gUẶu OO by se."
"Lê Varetrung Mioàng Hữu Chiến"   (proper name, garbled)
```

FIX4's CHANGE-4 added known signature-block keywords (`"người lập"`, `"kế toán trưởng"`, `"phó tổng"`, `"hà nội, ngày"`). These catch the clean-OCR versions of those phrases. They cannot catch:
- Random character sequences from poppler's rendering of the digital-signature image block
- Garbled proper names (first/last names are not enumerable across all Vietnamese companies)
- Latin-character OCR garbage that contains no Vietnamese phrase

A negative skip-list requires the OCR noise to match a known pattern. Arbitrary OCR garbage never matches known patterns by definition. This is the architectural crux of why every FIX cycle adds more keywords and still fails.

### Class 3 — Embedded-Code Data Rows Not Split (6 codes absent: 222/223/226/131/319/421b)

**Root cause:** two structural line formats that exist in the fixture are not parsed correctly by the current Layout 4 regex when poppler adds or changes characters around the code token.

**Dash-prefix sub-items (222/223/226):**
```
"- Nguyên giá 222 29.148.692.599.137 24.457.733.666.511"
"- Giá trị hao mòn lũy kế 223 (13.762.875.752.850) (11.683.165.704.793)"
```
FIX4's CHANGE-1 (trailing anchor relaxation) and CHANGE-2 (letter-suffix code) were supposed to fix these. The unit tests in `test_bt3fix4_parser_hardening.py` confirm they pass on the fixture. They must also pass on the live substrate — but the PO verification shows codes 222/223/226 still absent. Diagnosis: either (a) poppler adds leading/trailing characters that break the label-match non-greedy anchor, or (b) poppler renders these lines differently (e.g. extra space or split across two lines) and the fixture text does not represent what poppler actually produces.

**Note-ref column (131/319/421b):**
```
"1. Phải thu ngắn han của khách hàng 131 7 12.733.504.688.522 10.537.0..."
"9. Phải trả ngắn hạn khác 319 22 1.014.673.786.632 874.015.837.328"
"- Lợi nhuận sau thuế chưa phân phối kỳ này 421b 6.924.484.515.123 5.572.300.562.297"
```
Same diagnosis: the fixture characters match the regex; the live poppler characters may not. "ngắn han" (no diacritic on "hạn") and other partial-diacritic variants may shift the match boundary.

**Structural conclusion:** these 6 codes require a code-finding strategy that is robust to diacritic variation in the label text, not a label-to-code multi-space or single-space regex that depends on exact label character matching.

---

## 2. Ruling A — Filter Strategy: POSITIVE-KEEP with POSITIONAL CUTOFF

**Decision: POSITIVE-KEEP + POSITIONAL CUTOFF combination. Negative skip-list is RETIRED as the primary filter for non-code rows.**

### Rationale

The three alternatives evaluated:

**Negative-skip-list (current):** Proven insufficient across 6 iterations. Cannot enumerate poppler-specific garbled noise. Diacritic-sensitive strings fail when rasterizer changes character. REJECTED as primary filter; may remain as a secondary early-exit for known-clean patterns (company name, form number — lines that always start a page and are structurally recognizable).

**Positive-KEEP (only emit rows that carry a valid code or a recognized section header):** Eliminates the garbled noise problem at the root: if a line does not contain a parseable code, it must contain a recognized section header to be emitted. Everything else is dropped. This handles Class 2 (garbled noise) without any enumeration. Handles Class 1 (diacritics mismatch) for non-code rows: if a diacritic-mangled header cannot be recognized as a section header, it is silently dropped. The risk is: legitimate section headers that the recognizer does not know about are also dropped. Mitigation: section headers without codes are display-only rows; dropping one does not affect balance_pass, sentinel values, or code accuracy. The correctness bar is measured on code rows, not header rows.

**Positional-cutoff (drop everything after the last summary code 440/270):** Cleanly eliminates the signature block and all post-table noise. Structurally sound: in Vietnamese BCTC format, the accounting identity row (code 440 for the consolidated balance sheet) is always the last data row. Everything after it — signature block, digital certificate, footer — is outside the table and should never be emitted. This handles the majority of Class 2 (signature-block orphans) without any keyword matching.

**Combined ruling:** Apply POSITIONAL CUTOFF first (drop everything after the last occurrence of a summary sentinel code row: codes 270 or 440 for balance sheets). Within the pre-cutoff range, apply POSITIVE-KEEP: only emit rows that (a) have a parseable code, or (b) are recognized as a section-level header by a diacritic-insensitive normalizer.

This combination:
- Eliminates all post-table noise (signature block, proper names, garbled digital-cert text) via cutoff — no enumeration needed
- Eliminates pre-table noise (balance-sheet title, date context, column header fragments) via POSITIVE-KEEP — unrecognized non-code rows are dropped by default
- Is resilient to poppler diacritic variation because code-finding does not depend on label text character matching (see Ruling B)
- Is resilient to future documents and future rasterizer changes because neither strategy enumerates document-specific strings

### Implementation Specification (POSITIVE-KEEP)

In `_parse_lines_to_rows()`, after the code-row parse attempt fails (`parsed is None`), the current behavior emits the line as a header row if it contains 3+ consecutive alphabetic chars. This must change:

**Old else-branch behavior:**
```python
else:
    if stripped and len(stripped) > 3 and re.search(r"[A-Za-zÀ-ỹ]{3,}", stripped):
        rows.append({"code": None, "label": stripped, ...})
```

**New else-branch behavior (POSITIVE-KEEP gate):**
```python
else:
    # POSITIVE-KEEP: only emit non-code lines that are recognizable section headers.
    # All other non-code lines are silently dropped — garbled noise, junk, diacritic
    # variants of known headers, and signature-block text all fail this gate and are
    # never stored.
    if _is_recognized_section_header(stripped):
        rows.append({"code": None, "label": stripped, ...})
    # else: DROP SILENTLY — no orphan row created
```

**`_is_recognized_section_header(stripped: str) -> bool`** (new function, pure, diacritic-insensitive):
```python
def _is_recognized_section_header(stripped: str) -> bool:
    """
    Return True only if stripped is a recognized BCTC section-level header.

    Uses diacritic-insensitive matching: normalize both the input and the
    known-header patterns via unicodedata.normalize('NFD') + strip combining
    chars before comparison. This makes the recognizer immune to poppler vs
    PyMuPDF diacritic variation.

    Recognized headers are structural section labels that appear in Vietnamese
    BCTC balance sheets (and income/cash-flow statements) with consistent
    structural tokens regardless of diacritic fidelity:
      - "TAI SAN" / "NGUON VON" — asset / equity-and-liabilities blocks
      - "A.", "B.", "C.", "D.", "E." — section letters (short-form headers)
      - "I.", "II.", "III.", "IV.", "V." — sub-section roman numerals
      - "TONG CONG" — totals line (also has a code=440/270, so usually hits code path first)
    """
    import unicodedata

    def _strip_accents(s: str) -> str:
        return "".join(
            c for c in unicodedata.normalize("NFD", s)
            if unicodedata.category(c) != "Mn"
        )

    normalized = _strip_accents(stripped).upper().strip()

    # Section-letter headers (e.g. "A. TAI SAN NGAN HAN", "D. VON CHU SO HUU")
    if re.match(r"^[A-E]\.\s+[A-Z]", normalized):
        return True
    # Sub-section roman numeral headers (e.g. "I. Tien va cac khoan")
    if re.match(r"^(I{1,3}|IV|V|VI{0,3}|IX|X{1,3})\.\s+[A-Z]", normalized):
        return True

    return False
```

**Key design properties of `_is_recognized_section_header`:**

1. `unicodedata.normalize('NFD')` decomposes accented characters into base character + combining mark. Stripping `Mn` (Non-spacing_Mark) category characters then removes all diacritics. The result is pure ASCII-equivalent Vietnamese text. Both poppler OCR (partial diacritics) and PyMuPDF OCR (full diacritics) produce the same stripped form.

2. The recognizer gate is deliberately NARROW. It only matches structural section labels (section letters A-E and sub-section roman numerals I-V). It does NOT attempt to match arbitrary Vietnamese section names by keyword. This narrowness means it may miss a few decorative header rows — that is acceptable. What it must not do is let garbled noise through. Narrow gate = zero false-positives on noise.

3. Lines that are real data rows always carry a code and are handled by the code-path first. The recognizer is only reached when no code was found.

### Implementation Specification (POSITIONAL CUTOFF)

The positional cutoff is applied in `TextTableExtractor.assemble()` after all pages are parsed, before returning the rows list.

**New function `_apply_positional_cutoff(rows: list[dict]) -> list[dict]`:**
```python
def _apply_positional_cutoff(rows: list[dict]) -> list[dict]:
    """
    Drop all rows after the last occurrence of a summary sentinel code.

    In Vietnamese BCTC balance sheets, the accounting identity row
    (code 440 = total equity+liabilities, or code 270 = total assets) is
    the last meaningful data row. Everything after it belongs to the
    signature block, digital certificate, or footer — never to the table.

    For income statements and cash-flow statements, the equivalent terminal
    summary codes are 50 (profit before tax) and similar. This function
    uses a statement-section-aware sentinel set.

    Implementation: scan rows in reverse; find the last row with a code in
    the sentinel set; drop all rows after it. Rows AT the sentinel are kept.
    """
    _BALANCE_SHEET_SENTINELS = frozenset({"270", "440"})
    _INCOME_SENTINELS = frozenset({"50", "60", "70"})  # extend as needed
    _CASH_FLOW_SENTINELS = frozenset({"70"})           # extend as needed

    # Find the last sentinel row index
    last_sentinel_idx = None
    for i in range(len(rows) - 1, -1, -1):
        code = rows[i].get("code")
        if code and code in _BALANCE_SHEET_SENTINELS:
            last_sentinel_idx = i
            break

    if last_sentinel_idx is None:
        # No sentinel found — cannot cut safely. Return all rows unchanged.
        # This should not happen on a valid balance-sheet extraction.
        logger.warning(
            "_apply_positional_cutoff: no sentinel code (270/440) found in rows — "
            "positional cutoff NOT applied. Check OCR quality or statement section."
        )
        return rows

    cutoff_count = len(rows) - (last_sentinel_idx + 1)
    if cutoff_count > 0:
        logger.info(
            "_apply_positional_cutoff: dropped %d post-sentinel rows "
            "(last sentinel code=%r at row_order=%r)",
            cutoff_count,
            rows[last_sentinel_idx].get("code"),
            rows[last_sentinel_idx].get("row_order"),
        )
    return rows[: last_sentinel_idx + 1]
```

**Integration point in `TextTableExtractor.assemble()`:** call `_apply_positional_cutoff(all_rows)` after the per-page loop completes and before constructing the return dict. The cutoff operates on the final stitched list, not per-page — this is correct because the sentinel (440) only appears on the last page.

**Statement-section routing:** the `assemble()` method already receives `statement_section`. Pass it to `_apply_positional_cutoff()` to select the correct sentinel set. For this task (balance sheet, `statement_section="balance_sheet"`), sentinels are `{"270", "440"}`.

---

## 3. Ruling B — Embedded-Code Split: Diacritic-Insensitive Code Finder

**Decision: Replace all four Layout regexes' dependence on label-character matching with a SCAN-AND-EXTRACT code finder that is insensitive to label content.**

### Root Cause of Current Embedded-Code Failures

The current `_try_parse_code_row()` applies four Layout regexes in order. Layouts 2 and 4 require matching a label group before the code. The non-greedy `(.+?)` in the label group must consume EXACTLY the right number of characters before the code group `(\d{2,3}[a-z]?)` can match. When poppler produces different characters (different diacritics, extra spaces, OCR-mangled tokens) in the label portion, the regex boundary shifts and the code group misses.

For the six missing codes (222/223/226/131/319/421b), the code is always present as a 2-3 digit integer (optionally with letter suffix) somewhere in the line. The problem is not that the code is absent — it is that the regex fails to split the line at the code boundary when the label portion has unexpected characters.

**The code is structurally identifiable without knowing what precedes it:** in a BCTC line, a 2-3 digit code is always followed immediately by either a large VN-format number (`\d[\d.]+`) or by a 1-3 digit note-reference number followed by a large VN number. The label is everything before the code token. This structural invariant holds regardless of what characters appear in the label.

### Specification for `_find_code_in_line(stripped: str) -> tuple[str, str, str] | None`

New function added to `infrastructure/text_table_extractor.py`. This replaces (or supplements as Layout 5) the current Layout 2 and Layout 4 regexes for lines that those two fail to match.

```python
_BCTC_CODE_SCAN_RE = re.compile(
    r"(?<!\d)"               # not preceded by a digit (avoids matching inside large numbers)
    r"(\d{2,3}[a-z]?)"      # code: 2-3 digits + optional lowercase letter suffix
    r"\s+"                   # separator
    r"(?:\d{1,3}\s+)?"       # optional note-ref: 1-3 digit integer followed by space
    r"(\(?\d[\d.,]+\)?)"     # first value: positive or paren-negative VN number
    r"(?:\s+(\(?\d[\d.,]+\)?))?"  # optional second value (prior period)
    r"\s*[A-Za-z]?\s*$"     # optional trailing single ASCII letter (e.g. "i", "\")
)

def _find_code_in_line(stripped: str) -> Optional[tuple[str, str, str]]:
    """
    Scan a stripped OCR line for a BCTC code token regardless of what precedes it.

    Returns (code, label, values_rest) or None.

    Strategy:
      1. Find all candidate code positions using _BCTC_CODE_SCAN_RE.
      2. For each match: the code is the (\d{2,3}[a-z]?) group; everything
         before the match start is the label; the value groups form values_rest.
      3. Accept the FIRST match where:
         (a) the code value is in range [100, 999] (BCTC structural codes)
             OR is a known letter-suffix form (e.g. "421b"),
         (b) at least one value group was captured.
      4. The label is stripped.rstrip() of everything before the match start.

    This function is called as Layout 5 — only when Layouts 1-4 all fail.
    It does not modify or replace the 4 existing layouts; it provides a fallback
    that is insensitive to label content.
    """
    for m in _BCTC_CODE_SCAN_RE.finditer(stripped):
        code_str = m.group(1)
        first_value = m.group(2)
        if first_value is None:
            continue

        # Accept code if numeric part is in BCTC structural range
        numeric_part = re.match(r"(\d{2,3})", code_str)
        if numeric_part is None:
            continue
        code_int = int(numeric_part.group(1))
        if code_int < 100:
            continue  # 1-2 digit note-ref numbers — skip

        label = stripped[: m.start()].strip()
        second_value = m.group(3) or ""
        values_rest = first_value + (" " + second_value if second_value else "")

        return (code_str, label, values_rest)

    return None
```

**Integration in `_try_parse_code_row()`:** add as Layout 5 after all four existing layouts:

```python
# Layout 5: scan-and-extract (diacritic-insensitive code finder).
# Only reached when Layouts 1-4 all fail. Handles embedded codes where
# the label portion contains diacritic-mangled chars that break the
# boundary regexes in Layouts 2 and 4.
m5 = _find_code_in_line(stripped)
if m5 is not None:
    return m5

return None
```

**Non-regression property:** Layout 5 is only reached when Layouts 1-4 all return None. The 72 currently-clean code rows are matched by Layouts 1-3 (with Layout 4 as fallback). Adding Layout 5 after Layout 4 cannot reduce any existing match. It can only recover previously-unmatched lines.

**False-positive risk analysis:** `_find_code_in_line` requires:
- A 2-3 digit integer preceded by a non-digit character (`(?<!\d)` lookbehind)
- Immediately followed by a VN-format number

A large VN-format number (`e.g. 58.102.970.741.619`) contains internal digit groups but the lookbehind on the code group prevents matching inside the number. The only false-positive risk is a line where a 2-3 digit note reference number appears followed by a value — e.g. `"Thuyết minh 22 1.234.567"`. This is handled by: (a) the positional cutoff already eliminates most noise lines before Layout 5 is reached; (b) the POSITIVE-KEEP gate in the else-branch ensures that if Layout 5 fires on a true note-ref line, it emits a row with code="22" which is below 100 and would be rejected by the `code_int < 100` guard.

---

## 4. Ruling C — Diacritics Robustness

**Decision: All string comparisons used for junk filtering and header recognition MUST normalize to NFD and strip combining marks before comparing. The negated skip-list may stay for high-confidence exact matches (company name, form number) but must use the normalized form.**

### Specification

Add a module-level helper `_norm(s: str) -> str` at the top of `infrastructure/text_table_extractor.py`:

```python
import unicodedata

def _norm(s: str) -> str:
    """
    Diacritic-insensitive normalization: NFD decompose + strip combining marks + uppercase.
    Used for ALL string comparisons in skip-lists and header recognition.
    Makes the parser immune to poppler vs PyMuPDF diacritic variation.
    """
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    ).upper()
```

Apply `_norm()` to both sides of every string comparison in `_parse_lines_to_rows()`:

**1. Skip-list in `_parse_lines_to_rows()`:** replace `low_stripped = stripped.lower()` and `any(skip in low_stripped ...)` with:

```python
norm_stripped = _norm(stripped)
if any(_norm(skip) in norm_stripped for skip in _JUNK_SKIP_KEYS):
    continue
```

Where `_JUNK_SKIP_KEYS` is a module-level constant (extracted from the current inline list). By normalizing both the input and the skip keys, poppler's `"BANG CAN DOI"` matches the skip key `"BẢNG CÂN"` (both normalize to `"BANG CAN"`). "Tai ngay" matches "tại ngày" (both normalize to "TAI NGAY").

**2. Date regex for signature dates:** replace the diacritic-dependent regex:
```python
# OLD (diacritic-sensitive, fails on "thang"):
if re.search(r"ngày\s+\d{1,2}\s+tháng", low_stripped):

# NEW (diacritic-insensitive):
if re.search(r"NGAY\s+\d{1,2}\s+THANG", norm_stripped):
```

**3. `_is_three_block_layout()` and `_parse_three_block_layout()`:** apply `_norm()` to all `"mã số"` and `"thuy"` checks:
```python
# OLD:
if "mã số" not in text_lower:
# NEW:
if _norm("mã số") not in _norm(text_block):
```

**4. Unit header detection in `_detect_unit()`:** apply `_norm()` before checking `_BILLION_KEYWORDS` and `_VND_KEYWORDS`.

**5. `_detect_periods()` signature line detection:** `_SIGNATURE_TIME_RE` (HH:MM:SS pattern) is already diacritic-agnostic (digit-only regex). No change needed.

**DDD layer note:** `_norm()` is a pure function (no I/O, no imports beyond `unicodedata` from stdlib). It lives in `infrastructure/text_table_extractor.py` (infrastructure layer). The DDD layer is correct: diacritic normalization is an infrastructure concern (OCR substrate adaptation), not domain logic.

---

## 5. Ruling D — Test Fixture Mandate (BLOCKING AC)

**The FIX5 regression fixture MUST be regenerated from LIVE poppler OCR of e71f845d, not reused from the spike PyMuPDF text.**

### Specification

**Blocking AC-0 (must be satisfied before any other AC can be claimed):**

The file `__tests__/fixtures/fpt_q4_2025_pages_4-7.txt` must be REPLACED with a new fixture generated by:

```bash
# Single-doc re-extraction on the local machine — NOT the batch backfill job
# Host-safe: single document, single POST, no batch (kernel-panic risk per project_host_memory_panic)
curl -s -X POST http://localhost:5001/extract-tables \
  -H "Content-Type: application/json" \
  -d '{"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
       "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf",
       "statement_section": "balance_sheet",
       "debug_dump_ocr": true}'
```

The `debug_dump_ocr` flag (dev must add it to the `/extract-tables` handler) causes the handler to write the raw per-page Tesseract OCR text to a file that dev then commits as the new fixture. This is the only way to capture exactly what poppler produces in the live container.

**Why this is blocking:** every test assertion in BT3-FIX5 must exercise the same character sequence that the live endpoint sees. Any fixture derived from a different OCR substrate (PyMuPDF, or a local direct Tesseract run on the Mac, or a stored pre-existing OCR from `pdf_extracted_text`) will produce a false-green by testing the wrong substrate.

**Alternative if `debug_dump_ocr` implementation is too complex:** dev may instead fetch the OCR text from the live `pdf_extracted_text` table via the debug endpoint, provided the extraction was confirmed to have run with poppler (fresh Tesseract via `PdfOcrAdapter`). The critical invariant is that the fixture character set must match the live container's OCR output.

**Fixture commit must include:** a header comment naming the source:
```
# Fixture: poppler OCR, e71f845d, FPT Q4 2025 balance sheet pages 4-7
# Generated: <date> via POST localhost:5001/extract-tables with debug_dump_ocr=true
# DO NOT replace with PyMuPDF/spike text — substrate mismatch causes false-green
```

---

## 6. Ruling E — Acceptance Criteria (Live Endpoint Only)

**All acceptance criteria are measured against `GET /api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` after a single-doc re-extraction (`POST localhost:5001/extract-tables`). Fixture assertions do NOT close any AC.**

**balance_pass alone is FORBIDDEN as the gate.** The sentinel check and balance_pass are necessary but not sufficient. Every AC below must independently pass.

### AC-0 (BLOCKING) — Fixture regenerated from live poppler OCR
- The committed fixture `__tests__/fixtures/fpt_q4_2025_pages_4-7.txt` is the poppler substrate (header comment confirms source).
- All unit tests in `test_bt3fix4_parser_hardening.py` are re-run against this new fixture and pass.

### AC-1 — Orphan floor
- `GET /api/bctc-inspect/table/e71f845d-...` returns total rows where `code IS NULL` ≤ 2.
- Target: ≤ 2 (the two known irreducible OCR character errors: `421a→"4214"` and any equivalent).

### AC-2 — Zero junk rows
- Zero rows in the live response where `code IS NULL AND label` contains any of the following patterns (checked via jq or curl + python):
  - Balance-sheet title: normalized text contains "BANG CAN DOI"
  - Date-context line: normalized text contains "NGAY" + digits + "THANG"
  - Signature keywords: normalized text contains "NGUOI LAP", "KE TOAN TRUONG", "PHO TONG", or "HA NOI NGAY"
  - Garbled noise: any `code=None` row where `value_current IS NULL AND value_prior IS NULL AND label` does not match the section-letter or roman-numeral header pattern.

### AC-3 — Embedded codes recovered
Codes must be present in the live response with correct values (±1 VND tolerance):
- Code "222": `value_current` = 29,148,692,599,137 ± 1 AND `value_prior` = 24,457,733,666,511 ± 1
- Code "223": `value_current` = -13,762,875,752,850 ± 1 AND `value_prior` = -11,683,165,704,793 ± 1
- Code "226" (if present) or "229": `value_current` = -1,925,944,523,215 ± 1 (FPT Q4 "Giá trị hao mòn lũy kế" for intangible assets)
- Code "131": `value_current` = 12,733,504,688,522 ± 1 AND `value_prior` = 10,537,019,113,380 ± 1
- Code "319": `value_current` = 1,014,673,786,632 ± 1 AND `value_prior` = 874,015,837,328 ± 1
- Code "421b": `value_current` = 6,924,484,515,123 ± 1 AND `value_prior` = 5,572,300,562,297 ± 1

### AC-4 — Sentinels unchanged (non-regression)
All four sentinels from current live state must remain exact after re-extraction:
- Code "270": `value_current` = 88,089,621,779,862
- Code "100": `value_current` = 58,102,970,741,619
- Code "300": `value_current` = 44,338,155,487,272
- Code "400": `value_current` = 43,751,466,292,590

### AC-5 — value_prior populated
- `value_prior IS NULL` count on code rows ≤ 2 (matches the AC-1 orphan floor — only the irreducible OCR-error rows should have null prior).

### AC-6 — No duplicate codes
- `SELECT code, COUNT(*) FROM bctc_table_rows WHERE report_id = 'e71f845d-...' AND code IS NOT NULL GROUP BY code HAVING COUNT(*) > 1` returns zero rows.

### AC-7 — Balance delta = 0
- `SELECT balance_delta FROM bctc_balance_checks WHERE report_id = 'e71f845d-...'` returns 0.0 (or < 1 VND absolute).

### AC-8 — Diacritics robustness unit test (new, mandatory)
New test file `__tests__/unit/test_bt3rethink_diacritics.py` containing:
1. `_norm("BẢNG CÂN ĐỐI") == _norm("BANG CAN DOI")` — accented vs unaccented normalize to same form
2. `_norm("tại ngày") == _norm("tai ngay")` — accented skip key matches unaccented OCR output
3. `_norm("ngày 31 tháng") == _norm("ngay 31 thang")` — date pattern diacritic-insensitive
4. `_norm("Người lập") == _norm("Nguoi lap")` — signature keyword matches both forms
5. A `_is_recognized_section_header` test: "A. TAI SAN NGAN HAN" → True (section letter present)
6. A `_is_recognized_section_header` test: garbled noise "ụ So i ide" → False
7. A `_is_recognized_section_header` test: poppler-mangled "BANG CÂN ĐỐI KẾ TOÁN" → False (not a section letter or roman numeral header)
8. `_find_code_in_line("1. Phải thu ngan han 131 7 12.733.504.688.522 10.537.019.113.380 i")` → `("131", "1. Phải thu ngan han", "12.733.504.688.522 10.537.019.113.380")`
9. `_find_code_in_line("- Nguyen gia 222 29.148.692.599.137 24.457.733.666.511")` → `("222", "- Nguyen gia", "29.148.692.599.137 24.457.733.666.511")`
10. `_find_code_in_line("garbled noise line no code")` → None

### AC-9 — Positional cutoff unit test
New test: `_apply_positional_cutoff()` with a list containing a row with code="440" followed by 5 garbled noise rows returns only the rows up to and including code="440".

### AC-10 — Import-linter fence
`lint-imports --config pyproject.toml` exit 0. Fence-A (primitives must not import infrastructure) and Fence-B (modules must not import infrastructure) both KEPT. `unicodedata` is Python stdlib — not an infrastructure import. Import is safe.

### AC-11 — Non-regression gate
Before claiming BT3-FIX5 DONE, re-run the full integration test suite on the regenerated fixture:
- All sentinel values (AC-4) pass on fixture as well as live endpoint
- `balance_pass=True`, `balance_delta=0` on fixture
- Total code rows ≥ 72 on fixture (the 71 pre-FIX4 clean rows plus the newly recovered ones)

### FORBIDDEN GATES (any agent claiming DONE based on these alone is wrong)
- `balance_pass=True` alone
- Fixture test green alone (without AC-0 fixture regeneration confirmed)
- `rows_stored: N` echo from `pushBctcTableHandler.ts` (this is input-length echo, not DB-verified count — known bug per `project_mcp_server_write_wedge.md`)

---

## 7. Files to Create / Modify

**MODIFY `apps/pdf-extractor/infrastructure/text_table_extractor.py`:**
- ADD `import unicodedata` (stdlib, safe everywhere)
- ADD `_norm(s: str) -> str` module-level helper (pure, no I/O)
- ADD `_JUNK_SKIP_KEYS: list[str]` module-level constant (extracted from current inline list in `_parse_lines_to_rows`)
- MODIFY `_parse_lines_to_rows()`: replace `low_stripped = stripped.lower()` + inline skip-list with `norm_stripped = _norm(stripped)` + `_norm(skip) in norm_stripped` against `_JUNK_SKIP_KEYS`
- MODIFY `_parse_lines_to_rows()`: replace diacritic-sensitive date regex with `re.search(r"NGAY\s+\d{1,2}\s+THANG", norm_stripped)`
- MODIFY `_parse_lines_to_rows()` else-branch: replace alpha-3 header-emit with `_is_recognized_section_header(stripped)` gate
- ADD `_is_recognized_section_header(stripped: str) -> bool` function (pure, uses `_norm`)
- ADD `_find_code_in_line(stripped: str) -> Optional[tuple[str, str, str]]` function with `_BCTC_CODE_SCAN_RE` constant
- MODIFY `_try_parse_code_row()`: add Layout 5 call to `_find_code_in_line()` after Layout 4
- ADD `_apply_positional_cutoff(rows: list[dict], statement_section: str) -> list[dict]` function
- MODIFY `TextTableExtractor.assemble()`: call `_apply_positional_cutoff(all_rows, statement_section)` before returning
- MODIFY `_is_three_block_layout()` + `_parse_three_block_layout()`: apply `_norm()` to "mã số"/"thuyết" checks
- MODIFY `_detect_unit()`: apply `_norm()` to keyword comparisons

**REPLACE `apps/pdf-extractor/__tests__/fixtures/fpt_q4_2025_pages_4-7.txt`:**
- Regenerated from live poppler OCR (e71f845d, pages 4-7)
- Header comment added naming the source and substrate

**CREATE `apps/pdf-extractor/__tests__/unit/test_bt3rethink_diacritics.py`:**
- 10 unit tests per AC-8 and AC-9 above

**MODIFY `apps/pdf-extractor/__tests__/unit/test_bt3fix4_parser_hardening.py`:**
- Update test lines to use poppler OCR character forms if fixture regeneration reveals different characters on the previously-passing cases (e.g. if "223" line has partial diacritics in poppler OCR)

**No other files changed.** mcp-server UNTOUCHED. Schema UNTOUCHED. Frozen surfaces UNTOUCHED.

---

## 8. DDD Layer and Risk Register

| Change | Layer | File |
|---|---|---|
| `_norm()` helper | infrastructure | `text_table_extractor.py` |
| `_JUNK_SKIP_KEYS` constant | infrastructure | `text_table_extractor.py` |
| `_is_recognized_section_header()` | infrastructure | `text_table_extractor.py` |
| `_find_code_in_line()` + `_BCTC_CODE_SCAN_RE` | infrastructure | `text_table_extractor.py` |
| `_apply_positional_cutoff()` | infrastructure | `text_table_extractor.py` |
| `unicodedata` import | infrastructure | `text_table_extractor.py` (stdlib, no fence risk) |
| New unit tests | test | `test_bt3rethink_diacritics.py` |
| Fixture replacement | test fixture | `fpt_q4_2025_pages_4-7.txt` |

**R-1 (MEDIUM) — POSITIVE-KEEP gate drops legitimate multi-line section labels.**
If a real section header does not match the section-letter or roman-numeral pattern (e.g. "NGUỒN VỐN" on page 6 of FPT which is a standalone section separator line), it will be silently dropped. Assessment: these rows have `code=None` and `value_current=NULL` — they are display-only. Dropping them does not affect balance_pass, sentinel values, or any AC. Risk is cosmetic UI gap only. Mitigation: expand `_is_recognized_section_header` in a future sprint if needed.

**R-2 (LOW) — `_find_code_in_line` false-positive on note-ref lines.**
A line like `"Thuyết minh 22 1.234.567"` could produce code="22" (rejected by `code_int < 100` guard) or code="123" if there happens to be a 3-digit integer somewhere. The `(?<!\d)` lookbehind and the requirement for a VN-format value after the code reduce this risk substantially. Mitigation: the positional cutoff removes the footnote block entirely (it appears after the last sentinel code row). Lines in the pre-cutoff range are data lines where false-positive code detection would be caught by the duplicate-code guard and by the BT-5 cross-check gate.

**R-3 (LOW) — Positional cutoff applied incorrectly if code 440 appears on a non-balance-sheet page.**
For income statements and cash-flow statements, sentinels are different codes. The `statement_section` parameter routes to the correct sentinel set. For the specific task here (balance sheet, e71f845d), this is not a risk. Mitigation: extend `_apply_positional_cutoff` sentinel sets before running on the full 14-doc gold set at BT-6.

**R-4 (LOW) — `unicodedata.normalize("NFD")` performance on every line.**
The normalization is O(n) in string length. For typical BCTC line lengths (~80-200 chars) and 200-400 lines per page, the overhead is negligible at production throughput (1 doc per trigger). Not a concern.

**R-5 (MEDIUM) — FIX4 regexes CHANGE-1 through CHANGE-4 remain in the codebase.**
The FIX4 changes are not harmful and may still match some cases. They are subsumed by the new Layout 5 and by the POSITIVE-KEEP gate. However, the FIX4 skip-list (diacritic-sensitive) will now have its comparisons done against `norm_stripped` (diacritic-insensitive) via Ruling C, which fixes the root diacritics mismatch. Net: FIX4 changes become fully effective after Ruling C is applied. No removal needed.

---

## 9. Verification Sequence (for ops after deploy)

**Step 1 (required, host-safe):** single-doc re-extraction only:
```bash
curl -s -X POST http://localhost:5001/extract-tables \
  -H "Content-Type: application/json" \
  -d '{"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
       "pdf_path": "/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf",
       "statement_section": "balance_sheet"}'
```

**Step 2:** live endpoint verification row-by-row (not fixture, not badge):
```bash
curl -s "http://localhost:3000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65" | \
  python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('rows', [])
orphans = [r for r in rows if r.get('code') is None]
codes = {r['code'] for r in rows if r.get('code')}
print(f'total={len(rows)} orphans={len(orphans)} codes_present={sorted(codes)}')
print(f'balance_pass={d.get(\"balance_check\",{}).get(\"balance_pass\")}')
print(f'balance_delta={d.get(\"balance_check\",{}).get(\"balance_delta\")}')
for target in [\"222\",\"223\",\"131\",\"319\",\"421b\"]:
    found = next((r for r in rows if r.get('code')==target), None)
    print(f'  code={target}: {found}')
"
```

**NEVER trigger bctcBatchTableBackfillJob for this verification.** Single-doc POST only (host kernel-panic risk from concurrent heavy load).

---

## 10. Build Standard

Classification: BUG-FIX / ARCHITECTURAL HARDENING (in-zone, no new primitives, no schema changes, no mcp-server changes)
BUILD-STANDARD: not-applicable

---

## RETURN

```
DONE: BT3-RETHINK root-cause ruling complete. Filter strategy: POSITIVE-KEEP + POSITIONAL CUTOFF.
ZONE: apps/pdf-extractor/
NEXT: dev-pdf-extractor (BT3-FIX5) — implement Rulings A/B/C/D/E; fixture regeneration is AC-0 (blocking)
HANDOFF: docs/handoffs/TASK_BCTC-TABLE.md (BT3-RETHINK section to be appended by dev-pdf-extractor handoff step; this brief is the ruling input)
PIPELINE: continue
```
