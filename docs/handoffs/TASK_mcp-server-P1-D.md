---
title: "mcp-server P1-D — Barrel Wave 2: macro/ 14 files → http-proxy vs local-computation"
date: "2026-05-25"
task: "P1-D"
pilot: "mcp-server"
status: "DONE"
zone: "apps/mcp-server/"
g12_streak: "3/3 COMPLETE"
---

# mcp-server P1-D — Barrel Wave 2: macro/ → 2 sub-barrels

**Status:** DONE (G12 streak #3 — STREAK COMPLETE)
**Commit:** `d7f4129f`
**Pre-revert tag:** `mcp-server-pre-barrel-wave2` (SHA: `d053b0d406f764a317e1bfc2bb72e0f44644390a`)

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` — decomposed from 14 direct re-exports to 2 sub-barrel imports
  - `apps/mcp-server/src/interface/mcp/tools/macro/http-proxy/index.ts` (CREATE) — macroTools, carryTools, dinhGiaTools, macroHttpClient, macroSnapshotGuard
  - `apps/mcp-server/src/interface/mcp/tools/macro/local-computation/index.ts` (CREATE) — policyTools, calibrationTools, rateLimitTools, imfSignals, investmentClockTools, getFedLiquiditySpreadTool, getIsmSubcomponentsTool, evidenceTools, predictionTools
- **Tests written:** none (barrel re-export changes; verified via tsc + bun test + probes)
- **Git commits:** `d7f4129f refactor(mcp-server/barrel-wave2): P1-D macro/ 14 files → http-proxy vs local-computation`
- **Type check:** clean (bun tsc --noEmit EXIT:0)
- **bun test:** 9412 pass / 344 fail (≥9408 / ≤348 — PASS)
- **Tool count:** 146 tools — matches pre-task baseline
- **Scheduler count:** 68 cron.schedule entries

## Sub-barrel Classification

| File | Classification | Routing Evidence |
|------|---------------|-----------------|
| `macroTools.ts` | http-proxy | `import { getMacroBaseUrl } from "./macroHttpClient.js"` |
| `carryTools.ts` | http-proxy | `import { getMacroBaseUrl } from "./macroHttpClient.js"` |
| `dinhGiaTools.ts` | http-proxy | `import { getMacroBaseUrl } from "./macroHttpClient.js"` |
| `macroHttpClient.ts` | http-proxy (helper) | URL provider for MACRO_INDICATORS_URL env var |
| `macroSnapshotGuard.ts` | http-proxy (helper) | Pure guard — zero I/O; G1-PRIMITIVE-CANDIDATE annotation |
| `policyTools.ts` | local-computation | `domain/services/policyImpactMapper` |
| `calibrationTools.ts` | local-computation | `infrastructure/db/calibrationSnapshotStore` |
| `rateLimitTools.ts` | local-computation | `domain/services/rateLimiter` |
| `imfSignals.ts` | local-computation | `domain/services/imfDataClassifier` |
| `investmentClockTools.ts` | local-computation | `domain/services/macro/investmentClock` + `pyramidTier` |
| `getFedLiquiditySpreadTool.ts` | local-computation | `domain/services/macro/computeFedLiquiditySpread` |
| `getIsmSubcomponentsTool.ts` | local-computation | `domain/services/macro/ismRegimeSignal` |
| `evidenceTools.ts` | local-computation | `infrastructure/db/evidenceFragmentStore` |
| `predictionTools.ts` | local-computation | `domain/services/predictionCascadeMapper` |

## AC Evidence

**AC-1 (tag):** `git rev-parse mcp-server-pre-barrel-wave2` = `d053b0d406f764a317e1bfc2bb72e0f44644390a` ✓

**AC-2 (http-proxy verified):**
Each tool in http-proxy/ imports from `macroHttpClient.ts` (getMacroBaseUrl). Zero direct domain service calls.

**AC-3 (LOCAL-COMPUTATION annotation):**
`macro/local-computation/index.ts` header: `// LOCAL-COMPUTATION: legitimately mcp-server-owned — not a G5 violation`

**AC-4 (root macro/index.ts):** 2 import lines (was 14 direct file refs).

**AC-5 (tsc):** `bun run check` EXIT:0 ✓

**AC-6 (bun test):** 9412 pass / 344 fail ✓

**AC-7 (health):** `curl localhost:3000/health` → `{"status":"ok","toolCount":146}` ✓

**AC-8 (all probes):**
```
Tool count: 146 — PASS
addTool count: 148 — PASS (≥146)
Scheduler: 68 — PASS
BCTC dashboard: HTML 200 — PASS
news-fetch dashboard: HTML 200 — PASS
```

**AC-9 (macroIndicatorRefreshJob coupling):**
```
grep "from.*infrastructure/microservices/clients" apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts
# 15: import { getMacroSnapshot, getMacroExternal } from "../../infrastructure/microservices/clients.js";
```
Imports from `clients.ts` (HTTP path) — NOT from `domain/services/macro/macroIndicatorFetcher.ts`. ✓

**AC-10 (clean staging):**
```
git diff --cached --name-only
# macro/index.ts + macro/http-proxy/index.ts + macro/local-computation/index.ts only — CLEAN
```

## G12 Gate Evidence (streak #3 — STREAK COMPLETE — BOTH gates passed)

| Gate | Command | Result |
|------|---------|--------|
| Gate 1: bun test | `cd apps/mcp-server && bun test` | 9412 pass / 344 fail — PASS |
| Gate 2a: tsc | `bun run check` | EXIT:0 — PASS |
| Gate 2b: health | `curl localhost:3000/health` | `{"status":"ok","toolCount":146}` — PASS |
| Gate 2c: tool count | grep probe | 146 — PASS |
| Gate 2d: sched count | grep probe | 68 — PASS |
| Dashboard routes | curl BCTC + news-fetch | HTML 200 — PASS |

## G12 Streak Complete

3-task streak (P1-B + P1-C + P1-D) — each carrying BOTH gate evidence before DONE:

| Task | Commit | bun test | Gate 2 |
|------|--------|----------|--------|
| P1-B (streak #1) | `3bc85cf7` | 9414 pass / 342 fail | tsc EXIT:0, tools=146, sched=68, dashboard 200 |
| P1-C (streak #2) | `d053b0d4` | 9411 pass / 345 fail | tsc EXIT:0, tools=146, sched=68, dashboard 200 |
| P1-D (streak #3) | `d7f4129f` | 9412 pass / 344 fail | tsc EXIT:0, tools=146, sched=68, dashboard 200 |
