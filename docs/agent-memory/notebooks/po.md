# PO Notebook

**Cycle:** BT3-EXIT2 — BCTC-TABLE-3 SIGNED OFF / SPRINT CLOSED. User's `/goal` MET, user shown the corrected live table.
**Last update:** 2026-05-26T00:12Z
**Status:** Sprint BCTC-TABLE-3 CLOSED. NEXT = idle (next cron tick triages). Two follow-up sprints OPEN, both non-blocking.

---

## 2026-05-26T00:12Z — BT3-EXIT2 sign-off

**Verdict: DONE.** BT3-FIX5 (`81970243`, dev-pdf-extractor — 7th attempt, the one that held) fixed the live BCTC table scramble + the FIX4 false-green. Ops BT3-DEPLOY2 (image rebuilt + container recreated, 3 markers live, single-doc re-extract of e71f845d only). QA BT3-QA2 = APPROVED (`9f829289`, `reports/TASK_REPORT_BT3-QA2.md`, 11/11 ACs honest-green). Main terminal independently re-verified the LIVE endpoint + in-container DB count — matches QA. My BT3-EXIT2 bar (orphans ≤2, zero junk, 6 embedded codes split, sentinels exact, value_prior filled, no dups, balance_delta=0 — NEVER fixture/badge alone) satisfied.

**Final state** (e71f845d, FPT Q4 BS): 79 rows, 0 orphans, 0 dup, 0 NULL value_prior (except 418 accounting-valid). Sentinels 100/270/300/400/440 exact. 6 embedded codes (222/223/226/131/319/421b) recovered+split. balance_delta=0. Codes 134/317 OCR-garbled label but correct code+values (local-Tesseract blemish, NOT structural). Privacy PASS (self-hosted only).

**Root cause of 6 false-greens, eliminated:** test fixture used SPIKE PyMuPDF OCR while prod uses poppler — substrate mismatch in the test layer. Fix = architect Ruling D / AC-0 (fixture regenerated from live poppler) + Ruling A (POSITIVE-keep + positional-cutoff) + Ruling C (diacritic-insensitive `_norm`) + Ruling B (Layout-5 embedded-code scan).

**Wrote (working tree, NOTHING staged — commit-mutex uncallable):** SPRINT_GOAL.md (DONE header), TASKS.md (CLOSED + ladder DONE + NEW Sprint MCPZONE-HARDEN-1), TASK_BCTC-TABLE.md (§ dev/ops/qa records + § BT3-EXIT2 CLOSED), po-decisions/2026-05-26-bctc-table-bt3-exit2-done.md.

## Carry-over
- **Main terminal MUST commit the 4 docs** (SPRINT_GOAL.md + TASKS.md + TASK_BCTC-TABLE.md + the BT3-EXIT2 decision; notebook separately). All on `main`, explicit `git add`, no push, `git show --stat HEAD` zero foreign. Frozen surfaces (dashboard/*, sandbox/runner.py, pilot-status json) NOT touched.
- **NEW follow-up = Sprint MCPZONE-HARDEN-1** (dev-mcp-server, MEDIUM, non-blocking): MZH-1 = `pushBctcTableHandler.ts` return DB-verified row count not input echo; MZH-2 = test isolation (no test writes live market.db / "Test Row"). Dispatch only when mcp-server zone is idle (RUN-SOLO charter).
- **Sprint BCTC-TABLE-2** (multi-ticker/quarterly residuals B2-1..B2-4) stays OPEN, non-blocking.
- **DURABLE LESSON (binding):** positive-keep + positional-cutoff + diacritic-insensitive + embedded-code recovery beat the literal skip-list; AC-0 live-substrate fixture mandatory; balance_pass / any proxy FORBIDDEN as sole gate — acceptance is the LIVE endpoint row-by-row. 3rd false-green on this surface taught it.
