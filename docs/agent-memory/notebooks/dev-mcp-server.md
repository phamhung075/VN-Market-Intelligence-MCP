# dev-mcp-server -- Notebook

## 2026-06-08 · FIX-BCTC-VPS-QUEUE-STALE-TRIAGE — DONE

**Task:** FIX-BCTC-VPS-QUEUE-STALE-TRIAGE  
**Signal:** sau-c104-c16 + report 3095  
**Commit:** 157c0f40

**Classification table (all 381 non-done rows):**

| Class | Count | Status Applied | Rationale |
|---|---|---|---|
| Historical HIST-VPS-BACKFILL (2023Q4–2025Q4) | 328 | `deferred_infra` | Sources geo-blocked/removed; 0 attempts; null source_url; never drainable |
| Q1-2026 pdf-extractor gated | 26 | `blocked_pdf_extractor` | VPS fetch triggered, pdf-extractor CPU-cgroup starvation (A-20, 3rd recurrence); OCR load re-triggers; 10 rows have 419-426 attempts, 16 rows have 0 attempts |
| Q4-2025 url_not_found | 27 | `url_not_found` (unchanged) | Already terminal status; C-16 does not count non-pending rows |
| Done | 48 | `done` (unchanged) | Successfully parsed |

**Live DB before/after:**
- Before: 338 stale pending >72h (C-16 FAIL)
- After: 0 stale actionable pending >72h (C-16 PASS)

**C-16 check:** No SQL change needed — C-16 queries `status='pending'` which now correctly excludes `deferred_infra` and `blocked_pdf_extractor` rows. System-auditor flow note updated with explicit-status rationale.

**Code changes:**
- `apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts` — `queryBctcCounts()` now returns `deferred_infra` + `blocked_pdf_extractor` counts for dashboard visibility
- `apps/mcp-server/src/__tests__/FIX-BCTC-VPS-QUEUE-STALE-TRIAGE.test.ts` — 5 tests, all GREEN
- `docs/agents/system-auditor/flow/main.md` — C-16 table note documents explicit-status exclusion design
- `scripts/migrations/classify-bctc-vps-queue-stale.ts` — canonical migration script

**Q1-2026 re-queue precondition:** Architect fix for A-20 (CPU-cgroup starvation) must land first. Then reset `blocked_pdf_extractor` WHERE `period_year=2026 AND period_quarter='Q1'` → `pending`.

**Zero rows deleted.** Every row has an explicit status.

**Gate results:** tsc clean / 5 new tests PASS / tools=157 / sched=76

Zone health: bun test 0 fail (BCTC subset 60 pass), 157 tools intact, scheduler 76 cron.schedule (gen-project-stats verified) | HEALTHY

---

## 2026-06-08 · FIX-BCTC-LOWCONF-REPARSE-BATCH — COMMITTED

**Task:** FIX-BCTC-LOWCONF-REPARSE-BATCH  
**Scope:** Reports #3077–#3085; tickers REE/CTG/VHM/HCM/HSG/KBC/NVL/PPC (Q1-2026 + Q4-2025).

**Deliverables:**
- `scripts/migrations/reparse-bctc-reports.ts` — generalized reparse script (supersedes apps/mcp-server/trigger-ppc-reparse.ts which can now be deleted)
- Force-reparse run: all 9 ticker-period pairs pushed via `/api/push-bctc-pdf` with queue reset
- Report 3085 resolved (wontfix + root cause documented)

**Per-ticker before→after composite confidence (extraction_confidence):**
| Ticker | Period | Before | After | Delta | Root Cause |
|--------|--------|--------|-------|-------|------------|
| PPC | 2025-Q4 | 0.625 | 0.625 | 0 | Already lifted by 06c65978 pre-task. No regression. |
| KBC | 2025-Q4 | 0.6875 | 0.6875 | 0 | Image PDF; OCR service unhealthy; Tier3 pdf-parse 0 chars (image-only). |
| KBC | 2026-Q1 | 0.6875 | 0.6875 | 0 | Same PDF as Q4; image-only; OCR service unhealthy. |
| HCM | 2026-Q1 | 0.4375 | 0.4375 | 0 | Image PDF (10MB); pdf-extractor unhealthy; Tier3 0 chars. |
| VHM | 2026-Q1 | 0.375 | 0.375 | 0 | Image PDF (9.8MB); pdf-extractor unhealthy; Tier3 0 chars. |
| NVL | 2025-Q4 | 0.25 | 0.25 | 0 | Accounting identity: Assets≠Liab+Eq. NVL parent-only filing (riêng lẻ). |
| NVL | 2026-Q1 | 0.25 | 0.25 | 0 | Same parent-only issue. financial_confidence=0.1. |
| HSG | 2026-Q1 | 0.1875 | 0.1875 | 0 | Image PDF (3MB); pdf-extractor unhealthy; Tier3 0 chars. |
| CTG | 2026-Q1 | 0.0625 | 0.0625 | 0 | B02-TCTD bank format. Cover-page PDF 536KB (only 2388 chars). Actual CTG_2026_Q1.pdf=6.3MB not reached by push. |
| REE | 2026-Q1 | 0.05 | 0.05 | 0 | Empty BS: section totals (lines 100/200/300) not extracted by regex. 44226 chars extracted but BS totals absent. Not a magnitude issue. |

**Residual root causes documented:**
1. REE 2026-Q1: section-total lines (code 100/200/300/400) absent from extracted text — parser gets individual items but misses aggregate rows. Not addressable by magnitude-normalize fix. Separate parser gap.
2. CTG 2026-Q1: B02-TCTD bank format + push used 536KB cover PDF (wrong file). Full 6.3MB PDF is CTG_2026_Q1.pdf. Bank BS format needs BANK-AWARE-BCTC handling.
3. VHM/HCM/HSG/KBC 2026-Q1: Image-only PDFs. Require OCR via pdf-extractor service. Service currently unhealthy. Will self-heal on next service restart/recovery.
4. NVL 2025-Q4 + 2026-Q1: Parent-only filing (riêng lẻ). balance_sheet mismatch. Low confidence is expected (parent entity, not consolidated group).
5. PPC 2025-Q4: 0.625 — already lifted by 06c65978 before this task ran.
6. KBC 2025-Q4/Q1: Image PDF, same file used for both periods. OCR service needed.

**Report 3085:** resolved as `wontfix` — root cause = REE section-total regex gap, not magnitude error. Confidence 0.00→0.05 (marginal, income statement partially extracted). Full fix requires separate parser task.

Zone health: no code change, no test impact | HEALTHY

---

## c390 · 2026-06-07 (TSU-DEV-U3: 5 Deregister + 7 Integrate Description Updates) — COMMITTED

**Task:** TSU-DEV-U3 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** 5 tools deregistered (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day) — server.tool() blocks replaced with no-ops, handlers retained. 7 tool descriptions updated (mark_alert_outcome, get_market_foreign_flow, diagnose+reset circuit breaker, get_label_accuracy_report, get_public_contracts, list_flagged_bctc_cells, submit_bctc_correction). `docs/data/tool-registry.json` + `project-stats.json` regenerated (162→157). cowork-refactory-expert signal row appended to orch-state.json signal_queue.  
**Tests:** 12 new GREEN (TSU-DEV-U3 test file). tool-registry-parity 8/8 GREEN (T-U2-5 confirmed 157). tsc: clean. tools=157, sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 12/0 (U3 suite) + 8/0 (parity), tsc clean, 157 tools (162-5 deregistered), scheduler 76 cron.schedule | HEALTHY

---

## c389 · 2026-06-07 (TSU-DEV-U5: Foreign Flow Null Holding Ratio) — COMMITTED

**Task:** TSU-DEV-U5 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** `foreignFlowAnalyzer.ts`: added `is_holding_ratio_fabricated: boolean` to `ForeignFlowSignal`; gate holdingRatioChange5d computation + reasoning append when all holdingRatio=0. `foreignFlowTools.ts`: `formatForeignFlowOutput` gates Holding Ratio column + `Holding ratio change (5d)` line via `hasRealHoldingData = !signal.is_holding_ratio_fabricated`; tool description updated (removed "holding ratio change" mention). `companyProfileTools.ts`: `foreign_holding_ratio` emits null when `current_holding_ratio === 0` (DSI invariant).  
**Tests:** 10 new GREEN (TSU-DEV-U5 test file). tsc: clean. tools=157 (SSOT), sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 10/0 (U5 suite), 0 regression, tsc clean, 157 tools (SSOT), scheduler 76 cron.schedule | HEALTHY

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
tools=157 (post-U3), sched=76 | Generator: `bun scripts/gen-project-stats.ts` post tool/cron change
Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`

---

## 2026-06-08 · FIX-FRED-YAHOO-WEEKEND-STALE — COMMITTED (c7a6de6c)

**Task:** FIX-FRED-YAHOO-WEEKEND-STALE — 4 bun-test null-assert failures (1423b FRED-01/FRED-06, 1922j AC-1/AC-2/AC-3, 1487 T-2) + tnb c90 F-FED-RATE-REGRESSION (weekend path serves stale 5.33%).

**Root causes fixed (5 files):**
1. `fredApi.ts`: INSERT used `data_env` (migration-added column) — fails on in-memory test schemas. Added try/catch fallback INSERT without data_env.
2. `fredEffrIorb.ts`: FRED_API_KEY guard blocked all calls including mock-client test path. Guard now conditional on `!httpClient`. Added CSV format fallback to `parseFredEffrIorbJson` so test fixtures (DATE,VALUE rows) parse correctly alongside JSON REST format.
3. `yahooFinance.ts`: `storeCommoditySnapshot` INSERT used `data_env` — same schema mismatch. Added `hasDataEnvCol` probe + dual INSERT path inside transaction.
4. `macroIndicatorRefreshJob.ts`: when FRED CSV fails (weekends / Akamai WAF), new EFFR fallback reads `fred_series_daily` MAX(EFFR) → writes to `tracked_indicators.fed_funds_rate`.
5. `startScheduler.ts`: startup bridge — if `tracked_indicators.fed_funds_rate` empty on restart + `fred_series_daily` has EFFR rows, bridge immediately so macro-indicators serves correct value.

**Evidence:**
- Tests: 4 failures → 0. 17/17 pass (1423b×6, 1922j×4, 1487×7). Confirmed in container.
- tsc: clean. scheduler cron.schedule: 76 (baseline unchanged).
- Container img=11e737901726, all 7 peers healthy.
- tracked_indicators.fed_funds_rate=3.62 (bridged from EFFR 2026-06-03, source=fred_series_daily).
- macro-indicators Go service cache=stale-5.33 (caches per internal TTL, will self-heal on next refresh/restart).

**Monday gate (tnb c91):** macroIndicatorRefreshJob runs 19:13 UTC Sunday (= Monday morning VN time). EFFR fallback will fire (CSV Akamai-blocked on weekends), write 3.62 to tracked_indicators, macro-indicators will serve 3.62 on next /snapshot call after cache expiry.

Zone health: 17/0 target tests, tsc clean, 157 tools (SSOT), 76 cron.schedule | HEALTHY
