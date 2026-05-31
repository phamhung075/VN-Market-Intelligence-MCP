# Handoff: FU-5 — Trust-path scalar backfill + eval recompute

**Sprint:** FU-TRUST-REFRESH | **Task:** FU-5 | **Status:** IMPL DONE — awaiting QA

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts` (new, 206L) — pure domain service; aggregates bctc_table_rows → ScalarAggregate; code→column mapping reused from parseBctcReport/storeReport; unit auto-detect (>1e11 = raw VND ÷1e6, else million VND); NULL for absent codes; handles corporate + bank report types
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` (+70L) — after main transaction, reads freshly inserted rows, calls aggregateScalars(), dynamic UPDATE SET clause; then inline computeBctcEval() (non-fatal, try/catch); eval failure logs + continues
  - `apps/mcp-server/src/__tests__/FU-5-scalar-backfill.test.ts` (new, 591L) — 8 DV tests

- **Tests written:** `FU-5-scalar-backfill.test.ts` — 8 tests, 77 expect() calls, GREEN
  - DV-FU5-7: deliberate-violation (RED before fix → GREEN after)
  - DV-FU5-4: idempotency ×2 runs → identical scalars
  - DV-FU5-3: NULL-not-zero (absent code 20 → null, not 0)
  - DV-FU5-5: corporate raw-VND divisor detection
  - DV-FU5-6: bank million-VND divisor detection
  - DV-FU5-1/2: FPT-shape + ACB-shape aggregator correctness
  - DV-FU5-3 empty set: all-null output

- **Git commits:**
  - `6cc75437` fix(mcp-server/finalize): FU-5 backfill + eval recompute
  - `f795c4c4` chore(memory/dev-mcp-server): notebook 2026-05-31 FU-5
  - `e41f492d` chore(tasks): FU-5 → Review; add FU-6 ops gate

- **Type check:** clean (bun tsc --noEmit, exit 0)
- **bun test:** 8 pass / 0 fail (FU-5 file); 69 pass / 0 fail (FU-5 + TRUST-RED + HC-human-confirm combined)
- **Tool count:** 156 (unchanged baseline)
- **Scheduler count:** 70 cron.schedule entries
- **Docs updated:** docs/TASKS.md (FU-5 status), docs/agent-memory/notebooks/dev-mcp-server.md

---

## BLOCK-1 Fix Summary

**Problem:** `finalizeBctcRefineTool` re-populates `bctc_refined_units` + `bctc_table_rows` but did NOT update `financial_reports` scalar aggregate columns. The legacy VNStock parser wrote equity_total=0, gross_profit=net_revenue (100% margin) at 2026-05-24 and finalize left them stale.

**Mapping module reused:** `parseBctcReport.ts` / `storeReport()` (application/usecases/parseBctcReport.ts) is the canonical code→column mapping. The new `bctcScalarAggregator.ts` replicates the same mapping as a pure domain function reading from `bctc_table_rows` rather than from the OCR extractors — DRY, no dual-path drift.

**Code→column mapping:**
| BCTC code | Column | Notes |
|---|---|---|
| "10" | net_revenue | Corporate income stmt |
| "I" / label | net_revenue | Bank fallback (Thu nhập lãi thuần) |
| "20" | gross_profit | Corporate only; NULL for banks |
| "50" | profit_before_tax | Corporate |
| "VIII" / label | profit_before_tax | Bank fallback |
| "60" | net_profit | Corporate |
| "IX" / label | net_profit | Bank fallback |
| "270" or "440" | total_assets | Corporate; label fallback for banks |
| "300" | total_liabilities | Corporate; label fallback for banks |
| "400" | equity_total | Corporate; label fallback for banks |
| "100" | current_assets | Corporate; NULL for banks |

**NULL semantics:** absent line item → NULL (not 0). The UPDATE uses a dynamic SET clause that only writes non-null scalars.

**Unit scale:** `bctc_table_rows.unit = "billion_vnd"` regardless of actual scale (parser always writes that string). Detection: if max(|value_current|) > 1e11, treat as raw VND (divide by 1e6); else treat as million VND (no division).

---

## BLOCK-2 Fix Summary

**Problem:** `bctc_eval_results` for ACB (fea19bae) computed 2026-05-28 (pre-refine), returns overall_status=red. Current rows are clean (code_coverage=92.9%, 0 dups) but the eval is stale.

**Approach:** Inline `computeBctcEval(db, report_id, thresholds)` call at the end of finalize, after scalar backfill. Stages 4-6 recompute immediately against the freshly inserted rows.

**Non-fatal pattern:** wrapped in try/catch. If `loadBctcEvalThresholds` fails (e.g. thresholds file not found in test env), eval recompute is skipped and a warn is logged. The table rows and scalar backfill are already committed. Manual recompute remains available at `POST /api/bctc-eval/recompute/{id}`.

---

## FU-6 Gate (ops required before QA can re-gate)

**REBUILD REQUIRED.** The mcp-server container runs stale code. Ops must:
1. Rebuild mcp-server container
2. Re-run `finalize_bctc_refine` for both reports:
   - FPT Q1-2026: `e8ea3df5-3f32-413d-a3eb-c71634c0438d`
   - ACB Q1-2026: `fea19bae-2b7a-4954-b3e0-e09d7bfc7390`
3. Verify via `get_bctc_full({report_id: ...})` that:
   - FPT: `equity_total ≈ 40,122,037` (not 0), `gross_profit ≈ 4,244,890` (not equal to net_revenue)
   - ACB: `total_assets ≈ 1,030,900,741` (not 0), `equity_total ≈ 98,751,052`
4. Verify eval: `GET /api/bctc-eval/fea19bae-...` returns overall_status=green or yellow (not red stale)

**QA must re-gate after ops completes FU-6.**

---

## RED-before-GREEN Evidence

**DV-FU5-7 (core deliberate-violation):**

RED state: Report seeded with equity_total=0, gross_profit=net_revenue=8000. bctc_refined_units hold correct data. Finalize WITHOUT backfill: `equity_total` stays 0, `gross_profit` stays 8000 (100% margin). Test assertion `equity_total !== 0` → FAILS.

GREEN state: Finalize WITH backfill: reads rows parsed from markdown (gross_profit=2500, net_revenue=8000, equity_total=20000), runs aggregateScalars(), UPDATE fires. After finalize: `equity_total=20000`, `gross_profit/net_revenue=31.25%` (not 100%). All assertions pass.

**Test output (8 pass / 0 fail):**
```
bun test src/__tests__/FU-5-scalar-backfill.test.ts
8 pass, 0 fail, 77 expect() calls [301ms]
```
