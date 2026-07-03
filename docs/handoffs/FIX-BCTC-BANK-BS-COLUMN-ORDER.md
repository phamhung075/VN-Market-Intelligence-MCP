---
sprint: FIX-BCTC-BANK-BS-COLUMN-ORDER
branch: task/FIX-BCTC-BANK-BS-COLUMN-ORDER-composite
size: L
zone: apps/mcp-server/
depends_on: []
blocks:
  - TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST
  - W5-FU-CTG-REFINE-96e36139
---

## TLDR

Three stacking bugs in the BCTC pipeline collapse all bank-form balance-sheet rows pre-database: a positional column-order assumption in the parser destroys rows with blank `code` fields (all section headers + grand totals), section-detection vocabulary gap causes wrong statement_section tags, and markdown emphasis in section codes defeats classification. Real markdown from CTG (2026-Q1 consolidated, report_id `96e36139-5dac-414d-8e4d-20a4725890d1`) is transcribed correctly; the parser and classifiers destroy rows before materialization.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **File Groups:**
  - **Parser:** `src/application/utils/refinedMarkdownParser.ts` lines 386-426 (4/5-cell branch, positional assumption)
  - **Section Detection:** `src/application/utils/refinedMarkdownParser.ts` lines 54-127 (SECTION_HEADERS + FOLDED_SECTION_KEYWORDS, vocabulary gaps)
  - **Test Fixture:** NEW `.test.ts` file incorporating real-markdown capture from `get_bctc_refined(96e36139-5dac-414d-8e4d-20a4725890d1)` units 0002/0003/0038
  - **Doc Correction:** `src/application/services/bctcRowRepair.ts` lines 10-16, 30-32 (update header comment)

- **Acceptance Criteria:**
  - [ ] **FIX-A**: `refinedMarkdownParser.ts` 4/5-cell branch reads the header row to determine column order dynamically (code-first vs label-first), does NOT assume positional order. All declared columns are carried through (not truncated at 4 cells).
  - [ ] **FIX-D**: `detectSection` vocabulary includes `BAO CAO TINH HINH TAI CHINH` (bank form canonical BS title) → `balance_sheet`. ToC false-positive suppressed: require matches to be in title-style lines (starting with `#`/`##`) NOT in bullet lines (`-`/`*`).
  - [ ] **FIX-C (MANDATORY)**: Regression fixture built from **verbatim `bctc_refined_units.markdown` captured live** via `get_bctc_refined(96e36139…)` for units 0002 (pages 4-5, assets side), 0003 (page 6, liabilities+equity side), 0038 (page 45, equity-movement 5-column table). Assert:
    - `total_assets = 2,924,176,928` (matches dev's synthetic fixture assertion)
    - `total_liabilities = 2,735,484,770`
    - `equity_total = 188,692,158`
    - `balance_violation = null`
    - Row-count parity: raw markdown pipe-rows match parsed output (no silent drops)
  - [ ] **FIX-E (doc only)**: `bctcRowRepair.ts` header comment corrected to reflect real-data finding: rows DO exist pre-parse, parser destroys them, NOT transcription failure.
  - [ ] PR ships all 4 fixes (FIX-A + FIX-D + FIX-E + FIX-C regression test) together. Do NOT merge FIX-A/FIX-D without FIX-C as regression gate.
  - [ ] Existing 3 RC fixes (commit 2c7fb5b0: RC-1 identity-serve-guard, RC-2 row-repair, RC-3 carry-forward) are NOT reverted — they fix distinct issues and are real non-regressions.

- **Files to read first:**
  - `docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md` — full evidence + fix design rationale
  - `docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md` — prior context on failed W1-W4 cycles
  - `src/application/utils/refinedMarkdownParser.ts` lines 386-426 (4-cell branch), 54-127 (detectSection)
  - `src/application/services/bctcRowRepair.ts` lines 10-16, 30-32 (header comment to update)

- **Files to modify:**
  - `src/application/utils/refinedMarkdownParser.ts` (lines 386-426 parser logic + lines 54-127 vocabulary)
  - `src/application/services/bctcRowRepair.ts` (header comment, doc-only)
  - `.test.ts` file (new fixture with real-markdown)

- **Dependencies:**
  - None — ships as self-contained composite unit

- **Knowledge needed:**
  - `docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md` — read first, full root-cause evidence and fix design split by layer
  - `docs/policies/dev-standards.md`
  - Real-data mandate: fixture MUST be verbatim from `get_bctc_refined` live call, NOT synthetic/hand-written (prior cycles failed because fixtures diverged from real doc)

- **Unblocks:**
  - `TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST` — W5 operational re-run can only succeed post-deploy of this composite fix
  - `W5-FU-CTG-REFINE-96e36139` — refine execution was correct (56/56 units); finalize classifier now has zero bank-form rows to emit due to parser/classifier bugs; fix unfreezes balance_sheet rows
