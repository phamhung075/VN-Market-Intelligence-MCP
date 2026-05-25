# PO Decision — REOPEN BCTC-TABLE as BCTC-TABLE-3: row table is garbage (false-green correction)

**Date:** 2026-05-25T21:10Z
**Author:** PO (self-initiated reopen)
**Supersedes:** `docs/po-decisions/2026-05-25-bctc-table-bt-exit-final-fpt-done.md` (BT-EXIT FINAL=DONE — REVOKED)
**User `/goal`:** *"http://localhost:3000/api/bctc-inspect need present correct data table for recheck."*

## Decision

**REOPEN.** My BT-EXIT FINAL sign-off (2026-05-25T20:51Z, "DONE, sprint CLOSED") was a FALSE-GREEN. I am revoking it and reopening the work as **BCTC-TABLE-3**, driven architect → dev-pdf-extractor → ops → qa → PO.

## What I got wrong (own-error admission)

At BT-EXIT I verified three things on the live FPT Q4 doc: row COUNT (150, down from 2170 noise), the balance BADGE (delta=0, anchors 270/300/400/440 exact), and the PERIOD (31/12/2025, signature-leak fixed). All three were genuinely correct. I declared the user's goal met.

I never inspected row COMPOSITION. My own carry-over LESSON from that very cycle said: *"a clean result table = coded rows ≈ total rows + sane reporting period + exact identity ... has_table+delta=0 alone was NOT enough."* I wrote that lesson and then violated it. This is the BT-7 false-green pattern repeating [[feedback_fence_false_green]] [[project_bctc_table_sprint]].

## Live evidence this cycle (PO re-curl — anti-hallucination, not from memory)

`GET http://localhost:3000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` (FPT Q4 2025), 150 stored rows:

| Metric | Live | Should be |
|---|---|---|
| well-formed rows (code+label+value) | 11 | ~80 |
| junk rows (code=null AND value=null) | 94 | 0 |
| orphan rows (value but blank label) | 44 | 0 |
| value_prior NULL | 118 / 150 | ~0 on coded rows |
| code "100" present | NO | YES |
| duplicate codes | 222 ×2 | none |
| balance_check | delta=0, anchors exact (PASS) | unchanged — keep |

row_order 0 = `{code:null, label:"CÔNG TY CỔ PHẦN FPT", value:null}` — the company name as table row 1. The badge is real; the table beside it is garbage = the user's "pack of column is no sense."

## Root cause (PO-diagnosed; handed to architect)

Dual-path drift round 2. The stored OCR text is ALREADY one-line-per-row — proof `spike/eval/results/FPT_page4_balance_sheet.md` line: `A. TÀI SẢN NGAN HAN 100 58.102.970.741.619 45.535.942.846.453`. The spike's `fpt_balance_sheet_eval.py::lines_to_rows()` (L187-211) parsed exactly this — for each line, join code+label+two values into one row — and produced the perfect ~80-row gold (`spike/eval/results/FPT_balance_sheet_4-7.md`).

Production `apps/pdf-extractor/infrastructure/text_table_extractor.py` diverged: it added `_detect_block_column_layout()` (L359) → `_extract_block_columns()` (L386), a positional-zip state machine that hardcodes `label=""` (L511 → 44 orphans), misaligns code↔value across separate blocks (drops 100, dups 222, nulls value_prior), and the inline else-branch (L606-619) dumps every non-code line as a `code=null` row (94 junk). The block-column model does not match the real (line-aligned) OCR.

## Fix direction (architect rules specifics at BT3-DESIGN)

Align the production row-assembler to the spike's one-line-per-row line-join. **PREFERRED: re-parse the EXISTING stored OCR text** — host-safe, zero re-OCR (critical: host kernel-panics under concurrent heavy OCR [[project_host_memory_panic]]). The architect must rule whether coordinate/zone OCR (user's "ocr zone table on page first then extract line table line by line") is actually needed, or whether re-parsing stored text already recovers the join. Spike evidence strongly says re-parsing suffices. Zone-OCR only if line-parsing genuinely cannot recover label↔code↔value, and then self-hosted Tesseract only, sequential.

## Acceptance criteria (QA verifies LIVE via curl, NOT mocked)

1. ZERO value-rows with empty/blank label. 2. ZERO junk text rows. 3. code 100 present, no dup codes, codes match gold. 4. value_prior filled where value_current is. 5. each row aligned {code,label,value_current,value_prior} vs gold. 6. balance still passes (delta=0, anchors exact). 7. re-verified vs spike gold, NO subclass/preloaded-text bypass — drive the real adapter on the real stored OCR.

## Constraints

- PRIVACY: self-hosted Tesseract only; no PDFs/images to any external API; external VLM deferred unless user consents.
- FROZEN: `dashboard/{index.html,traces.js,trust-contract.spec.js}`, `sandbox/runner.py`, `pilot-status-pdf-extractor.json` — do not touch.
- Git: all on `main`, explicit-file staging, no push, no force.
- HARNESS: PO + dev/qa cannot call MCP `task_claim`/`commit-mutex`; file work only, unstaged; main terminal commits the listed paths.

## Commit (main terminal)

```
git add docs/handoffs/TASK_BCTC-TABLE.md docs/SPRINT_GOAL.md docs/TASKS.md docs/po-decisions/2026-05-25-bctc-table-3-reopen-row-table-false-green.md
git commit -m "docs(bctc-table-3): REOPEN — BT-EXIT FINAL was false-green; row table garbage (94 junk + 44 orphan rows, code 100 missing, 222 dup); root cause = block-column drift from spike line-parser; architect→dev→ops→qa→po ladder"
```

(po notebook committed separately per notebook-commit convention.)
