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

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `src/application/utils/refinedMarkdownParser.ts` — FIX-A: `resolveColumnLayout()` (code-first/label-first/label-only via captured header cell text, "stt" added to code-keyword after catching a regression on income-statement STT tables); 4+-column branch now dispatches on layout instead of hardcoded position. FIX-C: `BÁO CÁO TÌNH HÌNH TÀI CHÍNH` (+ folded sibling) added to section vocab; `detectSection` skips bullet-prefixed (`-`/`*`) lines entirely (closes the task-board note's ToC-false-positive item — the pre-existing exact-phrase pattern was already false-matching a ToC bullet directly). `parseVnNumber`: strips markdown emphasis markers, then auto-detects comma-vs-dot thousands/decimal format (necessary corollary — CTG's real values are English comma-thousands + bold-wrapped grand totals; undiscovered by the architect SPIKE, found via hands-on live-data verification).
  - `src/domain/services/financial-reports/bctcFormType.ts` — FIX-D: `isBankFormFromRows` strips `*`/`_` from `code` before testing `ROMAN_SECTION`/`CORP_BALANCE`.
  - `src/application/utils/bctcRowRepair.ts` — doc-only: corrected the now-disproven "row absent from source markdown" header comment claim (SPIKE brief §2).
- **Tests written:** `src/__tests__/FIX-BCTC-BANK-BS-COLUMN-ORDER.test.ts` — 16 tests, 54 expect. All markdown fixtures are byte-identical to live `bctc_refined_units.markdown` (report_id 96e36139-5dac-414d-8e4d-20a4725890d1), fetched via `get_bctc_refined` over HTTP JSON-RPC to the running mcp-server container — NOT synthetic. Covers unit-0002 (assets), unit-0003 (liabilities+equity, carried section), unit-0038 (equity roll-forward, label-only 5-col), unit-0005/0006 (income statement, real bold Roman codes for the classifier proof), unit-0000/0001 (title/ToC, non-regression), plus a full end-to-end `finalize_bctc_refine` integration test over all 6 core units. GREEN.
- **Git commits:** (pending — see RETURN)
- **Type check:** clean (`bun tsc --noEmit`)
- **bun test:** targeted BCTC-suite (22 files) 261/261 pass. Full suite (2 runs): 14062-14072 pass / 42 skip / 57-63 fail / 2-4 errors, 1164 files — zero fails touch bctc/refinedMarkdown/bankForm/parseVnNumber (grepped every `(fail)` line in both full logs); same pre-existing Bun-1.3.13 C++ teardown panic (exit 132) both runs, well under documented ceiling (348).
- **Tool count:** 183 — matches pre-task baseline (`gen-project-stats.ts --dry-run`), no MCP tool added/removed.
- **Scheduler count:** unchanged — no scheduler files touched by this diff.
- **Server boot:** verified (`PORT=3099 bun run src/index.ts`, `/health` 200 OK, killed after check).
- **Docs updated:** NONE (no `docs/architecture/microservice/mcp-server/*.md` referenced the stale column-order/number-format assumptions — grepped, zero hits).
- **Deviations from this handoff's AC (documented):** ToC false-positive suppressed via bullet-line exclusion (any line starting with `-`/`*` skips section detection) rather than the AC's suggested "require match inside a `#`/`##` title line" — the stricter title-only approach would have broken multiple EXISTING passing fixtures (e.g. `FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.test.ts`, `TASK-W3-...-SECTION-GUARD.test.ts`) whose real/synthetic section-header lines are bare text with no `#` prefix. Bullet-exclusion achieves the same behavioral outcome (verified: unit-0001's ToC no longer mutates `currentSection`) without that regression risk.
- **NOT executed (deploy-gated):** a post-deploy `finalize_bctc_refine` re-run against the live CTG report_id 96e36139 in the named-volume `market.db` — this fix only ships the code; the router/ops must trigger the container rebuild + re-run before the live report's `total_assets` actually unfreezes.
