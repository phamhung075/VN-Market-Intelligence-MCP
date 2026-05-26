# Architect — Notebook

**Last updated:** 2026-05-26 16:12 UTC | **Sprint:** MD-EXTRACT-8 / income-statement-anchor-root-cause

[3 most recent cycles retained below. Archive in git history.]

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

**Acceptance gate (LIVE-ONLY — no fixture shortcut):** AC-8-INC (income clean, 4-period values each on correct row) + AC-8-SEG-NOREGRESS + AC-8-BALANCE-NOREGRESS. Gate arbiter: direct `market.db` query. NOT unit tests. NOT inspect endpoint.

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — §MD-EXTRACT-8 appended (~400 lines: diagnostic findings, root cause, design, risk register, acceptance gate)
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — §[Architect] MD-EXTRACT-8 appended
3. `docs/agent-memory/notebooks/architect.md` — this entry

**Next actor:** main terminal → dispatch dev-pdf-extractor MD-EXTRACT-8 → ops single-doc deploy (UUID `e71f845d`) → main-terminal AC-8 live-verify → qa → po.

---

## MD-EXTRACT-7-REV — Diagnostic-Driven Income Statement Redesign (2026-05-26T15:29Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-7-REV. AC-7-DIAG diagnostic contradicted central assumption of MD-EXTRACT-7. Main-terminal gated implementation. Redesign required before any code.

**Contradiction resolved:** Prior design assumed dual code columns INFLATE anchor count above 6 → trigger fires. Live: Tesseract cleanly assigns 12+29 code tokens to exactly 2 of 6 anchors → count == 6 → trigger dead branch. Three simultaneous root causes identified and fixed.

**Six revision requirements resolved:**

1. **Header/date pollution (NEW):** 9 header tokens (top<400) contaminate anchor + grid. Fix: `_find_first_value_row_top` (scan for first VALUE_TOKEN_RE match → minimum top) + `_exclude_header_tokens` (filter tokens below cutoff). AC-0: top-coord only. New Step C5 in _process_page.

2. **Dual-code-column when anchor count == 6 (count-gate dead):** Replaced count-gate with presence-based detector `_identify_pure_code_columns`. Bucket is pure-code when code_fraction ≥ PURE_CODE_COL_THRESHOLD=0.90 AND value_count==0. Applied at Step C7.5. Segment report: all buckets have value_count>0 → code_col_indices=[] → ELSE branch → pipeline IDENTICAL to MD-EXTRACT-6 for segment. AC-6-SEG structurally guaranteed.

3. **~150px anchor offset (dual mechanism):** (a) Code column at x=959 within col_gap=249 of true value left-edge x=1182 → 1182 cluster swallowed. (b) Header tokens at x≈1330 form separate cluster surviving (371>249) → false anchor. Both fixed by REV-3 (header cutoff) + REV-4 (code exclusion). Supplementary: `_detect_column_anchors_from_tokens` line 708 changed from centroid (`sum(c)/len(c)`) to `min(c)` for left-edge alignment.

4. **KEEP fix-path-C:** `prefer_ref_pitch`, `DENSE_COL_THRESHOLD=6`, `_insert_skip_slots` modification all carry forward unchanged from §MD-EXTRACT-7 §5.

5. **DROP fix-path-D:** Live pitch=35px, band=27px < 35px → no over-reach. `DENSE_LABEL_PITCH_FACTOR`, `band_override`, §MD-EXTRACT-7 §6 content NOT implemented.

6. **Regenerated fixture (REV-8):** 29 tokens = 25 number + 4 text. Mirrors live: 6 anchors (2 pure-code @258/@959, 4 value @1182/1477/1768/2061), 3 header tokens at top=200, 35px data pitch (495/530/565/600), density 4/4/3/3, 2 absent cells (col[4] row-1, col[5] row-2). Full 10-stage trace + 10 hand-checkable assertions in brief §REV-8.

**Key arithmetic to verify (assertions 7+8):**
- col[4] C8.5: ref_pitch=43.5, threshold=65.25, delta[0]=70>65.25 → `ceil(70/43.5)-1 = ceil(1.609)-1 = 1` None slot → slots[1] is None ✓
- col[5] C8.5: delta[0]=34<65.25 (no skip), delta[1]=70>65.25 → 1 None slot → slots[2] is None ✓

**Files to touch:** `infrastructure/generic_md_table_extractor.py` (3 new pure functions + 1-line anchor metric change + _process_page routing) + `__tests__/unit/test_generic_md_table_extractor.py` (3 new test classes + 1 revised dense fixture test). Zero new files. Zero mcp-server changes.

**Files authored this cycle:**
1. `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` — appended §MD-EXTRACT-7-REV (before §MD-EXTRACT-7 which is now SUPERSEDED). §MD-EXTRACT-7 §5 (dense-multi-gap) preserved unchanged.
2. `docs/handoffs/TASK_BCTC-MD-TABLE.md` — appended §[Architect] MD-EXTRACT-7-REV handoff.
3. `docs/agent-memory/notebooks/architect.md` — this entry.

**Risk flags:** R-HIGH: _find_first_value_row_top could set cutoff at column-header period row (~326) rather than data row (~495); still passes — 70px gap means all data tokens included. R-MEDIUM: OCR garbling could misclassify code as value — "01" cannot match VALUE_TOKEN_RE (no .NNN group). R-MEDIUM: min(cluster) with far-left artifact — noise gate in _assign_tokens_to_columns handles downstream.

**Next actor:** main terminal — re-trace §REV-8.2 (10 stages) + §REV-8.3 (10 assertions) by hand. If all assertions pass → dispatch dev-pdf-extractor MD-EXTRACT-7-REV → ops MD-DEPLOY-7 (single doc, full UUID) → main-terminal live-verify → qa → po.

---

## MACRO-FRONTEND-CONTRACT-RULING — P2-H unblock (2026-05-26T13:12Z) — RULING ISSUED

**Task:** Contract ruling for POST /macro/snapshot `signals` field. P2-H BLOCKED by `snapshot.signals.map is not a function` (ops incident signal 20260526T150702Z, commit d413b4e7).

**Evidence gathered:**
- `apps/macro-indicators/pkg/application/dtos.go`: `SignalResult` Go struct → JSON keyed-object with 6 named fields. This is the sole DTO. No array path exists.
- `apps/macro-indicators/pkg/interface/http/router_test.go`: snapshot body shape NOT covered (nil useCase, no TestSnapshotBody). The keyed-object shape is unchallenged by tests but correct per DTO.
- `apps/macro-indicators/pkg/application/usecases.go`: Execute() constructs `SignalResult{...}` at every call. Keyed-object is intentional design from Phase-2 Go rewrite (commit f85ad1d9, CLOSED pilot).
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts`: raw JSON.stringify passthrough. No structure applied to signals. Cowork agents read text.
- `apps/mcp-server/src/infrastructure/microservices/clients.ts:226`: `raw.signals ?? []` stores the object as-is. `macroIndicatorRefreshJob` never reads signals. No mcp-server code iterates signals.
- Frontend is the lone broken consumer (MacroSignalPanel `.map()` line 705, InfoSourcePanel `.length`/`.sort()` lines 1067-1084, domain type `MacroSignal[]` line 132).

**Ruling:** Keyed-object is canonical. Frontend adapts.

**Fix owner:** dev-frontend (3 files: domain/market.ts, routes/dashboard.analysis.tsx, __tests__/1934-macro-panel.test.ts). No macro rebuild needed. Frontend rebuild + ops P2-H re-run required.

**Risk flags:** R-HIGH: no snapshot body contract test in macro service. R-MEDIUM: mcp-server clients.ts signals typed as array (latent). R-LOW: ARCHITECTURE.md shows macro as TS/Bun (Go drift).

**Files authored:**
1. `docs/architecture-briefs/2026-05-26-macro-snapshot-signals-contract-ruling.md` (NEW)
2. `docs/signals/architect-macro-frontend-contract-ruling-20260526T131241Z.json` (NEW)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** po/dev-team — read routing signal, dispatch dev-frontend for the 3-file fix, then ops for frontend container rebuild + P2-H Playwright re-run.

---
