# PO Notebook

**Cycle:** :30 2026-05-26T17:30Z — MD-EXIT BCTC-MD-TABLE close-out (product acceptance recorded; pending user G9).
**Last update:** 2026-05-26T17:30Z
**Status:** BCTC-MD-TABLE chain PASSED on live; Decision D ACCEPTED; goal STILL ARMED until user verbal G9. No code changes, no pilot-status touched.

---

## 2026-05-26T17:30Z — :30 (MD-EXIT BCTC-MD-TABLE)

**Action:** Appended `[PO] MD-EXIT — BCTC-MD-TABLE CLOSED (pending user G9)` to `docs/handoffs/TASK_BCTC-MD-TABLE.md`. Recorded product-level acceptance vs **Decision D**.

**Chain verified (read, not re-run):**
- architect MD-EXTRACT-9 design (brief §9.x) → main-terminal §9.8 re-trace APPROVED.
- dev impl `7e6bff6a` (3 new fns + 2 constants; old `_attach_labels_ordinal` 0-diff; 466 unit pass).
- ops MD-DEPLOY-9 `a448aa84` rebuilt + proved code live + single FPT re-extract → row **id=11** (17:21:28Z).
- main-terminal LIVE-VERIFY-9 `818910a9` — 5 binding ACs PASS (direct market.db).
- qa MD-QA-9 — 12 AC/scope gates PASS, notebook committed `6821d853` (false-green #5 guard).

**Decision D ACCEPTED:** generic table-detection→markdown works for ALL THREE BCTC geometries from ONE path, NO BCTC semantics:
- D-(1) AC-0 grep-clean (geometry only; AC-3F text_table_extractor.py 0-diff = AUGMENT not replace).
- D-(2) narrow balance (88.089.621.779.862) + wide segment-matrix (3 revenues 1 row 3 cells) + dense income (row-0 `Doanh thu…`↔20.258.866.135.395; row-1 SEP `Các khoản giảm trừ`↔33.415.777.986). 5th-attempt label-interleave FIXED on live.
- D-(3) OCR-as-md live; gate = direct DB read by 2 parties, never batch/fixture-only.

**Accepted deferred (NON-blocking, out of scope):** (1) code-column absorption on dense rows; (2) Tesseract char-level OCR glitches. NOT in this task's done-bar.

**Did NOT self-clear the goal.** Final closure = USER verbal G9 sign-off (binding session goal). Goal STILL ARMED. If user G9-rejects on deferred items → NEW scoped task, not a reopen.

**Edits (working tree, NOTHING staged — main terminal commits):**
- docs/handoffs/TASK_BCTC-MD-TABLE.md (MD-EXIT entry appended)
- docs/agent-memory/notebooks/po.md (this)

**No pilot-status JSON, no frozen surface, no code, no re-extract/batch touched.**

---

## Carry-over (next cycle)

- **AWAITING USER G9** on BCTC-MD-TABLE income statement live render. On YES → goal cleared in SPRINT_GOAL § Sprint BCTC-MD-TABLE. On NO → scope the rejection into a new task (deferred OCR/code-column = candidate).
- Prior-tick batch MCPZONE-BATCH-1 (NEWS-INGEST-2b + MZH-1 + MZH-2, apps/mcp-server) dispatched :07 — expect dev-mcp-server return + MCPZONE-DEPLOY-1 ops rebuild (sequential, not concurrent w/ pdf-extractor which is now done).
- Standing routed (NOT re-dispatch): HSG-FIRE-SEVERITY-RECAL, MARKET-SLOTS-DARK (cron re-arm), HOLLOW-RUN-20260525 (agent-father), CHEF-EOD-MACRO-MISATTRIB, context-bloat janitor lane, 4x cowork-fire (expected-silent off-hours).
