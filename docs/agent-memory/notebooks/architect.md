# Architect — Notebook

**Last updated:** 2026-05-26 20:00 UTC | **Sprint:** BCTC-LAYOUT-FIRST

[3 most recent cycles retained below. Archive in git history.]

## BCTC-LAYOUT-FIRST — LF-DESIGN (2026-05-26T19:30Z) — DESIGN COMPLETE

**Task:** LF-DESIGN. Recurring-bug guard mandated architect root-cause rethink. `generic_md_table_extractor.py` = 9 MD-EXTRACT fix commits; `text_table_extractor.py` = 7 BT fix commits. The per-page column-guessing engine has no cross-page context and scrambles continuation pages with no column header (FPT Q1 2026 page 5 = proven root cause). PO-approved BA spec in `docs/REQ_BCTC-LAYOUT-FIRST.md`.

**Brownfield findings:**

- Redesign target confirmed: `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` (Steps A–G, per-page only, no unit grouping). The `ExtractMdTablesUseCase` calls `_extractor.extract_md_tables()` in a page-by-page loop — zero document context.
- 0-byte-diff boundary confirmed: `text_table_extractor.py` and `ExtractTablesUseCase` are structurally separate. Different trigger (`/extract-table` vs `/extract-md-tables`), different ports, different DB tables. The 1954c write chain writes only to `bctc_table_rows` + `bctc_balance_checks`.
- Existing `bctc_md_tables` table (UNIQUE on `report_id`, `md_tables_json` flat array) is extended additively. Old endpoint `POST /api/push-bctc-md-tables` stays live — backward compatible.
- New push endpoint: `POST /api/push-bctc-layout` → new handler `pushBctcLayoutHandler.ts` → writes to NEW tables `bctc_layout_units` + `bctc_page_zones`.
- `bctcInspectHandler.ts` extended with `GET /api/bctc-inspect/zones/{doc_id}?page=N` + ON/OFF toggle HTML control. Balance badge + `bctc_table_rows` read path UNCHANGED.

**3 architect-open questions resolved:**

1. **Schema:** `bctc_layout_units` (per-unit, quarantine flag) + `bctc_page_zones` (per-page, zones_json). Zero overlap with structured path. DDL in brief §3.1.
2. **JSON contract:** Full contract in brief §3.2. Coordinate system: top-left origin, px, 200 DPI. Column IDs positional (`col_0`/`col_1`). Continuation pages inherit schema-page's identical gutters. `unit_hints` metadata-only, never in branching logic.
3. **Quarantine storage:** `quarantined=1` in `bctc_layout_units`. QA counts via `SELECT quarantined, COUNT(*) FROM bctc_layout_units GROUP BY quarantined` — direct bun:sqlite, no endpoint.

**Design decisions:**

- Tier 0: 50-DPI PIL pixel ops + stored `pdf_extracted_text`. No Tesseract in Tier 0. Rasters ~5MB peak for 46-page doc.
- Tier 1: schema inheritance = skip column detection on continuation pages; use `unit_schema.gutter_x_positions` directly. This is the named fix for the FPT Q1 p5 scramble.
- Tier 2: one `image_to_data` call per page (200 DPI); cell text derived by bbox intersection filtering — not per-cell Tesseract.
- Tier 3: three invariants — balance identity (generic code-range heuristic, not sentinel hardcoding), codes monotonic, no orphan rows. Failing units quarantined, not pipeline-blocked.
- Parallelism: LF-EXTRACT + LF-OVERLAY dispatched in parallel (contract fully specified). LF-DEPLOY gated on both.

**Key risk flags:**

- Tier 0 fails on low-contrast/rotated pages → fallback: mark as `prose` (conservative), log WARNING.
- Continuation-page column-count mismatch → flag `schema_mismatch=true`, attempt inherited schema, let Tier 3 decide.
- Balance identity heuristic false-positive on non-balance-sheet units (notes with 3-digit reference codes) → gated on `max_code >= 400`.
- Overlay coordinate scaling: JS renderer MUST scale `zones_json` px coordinates by `display_width / image_width_px`.

**Files authored this cycle:**

1. `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md` — NEW (full blueprint: §1 brownfield, §2 tier contracts, §3 open Qs resolved, §4 per-task ACs, §5 constraints, §6 risks, §7 frozen surfaces, §8 parallelism)
2. `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md` — `[Architect] LF-DESIGN` entry appended
3. `docs/TASKS.md` — LF-DESIGN → DONE; LF-EXTRACT + LF-OVERLAY → READY
4. `docs/agent-memory/notebooks/architect.md` — this entry (full overwrite)

**Next actor:** PM dispatches dev-pdf-extractor (LF-EXTRACT) + dev-mcp-server (LF-OVERLAY) in parallel. LF-DEPLOY gated on both. QA verifies corpus pass-rate via direct bun:sqlite query per brief §3.3. Done-bar: Tier-3 corpus pass + overlay live + user verbal G9.

---

## MD-EXTRACT-9 — Label-Row Ordinal Reconstruction (2026-05-26T17:45Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-9. Recurring-bug escalation (many fix commits on `generic_md_table_extractor.py`). LIVE-VERIFY-8 showed income value columns FIXED (MD-EXTRACT-8) but label-row STILL BROKEN: label-row over-merge (`2 1 Doanh Các khoản thu giảm bán hàng trừ…`) + ordinal offset (code-02 values under code-01 label). Mandate: diagnostic-gate-first, live OCR token dump, root-cause classify, design. NOT a patch.

**Diagnostic completed (live, local Tesseract, single page 7 of FPT Q4 2025, no batch):**
- h_med=18px, label_pitch=36px (median), value_pitch=36px (uniform, col@1182 21 tokens)
- LABEL_BAND_FACTOR×h_med = 27px. 2×band=54px > label_pitch=36px → OVER-MERGE confirmed
- Ordinal grid rows: 24. Physical label lines: 24. COUNT MATCHES — zero count mismatch
- Band over-reach is the SOLE root cause. live simulation: rank=0 band=[474,528] captures 15 tokens from 2 consecutive label lines → exact LIVE-VERIFY-8 defect reproduced mechanically
- Fix-path-D dropped in 7-REV on wrong comparator (`band < pitch` checked; correct gate is `2×band > pitch`)

**Fix designed:**
- ADD Step C10.5: `_cluster_text_into_label_lines(text_tokens, gap=15px)` — sort by (top,left), greedy line grouping by gap threshold. Separates line-1 (top 488-496) from line-2 (top 522-524) on 26px gap >> 15px threshold.
- ADD Step C10.6: `_exclude_pre_data_label_lines` — exclude lines with y_med < first_value_top - 20px. Removes column-header fragments.
- MODIFY `_attach_labels_ordinal` — replace band body with ordinal-rank pairing (data_label_lines[k] ↔ grid[k], direct index). Signature UNCHANGED (backward compat with 12+ TestOrdinalReconstruction tests).
- MODIFY `_process_page` — insert C10.5+C10.6 between C10 and C11.

**Non-regression:** AC-8-SEG / AC-8-BALANCE / AC-8-VALUE-COLUMNS all structurally guaranteed (value ordinal reconstruction Steps C6-C10 untouched; segment has no pure-code cols so ordinal labeling path is identical; balance pitch >> gap threshold).

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — §MD-EXTRACT-9 appended (~220 lines: §9.1 diagnostic, §9.2 root cause, §9.3 post-mortem, §9.4 design, §9.5 functions, §9.6 non-regression, §9.7 ACs, §9.8 fixture proof, §9.9 risks, §9.10 files, §9.11 constraints)
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — §[Architect] MD-EXTRACT-9 appended
3. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** main terminal → re-trace §9.8 fixture proof → dispatch dev-pdf-extractor MD-EXTRACT-9 → ops MD-DEPLOY-9 (single doc, full UUID `e71f845d`) → main-terminal live-verify → qa MD-QA-9 → po MD-EXIT.

---

## MD-EXTRACT-8 — Root-Cause Rethink: Anchor Gap Oracle (2026-05-26T16:12Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-8. Recurring-bug escalation (≥2 fix commits on `generic_md_table_extractor.py`). LIVE-VERIFY-7 failed on income statement (AC-7-REV-INC HARD FAIL) despite 122/439 unit tests green. Mandate: diagnostic-gate-first on actual live OCR token stream, classify root cause, design fix. NOT a patch.

**Diagnostic completed (live, local Tesseract, single-page, no batch):**
- Page 8 of FPT Q4 2025 PDF at 200 DPI: 2339×1654px, 404 words, 87 value tokens
- 4 real value columns at x-left: Val-A=1182, Val-B=1477, Val-C=1768, Val-D=2061. Per-row pitch: 35–37px (clean, recoverable).
- `w_med = 167px` (inflated by 18–20 char annual cumulative values like `20.258.866.135.395`)
- `col_gap = 1.5 × 167 = 250.5px` — swallows Val-A gap of 225px from code anchor 957. All 4 value columns absorbed under wrong anchors.
- FINAL ANCHORS PRODUCED: [255, 957, 1330, 1642, 1916] — all 4 real value columns lost.

**Root-cause classification: DOWNSTREAM-RECOVERABLE.** OCR reading order is clean. Upstream psm/preprocessing is NOT the cause. Dense multi-period income tables do NOT need a different reconstruction path. Same ordinal path; corrected anchor gap oracle.

**FIXTURE_TOKENS_REV divergence:** Fixture tokens had short widths → `w_med ≈ 60px` → `col_gap ≈ 90px` → correct anchors. Live tokens are 2.8× wider → col_gap collapses anchors. Fixture was not a valid proxy for live income data. This explains false-greens across MD-EXTRACT-5/6/7/7-REV.

**Fix designed (minimal, 1 constant + 1 function change):**
- New constant `_MIN_INTER_COLUMN_GAP_PX = 80` (1cm whitespace at 200 DPI, AC-0 compliant)
- Two-pass `_detect_column_anchors_from_tokens`: Pass 1 uses CODE token widths for fine bin_width (~6.9px); Pass 2 merges with fixed 80px threshold instead of `1.5 × w_med`
- Zero changes to REV-3/REV-4 additions or downstream grid functions

**Risk flags:** R-HIGH: parenthetical negatives `(73.049.924.176)` match `_NUMBER_TOKEN_RE` but not `_VALUE_TOKEN_RE`; dev must verify on live tokens that pure-code detector does not misclassify value columns. R-MED: Pass-1 fallback when no code tokens present. R-MED: constant assumes 200 DPI (document in docstring).

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — §MD-EXTRACT-8 appended
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — §[Architect] MD-EXTRACT-8 appended
3. `docs/agent-memory/notebooks/architect.md` — this entry

---
