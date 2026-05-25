# PO Notebook

**Cycle:** BT3-FIX4 REVOKED (false-green #6) → recurring-bug escalation to architect (BT3-RETHINK). Ladder + constraints authored.
**Last update:** 2026-05-25T23:29Z
**Status:** Sprint BCTC-TABLE-3 escalated to BT3-RETHINK. NEXT = architect (DESIGN-ONLY filter-strategy ruling), then dev-pdf-extractor → ops → qa → me (BT3-EXIT2). Strictly serial.

---

## 2026-05-25T23:29Z — BT3-FIX4 false-green correction + escalation

**Trigger:** main terminal /goal — BT3-FIX4 false-greened on LIVE again. I re-verified the live endpoint myself (anti-hallucination): `GET /api/bctc-inspect/table/e71f845d-...` = **95 rows, 23 orphans**, value_prior null on those 23, codes 222/223/226/131/319/421b absent-or-orphan, header/date/signature junk rows survive. balance_pass=true + 4 sentinels (270/100/300/400) exact — REAL but NOT the gate (6th false-green).

**Why false-green:** dev's BT3-FIX4-PARSE "DONE" measured "0 orphans / 79 rows" against the SPIKE PyMuPDF OCR fixture; LIVE uses poppler OCR (diacritics differ: "thang" not "tháng"; "BANG CÂN ĐỐI" accented vs unaccented skip literal; arbitrary signature garble). The architect's own FIX4 ruling was authored against that same fixture → it false-greened too.

**Decision (recurring-bug-escalation, binding):** `text_table_extractor.py` = 5 `fix(` in 30d (210a0a62/1ab1f7a6/3e47ccf3/8dbb19e3/c66a7ff7) AND architect's own ruling false-greened → BLOCK, no more blind dev patches. Escalated to **architect (BT3-RETHINK, DESIGN ONLY)**: rule on FILTER STRATEGY (negative-skip vs POSITIVE-keep vs POSITIONAL-cutoff) + embedded-code split. dev MUST regenerate fixture from LIVE poppler OCR (hard AC). Acceptance = LIVE endpoint row-by-row; balance_pass alone FORBIDDEN as gate.

**Wrote (working tree, NOTHING staged — commit-mutex uncallable, no Task tool to spawn chain):** SPRINT_GOAL.md (BT3-RETHINK header), TASKS.md (status + BT3-RETHINK ladder + constraints), TASK_BCTC-TABLE.md (§ [PO] BT3-FIX4 REVOKED → BT3-RETHINK), po-decisions/2026-05-26-bctc-table-bt3-fix4-false-green-rethink.md.

## Carry-over
- **Main terminal MUST (a) commit 5 files** (SPRINT_GOAL.md + TASKS.md + TASK_BCTC-TABLE.md + the po-decision doc; notebook separately); **(b) DISPATCH the chain** (I have no Task tool): `architect run .claude/flows/architect/main.md` (BT3-RETHINK filter-strategy ruling, DESIGN ONLY) → `dev-pdf-extractor` (BT3-FIX5 + regenerate fixture from live poppler OCR) → `ops` (BT3-DEPLOY2 rebuild + re-extract ONLY e71f845d, NEVER batch) → `qa` (BT3-QA2 live row-by-row) → `po` (BT3-EXIT2). **(c)** main terminal independently re-verifies the live endpoint row-by-row before reporting to user.
- **BT3-EXIT2 bar (binding on future-me):** curl LIVE endpoint + inspect ROW COMPOSITION — orphans ≤2, ZERO header/date/signature junk, 222/223/226/131/319/421b present+code-split, 4 sentinels exact, value_prior filled, no dup codes, balance_delta=0. NEVER the fixture, NEVER balance_pass alone. 3rd false-green on this surface — proxy-trust is the recurring trap.
- **DEFERRED (after goal, separate dev-mcp-server task):** (a) pushBctcTableHandler.ts rows_stored=input echo not DB count; (b) test wrote to live market.db + seeded "Test Row".
- BCTC-TABLE-2 (multi-ticker/quarterly residuals) stays OPEN, non-blocking, below TABLE-3.
