---
title: "mcp-server P1-A — Sandbox Runner + Scenario Scaffolding"
date: "2026-05-25"
task: "P1-A"
pilot: "mcp-server"
status: "DONE"
zone: "apps/mcp-server/"
---

# mcp-server P1-A — Sandbox Runner + Scenario Scaffolding

**Status:** DONE
**Commit:** `195ef1a3`

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/sandbox/types.ts:53` — ScenarioInput + TraceOutput interfaces (pure data, no I/O)
  - `apps/mcp-server/src/sandbox/runner.ts:186` — scenario loader, PRIMITIVES dispatch, --emit-traces flag
  - `apps/mcp-server/src/sandbox/scenarios/sparkline-golden-happy.json` — happy path [80000...84000] → "▁▄▂█▇"
  - `apps/mcp-server/src/sandbox/scenarios/sparkline-golden-empty.json` — edge [] → "—"
  - `apps/mcp-server/src/sandbox/scenarios/sparkline-failure-null.json` — null input → expected error
- **Tests written:** none (sandbox runner is not a unit test; verified via direct execution)
- **Git commits:** `195ef1a3 feat(mcp-server/sandbox): P1-A sandbox runner + sparkline scenarios`
- **Type check:** clean (bun tsc --noEmit EXIT:0)
- **bun test:** 9414 pass / 342 fail (≥9408 / ≤348 — PASS)
- **Tool count:** 146 tools — matches pre-task baseline
- **Scheduler count:** 68 cron.schedule entries
- **Docs updated:** NONE (sandbox runner does not affect mcp-tools.md or cron-jobs.md)
- **Graphify:** skipped (no docs impacted)

## AC Evidence

**AC-1 (zero infra imports):**
```
grep -r "from.*infrastructure" apps/mcp-server/src/sandbox/runner.ts
# Returns 0 results — CLEAN
```

**AC-2:** `types.ts` exports `ScenarioInput` (scenario/primitive/input/expected) and `TraceOutput` (all fields JSON-serialisable primitives).

**AC-3:** 3 scenario JSON files:
- `sparkline-golden-happy.json` — 5-price happy path → "▁▄▂█▇"
- `sparkline-golden-empty.json` — empty array → "—"
- `sparkline-failure-null.json` — null input → `{ "error": true }` (expected throw)

**AC-4 (runner execution):**
```
bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/sparkline-golden-happy.json
# [PASS] sparkline-golden-happy (0.31ms) — exit 0

bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/sparkline-failure-null.json
# [PASS] sparkline-failure-null (5.55ms) — exit 0 (expected error, correctly caught)
```

Traces written to `dashboard/traces/`.

**AC-5 (zero-creds audit):**
```
env | grep -E "DB_|API_KEY|SECRET|PASSWORD"
# Returns 0 results — CLEAN
# Note: CTX_ADVISOR_*_TOKENS is a Claude context config var, not a DB/API credential
```

**AC-6 (regression tripwires):**
- bun test: 9414 pass / 342 fail (≥9408 / ≤348 — PASS)
- bun run check: EXIT:0
- Tool count: 146 (unchanged)
- Scheduler count: 68 (unchanged)

**AC-7 (clean staging):**
```
git diff --cached --name-only
apps/mcp-server/src/sandbox/runner.ts
apps/mcp-server/src/sandbox/scenarios/sparkline-failure-null.json
apps/mcp-server/src/sandbox/scenarios/sparkline-golden-empty.json
apps/mcp-server/src/sandbox/scenarios/sparkline-golden-happy.json
apps/mcp-server/src/sandbox/types.ts
# Only 5 sandbox files — CLEAN
```

## Notes

- `dashboard/traces/` directory created (not committed — runtime output)
- Sparkline expected value: "▁▄▂█▇" (not "▂▄▃█▆" as in the docstring example — the docstring had an error)
- Actual output verified: `generateSparkline([80000, 82000, 81000, 85000, 84000], 5)` = "▁▄▂█▇"
