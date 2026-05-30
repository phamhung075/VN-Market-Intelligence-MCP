# QA — Notebook

## cycle-152 · 2026-05-30 · BCTC-AGENTIC-REFINE AR-QA — CHANGES_REQUESTED

**Sprint:** BCTC-AGENTIC-REFINE | **Task:** AR-QA | **Verdict:** CHANGES_REQUESTED

```
date: 2026-05-30T09:35Z (approx)
type: gate-keeper review (4 commits: d854e8ff, 423a901e, 76a3b8d2, 0a16fd6f)
blocking_issues: 1
advisory: 1

TESTS: 76 AR DV tests PASS (bun test 5 AR files) | 10192 full suite PASS | tsc 0 errors
DDD: PASS | security: PASS

EXTRA-A (live-path check): PASS
  unit_grouper.py inlined state machine not on refine path.
  Only reachable from test_unit_grouper.py + test_document_map.py (legacy).
  No live import of unit_grouper from pek_engine_adapter / handlers / extract_layout_first_usecase.

EXTRA-B (scheduler-wiring gap): FAIL (RED — blocking)
  startScheduler.ts has NO import or cron.schedule for bctcRefineJob.
  cronConfig.ts key exists at line 182. Pipeline DORMANT in production.
  Fix: add import + cron.schedule(CRONS.bctcRefineJob, ...) → AR-OPS.

CRITERIA: C1=PASS-CONDITIONAL | C2=PASS | C3=PASS | C4=PASS | C5=PASS | C6=PASS | C7=PASS | C8=PASS
NEXT: AR-OPS — wire startScheduler.ts + volume + rebuild + bake-off
```

---

## cycle-151 · 2026-05-30 · DPI-FU-AB-QA — PASS

**Sprint:** DATA-PIPELINE-INTEGRITY | **Task:** DPI-FU-AB-QA | **Verdict:** PASS

```
date: 2026-05-30T09:20Z
type: independent done-bar gate (DPI-FU-A + DPI-FU-B)
commit: ff9a64ce (DPI-FU-A fail-loud EFFR staleness + DPI-FU-B earning-yield reachable-denominator)
zone: apps/mcp-server
container_image: 6b90c5d8... (rebuilt 2026-05-30T10:47 UTC, ops DPI-FU-AB-OPS)

CHECK-1 (FU-A EFFR max date):
  SELECT MAX(date) FROM fred_series_daily WHERE series='EFFR'
  → 2026-05-28   PASS (>= 2026-05-28, within 96h SLA)
  Prior frozen value was 2026-05-14.

CHECK-2 (FU-A get_macro_snapshot fedFundsRate):
  carry.fedFundsRate = 3.62   PASS (LIVE 2026-05-28 row, NOT fixture 5.33)
  carry.regime = NEUTRAL (carrySpread=1.08)  was frozen FII_OUTFLOW_RISK (-0.63)

CHECK-3 (FU-A computedAt fresh):
  carry.computedAt = 2026-05-30T09:18:25Z   PASS (today, NOT frozen 2026-05-23)

CHECK-4 (FU-B tracked_indicators row):
  SELECT COUNT(*),MAX(extracted_at),MAX(value) FROM tracked_indicators WHERE indicator='market_earning_yield'
  → cnt=1, latest_at=2026-05-30T08:48:35.768Z, value=6.830601092896174
  PASS (>=1 row, value non-null, NOT 8.2 fixture)

CHECK-5 (FU-B get_macro_snapshot earningYield):
  yield.earningYield = 6.830601092896174   PASS (LIVE, NOT fixture 8.2)
  yield.depositRate = 4.7, spread = 2.13 (CHEAP label)

CHECK-6 (Regime integrity):
  carry: vndDepositRate=4.7, fedFundsRate=3.62, carrySpread=1.08 ✓ (4.7−3.62=1.08 math correct)
  yield: earningYield=6.83, depositRate=4.7, spread=2.13 ✓ (6.83−4.70=2.13 math correct)
  Both blocks use same depositRate=4.7 — internally consistent.

HONEST RESIDUAL — vndDepositRate safe-degrade:
  DB row: sbv_rates WHERE source='sbv' → max_deposit_rate_pct=0, fetched_at=2026-05-30T08:36:48Z
  The SBV cron ran at 08:36Z and stored max_deposit_rate_pct=0 (zero-value overwrite of prior
  5.0 row from 2026-05-29T23:15Z). Staleness guard fires on value=0 → safe-degrade to fixture 4.7.
  This is NOT a regression from ff9a64ce — it is a pre-existing SBV fetcher issue where rate
  fields return 0 intermittently (separate known issue). Both carry and yield blocks use 4.7
  consistently (no cross-block inconsistency). Note: prior DPI-2b QA saw 5.0 because the SBV
  row had not been overwritten yet.
  IMPACT: deposit rate is safe-degraded; carrySpread uses 4.7 not 5.0. This is correct behavior.
  Not a DPI-FU blocker — fix of SBV zero-value overwrite is a separate issue.

UNIT TESTS (DPI-FU): 14/14 PASS (DPI-FU-A: 6 tests, DPI-FU-B: 8 tests)
ALL DPI TESTS: 23/23 PASS
TSC: 0 errors (bunx tsc --noEmit on apps/mcp-server)
Full suite: 10192 tests across 941 files (2 pre-existing fails in _deprecated/ reuters.js, unrelated to ff9a64ce)

SCHEDULING (FU-A EFFR next run):
  macroIndicatorRefreshJob cron = '13 19 * * *' (19:13 UTC daily)
  Next scheduled EFFR fetch: 2026-05-30T19:13Z
  If FRED unreachable again, checkAndAlertEffrStaleness() fires WORK channel alert.

VERDICT: PASS — all 6 checks GREEN. Honest residual: vndDepositRate=4.7 (safe-degrade
  from 0-valued SBV row) — not caused by this fix, both blocks consistent, regime math correct.
```

---

## cycle-150 · 2026-05-30 · BCTC-TABLE-BOUNDARY BTB-QA — RED (2 blocking issues remain)

**Sprint:** BCTC-TABLE-BOUNDARY | **Task:** BTB-QA | **Verdict:** RED (partial progress — 2 of 4 issues remain)

```
date: 2026-05-30T01:45Z
type: anti-false-green adjudication (BTB-QA cycle-150 — post-ops-af59abee)
sprint: BCTC-TABLE-BOUNDARY
sentinel_A: FPT e71f845d-ffa5-48f9-8f09-30ac2cd09c65 (20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf, 46pp)
sentinel_B: ACB fea19bae-2b7a-4954-b3e0-e09d7bfc7390 (20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf)
confirmed: ac6b1c2e is phantom (no financial_reports record); fea19bae is live ACB Q1-2026

UNIT TESTS: 122/122 PASS + 150/155 PASS (5 stale + 25/25 mcp + 12/12 pek)
DB SENTINELS: FPT=31 (27table+4prose, 0dup) VERIFIED | ACB=10 (5×2dup, 0prose) STALE

RED-3: 5 stale tests in test_pek_engine_adapter.py::TestGroupBboxesIntoUnits fail
  (import deleted _group_bboxes_into_units). AD-2 anti-drift guard green.
  ACTION: remove stale TestGroupBboxesIntoUnits class

RED-4: ACB sentinel not re-extracted (pdf-extractor busy with FPT cron).
  Current: 10 rows, 5×2dup, 0 prose (pre-fix state).
  ACTION: ops quiesce FPT, trigger ACB re-extraction, verify 0-dup + prose present

GREEN: FPT idempotency PROVEN (31 rows, 4+ extractions, 0dup);
  prose units PRESENT (4); 8-page cap REMOVED;
  core 122 tests PASS; mcp-server 25/25 + tsc 0 errors;
  frozen files 0-diff.

YOLO LIMITATION: page_type classification has margin errors (prose↔table mislabels);
  state machine logic is correct. Known PATH B limitation (stored_text="").
  Impact: some financial pages appear in prose units. Not a regression.
```

---

## cycle-149 · 2026-05-30 · BCTC-TABLE-BOUNDARY BTB-QA — RED (2 blocking issues)

**Sprint:** BCTC-TABLE-BOUNDARY | **Task:** BTB-QA | **Verdict:** RED

```
date: 2026-05-30T01:30Z
type: anti-false-green adjudication (BTB-QA)
sprint: BCTC-TABLE-BOUNDARY
commits: d297f3ba (boundary state machine) + b1e826c2 (instrumentation)
sentinels: FPT e71f845d + ACB fea19bae (correct id, not ac6b1c2e phantom)

UNIT TESTS: 42/42 + 58/58 + 38/38 + 659/659 all PASS | tsc 0 errors
DB SENTINELS: FPT 31 rows (needs live verify) | ACB not re-extracted (pending)

RED blockers: (1) 5 stale tests import deleted function; (2) ACB sentinel pending re-extraction

GREEN: all unit-test layers pass; frozen files 0-diff; push handler idempotent pattern correct
```

---

## Archive (cycles ≤148)

Historical QA cycle logs (2026-05-29 and earlier) archived here for reference.
Full session history available via git log `docs/agent-memory/notebooks/qa.md`.

---

**Binding:** Active cycle only (≤200L). Historical detail pruned 2026-05-30.
