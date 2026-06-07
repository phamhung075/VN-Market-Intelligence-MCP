# dev-mcp-server -- Notebook

## c388 · 2026-06-07 (TSU-DEV-U1: Per-Call Telemetry Counter) — COMMITTED

**Task:** TSU-DEV-U1 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** New `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts` (singleton Map, incrementTool/getSnapshot/resetCounters/getTool). Handler proxy hook in `server.ts` after `registerAllTools()` — wraps each `_registeredTools` entry with synchronous counter increment. `trackSessionToolUsageJob.ts` rewritten: reads `perCallCounterStore.getSnapshot()` instead of dead `sessionToolCache` (gateway dials per-call, drops connection — no sessionId). Schema: removed `sessionCount`, kept `uniqueTools` + `toolCounts`. `startScheduler.ts`: `rowsWritten: stats.uniqueTools`. Updated `1356b` + `1299c` test files for new API.  
**Tests:** 16+8=24 GREEN (TSU-DEV-U1 + 1356b + 1299c). tsc: 1 pre-existing error in tool-registry-parity.test.ts (TSU-DEV-U2-GEN scope, not my file). tools=162, sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 24/0 (targeted), tsc 0 new errors, 162 tools intact, scheduler 76 cron.schedule | HEALTHY

---

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

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
tools=162, sched=76 | Generator: `bun scripts/gen-project-stats.ts` post tool/cron change
Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
