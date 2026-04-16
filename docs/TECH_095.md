# TECH-095: Bollinger Band Breakout Alert Scan Job

status: APPROVED_BY_ARCHITECT
req_ref: REQ-095

## Brownfield Impact

- Files created:
  - `src/scheduler/bbAlertScanJob.ts`
  - `src/__tests__/1309-bb-alert-scan-job.test.ts`
- Files modified:
  - `src/scheduler/jobs.ts` — add `bbAlertScan` cron key + `runBbAlertScan` import + `cron.schedule` block
  - `docs/data/cron-registry.json` — add `bbAlertScanJob` entry, bump `schedulerFileCount` 30 → 31
  - `docs/data/project-stats.json` — correct `schedulerFileCount` 29 → 31 (fixes sprint-094 drift)
- Files deleted: none
- Breaking changes: no

## Architecture Decision

`bbAlertScanJob.ts` is a structural clone of `taAlertScanJob.ts` with BB20 breakout logic substituted for RSI thresholds. The clone pattern is intentional: both jobs share the same SQL constants (CANDLE_SQL, COOLDOWN_SQL, INSERT_ALERT_SQL), the same injectable-deps interface shape, and the same per-ticker error-isolation loop — diverging only in the indicator field read, the threshold comparison, the alert-type strings, confidence value (0.65 vs 0.70), and message format. No new domain interfaces are required; `TechnicalIndicatorResult.bb20` and `DailyCandle` already exist in `src/domain/services/technicalIndicators.ts`.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `runBbAlertScan` | scheduler | `src/scheduler/bbAlertScanJob.ts` | NEW |
| `bbAlertScanJob` cron registration | scheduler | `src/scheduler/jobs.ts` | MODIFY |
| TDD test suite (9 cases) | test | `src/__tests__/1309-bb-alert-scan-job.test.ts` | NEW |
| Cron registry entry | infrastructure (config) | `docs/data/cron-registry.json` | MODIFY |
| Project stats count correction | infrastructure (config) | `docs/data/project-stats.json` | MODIFY |

Domain layer (`technicalIndicators.ts`) — no changes. `computeAllIndicators`, `DailyCandle`, `TechnicalIndicatorResult` are consumed as-is.

## Interface Contracts

### Injectable deps (new file: `src/scheduler/bbAlertScanJob.ts`)

```typescript
export interface BbAlertScanDeps {
  db?: Database;
  computeFn?: (candles: DailyCandle[]) => TechnicalIndicatorResult;
  nowFn?: () => Date;
}

export interface BbAlertScanResult {
  scanned: number;
  fired: number;
}

export async function runBbAlertScan(deps?: BbAlertScanDeps): Promise<BbAlertScanResult>
```

### SQL constants (copy verbatim from `taAlertScanJob.ts`)

All three SQL constants — `CANDLE_SQL`, `COOLDOWN_SQL`, `INSERT_ALERT_SQL` — are identical to the RSI job. The cooldown query uses `json_extract(signals_json, '$[0].type')` and `json_extract(affected_actions_json, '$[0].code')` which are already the canonical keys for all alert types in the project.

### Alert payload differences vs taAlertScanJob

| Field | taAlertScanJob | bbAlertScanJob |
|---|---|---|
| `signals_json[0].type` | `"ta_overbought"` / `"ta_oversold"` | `"ta_bb_breakout_up"` / `"ta_bb_breakout_down"` |
| `signals_json[0].confidence` | `0.7` | `0.65` |
| `message` format | `"VCB: RSI(14) = 74.2 — quá mua"` | `"VCB: giá 88000 vượt BB trên 86500 — bứt phá tăng"` |
| `severity` | `"warning"` | `"warning"` (same) |

### Message construction

```typescript
// breakout-up
const message = `${code}: giá ${close} vượt BB trên ${bb20.upper} — bứt phá tăng`;
// breakout-down
const message = `${code}: giá ${close} dưới BB dưới ${bb20.lower} — bứt phá giảm`;
```

`close` and band values are raw numeric integers from the DB — no decimal formatting, no dot-thousands separator. Both values arrive as `number` from SQLite; use integer coercion via `Math.round()` only if the source is a float average (matching REQ-095 edge-case note).

### Skip conditions (evaluated in order)

1. `candles.length === 0` → skip (no latest close available)
2. `bb20 === null` (from `computeFn`) → skip (< 20 candles for BB computation)
3. `bb20.lower <= close <= bb20.upper` (i.e., `!(close > bb20.upper) && !(close < bb20.lower)`) → skip

Strict `>` / `<` comparisons — exact boundary hits produce no alert (REQ-095 edge case confirmed).

### CRONS key addition in `jobs.ts`

```typescript
// In CRONS object:
bbAlertScan: Bun.env.CRON_BB_ALERT_SCAN ?? '*/15 2-8 * * 1-5',
```

```typescript
// In startScheduler():
cron.schedule(CRONS.bbAlertScan, async () => {
  await recordJobRun(getDb(), 'bbAlertScanJob', async () => {
    const result = await runBbAlertScan()
    if (result.fired > 0) {
      log(`[bb-alert-scan] scanned=${result.scanned} fired=${result.fired}`)
    }
    return { rowsWritten: result.fired }
  })
}, { timezone: 'UTC' })
```

Timezone: `UTC` (same as `taAlertScan`) — the cron window `2-8 UTC` is already UTC-anchored.

## Task Breakdown (for PM)

Dependency order (tasks 1309 + 1310 already exist in TASKS.md on shared branch):

| Order | Task | Description | Depends on |
|---|---|---|---|
| 1 | 1310 | TDD: write `1309-bb-alert-scan-job.test.ts` first (9 test cases) | taAlertScanJob pattern (done) |
| 2 | 1309 | Implement `bbAlertScanJob.ts` + register in `jobs.ts` | 1310 tests as spec |
| 3 | 1309 | Update `cron-registry.json` + `project-stats.json` | 1309 implementation |

Both tasks share branch `task/1309-1310-bb-alert-scan-job` as specified in TASKS.md.

### Test file design: `src/__tests__/1309-bb-alert-scan-job.test.ts`

9 test cases mapping to AC-1 through AC-9:

| Case | AC | Setup | Assert |
|---|---|---|---|
| breakout-up fires | AC-1 | VCB, 1 candle row (price=88000), computeFn returns `bb20={upper:86500,mid:84000,lower:82000}` | `fired=1`, `type="ta_bb_breakout_up"`, message contains "88000","86500","bứt phá tăng", confidence=0.65 |
| breakout-down fires | AC-2 | HPG, 1 candle row (price=22000), computeFn returns `bb20={upper:24000,mid:23100,lower:23100}` | `fired=1`, `type="ta_bb_breakout_down"`, message contains "22000","23100","bứt phá giảm" |
| inside band — no alert | AC-3 | close=84000, bb20={upper:86000,mid:84000,lower:82000} | `fired=0`, 0 DB rows |
| bb20 null — no alert | AC-4 | computeFn returns `bb20: null` | `fired=0`, 0 DB rows |
| empty candles — no alert | AC-5 | watchlist has VCB, 0 rows in market_prices_history | `fired=0`, 0 DB rows |
| cooldown suppresses | AC-6 | first scan fires, second scan 30min later same conditions | second `fired=0`, still 1 DB row |
| cooldown lifts after 4h | AC-7 | first scan fires, UPDATE alert triggered_at to >4h ago, second scan | second `fired=1`, 2 DB rows total |
| multi-ticker counts | AC-8 | 3 tickers: 2 above upper, 1 inside band | `scanned=3, fired=2` |
| empty watchlist | AC-9 | empty watchlist table | `{scanned:0, fired:0}`, 0 DB writes |

Key implementation note for `makeComputeFn`: unlike RSI tests, BB tests require at least 1 row in `market_prices_history` for the ticker (to get a non-empty `candles` array providing a real `close` value). The test populates one row with the desired close price, then injects `computeFn` to return the controlled `bb20` bands. The `computeFn` receives `candles` but ignores them — `bb20` is controlled via injection.

Cooldown type independence does not need a dedicated test case (pathological scenario, covered by AC-6 logic showing `alertType` is the cooldown key). The implementation naturally handles it because COOLDOWN_SQL is parameterized on `(alertType, code)`.

## Registry File Updates

### `docs/data/cron-registry.json`

- `schedulerFileCount`: 30 → 31
- Append to `jobs[]`:
```json
{ "schedule": "*/15 min market (2-8 UTC M-F)", "name": "bbAlertScanJob", "desc": "BB20 upper/lower breakout intraday scan — inserts ta_bb_breakout_up/ta_bb_breakout_down alerts, 4h cooldown" }
```

### `docs/data/project-stats.json`

- `schedulerFileCount`: 29 → 31 (corrects sprint-094 drift where `taAlertScanJob.ts` was added without updating this file)

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `close` value is float average (not integer) causing message to show decimals | Medium | Low | Apply `Math.round()` to `close` before message interpolation; consistent with how the candle query uses `AVG(price)` |
| Cooldown type-independence broken if wrong alertType key passed to COOLDOWN_SQL | Low | Medium | Both alertType strings differ → distinct cooldown rows. Covered by AC-6 test |
| `project-stats.json` count drift recurs next sprint | Low | Low | REQ notes this explicitly; both files corrected to 31 in this sprint |
| `computeFn` injection signature mismatch with taAlertScanJob pattern | Low | Medium | Interface is identical `(candles: DailyCandle[]) => TechnicalIndicatorResult` — copy verbatim from taAlertScanJob.ts imports |
| jobs.ts CRONS key collision | Low | High | Key name `bbAlertScan` (camelCase) has no existing match in CRONS object |

## Security Review

- SQL parameterized? Yes — CANDLE_SQL, COOLDOWN_SQL, INSERT_ALERT_SQL all use `?` bindings; no string interpolation
- File paths validated (no `../`)? N/A — no file I/O
- External HTTP rate-limited? N/A — no external HTTP; reads only local SQLite
- Secrets via Bun.env only? Yes — `CRON_BB_ALERT_SCAN` env var fallback only
