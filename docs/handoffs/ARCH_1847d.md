# ARCH-1847d — Alert Accuracy Feedback Loop

**Task:** 1847d | **Status:** DESIGN COMPLETE — ready for developer
**BA spec:** `docs/REQ_1847d.md`
**PO decisions applied:** BLK-1=1%, BLK-2=Commander can auto-call, BLK-3=Telegram on HIT, BLK-4=UNKNOWN permanent for legacy / structured type required on new alerts

---

## 1. File Change Plan

### Files to MODIFY

| File | Change | DDD Layer |
|------|--------|-----------|
| `apps/mcp-server/src/infrastructure/db/schema-alerts.ts` | +3 idempotent ALTER TABLE columns; +1 index | Infrastructure |
| `apps/mcp-server/src/infrastructure/db/alertStore.ts` | +`writeAlertOutcome()` +`readPendingOutcomeAlerts()` | Infrastructure |
| `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts` | Upgrade `get_alert_accuracy`; add `mark_alert_outcome` tool registration | Interface |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Import + wire `alertOutcomeJob` into cron | Interface/Scheduler |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | +`alertOutcomeJob` key with env fallback | Config |

### Files to CREATE

| File | Purpose | DDD Layer |
|------|---------|-----------|
| `apps/mcp-server/src/domain/services/alertOutcomeScorer.ts` | Pure fns: `classifyAlertType`, `scoreAlertOutcome` | Domain |
| `apps/mcp-server/src/scheduler/alerts/alertOutcomeJob.ts` | Daily cron job; orchestrates classify+score+write | Scheduler |
| `apps/mcp-server/src/__tests__/1847d-alert-outcome-scorer.test.ts` | Unit tests for pure domain fns | Test |
| `apps/mcp-server/src/__tests__/1847d-alert-outcome-job.test.ts` | Integration test for job (in-memory DB) | Test |

**Total: 4 modify + 4 create = 8 files**

---

## 2. Schema Migration

### Location: `apps/mcp-server/src/infrastructure/db/schema-alerts.ts`

Append to the existing idempotent migration loop (pattern already used for `notified_telegram`, `resolved_at`, etc.):

```typescript
// Idempotent — appended to existing loop in initAlertsTables()
for (const [col, ddl] of [
  // ... existing entries ...
  ["outcome",        "TEXT"],
  ["outcome_at",     "TEXT"],
  ["outcome_detail", "TEXT"],
] as const) {
  try { db.exec(`ALTER TABLE alerts ADD COLUMN ${col} ${ddl}`); } catch {}
}

// Index for job query performance (outcome IS NULL scan)
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_outcome ON alerts(outcome)`);
} catch {}
```

**Rationale:** Exact same try/catch idempotent pattern as 6 existing columns. No migration file needed — schema module runs at startup.

---

## 3. Domain Layer — `alertOutcomeScorer.ts`

**Location:** `apps/mcp-server/src/domain/services/alertOutcomeScorer.ts`

**Contract: ZERO imports from infrastructure. Pure functions only.**

### 3a. Types

```typescript
export type AlertOutcome = 'hit' | 'miss' | 'unknown';

export type AlertClass =
  | 'position-danger'
  | 'watchlist-opportunity'
  | 'price-signal'
  | 'composite'
  | 'unscoreable';

export interface AlertClassification {
  alertClass: AlertClass;
  evalWindowDays: number;      // calendar days (7 cal = ~5 trading for watchlist-opp)
  hitThresholdPct: number;     // signed: negative for position-danger HIT
  direction: 'up' | 'down' | 'neutral';
}

export interface PricePoint {
  price: number;
  fetchedAt: string; // ISO 8601
}

export interface OutcomeResult {
  outcome: AlertOutcome;
  detail: string;
}
```

### 3b. `classifyAlertType(signalsJson, message): AlertClassification`

Detection priority order:
1. `signals_json` contains type `position-danger` → `{ alertClass: 'position-danger', evalWindowDays: 5, hitThresholdPct: 0 (≤0%), direction: 'down' }`
2. `signals_json` contains type `watchlist-opportunity` → `{ alertClass: 'watchlist-opportunity', evalWindowDays: 7, hitThresholdPct: 1.0, direction: 'up' }`
3. `signals_json` contains `price_drop` or `price_surge` → `'price-signal'`, evalWindow=3, thresholds per existing logic
4. `signals_json` non-null with multiple signal types → `'composite'`, use primary signal direction, evalWindow=3
5. `signals_json` is null/empty AND message is non-null → `'unscoreable'` (legacy Commander narrative)

**NFR-4 compliance note:** evalWindowDays=5 for position-danger maps to 5 calendar days (covers 3 trading days with weekend buffer). evalWindowDays=7 for watchlist-opportunity covers 5 trading days.

### 3c. `scoreAlertOutcome(classification, alertPrice, windowPrices, calendarDaysElapsed): OutcomeResult`

Parameters (all passed in — no DB access):
- `classification` — from `classifyAlertType`
- `alertPrice` — first price at/after `triggered_at`
- `windowPrices` — array of `PricePoint` within eval window
- `calendarDaysElapsed` — number of calendar days since `triggered_at`

Rules per alertClass:

**`unscoreable`**: return `{ outcome: 'unknown', detail: 'unscoreable alert type' }`

**`position-danger`** (direction=down, HIT = continued loss):
- No price data: `unknown` + "no price data"
- `windowPrices` empty + `calendarDaysElapsed >= 14`: `unknown` + "data timeout"
- Max price in window ≥ `alertPrice * 1.02` (+2%): `miss` + "price recovered +X%"
- All prices in window ≤ `alertPrice`: `hit` + "price continued ≤0% over Xd"
- Otherwise: `unknown` + "ambiguous ±2% band"

**`watchlist-opportunity`** (direction=up, HIT = gain ≥1%):
- No price data: `unknown` + "no price data"
- `calendarDaysElapsed >= 14` and no hit yet: `unknown` + "data timeout"
- Max price in window ≥ `alertPrice * 1.01` (+1%): `hit` + "price +X% in Xd"
- End-of-window price ≤ `alertPrice * 0.99` (-1%): `miss` + "price -X% at window close"
- Otherwise: `unknown` + "ambiguous <1%"

**`price-signal` / `composite`**: delegate to existing direction logic from `alertAccuracy.ts`:
- Reuse `alertPredictedDirection` by accepting pre-computed direction param
- HIT / MISS / UNKNOWN per existing 0.1% noise threshold

---

## 4. Infrastructure Layer — `alertStore.ts` additions

### `readPendingOutcomeAlerts(db, limitToOlderThanDays): AlertOutcomeRow[]`

```typescript
export interface AlertOutcomeRow {
  id: string;
  triggered_at: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  message: string | null;
}

// Query:
// SELECT id, triggered_at, signals_json, affected_actions_json, message
// FROM alerts
// WHERE outcome IS NULL
//   AND triggered_at <= datetime('now', '-N days')
// ORDER BY triggered_at ASC
// LIMIT 500
```

`limitToOlderThanDays` is the minimum eval window (3) — ensures no premature scoring. Batch cap 500 satisfies NFR-1 (<5s for 500).

### `writeAlertOutcome(db, alertId, outcome, outcomeAt, detail): void`

```typescript
// Single prepared statement:
// UPDATE alerts
// SET outcome = ?, outcome_at = ?, outcome_detail = ?
// WHERE id = ? AND outcome IS NULL
```

`WHERE outcome IS NULL` guard enforces NFR-2 idempotency at DB level — re-runs never overwrite.

Wrapped in transaction in the job (batch writes, not per-row).

---

## 5. Scheduler — `alertOutcomeJob.ts`

**Location:** `apps/mcp-server/src/scheduler/alerts/alertOutcomeJob.ts`
**Mirrors:** `signalOutcomeJob.ts` structure exactly.

### Interface

```typescript
export interface AlertOutcomeJobDeps {
  db?: Database;
  nowFn?: () => Date;
}

export interface AlertOutcomeJobResult {
  evaluated: number;
  hit: number;
  miss: number;
  unknown: number;
  skipped: number;
}
```

### Logic

```
1. db = deps.db ?? getDb()
2. rows = readPendingOutcomeAlerts(db, minEvalWindowDays=3)
3. results: AlertOutcomeJobResult = { evaluated:0, hit:0, miss:0, unknown:0, skipped:0 }
4. batch: OutcomeWrite[] = []

5. for each row:
   a. classification = classifyAlertType(row.signals_json, row.message)
   b. code = extractPrimaryCode(row.affected_actions_json)  // reuse from alertAccuracy.ts
   c. if !code → skipped++; continue
   d. calDays = daysBetween(row.triggered_at, now)
   e. if calDays < classification.evalWindowDays → skipped++; continue  // too early
   f. alertPrice = queryPriceAtAlert(db, code, row.triggered_at)
   g. windowPrices = queryPriceWindow(db, code, row.triggered_at, classification.evalWindowDays)
   h. result = scoreAlertOutcome(classification, alertPrice, windowPrices, calDays)
   i. batch.push({ id: row.id, outcome: result.outcome, outcomeAt: now.toISOString(), detail: result.detail })
   j. results[result.outcome]++; results.evaluated++

6. writeBatch(db, batch)  // single transaction

7. if BLK-3: notify Telegram WORK channel for position-danger HITs
   — fires send_telegram(channel='work', msg) for each hit in batch where alertClass='position-danger'

8. return results
```

### Cron registration

`cronConfig.ts`:
```typescript
alertOutcomeJob: Bun.env.CRON_ALERT_OUTCOME_JOB ?? '45 8 * * 1-5',
```
Runs at 08:45 UTC (15:45 GMT+7) — 15 min after `signalOutcomeJob` (08:30 UTC). Same post-close slot family. Weekdays only.

`startScheduler.ts`:
```typescript
import { runAlertOutcomeJobCron } from './alerts/alertOutcomeJob.js'
// ...
cron.schedule(CRONS.alertOutcomeJob, () => { runAlertOutcomeJobCron().catch(console.error); }, { timezone: 'UTC' })
```

---

## 6. Interface Layer — `alertAccuracy.ts` upgrades

### 6a. `get_alert_accuracy` upgrade

Two-path scoring (FR-4):

```
for each alertRow:
  if row.outcome IS NOT NULL:
    → use stored outcome (fast path, no price lookup)
    → count in summary_by_type breakdown by alertClass
  else:
    → on-demand score (existing scoreAlert() logic)
    → count as usual
```

New `summary_by_type` output section appended to `formatAccuracyReport`:
```
Phan tich theo loai canh bao:
  position-danger:       12 HIT (67%), 4 MISS (22%), 2 UNKNOWN (11%)
  watchlist-opportunity: 8 HIT (53%), 5 MISS (33%), 2 UNKNOWN (13%)
  price-signal:          9 HIT (60%), 3 MISS (20%), 3 UNKNOWN (20%)
```

Query change: add `outcome, outcome_detail` columns to SELECT.

### 6b. `mark_alert_outcome` new tool (same file)

```typescript
export function registerMarkAlertOutcomeTool(server: McpServer): void {
  server.tool(
    "mark_alert_outcome",
    "Manually mark a fired alert outcome (hit/miss). Rejects if already marked unless force=true.",
    {
      alertId: z.string().describe("Alert ID to mark"),
      outcome: z.enum(["hit", "miss"]).describe("Outcome verdict"),
      notes: z.string().optional().describe("Optional context"),
      force: z.boolean().optional().default(false).describe("Overwrite existing outcome"),
    },
    async ({ alertId, outcome, notes, force }) => {
      // 1. Read current outcome from DB
      // 2. If outcome already set AND !force → reject with message
      // 3. writeAlertOutcome(db, alertId, outcome, now, notes ?? 'manual override')
      // 4. Return success message (Vietnamese plain text)
    }
  )
}
```

Guard logic: `if (existing.outcome && !force) return error("already marked: " + existing.outcome + ". Use force=true to overwrite.")`

Note: `force=true` path uses `UPDATE alerts SET outcome=?, outcome_at=?, outcome_detail=? WHERE id=?` (no IS NULL guard).

### 6c. Tool index registration

Both `registerAlertAccuracyTool` and `registerMarkAlertOutcomeTool` must be called from `apps/mcp-server/src/interface/mcp/tools/alerts/index.ts`.

---

## 7. Price Fetch — Reuse Pattern

The job queries `market_prices_history` directly via `db.prepare()` — exactly as `signalOutcomeJob.ts` does. No new HTTP calls, no new microservice ports.

Two queries per alert (same pattern as signalOutcomeJob):
- `alertPrice`: first row WHERE `code=? AND fetched_at >= triggered_at ORDER BY fetched_at ASC LIMIT 1`
- `windowPrices`: all rows WHERE `code=? AND fetched_at >= triggered_at AND fetched_at <= datetime(triggered_at, '+N days') ORDER BY fetched_at ASC`

These are inlined in the job (infrastructure layer access), NOT in the domain scorer. The scorer receives `PricePoint[]` already fetched.

---

## 8. Risk Register

| ID | Risk | Severity | Mitigation |
|----|------|----------|-----------|
| R-1 | **DDD violation**: `alertOutcomeScorer.ts` imports DB | HIGH | Explicit constraint in JSDoc + test suite imports only domain — no DB dependency allowed. `scoreAlertOutcome` takes pre-fetched `PricePoint[]`, not a `db` handle. |
| R-2 | **Double-write race**: cron fires while `mark_alert_outcome` is writing | MEDIUM | `WHERE outcome IS NULL` guard in `writeAlertOutcome` prevents overwrite. SQLite WAL serializes concurrent writes. |
| R-3 | **Premature scoring**: eval window not yet elapsed, job writes 'unknown' permanently | HIGH | `calDays < classification.evalWindowDays` → skip (not write). NFR-4. Only write after window elapsed. 14-day cap writes unknown only as final state. |
| R-4 | **Weekend gap miscount**: position-danger 3 trading days = 5-7 calendar days depending on when fired | MEDIUM | Use calendar day threshold with buffer: 5 calendar days for position-danger (covers 3 trading days worst case). Document assumption in JSDoc. |
| R-5 | **BLK-3 Telegram flood**: multiple position-danger HITs in same batch → spam WORK channel | MEDIUM | Batch Telegram notifications into one digest message per job run (not one per alert). Cap at 5 HITs in message, suffix "+ N more". |
| R-6 | **Legacy alert backfill blast**: first job run finds 500+ alerts older than 90 days with null outcome | MEDIUM | `readPendingOutcomeAlerts` filters `triggered_at >= datetime('now', '-90 days')` (per spec out-of-scope clause). Prevents stale data writes. |
| R-7 | **`mark_alert_outcome` called by Commander with wrong alertId** | LOW | Tool returns clear error if alertId not found in DB. No silent fail. |

---

## 9. Test Plan

### Unit tests — `1847d-alert-outcome-scorer.test.ts` (target: 14 tests)

| # | Test | Coverage |
|---|------|---------|
| 1 | `classifyAlertType` → `position-danger` when signals_json contains position-danger | FR-2 |
| 2 | `classifyAlertType` → `watchlist-opportunity` when signals_json contains watchlist-opportunity | FR-2 |
| 3 | `classifyAlertType` → `price-signal` for price_drop | FR-2 |
| 4 | `classifyAlertType` → `unscoreable` when signals_json is null | FR-2 + BLK-4 |
| 5 | `classifyAlertType` → `composite` for multi-signal non-policy type | FR-2 |
| 6 | `scoreAlertOutcome` position-danger HIT: all prices ≤ alertPrice | FR-3, AC-6 |
| 7 | `scoreAlertOutcome` position-danger MISS: max price > alertPrice * 1.02 | FR-3 |
| 8 | `scoreAlertOutcome` position-danger UNKNOWN: ambiguous ±2% band | AC-6 |
| 9 | `scoreAlertOutcome` watchlist-opportunity HIT: max price ≥ alertPrice * 1.01 | FR-3, AC-7, BLK-1 |
| 10 | `scoreAlertOutcome` watchlist-opportunity MISS: end-window price ≤ alertPrice * 0.99 | FR-3 |
| 11 | `scoreAlertOutcome` unscoreable → always 'unknown' | BLK-4 |
| 12 | `scoreAlertOutcome` no price data → 'unknown' + "no price data" | Edge case |
| 13 | `scoreAlertOutcome` calDays ≥ 14, no data → 'unknown' + "data timeout" | NFR-6 |
| 14 | `scoreAlertOutcome` price-signal UP direction HIT/MISS mirrors existing logic | FR-2d |

### Integration tests — `1847d-alert-outcome-job.test.ts` (target: 8 tests)

| # | Test | Coverage |
|---|------|---------|
| 1 | Job runs on in-memory DB with 10 pending alerts → returns `evaluated=10` | AC-2, AC-9 |
| 2 | Job skips alert where calDays < evalWindowDays | NFR-4 |
| 3 | Job writes outcome to DB (SELECT after run confirms outcome IS NOT NULL) | FR-3, AC-1 |
| 4 | Job re-run on already-scored alerts → 0 writes (idempotency) | NFR-2, AC-8 |
| 5 | `mark_alert_outcome` writes hit → subsequent tool read returns hit | FR-5, AC-5 |
| 6 | `mark_alert_outcome` rejects re-mark without force | AC-5 |
| 7 | `get_alert_accuracy` uses DB outcome column when present (no DB price query) | FR-4, AC-3 |
| 8 | `get_alert_accuracy` shows `summary_by_type` breakdown with ≥2 alert types | FR-4 |

**Total: 22 tests** (spec estimated 15 — 7 additional for edge cases and BLK decisions)

---

## 10. DDD Layer Summary

```
domain/services/alertOutcomeScorer.ts
  ← pure: classifyAlertType(), scoreAlertOutcome()
  ← NO imports from infrastructure/
  ← input: raw alert fields + PricePoint[] (caller fetches)

infrastructure/db/schema-alerts.ts
  ← adds 3 columns + 1 index (idempotent)

infrastructure/db/alertStore.ts
  ← readPendingOutcomeAlerts(): queries alerts WHERE outcome IS NULL
  ← writeAlertOutcome(): UPDATE with IS NULL guard

scheduler/alerts/alertOutcomeJob.ts
  ← imports: domain scorer + infra store + getDb
  ← NO imports from application/ or interface/
  ← queries market_prices_history directly (same pattern as signalOutcomeJob)

interface/mcp/tools/alerts/alertAccuracy.ts
  ← get_alert_accuracy: 2-path (DB outcome fast path + on-demand fallback)
  ← mark_alert_outcome: new tool, same file
```

---

## 11. Deviations from BA Spec

| Item | BA Spec | Design Decision | Reason |
|------|---------|-----------------|--------|
| Domain location | spec says `apps/mcp-server/src/domain/services/alertOutcomeScorer.ts` | Same — confirmed | Matches dev-standards DDD table |
| `mark_alert_outcome` file | spec says "same file or split" | Same file (`alertAccuracy.ts`) | No justification to split — 2 tightly related tools, avoids new index export |
| Cron time | spec says "same time slot as signalOutcomeJob (08:00 UTC)" | 08:45 UTC | Avoids concurrent DB write contention with signalOutcomeJob (08:30). 15-min stagger is safe. |
| evalWindowDays position-danger | spec says "3 trading days" | 5 calendar days | NFR-5: VN market closed weekends. 5 calendar = 3 trading days worst case (Mon alert). Documented in scorer JSDoc. |
| evalWindowDays watchlist-opp | spec says "5 trading days" | 7 calendar days | Same NFR-5 logic. 7 calendar = 5 trading days worst case. |
| BLK-3 notification target | spec leaves open | WORK channel (not MARKET) | position-danger HIT = internal system feedback, not user-facing alert. Alert Commander policy: only Commander writes to MARKET. |

---

## 12. Open Items for Developer

- [ ] Confirm `extractPrimaryCode()` can be imported from `alertAccuracy.ts` or must be moved to a shared util (currently unexported). Recommend: export it or move to `domain/services/alertUtils.ts`.
- [ ] Confirm Telegram send for BLK-3 (position-danger HIT notification): use existing `send_telegram` MCP tool via `mcp__claude_ai_gateway__call_tool` or the internal HTTP client used in alertNotifier jobs. Prefer internal HTTP client to avoid MCP round-trip in cron.
- [ ] `mark_alert_outcome` index registration: verify `apps/mcp-server/src/interface/mcp/tools/alerts/index.ts` exports both register fns.

---

*Design complete. Handoff to developer.*
