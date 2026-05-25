# PO Notebook

**Cycle:** BCTC-TABLE BT-0-PICK gate — recorded production pick, advanced chain to BT-2, reframed core gap from user finding.
**Last update:** 2026-05-25T17:17Z
**Status:** Phase-0 CLOSED. BT-1 + BT-0 + BT-0-PICK all DONE. NEXT = architect BT-2 blueprint.

---

## 2026-05-25T17:17Z — BT-0-PICK + chain advance

**Trigger:** user inspected live `/api/bctc-inspect`, reported "data always only text, not table detect". Router confirmed (read `bctcInspectHandler.ts`): viewer reads ONLY `pdf_extracted_text` (raw OCR) + `financial_reports` (4 summary figures). NO structured code→value table storage exists anywhere in prod → inspector physically cannot show a detected table. User is CORRECT — this is the core production gap, not a parse bug.

**BT-0-PICK DECISION (verified against eval results on disk, did NOT re-run):**
- PICK = **TEXT path (Tesseract vie+eng + BT-1 primitives).** FPT page-4 100% (20/20 ±0.5%) @3.4s/page; full stitch p4-7 balances to the dong (Assets 88.09T = Liab 44.34T + Equity 43.75T); ≥95%±0.5% bar MET.
- PP-StructureV3 IMAGE = DEFERRED optional self-hosted cross-check (0/6 VNM @45s/page; revisit ONLY for sub-bar p5 95.8%/p7 86.7% + low cell-F1 0.07-0.12). External-API VLM = OUT (privacy).
- Decision note: `docs/po-decisions/2026-05-25-bctc-table-bt0-pick-text-path.md`.

**Chain advanced** (TASKS.md + handoff + SPRINT_GOAL + durable memory):
- BT-2 architect blueprint REFRAMED to close produce→store→render: (a) emit structured table + balance check; (b) NEW `bctc_table_rows` schema; (c) `/api/bctc-inspect` render contract + balance badge.
- BT-3 produce+store (dev-pdf-extractor) → NEW **BT-3i** inspector render (dev-mcp-server, SI-2 boundary) → BT-4 host (CPU, main server) → NEW **BT-4b** one-shot re-extract 14 stranded docs (pre-QA) → BT-5 cross-check → BT-6 QA (wider gold-set + closes QA-on-BT1) → BT-EXIT.
- Open Q1/Q2/Q3 RESOLVED with PO defaults (self-hosted only / no GPU for TEXT / ≥95%±0.5%).

**Integrity:** edited only TASKS.md + TASK_BCTC-TABLE.md + SPRINT_GOAL.md + new po-decisions file + durable memory + this notebook. NO pilot-status touched. NO production code. No frozen pilot surfaces. No docker. No agents spawned.

## Carry-over
- **NEXT = spawn architect for BT-2** (design-only blueprint; gates all integration). bctc-inspect render = SI-2 → route to dev-mcp-server at BT-3i.
- Deferred: FPT p5/p7 sub-bar rows + low cell-F1 (IMAGE remedy); QA-on-BT1 (folded into BT-6); 14 stranded docs re-extract ONCE at BT-4b.
- Prior-cycle carry (still open): DOCKER SESSION QUEUE (DRIFT-1 macro, DRIFT-2 kinh-dich, mcp P1-QA+rebuild, frontend rebuild AWAITING-USER-G9); signal backlog 719 files → janitor; tnb chef-frozen 72h → cowork lane.
- MCP-GAP: this session had no `call_tool` gateway access (no telegram send). Dispatcher owns WORK-channel debt.
