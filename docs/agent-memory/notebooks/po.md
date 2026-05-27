# PO Notebook

## Cycle 2026-05-27T20:46:28Z — PEK-INTEGRATE G9 REJECTED #2 → Round 6 RENDER-SEAM BLOCK (architect-first)

**Input:** Main terminal CONTEXT — user rejected PEK-INTEGRATE G9 a SECOND time. Verbatim:
"why OCR Text render is always old data FPT page 3 and 5 no change after all demande fix."
Main terminal read-only diag CODE-PROVED a NEW root cause (not another OCR-quality patch).

**ROOT CAUSE (CODE-PROVEN, I re-verified the two claims, did NOT re-litigate):**
1. DUAL-PATH RENDER DRIFT — inspector OCR Text panel (`bctcInspectHandler.ts:19,380`) reads OLD
   `pdf_extracted_text`; table panel reads OLD `bctc_table_rows`; ONLY zones panel reads NEW PEK
   `bctc_page_zones`. PEK writes ONLY `bctc_layout_units`+`bctc_page_zones`. So a perfect PEK
   extraction can NEVER change the OCR Text render. CONFIRMED via grep + Read.
2. 422 TRIGGER — `PekExtractRequestSchema` (`handlers.py:142-155`) requires BOTH report_id AND
   pdf_path (mandatory). Backfill driver sent report_id only → PEK never re-ran on FPT + 9 others.
   CONFIRMED via Read.
Corpus: only 2/12 have PEK units (DGC 6, DIG 11); FPT sentinel + 9 = 0 PEK units; FPT old data @2026-05-26.

**ACTION — Step 0 BLOCK + Round 6 escalation (ARCHITECT-FIRST per `feedback_recurring_bug_escalation`):**
6 fix commits on PEK pipeline + "fix didn't take" → NO new patch before architect root-cause brief.
- VOIDED prior PEK-EXIT sign-off; PEK-EXIT row → BLOCKED.
- PEK-MULTIPAGE → DONE (backend grouping `2e228f0d`+`ed347661` adjudicated CORRECT, but backend-only).
- Opened Round-6 RENDER-SEAM chain in TASKS.md: PEK-RENDER-DESIGN (architect, READY) →
  PEK-RENDER-MCP (dev-mcp-server, render repoint) + PEK-RENDER-PDFX (dev-pdf-extractor, 422 fix) →
  PEK-RENDER-DEPLOY (ops, rebuild both + re-extract 12 sequential off-hours) →
  PEK-RENDER-QA (qa, FPT OCR-Text-render-fresh acceptance + 4-gate corpus) → PEK-RENDER-EXIT (po) → USER G9.
- Zone flipped `apps/pdf-extractor/` → `multi`.
- Appended full PO-BLOCK record to `docs/handoffs/TASK_PEK-INTEGRATE.md` (root cause, 3 design points,
  hard constraints) for architect.

**Docs touched (UNSTAGED — main terminal commits):** TASKS.md (sprint status header + PEK-EXIT row +
PEK-MULTIPAGE row + Round-6 task block + Notes), TASK_PEK-INTEGRATE.md (PO-BLOCK append), this notebook.
NO code, NO `.md` agent/flow edits this cycle.

**NEXT:** architect → `docs/architecture-briefs/2026-05-27-pek-render-seam.md` (DESIGN ONLY: SSOT for
inspector OCR/table render — one unified fail-loud path, no dual-path; + 422 trigger fix carrying
pdf_path; + exact zone split render=mcp-server / trigger=pdf-extractor). Returns to PO gate.

## Carry-over
- **PEK-RENDER goal ARMED until USER verbal G9.** The acceptance test for THIS bug = `/api/bctc-inspect`
  FPT `e71f845d` OCR Text + table panels render FRESH multi-page PEK data (NOT 2026-05-26). NOT done
  until that renders fresh AND user signs off. HARD: PDF-Extract-Kit/ pristine; scoped git add never -A;
  CPU-only/8GB; FROZEN (text_table_extractor.py, sandbox/runner.py, pilot-status.json,
  generic_md_table_extractor.py); re-extract STRICTLY off HOSE hours; DB verify = in-container bun -e
  readonly COUNT, never push-echo. After architect brief returns → PO red-teams the design at the gate,
  then dev-mcp-server + dev-pdf-extractor implement per brief; ops rebuilds BOTH services (not restart).
- **SELF-IMPROVE-GATE** SIG-DESIGN READY → agents-architect writes brief → SIG-PO-GATE (PO red-teams
  the DESIGN). Lane-(a)/(c) `.md`→agent-father; lane-(b) code→dev-team+QA. SIG-EXIT armed until loop proven.
- **NEWS-CMD-QA** in-flight (BATCH) → NEWS-CMD-FIX (if CHANGES_REQUESTED, dev-mcp-server) else NEWS-CMD-EXIT.
  Goal ARMED until USER confirms reads usefully — main terminal owns verbal G9.
- **CHEF-ATTN** (BA spec READY, apps/mcp-server zone) HELD behind NEWS-CMD — same zone, avoid QA churn.
- Channel audit (MARKET/WORK/BUG via gateway) still owed → main terminal next cron tick (PO has no call_tool).
- All files left UNSTAGED except PO doc edits — main terminal commits.
