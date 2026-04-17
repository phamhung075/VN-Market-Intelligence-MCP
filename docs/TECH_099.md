# TECH-099: France Morning Digest — MARKET Channel, Vietnamese Curated Content

status: APPROVED_BY_ARCHITECT
req_ref: REQ-099

## Brownfield Impact

- Files modified: `src/scheduler/franceSummaryJob.ts` (complete rewrite), `docs/data/cron-registry.json`
- Files created: `src/__tests__/1316-france-summary.test.ts`
- Files deleted: none (old test `src/__tests__/1290-france-summary-job.test.ts` is NOT deleted — it covers task 1290 history; new test file is a separate addition)
- Breaking changes: yes — `FranceSummaryResult` interface loses `signalCount`, gains `moverCount`, `alertCount`, `taCount`. `FranceSummaryOptions.sendFn` signature changes from `(text) => Promise<boolean>` to `(text, opts) => Promise<boolean>`. Any caller relying on the old result shape must update — only `jobs.ts` line 415 reads `result.signalCount`; that log line must change to `moverCount+alertCount+taCount`.

## Architecture Decision

The existing `franceSummaryJob.ts` queries `rag_analyses` and routes to `sendTelegramWork` — the WORK channel the non-technical user never reads. The rewrite replaces the data source (from `rag_analyses` to `market_prices` + `alerts`) and the channel (from WORK to MARKET via `sendTelegramMarket`), while preserving the same DDD layer (scheduler) and the same injectable-dependency TDD pattern already established in the codebase. No new layers, no new interfaces, no infrastructure changes needed — `sendTelegramMarket` with `persist` is already implemented in `telegram.ts` lines 249–270.

## DDD Layer Plan

| Component             | Layer     | File Path                                           | New/Modify |
| --------------------- | --------- | --------------------------------------------------- | ---------- |
| FranceSummaryOptions  | scheduler | `src/scheduler/franceSummaryJob.ts`                 | MODIFY     |
| FranceSummaryResult   | scheduler | `src/scheduler/franceSummaryJob.ts`                 | MODIFY     |
| fetchTopMovers()      | scheduler | `src/scheduler/franceSummaryJob.ts`                 | NEW fn     |
| fetchTopAlerts()      | scheduler | `src/scheduler/franceSummaryJob.ts`                 | NEW fn     |
| countTaSignals()      | scheduler | `src/scheduler/franceSummaryJob.ts`                 | NEW fn     |
| formatVietnamese()    | scheduler | `src/scheduler/franceSummaryJob.ts`                 | NEW fn     |
| runFranceSummary()    | scheduler | `src/scheduler/franceSummaryJob.ts`                 | REWRITE    |
| jobs.ts log line      | scheduler | `src/scheduler/jobs.ts` (line 415)                  | MODIFY     |
| TDD test suite        | test      | `src/__tests__/1316-france-summary.test.ts`         | NEW        |
| cron-registry entry   | data      | `docs/data/cron-registry.json`                      | MODIFY     |

## Interface Contracts

### Updated public types (replaces existing in `franceSummaryJob.ts`)

```typescript
export interface FranceSummaryOptions {
  db?: Database;
  sendFn?: (text: string, opts: unknown) => Promise<boolean>; // defaults to sendTelegramMarket
  nowFn?: () => Date;                                          // defaults to () => new Date()
  windowHours?: number;                                        // defaults to 8
}

export interface FranceSummaryResult {
  sent: boolean;
  moverCount: number;
  alertCount: number;
  taCount: number;
}
```

### Internal types (new, replaces SignalRow)

```typescript
interface MoverRow { code: string; change_pct: number }
interface AlertRow { severity: string; message: string | null }
```

### Cutoff computation (canonical — matches existing DB timestamp convention)

```typescript
const cutoff = new Date(nowFn().getTime() - windowHours * 3_600_000)
  .toISOString()
  .slice(0, 19)  // "YYYY-MM-DDTHH:MM:SS"
```

### sendTelegramMarket call (default sendFn)

```typescript
await resolvedSend(formattedText, {
  persist: { from_agent: "france-summary", message_type: "france_summary" }
})
```

### jobs.ts log line update (line 415 — signalCount → moverCount+alertCount+taCount)

```typescript
log(`[france-summary] sent — movers=${result.moverCount} alerts=${result.alertCount} ta=${result.taCount}`)
```

## SQL Specifications

### FR-1: Top movers

```sql
SELECT code, change_pct
FROM market_prices
WHERE updated_at >= ? AND change_pct IS NOT NULL
ORDER BY ABS(change_pct) DESC
LIMIT 3
```

Parameter: `cutoff` (positional binding — parameterized, no interpolation).
Failure mode: SQLite error (schema drift) → catch, return `[]`, log warning, continue.

### FR-2: Top alerts by severity

```sql
SELECT severity, message
FROM alerts
WHERE triggered_at >= ?
ORDER BY CASE severity
  WHEN 'critical' THEN 0
  WHEN 'high'     THEN 1
  WHEN 'warning'  THEN 2
  ELSE 3
END ASC
LIMIT 3
```

Parameter: `cutoff`. Failure → return `[]`, log warning, continue.

### FR-3: TA signal count

```sql
SELECT COUNT(*) AS cnt
FROM alerts
WHERE triggered_at >= ?
  AND json_extract(signals_json,'$[0].type')
      IN ('ta_overbought','ta_oversold','ta_bb_breakout_up','ta_bb_breakout_down')
```

Parameter: `cutoff`. Failure → return `0`, log warning, continue.

## Message Format Specification

```
Phiên VN sáng nay YYYY-MM-DD:          ← always present; date in UTC+7

Biến động giá:                          ← only when movers.length > 0
  VCB: +3.5%
  HPG: -2.1%

Cảnh báo (N):                           ← only when alerts.length > 0
  [HIGH] USD/VND: 26302 — cao bất thường
  [WARNING] VCB: RSI=74.2 quá mua

Tín hiệu TA hôm nay: {taCount}         ← only when taCount > 0
```

Rules:
- `change_pct` formatted to 1 decimal place with explicit sign: `+3.5%` / `-2.1%`
- Severity label map: `critical` → `[CRITICAL]`, `high` → `[HIGH]`, `warning` → `[WARNING]`, other → `[INFO]`
- `message` truncated to 100 chars. NULL rendered as `""`.
- Date header: `nowFn().getTime() + 7 * 3_600_000` converted to ISO date string.
- Sections joined by `\n\n`. No trailing newline.

## Task Breakdown

| Order | Task | Title | Depends on |
| ----- | ---- | ----- | ---------- |
| 1 | 1317 | TDD: write `src/__tests__/1316-france-summary.test.ts` (12 ACs from REQ-099) | none — test-first |
| 2 | 1316 | Rewrite `franceSummaryJob.ts` + update `jobs.ts` log line + update `cron-registry.json` | 1317 (tests must pass) |

Both tasks share branch `task/1316-1317-france-summary-market` (already declared in TASKS.md).

## Test Coverage Required (AC-to-test map)

| AC | Test description |
| -- | ---------------- |
| AC-1 | empty DB → `{ sent: false, moverCount:0, alertCount:0, taCount:0 }`, sendFn not called |
| AC-2 | one mover in window → sent=true, moverCount=1 |
| AC-3 | one non-TA alert → sent=true, alertCount=1 |
| AC-4 | one TA alert only → sent=true, taCount=1 |
| AC-5 | message starts with "Phiên VN sáng nay" |
| AC-6 | movers > 0 → message contains "Biến động giá:" + code + formatted pct |
| AC-7 | no movers → message does NOT contain "Biến động giá:" |
| AC-8 | alert present → message contains "Cảnh báo (1):" + `[HIGH]` + message text |
| AC-9 | taCount=2 → message contains "Tín hiệu TA hôm nay: 2" |
| AC-10 | taCount=0 → message does NOT contain "Tín hiệu TA" |
| AC-11 | critical inserted after warning → `[CRITICAL]` appears before `[WARNING]` in output |
| AC-12 | 2 movers + 1 non-TA alert + 2 TA alerts → `{ moverCount:2, alertCount:3, taCount:2 }` |

Test DB setup: in-memory SQLite, create `market_prices` + `alerts` tables with minimal columns. Use `nowFn` injection for deterministic cutoff. Use `sendFn` capture array for send assertions.

`market_prices` DDL minimum:
```sql
CREATE TABLE market_prices (
  code       TEXT NOT NULL,
  change_pct REAL,
  updated_at TEXT NOT NULL
)
```

`alerts` DDL minimum:
```sql
CREATE TABLE alerts (
  severity     TEXT NOT NULL,
  message      TEXT,
  triggered_at TEXT NOT NULL,
  signals_json TEXT
)
```

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| `change_pct` column absent on fresh/test DB (schema drift) | Low | Medium | Catch SQLite error in `fetchTopMovers`, return `[]`, log warning, continue to FR-2+FR-3 |
| `signals_json` NULL or malformed → `json_extract` returns NULL | Medium | Low | IN clause with NULL-safe: NULL not in list, query returns 0 safely |
| `market_prices.updated_at` stores VN-server local time without TZ tag | Low | Medium | REQ-099 documents this is intentional; cutoff in ISO-8601 UTC matches same convention used throughout codebase |
| Alert Commander also sends to MARKET — double-posting on same alert | Low | Low | This job sends a digest, not individual alerts. Commander sends individual `alert_fired` type. Separate `message_type` in persist metadata (`france_summary` vs `alert`). No conflict |
| `sendTelegramMarket` persist side-effect fails (DB unavailable) | Low | Low | `sendTelegramMarket` already handles this best-effort (lines 256-268); return value is unaffected |

## Security Review

- [x] SQL parameterized? Yes — all three queries use positional `?` binding via `db.prepare().all(cutoff)`
- [x] File paths validated (no `../`)? n/a — no file I/O
- [x] External HTTP rate-limited? n/a — no external HTTP in this job; Telegram send delegates to existing `sendTelegramMarket` which uses the established circuit-breaker path
- [x] Secrets via `Bun.env` only? Yes — Telegram token/chat IDs accessed in `telegram.ts` via `Bun.env.*` only; this file never touches env vars directly
