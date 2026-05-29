# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

## Working Memory

### 2026-05-30 — BTB-UNBLOCK-DEV COMMITTED (b1e826c2)

**Task:** BTB-UNBLOCK-DEV | Sprint: BCTC-TABLE-BOUNDARY | Status: DONE — NEXT: ops (rebuild + patient instrumented run)

**Files changed (commit b1e826c2):**
- `apps/pdf-extractor/interface/handlers.py` — FAIL-LOUD exc_info=True + ECHO-vs-DB log wording in `_run_pek_extract`
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` — per-page heartbeat in `_run_table_extraction` + hard timeout (ThreadPoolExecutor, PEK_EXTRACTION_TIMEOUT_SECONDS env, default 30min) in `extract_layout_and_tables`
- `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` — +6 new tests (TestFailLoudAndTimeout), DV-GUARD PROVEN-RED
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — boundary comment only, state machine UNCHANGED

**Test results:** 38/38 in test_pek_engine_adapter.py PASS. DV-GUARD: test_run_pek_extract_logs_exc_info_true_on_failure PROVEN-RED on reverted handler (exc_info=None), GREEN on current code.

**Constraints verified:** text_table_extractor.py 0-diff. PDF-Extract-Kit PRISTINE. No GPU deps. No new heavy imports (stdlib only: time, concurrent.futures). Scoped commit (4 files, no contamination).

**NEXT: ops** — rebuild pdf-extractor container (no-cache), then ONE patient instrumented off-hours re-extraction of FPT e71f845d to completion (NO premature kill). Watch per-page heartbeat logs. After completion: verify DIRECT in-container market.db COUNT. If push 200-OK but COUNT=0 → real write-wedge → NEXT dev-mcp-server BTB-UNBLOCK-MCP.

---

### 2026-05-29 — BTB-DEV COMMITTED (d297f3ba)

**Task:** BTB-DEV | Sprint: BCTC-TABLE-BOUNDARY | Status: DONE — NEXT: ops (rebuild)

**Files changed (commit d297f3ba):**
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — all 4 root causes fixed in one pass
- `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` — NEW: 42 pure-function tests
- `apps/pdf-extractor/__tests__/unit/test_document_map.py` — _simulate_grouping updated to new state machine; 58/58 pass

**Test results:** 659/659 unit tests PASS. DV-1 PROVEN-RED pre-fix, GREEN post-fix. DV-2 PROVEN-RED pre-fix, GREEN post-fix.

**Constraints verified:** PDF-Extract-Kit PRISTINE (0-diff). text_table_extractor.py 0-diff. Scoped commit (3 files). No GPU deps. No new imports.

---

### 2026-05-28 — BCTC-EVAL-PDFX READY (unstaged)

**Task:** BCTC-EVAL-PDFX | Sprint: BCTC-EVAL-SUBSTRATE | Status: READY (files unstaged — main terminal commits)

**Test results:** 36/36 PASS. DDD compliance verified. PEK subtree CLEAN.

**NEXT:** ops BCTC-EVAL-PDFX deploy.

---

### History pointer

Prior entries (PDF-SINGLE-SOURCE, PEK-RENDER-PDFX, PEK-LAYOUT-CFG, PEK-IMPORT-CHAIN, PEK-DEPLOY-FIX, PEK-ORPHAN-RECONCILE, PEK-IMPL, LF-FIX, LF-EXTRACT, MD-EXTRACT-1..9) truncated at 200L per notebook cap. See `docs/handoffs/TASK_BCTC-MD-TABLE.md` + `docs/handoffs/TASK_PEK-INTEGRATE.md` for full history.
