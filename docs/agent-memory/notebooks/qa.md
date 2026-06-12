# QA — Notebook

## cycle-238 · 2026-06-12 · CI-RED-8081e584-FIX QA gate — APPROVED

Sprint: CI-RED-8081e584 | Task: CI-RED-8081e584-FIX | Verdict: APPROVED | Report: reports/TASK_REPORT_CI-RED-8081e584-FIX.md

Two dev rounds (b4eeaf49 + 8a2ef725) fixed 6 failing tests. Round 1: UrgentNewsFindingDataSchema restored strict + UrgentNewsLooseSchema extracted for post_agent_signal SIGNAL_TYPE_VALIDATORS; getVpsProxyHealth now:Date injectable. Round 2: intelligenceCycleJob macroFetchFn/vnstockSyncFn deps injectable (no prod behavior change); 1837a "review" added to validStatuses; CONTAM-7 + 1987 afterAll mock.restore guards added. Local: 169 pass / 0 fail (6 fixed + 2 neighbor suites). tsc exit 0. DDD PASS. Security PASS. mock-guard EXIT 0. toolCount=157, schedulerCount=79. CI GREEN: run 27440565189 on 8a2ef725 = 12767 pass / 53 skip / 0 fail. b7b84d9b notebook-chore CI failure (160-stock-aliases network-flake) is pre-existing/unrelated — passes locally 34/0. Board CI-RED-8081e584-FIX REVIEW→DONE. DJ sprint-CI-RED-8081e584-qa.md § qa-S1.

## cycle-237 · 2026-06-12 · CONTAM-9 low=0/open=0 repair QA gate — APPROVED

Sprint: OHLCV-UNIT-CONTAM | Task: CONTAM-9 | Verdict: APPROVED | Report: reports/TASK_REPORT_CONTAM-9.md

Migration TCs (12/0): AC-1..AC-12 all GREEN. Guard TCs (20/0): TC-14/15/16 (Rule 3 mixed_unit) GREEN. pushPricesHandler TC-7 (low self-heal) GREEN. Total targeted: 39/0. tsc exit 0. DDD PASS (ohlcvUnitGuard.ts domain/services: zero infra imports). Security PASS (no process.env, no secrets). mock-guard EXIT 0. LIVE DB (keinos sidecar named volume): Class A=0, Class B=0, Class C=0 rows. FPT 2026-06-12: open=73100 high=74300 low=72369 close=73500. FPT 2026-06-11: open=73100 low=72369 (both were 0 before repair). FPT day change: +0.547% (was +100447.2% — user bug CLOSED). Spot-checks VCB/HPG/ACB: full-VND, low>0, sane ranges, 0 contamination remaining. Rule 3 mixed_unit guard confirmed in running container (grep=1). toolCount=157, schedulerCount=79 unchanged. Dev commit 6657fc3e. CONTAM-9 REVIEW→DONE. DJ qa-S7 appended to sprint-OHLCV-UNIT-CONTAM-qa.md.

## cycle-236 · 2026-06-12 · EVIDENCE-ACCUM-SILENT-CRON pre-rebuild gate — APPROVED

Sprint: EVIDENCE-ACCUM-SILENT-CRON | Task: EVIDENCE-ACCUM-SILENT-CRON | Verdict: APPROVED (pre-rebuild) | Commit: 53d00955

bun test (targeted): 8/0 (T1–T7 green, 10 expect() calls, 72ms). tsc exit 0. DDD PASS (scheduler→infra imports pre-existing). Security PASS (no process.env, no secrets). Mock-guard PASS (in-process :memory: DB only). Code review: recoverMissedExecutions:true on evidenceAccumulator (L475–477) and reputationCompute (L916–925) in startScheduler.ts. Dedup guard in runEvidenceAccumulatorWithDb: skips if success/running row exists today UTC, fail-open on missing table. Double-wrap fix: default fn calls runEvidenceAccumulator(db) directly (single recordJobRun). Dev baseline 12870/0 confirmed. REBUILD_REQUIRED. Cron-gated re-check: evidenceAccumulatorJob 2026-06-13 16:00 UTC. DJ EVIDENCE-ACCUM-SILENT-CRON.md § QA Review Record.

## cycle-235 · 2026-06-12 · FIX-EVIDENCE-PIPELINE-STARVED B-02 cron-gated re-check — CHANGES_REQUESTED

Sprint: SHIP-WAVE-REAUDIT | Task: FIX-EVIDENCE-PIPELINE-STARVED | Verdict: CHANGES_REQUESTED

Re-check at 2026-06-12T16:15Z. C1 PASS: foreignFlowAlertJob 2026-06-12 08:13:00 status=success rows_written=18. C2 PASS: evidence_fragments count=9 latest=2026-06-12T08:13:00.921Z. C3 FAIL: evidenceAccumulatorJob did not fire at 16:00Z — scheduler tick confirmed active (dataAuditJob:daily ran at 16:00:00, other cron jobs at 16:04–16:12), no evidenceAccumulatorJob entry in cron_job_runs for 2026-06-12, no container log entry. cron registered in CRONS map (80 keys at startup) but job absent from tick. CHANGES_REQUESTED. NEXT: pm to open new dev task with evidence.

## cycle-234 · 2026-06-12 · FE-CORPEVENTS-TICKER-FILTER browser + unit QA gate — APPROVED

Sprint: FE-CORPEVENTS-TICKER-FILTER | Task: FE-CORPEVENTS-TICKER-FILTER | Verdict: APPROVED | Commit: 4f0d407a | Report: reports/TASK_REPORT_FE-CORPEVENTS-TICKER-FILTER.md

Unit: 84/0 Vitest (task17, QA-reproduced). tsc exit 0. DDD PASS (no infra/application imports). Security PASS (process.env = pre-existing FRONTEND_ORIGIN, not introduced by commit). mock-guard EXIT 0. Browser (Playwright 17/17): select[aria-label="Chọn mã chứng khoán"] rendered. 47 options: 'Tất cả' + 46 codes sorted A-Z (ACB,ACV,BID…). Default 237 rows. ACB → 9 rows. Tất cả restore 237. Cascade: dividend=10, dividend+ACB=1. No /api/ fetch on onChange. Empty state: ACV+Nội bộ → "Không có sự kiện trong danh mục này." no crash. Stale banner unaffected (1 banner throughout). ?days=30 compose: selector still renders. Scope: frontend zone only; orch-state metadata update (ARCH-QUE-REFERENCE-PAGE) in same commit non-violating. REVIEW→DONE. DJ qa-S1.

## cycle-233 · 2026-06-12 · CLOSURE WAVE: REAUDIT-002 / FE-002 / FE-003 / CONTAM-7 / B-02 re-probe

Sprint: SHIP-WAVE-REAUDIT + OHLCV-UNIT-CONTAM | Tasks: REAUDIT-002 + REAUDIT-FE-002 + REAUDIT-FE-003 + CONTAM-7 (APPROVED) / FIX-EVIDENCE-PIPELINE-STARVED B-02 (DEFER 16:00Z) | Reports: reports/TASK_REPORT_REAUDIT-002/FE-002/FE-003/CONTAM-7.md

REAUDIT-002 (stale flags 5 handlers): 24/0 bun tests. tsc exit 0. DDD+security+mock-guard PASS. Live: conviction-history stale=True/70d, corporate-events stale=True/1d, shareholders stale=True/4d, financials stale=True/44d, reputation stale=False/0. All 5 endpoints PASS. Commit 70a33a80. REVIEW→DONE. DJ qa-S8.

REAUDIT-FE-002 (foreign-flow stale_fields badges): 15/0 Vitest tests. tsc exit 0. DDD+security+mock-guard PASS. Live: stale_fields=3 from API. SSR HTML: 2 column header badges "Không có dữ liệu" (currentHoldingRatio + marketCapBn). maxHoldingRatio no column in table — badge omission correct. Image e47f66ad6d1e. Commit 11308f1c. REVIEW→DONE. DJ qa-S9.

REAUDIT-FE-003 (market-summaries direction arrows): 21/0 Vitest tests. tsc exit 0. DDD+security+mock-guard PASS. Live: direction="down" in stockPerformance[0] from API. SSR HTML: 47↑ (emerald-400) / 78↓ (red-400) / 36— with ARIA labels. Commit 9bda7325. REVIEW→DONE. DJ qa-S10.

CONTAM-7 (integration suite): 45/0 bun tests (44+1 TR-6 from CONTAM-8). tsc exit 0. All 5 writer paths + repair + sanity covered. toolCount=157, schedulerCount=79. Commits eac132bf+ff2bc97e. REVIEW→DONE. DJ sprint-OHLCV-UNIT-CONTAM-qa.md § qa-S6.

B-02 FIX-EVIDENCE-PIPELINE-STARVED: foreignFlowAlertJob 2026-06-12 08:13Z rows_written=18 PASS. evidence_fragments=9>0 PASS. evidenceAccumulatorJob NOT fired today (fires 16:00Z UTC; current 12:11 UTC). DEFER: recheck at 2026-06-12T16:00Z for accumulator condition. Fix code ORDER BY date DESC confirmed. REVIEW status maintained pending 16:00Z gate. DJ qa-S2b.

CONTAM-9 READ-ONLY: status=IN_PROGRESS (dev investigating 519 low=0 rows). Not in scope for this wave.

ARCH-SHIP-WAVE-REAUDIT umbrella: 9 REAUDIT tasks — 7 DONE (001/002/003/004/005/FE-001/FE-002/FE-003), ARCH-SHIP-WAVE-REAUDIT=REVIEW (umbrella design task). FIX-EVIDENCE-PIPELINE-STARVED DEFER until 16:00Z accumulator gate. Umbrella closable after B-02 accumulator passes and ARCH task flipped to DONE.

## cycle-232 · 2026-06-12 · QUE-TOOLTIP-DRY 3-subtask QA wave — ALL APPROVED

Sprint: QUE-TOOLTIP-DRY | Tasks: 1a + 1b + 3 | Verdict: ALL APPROVED | Report: reports/TASK_REPORT_QUE-TOOLTIP-DRY.md

1a (codegen pipeline): 14 sprint tests GREEN. Generated file 64 entries, 2 fields (coreMeaning+marketTrendLabel), header cites que-reference.js. Quẻ 1 spot-check exact match. state_trend/judgment_interpretation/image_action absent. italic removed. tsc exit 0. mock-guard PASS.
1b (FR-1 SnapshotRow + NFR): SnapshotRow L484-L489 = QueName confirmed. NFR-1 exit=1 (0 Tooltip* in routes). NFR-2 exit=0 but all hits are API docs/sentiment labels — 0 hexagram description hardcoding. NFR-3 fallback intact. FlipRow PLAIN (PO-Q4 deferral regression-free). tsc exit 0. mock-guard PASS. Pre-existing 170 failures confirmed as pre-sprint baseline.
3 (hexagramLibrary annotation): 107 kinhDich tests GREEN. JSDoc header confirmed. Zero data changes. tsc exit 0. mock-guard PASS.
Frontend image: sha256:e47f66ad6d1e healthy (/health 200). DJ: sprint-QUE-TOOLTIP-DRY-qa.md. Board: 1a/1b/3 REVIEW→DONE.

## cycle-231 · 2026-06-12 · CONTAM-8 boundary repair QA gate — APPROVED

Sprint: OHLCV-UNIT-CONTAM | Task: CONTAM-8 | Verdict: APPROVED | Report: reports/TASK_REPORT_CONTAM-8.md

Live DB probe (named volume, keinos sidecar). VNH 2026-06-12: open=900.0 high=1000.0 low=900.0 close=1000.0 — scale correct, pct +11.1% within |pct|<30% PASS. Full contamination scan (WHERE open<100 OR low<100 AND close>=1000 AND open>0 AND low>0 AND NOT all-zero): 0 rows — CLEAN. Script source: CONTAM_WHERE L94 `AND close >= 1000` confirmed (boundary fix from `> 1000`). TR-4 stale SQL also fixed. TR-6 boundary test: open=0.9 close=1000.0 exactly — contaminated_count=1 detected BEFORE repair, open/low=900 AFTER — genuine test. Commits ff2bc97e + b02fcc56 on main. bun test CONTAM-7 suite: 45 pass / 0 fail. tsc exit 0. DDD PASS. Security PASS. mock-guard EXIT 0. CONTAM-8 REVIEW→DONE. DJ: sprint-OHLCV-UNIT-CONTAM-qa.md § qa-S5.

## cycle-230 · 2026-06-12 · CONTAM-6 repair migration QA gate — APPROVED

Sprint: OHLCV-UNIT-CONTAM | Task: CONTAM-6 | Verdict: APPROVED | Report: reports/TASK_REPORT_CONTAM-6.md

Live DB probe (named volume, keinos sidecar). Check 1: contamination scan = 0 remaining (WHERE open<100 OR low<100 AND NOT all-zero AND open>0 AND low>0 AND close>1000) — PASS. Check 4: all-zero rows = 116 — PASS. Check 2a VNH Jun08-10: open=900/close=900 same scale — PASS. Check 2b FPT Jun09-10: open=72900-73700 range — PASS. Check 3 spot-checks: TRA ~79000, PVI ~77500-78200, DFF ~400-500 (genuinely low-priced stock) — all plausible PASS. Check 5: script at scripts/migrations/repair-ohlcv-unit-contamination.ts + dev-standards.md pointer — PASS. Check 6: VNH pct 0.0%, FPT pct 0.68% — both <30% PASS. Test: 14 pass / 0 fail. tsc: exit 0.

Scope miss findings (non-blocking, logged for follow-up): SM-1 VNH 2026-06-12 close=1000.0 exactly (boundary `>1000` strict, 1 row miss); SM-2 460 pre-repair rows with low=0 pattern outside heuristic scope; SM-3 59 today's rows same low=0 pattern (CONTAM-2 guard gap). None introduced by CONTAM-6. Task DoD met. CONTAM-6 REVIEW→DONE. DJ: sprint-OHLCV-UNIT-CONTAM-qa-contam6.md.

## Baselines (standing notes)

- Agent: QA (unified-append mode, ≤200L notebook)
- Latest cycle: cycle-238 (2026-06-12)

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
