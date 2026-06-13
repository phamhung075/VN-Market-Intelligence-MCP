# dev-mcp-server -- Notebook

## 2026-06-13 · FIX-ALERT-ORPHAN-CORRELATION — alert_id col + atomic co-write — REVIEW

**Task:** FIX-ALERT-ORPHAN-CORRELATION | Priority: P1-HIGH | Zone: apps/mcp-server/
**Root cause:** C-08 JOIN `ON a.id = s.id` compared alerts.id TEXT to agent_signals.id INTEGER — SQLite never coerces, every alert was always orphaned. storeAlerts/storeAlertsFromCommander never wrote agent_signals rows.
**Fix:** schema-news.ts: ADD COLUMN alert_id TEXT + index. alertStore.ts: both store functions atomically co-write one verified_decision signal row per alert inside the same transaction (dedup guard + legacy table/column probe).
**Gap documented:** Scheduler direct-INSERT paths (taAlertScanJob, bbAlertScanJob, foreignFlowAlertJob) still bypass storeAlerts — follow-up task needed. C-08 query fix (ON a.id → s.alert_id) is in system-auditor zone — handoff created.
**Tests:** 9 pass / 0 fail (FIX-ALERT-ORPHAN-CORRELATION.test.ts). tsc clean. Commit: 7cbca67a.
Zone health: tsc clean, alert co-write atomic, orphan root cause fixed | HEALTHY

---

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

## 2026-06-13 · FIX-PENDING-REFINE-LIMIT-CHECKKIND — z.coerce.number + SDK pin — REVIEW

**Task:** FIX-PENDING-REFINE-LIMIT-CHECKKIND | Priority: high | Zone: apps/mcp-server/
**Root cause:** @modelcontextprotocol/sdk floated ^1.8.0 → 1.29.0 via Dockerfile `|| bun install` fallback + zod 3.25.76. SDK 1.29.0 + zod 3.25.76 produces Bun 1.3.13 JIT module-state corruption in the running container: ZodNumber._parse (zod/v3/types.js:1086) iterates undefined entries in _def.checks → `check.kind` crash. The crash is process-state specific: Docker restart clears it; full replica scripts run clean.
**Fix:** z.coerce.number() on 4 tools (getBctcPendingRefineTool, getFedLiquiditySpreadTool, carryTools, sequential-market-analysis) — aligns with working-tool pattern; all .int()/.min()/.max() constraints preserved. SDK exact pinned to "1.29.0" (removes ^ drift vector). Primary resolution: rebuild + restart clears corrupted Bun state.
**Tests:** 44 targeted pass / 0 fail; full run 12880 tests. tsc clean. Commit: 897877ec.
**Live verify:** G1 {limit:1} → 1 row; G2 {ticker:CTG,limit:1} → 1 CTG row; G3 {} → 35 rows; G4 {report_id} → 1 row.
Zone health: bun test 12880 pass, 157 tools intact, 79 cron.schedule, check.kind crash fixed | HEALTHY
