# Architect — Notebook

**Last updated:** 2026-05-26 12:30 UTC | **Sprint:** BCTC-MD-TABLE / MD-EXTRACT-6 AUGMENTATION

[3 most recent cycles retained below. Archive in git history.]

## MD-EXTRACT-6 AUGMENTATION — Mid/Leading Empty-Cell Reconciliation (2026-05-26T12:30Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-6 targeted augmentation (same design task, NOT a new attempt number). Main-terminal verified §8 drift>gap proof is SOUND. Gap identified: pure ordinal rank-alignment silently corrupts on mid-column and leading-column empty cells — a missing cell at row-k shifts all cells below it up one rank in that column.

**Failing scenario (concrete):** 3 columns × 3 physical rows, col-1 missing row-1. Pure ordinal: col-1 sorted tokens [(top=103,"B1"),(top=143,"B3")] → rank-0="B1", rank-1="B3". grid[1][1]="B3" (WRONG — should be " "); grid[2][1]=" " (WRONG — should be "B3"). The rank-shift corrupts silently: AC-6-SEG checks only the revenue row (rank-0, always present in all columns), and AC-6-INC checks row COUNT + codes-per-row — neither detects value misalignment in rows below rank-0. False-green risk was live.

**Why this is endemic to BCTC tables:** Segment report has 7 columns with elimination/inter-segment columns absent for specific line items. Income statement has prior-period columns blank for certain rows. Both tables will hit mid-column empties below revenue.

**Step C8.5 — `_insert_skip_slots` algorithm:** After Step C8 sort, per column: compute local_pitch = median(consecutive top-deltas). Walk consecutive tokens; if delta > SKIP_GAP_FACTOR × local_pitch, insert ceil(delta/local_pitch)-1 None sentinel slots before the next token. Degenerate case (2-token column, only 1 delta): use ref_pitch = median(local_pitch_c for columns with ≥3 tokens) instead of local_pitch. `SKIP_GAP_FACTOR = 1.5` (generic geometry, AC-0 compliant).

**Key geometric justification for safety:** Intra-column drift over ~150px column width ≈ 2px (vs ~16-28px cross-column drift over ~1800px). Within-column top-deltas reliably reflect physical row separations — a delta of ~20px = one row, ~40px = one skipped row. SKIP_GAP_FACTOR=1.5 threshold = 30px >> 2px noise ceiling. This is the same within-column reliability invariant that makes the ordinal approach work. C8.5 extends it to gap-magnitude detection, which is safe for the same geometric reason.

**Leading-column skip decision: KNOWN LIMITATION.** Cannot be detected by within-column gap analysis (no preceding token). Cross-column-y detection would reintroduce the diagonal. Documented in §13.4 risk register with rationale: BCTC first data rows (revenue/total assets/etc.) are always present in all columns — leading skip is structurally rare in this document class.

**AC-6-SKIP fixture (AC-6-SKIP, hand-traceable):**
Sub-fixture SKIP-MID: col-1 missing physical row-1 (middle). Tokens: col-0=[top=100/"A1",top=120/"A2",top=140/"A3"], col-1=[top=103/"B1",top=143/"B3"] (2-token column), col-2=[top=106/"C1",top=126/"C2",top=146/"C3"]. ref_pitch from col-0+col-2 = median([20,20]) = 20. threshold=30. col-1 delta=40 > 30 → 1 None slot inserted → col-1 slots = ["B1", None, "B3"]. total_rows=3. grid[1][1]=" ". grid[2][1]="B3". Asserts: (a) grid[2][1]=="B3", (b) grid[1][1]==" ", (c) grid[0]==["A1","B1","C1"] and grid[2]==["A3","B3","C3"], (d) total_rows==3.
Sub-fixture SKIP-TRAILING: col-1 missing row-2 (trailing). col-1=[top=103/"Y1",top=123/"Y2"], delta=20 < threshold=30 → no slot inserted. total_rows=max(3,2,3)=3. grid[2][1]=" " by initialization. Regression proof.

**Strengthened ACs:** AC-6-SEG now requires a SECOND multi-column row below revenue to verify lower-rank alignment. AC-6-INC now requires at least one multi-period row with all values on ONE pipe-row. Both changes are live-verify assertions (live curl), generic phrasing (no hardcoded VN labels in code/ACs), AC-0 compliant.

**CPU budget confirmed:** `_insert_skip_slots` is a pure in-memory list pass. Zero Tesseract calls, zero PIL ops. Per-page budget unchanged.

**Files modified this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — §3.1 flow updated (C8.5 added), §4 updated (pure-ordinal limitation documented), §5 function table updated (new function + constant), §9 ACs updated (AC-6-SKIP added, AC-6-SEG/INC strengthened), §10 risk register updated (3 new rows), §11 DDD table updated, §12 ROLE-RELAY updated to §3-§13, §13 new section added.
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — [Architect] MD-EXTRACT-6 section updated (status, augmentation reason, functions table, ACs, NEXT).
3. `docs/agent-memory/notebooks/architect.md` (this entry).

**Risk flags (new):**
- R-MEDIUM: 2-token column degenerate case — delta equals the skip gap itself → local_pitch is unreliable. Mitigated by ref_pitch fallback from columns with ≥3 tokens. If no column has ≥3 tokens, skip insertion disabled for that column (log WARNING).
- R-LOW: Leading-column skip is a known limitation. Accepted for BCTC document class.
- R-LOW: SKIP_GAP_FACTOR=1.5 may falsely trigger on sparse 3-row pages. Tunable; 1.5 is conservative given 20px pitch vs 2px intra-column noise.

**Next actor:** main-terminal re-traces AC-6-SKIP SKIP-MID arithmetic by hand. If proof confirms rank-shift prevention → commit both files → dispatch dev-pdf-extractor MD-EXTRACT-6.

---

## MD-EXTRACT-6 — Column-Anchor-First Ordinal Reconstruction (2026-05-26T10:45Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-6. Recurring-bug escalation: 5 scalar-y-tolerance attempts (MD-EXTRACT-1/2/3/4/5) all produce the same diagonal failure on wide tables (segment report, income statement). Root cause: within-row x-drift → y-drift that exceeds inter-row gap. No y-threshold, however derived, can separate a row from its neighbor when drift > gap. The scalar-y-tolerance family is structurally exhausted.

**Root cause (geometric):** On the live FPT wide-table pages (segment report p22, income statement p8), each successive column's number token has a `top` value ~4px higher than the previous column's token in the same logical row (scanner skew). With 7 columns across ~1800px, total drift ≈ 28px. Inter-row gap ≈ 16px. drift (28) > gap (16) → the rightmost column's row-k token is closer in y to the next row's leftmost token than to its own row's leftmost token. No y-threshold resolves this. MD-EXTRACT-5 large-gap-mode returned row_pitch=0 on live data (within-row drift gaps ≈ inter-row gaps → large_gaps was empty → fallback to tol=4 → cascade). Confirmed by §8 fixture trace.

**Chosen approach: Column-Anchor-First Ordinal Reconstruction.** Assign each NUMBER token to its nearest x-column-anchor by argmin(left distance). Within each column, sort by top → assign ordinal rank [0, 1, ...]. Reconstruct grid by rank alignment across columns. Cross-column y-comparison NEVER occurs. The diagonal is structurally impossible. Geometric guarantee: within a single column, the printer always places row-k above row-(k+1) regardless of inter-column skew — within-column y-ordering is ALWAYS correct.

**§8 fixture proof (constructed, main-terminal must re-trace):**
10 tokens: row-0 tops=[100,104,108,112,116], row-1 tops=[118,122,126,130,134], 5 columns each. Drift=16px, gap=2px. Ordinal trace: col_anchors=[100,400,700,1000,1300] from x. Each token maps to its column by argmin. Within col-4: [(top=116,rank=0,"500"), (top=134,rank=1,"1000")]. Within col-0: [(top=100,rank=0,"100"), (top=118,rank=1,"600")]. total_rows=2. grid[0]=["100","200","300","400","500"], grid[1]=["600","700","800","900","1000"]. EXACTLY 2 rows. The 2px gap between top=116 and top=118 is irrelevant — these tokens are in DIFFERENT COLUMNS and their comparison never occurs. MD-EXTRACT-5 on same fixture: large_gaps=[] → row_pitch=0 → tol=4 → 5+ rows (diagonal).

**New functions added:** `_assign_tokens_to_columns`, `_build_ordinal_grid`, `_attach_labels_ordinal`. New constants: `LABEL_BAND_FACTOR=1.5`, `_COL_ASSIGN_MAX_DIST_FACTOR=3.0`, `_MIN_WORD_CONF_ORDINAL=30`. Functions retired (marked DEAD): `_cluster_number_rows_adaptive`, `_attach_labels`, `_build_grid_from_number_rows`. Log promotion: `logger.debug` → `logger.info` for row_pitch/tol in `_cluster_number_rows_adaptive`.

**Mandatory diagnostic gate (STEP 1 of dev work):** Dev must run `diagnostic_gate_md6.py` (inline in brief §6) against FPT pages 8 and 22 before writing any code. Reports: row_pitch, adaptive_tol, drift/gap ratio, first-30 number token (left, top). Pass: row_pitch < 8px AND drift/gap > 1.0. If unexpected values, dev stops and reports.

**D4b fix:** Under ordinal reconstruction, code tokens and value tokens land in different col_buckets by x-distance → separate cells by construction. D4b test fixture MUST use exact `left`/`top` from diagnostic script output (lesson from BT3 false-greens).

**Approach evaluation:**
- (A) Image deskew: REJECTED. Would double Tesseract budget (+100s on 20 pages). OpenCV not in requirements.txt. PIL-only implementation requires Hough-line detection from scratch.
- (B) Token-space deskew: VIABLE but not chosen. Still relies on y-tolerance post-correction; if correction is imprecise, cascade recurs.
- (C) Column-anchor-first ordinal: CHOSEN. Eliminates cross-column y-comparison by construction. No new dependency. No Dockerfile change.

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — §MD-EXTRACT-6 appended (§1 exhaustion proof, §2 approach eval, §3 algorithm, §4 empty-cell analysis, §5 function table, §6 diagnostic gate, §7 D4b live-substrate, §8 fixture+proof, §9 ACs, §10 risks, §11 DDD, §12 build-standard)
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — [Architect] MD-EXTRACT-6 section prepended before LIVE-VERIFY-5
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags:**
- R-HIGH: Extra noise tokens in a column inflate total_rows by 1. Mitigated by _MIN_WORD_CONF_ORDINAL=30 filter and _NUMBER_TOKEN_RE gate.
- R-HIGH: Label attachment uses y_med_k of rank-k tokens. On severely skewed pages, y_med_k may miss the label's top. Fallback (nearest TEXT token within 2.5×h_med) catches it.
- R-MEDIUM: Close column anchors (code col + first value col) may merge → code+value concatenation. Mitigated by _COL_ASSIGN_MAX_DIST_FACTOR; ordinal approach structurally separates them when anchors are distinct.

**Next actor:** main-terminal re-traces §8 fixture proof. If provably defeats drift>gap → commit brief → dispatch dev-pdf-extractor MD-EXTRACT-6.

---

## MD-EXTRACT-5 — REVISED: Large-Gap Mode Pitch + Corrected Fixture (2026-05-26T09:15Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-5 REVISION. Main-terminal traced the original §3 algorithm against the §8 AC-5-SEG fixture and proved it FAILS: Step 2 computed median of all adjacent inter-bin gaps (dominated by within-row micro-gaps), yielding row_pitch=2 and tol=0. Greedy with tol=0 produced ~14 groups from 14 tokens. Two compounding root errors identified and corrected.

**Root error 1 — wrong quantity in Step 2:** `median(all adjacent inter-bin gaps)` estimates the within-row micro-gap (2px), NOT the inter-row pitch (14-16px). Fix: large-gap mode. Compute all inter-bin gaps. `gap_median = median(gaps)`. `large_gaps = [g for g in gaps if g > gap_median]`. `row_pitch = min(large_gaps)`. These are the row-boundary gaps — the within-row micro-gaps are filtered out by the median threshold.

**Root error 2 — pathological fixture:** Original fixture had row0 drift=14px and row1 starting at top=115 (gap = 1px from row0's top=114). Drift ≈ gap → NO y-only algorithm can separate these rows. The boundary is invisible in the 2px histogram (top=114 and top=115 both bin to 114). Fixture replaced with realistic BCTC parameters: drift ≤ 6px, inter-row gap = 14px (ratio 2.3×).

**Corrected algorithm trace on revised fixture** (row0=[100..106], row1=[120..121], left=[100..1900]):
- Step 2: unique_bins=[100,102,104,106,120], gaps=[2,2,2,14], median=2, large_gaps=[14], row_pitch=14
- Step 3: tol = min(int(0.45×14),8) = 6
- Step 4: all 7 row0 tokens (top 100→106) admitted, centroid reaches 103. First row1 token (top=120): |120-103|=17 > 6 → new group. All 7 row1 tokens admitted. RESULT: 2 groups, 7+7. AC PASSES.

**New helper function:** `_estimate_inter_row_pitch(number_tokens, same_line_tol) → int`. Pure. Implements large-gap mode: bins tops, computes adjacent inter-bin gaps, returns min(large_gaps) or 0 to trigger fallback. Called by `_cluster_number_rows_adaptive`. Added to §7 function table and §11 DDD table.

**`_cluster_number_rows_adaptive`:** unchanged in structure (sort → pitch estimate → tol → greedy centroid). Only Step 2 logic (delegated to `_estimate_inter_row_pitch`) is the corrected implementation.

**Design precondition (explicit in brief):** inter-row gap > within-row drift. For well-scanned BCTC documents at 200 DPI: drift ≤ 8px, gap ≥ 12px. Documents violating this (severe distortion) fall back to same_line_tol=4 — no worse than current behavior. Deskew is the correct pre-processing fix for severe cases (out of scope).

**Files revised this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — §3 rewritten (large-gap mode, full trace), §7 updated (`_estimate_inter_row_pitch` added), §8 AC-5-SEG fixture replaced + arithmetic proof added, §11 DDD table updated
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — `[Architect] MD-EXTRACT-5` section replaced with revised design
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags (updated):**
- R-HIGH: large-gap mode requires at least 2 distinct inter-bin gap magnitudes (small micro-gap + large row-boundary gap). If all gaps are equal (perfectly uniform table) or there are < 2 unique bins → fallback to same_line_tol=4 (log DEBUG).
- R-HIGH: 8px tol cap is the architectural ceiling. Documents with drift > 8px require pre-processing deskew (out of scope).
- R-MEDIUM: if within-row gaps are heterogeneous (some large within-row gaps from merged OCR tokens), the large-gap filter may include them, inflating pitch. Mitigated by the min() function (takes the smallest large gap).

**NEXT: dev-pdf-extractor** — implement MD-EXTRACT-5 per REVISED brief §3-§9. AC-3F (non-regression) FIRST. Leave files UNSTAGED. Then ops MD-DEPLOY-5 (single doc, full UUID) → main-terminal live-verify → qa MD-QA-5 → po MD-EXIT.

---

## MD-EXTRACT-4 REVISED — Number-Token 2D Reconstruction (2026-05-26T~UTC) — DESIGN REVISED

**Task:** MD-EXTRACT-4 revision. Main-terminal verified live `pdf_extracted_text` substrate and disproved the psm-6 Candidate 2 design for wide tables. Revision mandated before dev proceeds.

**Ground-truth finding:** psm-6 OCR for wide BCTC tables (segment report p22, income statement p8) is COLUMN-MAJOR, not row-major. The entire label column is stacked, then col-1 values stacked, etc. Segment revenues `35.381.667/9.092.934/18.701.876` are on lines 53/83/100 — each alone. `_split_by_whitespace_gap` cannot reconstruct these matrices (no row-aligned lines to split). Candidate 2 is REJECTED.

**Correct direction (Candidate 3 — elevated):** `image_to_data` 2D reconstruction with NUMBER-TOKEN-ONLY y-clustering. The bbox data is correct (values present in MD-EXTRACT-3 output). Fix: classify tokens (NUMBER vs TEXT), cluster only NUMBER tokens by y (`SAME_LINE_TOL=4`, no diacritic inflation), derive column layout from NUMBER token x-positions, attach labels by nearest TEXT token y-band.

**New functions to add:**
1. `_NUMBER_TOKEN_RE` constant + `SAME_LINE_TOL=4` constant.
2. `_classify_tokens(words)` → `(number_tokens, text_tokens)`. Pure.
3. `_cluster_number_rows(number_tokens, same_line_tol)` → row groups. Pure. Replaces `_cluster_rows`/`_cluster_rows_by_gap`.
4. `_attach_labels(row_groups, text_tokens, h_med)` → `[(label, row_tokens)]`. Pure.
5. `_build_grid_from_number_rows(labeled_rows, col_anchors)` → 2D grid. Pure.
6. `_process_page` MODIFIED — number-token-2D path replaces cluster-all-tokens.

**CANCELLED — do NOT implement:** `_process_page_from_text`, `_split_by_whitespace_gap`, `_detect_table_regions_from_text`, `_build_grid_from_lines`.

**AC-4C corrected (was BACKWARDS):** "Doanh thu theo bộ phận" is ONE row; the three values are THREE COLUMN CELLS of that row. Correct assertion: all three appear in THE SAME pipe-row, in different column cells. Prior AC-4C said "three different rows" — WRONG.

**AC-4A/4B/4D:** unchanged and correct.

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — MD-EXTRACT-4 section revised (Candidate 2 rejected, Candidate 3 elevated, §3/§4/§5/§6/§7/§8/§9 updated, AC-Q4-1 corrected)
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — [Architect] MD-EXTRACT-4 record replaced with REVISED version
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** dev-pdf-extractor — MD-EXTRACT-4 (number-token-2D implementation). Verify AC-3F (non-regression) FIRST. Leave files UNSTAGED. Then ops MD-DEPLOY-4 (single doc, full UUID) → main-terminal re-verify → qa MD-QA-4 → po MD-EXIT.

---

## MD-EXTRACT-2 — Live-verify fix design (2026-05-26T11:30Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-2. Post-deploy live verification of FPT Q4 2025 revealed 3 defects: (A) `ocr_as_markdown` = 0 bytes, (B) 15 of 30 tables are noise (letterhead/prose), (C) cosmetic — header noise glued to segment table top + label over-segmented into 3 columns.

**DEFECT-A root cause:** ops re-extract call sent `{report_id, pdf_path}` only — no `doc_ocr_text`. Use case hit else-branch → stored empty string. OCR text already exists in mcp-server `pdf_extracted_text` table, queryable via `GET /api/bctc-inspect/ocr/{doc_id}?page=N`. Fix: new `OcrTextFetchClientPort` (domain) + `OcrTextFetchClient` (infra, HTTP GET, concatenate pages) + optional injection into use case as Step 0. Zero extra Tesseract calls. Graceful degrade.

**DEFECT-B fix:** `_is_data_table(grid)` density gate. `_MONEY_GROUP_RE = r'\d{1,3}(?:[.,]\d{3})+'` as primary signal. K=6 money-groups (primary gate) OR J=3 three-digit codes + 1 money-group (secondary). Live data: real tables >=6, noise <=3 — clean split. Old col_count==1 prose filter REPLACED by density gate for all regions.

**DEFECT-C fixes:** `_strip_leading_header_bands()` — remove rows with 0 money-groups from grid top until first financial row. `_coalesce_label_columns()` — merge leading text-only columns (zero money-groups) left of first numeric column into single label column.

**Key design decisions:**
1. Zero mcp-server changes. `GET /api/bctc-inspect/ocr/{doc_id}` already exists and returns per-page OCR text. The fetch client is purely additive in pdf-extractor.
2. All new functions in `generic_md_table_extractor.py` use `_MONEY_GROUP_RE` and `_DATE_HEADER_RE` — generic patterns, AC-0 grep-proof satisfied by construction.
3. `_process_page()` pipeline order: strip_header_bands → coalesce_label_columns → _is_data_table gate → header detect → emit markdown.
4. `OcrTextFetchClient` is infra. Port is domain. Wired at `main.py` composition root. Fence-A/B intact.
5. Hardware: DEFECT-A adds 0 Tesseract calls (HTTP fetch only). DEFECT-B/C are post-processing of already-collected bbox data. No kernel-panic risk increase.

**Expected outcome after fix:** 30 → ~12 tables, `ocr_as_markdown` non-empty, segment report header-noise-free, balance sheet labels coalesced, structured path unregressed (79 rows, balance_pass=true).

**Files authored this cycle (2):**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — APPENDED "MD-EXTRACT-2" section
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — APPENDED [Architect] MD-EXTRACT-2 record
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags:**
- R-HIGH: K=6 calibrated on FPT only. Other docs may need K=4. Tuning parameter.
- R-MEDIUM: OcrTextFetchClient HTTP failure → empty ocr_as_markdown. Graceful degrade, not crash.

**Next actor:** dev-pdf-extractor — MD-EXTRACT-2. Implement DEFECT-A/B/C. AC-2F (non-regression) first. Single-doc re-extract only after container rebuild.

---

## MD-DESIGN — Generic table detection blueprint (2026-05-26T10:30Z) — DESIGN COMPLETE

**Task:** MD-DESIGN. New sprint BCTC-MD-TABLE. Design a generic PDF table detector → markdown emitter that works on ANY BCTC table (segment report, balance sheet, income statement, cash flow) from a single generic code path. Decision A: augment, not replace the structured `bctc_table_rows` path.

**Algorithm chosen:** `pytesseract.image_to_data` TSV → per-word bbox → y-band row clustering + x-gap column detection → generic grid → markdown pipe-table. pdfplumber/Camelot disqualified (BCTC = image-only scans, no native text layer).

**Key decisions:**

1. **New module: `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`** — separate from `text_table_extractor.py` (frozen, 7 fix commits). Zero BCTC-specific constants (geometry/structure only — Decision D grep-proof).

2. **New port: `GenericMdTableExtractorPort`** added to `domain/modules/financial_reports/ports.py`. New port `MdTablePushClientPort` added alongside.

3. **New use case: `apps/pdf-extractor/application/extract_md_tables_usecase.py`** — runs on ALL pages (not just BS section), MAX_PAGES=20 guard, fire-and-forget 202 Accepted (background task).

4. **Storage in mcp-server: `bctc_md_tables` table** (new, `CREATE TABLE IF NOT EXISTS`). Stores `md_tables_json` (JSON array of markdown strings) + `ocr_as_markdown` per `report_id`. Inspector is pure-read. No compute-on-read.

5. **New mcp-server endpoints:** `POST /api/push-bctc-md-tables` + `GET /api/bctc-inspect/md/{doc_id}` + markdown panel in `bctc-inspector.html` (mcp-server side only).

6. **Decision A zero-collision confirmed:** separate use cases, separate infra, separate DB table, separate endpoints. `bctc_table_rows` + `bctc_balance_checks` + all existing handlers UNTOUCHED.

7. **OCR-as-markdown:** pure `ocr_text_to_markdown(text: str) -> str` function — converts stored flat OCR text to readable markdown with section headers, blockquoted numeric lines, blank lines. No re-OCR.

**Files authored this cycle (3):**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` (NEW — full blueprint)
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — [Architect] Brownfield Findings + Per-Task ACs appended
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags:**
- R-HIGH: `image_to_data` on 20 pages ≈ 60-100s sequential on Intel Mac. Mitigated by 202 async + MAX_PAGES=20.
- R-HIGH: Low OCR confidence → ragged markdown cell text. Acceptable: markdown is human-recheck layer.
- R-MEDIUM: Inspector HTML — must be mcp-server-side `bctc-inspector.html` (not frozen pdf-extractor dashboard). dev-mcp-server must verify file path.
- R-MEDIUM: 1-column prose pages falsely detected as tables. Mitigated by post-filter (col_count==1 + row_count>15 → prose path).

**Next actors:** dev-pdf-extractor (MD-EXTRACT, BLOCKED → READY now) in parallel with dev-mcp-server (MD-INSPECT, BLOCKED → READY now). MD-INSPECT can start immediately — the DB schema and API contract are fully specified. MD-EXTRACT and MD-INSPECT are independent (no shared implementation dependency). MD-DEPLOY waits for both.

---

## BT3-RETHINK — Filter strategy ruling (2026-05-26T09:30Z) — DESIGN COMPLETE

**Task:** BT3-RETHINK. PO revoked BT3-FIX4 ruling (false-green #6). Root cause: FIX4 fixture used PyMuPDF/spike OCR; production uses poppler. Character set mismatch caused all skip-strings and diacritic-sensitive regexes to silently miss live poppler output. 23 orphan rows on live, 0 on fixture.

**Three live failure classes:**
1. Diacritics mismatch — `"bảng cân"` skip key misses poppler's `"BANG CÂN"`. Date regex `tháng` misses poppler's `"thang"`. 5 orphan rows.
2. Garbled signature noise — arbitrary poppler OCR garbage in digital-cert block. Literal skip-list cannot enumerate. ~8-12 orphan rows.
3. Embedded-code rows (222/223/226/131/319/421b) — Layout 2/4 label-boundary regexes fail on poppler's diacritic-variant label text.

**Four rulings:**

**Ruling A (Filter Strategy): POSITIVE-KEEP + POSITIONAL CUTOFF.** Negative skip-list retired as primary filter. (1) `_apply_positional_cutoff()` drops all rows after last sentinel code (270/440) — eliminates signature block without enumeration. (2) else-branch POSITIVE-KEEP gate: non-code lines only emitted if `_is_recognized_section_header()` returns True (narrow: section-letter A-E or roman numeral I-V headers only). Everything else dropped silently.

**Ruling B (Embedded-Code Split): Layout 5 scan-and-extract.** New `_find_code_in_line()` + `_BCTC_CODE_SCAN_RE` added as Layout 5 in `_try_parse_code_row()`. Scans for 2-3 digit code token regardless of label content. Rejects code_int < 100. Diacritic-agnostic (label text not used for matching). Non-regression: only reached when Layouts 1-4 all fail.

**Ruling C (Diacritics Robustness): `_norm()` helper everywhere.** `unicodedata.normalize("NFD") + strip Mn + uppercase`. Applied to both sides of all skip-list comparisons and date regexes. Poppler `"BANG CAN"` and PyMuPDF `"BẢNG CÂN"` both normalize to `"BANG CAN"`. Immune to rasterizer variation.

**Ruling D (Fixture Mandate — BLOCKING AC-0): Replace fixture with poppler substrate.** `fpt_q4_2025_pages_4-7.txt` must be regenerated from live poppler OCR of e71f845d via `POST localhost:5001/extract-tables` with `debug_dump_ocr=true`. Any fixture from a different substrate will false-green again. AC-0 is the gate — no other AC claimable until fixture is replaced.

**Files authored this cycle (3):**
1. `docs/architecture-briefs/2026-05-26-bctc-table-bt3-rethink-filter-strategy.md` (NEW — full ruling)
2. `docs/handoffs/TASK_BCTC-TABLE.md` — [Architect] BT3-RETHINK section appended
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags:**
- R-MEDIUM: POSITIVE-KEEP drops legitimate multi-line section labels (e.g. "NGUỒN VỐN") — cosmetic only, does not affect code rows or balance_pass
- R-LOW: Layout 5 `_find_code_in_line` false-positive on note-ref lines — mitigated by `code_int < 100` guard + positional cutoff removing footnote block
- R-LOW: Positional cutoff sentinel-set must be extended for income/cash-flow statements before BT-6 multi-doc QA

**Next actor:** dev-pdf-extractor (BT3-FIX5) — implement Rulings A/B/C/D. AC-0 (fixture regeneration) is blocking. Single-doc re-extract only: `POST localhost:5001/extract-tables` for e71f845d. NEVER bctcBatchTableBackfillJob (host kernel-panic risk).

---

## BT3-FIX4-PARSE — Parser hardening ruling (2026-05-26T06:00Z) — DESIGN COMPLETE (REVOKED by PO)

**Task:** BT3-FIX4-PARSE. After BT3-FIX3-PSM (psm 6 fix, commit `3b722462`): 71 clean code rows, 29 orphans. Recurring-bug threshold crossed. Architect rules on parser hardening scope, rasterizer question, and achievable orphan floor before dev implements.

**Key findings:**

1. **29 orphans split into 2 categories:** Category A (11 real data rows — dash sub-items, note-ref column, letter-suffix codes, 1-2 OCR char errors); Category B (18 junk lines — signature block, date lines, column-header fragments not caught by existing skip list).

2. **Root cause of Category A:** `_CODE_ROW_SINGLE_SPACE_RE` trailing anchor `[a-zA-Z|\\]*\s*$` rejects `)` in parenthetical negatives (e.g., code 223 line). `*` allows empty but the regex engine fails to match `)`. Changing to `?` unblocks the match. Letter-suffix codes (`421b`, `411q`) fail because `(\d{2,3})` group rejects the trailing letter.

3. **4 changes in scope** — all confined to `_parse_lines_to_rows()` and regex constants (pure logic, no I/O): CHANGE-1 anchor relax (`*→?`), CHANGE-2 letter-suffix code group (`\d{2,3}→\d{2,3}[a-z]?`), CHANGE-3 wider note-number pattern (`\d{1,2}→\d{1,3}`), CHANGE-4 extended junk skip list (signature keywords + date regex).

4. **Rasterizer verdict: NO SWAP.** Do not replace pdf2image/poppler with PyMuPDF/fitz. 5-row gap (fixture vs live) attributable to OCR char errors, not rasterizer quality. New dependency violates HOST SAFETY (D6). Accept 1-2 unrecoverable rows as irreducible OCR floor.

5. **Achievable orphan floor: 1-2.** `421a→"4214"` is unrecoverable (OCR reads "a" as "4", produces 4-digit number). After CHANGE-1 through CHANGE-4: expected ~82-85 code rows total. Hard AC: orphans ≤ 5, soft target ≤ 2.

6. **Non-regression invariant (BLOCKING):** All 71 currently-clean code rows, balance_pass=true, delta=0, zero dup codes must not regress. AC-NR-1 must run before any other AC is claimed.

**Files authored this cycle (3):**
1. `docs/architecture-briefs/2026-05-26-bctc-table-bt3-fix4-parser-hardening.md` (NEW — full ruling)
2. `docs/handoffs/TASK_BCTC-TABLE.md` — [Architect] BT3-FIX4-PARSE section appended
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags:**
- R-HIGH: If CHANGE-2 is applied only to Layout 4 regex and not equivalently to Layouts 1/2/3, letter-suffix codes will still orphan on those layouts. Dev must audit all 4 layout regexes.
- R-MEDIUM: CHANGE-4 junk filter must not false-positive on real label lines (only applied after code-match already failed — structurally safe, but verify in unit tests).
- R-LOW: `411q` (OCR char error for `411a`) accepted faithfully — downstream callers will store `code="411q"`. If a future reconciliation step does code-lookup against BCTC standard table, this will not find `411q`. Accept for now; note as technical debt.

**Next actor:** dev-pdf-extractor — implement CHANGE-1 through CHANGE-4. Run AC-NR-1 first (non-regression gate). Then AC-1 through AC-12. Rebuild container after code change. Verify live endpoint row-count in [82, 92].

---

## BT3-FIX-3-DESIGN — Fourth false-green root-cause ruling (2026-05-26T04:30Z) — DESIGN COMPLETE

**Task:** BT3-FIX-3-DESIGN. Recurring-bug escalation: 3rd fix cycle on `text_table_extractor.py`. Live `/api/bctc-inspect` returns 138 rows with scrambled labels (pages 4+6), null value_prior, company-address junk (pages 5+7). balance_pass=True despite scrambled interior — fourth false-green.

**Key findings:**

1. **Defect 1 — three-block off-by-one:** `_parse_three_block_layout()` Phase 2 has an all-caps short-line filter (len ≤20) that silently drops the section-header label "TÀI SAN NGAN HAN" (code 100's label) and "NỢ PHẢI TRẢ" (code 300's label). Every subsequent code gets the wrong label (shifted down by one). Fix: remove the all-caps skip from Phase 2. Only skip provably-noise lines (company/address/form patterns).

2. **Defect 2 — stored OCR vs. fresh OCR mismatch (root cause of page 5+7 failures):** The production backfill passes `pre_supplied_pages` from `pdf_extracted_text` (stored OCR). This stored OCR renders pages 5 and 7 in column-separated layout (labels in left block, prior-values in center block, code+current-value in right block). The spike ran fresh Tesseract at 200 DPI (psm 6) which produces inline layout (code+label+values on same line). All integration tests used the spike's inline `.txt` fixture — so they passed while production failed. This is dual-path drift #3.

3. **Strategy (c) selected:** Remove `pre_supplied_pages` from the backfill call. `ExtractTablesUseCase.execute()` with `pdf_path` only calls `PdfOcrAdapter` for fresh Tesseract OCR — the proven path from BT-3-D. No re-OCR by ops required as prerequisite.

4. **balance_pass FORBIDDEN as sole gate.** 12 mandatory row-level ACs specified for BT3-FIX-3's test (sentinel values, sentinel priors, label fidelity, no shift, orphan=0, header≤8, zero dups, prior≥90%, no junk, row count [80,110]).

**Files authored this cycle (3):**
1. `docs/architecture-briefs/2026-05-26-bctc-table-bt3-fix3-root-cause-ruling.md` (NEW — full ruling)
2. `docs/handoffs/TASK_BCTC-TABLE.md` — [Architect] BT3-FIX-3-DESIGN section appended
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags:**
- R-MEDIUM: All 14 gold-set BCTC documents have same stored-OCR column-separated layout — BT-6 QA must run row-fidelity assertions across all 14, not just FPT.
- R-MEDIUM: Fresh Tesseract backfill ~16s/doc × 14 docs = ~224s total — enforce sequential execution in backfill job.
- R-LOW: Code 222/223 OCR misread may persist on fresh Tesseract — add de-duplication guard.

**Next actor:** pm — create BT3-FIX-3 handoff for dev-pdf-extractor.

---

## BT3-DESIGN — BCTC-TABLE-3 parser fix ruling (2026-05-25T23:30Z) — DESIGN COMPLETE

**Task:** BT3-DESIGN. Produce the technical ruling for Sprint BCTC-TABLE-3. Root cause pre-pinned by PO: production `text_table_extractor.py` introduced a fabricated block-column state machine that (a) hardcodes `label=""` → 44 orphan rows, (b) positionally zips separated code/value lists → drops code 100, duplicates 222, nulls value_prior on 118/150 rows, (c) else-branch emits company name / address as junk rows → 94 junk rows. Spike's `lines_to_rows()` on the SAME stored OCR text produced ~80 perfect gold rows.

**Key decisions:**

1. **RE-PARSE, not zone-OCR.** Stored Tesseract OCR is already one-line-per-row. Spike proved it. Zone-OCR adds host-panic risk (kernel watchdog under concurrent Tesseract on 16GB Mac). Backfill path must be zero-Tesseract.

2. **Delete 3 functions** from `text_table_extractor.py`: `_detect_block_column_layout`, `_extract_block_columns`, `_build_rows_from_block_columns`. Collapse the `if block_column else inline` dispatch to inline-only for every page.

3. **Add shared pure `_parse_lines_to_rows()`** used by BOTH the live `assemble()` path AND the backfill path. Kills dual-path drift permanently. One canonical parser.

4. **Tighten else-branch junk filter**: only emit non-code lines as header/separator rows if they contain ≥3 consecutive alphabetic characters. Rejects company name/address/date/numeric noise.

5. **Row contract UNCHANGED.** `bctc_table_rows` schema, `push-bctc-table` handler, `bctcInspectHandler`, `bctc-inspector.html` — all untouched. Fix is pure pdf-extractor-side.

6. **Integration test mandate: no subclass bypass.** Replace `PreloadedTextTableExtractor` false-green with real `TextTableExtractor()` on committed FPT pages 4-7 fixture text. Assert 11 ACs against spike gold (0 orphan/junk rows, code 100 present, no dups, value_prior ≥90%, sentinels exact).

**Files authored this cycle (3):**
1. `docs/handoffs/TASK_BCTC-TABLE.md` — BT3-DESIGN ruling appended (§ [Architect] BT3-DESIGN), task ladder updated (BT3-DESIGN=DONE, BT3-FIX=READY)
2. `docs/architecture-briefs/2026-05-25-bctc-table-3-parser-fix-ruling.md` (NEW — full ruling with decision table, exact change spec, risk register)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags surfaced:**
- R-MEDIUM: Pages 5-7 multi-line label wraps (p7 scored 86.7%). Integration fixture must cover pages 5-7. Spike already handles gracefully.
- R-LOW: Pure-code-only OCR fragment lines (`"100"` alone) now reach the else-branch but will be filtered by the tightened length/alphabetic guard.
- R-LOW: Footnote note-number column (single digit between code and value) may be consumed as value_current by `_parse_value_cells`. Dev must unit-test this case.

**Next actor:** dev-pdf-extractor — BT3-FIX.

---

## P2-MCP-PLAN — mcp-server Phase-2 task plan (2026-05-25T18:05Z) — DESIGN COMPLETE

**Task:** P2-MCP-PLAN. Author the mcp-server SCALE Phase-2 task plan. Input: PO signal po-20260525T174842Z.json (Phase-1 7/12 honest grade), Phase-1 task plan, pilot-status-mcp-server.json, brownfield scan (intelligenceCycleJob kinhDich callers, src/index.ts 199L, no eslintrc on disk).

**Key design decisions:**

1. **G3 split design confirmed.** src/index.ts → thin entry (≤80L: env suppression + imports + `await bootstrapMcpServer()`) + composition-root.ts (≤120L: all 5 startup sections, graceful shutdown, signal handlers). Zero domain logic in composition root. Task P2-E.

2. **G4 fence adapted to mcp-server layers.** SI-3 spec is FINAL (no re-design). Fence elements mapped to existing mcp-server structure: domain/application/infrastructure/interface/scheduler/sandbox/composition-root. Fence-A: domain must not import infra/interface/scheduler. Fence-B: application must not import interface/scheduler. Fence-C: infra only from composition-root + application. Fence false-green trap explicitly guarded: deliberate-violation proof (non-zero exit + "Fence-A" in output) is MANDATORY. Tasks P2-A through P2-D.

3. **G5a scope NARROW.** Only `kinhDichWrapper.ts` moves to `_deprecated/`. All other kinhDich domain files (hexagramLibrary, kinhDichReading, etc.) stay — they are legitimately KEEP: intelligenceCycleJob's in-process hexagram computation path (dynamic imports at lines 409-420) is NOT a G5 violation. 2 test files need import path update. Task P2-F.

4. **G9 dashboard-first, verbal-second.** Module panel + microservice panel filled with live data (P2-G), then Playwright trust-contract (P2-H, Path B PO default), then USER verbal sign-off (P2-I — ONLY USER-gated step, PO presents file:// dashboard, user says YES, NEVER ask user to run commands). 7 Playwright assertions including offline fallback.

5. **G10/G11 target confirmed.** signal-bus-helper (signalBuilders.ts) for G10 injection. sector-classifier (sectorPeers.ts) for G11 Trial-2 dedicated mutation. Trial-1 may reuse G10 evidence if coupling observed.

6. **13 tasks (P2-A→P2-Z), strictly sequential WIP=1.** ~9h dev+qa effort. Pre-revert tags: mcp-server-pre-ci (P2-A), mcp-server-pre-delete (P2-F), mcp-server-pre-inject (P2-J). All three listed in Phase-1 plan §Pre-Revert Tags.

**Files authored this cycle (4):**
1. `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-2-task-plan.md` (NEW — full plan, 13 tasks)
2. `docs/pipeline-state.json` (UPDATED — phase2=PLANNED, nextAgent pm/dev-mcp-server)
3. `docs/data/pilot-status-mcp-server.json` (UPDATED — phase2 block populated)
4. `docs/signals/DASHBOARD.md` (UPDATED — Phase-2 plan-ready row in header)
5. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** pm — break plan into dev-mcp-server + qa handoffs. Then dev-mcp-server RUN-SOLO P2-A→P2-H+P2-K+P2-L. qa: P2-C/D/H/J/K/L/Z. po: P2-I (G9 verbal) + 12/12 terminal flip after P2-Z.

---

## BCTC-TABLE BT-2 — Integration Blueprint (2026-05-25T18:00Z) — DESIGN COMPLETE

**Task:** BT-2. Design the produce→store→render pipeline for the bctc-inspect table view. PO gate: BT-0-PICK DONE (TEXT path, commit f3931b3a). User complaint: `/api/bctc-inspect` right-pane shows only OCR text, never a structured table (architecture gap — nothing stored).

**Key decisions:**

1. **Storage in `market.db` (mcp-server), not `pdf_extractor.db`.** mcp-server is the sole WRITE owner of `market.db`. pdf-extractor POSTs extracted rows via HTTP to a new `POST /api/push-bctc-table` endpoint. Zero direct DB access from pdf-extractor. Follows 1954c consolidated ownership pattern exactly.

2. **Two new tables in `schema-financial-reports.ts`:** `bctc_table_rows` (per-row: report_id, page, row_order, code, label, period_current/prior, value_current/prior, unit, is_summary_row) + `bctc_balance_checks` (per-report: total_assets/liab/equity, balance_delta, balance_pass). DDL as `CREATE TABLE IF NOT EXISTS` — auto-migrates at server startup.

3. **New ExtractTablesUseCase** (application layer, pdf-extractor) orchestrates `TextTableExtractor` (infra, Tesseract+BT-1 primitives) → balance check (domain pure via reconcile_figures) → `TablePushClient` (infra, aiohttp POST). Import-linter Fence-A/B fully respected.

4. **New GET /api/bctc-inspect/table/{doc_id}** on mcp-server returns `{has_table, rows[], balance_check}`. `has_table=false` when no rows stored (200, not 404). Inspector adds `#table-section` with balance PASS/FAIL badge.

5. **New POST /api/push-bctc-table** on mcp-server (DELETE+INSERT idempotent, UUID-gated). Registered alongside existing push-* handlers.

6. **BT-4b trigger:** `bctcBatchTableBackfillJob.ts` (one-shot, NOT cron). Iterates 14 `financial_reports` rows with `pdf_path IS NOT NULL`, calls `POST pdf-extractor:5001/extract-tables` for each. Runs AFTER BT-3+BT-3i+BT-5, BEFORE BT-6.

7. **R-1 (HIGH) low cell-F1 (0.07-0.12):** TEXT path gets figures right but column alignment is weak. Design mitigated by `row_order` preservation + BT-5 cross-check gate on summary codes. PP-StructureV3 IMAGE cross-check DEFERRED (self-hosted only if ever activated). No external API.

8. **1954c collision: NONE.** Existing `POST /extract` → `ExtractPDFUseCase` path untouched. New `POST /extract-tables` → `ExtractTablesUseCase` is additive.

**Files authored this cycle (2):**
1. `docs/handoffs/TASK_BCTC-TABLE.md` — [Architect] BT-2 section appended (full blueprint + ACs for BT-3/3i/4/4b/5/6)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** pm — create per-task handoffs for BT-3 (dev-pdf-extractor) and BT-3i (dev-mcp-server). BT-3 first; BT-3i depends on schema from BT-3. BT-4 parallel with BT-3i (ops sizing). BT-5 after BT-3. BT-4b after BT-3+3i+5. BT-6 after BT-4b.

---

## P0-MCP-5 — mcp-server Phase-1 task plan (2026-05-25T~UTC) — DESIGN COMPLETE

**Task:** P0-MCP-5. Last Phase-0 analysis deliverable before mcp-server pilot Phase-0 close. FULL-scope plan (not MVR) — domain host rationale restated. Inputs: P0-MCP-1 brownfield + P0-MCP-2 bug baseline + mcp-server-charter.md + pilot-charter.md + frontend-phase-1-task-plan.md (format template) + dev-mcp-server/main.md (G12 streak rule).

**Key design decisions:**

1. **FULL verdict confirmed.** mcp-server IS the domain host; MVR is inappropriate (no upstream delegate, 146-tool blast radius, G5-inverse R-CRITICAL violations live, G4 fence doesn't exist, G6 trust dashboard doesn't exist).

2. **G12 streak tasks confirmed: P1-B / P1-C / P1-D** — aligned with `.claude/flows/dev-mcp-server/main.md` §G12 Streak Rule. P1-B = dashboard stub (streak #1), P1-C = system/ barrel wave (streak #2), P1-D = macro/ barrel wave (streak #3).

3. **Barrel decomposition waves ordered smallest-blast-radius first:** SEAM-1 `system/` 21→5 sub-barrels (P1-C), SEAM-2 `macro/` 14→HTTP-proxy+local-computation (P1-D), SEAM-3 `sector/` 15→3 cluster cuts (P1-E). Each QA-gated against full 146-tool surface before next.

4. **G5-inverse remediation track (P1-F + P1-G):** Explicit tasks for kinhDichWrapper bypass (marketTools.ts + analysis.ts + portfolioTools.ts QUE_META), and pdf.ts/pdfOcrWorker.ts post-1954c verify. Each ends with "every handler proven HTTP-routed" grep evidence.

5. **G1 primitive scaffolding (P1-H, secondary):** signal-bus-helper (signalBuilders.ts) + sector-classifier (sectorPeers.ts). Both pure, zero-IO confirmed. ≥3 scenario JSON each. severityLabels.ts annotated as G1-PRIMITIVE-CANDIDATE in P1-E.

6. **Regression tripwires carried from P0-MCP-2:** tool count ≥146, Gate 2d=68, tsc EXIT:0, bun test ≥9408/≤348, BCTC+news-fetch dashboards HTTP 200, no new domain→infra imports — re-checked after EVERY wave.

7. **Carried-debt note:** cronJobCount SSOT=77 vs live=68/73 (stale). testBaselinePass SSOT=9277 vs live=9408-9411 (stale). PO reconciles at P1-EXIT, NOT in Phase-1 scope.

8. **Docker rebuild deferred** to separate session (memory cap). Phase-1 verified host-side only.

9. **10 tasks total** (P1-A through P1-EXIT): 9 dev tasks + 1 PO close-out. WIP=1, RUN-SOLO, ~30h dev effort.

**Risk flags:**
- R-CRITICAL: kinhDichWrapper bypass → P1-F (remediation task)
- R-MEDIUM: pdf.ts/pdfOcrWorker not in _deprecated/ → P1-G (verify task)
- R-HIGH: 146-tool blast radius per barrel wave — QA-gated after each
- R-HIGH: BUG-1 commit-mutex enum drift — workaround: kind=sprint-task, key=commit-mutex:main
- R-LOW: bctc-schema.ts monorepo-root relative import (deferred to Phase 2)

**Files authored this cycle (2):**
1. `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-1-task-plan.md` (REWRITTEN — full FULL-scope plan, 10 tasks, 78 ACs)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** PO — P0-MCP-EXIT (Phase-0 close). dev-mcp-server scheduled LAST after all other service pilots complete.

---

## P0-MCP-1 — mcp-server brownfield inventory (2026-05-25T~UTC) — DESIGN COMPLETE

**Task:** P0-MCP-1. Read-only brownfield inventory of the mcp-server scale pilot (LAST factory microservice, RUN-SOLO / HIGHEST-RISK). Phase-0 UNBLOCKED by PO (HELD pre-0 → ACTIVE 2026-05-25T08:40:43Z, commit 15134e72-area). Mirrors frontend P0 pattern.

**Key brownfield findings:**

1. **12 barrel modules confirmed:** system(21), sector(15), macro(14), market-data(9), news-analysis(9), alerts(9), financial-reports(8), portfolio(7), briefings(5), backtesting(2), analysis(1), kinhdich(1). Total tool files: 115 non-index .ts files across tools/.

2. **Tool count SSOT:** `docs/data/project-stats.json#toolCount` = 146. **Cron count SSOT:** `docs/data/project-stats.json#cronJobCount` = 77. System-map.json shows 125 tools / 65 crons (curation lag vs live stats).

3. **G5-inverse headline:** TA ✓, stock-price ✓, RAG ✓ fully HTTP-routed. kinh-dich PARTIAL (kinhDichWrapper bypassed by marketTools.ts + analysis.ts — R-CRITICAL). macro PARTIAL (8+ local computation tools legitimately owned, only get_macro_snapshot routes via HTTP). pdf-extractor PARTIAL (1954c consolidation landed but pdf.ts + pdfOcrWorker.ts not yet in _deprecated/).

4. **R-CRITICAL (kinhDichWrapper bypass):** `marketTools.ts` and `news-analysis/analysis.ts` directly import `appendKinhDich()` from `domain/services/kinhDich/kinhDichWrapper.ts`. `portfolioTools.ts` imports `QUE_META` from `hexagramLibrary.ts`. These bypass kinh-dich-service:5005 — live G5-inverse violation flagged.

5. **Top 3 barrel-decomposition seams:** SEAM-1 = `system/` (21 files, 5 sub-domain clusters); SEAM-2 = `macro/` (HTTP-proxy vs local-computation split); SEAM-3 = `sector/` (15 topic files, pure domain clusters).

6. **Scheduler coupling risk:** `dailyDashboardJob.ts` reads `docs/agent-memory/sessions/` + `docs/TASKS.md` + `docs/data/project-stats.json` via `getProjectRoot()` — ENOENT class on any path change. `bctcPdfPullJob.ts` in 1954c consolidation zone.

7. **Dashboards served:** bctc-inspector.html + news-fetch-dashboard/ via 8 HTTP route handlers. NOT G6 trust layer — G6 three-tier trust dashboard must be built fresh in Phase 1.

8. **Test harness:** 905 Bun test files (`bun test`). No ESLint layer fence. One lint test (`no-local-project-root`). G4 fence = ESLint + `eslint-plugin-boundaries` or `no-restricted-imports` — must be installed in Phase 1.

9. **bctc-schema.ts monorepo-root coupling:** Dockerfile COPY + relative import path from `src/infrastructure/db/` — fragile, must resolve during barrel reorganization.

10. **MVR-vs-FULL verdict: FULL.** mcp-server IS the domain host; no upstream service to delegate to. Full G1-G12 scope mandatory.

**Risk flags:**
- R-CRITICAL: kinhDichWrapper bypass in marketTools.ts + analysis.ts (live G5 debt pre-existing)
- R-MEDIUM: pdf.ts + pdfOcrWorker.ts not in _deprecated/ (post-1954c cleanup pending)
- R-HIGH: 146-tool blast radius on any barrel split — QA-gate required per barrel before proceeding
- R-HIGH: 77 cron jobs — regression silently breaks daily operational data (dailyDashboardJob ENOENT class)
- R-LOW: bctc-schema.ts monorepo-root relative import (fragile path)
- R-LOW: 905 test files must not regress the 9277 passing baseline

**Files authored this cycle (2):**
1. `docs/handoffs/TASK_P0-MCP-1-brownfield-inventory.md` (NEW)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** PO — P0-MCP-2 (bug-inventory baseline) + P0-MCP-3 (dev-mcp-server agent/flow confirm) + P0-MCP-5 (Phase-1 task plan) gated on this inventory.

[Older cycles archived in git history — see commits before 2026-05-25]
