# dev-mcp-server -- Notebook

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
