# TECH-094: RSI Overbought/Oversold Intraday Alert Job

status: APPROVED_BY_ARCHITECT
req_ref: REQ-094

---

## Brownfield Impact

- **Files created:** `src/scheduler/taAlertScanJob.ts`, `src/__tests__/1307-ta-alert-scan-job.test.ts`
- **Files modified:** `src/scheduler/jobs.ts` (CRONS map + cron.schedule entry), `docs/data/cron-registry.json` (count 29→30 + entry), `docs/data/project-stats.json` (schedulerFileCount 29→30)
- **Files deleted:** none
- **Breaking changes:** no

---

## Architecture Decision

`taAlertScanJob` follows the exact pattern of `bctcOverdueCheckJob` (watchlist loop + `alerts` table insert) and `foreignFlowAlertJob` (injectable `db`, per-ticker error isolation, `recordJobRun` wrapper). It reuses the existing `computeAllIndicators` domain service and the `DailyCandle` type — no new domain logic is needed. The job writes only to `alerts`; Telegram dispatch is left exclusively to Alert Commander via the `readUnnotifiedAlerts()` pipeline, preserving the existing alert routing invariant.

---

## DDD Layer Plan

| Component              | Layer       | File Path                                                           | New/Modify |
|------------------------|-------------|---------------------------------------------------------------------|------------|
| `runTaAlertScan`       | scheduler   | `src/scheduler/taAlertScanJob.ts`                                   | NEW        |
| `CRONS.taAlertScan`    | scheduler   | `src/scheduler/jobs.ts`                                             | MODIFY     |
| `cron.schedule` entry  | scheduler   | `src/scheduler/jobs.ts`                                             | MODIFY     |
| Test suite             | test        | `src/__tests__/1307-ta-alert-scan-job.test.ts`                      | NEW        |
| Stats counter          | data        | `docs/data/project-stats.json`                                      | MODIFY     |
| Cron registry entry    | data        | `docs/data/cron-registry.json`                                      | MODIFY     |

**Domain imports used (read-only, no modification):**

| Symbol                   | Source                                                              |
|--------------------------|---------------------------------------------------------------------|
| `computeAllIndicators`   | `src/domain/services/technicalIndicators.ts`                       |
| `DailyCandle`            | `src/domain/services/technicalIndicators.ts`                       |
| `TechnicalIndicatorResult` | `src/domain/services/technicalIndicators.ts`                     |
| `recordJobRun`           | `src/infrastructure/db/cronJobRunStore.ts`                         |
| `getDb`                  | `src/infrastructure/db/schema.ts`                                  |
| `logger`                 | `src/infrastructure/logger.ts`                                     |

---

## Interface Contracts

### `src/scheduler/taAlertScanJob.ts` — exported surface

```typescript
// Dependency-injectable params (all optional — production uses defaults)
export interface TaAlertScanDeps {
  db?: Database;
  computeFn?: (candles: DailyCandle[]) => TechnicalIndicatorResult;
  nowFn?: () => Date;
}

// Return type wired into recordJobRun({ rowsWritten })
export interface TaAlertScanResult {
  scanned: number;
  fired: number;
}

export async function runTaAlertScan(deps?: TaAlertScanDeps): Promise<TaAlertScanResult>
```

### Candle SQL (identical to `get_technical_indicators` MCP tool)

```sql
SELECT date(fetched_at) AS day, AVG(price) AS close_price
  FROM market_prices_history
 WHERE code = ?
   AND fetched_at >= datetime('now', '-60 days')
 GROUP BY date(fetched_at)
 ORDER BY day ASC
```

Parameters: `[code]` — fully parameterized, no string interpolation.

### Cooldown SQL (FR-3)

```sql
SELECT COUNT(*) AS cnt
  FROM alerts
 WHERE json_extract(signals_json, '$[0].type') = ?
   AND json_extract(affected_actions_json, '$[0].code') = ?
   AND triggered_at >= datetime('now', '-4 hours')
```

Parameters: `[alertType, code]`

### Alert insert (FR-2 schema — matches production `alerts` table)

```sql
INSERT INTO alerts
  (id, triggered_at, severity, signals_json, affected_actions_json,
   analysis_ids_json, message, read, user_note)
VALUES
  (?, ?, ?, ?, ?, NULL, ?, 0, NULL)
```

- `id`: `crypto.randomUUID()`
- `severity`: `'warning'`
- `signals_json`: `JSON.stringify([{ type, actionCode: code, message, confidence: 0.7, detectedAt: triggeredAt }])`
- `affected_actions_json`: `JSON.stringify([{ code }])`
- `message`: Vietnamese — `"{CODE}: RSI(14) = {value.toFixed(1)} — quá mua"` or `"quá bán"`

No `INSERT OR IGNORE` — cooldown is enforced before insert, not via DB dedup.

### `jobs.ts` additions

CRONS map entry (insert after `franceSummary`):

```typescript
/** taAlertScan — every 15min VN market hours (task 1307) */
taAlertScan: Bun.env.CRON_TA_ALERT_SCAN ?? '*/15 2-8 * * 1-5',
```

cron.schedule block (insert before closing `log(...)` in `startScheduler`):

```typescript
// Every 15 min during VN market hours (02:00–08:59 UTC, Mon–Fri) — TA alert scan — task 1307
// Scans watchlist RSI(14). Writes ta_overbought/ta_oversold rows to alerts table.
// No direct Telegram — Alert Commander dispatches via readUnnotifiedAlerts().
cron.schedule(CRONS.taAlertScan, async () => {
  await recordJobRun(getDb(), 'taAlertScanJob', async () => {
    const result = await runTaAlertScan()
    if (result.fired > 0) {
      log(`[ta-alert-scan] scanned=${result.scanned} fired=${result.fired}`)
    }
    return { rowsWritten: result.fired }
  })
}, { timezone: 'UTC' })
```

---

## Internal Logic — `runTaAlertScan`

```
1. Resolve deps: db = deps?.db ?? getDb()
                 computeFn = deps?.computeFn ?? computeAllIndicators
                 nowFn = deps?.nowFn ?? (() => new Date())

2. Query: SELECT code FROM watchlist
   → if empty: return { scanned: 0, fired: 0 }

3. scanned = 0, fired = 0

4. for each { code } in watchlist:
   scanned++
   try:
     a. Query market_prices_history candles (60d, parameterized)
     b. Map CandleRow[] → DailyCandle[] (close_price → close)
     c. indicators = computeFn(candles)
     d. rsi = indicators.rsi14
     e. if rsi === null → continue (skip, no log)
     f. Determine alertType:
          rsi > 70  → 'ta_overbought', suffix = 'quá mua'
          rsi < 30  → 'ta_oversold',   suffix = 'quá bán'
          else      → continue (no alert)
     g. Cooldown check (parameterized query) → if cnt > 0: continue
     h. Build triggeredAt = nowFn().toISOString()
        message = `{CODE}: RSI(14) = {rsi.toFixed(1)} — {suffix}`
        signals_json = [{ type: alertType, actionCode: code, message, confidence: 0.7, detectedAt: triggeredAt }]
        affected_actions_json = [{ code }]
     i. INSERT into alerts (parameterized, no INSERT OR IGNORE)
     j. fired++
   catch (err):
     logger.warn(`[taAlertScan] error ticker=${code}`, { error: ... })
     // scanned already incremented; do not abort loop

5. return { scanned, fired }
```

**AC-9 note:** errored tickers are counted in `scanned` (increment happens before try block). Dev must document this choice in the job file's header comment.

---

## Task Breakdown (for PM — task numbers already assigned in TASKS.md)

| Order | Task | Description | Depends on |
|-------|------|-------------|------------|
| 1 | 1308 | TDD: write failing `1307-ta-alert-scan-job.test.ts` first (AC-1 through AC-9) | REQ-094 |
| 2 | 1307 | Implement `taAlertScanJob.ts` + wire into `jobs.ts` | 1308 (test written), 1302 (technicalIndicators ✓) |
| post-merge | — | Update `docs/data/project-stats.json` schedulerFileCount 29→30 | merge of 1307 |
| post-merge | — | Update `docs/data/cron-registry.json` count 29→30 + new entry | merge of 1307 |

Both tasks share branch `task/1307-1308-ta-alert-scan-job` per TASKS.md.

---

## Test File Contract: `src/__tests__/1307-ta-alert-scan-job.test.ts`

Test DB setup: in-memory SQLite with minimal DDL (only tables touched by the job):

```sql
-- watchlist
CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY);

-- market_prices_history (candle query target — can be empty; computeFn is injected)
CREATE TABLE IF NOT EXISTS market_prices_history (
  code TEXT, price REAL, fetched_at TEXT
);

-- alerts (insert + cooldown query target)
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  triggered_at TEXT NOT NULL,
  severity TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  affected_actions_json TEXT NOT NULL,
  analysis_ids_json TEXT,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  user_note TEXT
);
```

All tests use injectable `computeFn` returning controlled `TechnicalIndicatorResult`. The `market_prices_history` table can remain empty because `computeFn` replaces the real indicator computation.

Required test cases mapping to ACs:

| Test | AC | Key assertion |
|------|----|---------------|
| overbought alert fires | AC-1 | 1 row in alerts, type=ta_overbought, message contains "quá mua", returns {scanned:1,fired:1} |
| oversold alert fires | AC-2 | type=ta_oversold, message contains "quá bán" |
| neutral RSI no alert | AC-3 | 0 rows, {scanned:1,fired:0} |
| null RSI no alert | AC-4 | 0 rows, {scanned:1,fired:0} |
| cooldown suppresses at T+30min | AC-5 | second call → 0 additional rows |
| cooldown lifts at T+5h | AC-6 | second call with nowFn=T+5h → 1 additional row |
| multi-ticker counts | AC-7 | {scanned:3,fired:2} |
| empty watchlist | AC-8 | {scanned:0,fired:0} |
| per-ticker error isolation | AC-9 | error on ticker 2 caught, ticker 3 fires, {scanned:3,fired:1} |

AC-10 (job registration) and AC-11 (tsc clean) are verified by integration — not unit tested.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| `alerts` table column mismatch (wrong column names) | Low | High | REQ-094 FR-2 explicitly maps every column to schema.ts lines 169–188. Dev must cross-check before PR. |
| Cooldown SQL uses json_extract on non-TA alerts — full table scan | Low | Medium | Index on `triggered_at` already exists (alert pipeline uses it). Acceptable for ≤30 tickers at 15-min cadence. |
| `computeAllIndicators([])` returns null RSI — silent skip | Low | Low | By design (FR edge case). Skip path has no log noise. |
| VN market holiday: job runs, prices are stale, RSI unchanged → re-fire after cooldown expires | Low | Low | Expected: cooldown prevents same-day re-fire. RSI moving into extreme on a holiday is informational. |
| `jobs.ts` comment header still says 29 scheduler files after add | Medium | Low | Strictly update header comment + cron-registry.json + project-stats.json as post-merge checklist item. |

---

## Security Review

- SQL parameterized? **Yes** — all three queries (candle, cooldown, insert) use `db.query<T,[...]>(sql).all(params)` or `db.prepare(sql).run(params)`. No string interpolation of `code` or `alertType`.
- File paths validated (no `../`)? **N/A** — no file I/O.
- External HTTP rate-limited? **N/A** — no HTTP calls. All data from local SQLite.
- Secrets via `Bun.env` only? **Yes** — only `CRON_TA_ALERT_SCAN` env var, not a secret. No API keys in this file.
- No direct Telegram import? **Enforced by design** — job writes `alerts` table only. Any import of `sendTelegram` or `telegramClient` in this file is a DDD violation and must be flagged in QA review.
