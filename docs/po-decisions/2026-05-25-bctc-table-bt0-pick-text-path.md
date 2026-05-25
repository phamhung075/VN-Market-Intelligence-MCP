# BT-0-PICK — Production Extractor Pick: TEXT path (Tesseract + BT-1 primitives)

**Sprint:** BCTC-TABLE · **Gate:** BT-0-PICK · **Decided:** 2026-05-25T17:17Z by PO
**Authority:** PO (D2 evidence gate) · **Inputs:** BT-0 spike eval results on disk (do NOT re-run)
**Trigger:** user inspected live `/api/bctc-inspect` viewer, reported "data always only text, not table detect" — the core production gap this sprint closes.

---

## Decision

**PICK = TEXT path: Tesseract OCR (vie+eng) + the three BT-1 pure primitives** (`vn_number_normalize`, `reconcile_figures`, `select_period_column`). This is the production figure extractor.

**PP-StructureV3 IMAGE path = DEFERRED, optional cross-check only.** Not on the figures critical path.
**External-API VLM = OUT (privacy non-negotiable, Open Q1 default self-hosted-only).**

## Measured evidence (BT-0 spike, on disk — `apps/pdf-extractor/spike/eval/results/`)

- **FPT consolidated balance sheet, page 4** (`FPT_page4_balance_sheet.md`): TEXT path = **100.0% figure accuracy (20/20 rows within ±0.5%)**, **3.4s/page**, Tesseract vie+eng, CPU. IMAGE path SKIPPED (text already passed).
- **Full balance sheet, pages 4-7 stitched** (`FPT_balance_sheet_4-7.md`): ~80-row table, both period columns (31/12/2025 + 31/12/2024). **Accounting identity balances to the dong:** Total Assets 88,089,621,779,862 = Liabilities 44,338,155,487,272 + Equity 43,751,466,292,590; **Balanced: True**. Per-section TEXT figure-accuracy: p4 100%, p5 95.8%, p6 100%, p7 86.7%. Speed 4.0s/page.
- **Bake-off scoreboard** (`scoreboard.md`): PP-StructureV3 IMAGE on VNM = **0.0% (0/6) figure accuracy at 45.29s/page** — image path is both slower and worse on figures; correctly skipped wherever text passes.

## Verdict against pass-bar

Pass-bar = **≥95% of result-column figures within ±0.5%** (Open Q3 PO default, no user override). 
**MET** on the FPT reference doc: page-level 100% on 3 of 4 sections, sentinel rows (100/200/270/300/400/440) 6/6 PASS, full-table accounting identity balanced. The decimal-shift class (VNM `net_profit`, DHG `rev`) is closed at parse time by BT-1 (shipped `e74abc43`).

## Why TEXT over IMAGE

1. Clears the bar on CPU at ~4s/page — 11x faster than PP-StructureV3's 45s/page.
2. Privacy-safe and self-hosted (D1, Open Q1 default).
3. Already wired live (BT-1 primitives in `FinancialReportsModule.process_report()`).
4. PP-StructureV3 added zero figure accuracy in the one measured run (0/6).

## Honestly-flagged deferred items (NOT closed by this pick)

- **Sub-bar rows:** p5 (95.8%, marginal) and **p7 (86.7%, below bar)** on the FPT doc. These are the rows where the IMAGE cross-check may later earn its keep.
- **Low cell-F1 (0.07-0.12 across sections):** grid/structure reconstruction is poor even where the *figures* are right. Acceptable for a code→value figure table; NOT acceptable if we ever need true cell-grid fidelity. PP-StructureV3 IMAGE path is the deferred remedy — self-hosted, revisit ONLY for the sub-bar p5/p7 rows + cell-grid, never for figures, never external-API.
- **Single-doc evidence:** the measured pass-bar is proven on FPT. BT-6 QA must re-run the harness across the wider 14-doc gold-set as the regression gate, not just FPT.

## Open-question resolutions (PO defaults, no user override)

- **Q1 (privacy):** self-hosted ONLY. No PDF/image leaves our infra. External-API VLM stays an opt-in follow-on, never an active task.
- **Q2 (main-server GPU):** UNRESOLVED — TEXT path is CPU-feasible at 4s/page so the pick does NOT require GPU. ops confirms main-server CPU sizing at BT-4. GPU only matters if the deferred IMAGE cross-check is later activated.
- **Q3 (figure pass-bar):** ≥95% within ±0.5% — adopted, already met on FPT.

## Next

BT-2 — architect blueprint for: (a) producing the structured code→value table during extraction, (b) NEW schema to STORE structured rows per doc+page, (c) `/api/bctc-inspect` viewer renders the table next to OCR text + balance-check pass/fail badge. Spans dev-pdf-extractor (extraction+store) + dev-mcp-server (inspector read+render; SI-2 boundary).
