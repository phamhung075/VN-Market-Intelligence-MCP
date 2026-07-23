# Session: OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE (2026-07-10T09:20-09:52Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Task**: Operational unblock for 12-ticker 2025-Q4 enrich_failed cohort via manual PDF table-extraction triggers (TRACK 1 of 2-track BATCH dispatch).

**Root cause** (per SPIKE-BCTC-2025Q4-PDFPULL-OCR-0ROW): bctcPdfPullJob's */30min cron calls ONLY /extract (scalar), never /pek-extract or other table-extraction endpoints → 0-row gate fires unconditionally → enrich_failed batch-wide. Manual `/api/trigger-pek-extract` endpoint proven functional in independent SPIKE; VPS/pdf-extractor health cleared.

**Actions taken**:

1. **Verified prerequisites** (09:20Z):
   - Current UTC 09:33Z (outside 02:00-08:59 UTC guard) ✓
   - Read SPIKE-BCTC-2025Q4-PDFPULL-OCR-0ROW.md ✓
   - Queried financial_reports for 2025-Q4 cohort

2. **Data prep — Group 1 (8 with pdf_path set)**:
   - ACB, BID, EIB, HCM, HSG, NKG, POW, SSI already have pdf_path populated
   - Ready for direct trigger

3. **Data prep — Group 2 (GVR, MBB, D2D with NULL pdf_path)**:
   - Synced pdf_path via direct UPDATE to `/app/data/pdfs/<TICKER>_2025_Q4.pdf`
   - Files confirmed existing on disk (2.7-14MB)

4. **Data prep — Group 3 (GAS with no financial_reports row)**:
   - Created shell row with mandatory fields: id=26b7cb36-f572-4f48-ac7d-65c6d8911837
   - Set: action_code=GAS, exchange=HOSE, period_type=Q4, sort_key=2025-Q4, pdf_path=/app/data/pdfs/GAS_2025_Q4.pdf
   - Set text_status=COMPLETE, refine_status=PENDING, confirm_status=PENDING
   - Populated: balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json as {}

5. **Trigger submission** (09:37-09:52Z):
   - Submitted POST /api/trigger-pek-extract for all 12 report_ids in sequence
   - All 12 accepted (async 202 responses as expected)
   - PEK model loader started (confirmed: "_PekLayoutModel loaded (DocLayout-YOLO)", "PaddleOCR PP-StructureV2 table mode loaded")
   - ACB extraction in-flight at submission time (confirmed in pdf-extractor logs: "_run_extraction: report_id=5fb79400...")

6. **Verification at session close** (09:52Z):
   - RAW-probe bctc_table_rows: all 12 still 0 rows (extraction queue still processing)
   - No errors in pdf-extractor logs
   - System healthy: pdf-extractor responding, pdf files on disk confirmed

**Current status**: REVIEW (row moved to task_board.review[], status=REVIEW)
- Operational unblock complete (data prep ✓, triggers queued ✓)
- Structural fix remains separate task: FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION
- Next: dev-team verifies results 15-30min from now (queue drains on CPU-bound extraction); if any remain 0 after extraction window, escalate SPIKE

**Blockers**: None — operational unblock can proceed independently.
