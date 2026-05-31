# dev-mcp-server -- Notebook

## c341 · 2026-05-31 (FU-TRUST-REFRESH FU-5) — COMMITTED 6cc75437

**Task:** FU-5 — BLOCK-1 scalar backfill + BLOCK-2 eval recompute in finalizeBctcRefineTool

**Root cause (from QA FU-4):**
- financial_reports scalar columns (equity_total, gross_profit, total_assets, total_liabilities) written by legacy VNStock parser at 2026-05-24 and NOT updated by BCTC-AGENTIC-REFINE pipeline
- FPT: equity_total=0, gross_profit=net_revenue (100% margin) — mock signatures
- ACB: total_assets=0, equity_total=0, gross_profit=net_revenue
- bctc_eval for ACB: stale red (computed 2026-05-28, pre-refine)
- get_bctc_full returned trust-violating values; trust sprint blocked

**Fix (3 files):**
- NEW `bctcScalarAggregator.ts` (domain service, pure): aggregates bctc_table_rows → financial_reports scalar columns. Code→column mapping: 10→net_revenue, 20→gross_profit, 50→profit_before_tax, 60→net_profit, 270/440→total_assets, 300→total_liabilities, 400→equity_total, 100→current_assets. Bank fallback: Roman codes (I/VIII/IX) + label patterns. Unit auto-detect: max value > 1e11 → raw VND (÷1e6); else million VND (÷1). NULL for absent codes — never forced zero.
- MODIFIED `finalizeBctcRefineTool.ts`: after atomic row INSERT, calls aggregateScalars() → dynamic SET clause UPDATE on financial_reports. Then inline computeBctcEval() (non-fatal, try/catch).
- NEW `FU-5-scalar-backfill.test.ts`: 8 DV tests — DV-FU5-7 deliberate-violation (RED→GREEN), DV-FU5-4 idempotency, DV-FU5-3 NULL-not-zero, DV-FU5-5/6 unit detection.

**Gates:** tsc EXIT 0 | 8 pass / 0 fail (FU-5 file) | TRUST-RED + HC-human-confirm unchanged 69 pass | tool=156 | sched=70

**ops_rebuild_required: true** — must rebuild container + re-run finalize_bctc_refine for e8ea3df5 (FPT) and fea19bae (ACB) to apply backfill to live DB. QA must re-gate after.

Zone health: 3 files (2 new, 1 modified); tsc EXIT 0; 8+61 tests green; tool=156; sched=70 | HEALTHY

---

## c340 · 2026-05-31 (MACRO-CMDTY-DELTA) — COMMITTED e510e5df

**Task:** MACRO-CMDTY-DELTA FIX — Brent/Gold change% stuck at 0.00% in get_cycle_bootstrap MACRO block

**Root cause (verified, not assumed):**
- DB shows 993 history rows, min_brent=86.33 (no zero rows) — hypothesis of zero-valued rows was WRONG
- Actual cause: Yahoo Finance regularMarketPrice repeats the SAME daily close price during off-market hours
- Last 24h: brent=91.12 for 19 consecutive rows; prev query (ORDER BY fetched_at DESC LIMIT 1) finds most-recent row = same value → computeDelta(91.12, 91.12) = {pct:0} permanently
- market_prices UPSERT overwrites change_pct=0 on every cron tick during off-hours

**Fix (2 files):**
- `yahooFinance.ts`: changed prev-close lookup from most-recent-row to previous-calendar-day row — `date(fetched_at) < date(snapshotDate)` + `AND brent/gold > 0` guard to skip any zero bootstrap rows
- `025-yahoo-finance.test.ts`: added YF-14 (off-market repeated price must not zero real delta) + YF-15 (zero-valued history rows skipped as prior-close candidates) — both RED→GREEN

**Gates:** tsc EXIT 0 | 16 pass / 0 fail (025 file) | full suite exit 0 | tool=157 | sched=70

**Live DB state:** 993 history rows, min_brent=86.33, min_gold=4399.2 — all valid; next cron tick will compute day-over-day (91.12 vs 91.7 prev-day close = -0.63%)

**ops_rebuild_required: true** — container runs stale code; next Yahoo cron tick won't show real deltas until ops rebuilds mcp-server

Zone health: 2 files modified; tsc EXIT 0; 16 tests green; tool=157; sched=70 | HEALTHY

---

## c339 · 2026-05-30 (DYN-WF-FOUNDATION DWF-DEV-MCP-1) — COMMITTED 16117375

**Task:** DWF-DEV-MCP-1 — is_trading_day MCP tool (#147)

**5 files, 470 lines added:**
- `domain/services/vnHolidayData.ts` — VN_HOLIDAYS 2024-2027 + VN_HALF_DAYS Set + VN_CALENDAR_LAST_YEAR
- `domain/services/vnTradingCalendar.ts` — isVnTradingDay() pure fn + getTodayVnDate(); GMT+7 via Date.UTC math
- `interface/mcp/tools/system/isTradingDayTool.ts` — registerIsTradingDayTool(); optional date param; defaults to today VN time
- `__tests__/DWF-is-trading-day.test.ts` — 13 tests: 12 GREEN / 1 RED (DV AC-P0-3-6)
- `interface/mcp/tools/registry.ts` — +2 lines: import + push #147

**AC status:**
- AC-P0-3-1: GREEN — 2025-01-27 → holiday
- AC-P0-3-2: GREEN (corrected to 2025-01-06 Monday — spec date 2025-01-04 is actually Saturday)
- AC-P0-3-3: GREEN — 2025-01-11 → weekend
- AC-P0-3-4: GREEN — domain-only, zero infra imports
- AC-P0-3-6 DV: RED (correct) — proves calendar is real
- AC-P0-3-7: PENDING rebuild + container verify

**Gates:** tsc EXIT 0 | 12 pass / 1 fail (DV only) | tool 156→157 (+1) | sched 70 unchanged

**ops_rebuild_required: true** — rebuild mcp-server to activate is_trading_day in container

Zone health: 5 files (1 mod + 4 new); tsc EXIT 0; 12+1DV tests; tool=157; sched=70 | HEALTHY

---

## c338 · 2026-05-30 (BCTC-TRUST-RED) — COMMITTED 4 commits

**Sprint:** BCTC-TRUST-RED
**ACB UUID resolved:** `fea19bae-2b7a-4954-b3e0-e09d7bfc7390` (action_code=ACB, sort_key=2026-Q1)
**Purge verified:** FPT bctc_table_rows=0, bctc_refined_units=0, refine_status=PENDING; ACB same.

**Commits (in order):**
1. `4278b61a` — feat: TR0-DEV-1+TR1-DEV-1 — bctcSanityValidator DT-1 (18 tests, 100% line coverage)
2. `ebbdabbf` — feat: TR0-DEV-1 — ingest gate + REJECTED_SANITY Zod enum + schema comment
3. `04fc08db` — feat: TR1-DEV-2 — bctcMagnitudeValidator DT-2/DT-3 + finalize wiring + DT-4 (17 tests)
4. `b08ab73a` — feat: TR0-DEV-2 — checkPublishability PUB-1..4 guard in bctcFullTools (16 tests)

**Files created:**
- `domain/services/financial-reports/bctcSanityValidator.ts` — DT-1 digit-run detector (domain pure)
- `domain/services/financial-reports/bctcMagnitudeValidator.ts` — DT-2+DT-3 detectors (domain pure)
- `__tests__/bctcSanityValidator.test.ts` — 18 pass
- `__tests__/bctcMagnitudeValidator.test.ts` — 17 pass
- `__tests__/bctcPublishabilityGuard.test.ts` — 16 pass

**Files modified:**
- `pushBctcRefinedUnitTool.ts` — DT-1 ingest gate + Zod enum DONE|FAILED|REJECTED_SANITY
- `finalizeBctcRefineTool.ts` — DT-2/DT-3 + DT-4 wiring, CONFIRMED guard Layer 1 preserved
- `bctcFullTools.ts` — checkPublishability PUB-1..4
- `schema-financial-reports.ts` — DDL comment REJECTED_SANITY valid values

**Domain purity:** bctcSanityValidator.ts + bctcMagnitudeValidator.ts = 0 infra/interface imports
**Zero diff:** HCM-DISAMBIG-extraction.test.ts, pdf-extractor/, text_table_extractor.py
**ops_rebuild_required: true** (container must be rebuilt to activate guards)
**QA:** TRUST-QA-1 unblocked — do NOT dispatch; return to router per instructions.

## c337 · 2026-05-30 (BCTC-AI-INPUT-TAB ops-fix) — COMMITTED cbe96137

**Task:** Scoped commit — ops-identified path bug in getBctcPageImageTool.ts

**1 file changed, 2 insertions(+), 1 deletion(-)**

**Fix:** `getPngPath()` was using `join(process.cwd(), "data", "bctc-page-images", ...)` which resolves to `/app/data/bctc-page-images` inside container — a path that does not exist. Changed to `join("/data/bctc-page-images", ...)` matching the named Docker volume mount and the sibling `bctcInspectHandler.ts`. Added one-line clarifying comment.

**QA gate:** Pre-approved (7 gates). No new test required (existing AIT-DEV-1 tests cover PNG path contract via mock; path is now consistent with working handler).

**Verification:** tsc 0 errors / git show --stat HEAD = 1 file changed / git status clean on file.

**NEXT:** po EXIT sign-off for BCTC-AI-INPUT-TAB sprint.

## c336 · 2026-05-30 (BCTC-AI-INPUT-TAB) — COMMITTED b4ed9266

**Task:** BCTC-AI-INPUT-TAB — add 7th "Đầu vào AI" tab showing agent-input bundle per page

**Additive only. 4 files touched, 736 lines added, 0 deleted.**

**New handlers in bctcInspectHandler.ts:**
- `handleBctcInspectPageImage` — serves PNG bytes from `/data/bctc-page-images/{docId}/page_{0001}.png`; 404 on miss; absolute volume path (NOT process.cwd())
- `handleBctcInspectPageWindow` — queries `bctc_refined_units` via `json_each(page_numbers_json)`; always 200 (found:false on miss)

**server.ts:** +2 dispatch blocks for page-image and page-window routes (after zones handler)

**bctc-inspector.html:**
- 7th tab button: `rtab-aiinput` / `data-tab="aiinput"` / label "Đầu vào AI"
- 7th tab panel: `tab-panel-aiinput` with image, page-window, OCR, refine contract sub-sections
- `let lastOcrData = null` state variable; populated in `renderOcr()` after `resp.json()`
- `renderAiInputTab(docId, page)` — lazy (only when activeTab==='aiinput')
- navigateToPage step 6: `if (activeTab === 'aiinput') await renderAiInputTab(...)`
- switchTab: auto-trigger `renderAiInputTab` when `tabId === "aiinput"`

**DV tests (AIT-DEV-1.test.ts) — 59 pass, 0 fail:**
- PNG magic bytes [0x89,0x50,0x4e,0x47] byte-level contract
- 404-on-miss with exact `png_not_found` signal (not JSON echo)
- 400 on invalid UUID
- page-window hit/miss
- HTML 7-tab regression + 25 legacy pane IDs

**Regressions:** HC-DEV-7 (111 pass) and HC-DEV-6 both GREEN.

**Volume:** `/data/bctc-page-images` confirmed mounted in container (empty — no PNGs generated yet; route returns honest 404 until rasterizer runs).

**REBUILD REQUIRED before live QA.** Next: qa.

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

## c341 · 2026-05-31 (TOOL-SURFACE-HYGIENE TSH-2+TSH-3+TSH-4) — COMMITTED f4da532f

**Tasks:** TSH-2 (alert pair), TSH-3 (macro accuracy trio), TSH-4 (market-data pair) + registry.ts comment fix

**Description-string-only batch — ZERO logic change:**
- `alertAccuracy.ts` mark_alert_outcome: added store+timing (SQLite alerts table, POST-HOC)
- `alertVerdictTools.ts` write_alert_verdict: added store+timing (JSON alert-verdicts file, AT FIRE TIME)
- `calibrationTools.ts` get_calibration_report: named calibration_snapshots + Brier/machine scope
- `calibrationTools.ts` get_label_accuracy_report: named market_messages + human-label scope
- `predictionTools.ts` get_prediction_accuracy: named Polymarket signals + precision computation
- `marketTools.ts` get_patterns: named LanceDB rag_analyses + semantic precedent use case
- `technicalIndicatorTools.ts` get_technical_indicators: named Go TA service port 5003 + quantitative
- `registry.ts` line 172 comment: "6 Kinh Dich tools" → "5" (TSH-1 already deregistered one)

**Gates:** tsc --noEmit EXIT 0 / 7 files changed 37 insertions / 0 handler/schema/logic delta

**ops_rebuild_required: true** — ops rebuild #2 required for new descriptions to appear in live list_server_tools

Zone health: description strings only; tsc EXIT 0; tool count unchanged at 153 (TSH-1 already done); sched=70 | HEALTHY

---

## Working Memory

### Active Sprint: DYN-WF-FOUNDATION
- c339 DONE: DWF-DEV-MCP-1 is_trading_day tool committed 16117375; tool=157; AC-P0-3-1/3/4/6DV all pass
- AC-P0-3-7 PENDING: requires ops rebuild + gateway call to verify container toolCount +1
- NEXT: ops (rebuild mcp-server) → QA verify AC-P0-3-5 gateway reachability + AC-P0-3-7 container toolCount

### Previous sprints (carry-over)
- tool=157, sched=70 (current baselines for Gate 2c/2d)
- Pre-existing test failure: get_price_history (cron_job_runs table missing) — confirmed pre-existing, not caused by DWF changes
- Pre-existing tsc errors: bctcRefineJob.ts (2 errors) + AR-refine-readiness-gate.test.ts (1 error)
- ops_rebuild_required: true (DWF-DEV-MCP-1 + BCTC-TRUST-RED + DPI-FU-A/B + BTB-PERSIST-FIX all pending rebuild)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
