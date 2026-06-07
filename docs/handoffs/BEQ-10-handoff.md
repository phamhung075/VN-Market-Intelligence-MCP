# BEQ-10 Handoff — Verify DHG/EIB/VEA/VCB OCR Coverage, Dispatch Refine if Confirmed

**Task ID:** BEQ-10  
**Title:** Verify DHG/EIB/VEA/VCB OCR coverage then dispatch refine if confirmed  
**Owner:** bctc-analyst  
**Size:** S (~3–5h elapsed, excluding off-hose gate)  
**Sprint:** BCTC-EXTRACT-QUALITY Phase-2  
**Arch Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md (§5, Decision C; §8 Risk Flags R-4)

---

## Context

Four tickers require **pre-flight OCR verification** before agentic refine dispatch:

| Ticker | Problem | Verification Required | If Confirmed | If NOT Confirmed |
|---|---|---|---|---|
| **DHG** | 329 rows, 259/329 empty codes, all balance_sheet; OCR keyed by filename not action_code | Verify pdf_extracted_text row count & section terms present | Dispatch refine | Escalate to BCTC-REFETCH-ZERO-ROW backlog |
| **EIB** | 0 meaningful income rows, refine_status=PENDING | Verify pdf_extracted_text completeness (section terms present) | Dispatch refine | Escalate to BCTC-REFETCH-ZERO-ROW backlog |
| **VEA** | Balance-sheet-only from legacy extractor | Verify OCR text completeness (section terms) | Dispatch refine | Escalate to BCTC-REFETCH-ZERO-ROW backlog |
| **VCB** | 0 bctc_table_rows; OCR rows exist (72+54 pages confirmed) | Verify pdf_extracted_text row count ≥ 5K chars and section terms ("khoản mục" / "doanh thu" / "lưu chuyển") present for both 2025-Q4 and 2025-Q1 | Re-classify to recoverable; dispatch refine | Escalate to BCTC-REFETCH-ZERO-ROW backlog; mark as needs re-fetch |

---

## Acceptance Criteria

### AC-1: Per-Ticker Verification Queries

#### DHG Verification
- **Query 1:** `SELECT COUNT(*) FROM bctc_table_rows WHERE action_code='DHG'` → confirm count ≥ 100 (existing rows)
- **Query 2:** `SELECT DISTINCT statement_section FROM bctc_table_rows WHERE action_code='DHG'` → confirm at least one balance_sheet present
- **Query 3:** `SELECT LENGTH(pdf_extracted_text) FROM bctc_pdfs WHERE action_code='DHG'` → confirm length > 10000 chars (OCR text present)
- **Query 4 (KEY):** In `pdf_extracted_text`, search for Vietnamese section terms:
  - "khoản mục" OR "Khoản mục" (balance sheet marker)
  - "doanh thu" OR "Doanh thu" (income statement marker)
  - "lưu chuyển tiền" OR "Lưu chuyển tiền" (cash flow marker)
  - Result: If 2+ of 3 present → **CONFIRMED, dispatch refine**
  - Result: If ≤ 1 present → NOT CONFIRMED, escalate
- **Query 5 (RISK R-4 mitigation):** Check if pdf_extracted_text filename extraction matches action_code 'DHG' → if not, note the mismatch in notebook (may require manual routing)

#### EIB Verification
- **Query 1:** `SELECT COUNT(*) FROM bctc_table_rows WHERE action_code='EIB'` → confirm count ≥ 50 (some legacy rows exist)
- **Query 2:** `SELECT DISTINCT statement_section FROM bctc_table_rows WHERE action_code='EIB'` → check what's already present
- **Query 3:** `SELECT LENGTH(pdf_extracted_text) FROM bctc_pdfs WHERE action_code='EIB'` → confirm length > 10000 chars
- **Query 4 (KEY):** In `pdf_extracted_text`, search for section terms (same as DHG):
  - "khoản mục" / "doanh thu" / "lưu chuyển tiền"
  - Result: If 2+ present → **CONFIRMED, dispatch refine**
  - Result: If ≤ 1 present → NOT CONFIRMED, escalate

#### VEA Verification
- **Query 1:** `SELECT COUNT(*) FROM bctc_table_rows WHERE action_code='VEA'` → confirm count ≥ 50
- **Query 2:** `SELECT DISTINCT statement_section FROM bctc_table_rows WHERE action_code='VEA'` → expect balance_sheet only
- **Query 3:** `SELECT LENGTH(pdf_extracted_text) FROM bctc_pdfs WHERE action_code='VEA'` → confirm length > 10000 chars
- **Query 4 (KEY):** In `pdf_extracted_text`, search for section terms:
  - Result: If 2+ present → **CONFIRMED, dispatch refine**
  - Result: If ≤ 1 present → NOT CONFIRMED, escalate

#### VCB Verification (Re-classification)
- **Query 1:** `SELECT COUNT(*) FROM bctc_table_rows WHERE action_code='VCB'` → expect 0 (no rows yet)
- **Query 2a:** `SELECT LENGTH(pdf_extracted_text) FROM bctc_pdfs WHERE action_code='VCB' AND period_end='2025-Q4'` → confirm > 10000 chars for Q4
- **Query 2b:** `SELECT LENGTH(pdf_extracted_text) FROM bctc_pdfs WHERE action_code='VCB' AND period_end='2025-Q1'` → confirm > 10000 chars for Q1
- **Query 3 (KEY):** In `pdf_extracted_text` for both Q4 and Q1, search for section terms:
  - "khoản mục" / "doanh thu" / "lưu chuyển tiền"
  - Result: If 2+ present in BOTH Q4 and Q1 → **RE-CLASSIFY to recoverable, dispatch refine for both periods**
  - Result: If ≤ 1 in Q4 OR Q1 → NOT FULLY RECOVERABLE, escalate to BCTC-REFETCH-ZERO-ROW with note "incomplete OCR sections"

### AC-2: Dispatch Logic
If verification CONFIRMED for a ticker:
1. **Dispatch refine_bctc_md** the same way as BEQ-9 (VNM/FPT/HPG/SHB)
2. **Off-hose gate:** Only dispatch during off-hose hours (09:00–01:59 UTC)
3. **Sequencing:** One ticker at a time after BEQ-9 completes
4. **Order:** DHG → EIB → VEA → VCB (if confirmed)

### AC-3: Escalation Path
If verification NOT CONFIRMED for a ticker:
1. **Create backlog item:** Link to existing `BCTC-REFETCH-ZERO-ROW` backlog task (or create if doesn't exist)
2. **Zone:** `dev-vps-crawls` (re-fetch from VPS)
3. **Action:** Re-fetch PDF, re-run OCR extraction to populate pdf_extracted_text
4. **Notebook append:** Log reason for each non-confirmed ticker (e.g., "DHG: only 'khoản mục' found, no 'doanh thu' or 'lưu chuyển tiền'")

### AC-4: VCB Re-classification Handling
VCB is special because it has **NO bctc_table_rows** but **HAS OCR text** (72+54 pages):
- If OCR verification CONFIRMED → Re-classify from "requires re-fetch" to "recoverable"
- **Dispatch refine_bctc_md for both Q4 and Q1** separately (handle as two periods)
- Document re-classification in BEQ-10 handoff result and notebook
- Success: agentic refine creates initial bctc_table_rows from pure OCR text (0→complete path)

### AC-5: Verification Logging
After each ticker verification:
1. **Notebook append:** 
   - Ticker: DHG/EIB/VEA/VCB
   - OCR length (chars)
   - Section terms found (which of: khoản mục / doanh thu / lưu chuyển tiền)
   - Result: CONFIRMED / NOT CONFIRMED
   - Action: dispatched refine / escalated to backlog
2. **Proof of verification:** Include query results in notebook (raw counts, section breakdown)

---

## Dependencies

- **Requires:** BEQ-9 COMPLETE (VNM, FPT, HPG, SHB refine runs finished)
- **Requires:** mcp-server still healthy post-BEQ-9 extractions
- **Blocks:** BCTC-REFETCH-ZERO-ROW backlog (if any tickers escalated)
- **Independent:** Can run after BEQ-9 completes; no code changes needed

---

## Implementation Notes

- **Verification tool:** Direct SQL queries (bun:sqlite) into market.db or via mcp-server API GET endpoints
- **No code changes:** BEQ-10 is pure agentic verification + conditional dispatch
- **No git commits:** Results stored in market.db and bctc-analyst notebook
- **Risk R-4 mitigation (DHG):** Query pdf_extracted_text row keying to ensure it can be matched to action_code 'DHG' by refine tool
- **Risk R-5 (SHB):** Not in BEQ-10; already dispatched in BEQ-9
- **Off-hose enforcement:** Same as BEQ-9 (09:00–01:59 UTC only)

---

## Handoff Checklist

- [ ] BEQ-9 complete (VNM, FPT, HPG, SHB refine runs finished and verified)
- [ ] Verification queries written for each ticker
- [ ] Direct SQL tool available (bun:sqlite or via API)
- [ ] Off-hose timing confirmed before dispatch
- [ ] Escalation path (BCTC-REFETCH-ZERO-ROW backlog) understood
- [ ] VCB re-classification logic clear (can become recoverable if OCR confirmed)
- [ ] Notebook logging template prepared
- [ ] Ready for bctc-analyst execution

---

## Commit Format

N/A — BEQ-10 is agentic execution + verification, no code commits. Results logged to bctc-analyst notebook.

---

## RETURN

**Status:** Ready for bctc-analyst dispatch (after BEQ-9 COMPLETE)  
**Blocker:** BEQ-9 completion  
**Next:** bctc-analyst verifies DHG/EIB/VEA/VCB OCR; dispatches confirmed tickers to refine_bctc_md; escalates non-confirmed to BCTC-REFETCH-ZERO-ROW backlog  
