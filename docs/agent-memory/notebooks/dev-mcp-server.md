# dev-mcp-server -- Notebook

## c333 · 2026-05-30 (BCTC-HUMAN-CONFIRM HC-DEV-4) — COMMITTED dca93898

**Task:** HC-DEV-4 — MCP tools #145/#146 + registry wiring

**2 new tool files created:**
- `listFlaggedBctcCellsTool.ts` — MCP tool #145 `list_flagged_bctc_cells`; thin wrapper → `bctcFlagEnumerationService.enumerateFlaggedCells`; Zod UUID input; `buildListFlaggedBctcCellsHandler(dbOverride?)` for testability
- `submitBctcCorrectionTool.ts` — MCP tool #146 `submit_bctc_correction`; thin wrapper → `bctcCorrectionService.submitCorrection`; Zod schema rejects non-UUID / non-integer / non-numeric inputs; `buildSubmitBctcCorrectionHandler(dbOverride?)` for testability

**registry.ts:** 2 new imports + 2 array entries at end (#145, #146). Array now 103 entries (was 101).

**financial-reports/index.ts:** 4 barrel export lines added (2 functions + 2 types).

**DV tests:** 52 pass, 0 fail (+10 new tests). tsc: 0 errors.
- DV-HC-10b: submit_bctc_correction MCP tool persists to both tables (direct DB read); 409 on CONFIRMED; Zod rejects bad UUID / non-integer row_id
- list_flagged_bctc_cells: returns matching flags; empty list (not error) on no flags (AC-FR8-2); Zod rejects bad UUID
- Registry: `includes()` confirms both functions in toolRegistry; length ≥ 103

**Pattern:** followed build*Handler(dbOverride?) + register*Tool(server: McpServer) pattern from getBctcPendingRefineTool.ts. Services are shared (zero duplication with HTTP handlers).

**NEXT:** HC-DEV-6 (bctc-inspector.html panel); QA gate on full sprint.

## c332 · 2026-05-30 (BCTC-HUMAN-CONFIRM HC-DEV-3) — COMMITTED ae3c5039

**Task:** HC-DEV-3 — HTTP route handlers + server dispatch

**3 new handler files created:**
- `bctcFlagsHandler.ts` — GET /api/bctc-inspect/flags/{doc_id}: UUID-validates docId; 404 if report not found; delegates to enumerateFlaggedCells; 200 with FlagEnumerationResult
- `bctcCorrectHandler.ts` — POST /api/bctc-inspect/correct/{doc_id}: parses JSON body {row_id, new_value}; delegates to submitCorrection; returns 409/400/200
- `bctcConfirmHandler.ts` — POST /api/bctc-inspect/confirm/{doc_id} + /reset: direct DB UPDATE confirm_status; idempotent confirm; reset preserves bctc_human_corrections (AC-FR3-2)

**server.ts dispatch:** 4 new route entries added after /zones/ handler (before / info block):
- GET /api/bctc-inspect/flags/{doc_id}
- POST /api/bctc-inspect/correct/{doc_id}
- POST /api/bctc-inspect/confirm/{doc_id}
- POST /api/bctc-inspect/confirm/{doc_id}/reset (path-split on "reset" suffix)

**DV tests:** 42/42 GREEN. HC-DEV-3 adds DV-HC-1, DV-HC-2, DV-HC-4, DV-HC-5, DV-HC-6 (+12 vs 30 baseline).
- DV-HC-1: red flag exact ocr_value/image_value strings from seeded markdown
- DV-HC-2: yellow flag null ocr_value/image_value
- DV-HC-4: 409 on CONFIRMED report; 400 on invalid JSON; 400 on wrong input types
- DV-HC-5: CONFIRMED written to DB (direct read); idempotent re-confirm; 400 invalid UUID
- DV-HC-6: PENDING reset clears timestamp; corrections count unchanged; 400 invalid UUID
tsc: 0 errors.

**NEXT:** HC-DEV-4 (MCP tools: listFlaggedBctcCellsTool, submitBctcCorrectionTool + registry.ts); HC-DEV-6 (viewer panel now unblocked)

## c331 · 2026-05-30 (BCTC-HUMAN-CONFIRM HC-DEV-2) — COMMITTED 89100e07

**Task:** HC-DEV-2 — Layer 1+2 cron-survival guards + source_confidence INSERT fix

**Layer 1 — getBctcPendingRefineTool.ts:**
- Added `AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')` to WHERE clause
- CONFIRMED reports never appear in the refine queue (primary guard)

**Layer 2 — finalizeBctcRefineTool.ts (5 changes):**
- Entry guard: reads confirm_status → returns `{ok:true, skipped:true, reason:"confirmed"}` immediately for CONFIRMED reports
- applyCorrections() post-pass helper (ARCH-DECIDE A Option A2): overlays corrections BEFORE INSERT loop; key = `${label}||${page_number}||${statement_section}||${code??''}`; parser 0-diff
- Selective DELETE: `DELETE WHERE report_id=? AND id NOT IN (SELECT row_id FROM bctc_human_corrections)` — corrected rows preserved
- source_confidence added to INSERT column list + values — latent bug fixed (was silently dropped since BCTC-AGENTIC-REFINE)
- reAnchorCorrections() called inside the SQLite transaction after INSERT (EC-7 prevention)

**Parser:** parseTrustFlag already exported from HC-DEV-1 — 0-diff confirmed.

**DV tests:** HC-human-confirm.test.ts 30/30 GREEN (+5 HC-DEV-2 tests vs 25 baseline).
- DV-HC-3-Layer1 (confirmed excluded from pending refine x2 cases)
- DV-HC-7 (finalize CONFIRMED → skipped:true, rows unchanged, refine_status unchanged)
- DV-HC-8 CORE INVARIANT (corrections survive re-parse: corrected=2500+conf=1.0; uncorrected=0.4 yellow)
- DV-HC-SC (red=0.2, yellow=0.4, clean=1.0, corrected=1.0 — all persist in DB)
tsc: 0 errors.

**NEXT:** HC-DEV-3 (HTTP route handlers), HC-DEV-4 (MCP tools)

## c330 · 2026-05-30 (BCTC-HUMAN-CONFIRM HC-DEV-1) — COMMITTED 4c40939c

**Task:** HC-DEV-1 — Foundation layer for sprint BCTC-HUMAN-CONFIRM

**Schema migrations (3 idempotent blocks, PRAGMA-first guard):**
- ALTER bctc_table_rows ADD source_confidence REAL NOT NULL DEFAULT 1.0
- ALTER financial_reports ADD confirm_status TEXT NOT NULL DEFAULT 'PENDING' + final_confirmed_at + confirmed_by
- CREATE TABLE IF NOT EXISTS bctc_human_corrections (UNIQUE(report_id,row_id) + idx_bhc_stable_key)

**Infrastructure:**
- NEW bctcHumanCorrectionsStore.ts: 5 public functions (upsertCorrection, getCorrectionsForReport, getCorrectionsMap, hasCorrection, reAnchorCorrections). ARCH-DECIDE B: anchor key = (label||page_number||statement_section||code). anchor_ambiguous safe-fail: no mis-attach when >1 rows match.

**Application:**
- NEW bctcFlagEnumerationService.ts: enumerateFlaggedCells — scans bctc_refined_units.markdown via parseTrustFlag, joins to bctc_table_rows, hydrates corrections. EC-3 guard (refine_not_complete). Red flag OCR/image regex extractor.
- NEW bctcCorrectionService.ts: submitCorrection — UUID+int validation, 409 CONFIRMED guard, 400 row_not_found, transactional upsertCorrection + UPDATE source_confidence=1.0. Shared by HTTP + MCP.

**Utils:** exported parseTrustFlag + TrustFlagResult from refinedMarkdownParser (7-char additive, 0 logic diff).

**DV tests:** HC-human-confirm.test.ts 25/25 GREEN. tsc: 0 errors.
DV-HC-9 (idempotency x2), DV-HC-10 (service + both-table writes), DV-HC-11 (code disambiguator), DV-HC-12 (anchor_ambiguous), DV-HC-13 (idempotency x3).

**BLOCKS UNBLOCKED:** HC-DEV-2, HC-DEV-3, HC-DEV-4 can now start.

## c329 · 2026-05-30 (BCTC-AGENTIC-REFINE AR-PREREQ-3 + AR-MCP-OPTY) — COMMITTED a1cb486e + 47c9f328

**Tasks:** AR-PREREQ-3 (stop-the-bleed cron removal) + AR-MCP-OPTY (3 fleet-cron MCP tools)

**Summary:** Option-Y ruling (§0.7.2): mcp-server becomes pure data service. Orchestration moves to host-level fleet cron.

**Step A (AR-PREREQ-3, commit a1cb486e):**
- Deleted `bctcRefineJob` key from `cronConfig.ts`
- Deleted import + cron registration from `startScheduler.ts`
- Stops active ENOENT failure loop (spawn("claude") in container with no claude CLI)

**Step B (AR-MCP-OPTY, commit 47c9f328):**
- NEW `application/utils/windowPartitioner.ts` — partitionIntoWindows() migrated
- NEW `application/utils/boundedPool.ts` — runBoundedPool() migrated
- MODIFIED `bctcRefineJob.ts` — production spawn path deleted, runBctcRefineJob() deleted, utilities re-exported
- NEW `getBctcPendingRefineTool.ts` — tool #142: get_bctc_pending_refine
- NEW `pushBctcRefinedUnitTool.ts` — tool #143: push_bctc_refined_unit (INSERT OR REPLACE idempotency)
- NEW `finalizeBctcRefineTool.ts` — tool #144: finalize_bctc_refine (Phase-4 collect-then-write)
- MODIFIED `registry.ts` — 3 imports + 3 array entries
- MODIFIED test file — push_tool_pathway describe block (6 DV scenarios)

**DV RED→GREEN:** 13/13 pass. tsc: 0 errors. No spawn() in production.

**ops_rebuild_required: true** — next sprint task AR-OPS-REBUILD will rebuild container.

## c328 · 2026-05-30 (DATA-PIPELINE-INTEGRITY DPI-FU-D) — COMMITTED d7ee43d7

**Task:** DPI-FU-D — SBV fetcher must reject zero-value deposit-rate writes

**Root cause:** `storeSbvSnapshot` in `sbv.ts` did unconditional INSERT OR REPLACE. When the fetcher returned `maxDepositRatePct=0` (parse miss / upstream SBV gap), the good prior row (5.0 from 2026-05-29T23:15Z) was silently overwritten with 0. `sbvRatesJob.ts` had no pre-flight guard — it passed any snapshot straight to store.

**Fix layers (defence-in-depth):**
1. `sbvRatesJob.ts` — pre-flight `detectZeroSentinelFields()` check BEFORE calling store. If any sentinel field (max_deposit_rate_pct, usd_vnd_official, overnight_rate_pct, refinancing_rate_pct, max_lending_rate_pct) is ≤0: alert WORK channel, return `zeroRateSkipped=true`, skip store entirely.
2. `sbv.ts storeSbvSnapshot` — persistence-boundary guard: reads prior row, detects zero-overwrite risk on same 5 sentinel columns, returns `{skipped: true, zeroColumns}` and logs ERROR without touching DB. First-ever writes (no prior row) always accepted.
3. NOT guarded: `interbank_overnight_pct` (legitimately 0 on holiday), `discount_rate_pct` (conservative scope).

**Files changed (3):**
- MOD: `src/infrastructure/fetchers/sbv.ts` — `storeSbvSnapshot` now returns `{skipped, zeroColumns}`, reads prior row, guards sentinel columns
- MOD: `src/scheduler/macro/sbvRatesJob.ts` — pre-flight zero-sentinel check, WORK alert, `zeroRateSkipped` result field
- NEW: `src/__tests__/DPI-FU-D-sbv-zero-deposit-guard.test.ts` — 7 tests (DFD-01..07)

**RED→GREEN evidence:**
- Before fix: 3 pass / 4 fail (DFD-01, 02, 05, 07 failed)
- After fix: 7 pass / 0 fail
- Existing SBV suite (028 + sbvRatesJob + 1497): 29→36 pass / 0 fail

**Gates:** tsc EXIT 0 | 36 SBV tests GREEN | tool count 151 (unchanged) | scheduler count 71 (unchanged)

**ops_rebuild_required: true** — mcp-server container rebuild required. Next good SBV fetch (every 4h, cron `0 */4 * * *`) will auto-restore deposit rate once upstream SBV XML is healthy.

**DB verification ops/qa should run post-rebuild:**
```sql
-- Confirm deposit rate is positive (not 0 and not fixture 4.7)
SELECT max_deposit_rate_pct, fetched_at FROM sbv_rates WHERE source = 'sbv';
-- Confirm no zero-rate row in history
SELECT COUNT(*) FROM sbv_rates_history WHERE max_deposit_rate_pct = 0;
```

Zone health: 2 files mod + 1 test new; tsc EXIT 0; 36 SBV tests green; HEALTHY

---

## c327 · 2026-05-30 (BCTC-AGENTIC-REFINE AR-MCP) — COMMITTED 76a3b8d2

**Task:** AR-MCP — FR-3 through FR-13 refine orchestrator, MCP tools, parser, schema.

**Files changed (17):**
- NEW: `src/application/utils/pageClassifier.ts` — FR-5 classifyPageForImageLoad (pipe/VN-keywords/continuation)
- NEW: `src/application/utils/refinedMarkdownParser.ts` — FR-10 deterministic parser; LIVE schema (label, value_prior); trust flags→confidence 0.2/0.4/1.0; parseVnNumber (dot-thousands separator)
- NEW: `src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts` — FR-3 (pdf-path→basename→getPageText)
- NEW: `src/interface/mcp/tools/financial-reports/getBctcPageImageTool.ts` — FR-4 (on-demand rasterize, BCTC_IMAGE_PAGE_CAP=3)
- NEW: `src/interface/mcp/tools/financial-reports/getBctcRefinedTool.ts` — FR-11 (reads bctc_refined_units)
- NEW: `src/interface/mcp/routes/bctcRefineHandler.ts` — on-demand POST /api/refine-bctc/{report_id}
- NEW: `src/scheduler/financial-reports/bctcRefineJob.ts` — FR-12 4-phase orchestrator (claim+readiness, window partition continuation-aware, bounded fan-out pool default=5, collect-then-write); runBctcRefineJob cron entry
- MOD: `src/infrastructure/db/schema-financial-reports.ts` — FR-9 bctc_refined_units + window_status + text_status/refine_status idempotent migrations
- MOD: `src/infrastructure/fetchers/pdfExtractorClient.ts` — getPageText() + rasterizePages()
- MOD: `src/interface/mcp/tools/registry.ts` — 3 new tools (#139-#141)
- MOD: `src/interface/mcp/tools/financial-reports/index.ts` — 3 new exports
- MOD: `src/scheduler/cronConfig.ts` — bctcRefineJob '0 9,14,20 * * *' UTC
- NEW: 5 test files (AR-parser-dv, AR-page-classifier, AR-schema-migration, AR-refine-readiness-gate, AR-refined-units-idempotency)

**DV protocol:** RED_BEFORE=true guard in AR-parser-dv.test.ts; all 5 AR test files co-committed with production code.

**Gates:** tsc EXIT 0 | 76 AR tests GREEN (0 fail) | balance-badge-forbidden enforced in tests | idempotency ≥3× proven (Scenario A/B/C) | continuation invariant tested (FPT [22,23]) | OFF-HOSE cron verified (09:00/14:00/20:00 UTC) | commit 76a3b8d2

**ops_rebuild_required: true** — AR-OPS must rebuild mcp-server container after this change.

Zone health: 17 files (12 new, 5 mod); tsc EXIT 0; 76 AR tests green; HEALTHY

---

## c326 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE Task #9 — HEADER PAGE-NAV + KEYBOARD) — COMMITTED 3490dffa

**Task:** Move page-change buttons to top-middle header; add ArrowLeft/ArrowRight keyboard nav.

**Files changed (2):**
- `apps/mcp-server/src/interface/bctc-inspector.html` — CSS: `header { position:relative }` + `#header-page-nav` (centered absolute); HTML: header nav block (header-btn-prev, header-page-indicator, header-btn-next); JS: `headerBtnPrev/Next/pageIndicator` DOM refs, `setNavState()` SSOT for all 4 nav elements, keyboard `keydown` listener with focus guard (INPUT/SELECT/TEXTAREA), header button click handlers. `renderOcr` and `resetPanes` updated to use `setNavState`.
- `apps/mcp-server/src/__tests__/1976-bctc-inspector-page-nav.test.ts` — NEW: 19 pure-function tests (clampPage, navLabel, shouldSkipKeyboard, button-disabled derivation) + DV guard comment. All GREEN.

**Design:** `setNavState(page, bound)` single SSOT syncs header+OCR-pane nav. All nav (buttons+keyboard) delegates to `navigateToPage` orchestrator. Focus guard: skip arrows when activeElement tag is INPUT/SELECT/TEXTAREA.

**Gates:** tsc EXIT 0 | 19 new tests GREEN | 10088 tests 0 fail | tool=148 | sched=70 | frozen 0-diff | staged=2 | commit 3490dffa

**ops_rebuild_required: true** — HTML baked into image; `docker compose build mcp-server && up -d --no-deps --force-recreate mcp-server`

Zone health: 2 files (1 mod, 1 new); tsc EXIT 0; 19 tests green; frozen 0-diff | HEALTHY

---

## c325 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE Task #9 — MD→TABLE RENDERED VIEW)

### MD-STAGE5: markdown→table rendered per-page view — COMMITTED a7d70e62

**Task:** Add #md-stage5-section to bctc-inspector.html: renders stage-5 stitched_markdown as visual HTML tables (per-page, page-nav replay). Additive only.

**Files changed (3):**
- `apps/mcp-server/src/interface/bctc-inspector.html` — CSS #md-stage5-section; HTML section (between eval-strip and table-section); JS: `cachedPekUnits` state, `renderMdStage5View(pageNum)` (filters units by page, `parsePipeTableToHtml`, fragment banner for multi-page units), hooked into `navigateToPage` step 4 + `renderTable` PEK path + `resetPanes`.
- `apps/mcp-server/src/interface/mcp/routes/mdTableParser.ts` — NEW: exported `parsePipeTableToHtml()` + `escHtml()` pure TS utility. 100% coverage.
- `apps/mcp-server/src/__tests__/md-table-parser.test.ts` — NEW: 14 tests (TC-P1..P7 + escHtml + DV-3), 50 expect(), 100% cov, all GREEN.

**Design:** `stitched_markdown` already in `/api/bctc-inspect/table/{doc_id}` response (`units[].stitched_markdown`, has_pek:true). No handler change. Pure client-side.

**Honesty:** multi-page units show `[BẢNG CÓ THỂ KHÔNG ĐẦY ĐỦ]` banner; no-unit pages show explicit message; has_pek:false hides section entirely.

**Gates:** tsc EXIT 0 | 14 new tests GREEN 100% cov | 61-file run 0 fail | tool=148 | sched=70 | frozen 0-diff | PEK pristine | staged=3 | commit a7d70e62

**DV-3:** prose→pre (no table), pipe→table. Both paths proven live. Gate not hollow.

**ops_rebuild_required: true** — HTML baked; `docker compose build mcp-server && up -d --no-deps --force-recreate mcp-server`

Zone health: 3 files (1 mod, 2 new); tsc EXIT 0; 14 tests green; frozen 0-diff; PEK pristine | HEALTHY

---


## c327 · 2026-05-30 (BCTC-TABLE-BOUNDARY BTB-PERSIST-FIX BLOCKING-1) — COMMITTED 60dfac7f

**Task:** Fix pushBctcLayoutHandler idempotency + add prose persistence tests.

**Files changed (2):**
- `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` — Replace INSERT OR REPLACE with DELETE-before-INSERT inside the existing transaction. Two DELETE statements (bctc_layout_units + bctc_page_zones WHERE report_id=?) added at transaction start. INSERT changed to plain INSERT (not OR REPLACE). Root cause: pdf-extractor generates new unit_id UUIDs per extraction run; INSERT OR REPLACE only fires on same key — new UUIDs always append, never replace (FPT 42 rows = 7 spans × 6 extractions).
- `apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts` — 12 new tests (h-DV: idempotency with different unit_ids proven-red→green; h-DV: old UUIDs absent after re-push; i: prose page_type stored correctly; i: prose count ≥ 1; i-DV: prose survives re-push).

**BLOCKING-2 prose finding (end-to-end trace):**
- mcp-server handler: CORRECT — reads page_type from document_map, persists prose units as-is.
- Prose units NOT in push payload for PEK path. Root: pek_engine_adapter.py explicitly skips prose pages — only creates table-type units (line ~595: "Do NOT create a unit for this prose page"). The mcp-server handler cannot fix what's never sent.
- NEXT for BLOCKING-2: dev-pdf-extractor must add prose units to PEK push payload.

**Idempotency DV:** proven-red = INSERT OR REPLACE + different unit_ids → 4 rows (not 2). proven-green = DELETE-before-INSERT → 2 rows.

**Gates:** tsc EXIT 0 | 25 tests 0 fail (file-scope) | tool=148 | sched=70 | frozen 0-diff

**ops_rebuild_required: true** — mcp-server must be rebuilt for fix to take effect.

Zone health: 2 files (1 mod, 1 mod); tsc EXIT 0; 25 tests green; frozen 0-diff | HEALTHY

---

## c328 · 2026-05-30 (DATA-PIPELINE-INTEGRITY DPI-FU-A + DPI-FU-B) — COMMITTED ff9a64ce

**Tasks:** DPI-FU-A (EFFR staleness fail-loud) + DPI-FU-B (earning-yield reachable-denominator + fail-loud)

**Root cause DPI-FU-A:** FRED (fred.stlouisfed.org) unreachable from Docker container (timeout confirmed from inside container). fetchFredEffrIorb returns null on every macroIndicatorRefreshJob run. INSERT OR IGNORE means EFFR max(date)=2026-05-14 never advances (16 days stale). Was silently WARN-logged only.

**Root cause DPI-FU-B:** Watchlist expanded to 39 tickers; 12 new tickers have no vnstock financial data (API consistently returns null, confirmed via vnstock_fetch_log vs vnstock_financials cross-check). Coverage = 27/39 = 69.2% < 70% → job refuses to write tracked_indicators rows daily. Silent WARN only.

**Files changed (4):**
- `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` — DPI-FU-A: add `checkAndAlertEffrStaleness()` (exported, testable): reads MAX(date) FROM fred_series_daily WHERE series='EFFR', compares against 96h SLA, sends WORK alert with actionable container-network diagnosis message. Call after every fetchFredEffrIorb attempt. Errors now logged at ERROR not WARN.
- `apps/mcp-server/src/application/usecases/computeMarketEarningYield.ts` — DPI-FU-B: change coverage denominator from totalCount (full watchlist=39) to reachableCount (tickers with ANY vnstock_financials row=27). Coverage now 27/27=100% → rows written. Add fail-loud WORK alert when job refuses.
- `apps/mcp-server/src/__tests__/DPI-FU-A-effr-staleness-alert.test.ts` — NEW: 6 tests for checkAndAlertEffrStaleness (fresh/stale/boundary/no-rows/closed-db/97h-over)
- `apps/mcp-server/src/__tests__/DPI-FU-B-earning-yield-coverage.test.ts` — NEW: 8 tests for earning-yield reachable-denominator fix (production scenario 27/27=100%, partial coverage, refusal+alert, backward compat)

**Test results:** 35 targeted tests GREEN (14 new + 21 existing). tsc clean on changed files (2 pre-existing errors in bctcRefineJob.ts/AR-refine-readiness-gate — not caused by this change).

**Infrastructure blocker (DPI-FU-A):** Container outbound connectivity to fred.stlouisfed.org must be restored by ops. Code fix makes the failure loud; data freshness still requires network access. Ops action: `docker inspect` network mode, check DNS/firewall, test `curl https://fred.stlouisfed.org` from inside container.

**DoD status:**
- DPI-FU-A code: DONE — fail-loud alert in place. Data freshness: BLOCKED (network). After ops fixes network, macroIndicatorRefreshJob next run will backfill EFFR automatically (INSERT OR IGNORE on new dates).
- DPI-FU-B code: DONE — rows will be written on next marketEarningYieldJob run (09:30 UTC weekday). After rebuild, verify: `SELECT COUNT(*) FROM tracked_indicators WHERE indicator='market_earning_yield'` > 0.

**Gates:** tsc EXIT 0 on changed files | 35 tests 0 fail | tool=151 | sched=70 | frozen 0-diff

**ops_rebuild_required: true** — `docker compose build mcp-server && up -d --no-deps --force-recreate mcp-server`

Zone health: 4 files (2 mod, 2 new); tsc EXIT 0 on zone files; 35 tests green; frozen 0-diff | HEALTHY

---

## Working Memory

### Active Sprint: DATA-PIPELINE-INTEGRITY (DPI-FU-A + DPI-FU-B)
- c328 DONE: DPI-FU-A fail-loud EFFR staleness + DPI-FU-B reachable-denominator committed ff9a64ce
- DPI-FU-A INFRA BLOCKER: container cannot reach fred.stlouisfed.org (timeout) → ops must restore network connectivity
- DPI-FU-B: after rebuild, marketEarningYieldJob fires next 09:30 UTC weekday → rows will appear in tracked_indicators
- NEXT: ops (rebuild mcp-server) → qa (verify DoD: DB check + live get_macro_snapshot carry.fedFundsRate + yield.earningYield)

### Also active: BCTC-TABLE-BOUNDARY (BTB-PERSIST-FIX)
- c327 DONE: BLOCKING-1 delete-before-insert committed 60dfac7f
- BLOCKING-2: prose units must be added by dev-pdf-extractor to PEK push payload
- NEXT: ops (rebuild mcp-server) → dev-pdf-extractor (add prose units to pek_engine_adapter.py push) → ops (rebuild pdf-extractor) → single re-extraction of FPT + ACB sentinels → qa re-verify

### Carry-over
- tool=151, sched=70 (baselines for Gate 2c/2d)
- Bun v1.3.13 C++ post-suite panic = upstream bug, pre-existing
- Pre-existing tsc errors: bctcRefineJob.ts (2 errors) + AR-refine-readiness-gate.test.ts (1 error) — not caused by any recent change

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
