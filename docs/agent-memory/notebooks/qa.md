# QA — Notebook

## cycle-225 · 2026-06-11 · GFD-11 GO-FLEET-DEPLOY full-fleet verification gate — PARTIAL (service PASS, 2 pre-existing test bugs)

Sprint: GO-FLEET-DEPLOY | Task: GFD-11 | Verdict: PARTIAL | Report: reports/TASK_REPORT_GFD-11.md

6/6 service-level /health probes independently confirmed LIVE (HTTP 200, raw curled). rag-service lazy-load: 12/12 pytest PASS (model_loaded=true, state=warm, index_size=16392, OOMKilled=false). news-fetch 2 pkg PASS. kinh-dich-service 6 pkg PASS. technical-analysis 7 pkg PASS. alert-engine: 6/7 pkg PASS — FAIL: TestSQLiteAlertRepository_CountTodayAlerts (sqlite_test.go:190, pre-existing TZ mismatch: CountTodayAlerts uses now.Location()/CEST, test inserts UTC timestamps). stock-price: 6/7 pkg PASS — FAIL: TestSQLiteRepo_GetHistory_OHLCFieldParity (fetchers_test.go:252, pre-existing hardcoded seedDate=2026-05-22 outside 7-day query window). Both failures pre-date GO-FLEET-DEPLOY delta — confirmed by grep of sprint commits. DDD PASS: all 6 services ports+adapters, no domain->infra leaks. Security PASS: no secrets/process.env; POST fetch endpoints internal-ops only; /health read-only. Deferred to GFD-12: system-map update, api-gateway env+rebuild, Axis-A flip. po CLEARED to run GFD-12. DJ-GATE-1: sprint-GO-FLEET-DEPLOY-qa.md § qa-S1.

## cycle-224 · 2026-06-10 · CI-RED CLUSTER-A sprint_goal schema drift fix — APPROVED GREEN

Sprint: CI-RED-RECONCILE | Task: CI-RED-CLUSTER-A | Verdict: DATA-DRIFT-FIXED | Checks cleared: CI-TEST-02, MCP-TEST-01, SYS-TEST-01, CI-TEST-04

Probe: `bun test 1338-sprint-goal-retrospective.test.ts` isolated — 2 pass / 1 fail BEFORE fix. Exact failure: `entries.length` = 0 (sprint_goal was a plain string). Both production code (orchestrationHandler.ts projectSprintGoal L212-229) and test agreed on canonical `{entries:[{sprint_id,...}]}` shape. Drift was in DATA. Migrated orch-state.json .sprint_goal from plain string to canonical entries[] object (CI-RED-RECONCILE OPEN + BCTC-PROSE-EXTRACT CLOSED). Atomic temp-rename write, verified non-empty + valid JSON. Re-ran: 3 pass / 0 fail / 1 skip — ALL GREEN. DJ-GATE-1: sprint-CI-RED-RECONCILE-qa.md § qa-S1.

## cycle-223 · 2026-06-10 · BPE-QA-1 RE-VERIFY BCTC-PROSE-EXTRACT final E2E gate — APPROVED GREEN

Sprint: BCTC-PROSE-EXTRACT | Task: BPE-QA-1 (round 2) + BPE-DEV-5 | Verdict: APPROVED | Report: reports/TASK_REPORT_BPE-QA-1.md

pdf-extractor Up 9 min (healthy), mcp-server Up ~1h (healthy), 8 peers intact. RAW-VERIFIED. A-LAYOUT: 19 units total, empty_count=0 (was 13). 14 table units: stitched_markdown 768–12674 chars; spot-checked [3-6]=7175 balance-sheet rows (codes 100/110/111/112), [7-9]=7030 income-stmt rows. 5 prose units unchanged: page 12=4099 chars, quarantined=0. B-QUARANTINE: source audit L527-554 bctcInspectHandler.ts — stitched_markdown served if non-empty regardless of quarantined=1. Live: page 3 text=7175 quarantined=True pek_coverage_gap=None; page 7 text=7030 quarantined=True. C-SERVING: pp.3,7,12,16,23,30,40,46 all non-empty, total_pages=46. D-EVAL: overall_status=red stage1 RASTERIZE — instrumentation artifact: eval_push_client.py double-encodes gate_failures/metrics as JSON strings; push handler strips to []/{}; status=red preserved; gate_failures=[]. Pre-existing bug, eval_push_client not in BPE-DEV-5 diff. Does not block content serving. E-TESTS: 45/45 new tests PASS (code_whitelist 16, bs_identities 22, tesseract_retry 5). 36 full-suite failures = pre-existing asyncio isolation. DDD PASS. Security PASS. mock-guard EXIT 0. F-INTEGRITY: peers DGC/DIG/VNM/BSR/DHG/EIB/SHB/VEA all unchanged. BPE-QA-1 DONE, BPE-DEV-5 DONE. Sprint BCTC-PROSE-EXTRACT DoD met. CAUTION: eval_push_client double-encoding needs backlog fix. DJ-GATE-1: sprint-BCTC-PROSE-EXTRACT-qa.md § qa-S5.

## cycle-222 · 2026-06-10 · BPE-QA-1 BCTC-PROSE-EXTRACT final E2E gate — CHANGES_REQUESTED

Sprint: BCTC-PROSE-EXTRACT | Task: BPE-QA-1 | Verdict: CHANGES_REQUESTED | Report: reports/TASK_REPORT_BPE-QA-1.md

Container: mcp-server Up 28 min (healthy), 8 peers intact, pdf-extractor unhealthy pre-existing. RAW-VERIFIED (no badge relay). A-PROSE PASS: page 12 text_content=4099 chars, has_pek:true, pek_coverage_gap:null, confidence:1.0 — original defect resolved. total_pages=46 everywhere (GAP-1 confirmed). Spot-check pp.16,23,30,40,46 all non-empty (794-5706 chars). pdf_extracted_text FPT: 46/46 pages present, all pages 11-22 + 36-46 present with len 1013-7449, conf=0.8. B-TABLE REGRESSION: bctc_layout_units for e8ea3df5 has 18 units total. ONLY 5 non-empty (all prose: schema_pages 12,15,16,18,30). 13 EMPTY (all table: schema_pages 1-6,7-9,10,11,13-14,20,21-28,29,31-34,35,36,37-41,42-46). Table pages 1-10 serve pek_coverage_gap:true + raw OCR fallback — no structured table content. Other reports (DGC/DIG/VNM/EIB/SHB/DHG/BSR/VEA) all empty=0 for their layout units — regression is FPT Q1-2026 specific. DJ-GATE-1: sprint-BCTC-PROSE-EXTRACT-qa.md § qa-S4. orch-state BPE-QA-1 READY→CHANGES_REQUESTED, BPE-DEV-5 created (READY).

## cycle-221 · 2026-06-10 · BPE-DEV-3 BCTC-PROSE-EXTRACT OCR coverage fixes gate — APPROVED

Sprint: BCTC-PROSE-EXTRACT | Task: BPE-DEV-3 | Verdict: APPROVED | Commits: 5ea9f121 + ef9826d7

QA re-ran: 15/15 BPE-DEV-3-ocr-coverage-fixes.test.ts GREEN (31 expect() calls). Regression: pek-render-seam 12/12, bctcInspectHandler 13/13, PROSE-DEV-1 5/5, 292-ocr-audit 24/24, 1352c-ocr-health-logging 20/20 — all pass individually. Full suite exit 0 (background run confirmed). Batch-run 4 failures = Bun 1.3.13 isolation pre-existing. tsc --noEmit: EXIT 0. Fence GENUINE: COUNT=35 vs MAX=46 in test fixture; assert 46 → FAIL on revert to COUNT confirmed via arithmetic probe. GAP-1 SQL: all 3 total_pages sites use MAX(page_number) with `?` placeholder; non-PEK point-lookup WHERE page_number=? parameterized. GAP-3: finalText.length < 3 in source; no active `} else if (pageText.length < 10)` branch; DPI=300 escalation present; logger.warn `[ocr] page` present. RISK-OCR-2: confidence<0.1 guard at L584 confirmed. DDD PASS: interface+infra layers only; domain unchanged; application import pre-existing from BPE-DEV-2. Security PASS: no process.env, no secrets. mock-guard EXIT 0. Container e50369dc healthy (Up 13 min, image sha256:e50369dc confirmed). 6 peers intact. Bare catch at pdfOcrWorker L304 new+justified (DPI escalation best-effort). DJ-GATE-1: sprint-BCTC-PROSE-EXTRACT-qa.md qa-S3. orch-state BPE-DEV-3 REVIEW→DONE, BPE-OPS-1 BLOCKED→READY.

## cycle-220 · 2026-06-10 · BPE-DEV-2 BCTC-PROSE-EXTRACT prose consumer/serving gate — APPROVED

Sprint: BCTC-PROSE-EXTRACT | Task: BPE-DEV-2 | Verdict: APPROVED | Commit: 5cea706a

QA re-ran: 12/12 PROSE-UNIT-SERVE tests GREEN (live). 29/29 (240-bctc-full + pek-render-seam) GREEN. 54/54 across 4 critical files GREEN. tsc clean. Fence test: TC-2 assertion genuine — would fail if filter reverted to 'table'. AC-1: IN('table','prose') L519 confirmed. AC-2: empty-prose fallthrough correct — gap=true only when no content. AC-3: prose_sections query L1163-1202 with 4000-char cap, quarantine filter, ASC sort confirmed. BLOCKER-4: no new tool registration (diff verified). DDD PASS. Security PASS. mock-guard EXIT 0. Full bun test OOM crash pre-existing (Bun 1.3.13). REBUILD REQUIRED before end-to-end round-trip against real producer data. DJ-GATE-1: sprint-BCTC-PROSE-EXTRACT-qa.md § qa-S2. orch-state BPE-DEV-2 REVIEW→DONE.

## cycle-219 · 2026-06-10 · BPE-DEV-1 BCTC-PROSE-EXTRACT prose producer gate — APPROVED

Sprint: BCTC-PROSE-EXTRACT | Task: BPE-DEV-1 | Verdict: APPROVED | Commits: 1588a591 + 6e518935

QA re-ran: 16/16 prose tests GREEN (test_generic_extractor_prose.py). 45/45 table prerequisite tests GREEN. Full suite: 911 pass / 40 fail — 40 pre-existing (pytest-asyncio event-loop isolation; all fail individually pass in isolation + as group; none in diff). BLOCKER-3 serial order: 1588a591 (table work) → 6e518935 (prose fix) — git log confirmed. DDD PASS: domain/primitives (bctc_code_whitelist, layout_invariants) import stdlib only. Security PASS. Fence test: ocr_unit() with non-empty ocr_pages returns non-empty stitched_markdown; assertion genuine (would fail if prose_lines never appended). AC-1..AC-5 all verified against committed source. RISK-5 audit: zero assert_called_with on ocr_unit. DJ-GATE-1: sprint-BCTC-PROSE-EXTRACT-qa.md § qa-S1. orch-state BPE-DEV-1 REVIEW→DONE.

## cycle-218 · 2026-06-08T15:35Z · DFR-P3-MCP directed final acceptance gate — APPROVED + SPRINT COMPLETE

Sprint: DEEPFETCH-RAG-REDESIGN | Task: DFR-P3-MCP | Verdict: APPROVED | Commit: 4af297b2 (5 files)

5/5 ACs PASS. tsc --noEmit EXIT:0 host. DDD PASS (ragHttpClient.ts = infrastructure, zero domain→infra violations). Security PASS (no process.env, no secrets). AC-P3M-1: `hybrid?: boolean` at ragHttpClient.ts line 35. AC-P3M-2: runImpactChain.ts line 243 + runPredictionImpactChain.ts line 225 both pass `hybrid: true`. AC-P3M-3: analysis.ts lines 540-545 bctc-analyst `hybrid: true`. AC-P3M-4: pollNews.ts line 459 comment confirms hybrid intentionally omitted (vector-only). AC-P3M-5: pollNews ragSearch call unchanged (no hybrid field). Live E2E smoke: POST localhost:5002/search hybrid:true → HTTP 200, 3 results, no 500. wiring: JSON.stringify(request) passes hybrid through ragHttpClient.ts → rag-service. 47/47 targeted tests PASS. 3 pre-existing 1332 failures (cron_job_runs schema gap) confirmed same as qa-S3 — not in 4af297b2 diff. bun test full suite EXIT:0 (WriteFailed crash pre-existing Bun v1.3.13). DJ-GATE-1: sprint-DEEPFETCH-RAG-REDESIGN-qa.md STEP qa-S5 written. DFR-P3-MCP done-code→DONE. Sprint DEEPFETCH-RAG-REDESIGN: active→completed (all 16 tasks DONE/approved, 5 DFR-P* exactly-once verified).

## Archive
Older cycles (189–199 and earlier) moved to [qa-20260606.md](../../archive/notebooks/qa-20260606.md).

## cycle-211 · 2026-06-07T14:00Z · TSU-DEV-U2-PARITY QA gate — APPROVED (FINAL GATE)

Sprint: TOOL-SURFACE-UPGRADE | Task: TSU-DEV-U2-PARITY | Verdict: APPROVED | Commits: 7feffc50 + 768759a3

Four-count QA-reproduced: gen-tool-registry.ts→157 (12 groups), /health→157, parity test 8/8 pass (24 assertions), project-stats dry-run→157. Delta=0. tsc --noEmit: exit 0. DDD/security/mock-guard: Smart-Skip (JSON data files only, no production TS source modified). 5 deregistered tools absent from registry confirmed (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day). Individual suites re-run: U1 8/8, U3 12/12, U5 10/10, U6 17/17, parity 8/8 = 55/55. Bun v1.3.13 full-suite crash confirmed pre-existing (first doc 2026-05-13 archives, multiple sprints before TSU). BCTC eval gate N/A. U6 concurrency check: DONE — no contention. All 6 ACs verified. orch-state TSU-DEV-U2-PARITY REVIEW→DONE. Sprint TOOL-SURFACE-UPGRADE all units DONE.

## cycle-210 · 2026-06-07T13:30Z · TSU-DEV-U6 QA gate — APPROVED (code gate)

Sprint: TOOL-SURFACE-UPGRADE | Task: TSU-DEV-U6 | Verdict: APPROVED | Commits: 3dd0d7bd + ac1043a4

bun test U6: 17/17 pass (QA-reproduced). bun test parity: 8/8 pass. Combined U3+U5+U6+parity: 47/47 pass. tsc --noEmit: exit 0 (QA-reproduced). DDD PASS: interface→infra permitted; no domain→infra violations. Security PASS: no process.env, no secrets in 8 modified files. mock-guard exit 0. All 7 ACs verified against committed source. Factual accuracy: news handler zero tickers (AC-U6-3 "NO tickers" accurate); insider_signals handler _testData??[] (no DB call, AC-U6-6 accurate); tool-registry.json totalCount=157 unchanged; marketTools.ts+technicalIndicatorTools.ts pre-existing descriptions confirmed passing (not in commit diff). Smart-Skip applied (description-only, no logic, no mock risk). orch-state TSU-DEV-U6 REVIEW→DONE.

## cycle-209 · 2026-06-07T13:00Z · TSU-DEV-U3 QA gate — APPROVED (code gate)

Sprint: TOOL-SURFACE-UPGRADE | Task: TSU-DEV-U3 | Verdict: APPROVED (code-approved, live-verify pending sprint-final rebuild)

bun test TSU-DEV-U3-weak-claim-tools.test.ts: 12/12 pass (QA-reproduced). bun test tool-registry-parity.test.ts: 8/8 pass (QA-reproduced). tsc --noEmit: exit 0 (QA-reproduced). DDD PASS: interface→infra imports permitted; no domain→infra violations in 12 modified files. Security PASS: no process.env, no secrets in all 12 modified files. mock-guard exit 0. Deregister verification: server.tool() absent for all 5 tools in source; no-op stubs remain in registry.ts (harmless, call void _server only). readFileSync correctly removed from reports.ts (readdirSync+statSync retained for list_stored_pdfs). Registry diff: 162→157 (exactly 5 removals verified). 7 integrate tools all present in registry. Signal row tsu-u3-tool-deregister-signal-20260607 confirmed in orch-state signal_queue status=NEW. Commits 50772c2a + 57774c6b on main. orch-state TSU-DEV-U3 REVIEW→DONE.

## cycle-208 · 2026-06-07T12:00Z · TSU-DEV-U5 QA gate — APPROVED (code gate)

Sprint: TOOL-SURFACE-UPGRADE | Task: TSU-DEV-U5 | Verdict: APPROVED (code-approved, live-verify pending sprint-final rebuild)

bun test TSU-DEV-U5-*.test.ts: 10/10 pass (QA-reproduced). tsc --noEmit: exit 0 clean. DDD PASS: foreignFlowAnalyzer.ts (domain/services) zero imports from infrastructure/application. Security PASS: no process.env, no secrets in 3 modified files. mock-guard exit 0. No bare catch. AC-U5-1..U5-7 all verified against committed code. DSI edge-case verified: all-zero heuristic correct — VPS API never returns holding_ratio field, vnstockStore ?? 0 applies to all tickers; genuinely-zero tickers would be false-null (acceptable) not false-real (DSI violation). Reasoning string gate confirmed honest. Commits c21cec46 + 43894aaf on main. orch-state TSU-DEV-U5 REVIEW→DONE.

## cycle-207 · 2026-06-07T08:50Z · TSU-DEV-U4 QA gate — APPROVED

Sprint: TOOL-SURFACE-UPGRADE | Task: TSU-DEV-U4 | Verdict: APPROVED | Commit: 9880eadc

go test -count=1 ./...: 12/12 packages PASS. go vet: 0 errors. Live POST :5004/snapshot confirmed: vnIndexDelta=7.35, vnIndexDirection="up", oilUsdDelta=null/unknown, goldUsdDelta=null/unknown, usdVndDelta=null/unknown. Gateway passthrough MCP :3000 confirmed: all 8 new fields in served payload — TS tool is thin proxy (passthrough verified, not just endpoint). Additive-only: dtos.go diff = additions only, no field renames or removals (AC-U4-7 PASS). DDD clean: domain/ports.go imports context+time only. Security clean. T-U4-1..T-U4-7 all present + contract test stubs updated. mcp-server: RestartCount=0, healthy — "Up 21 seconds" ops note was rebuild restart, not crash-loop. orch-state TSU-DEV-U4 REVIEW→DONE.

## cycle-206 · 2026-06-07T10:00Z · TSU-DEV-U1 QA gate — APPROVED (code gate)

Sprint: TOOL-SURFACE-UPGRADE | Task: TSU-DEV-U1 | Verdict: APPROVED (code-approved, live-verify pending sprint-final rebuild)

bun test (3 suites): 24/24 pass. tsc --noEmit: 0 errors (1 pre-existing in U2-GEN scope, not U1). DDD PASS: perCallCounterStore.ts has no imports (pure Map singleton). Security PASS: no process.env in U1 files (pre-existing at server.ts:284 out of scope). Proxy analysis: increment-before-execute design correct — handler throws propagate naturally; outer installation catch intentional (best-effort, server creation must not block). No double-count risk: per-request McpServer instance gets its own proxy, all share singleton counterStore. AC coverage: AC-U1-1..U1-7 all verified against code. AC-U1-8 (live QA gate) deferred to sprint-final rebuild per handoff instruction. orch-state REVIEW→DONE.

## cycle-205 · 2026-06-07T08:30Z · TSU-DEV-U2-GEN QA gate — APPROVED

Sprint: TOOL-SURFACE-UPGRADE | Task: TSU-DEV-U2-GEN | Verdict: APPROVED | Commits: a5b34816 / 2069158c / 5c63741b | Summary: 8/8 bun tests GREEN; tsc exit 0; DDD/security clean; 9 ACs verified.

## cycle-204 · 2026-06-07T04:10Z · FIX-ORCH-KEY-NORMALIZE-TASKID QA gate — APPROVED

Sprint: backlog FIX | Task: FIX-ORCH-KEY-NORMALIZE-TASKID | Verdict: APPROVED | Commit: f0db4387 | Summary: AC1–6 all PASS; tsc errors reduced 5→3 (cleared 2 janitor violations); 4-file commit (tasksMdJanitorJob.ts/orch-state.json/handoff/task-schema.md).

## cycle-203 · 2026-06-07T02:50Z · CLEAN-DEAD-SOURCE-IDS QA gate — APPROVED

Sprint: FLEET-HOST-SAFETY (BATCH-5) | Task: CLEAN-DEAD-SOURCE-IDS | Verdict: APPROVED | Commit: d267e997 | Summary: 8 new tests + 21 regression GREEN; 6 dead sources blacklisted via NOT IN; read-time HAVING filter (no DELETE).

## cycle-202 · 2026-06-07T02:05Z · FIX-SLA-EXEMPT-NEWS-SBVFX QA gate — APPROVED

Sprint: WORKFLOW-FLUIDITY | Task: FIX-SLA-EXEMPT-NEWS-SBVFX | Verdict: APPROVED | Summary: 52/52 tests GREEN (31 new + 21 baseline); quiet-hours + publish-window exempts verified; news 15:00 UTC + sbv trading-day gates correct.

## cycle-201 · 2026-06-07T01:30Z · WORKFLOW-FLUIDITY WF-2 QA gate — APPROVED

Sprint: WORKFLOW-FLUIDITY | Task: WF-2 | Verdict: APPROVED | Commits: 8a469655/548534da | Summary: CAS logic orchStateStore + 12/12 tests; T2 single-collision retry OK, T3 exhausted-retries WARN; signal-dashboard SKILL 3-writer warning blocks.

## cycle-200 · 2026-06-07T00:15Z · FETCH-OPS-PAGE-TRUTH F-4 QA gate — APPROVED

Sprint: FETCH-OPS-PAGE-TRUTH | Task: F-4 | Verdict: APPROVED | Summary: +24L additive server.ts; F-1 21/21 PASS; Go 10 packages PASS; all 5 alias paths 200 OK on :3000 + :4000.

## Baselines (standing notes)

- Agent: QA (unified-append mode, ≤200L notebook)
- Latest sprint: TOOL-SURFACE-UPGRADE (TSU-DEV-U1/U3/U4/U5), cycles 209–206 (2026-06-07)
- Archive pattern: Older sprints (FETCH-OPS, WORKFLOW-FLUIDITY, DSI, RAPID-DATA-LAYER, BCTC-LF, ORCH-DASH) in qa-20260606.md

## cycle-190 · 2026-06-07T00:00Z · FIX-PROJECT-STATS-GENERATED — APPROVED

Sprint: FIX-PROJECT-STATS-GENERATED | Task: FIX-PROJECT-STATS-GENERATED | Verdict: APPROVED | Commit: 4d753736

**Tests run:** N/A (utility script — no MCP tool or domain code; no bun test/tsc scope). DDD: N/A. Security: N/A. Mock-guard: N/A.

**All 7 ACs passed.** Generator exits 0, idempotent (zero diff on 2nd run). toolCount=162 confirmed by own grep (161 server.tool + 1 registerTool) and live /health endpoint. cronJobCount=76 confirmed by own grep (startScheduler.ts=71 + summaryJobs.ts=5). Fail-loud: 9 throw paths, no silent swallow. _generated_by marker present. Commit scope exactly 7 files, no src changes. System-auditor edit only touches step #6. orch-state REVIEW→DONE.

**Next:** dev-pdf-extractor | fix build_document_map() Tier 0 for 3 blocks above.

## cycle-217 · 2026-06-08T15:30Z · DFR-P2/P3 DEEPFETCH-RAG-REDESIGN Phase 2+3 directed acceptance gate — ALL 4 APPROVED

Sprint: DEEPFETCH-RAG-REDESIGN | Tasks: DFR-P2-MCP, DFR-P2-VPS, DFR-P2-MAIN, DFR-P3-RAG | Verdict: ALL APPROVED | 26 ACs total

DFR-P2-MCP: 10/10 ACs PASS. Schema (deep_fetch_queue + deep_fetch_stats) live in container market.db. UNIQUE(source_url) dedup LIVE-verified (second INSERT OR IGNORE → 0 changes). Cap enforcement LIVE-verified (15 rows → pollPending(10) returns 10). Domain daily cap wired (cafef.vn@50 → checkDomainDailyCap=false). 4h stale expiry: pollPending WHERE filter + isStale() inline. Gate injection non-fatal (try/catch lines 1017-1068 in pollNews.ts). reindexDeep() uses _deep suffix + table.add() only. DDD PASS (deepFetchGate.ts zero infra imports). Security PASS (Bun.env, no process.env). tsc EXIT:0. 28/28 tests pass.

DFR-P2-VPS: 4/4 ACs PASS. LIVE: vnexpress.net → status=ok, body_text=3354 chars, title="VN-Index giảm gần 50 điểm". SSRF guard: evil.com → domain-not-allowed. cafef.vn still routes correctly. Plain HTTP only.

DFR-P2-MAIN: 4/4 ACs PASS. LIVE: POST localhost:5008/fetch-article vietnambiz.vn → HTTP 200, 8000 chars. SSRF guard: evil.com → HTTP 400. 233/233 tests pass. ALLOWED_DOMAINS config-driven.

DFR-P3-RAG: 8/8 ACs PASS. LIVE hybrid=true → 4 results, BM25 reranking visible (different order from vector-only). /admin/rebuild-fts → ok. 2-call FTS confirmed. .nearest_to_text() pattern confirmed. 35/35 P3 + 130/130 total tests pass. rag_entries 14173.

CLEANUP: Queue=0, no QA rows remain. ORCH-STATE: 4 tasks → DONE. DFR-P3-MCP BLOCKED→READY. All 5 DFR-P* exactly-once. DJ-GATE-1 → sprint-DEEPFETCH-RAG-REDESIGN-qa.md STEP qa-S4.

## cycle-216 · 2026-06-08T14:28Z · DFR-P1-MCP DEEPFETCH-RAG-REDESIGN Phase 1 MCP gate — APPROVED

Sprint: DEEPFETCH-RAG-REDESIGN | Task: DFR-P1-MCP | Verdict: APPROVED | Commit: 4b8f1845 (6 files, mcp-server)

Container rebuilt image 13:55Z, /health 200 toolCount 157. All MCP-layer ACs verified live (raw). FR6: body_text TEXT at cid=21 (PRAGMA via bun eval), 5560 rows intact, NULL existing, INSERT ok, idempotent (duplicate column name caught). FR4: mcp.config.json decayHalfLifeDays {news:2,macro:7,filing:30,analysis:14} — 4 keys, pollNews.ts line 454 reads cfg.rag.decayHalfLifeDays.news (not hardcoded). FR5: live /index+/search roundtrip — news rows doc_type=news/shallow/cafef.vn/VCB PASS; filing rows doc_type=filing/HPG/bctc.ssi.com.vn PASS. FR3-mcp: tsc --noEmit EXIT:0 host+container. Tests: 1840a 3/0 PASS, BCTC+SBV 58/0 PASS. 1332 failure pre-existing (file not in 4b8f1845 diff; cron_job_runs schema gap). Bun v1.3.13 crash pre-existing. Cleanup: rag_analyses 5560 restored, LanceDB 14127 (QA rows deleted). DFR-P1-MCP → DONE. Phase 1 COMPLETE.

## cycle-215 · 2026-06-08T11:30Z · DFR-QA-1 DEEPFETCH-RAG-REDESIGN Phase 1 RAG gate — APPROVED (re-verify round 2)

Sprint: DEEPFETCH-RAG-REDESIGN | Task: DFR-QA-1 | Verdict: APPROVED | Fix commit: 92aa2700

Pre-flight: container healthy port 5002, in-container grep confirms all 8 fields in apply_temporal_decay() constructor (services.py lines 80–87). 105/105 tests PASS (host + suite).

AC-FR2-4 PASS: POST /index (ticker=VCB, doc_type=filing) → POST /search → response carries ticker="VCB", doc_type="filing" — no longer stripped to defaults. AC-FR3-2 PASS: ticker=VCB filter → all results carry ticker="VCB" (not ""), HPG absent. AC-FR3-3 PASS: doc_type=filing filter → all 3 results carry doc_type="filing" (not "news"). Backward-compat smoke: /index 6-field → 200 ok; invalid depth_tier → 400; count non-destructive. Cleanup: QA test rows deleted (id LIKE qa-test-%/qa-retest-%/qa-compat-%). Row count after cleanup: 14028 (baseline restored). orch-state: DFR-P1-RAG + DFR-QA-1 → DONE. DJ-GATE-1 step appended to sprint-DEEPFETCH-RAG-REDESIGN-qa.md.

## cycle-214 · 2026-06-08T13:xxZ · DFR-QA-1 DEEPFETCH-RAG-REDESIGN Phase 1 RAG gate — CHANGES_REQUESTED

Sprint: DEEPFETCH-RAG-REDESIGN | Task: DFR-QA-1 | Verdict: CHANGES_REQUESTED | Round: 1

Scope: DFR-P1-RAG (rag-service) only — DFR-P1-MCP OUT OF SCOPE (not built). Live container port 5002, image rebuilt 13:06:53Z, commit 76a02b0d + b94e5342.

PASS: AC-FR1-1 (16 cols raw-verified), AC-FR1-2 (14028 rows, zero data loss), AC-FR1-3 (backward compat no new params), AC-FR1-5 (idempotent restart, no add_columns errors), AC-FR2-1 (6-field legacy index HTTP 200), AC-FR2-2 (14-field index: LanceDB raw shows ticker=VCB, doc_type=filing, confidence=0.85 correctly stored), AC-FR3-1 (no new params same result set), AC-FR3-4 (invalid depth_tier → HTTP 400), NFR test count 104/104 PASS.

FAIL: AC-FR2-4, AC-FR3-2, AC-FR3-3 — single root cause: `apply_temporal_decay()` in `apps/rag-service/domain/services.py` lines 70-81 reconstructs SearchResult objects WITHOUT the 8 Phase 1 metadata fields. All metadata resets to defaults on every search response. Test gap: `test_original_fields_preserved` checks only legacy fields — bug invisible to suite. Fix: pass ticker/sector/source_domain/depth_tier/doc_type/published_at/confidence/impact_score in the new SearchResult constructor + add regression test. DJ-GATE-1 written to sprint-DEEPFETCH-RAG-REDESIGN-qa.md.

## cycle-213 · 2026-06-08T08:51Z · A20-EVENTLOOP-ASYNC-TO-THREAD multi-probe acceptance gate — PASS

Sprint: ORCH-DASH-DECISION-DRILLDOWN | Task: A20-EVENTLOOP-ASYNC-TO-THREAD | Verdict: PASS

Fix verified LIVE in container (commit 8ca79007, rebuilt 08:33:27Z). `asyncio.to_thread` confirmed at lines 46+58 of `/app/infrastructure/extraction_engine.py`. OCR load: 8 concurrent `tesseract` PIDs (vie+eng, VCB_2026_Q1.pdf 8.1MB image-based BCTC) confirmed in flight 08:44Z–08:51Z+. Probe window 08:48:32Z–08:51:33Z (~3min). Results: 18/18 host HTTP 200 (max 102ms), 18/18 in-container HTTP 200 (max 102ms). Zero timeouts, zero >5s. FALSE-GREEN TRAP avoided: probed concurrently with live tesseract processes, not idle. DJ-GATE-1 written to sprint-ORCH-DASH-DECISION-DRILLDOWN.md. Flipped: A20-EVENTLOOP-ASYNC-TO-THREAD TODO→DONE, A20-WEDGE-CAPTURE-RESTART DONE-MITIGATION→DONE. Raw-verified both. FIX-AUDITOR-A20-MULTIPROBE unblocked (depends_on satisfied — left for agent-father).
