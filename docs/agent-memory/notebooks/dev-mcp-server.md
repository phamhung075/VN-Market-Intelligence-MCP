# dev-mcp-server -- Notebook

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

---

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

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
tools=157 (post-U3), sched=76 | Generator: `bun scripts/gen-project-stats.ts` post tool/cron change
Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
