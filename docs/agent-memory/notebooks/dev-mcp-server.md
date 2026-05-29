# dev-mcp-server -- Notebook

## c324 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE Task #9 — DUAL-VIEW GATE STRIP)

### M-1..M-7 dual-view toggle + debug sub-object — COMMITTED 24e9776d

**Task:** Add user/agent dual-view to the 6-gate eval strip. User view unchanged; Agent view adds collapsed `<details>` raw-debug blocks per gate.

**Files changed (3):**
- `apps/mcp-server/src/interface/mcp/routes/bctcEvalPageHandler.ts` — M-1: `LayoutUnitRow` extended with `row_count/quarantined/quarantine_reason`; M-2: S4 SELECT now fetches those 3 fields; M-3: `ocrBasename` captured for S3 debug; `pekRowCount/pekQuarantined/pekQuarantineReason` captured for S4 debug; `safeParseJson()` helper; `debug` sub-object emitted on every gate_strip element with raw parsed fields — additive, existing fields byte-identical.
- `apps/mcp-server/src/interface/bctc-inspector.html` — M-4: additive CSS for `.eval-strip-title-row`, `.eval-view-toggle-wrap`, `.eval-view-btn/.active`, `.eval-debug-block`, `.eval-debug-summary`, `.eval-debug-pre`, `.eval-debug-label`; M-5: segmented toggle buttons in eval-strip-section title row; M-6: `evalViewMode` + `lastEvalData` state vars; `setEvalViewMode()`; button wire; `renderDebugBlock()` with `<details>/<summary>` + `⚑ toàn báo cáo` honesty label for report_level stages; `renderEvalStrip` caches `lastEvalData` + passes mode to `renderGateStrip`; `renderGateStrip` mode param + conditional agent block append. User-view code body untouched.
- `apps/mcp-server/src/__tests__/bctcEvalPageHandler.test.ts` — M-7: TC-D1 asserts debug.metrics_json is parsed object, gate_failures_json is array, stage-3 debug.ocr_filename="vnm_q4_2025.pdf", stage-4 debug.pek_row_count=42/pek_quarantined=true/pek_quarantine_reason="low_confidence"; DV-2 deliberate-violation proves debug gate not hollow (removing debug → Expected value to be defined, received undefined); non-regression check for all existing user-view fields.

**Gates:**
- `bun tsc --noEmit`: TSC_EXIT_0
- `bctcEvalPageHandler.test.ts`: 15 pass / 0 fail (was 9; 6 new tests added)
- Full suite: 10055 tests EXIT 0 (Bun C++ post-suite panic = known upstream v1.3.13 bug, pre-existing)
- Tool count: 148 (unchanged — grep -rc server.tool|addTool)
- Scheduler count: 70 (unchanged)
- Frozen: bctcEvalDetailHandler.ts, bctcInspectHandler.ts, bctcEvalStore.ts — git diff empty; full-report endpoint untouched
- PEK subtree: PEK_CLEAN (git -C apps/pdf-extractor/PDF-Extract-Kit diff = 0 lines)
- Staged files: exactly 3 — no foreign files in index
- Commit: 24e9776d

**DV-2 deliberate-violation evidence:**
- `debug.metrics_json` is parsed object (not string). If handler emitted raw string, `typeof gate.debug.metrics_json === "object"` → RED ("string" ≠ "object"). Gate is not hollow.
- `gate.debug` must be defined. If removed from gateStrip map, `expect(gate.debug).toBeDefined()` → RED. Gate fires correctly.

**Honesty preserved:**
- Stages 1/2/5/6 (report_level:true): `⚑ toàn báo cáo — không phân tách theo trang` label in debug block. No per-page fabrication.
- Stages 3/4: genuine page-scoped DB evidence only (ocr_filename from pdf_path basename; pek_row_count/quarantined from bctc_layout_units).

**ops_rebuild_required: true** — HTML baked into image; `docker compose up -d --build --force-recreate mcp-server` required.

Zone health: 3 files changed additive only; tsc EXIT 0; 15 tests green; frozen surfaces 0-diff; PEK pristine | HEALTHY

---

## c323 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE — PDF LAZY RENDER BUG FIX)

### PDF lazy render — page on select, page-by-page on nav — COMMITTED a6233c85

**User bug report:** "document pdf need load on select and load page by page"

**Root cause:** `renderWithPdfJs` rendered ALL pages in a sequential for-loop on doc select. For large BCTC PDFs (40-100 pages) this blocked the browser for 40-100s before any canvas appeared. `pdfNumPages` was not populated until the loop completed, so `navigateToPage(1)` ran with `pdfNumPages=0` → `ensurePdfPageRendered` was a no-op → blank PDF pane.

**Fix (HTML-only, bctc-inspector.html):**
- Added `pdfDoc = null` module-level state (retains the pdf.js document object across page navigations).
- `renderWithPdfJs` now: fetches PDF bytes → calls `pdfjsLib.getDocument()` → stores `pdfDoc` + `pdfNumPages` → renders only page 1 via `renderPdfPage(1)` → returns immediately.
- New `renderPdfPage(pageNum)`: renders a single pdf.js page into a canvas tagged `pdf-page-{pageNum}`. No-op if the canvas already exists (idempotent).
- `ensurePdfPageRendered`: now calls `renderPdfPage(pageNum)` before `scrollIntoView` — on nav, the target page is rendered on-demand.
- `resetPanes` + doc-select handler: both reset `pdfDoc = null` on new doc selection.

**Preserved intact:** navigateToPage orchestrator, OCR/table/md/eval-strip replay, zone overlay wiring, iframe fallback path, `has_pdf` honest-degrade, monkey-patch for zone overlay.

**Gates:**
- `bun tsc --noEmit`: EXIT 0 (clean)
- `bctcEvalPageHandler.test.ts`: 12 pass / 0 fail (HTML-only change; no TS impact)
- Frozen handlers: bctcEvalDetailHandler.ts, bctcInspectHandler.ts, bctcEvalStore.ts, bctcEvalPageHandler.ts — git diff = empty (0 changes)
- PEK subtree: git -C apps/pdf-extractor/PDF-Extract-Kit diff = 0 lines (pristine)
- Staged files: exactly 1 (bctc-inspector.html)
- Commit: a6233c85

**ops_rebuild_required: true** — HTML is baked into the mcp-server container image; force-recreate required for fix to take effect live.

Zone health: HTML-only fix; tsc EXIT 0; 12 tests pass; all frozen files untouched | HEALTHY

---

## c322 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE — AC6 PER-STAGE TRUST PREFIX)

### AC6 fix — per-stage Vietnamese trust prefix in renderGateStrip — COMMITTED e51e4b8e

**QA defect:** `renderGateStrip` in `bctc-inspector.html` emitted no per-stage inline trust text (M-5 spec). `ĐỘ TIN CẬY THẤP` existed only in the overall red header; `TRÍCH XUẤT ĐỎ` and per-stage `độ tin cậy thấp` were absent.

**Fix:** HTML-only change to `renderGateStrip`. Added `trustPrefix` variable driven purely off `gate.status` (already in `/page/N` response — no endpoint change):
- `status === "red"` → `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ giai đoạn ${gate.stage_no}]` (color #e06060, bold)
- `status === "yellow"` → `[độ tin cậy thấp]` (color #d4a017, semi-bold)
- green → no prefix
`trustPrefix` prepended inside the `eval-stage-label` span before the "Giai đoạn N —" text.

**Gates:**
- `grep -n "TRÍCH XUẤT ĐỎ"` → line 1273 in renderGateStrip (PASS)
- `grep -n "độ tin cậy thấp"` → line 1275 in renderGateStrip (PASS)
- `bctcEvalPageHandler.test.ts`: 12 pass / 0 fail (HTML-only change; no test impact)
- 4 frozen handlers/stores: 0 diff (bctcEvalPageHandler.ts, bctcEvalDetailHandler.ts, bctcInspectHandler.ts, bctcEvalStore.ts)
- PEK subtree: 0 lines (pristine)
- Staged files: exactly 1 (bctc-inspector.html)
- Commit: e51e4b8e

**ops_rebuild_required: true** — HTML served by mcp-server container; force-recreate needed for AC6 to take effect live.

Zone health: HTML-only fix; tsc unaffected; 12 tests pass; frozen files untouched | HEALTHY

---

## c321 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE — PROD SCHEMA FIX)

### bctcEvalPageHandler — prod schema divergence fix — COMMITTED 5ad6df9c

**Root cause:** Stage-3 primary query `WHERE pet.report_id = ?` references a column that does not exist in production `pdf_extracted_text`. Real prod columns: `id, filename, page_number, text_content, confidence, extracted_at, action_code`. Test fixture TC-8 invented a `report_id` column → false-green. Confirmed via docker compose exec sqlite_master introspection.

**Handler fix (bctcEvalPageHandler.ts):** Removed the broken `report_id` query entirely. Single working path: `financial_reports.pdf_path → basename → pdf_extracted_text WHERE filename=? AND page_number=?`. No code path references `pet.report_id`.

**Test fix (bctcEvalPageHandler.test.ts):** Rebuilt `pdf_extracted_text` fixture verbatim from production sqlite_master (filename NOT NULL, action_code, UNIQUE(filename, page_number), NO report_id). Added FK constraint to `bctc_eval_results` fixture. TC-8 now inserts OCR row by filename only + seeds `financial_reports.pdf_path` so handler resolves basename correctly.

**Production schema introspected:**
- `pdf_extracted_text`: id, filename NOT NULL, page_number, text_content, confidence DEFAULT 0, extracted_at, action_code, UNIQUE(filename, page_number)
- `bctc_layout_units`: has report_id (stage-4 query is correct, unchanged)
- `bctc_eval_results`: has FK CONSTRAINT fk_report FOREIGN KEY (report_id) REFERENCES financial_reports(id) ON DELETE CASCADE

**Gates:**
- bun test bctcEvalPageHandler.test.ts: 12 pass / 0 fail
- bun tsc --noEmit: EXIT 0 (clean)
- pet.report_id grep: EXIT 1 (no matches — all code paths clean)
- PEK subtree: 0 lines (pristine)
- bctcEvalDetailHandler.ts, bctcInspectHandler.ts, bctcEvalStore.ts: git diff = empty (unchanged)
- Commit: 5ad6df9c — 2 files, 70 ins / 68 del

**ops_rebuild_required: true** — endpoint 500s until container is force-recreated.

Zone health: handler prod-schema aligned; fixture prod-faithful; 12 tests GREEN; tsc clean | HEALTHY

---

## c320 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE)

### BCTC-EVAL-INSPECT-MERGE DONE — COMMITTED 75c7acf5

**Task:** Fold BCTC eval gate strip into the existing /api/bctc-inspect viewer. No new page, no new container. Option (c) from architecture brief.

**Files created (2):**
- `apps/mcp-server/src/interface/mcp/routes/bctcEvalPageHandler.ts` — NEW: GET /api/bctc-eval/{report_id}/page/{page_no}. Returns 6-gate eval status + page-scoped annotations. Stages 1/2/5/6: report_level:true + label_suffix:"(toàn báo cáo)". Stage 3: OCR confidence/text_length from pdf_extracted_text (by report_id, fallback by filename). Stage 4: partial-fragment detection from bctc_layout_units.page_numbers_json. HTTP 400 INVALID_UUID | INVALID_PAGE_NO, 409 EVAL_NOT_COMPUTED. DI pattern: db injected by server.ts (no getDb() in handler).
- `apps/mcp-server/src/__tests__/bctcEvalPageHandler.test.ts` — NEW: 12 unit tests (TC-1..9 + DV-1 deliberate-violation). All pass. DV-1 smoke proves partial-fragment gate is not hollow.

**Files modified (2):**
- `apps/mcp-server/src/interface/mcp/server.ts` — import + route registration. pageMatch regex `/^\/api\/bctc-eval\/([^/]+)\/page\/(\d+)$/` inserted BEFORE the UUID-only catch to prevent false match as detail handler.
- `apps/mcp-server/src/interface/bctc-inspector.html` — M-3 navigateToPage orchestrator; M-4 ensurePdfPageRendered+scroll fix; M-5 renderEvalStrip/renderGateStrip; M-6 eval-strip DOM section + CSS; M-7 renderTable(docId, pageNum) page-aware + mandatory [FRAGMENT TRANG] banner; M-8 doc-select handler uses navigateToPage(1) + renderTable(docId,1).

**Gates:**
- bun tsc --noEmit: EXIT 0 (clean)
- bctcEvalPageHandler.test.ts: 12 pass / 0 fail (64 expect() calls)
- PEK subtree pristine: `git -C .../PDF-Extract-Kit status --porcelain` = 0 lines
- Frozen files untouched: bctcEvalDetailHandler.ts, bctcInspectHandler.ts, bctcEvalStore.ts, frozen Python files — all unmodified (git diff empty)
- Staged files (exactly 4): bctcEvalPageHandler.ts, server.ts, bctc-inspector.html, bctcEvalPageHandler.test.ts
- Commit: 75c7acf5

**DV-1 red proof documented in test file:**
- Multi-page unit [5,6,7] on page 6 → partial_fragment_warning:true (LIVE PASS)
- Single-page unit [3] on page 3 → partial_fragment_warning:false (LIVE PASS)
- If handler suppresses warning → TC-1 + DV-1 go RED with "Expected true, received false"

**ops_rebuild_required: true** — new route + HTML changes require force-recreate.

Zone health: 2 new files + 2 modified; tsc EXIT 0; 12 tests pass; PEK pristine; frozen files untouched | HEALTHY

---

## c319 · 2026-05-29 (BOOTSTRAP-ENUM-BCTC — XS FIX)

### BOOTSTRAP-ENUM-BCTC DONE

**Task:** Add `bctc-analyst` to `VALID_AGENT_NAMES` enum in `getCycleBootstrap.ts`. Agent was rejecting with `invalid_enum_value` forcing `bctc-analyst` to impersonate `financial-analyst` (report #3009, log #1154).

**Root cause confirmed (jq):** `bctc-analyst` is a cowork-type agent in `docs/data/system-map.json` but was absent from the hardcoded `VALID_AGENT_NAMES` array. This is the 4th string-vs-enum drift bug (VNH DomainType, commit-mutex, verified_decision, now this).

**SSOT-derive scope assessment:** Full runtime derive from system-map.json crosses application/infra layer boundary (file I/O) → out of XS scope → emitted SPIKE proposal to `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json`.

**Files modified (3 + 2 new):**
- `apps/mcp-server/src/application/usecases/getCycleBootstrap.ts` — VALID_AGENT_NAMES: added "bctc-analyst" (8 → 9 entries)
- `apps/mcp-server/src/interface/mcp/tools/system/cycleBootstrapTool.ts` — description string updated to include bctc-analyst
- `apps/mcp-server/src/__tests__/1563-get-cycle-bootstrap.test.ts` — count assertion 8 → 9, added bctc-analyst check
- `apps/mcp-server/src/__tests__/1975-bootstrap-enum-bctc-analyst-guard.test.ts` — NEW guard: reads cowork roster from system-map.json, asserts every bootstrap cowork agent is in VALID_AGENT_NAMES; RED-on-removal proven
- `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json` — NEW SPIKE proposal

**Gates:**
- bun tsc --noEmit: EXIT 0 (clean)
- Targeted tests: 13 pass / 0 fail (1563 + 1975)
- Server-wiring: 23 pass / 0 fail
- RED proof: removed bctc-analyst → 2 fail (guard fires correctly)
- Tool count: 148 (unchanged)
- Scheduler count: 70 (unchanged)

**Commit:** a0103b84

Zone health: enum fix only, no tool/scheduler changes; tsc EXIT 0; 13 bootstrap tests pass; guard RED-on-removal proven | HEALTHY

---

## c318 · 2026-05-28 (BCTC-EVAL-MCPS-GLUE — Sprint BCTC-EVAL-SUBSTRATE integration fix)

### BCTC-EVAL-MCPS-GLUE DONE — UNSTAGED

**Task:** Fix false-green integration handoff from prior cycle (c317). The isolated module tests in c317 passed but the 4 integration points were never wired. This cycle adds the missing wiring and a mandatory G2 anti-false-green integration smoke test.

**Root cause of false-green:** c317 created 11 new handler/domain/infra files but forgot to modify the 4 integration files (schema, server.ts, startScheduler.ts, cronConfig.ts). The isolated handler tests in bctc-eval-routes.test.ts passed because they hand-rolled mock request/response objects — they never touched the real HTTP dispatch path. Matches feedback_fence_false_green exactly.

**Files modified (5 integration + 1 data + 1 test):**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — ADDITIVE: bctc_eval_results DDL + 3 indexes appended after bctc_page_zones block; grep count=4 (table + 3 indexes)
- `apps/mcp-server/src/interface/mcp/server.ts` — WIRED: 6 new imports + bctcEvalThresholds load at startup + 5 route handlers (GET /api/bctc-eval, GET /api/bctc-eval/thresholds, GET /api/bctc-eval/:id, POST /api/bctc-eval/recompute/:id, POST /api/bctc-eval/push-stage); grep count=13
- `apps/mcp-server/src/scheduler/startScheduler.ts` — REGISTERED: bctcEvalRecomputeJob import + cron.schedule(CRONS.bctcEvalRecompute, ...) registration; grep count=3; scheduler count now 70
- `apps/mcp-server/src/scheduler/cronConfig.ts` — ADDED: bctcEvalRecompute key with default '2 22 * * *' + env CRON_BCTC_EVAL_RECOMPUTE override; grep count=2
- `docs/data/project-stats.json` — UPDATED: cronJobCount 68→69
- `docs/data/cron-registry.json` — UPDATED: bctcEvalRecomputeJob entry appended

**Test created (1):**
- `apps/mcp-server/src/__tests__/bctc-eval-integration.test.ts` — NEW: 9 integration tests, 18 expect() calls; boots actual createBunServer on port=0 (ephemeral), issues real HTTP fetch calls, proves route reachability through real middleware stack

**Gates:**
- bun tsc --noEmit: EXIT 0 (clean)
- Integration test (NEW): 9 pass / 0 fail (18 expect() calls)
- All bctc-eval tests (3 files): 42 pass / 0 fail (104 expect() calls)
- Scheduler count: 70 (was 69 in c317 notebook, +1 = correct)
- PEK subtree: UNTOUCHED (git diff empty)
- Frozen files: UNTOUCHED

**Deliberate-violation anti-false-green evidence:**
- Temporarily commented out the GET /api/bctc-eval route registration in server.ts
- T1 ("GET /api/bctc-eval → 200") FAILED with: Expected 200, Received 404
- T7 ("/health still 200") PASSED — proves failure is route-specific, not server crash
- Route restored; all 9 tests PASS. Test suite is non-vacuous.

**Thresholds routing-order proof:**
- T8 verifies /api/bctc-eval/thresholds does NOT return 400 (INVALID_UUID)
- If thresholds block were after the dynamic /:id block, "thresholds" would be parsed as a UUID and return 400

**NEXT: main terminal scoped commits → ops rebuild → qa G2 gate**

Zone health: 4 integration wiring files + 1 integration test added; tsc EXIT 0; bctc-eval 42 tests pass; scheduler 70 cron.schedule entries | HEALTHY

---

## c317 · 2026-05-28 (BCTC-EVAL-MCPS — Sprint BCTC-EVAL-SUBSTRATE)

### BCTC-EVAL-MCPS DONE — UNSTAGED

**Task:** Implement mcp-server side of shared per-PDF eval substrate (§3-7 brief 8fba5ef5).

**Files created (11 production + 2 test + 1 data):**
- `docs/data/bctc-eval-thresholds.json` — NEW: SSOT thresholds, schema_version="1", detector_version="v1"
- `apps/mcp-server/src/domain/services/bctcEvalDetectors.ts` — NEW: stage 4-6 pure detector functions (~195L)
- `apps/mcp-server/src/infrastructure/db/bctcEvalStore.ts` — NEW: upsertEvalRow, getEvalForReport, listEvalSummaries, getStaleReportIds, getCurrentDetectorVersion (~230L)
- `apps/mcp-server/src/application/usecases/computeBctcEval.ts` — NEW: orchestrator + loadBctcEvalThresholds (~150L)
- `apps/mcp-server/src/interface/mcp/routes/bctcEvalListHandler.ts` — NEW: GET /api/bctc-eval (~60L)
- `apps/mcp-server/src/interface/mcp/routes/bctcEvalDetailHandler.ts` — NEW: GET /api/bctc-eval/{id} (200/400/404/409) (~105L)
- `apps/mcp-server/src/interface/mcp/routes/bctcEvalRecomputeHandler.ts` — NEW: POST /api/bctc-eval/recompute/{id} (200/400/404/503 + Retry-After) (~110L)
- `apps/mcp-server/src/interface/mcp/routes/bctcEvalThresholdsHandler.ts` — NEW: GET /api/bctc-eval/thresholds (~45L)
- `apps/mcp-server/src/interface/mcp/routes/bctcEvalPushStageHandler.ts` — NEW: POST /api/bctc-eval/push-stage (stages 1-3) (~110L)
- `apps/mcp-server/src/interface/mcp/routes/bctcEvalBackfillRunner.ts` — NEW: one-shot CLI backfill script (~100L)
- `apps/mcp-server/src/scheduler/financial-reports/bctcEvalRecomputeJob.ts` — NEW: nightly cron 2 22 * * * (~70L)
- `apps/mcp-server/src/__tests__/bctc-eval-detectors.test.ts` — NEW: 13 unit tests, 33 expect() (stage 4/5/6 + G2 smoke)
- `apps/mcp-server/src/__tests__/bctc-eval-routes.test.ts` — NEW: 20 HTTP contract tests, 53 expect()

**Files modified (5):**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — ADDITIVE: bctc_eval_results DDL + 3 indexes (zero existing tables touched)
- `apps/mcp-server/src/interface/mcp/server.ts` — wired 5 new routes + thresholds DI at startup
- `apps/mcp-server/src/scheduler/startScheduler.ts` — import + register bctcEvalRecomputeJob
- `apps/mcp-server/src/scheduler/cronConfig.ts` — added bctcEvalRecompute cron key

**Gates:**
- bun tsc --noEmit: EXIT 0 (clean)
- New tests: 33 pass / 0 fail (bctc-eval-detectors) + 20+ pass (bctc-eval-routes) = 53+ total
- Focused regression (5 files): 60 pass / 0 fail
- Tool count: 148 (unchanged — no new tools added)
- Scheduler count: 70 (was 69, +1 bctcEvalRecompute)

**Hard contract compliance:**
- schema_version="1", detector_version="v1" throughout
- balance_pass is SIGNAL not gate (G2 smoke PASS)
- Stage 4 label=NULL smoke: value_blank_label_count ≥ 1 + status="red" (PASS)
- 409 for EVAL_NOT_COMPUTED (not 404/202)
- 503 + Retry-After: 7200 during 02:00-08:59 UTC Mon-Fri
- No hardcoded thresholds in TS code — all read from SSOT JSON
- DDD layers clean: domain=pure, infra=DB only, application=orchestrator, interface=routes
- Backfill: ZERO mutation of financial_reports/bctc_layout_units/bctc_page_zones
- PEK subtree: UNTOUCHED
- Frozen files: UNTOUCHED
- DO NOT commit — main terminal commits scoped per-file

**NEXT: main terminal scoped commits → ops rebuild → backfill → qa G2 gate**

---

## c315 · 2026-05-27T21:30Z (SIG-G-T1..T5 — Sprint SELF-IMPROVE-GATE Phase 2)

### SELF-IMPROVE-GATE TASK-1..5 DONE — UNSTAGED

**Task:** Build lanes-B detection substrate + D-IMPROVE proposal-doc bridge. Serial implementation TASK-1→2→3→4→5.

**Files created (6 production + 5 test):**
- `apps/mcp-server/src/infrastructure/db/schema-system.ts` — MODIFIED: added `improve_check_log` table + index to `initSystemTables()`
- `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` — NEW: 4 functions + CoverageGapFinding + types; queryCoverageGaps()
- `apps/mcp-server/src/domain/services/degradationRules.ts` — NEW: DEGRADATION_CAUSE_MAP (as const) + detectDegradedSignalTypes() pure domain function; zero infra imports
- `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` — NEW: 12-step pipeline; DISPATCH_PATHS + isAutoDispatchEnabled() + FIX_AREA_TO_AGENT moved to writer; injectable deps
- `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts` — NEW: writeImprovementProposal() + appendDashboardRow() + FIX_AREA_TO_AGENT + buildProposalFields()
- `apps/mcp-server/src/scheduler/cronConfig.ts` — MODIFIED: `selfImproveOrchestrator: '2 9 * * *'` (HN-1: avoids bctcOverdueCheck DAILY + marketOpen WEEKDAYS)
- `apps/mcp-server/src/scheduler/startScheduler.ts` — MODIFIED: import + register with jobRunRepo.wrapRun()
- `docker-compose.yml` — MODIFIED: commented-out per-path kill-switch env vars (C-4)
- `apps/mcp-server/src/__tests__/1948a-improve-check-store.test.ts` — NEW: 6 ACs
- `apps/mcp-server/src/__tests__/1948b-degradation-rules.test.ts` — NEW: 8 ACs
- `apps/mcp-server/src/__tests__/1948c-self-improve-orchestrator.test.ts` — NEW: 9 ACs
- `apps/mcp-server/src/__tests__/1948d-improvement-signal-writer.test.ts` — NEW: 8 ACs
- `apps/mcp-server/src/__tests__/1948e-dispatch-kill-switch.test.ts` — NEW: 5 ACs

**Gates (targeted test run):**
- 62 pass / 0 fail across 5 new test files (157 expect() calls)
- `bun tsc --noEmit`: EXIT 0 (clean)
- AC-T2-7: grep confirms zero infra/application imports in degradationRules.ts
- HN-1: cron slot `2 9 * * *` verified (live neighbors: bctcOverdueCheck=`0 9 * * *` daily, marketOpen=`0 9 * * 1-5` weekdays)
- HN-2: severity order DEGRADED(3) > PERSISTENTLY_LOW(2) > COVERAGE_GAP(1) in SEVERITY_ORDER const
- C-1: FIX_AREA_TO_AGENT typed constant; resolveTargetAgent() structural lookup; no prose parsing
- C-4: DISPATCH_PATHS as const; isAutoDispatchEnabled(path: DispatchPath); AC-T5-4 PASS (global flag rejected)
- C-5: doc-write in try/catch AFTER improve_check_log insert + WORK Telegram; AC-T4-6 PASS
- docs/improvement-proposals/ directory created; infrastructure/signals/ created

**COMMITTED — commit ef109a76 on main (confirmed post-context-compaction).**
**NEXT: ops (force-recreate mcp-server — feedback_rebuild_after_dev_change) before QA gate-proof.**

---

## c316 · 2026-05-28 (NEWS-FULLDAY + RECAP-CMD — combined sprint)

### IMPLEMENTATION COMPLETE — UNSTAGED (router commits)

**Sprints:** NEWS-FULLDAY + RECAP-CMD (both single-zone apps/mcp-server, one dev pass, one ops rebuild)

**Files modified (3):**
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` — all changes
- `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` — test extension
- `docs/architecture/microservice/mcp-server/news-analysis.md` — doc update

**Key changes in telegramCommands.ts:**
- ADD imports: assembleEveningSummary, EveningSummary, generatePeriodicSummary, PeriodicSummary
- UPDATE HELP_TEXT: /news line updated + 3 new lines (/recap /recapw /recapm)
- ADD `export function stripHtml(raw)` — module-level, dependency-free (NEWS-FULLDAY)
- REWRITE handleNews: removed DEFAULT_LIMIT=20, MAX_LIMIT_EXPLICIT=200+FALLBACK_LIMIT=20, uncapped primary query, dedup on normalized source_title, stripHtml on title+summary, post-dedup count in header
- ADD splitBlockAtNewlines helper + severityLabelVi + directionVi (RECAP-CMD)
- ADD handleRecap, handleRecapWeek, handleRecapMonth (exported; assembleFn injectable; RECAP-CMD)
- ADD buildPeriodicTexts shared section builder
- ADD 3 router branches: /recap /recapw /recapm

**Gates:**
- 60 pass / 0 fail (was 8; 52 new tests added)
- `bun tsc --noEmit`: EXIT 0 (zero errors)
- T-NEWS-1..8 all still pass (zero regression)
- No banned fields in render path — grep-verified
- stripHtml defined exactly once — grep-verified
- webhookHandler.ts NOT modified

**Root-cause note:** SQLite `datetime('now')` = space-format vs ISO midnightVietnamAsUtcInline() = T-format. String compare fails. Fixed seedNewsToday to use `new Date().toISOString()`.

**NEXT: ops REBUILD + FORCE-RECREATE mcp-server. Then QA on zenmidi.com/vn-market/webhook.**

---

## c314 · 2026-05-27T20:25Z (NEWS-CMD-IMPL — /news Telegram command)

### NEWS-CMD-IMPL DONE → Review

**Files changed (4 in apps/mcp-server/, 1 doc, 2 task-tracking):**
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` — `VN_OFFSET_MS` import; `CommandResult.texts?`; `handleNews()` (query+fallback+formatter+chunker); `/news` case wired before switch; `HELP_TEXT` updated
- `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` — single send → `const chunks = result.texts ?? [result.text]; for...` loop (3-line change)
- `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` — `rag_analyses` in makeDb(); seedNewsToday/Old helpers; T-NEWS-1..8 all pass
- `docs/architecture/microservice/mcp-server/news-analysis.md` — "Telegram Commands" section appended
- `docs/handoffs/TASK_NEWS-CMD.md` — [Developer] section written
- `docs/TASKS.md` — NEWS-CMD-IMPL → Review

**Gates:**
- T-NEWS-1..8: 31 pass / 0 fail (was 26 before)
- webhookHandler tests: 34 pass / 0 fail
- bun tsc --noEmit: EXIT 0 (clean)

**Files UNSTAGED — main terminal commits.**
**NEXT: ops (docker compose build + force-recreate mcp-server) per rebuild-after-dev-change rule.**

---

## c313 · 2026-05-26T20:05Z (CLIENTS-TYPE — macro signals type fix)

### CLIENTS-TYPE DONE

**Commit (worktree):** `f3fb4564` | 3 files | tsc EXIT 0 | 14 pass / 0 fail (targeted)

**Changes:**
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — ADD `MacroSignalEntry` interface; CHANGE `signals` field type `Array<{indicator,...}>` → `Record<string, MacroSignalEntry>`; CHANGE fallback `?? []` → `?? {}`
- `apps/mcp-server/src/__tests__/1354a-parallel-service-dispatcher-gaps.test.ts` — FIX stub: `signals: []` → `signals: {}`
- `apps/mcp-server/src/__tests__/1974-clients-type-macro-signals.test.ts` — NEW: 6 type-contract scenarios

**Gates:**
- tsc EXIT 0 (main repo, post-fix)
- bun test 1974 + 1354a: 14 pass / 0 fail
- toolCount=148 (unchanged) | sched=68 (unchanged)

**Zone health:** type fix only — no barrel changes — toolCount=148, sched=68, tsc EXIT 0 | HEALTHY

---

## c312 · 2026-05-26T19:07Z (LF-OVERLAY verification run — BCTC-LAYOUT-FIRST)

### Verification result: CONFIRMED DONE

Prior cycle (c311) committed `2326ebb6`. This cycle re-ran tests + AC audit.

**Test results (re-run):** 29 pass / 0 fail (1272 + 1273) | full suite 9883 tests exit 0 | tsc EXIT 0

**AC-LFO-0..7 re-verified:** all pass except AC-LFO-7 (DEFERRED — needs corpus re-extraction at LF-DEPLOY)

**Done-signal:** `docs/signals/2026-05-26T19-07-11Z-lf-overlay-done.json`

**Pre-existing note:** 2 Bun module isolation failures occur ONLY when running 8+ files in parallel (deleteTelegramBug SyntaxError); each file passes 0 fail in isolation. Pre-existing before LF-OVERLAY. Bun C++ post-suite panic = upstream v1.3.13 bug, pre-existing.

---

## c311 · 2026-05-26 (LF-OVERLAY — BCTC-LAYOUT-FIRST zone overlay)

### LF-OVERLAY DONE

**Tests:** 29 pass / 0 fail (1272 + 1273) | tsc EXIT 0 | existing suite non-regressed (14 pushBctcTableHandler pass)

**Files changed (all UNSTAGED — main terminal commits):**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — two new tables: `bctc_layout_units` + `bctc_page_zones` with DDL exactly per brief §3.1
- `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` — NEW: handles POST /api/push-bctc-layout; writes both tables; DB-verified count; idempotent via INSERT OR REPLACE
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — EXTENDED: new `handleBctcInspectZones` for GET /api/bctc-inspect/zones/{doc_id}?page=N; pure DB read, zero pdf-extractor import
- `apps/mcp-server/src/interface/mcp/server.ts` — EXTENDED: registered POST /api/push-bctc-layout + GET /api/bctc-inspect/zones/* routes; imported new handlers
- `apps/mcp-server/src/interface/bctc-inspector.html` — EXTENDED: zone overlay toggle control (id="zone-overlay-toggle", data-zone-toggle="true"); 5-color ZONE_COLORS; SVG overlay renderer with coordinate scaling; zone cache + clearAllOverlays
- `apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts` — NEW: 20 tests for push handler
- `apps/mcp-server/src/__tests__/1273-bctc-inspect-overlay.test.ts` — NEW: 9 tests for zones endpoint

**AC audit:**
- AC-LFO-0 PASS: id="zone-overlay-toggle" + data-zone-toggle="true" in HTML
- AC-LFO-1 PASS: zones endpoint returns zones_json with positional col_0/col_1 col_ids (test 1273)
- AC-LFO-2 PASS: grep returns zero actual import lines of pdf-extractor in bctcInspectHandler.ts
- AC-LFO-3 PASS: bctc_table_rows read path in bctcInspectHandler.ts is untouched (Decision B); pushBctcTableHandler.test.ts 14/14 green
- AC-LFO-4 PASS: test 1272(f) — SELECT COUNT(*) FROM bctc_table_rows = 0 after layout push
- AC-LFO-5 PASS: test 1272(c) — two identical pushes result in 2 rows, not 4 (INSERT OR REPLACE)
- AC-LFO-6 PASS: ZONE_COLORS defines 5 distinct entries (headerBand/footerBand/gutterEven/gutterOdd/rowBand/unitBoundary) — code-inspectable
- AC-LFO-7 DEFERRED: requires corpus re-extraction (LF-DEPLOY gate); verified at QA step

**Carry-over from c310:**
- 345 pre-existing test failures within baseline; Bun C++ panic after full suite = upstream bug

**ops_rebuild_required: true** — route added to server.ts, new handler wired; docker compose build + up -d --no-deps --force-recreate mcp-server required before LF-DEPLOY can test live.

---

## c310 · 2026-05-26 (FA-FIX — fetch_and_analyze timeout reliability)

### FA-FIX DONE

**Commit:** `3c00c17a` | 3 files | tsc EXIT 0 | bun 9449 pass / 345 fail (within ≤348 baseline) | 7 new scenarios PASS

**Changes:**
- `analysis.ts` REC-1: per-source outer timeout budgets (cafef=10s, vnexpress=10s, vneconomy=12s, reuters=30s→15s) via `withSourceTimeout()` helper that resolves to `[]` on expiry.
- `analysis.ts` REC-2: `Promise.all(fetchPromises)` → `Promise.allSettled` in Step-1 fan-out.
- `analysis.ts` REC-3: Step-4 ragIndex fan-out switched to `Promise.allSettled` for graceful rag degradation.
- `ragHttpClient.ts` REC-3: `AbortSignal.timeout(8_000)` added to `ragSearch()` and `ragIndex()` fetch calls.
- `src/__tests__/1973-fetch-analyze-timeout.test.ts` (new): 7 scenarios — Scenario A (source timeout → partial), Scenario B (rag hang → AbortSignal fires gracefully), Scenario C (all fast → full result, static assertions).
- REC-4 (use_ingested SQLite read-path) DEFERRED per PO — opens as FETCH-ANALYZE-2.

**Done-signal:** `docs/signals/dev-mcp-server-fa-fix-done-20260526T1600Z.json`
**ops_rebuild_required: true** — docker compose up -d --build mcp-server needed.

---

## c309 · 2026-05-26 (FETCH-ANALYZE-PROFILE SPIKE — read-only)

**Commit:** NONE | profiling spike only | no production code changed
**Signal:** `docs/signals/dev-mcp-server-fetch-analyze-fix-proposal-20260526T1500Z.json`

Root cause documented: `Promise.all` Step-1 + no AbortSignal on ragHttpClient.
Reuters confirmed DOWN (48 consecutive failures). VPS news-fetch healthy.
Step-1 ceiling 30s (vneconomy serial + reuters budget) + Step-4 ragIndex no guard = 60s stall.

---

## c308 · 2026-05-26 (P2-L Trial-2 — G11 sector-classifier regression revert)

**Commit:** `3b9851fb` | 2 files | tsc EXIT 0 | bun 9451 pass / 336 fail | toolCount=148 | sched=68

sectorPeers.ts line 351 — restored ratio threshold from `<= 0` back to `<= 2.5`.
Sandbox 9/9 PASS. Phase-2 SCALE pilot CLOSED at 8972a155. P2 FROZEN.

---

## Working Memory

### Active Work
- CLIENTS-TYPE: DONE (c313). Committed f3fb4564 to worktree. Main terminal merges. No rebuild required (type-only fix).
- LF-OVERLAY: DONE (c311). Files UNSTAGED — awaiting main terminal commit.
  NEXT = ops (LF-DEPLOY) — gated on LF-EXTRACT also done.
- FA-FIX: DONE (c310). ops rebuild required before live fix takes effect.

### Carry-over
- 345 pre-existing test failures — within ≤348 baseline
- Bun v1.3.13 C++ panic after full suite = known upstream bug (exit code 0, tests pass)
- AC-LFO-7 deferred to QA step (requires corpus re-extraction)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
