# TASK-1382d — Developer Handoff: signalOutcomeJob.ts — Daily Post-Close Resolver

**Sprint class:** SPRINT-S
**Created:** 2026-04-28
**By:** pm
**Depends on:** 1382b (notifier writes 'fired'; this job reads 'fired' + NULL rows)
**Blocks:** 1382c (cron wiring requires this file to exist)

---

## Objective

Create `signalOutcomeJob.ts` — a daily scheduler job that resolves `agent_signals` outcomes after market close. Reads rows with `outcome IS NULL OR outcome = 'fired'`, compares price before vs 4h after signal creation, and calls `recordOutcome()` with `confirmed` or `false_positive`.

---

## New File

`apps/mcp-server/src/scheduler/alerts/signalOutcomeJob.ts`

~25 lines of logic.

---

## Exported Interface

```typescript
export interface SignalOutcomeJobDeps {
  db?: Database;
  nowFn?: () => Date;
}

export interface SignalOutcomeJobResult {
  evaluated: number;   // rows examined
  confirmed: number;
  false_positive: number;
  skipped: number;     // no stock_code or no price data
}

export async function runSignalOutcomeJob(
  deps?: SignalOutcomeJobDeps
): Promise<SignalOutcomeJobResult>

export async function runSignalOutcomeJobCron(): Promise<void>
```

---

## Logic

1. Query `agent_signals` WHERE `(outcome IS NULL OR outcome = 'fired')` AND `created_at >= datetime('now', '-2 days')` (2-day window catches weekend lag)

2. For each row:
   - If `stock_code` is null → skipped (market-wide signal, outcome stays NULL)
   - Query `market_prices_history` for average close price in a 30-min window around `created_at` (baseline) and in a 30-min window starting 4h after `created_at` (resolution)
   - If either price missing → skipped (no data yet, weekend gap)
   - Compute `pct = (resolution - baseline) / baseline * 100`
   - Determine expected direction:
     - `ta_overbought`, or `price_anomaly` with `payload_json.direction='down'` → bearish (price should fall)
     - `ta_oversold`, `chain_catalyst`, `verified_chain`, `urgent_news` → bullish (price should rise)
     - Parse `payload_json` leniently — if unparseable, assume bullish
     - Unknown type → assume bullish
   - Resolution:
     - `abs(pct) < 1.0` → `confirmed` (flat, no harmful move)
     - `pct` in expected direction `>= 1.0` → `confirmed`
     - `pct` against expected direction `>= 1.0` → `false_positive`
   - Call `recordOutcome(db, row.id, outcome, detail)`

3. Return `{ evaluated, confirmed, false_positive, skipped }`

---

## Imports Allowed

- `Database` from `bun:sqlite`
- `recordOutcome` from `../../infrastructure/db/agentSignalStore.js`
- `getDb` from `../../infrastructure/db/database.js` (for production `db` default)

Do NOT import from `interface/` or `application/`.

---

## Test File

`apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts`

9 test cases (AC-1 through AC-8 in this task; AC-9 added by 1382c):

| AC | Description |
|----|-------------|
| AC-1 | No NULL/fired rows → `{ evaluated:0, confirmed:0, false_positive:0, skipped:0 }` |
| AC-2 | Signal with no `stock_code` → skipped, outcome stays NULL |
| AC-3 | Signal with `stock_code` but no price history → skipped |
| AC-4 | Price rose ≥1% for bullish signal → `outcome='confirmed'` |
| AC-5 | Price fell ≥1% for bullish signal → `outcome='false_positive'` |
| AC-6 | Price flat (<1% move) → `outcome='confirmed'` |
| AC-7 | Signal already `outcome='confirmed'` → NOT re-evaluated |
| AC-8 | Signal `outcome='fired'` → IS re-evaluated (upgraded by daily job) |

Use `deps` injection pattern (identical to `taAlertScanDeps`) for `db` and `nowFn`. In-memory DB with full `agent_signals` DDL + `market_prices_history` DDL. No HTTP calls.

---

## Risk Notes

- Weekend gap: signals created Friday have no Saturday price data — skip-on-missing handles this correctly. They stay unresolved permanently. Acceptable.
- Double-write: 1382b writes `fired`, this job upgrades to `confirmed`/`false_positive`. Intentional — the WHERE clause explicitly includes `outcome = 'fired'`.

---

## Commit Format

```
task(1382d): add signalOutcomeJob.ts — daily post-close signal outcome resolver

- queries agent_signals where outcome IS NULL OR outcome = 'fired' within 2-day window
- compares market_prices_history 30-min windows: baseline vs +4h resolution
- direction inference from signal_type + payload_json.direction
- calls recordOutcome() from agentSignalStore.ts
- AC-1 through AC-8 passing (8 tests, in-memory SQLite, no HTTP)
```
