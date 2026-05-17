# Architecture Brief — Signal Outcome Feedback Loop

**Date:** 2026-05-17
**Author:** agents-architect
**Status:** Ready for implementation
**Recipients:** dev-mcp-server (Steps 1–10), dev-frontend (Steps 11–12)

---

## 1. Problem Statement

Cowork agents (news-scout, financial-analyst, cascade engine) write BULLISH/BEARISH/NEUTRAL
signals to `agent_signals`. There is no mechanism to verify whether a signal's predicted direction
actually materialised, track which agents and signal types are historically accurate, or feed that
accuracy history back to agents for self-calibration.

The existing `signalOutcomeJob.ts` (Task 1382d) already resolves `outcome` = confirmed/false_positive
using a 4-hour price window stored in `market_prices_history`. This brief extends that concept with:

1. A dedicated `signal_outcomes` table capturing T+24h and T+48h price verification (R1/R2).
2. An accuracy stats view/query aggregated per `signal_type` + `stock_code` (R3).
3. A context-injection mechanism that surfaces accuracy stats at cowork cycle start (R4).
4. A frontend accuracy badge on the existing StockSignalsPanel (R5).

**Relationship to TNB Critic Gate (2026-05-17-tnb-critic-gate.md):**
The critic gate operates at signal *write time* (deterministic rule-based quality check before
persistence). This brief operates *post-persistence* (price verification 24–48h after write).
They do not overlap. Do not duplicate critic_score columns into signal_outcomes.

---

## 2. Context — Existing Infrastructure

| Asset | Location | Relevance |
|---|---|---|
| `agent_signals` table + `postSignal()` | `agentSignalStore.ts` | Write path to extend |
| `signalOutcomeJob.ts` | `scheduler/alerts/signalOutcomeJob.ts` | 4h outcome job — pattern to follow |
| `recordOutcome()` | `agentSignalStore.ts` | Writes `outcome` on agent_signals — separate from signal_outcomes table |
| `market_prices_history` | SQLite, same DB | T+4h price source for existing outcome job |
| stock-price service | `apps/stock-price/` | `GET /price/history?code=X&days=N` → `DailyOHLCV[]` |
| `GET /api/signals/stock/:code` | `server.ts` line 913 | Existing frontend signals API to extend |
| `fetchStockSignals()` | `apps/frontend/app/lib/api/client.ts` line 320 | Frontend client for signals |
| `dashboard.analysis.tsx` | Frontend route | Renders stock detail panel with signals |
| `CRONS` config | `cronConfig.ts` | Add new cron entry here |

---

## 3. Schema — `signal_outcomes` Table (R1/R2)

New table in the same SQLite database (`mcp-server` DB). Created via additive migration in `schema.ts`.

```sql
CREATE TABLE IF NOT EXISTS signal_outcomes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id           INTEGER NOT NULL REFERENCES agent_signals(id),
  stock_code          TEXT    NOT NULL,
  signal_type         TEXT    NOT NULL,
  from_agent          TEXT    NOT NULL,
  predicted_direction TEXT    NOT NULL,           -- 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  price_at_signal     REAL    DEFAULT NULL,        -- baseline close price
  price_at_24h        REAL    DEFAULT NULL,
  price_at_48h        REAL    DEFAULT NULL,
  outcome_24h         TEXT    DEFAULT 'pending',  -- 'correct'|'incorrect'|'neutral'|'pending'
  outcome_48h         TEXT    DEFAULT 'pending',
  checked_at          TEXT    DEFAULT NULL,        -- ISO8601 UTC, set when both windows resolved
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal_id   ON signal_outcomes(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_stock_code  ON signal_outcomes(stock_code, signal_type);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_created_at  ON signal_outcomes(created_at);
```

### Direction semantics

`predicted_direction` is derived from `finding_data.direction` or `finding_data.catalyst_direction`
at the moment the outcome row is created. Normalise to uppercase BULLISH/BEARISH/NEUTRAL.
BULLISH = price-rise prediction; BEARISH = price-fall prediction; NEUTRAL = no directional call.

### Outcome semantics

| outcome value | condition |
|---|---|
| `correct` | predicted BULLISH and pct >= +1.0%; predicted BEARISH and pct <= -1.0% |
| `incorrect` | predicted BULLISH and pct <= -1.0%; predicted BEARISH and pct >= +1.0% |
| `neutral` | abs(pct) < 1.0% (tolerance band) |
| `pending` | price data not yet available for the window |

NEUTRAL signals (predicted_direction = 'NEUTRAL') are recorded but excluded from accuracy
rate calculations (they have no directional claim to verify).

---

## 4. Outcome Check Job — Scheduling Pattern (R1)

### Decision: cron scan (not per-signal timer)

A per-signal scheduled timer (e.g. `setTimeout(resolveAt24h, 86400_000)`) is fragile across
server restarts. The existing `signalOutcomeJob.ts` uses a daily cron scan pattern — apply the
same here.

New cron: `signalOutcomeResolutionJob` runs **every hour** (`0 * * * *`).

Every run:
1. Queries `signal_outcomes` where `outcome_24h = 'pending'` AND `created_at <= now - 24h`.
2. Queries `signal_outcomes` where `outcome_48h = 'pending'` AND `created_at <= now - 48h`.
3. For each matching row, fetches price via stock-price service and resolves the outcome.
4. Sets `checked_at = datetime('now')` when both windows are resolved.

### Seeding: when are signal_outcomes rows created?

A row is inserted into `signal_outcomes` immediately after a signal is written to `agent_signals`,
inside `postSignal()` or a thin wrapper. The seed step:
- Derives `predicted_direction` from `findingData.direction` / `findingData.catalyst_direction`.
- Fetches baseline price immediately (optional — can be deferred to first resolution scan).
- Sets `outcome_24h = 'pending'`, `outcome_48h = 'pending'`.
- Only seeds rows where `stock_code IS NOT NULL` and `predicted_direction != 'NEUTRAL'`.

**Recommended approach:** seed in `postSignal()` by calling a lightweight
`seedSignalOutcome(db, signalId, input)` helper. This keeps the write path synchronous and does
not add HTTP latency (baseline price fetch is deferred to the first hourly scan).

---

## 5. Price Fetch Strategy (R1)

### For baseline price at signal creation time

Use `market_prices_history` (already in the SQLite DB). Same query pattern as `signalOutcomeJob.ts`:

```sql
SELECT AVG(price) AS avg_price
FROM market_prices_history
WHERE code = ?
  AND fetched_at >= datetime(?, '-15 minutes')
  AND fetched_at <= datetime(?, '+15 minutes')
```

Bind: `[stock_code, created_at, created_at]`.

If no row is found (market closed at signal time), use the next available price within +60 minutes
as the baseline. If still not found: leave `price_at_signal = NULL`, skip outcome for this row
on this scan, retry on next hourly run.

### For T+24h and T+48h prices

Two options:

**Option A (preferred): `market_prices_history`** — the same table already accumulates intraday
prices. For any trading day, T+24h is the next market open price. Query:

```sql
SELECT AVG(price) AS avg_price
FROM market_prices_history
WHERE code = ?
  AND fetched_at >= datetime(?, '+23 hours 30 minutes')
  AND fetched_at <= datetime(?, '+24 hours 30 minutes')
```

This is zero extra HTTP and reuses data already collected by the market scan job. If no data is
found (weekend gap), the hourly job skips and retries the next run.

**Option B (fallback): stock-price service `GET /price/history?code=X&days=3`** — returns
`DailyOHLCV[]` from `apps/stock-price`. Use the `close` price of the day corresponding to T+24h
or T+48h calendar date. This covers weekends where intraday data is sparse.

**Decision: implement Option A first; add Option B fallback** when `market_prices_history` returns
NULL for both windows (weekend/holiday gap). The stock-price service HTTP call to
`http://stock-price:5000/price/history?code=X&days=3` is already used by other scheduler jobs.

---

## 6. Accuracy Stats Query/View (R3)

No materialised view required. A parameterised query function in a new store file is sufficient.

```typescript
export interface SignalAccuracyStats {
  signal_type: string;
  stock_code: string;
  sample_count: number;            // correct + incorrect (excludes neutral)
  accuracy_rate: number | null;    // correct / (correct + incorrect)
  avg_confidence_when_correct: number | null;
  avg_confidence_when_incorrect: number | null;
  last_evaluated_at: string | null;
}

export function getAccuracyStats(
  db: Database,
  opts: { stockCode?: string; signalType?: string; days?: number }
): SignalAccuracyStats[]
```

Core SQL:

```sql
SELECT
  so.signal_type,
  so.stock_code,
  COUNT(CASE WHEN so.outcome_24h IN ('correct','incorrect') THEN 1 END)       AS sample_count,
  CAST(
    SUM(CASE WHEN so.outcome_24h = 'correct' THEN 1.0 ELSE 0 END) /
    NULLIF(COUNT(CASE WHEN so.outcome_24h IN ('correct','incorrect') THEN 1 END), 0)
  AS REAL)                                                                      AS accuracy_rate,
  AVG(CASE WHEN so.outcome_24h = 'correct'   THEN s.confidence_score END)      AS avg_confidence_when_correct,
  AVG(CASE WHEN so.outcome_24h = 'incorrect' THEN s.confidence_score END)      AS avg_confidence_when_incorrect,
  MAX(so.checked_at)                                                             AS last_evaluated_at
FROM signal_outcomes so
JOIN agent_signals s ON s.id = so.signal_id
WHERE so.predicted_direction != 'NEUTRAL'
  AND so.created_at >= datetime('now', '-30 days')
  [AND so.stock_code = :stockCode]     -- optional
  [AND so.signal_type = :signalType]   -- optional
GROUP BY so.signal_type, so.stock_code
HAVING sample_count >= 3              -- minimum sample size for meaningful rate
ORDER BY accuracy_rate ASC NULLIF last
```

`outcome_24h` is used as the primary accuracy window (24h is more actionable for day-trading
context). `outcome_48h` is stored for future analysis but not included in the primary accuracy rate.

---

## 7. Context Injection into Cowork Agents (R4)

### Where to inject

Context injection happens at the **MCP `get_accuracy_context` tool layer**, not in agent `.md`
files (no agent file changes needed). Cowork agents call this tool at the start of their cycle to
receive calibration nudges.

This is the correct insertion point because:
- It requires no cowork flow rewrites.
- It parallels how `get_agent_signals` already provides context at cycle start.
- The tool response is token-efficient (text blob, not raw rows).

### New MCP tool: `get_accuracy_context`

```typescript
// Tool: get_accuracy_context
// Input: { stock_code: string, signal_types?: string[] }
// Output: text blob — calibration nudges for the calling agent

// Example output:
// "Accuracy history for VCB:
//  - chain_catalyst: 7/10 (70%) in last 30 days → confidence may increase by 10%
//  - urgent_news:    3/8  (37%) in last 30 days → recalibrate confidence DOWN 20%
//  - (minimum 3 samples required; 0 samples = no adjustment)"
```

### Calibration rules (from R4)

| Condition | Rule |
|---|---|
| `accuracy_rate < 0.40` AND `sample_count >= 3` | Agent MUST lower confidence by 20% for this signal_type + stock_code pair |
| `accuracy_rate > 0.70` AND `sample_count >= 3` | Agent MAY increase confidence by 10% |
| `sample_count < 3` | No adjustment — insufficient history |
| `predicted_direction = 'NEUTRAL'` | Excluded from accuracy calculation |

The tool returns the text blob. Agents apply the adjustment mentally when composing their
`confidence_score` field in the next `post_agent_signal` call. No automated mutation of
`confidence_score` — the agent is the actor.

### Bootstrap: no agent `.md` changes needed in Phase 1

In Phase 1, `get_accuracy_context` is available but optional — agents that call it benefit,
others continue unchanged. In Phase 2 (future), the tool call can be added to cowork flows.

---

## 8. Frontend — Accuracy Badge on StockSignalsPanel (R5)

### How the frontend currently works

`dashboard.analysis.tsx` calls `fetchStockSignals(code, limit)` which hits
`GET /api/signals/stock/:code`. The response shape is:

```json
{ "signals": [...], "code": "VCB", "count": 10 }
```

Each signal item: `{ id, stock_code, signal_type, direction, confidence_score, detail, created_at }`.

### Extension: add accuracy data to the existing endpoint

Extend `GET /api/signals/stock/:code` to include an `accuracy` map alongside `signals`:

```json
{
  "signals": [...],
  "accuracy": {
    "urgent_news":            { "accuracy_rate": 0.37, "sample_count": 8 },
    "chain_catalyst":         { "accuracy_rate": 0.70, "sample_count": 10 },
    "fundamental_validation": { "accuracy_rate": null, "sample_count": 1 }
  },
  "code": "VCB",
  "count": 10
}
```

The `accuracy` map is keyed by `signal_type`. The server queries `getAccuracyStats(db, { stockCode: code })`
and formats the result. `accuracy_rate: null` means fewer than 3 samples.

**No new endpoint needed.** This is a backwards-compatible extension — existing callers that
ignore `accuracy` continue to work unchanged.

### Frontend accuracy badge rendering

In `dashboard.analysis.tsx` (or the signals sub-component it renders), for each unique
`signal_type` in the signals list:

```tsx
const acc = accuracy[signal.signal_type];
const badge = acc?.accuracy_rate == null
  ? null                              // no badge — insufficient data
  : acc.accuracy_rate >= 0.70
    ? <span className="badge green">{Math.round(acc.accuracy_rate * 100)}% acc</span>
    : acc.accuracy_rate < 0.40
      ? <span className="badge red">{Math.round(acc.accuracy_rate * 100)}% acc</span>
      : <span className="badge yellow">{Math.round(acc.accuracy_rate * 100)}% acc</span>;
```

Badge colours: green >= 70%, yellow 40–69%, red < 40%, absent if sample_count < 3.

Update `fetchStockSignals()` in `client.ts` to parse and return the `accuracy` map. Update the
`AgentSignal`-related types in `~/domain/market.ts` to add `accuracy` to the response type.

---

## 9. Implementation Steps

### Backend — dev-mcp-server

**Step 1 — Schema migration**
File: `apps/mcp-server/src/infrastructure/db/schema.ts`
Add `CREATE TABLE IF NOT EXISTS signal_outcomes` DDL (§ 3 above).
Add three indexes. Run at startup via the existing `migrateSchema()` pattern (no `ALTER TABLE`
needed — it is a new table, not column additions).

**Step 2 — signalOutcomeStore.ts (new file)**
File: `apps/mcp-server/src/infrastructure/db/signalOutcomeStore.ts`
Implement:
- `seedSignalOutcome(db, signalId, input)` — called from `postSignal()` tail; inserts a
  `signal_outcomes` row with `outcome_24h = 'pending'`, `outcome_48h = 'pending'`.
  Derives `predicted_direction` from `findingData.direction` / `findingData.catalyst_direction`.
  Skips insert when `stock_code` is null or direction is NEUTRAL.
- `resolveSignalOutcomes(db, windowHours: 24 | 48)` — queries pending rows past their window,
  fetches prices from `market_prices_history` (with stock-price fallback), records outcomes.
- `getAccuracyStats(db, opts)` — query from § 6 above.

**Step 3 — Wire seedSignalOutcome into postSignal()**
File: `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`
At the end of `postSignal()`, after the INSERT returns `lastInsertRowid`, call:
```typescript
import { seedSignalOutcome } from './signalOutcomeStore.js';
seedSignalOutcome(db, Number(result.lastInsertRowid), input);
```
This is synchronous and fast (one INSERT, no HTTP). Wrap in try/catch — seeding failure must
never throw from `postSignal()`.

**Step 4 — New cron job: signalOutcomeResolutionJob.ts**
File: `apps/mcp-server/src/scheduler/alerts/signalOutcomeResolutionJob.ts`
```typescript
export async function runSignalOutcomeResolutionJob(deps?: { db?: Database }): Promise<void> {
  const db = deps?.db ?? getDb();
  await resolveSignalOutcomes(db, 24);
  await resolveSignalOutcomes(db, 48);
}
export async function runSignalOutcomeResolutionJobCron(): Promise<void> {
  await runSignalOutcomeResolutionJob();
}
```

**Step 5 — Register cron in cronConfig.ts + startScheduler.ts**
`cronConfig.ts`: add `signalOutcomeResolution: Bun.env.CRON_SIGNAL_OUTCOME_RESOLUTION ?? '0 * * * *'`
`startScheduler.ts`: import `runSignalOutcomeResolutionJobCron` and register with
`cron.schedule(CRONS.signalOutcomeResolution, runSignalOutcomeResolutionJobCron)`.

**Step 6 — New MCP tool: get_accuracy_context**
File: new tool in `apps/mcp-server/src/interface/mcp/tools/news-analysis/` (or signals-specific subfolder).
Input schema: `{ stock_code: string, signal_types?: string[] }`.
Implementation: calls `getAccuracyStats(db, { stockCode, signalType })` for each requested type
(or all types if omitted), formats into a calibration nudge text blob.
Register in `registry.ts`.

**Step 7 — Extend GET /api/signals/stock/:code**
File: `apps/mcp-server/src/interface/mcp/server.ts` (~line 913).
After querying `agent_signals` rows, also call `getAccuracyStats(db, { stockCode: code })` and
include the result as `accuracy: { [signal_type]: { accuracy_rate, sample_count } }` in the JSON
response. Probe for `signal_outcomes` table existence before calling — skip `accuracy` key if the
table does not exist yet (migration guard).

**Step 8 — Tests for signalOutcomeStore**
File: `apps/mcp-server/src/infrastructure/db/__tests__/signalOutcomeStore.test.ts`
Cover:
- `seedSignalOutcome`: NEUTRAL direction skips insert; BULLISH inserts pending row.
- `resolveSignalOutcomes`: correct/incorrect/neutral classification at pct boundaries.
- `resolveSignalOutcomes`: pending when no price data found.
- `getAccuracyStats`: accuracy_rate calculation; null when sample_count < 3.
- `resolveSignalOutcomes`: stock-price HTTP fallback when market_prices_history has no data.

**Step 9 — Tests for signalOutcomeResolutionJob**
File: `apps/mcp-server/src/scheduler/alerts/__tests__/signalOutcomeResolutionJob.test.ts`
Smoke test: happy path with injected mock db; verify resolved/pending counts.

**Step 10 — Tests for get_accuracy_context tool**
File alongside tool. Verify text blob format and threshold boundary text.

### Frontend — dev-frontend

**Step 11 — Update API client and domain types**
File: `apps/frontend/app/lib/api/client.ts`
In `fetchStockSignals()`: parse `data.accuracy` from response, return as part of result.
Add type: `export interface SignalAccuracy { accuracy_rate: number | null; sample_count: number }`.
Update response type to `{ signals: AgentSignal[]; accuracy: Record<string, SignalAccuracy> }`.

File: `apps/frontend/app/domain/market.ts`
Add `SignalAccuracy` type (or re-export from client if that is the SSOT).

**Step 12 — Accuracy badge in dashboard.analysis.tsx**
In the signals list rendering section, for each signal row, read `accuracy[signal.signal_type]`
and render the badge as specified in § 8. Use existing Tailwind classes for badge colours:
- green: `bg-green-100 text-green-800`
- yellow: `bg-yellow-100 text-yellow-800`
- red: `bg-red-100 text-red-800`

Badge should be small (text-xs) and positioned inline after the signal type label.

---

## 10. Affected Files

| File | Change type | Owner |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema.ts` | ADD signal_outcomes DDL + indexes | dev-mcp-server |
| `apps/mcp-server/src/infrastructure/db/signalOutcomeStore.ts` | NEW: seed, resolve, getAccuracyStats | dev-mcp-server |
| `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` | EXTEND: call seedSignalOutcome at tail of postSignal | dev-mcp-server |
| `apps/mcp-server/src/scheduler/alerts/signalOutcomeResolutionJob.ts` | NEW: hourly resolution cron job | dev-mcp-server |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | ADD: signalOutcomeResolution cron schedule | dev-mcp-server |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | ADD: register signalOutcomeResolutionJobCron | dev-mcp-server |
| `apps/mcp-server/src/interface/mcp/tools/news-analysis/getAccuracyContextTool.ts` | NEW: get_accuracy_context MCP tool | dev-mcp-server |
| `apps/mcp-server/src/interface/mcp/tools/registry.ts` | REGISTER: get_accuracy_context | dev-mcp-server |
| `apps/mcp-server/src/interface/mcp/server.ts` | EXTEND: include accuracy map in /api/signals/stock/:code | dev-mcp-server |
| `apps/mcp-server/src/infrastructure/db/__tests__/signalOutcomeStore.test.ts` | NEW: unit tests | dev-mcp-server |
| `apps/mcp-server/src/scheduler/alerts/__tests__/signalOutcomeResolutionJob.test.ts` | NEW: smoke tests | dev-mcp-server |
| `apps/frontend/app/lib/api/client.ts` | EXTEND: parse accuracy map, update return type | dev-frontend |
| `apps/frontend/app/domain/market.ts` | EXTEND: add SignalAccuracy type | dev-frontend |
| `apps/frontend/app/routes/dashboard.analysis.tsx` | EXTEND: render accuracy badge per signal_type | dev-frontend |

---

## 11. Non-Goals

- **No retroactive seeding of signal_outcomes for historical agent_signals rows.** The table
  starts empty; accuracy stats will be meaningful after ~1 week of live data.
- **No outcome_48h-based accuracy rate.** T+48h is stored for future analysis; T+24h drives
  the primary accuracy_rate and calibration nudges.
- **No mutation of `agent_signals.confidence_score` by the resolution job.** Agents apply
  calibration adjustments themselves via `get_accuracy_context` at next cycle start.
- **No alert on low accuracy.** Below-threshold accuracy is surfaced as a badge and a text
  nudge — not a Telegram alert. Threshold alerts are future scope.
- **No changes to the TNB critic gate.** This brief is post-persistence; the critic gate is
  pre-persistence. They are orthogonal.
- **No changes to cowork agent `.md` files.** `get_accuracy_context` is optional tooling.

---

## 12. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| market_prices_history has no data for T+24h (weekend) | Medium | Hourly job retries until data appears; stock-price fallback for OHLCV daily close |
| postSignal() slows due to seedSignalOutcome INSERT | Low | Synchronous SQLite INSERT <1ms; wrapped in try/catch, never throws |
| signal_outcomes table absent when accuracy endpoint is called | Low | Migration guard: probe table existence before calling getAccuracyStats; skip key if absent |
| Accuracy rate meaningful too early (< 3 samples) | Expected | Hard minimum of 3 samples; null accuracy_rate rendered as absent badge |
| get_accuracy_context token cost in long cowork cycles | Low | Text blob is ~100 chars per signal type; gated on explicit tool call |

---

## 13. Dependencies and Sequencing

Steps 1–2 have no shared files — can proceed in parallel.
Step 3 depends on Step 2 (seedSignalOutcome must exist before wiring).
Step 4 depends on Step 2 (resolveSignalOutcomes import).
Step 5 depends on Step 4.
Step 6 depends on Step 2 (getAccuracyStats import).
Step 7 depends on Step 2 (getAccuracyStats import).
Steps 8–10 can be written in parallel with Steps 3–7.
Steps 11–12 depend on Step 7 (accuracy map in API response).

Recommended sprint split:
- **Sprint A** (Steps 1, 2, 3, 4, 5, 8, 9): schema + store + resolution job + seeding — no frontend impact.
- **Sprint B** (Steps 6, 7, 10): MCP tool + API extension — backend complete.
- **Sprint C** (Steps 11, 12): frontend accuracy badge — after Sprint B API is deployed.
