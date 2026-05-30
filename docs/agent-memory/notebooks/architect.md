# Architect — Notebook

**Last updated:** 2026-05-30T20:45 UTC | **Sprint:** BCTC-TRUST-RED

[3 most recent cycles retained below. Archive in git history.]

## BCTC-TRUST-RED (2026-05-30T20:45 UTC) — DESIGN COMPLETE

**Sprint:** BCTC-TRUST-RED

**Root cause split (3 independent seams):**

RC-0 — `pushBctcRefinedUnitTool.ts` has no ingest gate. Any caller can push digit-run values with high confidence and `window_status='DONE'` unconditionally. The FPT + ACB contamination entered this seam.

RC-1 — Confidence in `bctc_refined_units` measures OCR legibility (Haiku self-report), not semantic validity. Neither `parseTrustFlag` nor `bctc_balance_checks` can detect ordered-digit fabrication or gross_profit=net_revenue. The three-way prior-period revenue contradiction (16,058 / 11,481 / 20,225 tỷ) was never checked.

RC-2 — Coverage gaps (opex codes 11/24/25/26, equity/liab decomposition, CF pages 9/10/16) are extraction deficiencies, not trust failures. Routed to BCTC-LAYOUT-FIRST as acceptance criteria.

**TR-0 seam:** `pushBctcRefinedUnitTool.ts` (ingest gate calling new domain validator) + `bctcFullTools.ts` (publish guard: PUB-1 through PUB-4).

**TR-1 seam:** Two new domain services:
- `bctcSanityValidator.ts` — DT-1 digit-run detector; called at ingest; BLOCK writes `window_status='REJECTED_SANITY'`.
- `bctcMagnitudeValidator.ts` — DT-2 (gross=net_rev BLOCK), DT-3 (cross-stmt revenue contradiction BLOCK); called in `finalizeBctcRefineTool.ts` after parse, before INSERT; BLOCK writes `refine_status='REJECTED_SANITY'`, skips `bctc_table_rows` insert.

**TR-2 disposition:** BCTC-LAYOUT-FIRST acceptance criteria. PM adds 4 LF-QA gate assertions.

**New schema value REJECTED_SANITY:** additive to TEXT columns `refine_status` and `window_status`. No ALTER TABLE.

**Publishable definition (PUB-1 to PUB-4):** refine_status IN (DONE,PARTIAL) + non-empty bctc_table_rows + balance_sheet has non-summary children + no REJECTED_SANITY units. All 4 checked in `checkPublishability()` helper added to `bctcFullTools.ts`.

**Purge:** one-time SQL for FPT (e8ea3df5…) + ACB (dev must query UUID first). Resets to `refine_status='PENDING'`; deletes `bctc_refined_units` + `bctc_table_rows` for both reports.

**QA mandate:** 6-case test file `TRUST-RED-sanity-gate.test.ts`. DB arbiter = `new Database(':memory:')` direct COUNT query. Never HTTP echo alone.

**Files:** CREATE 3 (bctcSanityValidator.ts, bctcMagnitudeValidator.ts, TRUST-RED-sanity-gate.test.ts); MODIFY 4 (pushBctcRefinedUnitTool.ts, finalizeBctcRefineTool.ts, bctcFullTools.ts, schema-financial-reports.ts DDL comment).

**Brief:** `docs/architecture-briefs/2026-05-30-bctc-trust-red.md`
**Zone:** `apps/mcp-server/` only. dev-pdf-extractor: 0-diff. PDF-Extract-Kit subtree: pristine.

---

## AIT-ARCH (2026-05-30T19:30 UTC) — DESIGN COMPLETE

**Sprint:** BCTC-AI-INPUT-TAB

**PNG-serving decision (binding):** mcp-server reads PNG directly from the shared named volume (`bctc-page-images:/data/bctc-page-images`). Path formula: `/data/bctc-page-images/{reportId}/page_{0001}.png`. No proxy to pdf-extractor. Rationale: volume already mounted in mcp-server (proven by `getBctcPageImageTool.ts` using same `readFileSync` pattern as `handleBctcInspectPdf`).

**Two new handlers** added to `bctcInspectHandler.ts` (additive exports, no new file):
- `handleBctcInspectPageImage` — GET `/api/bctc-inspect/page-image/{docId}?page=N` → raw image/png bytes or 404
- `handleBctcInspectPageWindow` — GET `/api/bctc-inspect/page-window/{docId}?page=N` → `bctc_refined_units` window JSON

**OCR text reuse decision:** The `aiinput` tab reads from `lastOcrData` JS variable (already populated by `renderOcr()` on every `navigateToPage`). No new OCR endpoint.

**Routing call:** Direct to `dev-mcp-server`. Skip BA/PM — design fully specified, single zone, two handlers, one tab.

**Anti-false-green gate:** `AIT-DEV-1.test.ts` — PNG magic-byte check (not echo), 404-on-miss, 400-on-bad-UUID, page-window hit/miss, HTML structure regression (7th tab button + all 6 existing). RED-before/GREEN-after in same commit.

**Brief:** `docs/architecture-briefs/2026-05-30-bctc-ai-input-tab.md`

---

## HC-ARCH-2 (2026-05-30) — TRANSACTION ORDERING ROOT-CAUSE RULING (QA-2 ESCALATION)

**Task:** HC-ARCH-2. Recurring-bug-escalation on `finalizeBctcRefineTool.ts` Gate 3 — 2nd QA fail.

**Root cause (one sentence):** `reAnchorCorrections` runs while both the old pinned row (preserved by selective DELETE) AND the new parser row co-exist for the same stable key, giving `matches.length=2` → false `anchor_ambiguous`.

**Canonical order (binding):**
1. Record pinnedRowIds
2. Selective DELETE (preserve pinned old rows)
3. INSERT parser rows (applyCorrections already applied)
4. DELETE old pinned rows  ← MOVED BEFORE reAnchorCorrections
5. reAnchorCorrections     ← now sees exactly 1 row per corrected label
6. UPDATE refine_status

**One-line fix:** swap steps 4 and 5 in the transaction block of `finalizeBctcRefineTool.ts`. No other file changes.

**Tests:** DV-HC-8 amended (add `anchor_status='ok'` + `COUNT==1` assertions). DV-HC-14 new (genuine-ambiguous full-transaction test). Same commit as fix. RED-before/GREEN-after mandatory.

**Genuine-ambiguous safe-fail:** not regressed. Step 4 only deletes OLD pinned rows. If parser emits 2 rows with same stable key (final-set duplicate), both survive → reAnchorCorrections sees 2 → anchor_ambiguous. Correct.

**Addendum:** `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md` §ADDENDUM HC-ARCH-2
**Routing:** dev-mcp-server only. `finalizeBctcRefineTool.ts` + `HC-human-confirm.test.ts`. Do NOT touch `bctcHumanCorrectionsStore.ts`.

---

## BCTC-HUMAN-CONFIRM HC-ARCH (2026-05-30T11:00 UTC) — DESIGN COMPLETE

**Task:** HC-ARCH. Architecture brief for BCTC human-in-the-loop correction layer.

**ARCH-DECIDE A:** Post-pass override (Option A2). `applyCorrections()` private helper at `finalizeBctcRefineTool.ts` call site, keyed by `${label}||${page_number}||${statement_section}||${code ?? ''}`. `parseTrustFlag` exported from `refinedMarkdownParser.ts` (7-char additive, 0 logic change). Parser internals 0-diff.

**ARCH-DECIDE B:** Stable key = `(report_id, label, page_number, statement_section, code_or_null)`. `reAnchorCorrections()` in new `bctcHumanCorrectionsStore.ts`. Genuinely ambiguous anchor (duplicate label+code+page+section) → `anchor_status = 'anchor_ambiguous'` (safe-fail, correction not applied). DV-HC-11/12 prove the guard.

**Key gap found (BCTC-AGENTIC-REFINE residual):** `finalizeBctcRefineTool.ts` lines 143-165 INSERT omits `source_confidence` (parser populates it but it was dropped at accumulator + SQL level). Fix bundled into HC-DEV-2 scope. DV-HC-9 regression covers it.

**Key gap found:** `parseTrustFlag` in `refinedMarkdownParser.ts` (line 92) is not exported. Must export for `bctcFlagEnumerationService.ts` to reuse without duplication.

**File-list delta:** 9 CREATE (dev-mcp-server), 8 MODIFY (dev-mcp-server), 1 MODIFY (agent-father: `docs/agents/refine_bctc_md/flow/main.md`). 0 deletes.

**Cron survival — two layers confirmed:**
1. `getBctcPendingRefineTool.ts` WHERE clause filters `confirm_status != 'CONFIRMED'` at source (primary guard).
2. `finalizeBctcRefineTool.ts` Layer 1 + Layer 2 guards (belt-and-suspenders + cell-level pin in single transaction).

**Brief:** `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md`
**Handoff:** `docs/handoffs/HC-ARCH.md`

---

## BCTC-AGENTIC-REFINE AR-ARCH-INVOKE (2026-05-30T09:30 UTC) — AMENDMENT 3 COMPLETE

**Task:** AR-ARCH-INVOKE. Rule on subagent invocation mechanism (§0.6 both options proven non-runnable at runtime). Blocking architecture decision.

**Blocker confirmed:** `bctcRefineJob.ts` calls `spawn("claude", ...)` → ENOENT in-container. claude CLI absent in Bun/TS mcp-server container. All windows FAILED, row_count=0.

**Decision: Option Y — host-level fleet cron (binding).** Reasoning:
- spawn("claude",...) and Workflow-style parallel map are BOTH non-runnable in the container runtime.
- Option X (in-container Anthropic Messages API) violates "keep running claude code" user directive; discards Opus-authored flow files (dead letters); embeds model invocation in a data microservice (DDD violation).
- Option Y honors all three user directives: fleet CC session is the substrate; Opus-authored flows execute as-authored; CC Agent/Task = exact parallel Haiku fan-out per user intent.

**Key changes from ruling (§0.7):**
1. `spawn("claude",...)` block DELETED from `bctcRefineJob.ts`.
2. `runBctcRefineJob()` cron entry REMOVED; `cronConfig.ts` entry REMOVED.
3. `partitionIntoWindows()` + `runBoundedPool()` migrated to `application/utils/`.
4. Three new MCP tools: `get_bctc_pending_refine`, `push_bctc_refined_unit`, `finalize_bctc_refine`.
5. New fleet cron skill: `.claude/commands/crons/cron-refine-bctc.md` → `run docs/agents/refine_bctc_md/flow/main.md`.
6. Agent-father Task A output contract: subagent returns structured JSON via CC Task result, NOT writes to `docs/refine-output/` filesystem. Fleet cron collects and calls `push_bctc_refined_unit` per window.
7. PREREQ-3 (critical, unblocks OPS): remove `bctcRefineJob` cron key from `cronConfig.ts` immediately to stop the ENOENT failure loop.

**DV anti-false-green (§0.7.5):** end-to-end proof required — get_bctc_pending_refine returns a seeded report; after full cron run, bctc_refined_units COUNT=windows.length with ≥1 DONE; after finalize, bctc_table_rows has non-null label + numeric value_current.

**Brief amended:** `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (amendment x3, §0.7 added).

---

## BCTC-AGENTIC-REFINE (2026-05-30T08:45 UTC) — DESIGN COMPLETE

**Task:** AR-ARCH. Architecture brief for BCTC agent refine step replacing geometry middle.

**Key decisions:**

1. **Replace-outright confirmed:** `bctc_page_grouper.py` deleted + YOLO grouping removed from `pek_engine_adapter.py` + geometry stitching from `generic_md_table_extractor.py`. 3 orphan test files deleted. `text_table_extractor.py` 0-byte-diff.

2. **Model tier:** Haiku at runtime (claude-haiku-3-5). Opus is authoring-time only (agent-father writes 4 focused sub-flows; Haiku executes per page). No live Opus.

3. **Four sub-flows:** table-page / prose-page / continuation-stitch / disagreement-verify. Each narrow, self-contained, includes Vietnamese worked examples so Haiku cannot drift.

4. **Schema drift caught:** BA spec used `row_label` / `value_previous` but live `bctc_table_rows` schema uses `label` / `value_prior`. Parser `BctcTableRow` type must use live column names.

5. **`text_status` not in live schema:** must be added via idempotent ALTER TABLE migration with default `'COMPLETE'` for existing rows (existing rows have complete OCR in pdf_extracted_text).

6. **`BCTC_PAGE_TEXT_BACKEND` env var** (new, distinct from existing `OCR_TEXT_BACKEND` which is for cell recognition). Default `sqlite`.

7. **DPI:** 150 default, QA bake-off at 100/120/150. Page cap: 3 images per call.

8. **`classify_page_for_image_load`:** absorbed from page-grouper constants into mcp-server application layer. No surviving import of bctc_page_grouper anywhere.

9. **Volume mount:** `bctc-page-images` named volume shared between pdf-extractor (write) and mcp-server (read). Docker Compose ops prereq before dev work.

10. **Idempotency:** DELETE-then-INSERT transaction for both `bctc_refined_units` and `bctc_table_rows`. FPT-42 dupes guard proven by ≥3× run test.

**Risks flagged:** schema column name drift (resolved); `text_status` missing (resolved by migration); LF-OVERLAY viewer not updated in this sprint (backlog flag for PM); DV tests mandatory in same commit as production code.

**Brief:** `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md`

---

## BTB-DRIFT (2026-05-30T01:30 UTC) — DESIGN COMPLETE

**Task:** BTB-DRIFT-ARCH. Convergence design for dual-path grouping drift (PATH A `build_document_map` / PATH B `_group_bboxes_into_units`).

**Key decisions:**

1. **PATH TRACE CONFIRMED:** `/extract-layout-first` is a LIVE SPRINT ASSET (BCTC-LAYOUT-FIRST LF-EXTRACT open). Cannot be deleted. PATH B (`pek_engine_adapter.py:L751`) is sole live user-facing grouper. Shared core module approach (not kill) is the only structurally correct option.

2. **Design: new `infrastructure/bctc_page_grouper.py`** — SSOT: `PageDescriptor`, `UnitDescriptor`, `group_pages_into_units()`. Contains the D-5 predicate (`_is_title_band`) and `_is_continuous` (wraps `_fingerprints_continuous` logic). Both PATH A and PATH B call this shared function. `_group_bboxes_into_units` DELETED from `pek_engine_adapter.py`.

3. **8-page cap REMOVED** — replaced by the `_is_continuous` geometric predicate (gutter_count, gutter_x_fractions within 5%, row_pitch within 50%, D-5 title-band). A >8-page real table stays open (geometry identical → CONTINUE). Two distinct adjacent tables split (geometry differs → TABLE_NEW). This is structurally correct vs. blunt count proxy.

4. **Prose units emitted in PATH B.** `units_output` loop in `_run_extraction` emits `{stitched_markdown:"", row_count:0, quarantined:False, page_type:"prose"}` for prose UnitDescriptors. Push handler confirmed path-agnostic (0-diff in mcp-server).

5. **D-5 active in PATH A (has OCR text), silent in PATH B** (`stored_text=""` → `_is_title_band("")` = False; documented limitation in handoff).

6. **Anti-drift tests:** AD-2 asserts `_group_bboxes_into_units` does NOT exist in `pek_engine_adapter` after fix. AD-1 proves both paths produce identical unit boundaries from the same input. DV-1-B and DV-2-B and 9-page regression run through `group_pages_into_units()` directly.

**Files authored:**
1. `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md` — NEW
2. `docs/handoffs/BTB-DRIFT.md` — NEW
3. `docs/agent-memory/notebooks/architect.md` — this entry
4. `docs/TASKS.md` — BTB-DRIFT architect step marked done

**ops_rebuild_required:** yes (after dev commits BTB-DRIFT-DEV) — BATCHED with `60dfac7f` idempotency + BTB-UNBLOCK runtime mandate.

---

## DATA-PIPELINE-INTEGRITY (2026-05-30T00:00 UTC) — DESIGN COMPLETE

**Task:** DPI-ARCH. 4-bug brownfield design for macro data correctness (FX dual-path, stale computedAt, Brent/Gold zero delta, foreign-flow data loss).

**Key decisions:**

1. **DPI-1 — Option A canonical SBV:** New `SBVRateSQLiteAdapter` in `repositories.go` follows `SQLiteCommodityRepository` pattern (DB_PATH env, read-only, 6h staleness guard, safe-degrade 0). `Execute()` gains ~4-line SBV priority override after `resolveMarketPrices()`. DI wiring: one line change in `main.go`. Yahoo USDVND demoted (not removed — still feeds OIL/GOLD path).

2. **DPI-2 — delete const, inline `time.Now()`:** `fixtureComputedAt` constant deleted. `computedAt := time.Now().UTC().Format(time.RFC3339)` added as local var in `Execute()`. `time` already imported. No test currently asserts on the frozen value — dev must confirm with grep before removing const.

3. **DPI-3 — pre-transaction prev-close read:** Two separate SELECT queries on `commodity_prices_history WHERE fetched_at < snapshot.fetchedAt ORDER BY fetched_at DESC LIMIT 1` before `runTransaction()`. `computeDelta()` private helper. `upsertMacroPrice` SQL updated to include `change_amt, change_pct` in INSERT and ON CONFLICT UPDATE branch. USDVND excluded per FR-DPI-3d.

4. **DPI-4 — UPSERT + race fix mandatory:** `ohlcvForeignFlowStore.ts` UPDATE replaced with `INSERT…ON CONFLICT(code, date) DO UPDATE SET` for foreign flow cols. Stub row uses `close=0` to satisfy `NOT NULL` constraint. CRITICAL: `server.ts:1078` `INSERT OR REPLACE` is row-destructive — will wipe stub foreign flow on next OHLCV push. Must be changed to `ON CONFLICT DO UPDATE SET` (preserving foreign flow cols). `taOhlcvBackfillJob.ts` also uses INSERT OR REPLACE — dev must audit.

5. **Rebuild order:** mcp-server first (writes fresh change_pct + enables foreign-flow stubs), then macro-indicators (reads change_pct from market_prices; SBV rate from sbv_rates).

**Files authored:**
1. `docs/handoffs/DPI-ARCH.md` — NEW
2. `docs/agent-memory/notebooks/architect.md` — this entry
3. `docs/TASKS.md` — DPI-ARCH marked done

**ops_rebuild_required:** yes — both containers; mcp-server before macro-indicators.

---

## BCTC-TABLE-BOUNDARY (2026-05-29T19:30 UTC) — DESIGN COMPLETE

**Task:** BTB-ARCH. Replace greedy-merge stitcher in `generic_md_table_extractor.py` with a per-page boundary state machine.

**Key decisions:**

1. **Four root causes surfaced in one pass** (fail-loud audit):
   - Cause A: `_flush_unit` L2641 majority-vote type assignment → prose pages absorbed into table unit.
   - Cause B-1/B-2: `_fingerprints_continuous` L3000 no intervening-prose state and no D-5 title-band check.
   - Cause C: `_fingerprints_continuous` geometry-only; two same-layout tables with a title between them merge.
   - Cause D: blank bridge L2664 unconditional — no far-side page-type lookahead.

2. **State machine:** 5 states (NO_TABLE / TABLE_START / TABLE_CONTINUE / TABLE_END / TABLE_NEW). Implemented via `pending_blanks` deferred buffer (Option B — single-pass). Blank pages buffered; drained into current unit only on CONTINUE decision; discarded on END/NEW.

3. **`_flush_unit` fix:** Replace 9-line majority-vote with 2-line schema-page type lookup. `current_unit_pages[0]` fingerprint determines type. Prose pages never enter `current_unit_pages` for a table unit.

4. **`_fingerprints_continuous` extension:** New optional `stored_text_b: str = ""` param (backward-compat). D-5 title-band check added before `return True`.

5. **`_is_title_band` helper:** New function. Top-8-line scan. Non-numeric standalone line = title. `"tiếp theo"` / `"(continued)"` = returns `False` immediately. No new imports needed (`re` + `_MONEY_GROUP_RE` already available).

6. **`extract_layout_first_usecase.py`: NO changes.** DocumentMap shape identical; orchestration unaffected.

7. **DV tests mandate RED-before-GREEN:** DV-1 (`[table, prose, table]` → 3 units not 1) and DV-2 (`_fingerprints_continuous` with title text → `False`). Anti-false-green (fence_false_green lesson).

**Files authored:**
1. `docs/architecture-briefs/2026-05-29-bctc-table-boundary.md` — NEW
2. `docs/handoffs/BTB-ARCH.md` — NEW
3. `docs/agent-memory/notebooks/architect.md` — this entry

**ops_rebuild_required:** yes (after dev commits).

---

[Older entries archived to git history — 3-cycle retention enforced]
