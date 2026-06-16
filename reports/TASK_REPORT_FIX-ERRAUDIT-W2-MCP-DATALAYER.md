# Task Report: FIX-ERRAUDIT-W2-MCP-DATALAYER

date: 2026-06-16
outcome: APPROVED

## Test Results

- Directly-touched test files (3 files): 31 pass / 0 fail
  - `src/__tests__/FIX-ERRAUDIT-W2-MCP-DATALAYER.test.ts` (20 tests — FORCED-FAILURE class)
  - `src/__tests__/1329f-imf-bridge.test.ts` (updated)
  - `src/__tests__/1320-volume-avg-excludes-today.test.ts` (updated)
- Full bun test: not completed (ENOSPC on /private/tmp). Directly-touched 3-file subset run is the authoritative gate per QA checklist. No test regressions detectable from static analysis.
- TypeScript: 1 pre-existing error (FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 at test:270, TS2367 — separately triaged, NOT introduced by this commit). Zero new tsc errors.

## DDD Compliance: PASS

- `domain/utils/safeQuery.ts`: imports only `bun:sqlite` (type-only). No infrastructure/ or application/ imports.
- `application/utils/runSection.ts`: imports only from `domain/utils/safeQuery.js`. No infrastructure/ import.
- DDD golden rule satisfied: domain/utils imports nothing upward.
- `marketContextBuilder.ts` uses `failLoud` from `domain/utils/safeQuery.js` — DDD-correct (domain→domain).

## Security: PASS

- No `process.env` in any touched file (all use `Bun.env`).
- All SQL queries remain parameterised (no interpolation added).
- No hardcoded credentials or tokens.
- Mock-guard: **PASS** on all 9 production files.

## 9 Migration Sites — Static Audit Table

| # | File | Site | Degrade behaviour | Anti-pattern eliminated |
|---|------|------|-------------------|------------------------|
| 1 | `application/services/imfConvictionBridge.ts` | `getImfMacroScoreForConviction` | `safeQuery` → `undefined` on `!ok` (drop-dimension) | Fabricated neutral 0 |
| 2 | `application/usecases/scanMarket.ts` | `getAvgVolumeSync` (count gate) | `failLoud + return null` on db error | Fabricated 0 colliding with genuine 0-volume |
| 3 | `application/usecases/scanMarket.ts` | `getAvgVolumeSync` (avg query) | `failLoud + return null` on query error | Same |
| 4 | `application/usecases/scanMarket.ts` | `getThresholds catch` | `failLoud` replaces bare silent `{}` | Silent swallow |
| 5 | `application/services/imfDataFetcher.ts` | `parseImfApiResponse catch` | `failLoud` before `return null` | Silent parse failure → stale-as-fresh |
| 6 | `application/usecases/assembleBriefing.ts` | Step 7 macroSnapshot | `runSectionAsync` → `logger.warn` on `reason:'error'` | `bare catch{/*best-effort*/}` → silent `macroSnapshot=[]` |
| 7 | `application/usecases/assembleBriefing.ts` | Step 9 trackedCommodities | `runSectionAsync` → `logger.warn` on `reason:'error'` | Same |
| 8 | `application/usecases/assembleBriefing.ts` | Steps 10/10b/11/12 (4 catches) | `failLoud` on each catch | Silent empty alerts/predictions/conviction |
| 9 | `domain/services/marketContextBuilder.ts` | `buildMacroSection` (3 sub-catches) | `failLoud` on market_prices, tracked_indicators, sbv_rates | Silent empty macro section |
| +1 | `infrastructure/fetchers/vnstockBridge.ts` | FINANCE_SCRIPT ratio extraction + `VnstockFinancials` type | Python emits None on missing ratio column; `sys.stderr.write([degraded:...])` | `pe=pb=roe=roa=0.0` (bank ROE=0 implausible); now `null` = discriminated missing |

Note: commit message states "7 sites" referring to the 7 files. Counting discrete catch blocks replaced = 9 sites across those files (plus the Python script changes making +1).

## Live Forced-Degrade Transcript

Executed on running container `vn-market-intelligence-mcp-mcp-server-1` (image 2026-06-16T00:10:01Z):

**Test 1 — DB error path (safeQuery, closed DB):**
```
[degraded:qa-gate-forced-error] db-error — Cannot use a closed database
{"ok":false,"reason":"db-error"}
```
Verdict: FAIL-LOUD confirmed. Not ok:true, not fabricated 0.

**Test 2 — Genuine no-rows path (safeQuery, empty table):**
```
{"ok":false,"reason":"no-rows"}
```
Verdict: legit-empty preserved, discriminated from db-error.

**Test 3 — Happy path (safeQuery, with row):**
```
{"ok":true,"rows":[{"id":42}]}
```
Verdict: happy path unaffected by the fix.

**Test 4 — getAvgVolumeSync('BRENT') — ticker with 0 history rows:**
```
{"code":"BRENT","avgVolume":null,"type":"object","isNull":true}
```
Verdict: `null` returned (honest drop-dimension), not fabricated 0. Correct.

**Test 5 — getAvgVolumeSync('VCB') — ticker with < MIN_HISTORY_ROWS (5) days:**
```
{"code":"VCB","avgVolume":null,"type":"object","isReal":false}
```
Verdict: 1 distinct day < 5 required → honest null (insufficient history), not fabricated 0.
This is the correct behaviour: 1 day insufficient for a meaningful volume average.

**Confirmed by forced-failure test output from container test run:**
```
[degraded:imfConvictionBridge.getImfMacroScoreForConviction] db-error — Cannot use a closed database
31 pass / 0 fail across 3 touched test files.
```

## Out-of-Scope Anti-Pattern Inventory (follow-on, NOT blockers)

The following untouched files still contain bare `catch { return <literal> }` of the same class. Scope note for FIX-ERRAUDIT-W3:

| File | Line(s) | Pattern |
|------|---------|---------|
| `application/usecases/assembleEveningSummary.ts` | 285, 303 | `catch→[]`, `catch→0` (count query) |
| `application/usecases/generatePeriodicSummary.ts` | 583 | `catch→0` |
| `application/usecases/getPipelineHealth.ts` | 80, 92 | `catch→"(unknown)"` (URL.hostname — acceptable), `catch→null` (fs read) |
| `application/usecases/pollNews.ts` | 439, 471 | `catch→[]` |
| `application/usecases/assembleBriefing.ts` | 606, 881, 905, 1204 | JSON parse/schema-probe/per-ticker catches (partially benign context) |
| `interface/mcp/routes/bctcInspectHandler.ts` | 772 | `catch→[]` (JSON parse) |
| `scheduler/news-analysis/deepFetchMainJob.ts` | 142, 146 | `catch→[]` |
| `scheduler/news-analysis/deepFetchVpsJob.ts` | 281, 285 | `catch→[]` |
| `infrastructure/fetchers/polymarket.ts` | 88 | `catch→null` |

These are NOT blockers for FIX-ERRAUDIT-W2 which was scoped to the "easy-handle DATA-LAYER" sites.

## Merge Status

- Commit: `9f4a8eef` already on `main` (router-verified pre-QA)
- No branch to merge (work on main per policy)
- done_verified: NOT set (PO's single-writer call)
