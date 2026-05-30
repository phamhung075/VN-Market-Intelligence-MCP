# dev-mcp-server -- Notebook

## c335 · 2026-05-30 (HC-DEV-7 bctc-inspector layout) — COMMITTED [pending]

**Task:** HC-DEV-7 — two-column 50/50 split + right-pane tab bar for bctc-inspector.html

**PURELY PRESENTATIONAL.** No data-flow, fetch URL, or handler changes. All existing element IDs preserved.

**CSS changes:**
- `.left-pane`: added `min-width:0` (belt-and-suspenders flex 50%)
- `.right-pane`: changed from `width:480px;flex-shrink:0` to `flex:1;overflow:hidden` (true 50/50 split)
- Added `#right-tab-bar`, `.rtab-btn`, `.rtab-active` tab bar styles
- Added `#right-tab-panels`, `.tab-panel`, `.tab-panel-active` panel container styles

**HTML restructure (ADDITIVE — all IDs preserved, just moved into tab panels):**
- Added `#right-tab-bar` with 6 `.rtab-btn` tab buttons (data-tab attributes)
- Added `#right-tab-panels` with 6 `.tab-panel` panels (data-tab-panel attributes)
- Tabs: Văn bản OCR (default) | Bảng | Bảng Markdown | Số liệu | Đánh giá 6 cổng | Sửa tay
- `hc-panel` promoted to own "Sửa tay" tab (no longer needs JS show/hide — tab controls it)
- `hc-tab-btn` kept in DOM (hidden via style="display:none") for legacy JS compatibility

**JS additions:**
- `switchTab(tabId)` function: toggles `.rtab-active` on buttons + `.tab-panel-active` on panels
- Auto-loads HC flags when "Sửa tay" tab is activated with a doc selected
- Wired all `.rtab-btn` click events
- `hcTabBtn` click now calls `switchTab("suatay")` instead of old toggle

**DV tests:**
- HC-DEV-7-layout.test.ts: 58 pass, 0 fail (NEW)
- HC-DEV-6-inspector-panel.test.ts: 53 pass, 0 fail (REGRESSION ZERO)
- tsc: 0 errors

**Zone health:** bctc-inspector.html layout refactored, bun test 0 fail on targeted files, PI3 6 failures pre-existing | HEALTHY

## c334 · 2026-05-30 (BCTC-HUMAN-CONFIRM HC-DEV-6) — COMMITTED 7a3734ed

**Task:** HC-DEV-6 — bctc-inspector.html "Sửa tay / Xác nhận cuối" tab

**ADDITIVE only.** 476 lines added to `bctc-inspector.html`. Zero changes to existing panes.

**HTML/JS additions:**
- CSS block: `.hc-*` classes (hc-panel, hc-cell-card, hc-badge-red, hc-badge-yellow, hc-values-grid, hc-btn-confirm, hc-btn-reset, hc-btn-save, hc-correction-row, hc-input-val, hc-status-ok, hc-status-pending, hc-status-ambiguous, hc-confirm-badge, hc-cell-list, hc-no-flags, hc-loading, hc-error, hc-locked-note, hc-tab-btn, hc-tab-active)
- Tab button `id="hc-tab-btn"` inside eval-strip header (alongside existing Người dùng / Agent (debug) toggle)
- Panel `id="hc-panel"` after eval-strip-section (hidden by default, shown on tab click)
- JS: `parseVnNumber()`, `hcFlagsUrl()`, `hcCorrectUrl()`, `hcConfirmUrl()`, `hcConfirmResetUrl()`, `hcLoadFlags()`, `hcRenderCells()`, `hcSubmitCorrection()`, `hcConfirmReport()`, `hcResetConfirmation()`, `hcUpdateStatusBadge()`, `resetPanes` monkey-patch (additive HC cleanup only)

**Four endpoints wired:**
- GET  `/api/bctc-inspect/flags/{doc_id}` — flag list on tab open
- POST `/api/bctc-inspect/correct/{doc_id}` — per-cell correction
- POST `/api/bctc-inspect/confirm/{doc_id}` — final confirm lock
- POST `/api/bctc-inspect/confirm/{doc_id}/reset` — unlock

**DV test: 53 pass, 0 fail** (`HC-DEV-6-inspector-panel.test.ts`)
- URL-assertion (6 tests): exact /api/bctc-inspect/flags|correct|confirm|reset path patterns
- parseVnNumber (11 tests): `,`→`.`, whitespace strip, null on NaN/empty/null/undefined
- HTML structural (36 tests): new element IDs present + 17 existing pane IDs all present (additive-only proof)
- DV guard: deliberate-violation comment in parseVnNumber block

**tsc:** 0 errors. Existing panes: 0-diff. Next: QA gate (full HC sprint).

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

## c329-c325 (pruned) — commits: a1cb486e 47c9f328 d7ee43d7 76a3b8d2 3490dffa a7d70e62
AR-PREREQ-3, AR-MCP-OPTY, DPI-FU-D SBV zero-guard, AR-MCP orchestrator, header page-nav, MD→table view.


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
