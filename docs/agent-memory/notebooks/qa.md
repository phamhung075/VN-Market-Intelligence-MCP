# QA — Notebook

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

## cycle-214 · 2026-06-08T13:xxZ · DFR-QA-1 DEEPFETCH-RAG-REDESIGN Phase 1 RAG gate — CHANGES_REQUESTED

Sprint: DEEPFETCH-RAG-REDESIGN | Task: DFR-QA-1 | Verdict: CHANGES_REQUESTED | Round: 1

Scope: DFR-P1-RAG (rag-service) only — DFR-P1-MCP OUT OF SCOPE (not built). Live container port 5002, image rebuilt 13:06:53Z, commit 76a02b0d + b94e5342.

PASS: AC-FR1-1 (16 cols raw-verified), AC-FR1-2 (14028 rows, zero data loss), AC-FR1-3 (backward compat no new params), AC-FR1-5 (idempotent restart, no add_columns errors), AC-FR2-1 (6-field legacy index HTTP 200), AC-FR2-2 (14-field index: LanceDB raw shows ticker=VCB, doc_type=filing, confidence=0.85 correctly stored), AC-FR3-1 (no new params same result set), AC-FR3-4 (invalid depth_tier → HTTP 400), NFR test count 104/104 PASS.

FAIL: AC-FR2-4, AC-FR3-2, AC-FR3-3 — single root cause: `apply_temporal_decay()` in `apps/rag-service/domain/services.py` lines 70-81 reconstructs SearchResult objects WITHOUT the 8 Phase 1 metadata fields. All metadata resets to defaults on every search response. Test gap: `test_original_fields_preserved` checks only legacy fields — bug invisible to suite. Fix: pass ticker/sector/source_domain/depth_tier/doc_type/published_at/confidence/impact_score in the new SearchResult constructor + add regression test. DJ-GATE-1 written to sprint-DEEPFETCH-RAG-REDESIGN-qa.md.

## cycle-213 · 2026-06-08T08:51Z · A20-EVENTLOOP-ASYNC-TO-THREAD multi-probe acceptance gate — PASS

Sprint: ORCH-DASH-DECISION-DRILLDOWN | Task: A20-EVENTLOOP-ASYNC-TO-THREAD | Verdict: PASS

Fix verified LIVE in container (commit 8ca79007, rebuilt 08:33:27Z). `asyncio.to_thread` confirmed at lines 46+58 of `/app/infrastructure/extraction_engine.py`. OCR load: 8 concurrent `tesseract` PIDs (vie+eng, VCB_2026_Q1.pdf 8.1MB image-based BCTC) confirmed in flight 08:44Z–08:51Z+. Probe window 08:48:32Z–08:51:33Z (~3min). Results: 18/18 host HTTP 200 (max 102ms), 18/18 in-container HTTP 200 (max 102ms). Zero timeouts, zero >5s. FALSE-GREEN TRAP avoided: probed concurrently with live tesseract processes, not idle. DJ-GATE-1 written to sprint-ORCH-DASH-DECISION-DRILLDOWN.md. Flipped: A20-EVENTLOOP-ASYNC-TO-THREAD TODO→DONE, A20-WEDGE-CAPTURE-RESTART DONE-MITIGATION→DONE. Raw-verified both. FIX-AUDITOR-A20-MULTIPROBE unblocked (depends_on satisfied — left for agent-father).
