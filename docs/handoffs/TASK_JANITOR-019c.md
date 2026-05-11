# TASK JANITOR-019c — Replace call-sites: interface/mcp/tools + scheduler + tests

**Sprint:** JANITOR-019
**Branch:** `task/JANITOR-019c-callsites-interface-scheduler-tests`
**Estimate:** ~2h
**Depends on:** JANITOR-019a (barrel must exist before imports are added)
**Blocks:** nothing

---

## Objective

Replace every `.map(() => "?").join(` occurrence in the `interface/mcp/tools/`, `scheduler/`, and `__tests__/` layers. This is the bulk task — 20 files.

---

## Files to edit

### interface/mcp/tools (13 files)

| File | Sites |
|------|-------|
| `apps/mcp-server/src/interface/mcp/bctcDebugTriggerHandler.ts` | 1 |
| `apps/mcp-server/src/interface/mcp/tools/alerts/alerts.ts` | 1 |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/earningsCalendarTools.ts` | 1 |
| `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` | 3 |
| `apps/mcp-server/src/interface/mcp/tools/market-data/marketContextTools.ts` | 1 |
| `apps/mcp-server/src/interface/mcp/tools/news-analysis/compareTools.ts` | 3 |
| `apps/mcp-server/src/interface/mcp/tools/portfolio/performanceTools.ts` | 1 (compact join variant) |
| `apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioRiskTool.ts` | 1 |
| `apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioTools.ts` | 4 |
| `apps/mcp-server/src/interface/mcp/tools/portfolio/rebalancingTools.ts` | 1 |
| `apps/mcp-server/src/interface/mcp/tools/portfolio/targetAllocationTools.ts` | 1 |
| `apps/mcp-server/src/interface/mcp/tools/sector/correlationTools.ts` | 1 |
| `apps/mcp-server/src/interface/mcp/tools/sector/sectorComparisonTools.ts` | 3 |
| `apps/mcp-server/src/interface/mcp/tools/sector/sectorRotationTools.ts` | 1 |

### scheduler (5 files)

| File | Sites |
|------|-------|
| `apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts` | 1 (compact join at line 577 — normalise) |
| `apps/mcp-server/src/scheduler/market-data/taAlertNotifierJob.ts` | 1 |
| `apps/mcp-server/src/scheduler/news-analysis/dataAuditJob.ts` | 1 (inline `Object.keys(INDICATOR_RANGES).map(...)`) |
| `apps/mcp-server/src/scheduler/portfolio/weeklyPortfolioReportJob.ts` | 2 |

### __tests__ (2 files — confirm pattern before replacing)

| File | Sites |
|------|-------|
| `apps/mcp-server/src/__tests__/1347a-test-db-isolation.test.ts` | 2 (confirm) |
| `apps/mcp-server/src/__tests__/283-portfolio-conviction-batch.test.ts` | 3 (confirm) |

Files `1118-evidence-accumulator-job.test.ts` and `1113-vps-proxy-health.test.ts` are "confirm" — grep before touching; skip if pattern is `'?'` single-quote variant.

---

## Special replacements

### dataAuditJob.ts:882 (inline Object.keys pattern)

```ts
// Before
`... IN (${Object.keys(INDICATOR_RANGES).map(() => "?").join(",")})`

// After
`... IN (${sqlInClause(Object.keys(INDICATOR_RANGES).length)})`
```

### predictionMarketJob.ts:577 (compact join)

```ts
// Before
tickers.map(() => "?").join(",")

// After
sqlInClause(tickers.length)
```

### performanceTools.ts:271 (compact join)

```ts
// Before
codes.map(() => "?").join(",")

// After
sqlInClause(codes.length)
```

---

## Replacement pattern (general)

```ts
// Before
const placeholders = items.map(() => "?").join(", ");
// ... IN (${placeholders})

// After
import { sqlInClause } from "../../../infrastructure/db/sqlHelpers.js"; // adjust depth
// ... IN (${sqlInClause(items.length)})
// delete unused placeholders variable
```

---

## Gotchas

- Import path from `interface/mcp/tools/**` to `infrastructure/db/sqlHelpers.js` is typically `"../../../infrastructure/db/sqlHelpers.js"` but varies per sub-folder depth — count carefully.
- `server.ts` SET-clause patterns are NOT IN-clause — do not touch (they use `join(", ")` for UPDATE SET, not IN).
- After all replacements, run: `grep -r 'map(() => "?").join' apps/mcp-server/src/` — output must be empty.

---

## Acceptance criteria

- [ ] All listed files use `sqlInClause(...)` — no `.map(() => "?").join(` remains in these files.
- [ ] Unused `placeholders` variable bindings are removed.
- [ ] `grep -r 'map(() => "?").join' apps/mcp-server/src/` returns zero results.
- [ ] Full test suite passes with no new failures (pre-existing 19 failures unchanged).
- [ ] Task report written to `reports/TASK_REPORT_JANITOR-019c.md`.
