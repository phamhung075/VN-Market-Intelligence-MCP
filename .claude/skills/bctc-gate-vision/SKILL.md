---
name: bctc-gate-vision
description: >
  Consumer-side gate-first / vision-on-failure-only protocol for BCTC code-keyed row lookups.
  Enforces the extractor's needs_vision_verify / vision_verify_markers contract before
  any Mã-số-keyed read of bctc_table_rows. Vision escalation is ESCALATION-ONLY — never
  blanket. SSOT for this contract: docs/agents/dev-pdf-extractor/flow/main.md §GATE-VISION.
version: "2026-06-09"
---

# BCTC Gate-First / Vision-on-Failure-Only — Consumer Protocol

## Why this guard exists

Tesseract OCR drifts Mã-số codes (proven: FPT Q1-2026 — 135→185, 136→186, 16→46, 61→62;
root cause: 3↔8 and 1↔4 confusion). A code-keyed lookup on a drifted row silently returns
wrong or missing financials. The extractor now runs two deterministic free gates on every
extraction and signals the result via `needs_vision_verify` + `vision_verify_markers`.

Producer-side SSOT: `docs/agents/dev-pdf-extractor/flow/main.md` §GATE-VISION
Code whitelist SSOT: `apps/pdf-extractor/domain/primitives/bctc_code_whitelist/primitive.py`

---

## Gate check (insert BEFORE any code-keyed bctc_table_rows lookup)

```
[GATE-VISION CHECK]
1. Read extraction unit's needs_vision_verify (bool) + vision_verify_markers (list).

2. If needs_vision_verify == false (or field absent on older units):
   → Both Gate A (checksum) and Gate B (code whitelist) passed.
   → Trust all code-keyed row reads at zero extra cost. Proceed normally.

3. If needs_vision_verify == true:
   a. Build flagged_codes_set = union of all vision_verify_markers[*].flagged_codes.
   b. For EACH Mã-số code that this pass intends to look up:
      - If code IS in flagged_codes_set:
          → DO NOT trust the code-keyed value silently.
          → ANCHOR BY LABEL+POSITION: locate the row by row_label + row_order instead.
            If label-anchor gives a unique match → use that value (log substitution).
          → If label-anchor is ambiguous or absent → ESCALATE to vision:
              * Take page_numbers from the matching vision_verify_markers entry.
              * Render ONLY that page: `pdftoppm -r 150 -png <pdf> page_NNN` → PNG.
              * Read the PNG; extract correct Mã-số and value for flagged rows.
              * Use the vision-corrected value; log: "[GATE-VISION] code <X> corrected via vision page <N>".
      - If code is NOT in flagged_codes_set:
          → Use code-keyed value normally (gate passed for this code).

4. Never blanket-verify all pages with vision. Vision cost = ≤1 page per failure.

5. If vision escalation fails (tool error after 1 retry):
   → Mark affected finding low_confidence; cite "[GATE-VISION UNRESOLVED]" in evidence.
   → Do NOT drop the finding silently.
```

---

## Applying to refine_bctc_md disagreement-verify path

The extractor may pre-flag a page BEFORE the disagreement-verify sub-flow detects a
text/image discrepancy. Surface the marker so vision renders the right page:

```
[GATE-VISION — refine path]
1. When entering a verify window: check if the unit carries needs_vision_verify == true.
2. If yes, and the window's page_number appears in vision_verify_markers[*].page_numbers:
   → The extractor already identified this page as suspect.
   → Use the marker's page_numbers directly for get_bctc_page_image() — skip re-scan.
   → Log: "[GATE-VISION] extractor pre-flagged page <N>; using marker page for vision."
3. If the window's page is NOT in any marker → proceed with disagreement-verify Steps 1-4 unchanged.
```

---

## Notes

- Do NOT inline or copy the code whitelist into any flow — always point to the SSOT above.
- This skill is lazy-loaded (trigger: a flow step does code-keyed bctc_table_rows lookup).
- Tree-DAG: this skill → dev-pdf-extractor/flow/main.md (producer SSOT only; no cycle).
