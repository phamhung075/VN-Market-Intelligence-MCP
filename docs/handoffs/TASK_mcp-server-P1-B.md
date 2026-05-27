---
title: "mcp-server P1-B — Three-Tier Trust Dashboard Stub"
date: "2026-05-25"
task: "P1-B"
pilot: "mcp-server"
status: "DONE"
zone: "apps/mcp-server/"
g12_streak: "1/3"
---

# mcp-server P1-B — Three-Tier Trust Dashboard Stub

**Status:** DONE (G12 streak #1)
**Commit:** `3bc85cf7`

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/dashboard/index.html:383` — three-panel trust dashboard stub
- **Tests written:** none (visual dashboard; verified via file:// open + runner execution)
- **Git commits:** `3bc85cf7 feat(mcp-server/dashboard): P1-B three-tier trust dashboard stub`
- **Type check:** clean (bun tsc --noEmit EXIT:0)
- **bun test:** 9414 pass / 342 fail (≥9408 / ≤348 — PASS)
- **Tool count:** 146 tools — matches pre-task baseline
- **Scheduler count:** 68 cron.schedule entries
- **Docs updated:** NONE
- **Graphify:** skipped

## AC Evidence

**AC-1 (file:// URL):**
`dashboard/index.html` opens via `file://` URL. Three panels visible: Primitives (LIVE), Modules (PHASE 2), Microservice (STATIC). Zero server dependency (fetch() for local trace files).

**AC-2 (Primitives panel):**
Panel loads `dashboard/traces/*.json` via `fetch('traces/<name>.json')`. KNOWN_TRACES array lists all 9 scenario names (3 sparkline from P1-A + 6 signal-bus/sector-classifier from P1-H). Shows pass/fail cards with color dots.

**AC-3 (Modules panel):**
"Phase 2 — not yet extracted" placeholder. Zero JavaScript console errors (no JS references to Phase 2 features).

**AC-4 (Microservice panel):**
"~146 tools registered" static text. No live HTTP call from dashboard HTML. Source pointer: `docs/data/project-stats.json#toolCount`.

**AC-5 (G8 honest red/green — cycle proof):**

Step 1: Mutated `sparkline-golden-happy.json` expected → `"WRONG_VALUE"`
```
bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/sparkline-golden-happy.json
# [FAIL] sparkline-golden-happy (0.28ms) — exit 1
cat dashboard/traces/sparkline-golden-happy.json | grep '"status"'
#   "status": "fail"
```
Dashboard card shows RED dot.

Step 2: Reverted `sparkline-golden-happy.json` expected → `"▁▄▂█▇"`
```
bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/sparkline-golden-happy.json
# [PASS] sparkline-golden-happy (0.26ms) — exit 0
cat dashboard/traces/sparkline-golden-happy.json | grep '"status"'
#   "status": "pass"
```
Dashboard card returns GREEN dot.

**AC-6 (--emit-traces):**
```
bun run src/sandbox/runner.ts --emit-traces
# [PASS] sparkline-golden-happy (0.27ms)
# [PASS] sparkline-golden-empty (0ms)
# [PASS] sparkline-failure-null (0.12ms) — error: generateSparkline: input must not be null/undefined
# Exit: 0
ls dashboard/traces/
# sparkline-failure-null.json  sparkline-golden-empty.json  sparkline-golden-happy.json
```
Dashboard reloads and shows 3 trace cards (1 fail/expected-error card + 2 pass cards).

**AC-7 (regression tripwires — G12 gate #1):**
- bun test: 9414 pass / 342 fail (≥9408 / ≤348 — PASS)
- bun run check: EXIT:0
- Tool count: 146 (unchanged)
- Scheduler count: 68 (unchanged)
- Dashboard BCTC inspect: `curl -s http://localhost:3000/api/bctc-inspect | head -5` → `<!DOCTYPE html>` (HTTP 200)
- Dashboard news-fetch: `curl -s http://localhost:3000/dashboards/news-fetch/ | head -5` → `<!DOCTYPE html>` (HTTP 200)

**AC-8 (clean staging):**
```
git diff --cached --name-only
apps/mcp-server/dashboard/index.html
# Only 1 file — CLEAN
```

## G12 Gate Evidence (streak #1 — BOTH gates passed)

| Gate | Command | Result |
|------|---------|--------|
| Gate 1: bun test | `cd apps/mcp-server && bun test` | 9414 pass / 342 fail — PASS |
| Gate 2a: tsc | `bun run check` | EXIT:0 — PASS |
| Gate 2b: health | `curl localhost:3000/health` | `{"status":"ok","toolCount":146}` — PASS |
| Gate 2c: tool count | grep probe | 146 — PASS |
| Gate 2d: sched count | grep probe | 68 — PASS |
| G8 honest red/green | AC-5 cycle | FAIL→PASS proven |
