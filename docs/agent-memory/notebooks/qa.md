# QA — Notebook

## cycle-240 · 2026-06-13 · FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE QA gate — APPROVED

Sprint: BCTC-ANALYTICS-LAYER | Task: FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE | Verdict: APPROVED | Commit: c38c76e6

G1 PASS: finalize_bctc_refine(fea19bae, DONE) → ok:true, rows_parsed:106; mcp-server log shows BLOCK-5 fired: old_confidence=0.375, new_confidence=0.6, hasBalanceSheet:true, hasIncomeStatement:false, hasCashFlow:true. G2 PASS: DB SELECT extraction_confidence → 0.6 (was 0.375 pre-finalize). G3 PASS: get_bctc_full(ACB) → real financial data served (Net Revenue 6,989 tỷ, Net Profit 4,320 tỷ, Total Assets 1,030,900 tỷ, confidence 60%); PUB-5 no longer blocking. G4 PASS: VNM extraction_confidence=0.9375 unchanged (raise-only guard preserved). G5 PASS: c38c76e6 diff — generic mechanism (report_id variable), no per-ticker hardcode, fires for ALL tickers, formula exact per AC-2-2, guard `if (refinedConfidence > currentConfidence)` exact per AC-2-3, parameterized SQL. G6 PASS: DE2=7/0, AR=20/0, FU-6f=8/0 (35 total pass/0 fail); tsc --noEmit EXIT 0. BCTC eval yellow (non-blocking per pipeline gate). Board REVIEW→DONE.

## cycle-239 · 2026-06-13 · FIX-FINALIZE-STATUS-STUCK-PARTIAL QA gate — APPROVED

Sprint: BCTC-ANALYTICS-LAYER | Task: FIX-FINALIZE-STATUS-STUCK-PARTIAL | Verdict: APPROVED | Commit under test: 4b30adbc

Gate 1 PASS: LIVE DB (keinos/sqlite3 named vol) → queue head = b48f7e6a (NOT fea19bae ACB). Fix A SQL exclusion subquery working. Gate 2 PASS: EXPLAIN QUERY PLAN — both correlated subqueries use COVERING INDEX (idx_bctc_refined_units_report_status + idx_bru_report) — O(log n), not SCAN. RF-1 mitigated. Gate 3 PASS: finalizeBctcRefineTool.ts response additive (effective_status + beg7_override fields present, lines 1126–1130); callerWasDone tracking at line 134; BEQ-7 guard KEPT with arch ruling comment (lines 326–341); index in schema-financial-reports.ts:466. No removed fields. DDD PASS (no forbidden cross-layer imports). Security PASS. mock-guard EXIT 0. Gate 4 PASS: 21 pass / 0 fail (BEQ-SECTION-GUARD + FIX-REFINE-PENDING-SCHEMA, 86 expects). Full suite 12788/50 — 50 pre-existing (none BCTC). AC-5-1 satisfied. Board FIX-FINALIZE-STATUS-STUCK-PARTIAL REVIEW→DONE.

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
- Latest cycle: cycle-239 (2026-06-13)

## Archive
Older cycles archived to git history / qa-20260606.md. Recent cycles 239–230 retained above.
