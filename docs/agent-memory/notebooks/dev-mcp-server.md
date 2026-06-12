# dev-mcp-server -- Notebook

## 2026-06-13 · FIX-PENDING-REFINE-TICKER-TARGETING — ticker + report_id params — REVIEW

**Task:** FIX-PENDING-REFINE-TICKER-TARGETING | Sprint: BCTC-ANALYTICS-LAYER | Priority: P2/low | Zone: apps/mcp-server/
**Root cause:** getBctcPendingRefineTool.ts Zod InputSchema only had `limit` — `ticker` and `report_id` were stripped silently by safeParse, making all calls return the oldest PENDING/PARTIAL regardless of intended filter.
**Fix:** Extended InputSchema with `ticker` (z.string().optional()) and `report_id` (z.string().optional()). Refactored SQL into 3 branches: (1) report_id → `WHERE id=? AND confirm_status guard` — bypasses queue-eligibility filters (RF-3 intentional); (2) ticker → standard queue query + `AND action_code=?`; (3) default unchanged. All SQL uses parameterized placeholders. Tool description updated. RF-3 code comment added.
**Docs:** docs/agents/tools/list/get_bctc_pending_refine.md updated with ticker + report_id entries (AC-5-1).
**Tests:** 0 new files (AC-6-2). Existing suite: 12786 pass / 52 fail (pre-existing) / exit 0. tsc clean.
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, ticker/report_id params shipped | HEALTHY

---

## 2026-06-13 · FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE — confidence recompute at finalize — REVIEW

**Task:** FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE | Sprint: BCTC-ANALYTICS-LAYER | Priority: P1 | Zone: apps/mcp-server/
**Root cause:** extraction_confidence frozen at OCR-parse time — ACB at 0.375 despite 27/27 refined units DONE with all 3 sections present. PUB-5 blocks publishing at confidence < 0.5.
**Fix:** Added BLOCK-5 to finalizeBctcRefineTool.ts — non-fatal try/catch after BLOCK-4. Formula: (hasBalanceSheet ? 0.4 : 0) + (hasIncomeStatement ? 0.4 : 0) + (hasCashFlow ? 0.2 : 0). Raise-only guard: only UPDATE if refinedConfidence > currentConfidence. All 3 sections → 1.0, unblocks PUB-5 for ACB. Guard tested: current=0.81, refined=0.8 → NO override (DE2 suite). current=0.9, refined=0.4 → NO override (AR suite).
**Tests:** 0 new files (AC-5-2 prohibits); existing suite 3× exit 0. DE2: 7 pass, AR: 20 pass, FU-6f: 8 pass.
**Commit:** (see git log)
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, confidence recompute shipped | HEALTHY

---

## 2026-06-12 · FIX-FINALIZE-STATUS-STUCK-PARTIAL — queue deadlock fix + response transparency — REVIEW

**Task:** FIX-FINALIZE-STATUS-STUCK-PARTIAL | Sprint: BCTC-ANALYTICS-LAYER | Priority: P0/high | Zone: apps/mcp-server/
**Root cause:** Two bugs caused infinite queue deadlock: (1) getBctcPendingRefineTool returned PARTIAL reports even when ALL bctc_refined_units were window_status=DONE (data-quality PARTIAL, no work remaining) — ACB fea19bae with 27/27 DONE units stayed as permanent queue head, blocking 34 PENDING reports. (2) finalizeBctcRefineTool response only returned `{ok,rows_parsed}` — no visibility into BEQ-7 overrides.
**Fix A:** Added SQL exclusion subquery to getBctcPendingRefineTool WHERE clause: `AND NOT (refine_status='PARTIAL' AND COUNT(non-DONE units)=0 AND COUNT(all units)>0)`. Index `idx_bctc_refined_units_report_status ON bctc_refined_units(report_id, window_status)` added to schema for O(log n) lookup.
**Fix B:** Added `callerWasDone` tracking in finalizeBctcRefineTool. Response now includes `effective_status` (actual written refine_status) and `beg7_override` (true when BEQ-7 fired). Additive — existing callers unchanged.
**Tests:** 6 new tests across 2 existing files (DV-FINALIZE-1b/2b/4 in BEQ-SECTION-GUARD.test.ts; DV-FIX-A-1/2/3 in FIX-REFINE-PENDING-SCHEMA.test.ts). 21 pass / 0 fail targeted. tsc clean. toolCount=157. schedulerCount=79.
**Ops rebuild required** before live verification of AC-1-1 queue advance.
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, queue deadlock fixed | HEALTHY

---

## 2026-06-12 · CI-RED-8081e584-FIX (Round 2) — 3 new failing tests fixed — DONE

**Task:** CI-RED-8081e584-FIX (round 2) | Sprint: CI-RED-8081e584 | Priority: HIGH | Zone: apps/mcp-server/
**Root causes (3 failures on CI run 27439334298):**
(1) 1285-macro-alert-cooldown: step A2 (Yahoo Finance/SBV) + step A3 (vnstock) made real HTTP calls with 2-min withTimeout each — in CI outbound HTTP is throttled, both blocked until bun's 30s per-test timeout fired. Fix: added `macroFetchFn` + `vnstockSyncFn` injectable deps to CycleDeps; 1285 test injects async no-ops.
(2) 1837a-pipeline-state: head.status was "review" (set by CONTAM-9 REVIEW transition) but test only allowed ["in_progress","idle","blocked","stale"]. Fix: added "review" to validStatuses.
(3) mock-module-afterall-guard: CONTAM-7 + 1987-contam2 called mock.module() at module scope without afterAll(() => mock.restore()). Fix: added afterAll import + restore to both files.
**Tests:** 1285×8 pass, 1837a×5 pass, mock-guard×1 pass; 1293a+1295a+VPT-1 still pass (no regression). tsc clean. toolCount=157. schedulerCount=79.
**Commit:** 8a2ef725
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, CI-RED round 2 fixes committed | HEALTHY

