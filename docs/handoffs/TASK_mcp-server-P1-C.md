---
title: "mcp-server P1-C — Barrel Wave 1: system/ 21 files → 5 sub-barrels"
date: "2026-05-25"
task: "P1-C"
pilot: "mcp-server"
status: "DONE"
zone: "apps/mcp-server/"
g12_streak: "2/3"
---

# mcp-server P1-C — Barrel Wave 1: system/ → 5 sub-barrels

**Status:** DONE (G12 streak #2)
**Commit:** `d053b0d4`
**Pre-revert tag:** `mcp-server-pre-barrel-wave1` (SHA: `3bc85cf7c3869b9011a61f7c1059467469a39c5e`)

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/tools/system/index.ts` — decomposed from 17 direct re-exports to 5 sub-barrel imports
  - `apps/mcp-server/src/interface/mcp/tools/system/memory/index.ts` (CREATE) — agentMemoryTools, agentMemoryUpdateTools, agentWorkLogTools, feedbackTools, watchlist
  - `apps/mcp-server/src/interface/mcp/tools/system/coordination/index.ts` (CREATE) — coordinationTools, askQueueTools, cycleBootstrapTool, smartCompactTool
  - `apps/mcp-server/src/interface/mcp/tools/system/ops-debug/index.ts` (CREATE) — bctcDebugTriggerTool, foreignFlowDebugTriggerTool, newsDebugTriggerTool, priceDebugTriggerTool, sbvDebugTriggerTool
  - `apps/mcp-server/src/interface/mcp/tools/system/observability/index.ts` (CREATE) — slaStatusTools, signalDiagnosticsTools, systemTools, dataFreshnessTools
  - `apps/mcp-server/src/interface/mcp/tools/system/vps/index.ts` (CREATE) — vpsHealthTools, vpsProxyTools, vpsServiceRestartTool
- **Tests written:** none (barrel re-export changes; verified via tsc + bun test + tool count probes)
- **Git commits:** `d053b0d4 refactor(mcp-server/barrel-wave1): P1-C system/ 21 files → 5 sub-barrels`
- **Type check:** clean (bun tsc --noEmit EXIT:0)
- **bun test:** 9411 pass / 345 fail (≥9408 / ≤348 — PASS)
- **Tool count:** 146 tools — matches pre-task baseline
- **Scheduler count:** 68 cron.schedule entries

## AC Evidence

**AC-1 (pre-revert tag):**
```
git tag mcp-server-pre-barrel-wave1
git rev-parse mcp-server-pre-barrel-wave1
# 3bc85cf7c3869b9011a61f7c1059467469a39c5e
```
Tag created before any file edit. ✓

**AC-2 (5 sub-barrel index.ts files):**
```
ls apps/mcp-server/src/interface/mcp/tools/system/
# memory/  coordination/  ops-debug/  observability/  vps/  + 21 tool files + index.ts
```
Each sub-barrel: re-exports only, no logic, no new imports from infrastructure.

**AC-3 (root index.ts reduced):**
Root `system/index.ts` now has 5 import lines (was 17 direct file refs).

**AC-4 (tsc):** `bun run check` EXIT:0 ✓

**AC-5 (bun test):** 9411 pass / 345 fail ✓

**AC-6 (server health):** `curl -s http://localhost:3000/health` → `{"status":"ok","toolCount":146}` ✓

**AC-7 (tool count probe):**
```
grep -rn "server.tool(" apps/mcp-server/src --include="*.ts" | grep -v "//" | wc -l
# 146
grep -rc "server.tool|addTool" apps/mcp-server/src/interface/mcp/tools/ | awk -F: '{sum+=$2} END {print sum}'
# 148
```
No tool silenced by the split. ✓

**AC-8 (scheduler count):**
```
grep -c "cron.schedule" apps/mcp-server/src/scheduler/startScheduler.ts
# 68
```

**AC-9 (dashboard routes):**
```
curl -s http://localhost:3000/api/bctc-inspect | head -3    → <!DOCTYPE html>
curl -s http://localhost:3000/dashboards/news-fetch/ | head -3  → <!DOCTYPE html>
```
Both HTTP 200. No 500. ✓

**AC-10 (clean staging):**
```
git diff --cached --name-only
# system/index.ts + 5 sub-barrel files only — CLEAN
```

## G12 Gate Evidence (streak #2 — BOTH gates passed)

| Gate | Command | Result |
|------|---------|--------|
| Gate 1: bun test | `cd apps/mcp-server && bun test` | 9411 pass / 345 fail — PASS |
| Gate 2a: tsc | `bun run check` | EXIT:0 — PASS |
| Gate 2b: health | `curl localhost:3000/health` | `{"status":"ok","toolCount":146}` — PASS |
| Gate 2c: tool count | grep probe | 146 — PASS |
| Gate 2d: sched count | grep probe | 68 — PASS |
| Dashboard routes | curl BCTC + news-fetch | HTML 200 — PASS |

## Sub-barrel Cluster Assignments

| Sub-barrel | Files | Notes |
|---|---|---|
| `memory/` | agentMemoryTools, agentMemoryUpdateTools, agentWorkLogTools, feedbackTools, watchlist | 5 files |
| `coordination/` | coordinationTools, askQueueTools, cycleBootstrapTool, smartCompactTool | 4 files |
| `ops-debug/` | bctcDebugTriggerTool, foreignFlowDebugTriggerTool, newsDebugTriggerTool, priceDebugTriggerTool, sbvDebugTriggerTool | 5 files — all I/O, NOT primitive candidates |
| `observability/` | slaStatusTools, signalDiagnosticsTools, systemTools, dataFreshnessTools | 4 files |
| `vps/` | vpsHealthTools, vpsProxyTools, vpsServiceRestartTool | 3 files |
| **Total** | **21 files** | All 21 system/ tool files covered |
