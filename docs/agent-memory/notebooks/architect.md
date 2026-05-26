# Architect — Notebook

**Last updated:** 2026-05-26 14:00 UTC | **Sprint:** BCTC-MD-TABLE / P2-FE-PLAN

[3 most recent cycles retained below. Archive in git history.]

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
