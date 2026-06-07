# dev-mcp-server -- Notebook

## c387 · 2026-06-07 (TSU-DEV-U2-GEN: Registry Generator + Parity Test) — COMMITTED

**Task:** TSU-DEV-U2-GEN — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** `scripts/gen-tool-registry.ts` (static grep, 162 tools, 12 groups, atomic write), `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts` (8 tests: T-U2-1..T-U2-6 + AC-U2-7 x2). Registry overwrites `docs/data/tool-registry.json` (125→162 tools). `gen-project-stats.ts` updated with `readToolCountFromRegistry()` — registry is now SSOT for toolCount in project-stats.json.  
**Anti-false-green:** Fake `__test_fake_tool__` injected → T-U2-5+T-U2-6 RED confirmed → reverted → GREEN.  
**Tests:** 8/8 GREEN. tsc: clean. tools=162, sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 8/0 (parity suite), tsc clean, 162 tools intact, scheduler 76 cron.schedule | HEALTHY

---

## c386 · 2026-06-07 (FIX-BCTC-STAGE4-CROSS-SECTION-DUP) — COMMITTED cf3b71b5

**Fix:** Stage-4 `evalStage4TableReconstruct` now groups (label, value_current) duplicates by `statement_section`. Same-section dups → `exact_dup_count` → RED (unchanged). Cross-section dups (different known sections) → `cross_section_dup_count` → YELLOW warning only. Null/missing section conservative → same-section → RED. Adds `statement_section` to `BctcTableRow` interface (optional) and to the `computeBctcEval.ts` SELECT query. HPG 421b false-RED resolved without special-casing ticker/report.

**RED→GREEN:** 6 new tests (CS-1..CS-6) in `FIX-BCTC-STAGE4-CROSS-SECTION-DUP.test.ts`. Regression: `bctc-eval-detectors.test.ts` 13/13 unchanged GREEN. tsc: clean. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 19/0 (6 new CS + 13 existing detector tests), tsc clean, tools=162, sched=76 | HEALTHY

---

## c385 · 2026-06-07 (FIX-BCTC-LIAB-PRIOR-PERIOD) — COMMITTED cfa17b04

**Fix:** `parseSplitBlockBalanceSheet` first-match separator was picking prior-period date header for HPG parent-company format. Changed to collect ALL date+unit header candidates, compute YYYYMMDD sort key, pick highest (most recent = current period). Also extended `hitSecondPeriod` regex to match `01/01/YYYY` with leading zero.

**RED→GREEN:** 5 new tests (T1-T5) in `FIX-BCTC-LIAB-PRIOR-PERIOD.test.ts`. Regression: 40 balance sheet tests 0-fail. Suite: 10831 pass / 534 fail (534 pre-existing unchanged). tsc: 3 pre-existing errors in 1980-f2-canon-schema.test.ts only; balanceSheetExtractor.ts + new test file clean.

**Follow-up:** Live HPG Q4-2025 re-parse gated behind RECOVER-LIVEDB-INTEGRITY lane (page corruption). FIX-BCTC-STAGE4-CROSS-SECTION-DUP still open. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 534 pre-existing fail unchanged, 5 new green, balanceSheetExtractor 86.67% func coverage | HEALTHY

---

## c384 · 2026-06-07 (SPIKE-BCTC-EVAL-HPG-PPC) — DONE

**Spike:** SPIKE-BCTC-EVAL-HPG-PPC — BCTC eval insights for HPG + PPC.

**Findings:** PPC zero financial_reports (Q4 2025 url_not_found, Q3 2025 wrong URL). HPG Q4 2025: validation_status false positive (prior-period liability value); serve guard (c381) correctly passes. Stage 4 eval: 2 dups (genuine + cross-section valid, gate logic flaw). extraction_confidence=0.4375 (low).

**P0 tasks:** FIX-BCTC-LIAB-PRIOR-PERIOD, FIX-BCTC-STAGE4-CROSS-SECTION-DUP. P1: PPC PDF sourcing, HPG queue URL audit.

**Findings:** docs/spikes/SPIKE_3012-bctc-eval-hpg-ppc.md | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

---

## c382 · 2026-06-07T04:35Z (FIX-SBV-PUSH-TYPE-COERCE) — COMMITTED

/api/push-sbv-rates rejected string-typed numerics. Added `Number()` coercion for `usdVndOfficial` + 6 optional fields. Extracted to `routes/pushSbvRatesHandler.ts`. Tests: 8/8 RED→GREEN. Gates: tsc clean, 10810 pass / 534 fail (pre-existing).

---

## c381 · 2026-06-07T02:39Z (FIX-BCTC-IDENTITY-SERVE-GUARD) — COMMITTED 921be65a

Balance-sheet identity guard in serve path. Condition: `assets ≤ 0 OR assets < equity` → `[CORRUPT DATA — SKIP]` + confidence=0. Live CTG verified. Tests: 5/5 GREEN (DV-BCTC-GUARD-*). **INV-GATEWAY-1:** MCP gateway unavailable in worktree.

---

## c378 · 2026-06-07T01:21Z (FIX-ORCH-KEY-NORMALIZE-TASKID) — REVIEW

Normalized `task_id` → `id` across 189 orch-state rows (159 active, 27 backlog, 2 done). Read-path coalesce: `t.id || t.task_id || ""`. Standards: task-schema.md writes `id` only. Tests: 6/6 GREEN.

---

## c377 · 2026-06-06T23:44Z (F-1/FETCH-OPS-PAGE-TRUTH) — COMMITTED

Tightened newsHeadlinesHandler LIKE filters (`'%bloomberg.com%'` vs `'%bloomberg%'`). Added `GET /api/fetch-status` aggregating per-source freshness + VPS health + BCTC queue. Tests: 21/21 GREEN. Live: `/api/fetch-status` → sources[13]+vpsProxy+bctcPipeline{pending:370}.

---

## c376 · 2026-06-06T17:00Z (FIX-SLA-WEEKEND-AWARE) — COMMITTED

Calendar-aware SLA for market-hours-only sources. Off-hours threshold = `minutesSinceLastWindowEnd + 30min grace`. Added market-hours awareness to freshnessSlaChecker, vpsProxyTools, vpsProxyHealthHandler, slaStatusTools. Tests: 69 targeted / 0 fail. Live: prices off-hours status correct on weekend.

---

## c375 · 2026-06-06T12:45Z (FIX-REFINE-IDEM-LOCK-ISO) — COMMITTED

releaseTask owner_agent mismatch + test isolation. Tests: 13/13 GREEN.

---

## c378 · 2026-06-07T00:00Z (WF-2/WORKFLOW-FLUIDITY) — REVIEW

ORCH-HEAD-CAS + signal_queue retry-read-compare. Added `appendSignalQueueRow` CAS loop (3 retries, mtime-detect concurrent clobber) + `writeHeadAtomic()` in orchStateStore.ts. Signal-dashboard skill: concurrent-writers warning. Tests: 18/18 GREEN (12 new WF2 + 6 existing orchStateStore).

---

## c379 · 2026-06-07T00:00Z (FIX-SLA-EXEMPT-NEWS-SBVFX) — COMMITTED

Extend calendar-aware SLA to news + sbv_fx. Added `isVnNewsPublishHours()` (UTC 00:00-14:59), `isVnSbvBusinessDay()`, dynamic threshold pattern. Tests: 52/0 (31 new N/S-1..S-8 + 21 baseline W-1..W-10 GREEN). news/sbv false-CRITICAL on overnight/weekend eliminated.

---

## c378 · 2026-06-07 (FIX-PROJECT-STATS-GENERATED)

Generate project-stats.json from source. toolCount=162 (161 server.tool + 1 registerTool), cronJobCount=76 (71 startScheduler + 5 summaryJobs). Generator: `scripts/gen-project-stats.ts` walks tools/**/*.ts + scheduler/**/*.ts, atomic temp→validate→rename. Docs: dev-mcp-server flow/main.md, system-auditor flow stats-drift updated. REVIEW in orch-state.

---

## c376 · 2026-06-07T05:56Z (UNBLOCK-CTG-REFINE-DRAIN)

`get_bctc_pending_refine` excluded 'FAILED'. Extended predicate to `IN ('PENDING','PARTIAL','FAILED')` in getBctcPendingRefineTool.ts. FAILED reports re-queued with `reset=true` clears prior units. Tests: 22/22 GREEN (refine suite).

---

## c383 · 2026-06-07 (FIX-BCTC-SLA-WEEKEND) — COMMITTED

`BCTC_TRADING_DAY_ONLY_SOURCES` + non-trading-day guard: `minutesSinceLastWindowEnd+30` on Sat/Sun. Fixed false-alarm MEDIUM on Sat (1400+ min since Fri). Updated MH-11 in 1407b. Tests: 12 new B-1..B-10 GREEN. sched=76 unchanged.

---

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
tools=162, sched=76 | Generator: `bun scripts/gen-project-stats.ts` post tool/cron change
Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
