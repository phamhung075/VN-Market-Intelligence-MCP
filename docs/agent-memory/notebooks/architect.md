# Architect — Notebook

**Last updated:** 2026-05-26 15:29 UTC | **Sprint:** MD-EXTRACT-7-REV / income-statement-diagnostic-revision

[3 most recent cycles retained below. Archive in git history.]

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

## MD-EXTRACT-7 — Dense Income Statement Reconstruction (2026-05-26T09:16Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-7. Follow-up to MD-EXTRACT-6 which PASSED AC-6-SEG (segment report diagonal defeated) but FAILED AC-6-INC (income statement table[8] garbled in three simultaneous modes).

**Three failure modes diagnosed from LIVE-VERIFY-6:**
1. Label interleaving — `LABEL_BAND_FACTOR=1.5×h_med=30px` spans 1.5 physical rows on 20px-pitch dense income statement page. Fix: `effective_band = DENSE_LABEL_PITCH_FACTOR × label_pitch = 0.45 × 20 = 9px` derived from per-page ordinal row pitch.
2. Dual code columns merged — Mã số + Thuyết minh small-int tokens create spurious x-anchors. Fix: `_split_number_tokens_by_zone()` excludes label-zone small-int tokens from anchor detection when `len(initial_anchors) > N_EXPECTED_MAX_VALUE_COLS=6`. AC-0: purely geometric (left < leftmost_value_anchor - 2×w_med).
3. Dense multi-gap value scramble — sparse period columns with many empty rows use unreliable local_pitch. Fix: `prefer_ref_pitch=True` for columns with <6 tokens in `_insert_skip_slots`.

**Mandatory diagnostic (STEP 1):** `diagnostic_md7.py` — 5 dumps (anchors, per-col token counts, PRE-label grid, small-int classification, interpretation gates). Diagnostic confirms root cause before any code. Full script + interpretation table in brief §3.

**Hand-traceable fixture (§7.1/§7.2):** 23 tokens, 4 rows, col-1 row-1 absent (dense-multi-gap). Full stage trace with 8 assertions — main terminal must verify by hand before dispatching dev.

**Files:** brief §MD-EXTRACT-7 (architecture-briefs), handoff §[Architect] MD-EXTRACT-7 (TASK_BCTC-MD-TABLE.md), this notebook.

**Risk flags:** R-HIGH: diagnostic may show anchors ≤6 → zone split does not trigger → Fix path D only (label band). R-HIGH: DENSE_COL_THRESHOLD=6 must not fire on segment report (col counts ≥7 → safe). R-MEDIUM: code_note_tokens appended to text pool may grab wrong row (mitigated by 9px band from label_pitch). R-LOW: zone split fires on segment report → zero label-zone tokens found → no change.

**Next actor:** main-terminal — re-traces §7.2 dense-fixture proof by hand (8 assertions), then dispatches dev-pdf-extractor MD-EXTRACT-7.

---

## P2-FE-PLAN — frontend Phase-2 task plan (2026-05-26T14:00Z) — DESIGN COMPLETE

**Task:** P2-FE-PLAN. Author the frontend SCALE Phase-2 task plan. Input: pilot-status-frontend.json (phase2=AWAITING-PLAN, awaitingUserG9Signoff=RETIRED), Phase-1 QA-approved at c85f577c (4/12 YES + G12 EARNED-PENDING), mcp-server Phase-2 plan as structural template, frontend brownfield + charter + Phase-1 plan. Zone apps/frontend/ ONLY.

**Key design decisions:**

1. **G3=N/A confirmed.** Remix framework IS the composition root — wires routes/loaders/actions at build-time via Vite plugin. `app/root.tsx` = 60 lines, layout+error-boundary only, zero domain ops. A forced `composition-root.ts` would be empty boilerplate. Brownfield §8 + Phase-1 plan both pre-confirmed G3=N/A. Not a new decision.

2. **G5=N/A confirmed.** Frontend has no prior mcp-server location. Always been standalone Remix at `apps/frontend/`. Brownfield §6 confirmed. G5a/b/c all N/A.

3. **G4 fence adapted to Remix `app/` structure.** SI-3 FINAL (no re-design). Fence-A: `app/domain/formatters/**` must not import api-client/route/component. Fence-B: `app/lib/view-models/**` same. Fence-C: `app/lib/api/**` must not be imported by formatters/domain/view-models. Elements: formatter/domain/view-model/api-client/component/route/composition-root. Deliberate-violation proof MANDATORY (fence false-green trap). Tasks P2-A through P2-D.

4. **G7=EARNED from Phase-1 P1-E.** P1-E AC-1 (edit-fixture-rerun proof) + AC-3 (zero-creds grep) already proven at c85f577c. QA confirms at P2-Z — no new build work.

5. **G9=ops live-recheck (NOT user verbal sign-off).** Per `feedback_trust_verification_is_system_job` MEMORY binding. awaitingUserG9Signoff gate RETIRED (pilot-status retiredAt 2026-05-26T08:30Z). Container rebuilt post-Phase-1 (sha256:605035cf). G9 = ops runs Playwright 4/4 against port 3001 → evidence signal. Task P2-H.

6. **G10 target: `formatDirectionArrow` (direction-arrow.ts).** Pure function, Vitest-tested, zero I/O. Bug type: single-literal mutation (↑ → ↑↑). Pre-revert tag `frontend-pre-inject` before injection. Dev diagnoses from RED output only (no file pointer). ≤2 cycles. Task P2-E (QA inject) + P2-F (dev fix).

7. **G11: 2-trial coupling proof.** Trial-1 = P2-E/F alias (direction-arrow mutation triggers analysis-vm.test.ts RED if coupled). Trial-2 = signal-type-label.ts mutation (cascade→CHAIN). Each: ≥1 coupled scenario RED + single-edit fix. Task P2-G.

8. **9 tasks (P2-A→P2-Z), strictly sequential WIP=1.** ~5h dev+qa+ops effort. No USER-gated steps. Pre-revert tags: frontend-pre-ci (P2-A), frontend-pre-inject (P2-E).

**Files authored this cycle (3):**
1. `docs/architecture-briefs/2026-05-22-refactor/scale/frontend-phase-2-task-plan.md` (NEW — 9 tasks, READY-FOR-DISPATCH)
2. `docs/data/pilot-status-frontend.json` (phase2 block: skeleton_in + taskPlan + taskCount + wipPolicy pointers set; NO goal flips)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags:**
- R-LOW: G4 fence false-green trap (documented) — deliberate-violation proof is MANDATORY; a fence exiting 0 without the violation test is NOT a pass.
- R-LOW: Trial-1 coupling may not trigger analysis-vm.test.ts RED (if view-model test doesn't assert on the ↑ symbol character). Fallback Trial-1 designed: change-pct ↑→+ mutation which DOES propagate to analysis-vm assertion.
- R-LOW: Container rebuild may be needed after G4 devDep change — ops confirms at P2-H. Phase-2 code changes are devDep-only and should not change the built Remix bundle.

**Next actor:** pm — break into dev-frontend + qa + ops handoffs. dev-frontend: P2-A+B+C+F. qa: P2-C+D+E+G+Z. ops: P2-H. PO: terminal atomic flip after P2-Z.

---

## MD-EXTRACT-6 AUGMENTATION — Mid/Leading Empty-Cell Reconciliation (2026-05-26T12:30Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-6 targeted augmentation (same design task, NOT a new attempt number). Main-terminal verified §8 drift>gap proof is SOUND. Gap identified: pure ordinal rank-alignment silently corrupts on mid-column and leading-column empty cells — a missing cell at row-k shifts all cells below it up one rank in that column.

**Failing scenario (concrete):** 3 columns × 3 physical rows, col-1 missing row-1. Pure ordinal: col-1 sorted tokens [(top=103,"B1"),(top=143,"B3")] → rank-0="B1", rank-1="B3". grid[1][1]="B3" (WRONG — should be " "); grid[2][1]=" " (WRONG — should be "B3"). The rank-shift corrupts silently: AC-6-SEG checks only the revenue row (rank-0, always present in all columns), and AC-6-INC checks row COUNT + codes-per-row — neither detects value misalignment in rows below rank-0. False-green risk was live.

**Step C8.5 — `_insert_skip_slots` algorithm:** After Step C8 sort, per column: compute local_pitch = median(consecutive top-deltas). Walk consecutive tokens; if delta > SKIP_GAP_FACTOR × local_pitch, insert ceil(delta/local_pitch)-1 None sentinel slots. Degenerate 2-token column: use ref_pitch = median(local_pitch_c for columns with ≥3 tokens). `SKIP_GAP_FACTOR = 1.5` (generic geometry, AC-0 compliant). Leading-column skip = KNOWN LIMITATION (documented §13.4).

**AC-6-SKIP fixture:** SKIP-MID: col-1 missing row-1; delta=40 > threshold=30 → 1 None slot; grid[1][1]=" ", grid[2][1]="B3". SKIP-TRAILING: delta=20 < 30 → no slot; regression proof.

**Files modified:** (1) bctc-md-table-generic-table-detection.md §3.1/§4/§5/§9/§10/§11/§12/§13 (2) TASK_BCTC-MD-TABLE.md §MD-EXTRACT-6 updated (3) this notebook.

**Risk flags:** R-MEDIUM: 2-token col degenerate → ref_pitch fallback. R-LOW: leading-column skip = known limitation. R-LOW: SKIP_GAP_FACTOR=1.5 may trigger on sparse pages.

**Next actor:** main-terminal re-traces AC-6-SKIP SKIP-MID by hand → commit → dispatch dev-pdf-extractor MD-EXTRACT-6.

---

## MD-EXTRACT-6 — Column-Anchor-First Ordinal Reconstruction (2026-05-26T10:45Z) — DESIGN COMPLETE

**Task:** MD-EXTRACT-6. Recurring-bug escalation: 5 scalar-y-tolerance attempts all produce same diagonal failure on wide tables. Root cause: within-row x-drift (28px) > inter-row gap (16px) on FPT segment report/income statement. No y-threshold can separate rows. Scalar-y family structurally exhausted.

**Chosen approach: Column-Anchor-First Ordinal Reconstruction.** Assign NUMBER tokens to nearest x-column-anchor by argmin. Within each column, sort by top → ordinal rank. Reconstruct grid by rank alignment. Cross-column y-comparison NEVER occurs → diagonal structurally impossible.

**§8 fixture proof:** 10 tokens, drift=16px, gap=2px. Ordinal trace: total_rows=2. CORRECT. MD-EXTRACT-5 on same fixture: row_pitch=0 → tol=4 → 5+ rows (diagonal failure).

**New functions:** `_assign_tokens_to_columns`, `_build_ordinal_grid`, `_attach_labels_ordinal`. Constants: `LABEL_BAND_FACTOR=1.5`, `_COL_ASSIGN_MAX_DIST_FACTOR=3.0`, `_MIN_WORD_CONF_ORDINAL=30`. Functions retired (DEAD): `_cluster_number_rows_adaptive`, `_attach_labels`, `_build_grid_from_number_rows`.

**Mandatory diagnostic gate (STEP 1):** Dev runs `diagnostic_gate_md6.py` against FPT pages 8 + 22 before writing code. Pass: row_pitch < 8px AND drift/gap > 1.0.

**Files authored:** (1) bctc-md-table-generic-table-detection.md §MD-EXTRACT-6 (2) TASK_BCTC-MD-TABLE.md §MD-EXTRACT-6 (3) this notebook.

**Risk flags:** R-HIGH: noise tokens inflate total_rows (mitigated by _MIN_WORD_CONF_ORDINAL=30). R-HIGH: label y_med_k miss on skewed pages (fallback: nearest TEXT within 2.5×h_med). R-MEDIUM: close column anchors → code+value merge (mitigated by _COL_ASSIGN_MAX_DIST_FACTOR).

**Next actor:** main-terminal re-traces §8 fixture proof → commit brief → dispatch dev-pdf-extractor MD-EXTRACT-6.

---
