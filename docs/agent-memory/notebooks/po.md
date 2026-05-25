# PO Notebook

**Cycle:** BCTC-TABLE-3 REOPEN — revoked my own BT-EXIT FINAL=DONE (false-green). Row table is garbage. Architect ladder authored.
**Last update:** 2026-05-25T21:10Z
**Status:** Sprint BCTC-TABLE REOPENED as BCTC-TABLE-3. NEXT = architect (BT3-DESIGN), then dev-pdf-extractor → ops → qa → me (BT3-EXIT). Strictly serial.

---

## 2026-05-25T21:10Z — BCTC-TABLE-3 (false-green correction, self-initiated reopen)

**Trigger:** main terminal /goal — live curl proved `/api/bctc-inspect/table/{FPT Q4 e71f845d}` row table is broken. I re-verified myself (anti-hallucination): of 150 rows only **11 well-formed**, **94 junk** (code=null+value=null, company name/address/headers as rows), **44 orphan** (value but blank label), code **100 MISSING**, **222 DUP**, value_prior null **118/150**. Balance badge (delta=0, anchors exact) REAL; row table garbage.

**OWN ERROR:** my 20:51Z BT-EXIT checked row COUNT + badge + period, NEVER row COMPOSITION — exactly the false-green my own carry-over LESSON warned against last cycle. Revoked the sign-off, reopened.

**ROOT CAUSE (diagnosed, confirmed by reading both parsers):** dual-path drift round 2. Stored OCR is already one-line-per-row (`A. TÀI SẢN NGAN HAN 100 58.102... 45.535...`); spike `fpt_balance_sheet_eval.py::lines_to_rows()` built ~80 perfect joined rows from it (gold `spike/eval/results/FPT_balance_sheet_4-7.md`). Prod `infrastructure/text_table_extractor.py` added `_detect_block_column_layout`→`_extract_block_columns` positional-zip that hardcodes `label=""` (L511=orphans), misaligns code↔value (drops 100/dups 222/nulls prior), dumps non-code lines as junk (L606-619).

**FIX DIRECTION (architect rules at BT3-DESIGN):** re-parse EXISTING stored OCR with spike line-join — PREFERRED, host-safe zero re-OCR [[project_host_memory_panic]]. Zone-OCR only if line-parse can't recover the join (self-hosted Tesseract only). Row CONTRACT unchanged — bug is the producer, not the schema.

**Wrote (working tree, NOTHING staged — MCP task_claim/commit-mutex UNCALLABLE in this harness, NO Task tool to spawn the chain; fail-closed):** TASK_BCTC-TABLE.md § SPRINT BCTC-TABLE-3 (full spec + AC-1..AC-7 + ladder); SPRINT_GOAL.md (REOPENED header, old CLOSED collapsed); TASKS.md (status→REOPENED + BCTC-TABLE-3 ladder); po-decisions/2026-05-25-bctc-table-3-reopen-row-table-false-green.md.

## Carry-over
- **Main terminal MUST (a) commit 4 files:** TASK_BCTC-TABLE.md + SPRINT_GOAL.md + TASKS.md + po-decisions/2026-05-25-bctc-table-3-reopen-row-table-false-green.md (commit msg in the decision doc); then notebook separately. **(b) DISPATCH the chain** (I have no Task tool): `architect run .claude/flows/architect/main.md` (BT3-DESIGN ruling) → `dev-pdf-extractor` (BT3-FIX) → `ops` (BT3-DEPLOY redeploy + host-safe re-backfill) → `qa` (BT3-QA live curl) → back to `po` (BT3-EXIT).
- **BT3-EXIT bar (binding on future-me):** verify ROW COMPOSITION live, not the badge — AC: 0 junk, 0 orphan, code 100 present, no dup codes, value_prior filled, each row {code,label,curr,prior} vs spike gold, NO mock/subclass bypass. Badge-only = false-green, AGAIN.
- BCTC-TABLE-2 (residual multi-ticker/quarterly coverage) stays OPEN, non-blocking, below TABLE-3.
- LESSON (3rd time now): coded-rows-≈-total + sane period + exact identity + JOINED columns. Count + badge is NOT a clean table. I keep under-verifying the row body; BT3-EXIT must curl + jq the composition.
