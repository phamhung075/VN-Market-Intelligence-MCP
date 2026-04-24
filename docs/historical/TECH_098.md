# TECH-098: TA Alert Real-Time Delivery

status: APPROVED_BY_ARCHITECT
req_ref: REQ-098

## Brownfield Impact

- Files created: `src/scheduler/taAlertNotifierJob.ts`, `src/__tests__/1314-ta-alert-notifier.test.ts`
- Files modified: `src/scheduler/jobs.ts`, `docs/data/cron-registry.json`, `docs/data/project-stats.json`
- Files deleted: none
- Breaking changes: no

## Architecture Decision

`taAlertScanJob` and `bbAlertScanJob` write `severity='warning'` alert rows every 15 min; `readUnnotifiedAlerts()` (used by Alert Commander) filters `severity IN ('high','critical')` only, leaving TA alerts undelivered until the 21:00 digest. The correct fix is a new delivery-only scheduler job — not widening the Alert Commander severity filter — because TA alerts require batching (one message per cycle, not one per alert) and a distinct `from_agent` marker for market_messages persistence. The pattern mirrors `foreignFlowAlertJob` (insert + notify decoupled), with the delivery side modelled after the direct-to-market channel path used by that job's test harness.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| taAlertNotifierJob | scheduler | `src/scheduler/taAlertNotifierJob.ts` | NEW |
| Cron entry | scheduler | `src/scheduler/jobs.ts` | MODIFY |
| TDD test suite | test | `src/__tests__/1314-ta-alert-notifier.test.ts` | NEW |
| Cron registry | data | `docs/data/cron-registry.json` | MODIFY |
| Project stats | data | `docs/data/project-stats.json` | MODIFY |

## Interface Contracts

### Exported types — `src/scheduler/taAlertNotifierJob.ts`

```typescript
export interface TaAlertNotifierDeps {
  db?: Database;                                           // defaults to getDb()
  sendFn?: (msg: string, opts: unknown) => Promise<void>; // defaults to sendTelegramMarket
  nowFn?: () => Date;                                     // defaults to () => new Date()
}

export interface TaAlertNotifierResult {
  sent: number;    // rows successfully marked notified_telegram=1
  skipped: number; // always 0 (WHERE clause enforces; field exists for future audit)
}

export async function runTaAlertNotifier(
  deps?: TaAlertNotifierDeps,
): Promise<TaAlertNotifierResult>

export async function runTaAlertNotifierCron(): Promise<void>  // recordJobRun wrapper
```

### SQL constants (all parameterized — no string interpolation)

```sql
-- FR-1: fetch unnotified TA alert rows
SELECT id, message, signals_json, affected_actions_json
  FROM alerts
 WHERE notified_telegram = 0
   AND json_extract(signals_json, '$[0].type') IN (
       'ta_overbought', 'ta_oversold',
       'ta_bb_breakout_up', 'ta_bb_breakout_down'
   )
 ORDER BY triggered_at ASC;

-- FR-4: mark notified (per-row)
UPDATE alerts SET notified_telegram = 1 WHERE id = ?;
```

### Message format — FR-2

```
TA Alert [HH:MM VN]:
{code}: RSI={value} quá mua          ← ta_overbought  (value from stored message field)
{code}: RSI={value} quá bán          ← ta_oversold
{code}: giá vượt BB trên — bứt phá tăng  ← ta_bb_breakout_up
{code}: giá dưới BB dưới — bứt phá giảm  ← ta_bb_breakout_down
```

- `code` = `json_extract(affected_actions_json, '$[0].code')` — fallback `"(unknown)"` on NULL, log warning
- RSI value = extracted from stored `message` field directly (avoids double-format risk per edge-case note in REQ-098 §7)
- Header timestamp = `nowFn()` formatted as `HH:MM` in UTC+7
- Cap: first 10 rows only; if `rows.length > 10` log warning with truncated count; all 10 marked notified (remaining picked up next cycle)
- No trailing newline

### sendFn call — FR-3

```typescript
await sendFn(formattedMessage, {
  persist: { from_agent: "ta-notifier", message_type: "ta_alert" },
});
```

Default `sendFn` wraps `sendTelegramMarket` (dynamic import, same pattern as foreignFlowAlertJob production path).

### jobs.ts additions

```typescript
// CRONS object — new key
taAlertNotifier: Bun.env.CRON_TA_ALERT_NOTIFIER ?? '*/15 2-8 * * 1-5',

// import
import { runTaAlertNotifierCron } from './taAlertNotifierJob.js'

// cron.schedule entry (UTC timezone — same as taAlertScan/bbAlertScan)
cron.schedule(CRONS.taAlertNotifier, async () => {
  await recordJobRun(getDb(), 'taAlertNotifierJob', async () => {
    const result = await runTaAlertNotifierCron()   // internally calls runTaAlertNotifier
    return { rowsWritten: result.sent }
  })
}, { timezone: 'UTC' })
```

## Task Breakdown (for PM)

Dependency order — both tasks share branch `task/1314-1315-ta-alert-notifier`:

| Order | Task ID | Title | Depends on |
|---|---|---|---|
| 1 | 1315 | test(ta-notifier): write `1314-ta-alert-notifier.test.ts` FIRST (TDD) | none |
| 2 | 1314 | feat(ta-notifier): implement `taAlertNotifierJob.ts` + wire jobs.ts + update registries | 1315 |

Test-first order: 1315 must be committed (failing) before 1314 starts — standard TDD protocol per dev-standards.

## Test Contract — `src/__tests__/1314-ta-alert-notifier.test.ts`

| AC | Description | Assert |
|---|---|---|
| AC-1 | Empty/notified-only table | `sendFn` not called; returns `{sent:0, skipped:0}` |
| AC-2 | One `ta_overbought` row | `sendFn` called once; message contains ticker + "quá mua"; starts "TA Alert" |
| AC-3 | Mark notified after send | `notified_telegram=1` in DB; returns `{sent:1, skipped:0}` |
| AC-4 | sendFn throws | `notified_telegram` stays 0; returns `{sent:0, skipped:0}` |
| AC-5 | Non-TA type (`position-danger`) | `sendFn` not called; row unchanged |
| AC-6 | Already notified (`notified_telegram=1`) | `sendFn` not called |
| AC-7 | Three tickers (mixed types) | `sendFn` called once; message contains all 3 codes; returns `{sent:3, skipped:0}` |
| AC-8 | `ta_bb_breakout_up` + `ta_bb_breakout_down` | Both in message; returns `{sent:2, skipped:0}` |
| AC-9 | Any non-empty batch | Message begins "TA Alert" |
| AC-10 | jobs.ts + registry files | CRONS key present; cron-registry.json count=32; project-stats.json count=32 |

### Test DB DDL (full `alerts` table — must include `notified_telegram` column)

```typescript
db.run(`
  CREATE TABLE IF NOT EXISTS alerts (
    id                    TEXT PRIMARY KEY,
    triggered_at          TEXT NOT NULL,
    severity              TEXT NOT NULL,
    signals_json          TEXT,
    affected_actions_json TEXT,
    analysis_ids_json     TEXT,
    message               TEXT,
    read                  INTEGER NOT NULL DEFAULT 0,
    user_note             TEXT,
    notified_telegram     INTEGER NOT NULL DEFAULT 0,
    sent_by               TEXT
  )
`);
```

Reference: `src/__tests__/1133-foreign-flow-alert-job.test.ts` line 69-82 for the pattern. The 1309 test DDL is insufficient — it omits `notified_telegram`.

### RSI value extraction from stored message

`taAlertScanJob` writes `message = "${code}: RSI(14) = ${rsi.toFixed(1)} — ${suffix}"`.

The notifier formats its own line per alert type using the stored `message` field directly:
- For `ta_overbought` / `ta_oversold`: parse RSI value via regex `RSI\(14\)\s*=\s*([\d.]+)` from `row.message`, format as `"{code}: RSI={value} quá mua|quá bán"`. If regex fails, fall back to `"{code}: RSI=? quá mua|quá bán"` and log warning.
- For `ta_bb_breakout_up` / `ta_bb_breakout_down`: fixed strings (no numeric extraction needed).

This avoids re-reading `signals_json` fields which are not guaranteed to carry a numeric `value` field.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `notified_telegram` column absent in test DDL | High | Test failure | Explicit DDL in test setup (see above) — confirmed from 1133 pattern |
| sendFn signature mismatch (`opts: unknown` vs `SendTelegramOptions`) | Low | TS error | Inject wrapper: `(msg, opts) => sendTelegramMarket(msg, opts as SendTelegramOptions)` in default factory |
| Duplicate sends on crash-after-send | Low | Acceptable dup | By design (REQ-098 NFR): better than silent drop; no mitigation needed |
| Batch > 10 truncation skips rows permanently | Low | Data loss | Rows NOT truncated — remaining rows stay `notified_telegram=0` and are picked up next 15-min cycle |
| CRONS key count drift in log line (jobs.ts line 442) | Low | Minor log error | Update `Object.keys(CRONS).length` comment if needed; no functional impact |
| `affected_actions_json` null → "(unknown)" line sent | Low | Minor UX noise | Log warning; send anyway (prefer noisy delivery over silent drop) |

## Security Review

- SQL parameterized? Yes — both SELECT (IN clause with literals) and UPDATE use `?` bindings
- File paths validated (no `../`)? N/A — no file I/O
- External HTTP rate-limited? N/A — Telegram send uses existing `sendTelegramMarket` which handles its own HTTP; no new external host
- Secrets via `Bun.env` only? Yes — Telegram token consumed inside `sendTelegramMarket`, not read by this job
