# TECH-119: ohlcv-startup-probe

status: APPROVED_BY_ARCHITECT
req_ref: REQ-119
tasks: 1352 (TDD), 1353 (impl)

## Brownfield Impact

- Files modified: `src/scheduler/jobs.ts` (import + void call after idempotency guard)
- Files created: `src/scheduler/ohlcvStartupProbe.ts`, `src/__tests__/1352-ohlcv-startup-probe.test.ts`
- Files deleted: none
- Breaking changes: no

## Architecture Decision

The probe is a pure scheduler-layer one-shot function matching the `runDailyAuditIfStale` pattern already in `jobs.ts` — injectable deps for testability, DB access via `getDb()` default in production, no new domain service or application use-case needed. `sendTelegramWork` is called directly from the scheduler layer (same pattern as `pipelineWatchdogJob.ts` and `cronHealthAlertJob.ts`), which is correct: dev-operational notifications that are not user-facing alerts do not need to route through the application layer.

## DDD Layer Plan

| Component            | Layer     | File Path                                             | New/Modify |
| -------------------- | --------- | ----------------------------------------------------- | ---------- |
| runOhlcvStartupProbe | scheduler | `src/scheduler/ohlcvStartupProbe.ts`                  | NEW        |
| jobs.ts wire-up      | scheduler | `src/scheduler/jobs.ts`                               | MODIFY     |
| TDD test             | test      | `src/__tests__/1352-ohlcv-startup-probe.test.ts`      | NEW        |

No domain or application layer changes. No new DB tables. No schema changes.

## Interface Contracts

### Exported from `src/scheduler/ohlcvStartupProbe.ts`

```typescript
import { Database } from "bun:sqlite"

export interface OhlcvStartupProbeDeps {
  db?: Database
  sendWorkFn?: (msg: string) => Promise<boolean>
}

export interface OhlcvStartupProbeResult {
  sparseTickers: Array<{ code: string; count: number }>
  sent: boolean
}

export async function runOhlcvStartupProbe(
  deps?: OhlcvStartupProbeDeps
): Promise<OhlcvStartupProbeResult>
```

Production call (no args): resolves `db` via `getDb()`, resolves `sendWorkFn` via `sendTelegramWork`.

### Return contract

| Scenario               | sparseTickers | sent  |
| ---------------------- | ------------- | ----- |
| Sparse tickers found   | [{code,count}…] | true |
| All tickers >= 8 rows  | []            | false |
| Empty watchlist        | []            | false |
| DB error caught        | []            | false |

### Message format (WORK channel only)

```
[ohlcv-probe] daily_ohlcv sparse on boot — taSummary will be empty for: VNM(3), FPT(0), VCB(5)
Run on VPS: ./fetch-ohlcv-backfill.sh
```

## Implementation Detail

### Query strategy (FR-1)

Two-phase: one query to get watchlist tickers, then N per-ticker COUNT queries (N ≤ 30, acceptable at startup).

```sql
-- Phase 1
SELECT code FROM watchlist

-- Phase 2 (per ticker — parameterized binding)
SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ?
```

`COUNT(*)` on a missing ticker returns 0, not an error — covers "absent ticker" edge case naturally.

### Threshold

`cnt < 8` → sparse. Exactly 8 = not sparse (strict less-than).

### Error isolation (FR-3)

Entire function body wrapped in `try/catch`. On any error: `console.warn('[ohlcv-probe] DB error: ...')`, return `{ sparseTickers: [], sent: false }`. No re-throw.

### jobs.ts wiring (FR-4)

Insert immediately after `g.__vnMarketSchedulerStarted = true`, before the first `cron.schedule` call, following the `runDailyAuditIfStale` pattern:

```typescript
void runOhlcvStartupProbe().then((r) => {
  if (r.sent) log(`[ohlcv-probe] sparse tickers: ${r.sparseTickers.map(t => t.code).join(', ')}`)
})
```

No `setTimeout` — DB is ready before `startScheduler()` is called.

## Task Breakdown

| # | Task | Depends on | Owner |
| --- | --- | --- | --- |
| 1352 | TDD: write `1352-ohlcv-startup-probe.test.ts` (5 test cases, all failing) | — | Dev |
| 1353 | Impl: `ohlcvStartupProbe.ts` + `jobs.ts` wire-up — all tests pass | 1352 | Dev |

### Test file structure (`src/__tests__/1352-ohlcv-startup-probe.test.ts`)

Line 1: `process.env["DB_PATH"] = ":memory:"`

| TC | AC | Setup | Assert |
| --- | --- | --- | --- |
| TC-1 | AC-1+AC-6 | watchlist=[VNM,FPT,VCB], daily_ohlcv: VNM=20, FPT=5, VCB=0 | sendFn called once, message has FPT(5) VCB(0), not VNM; sparseTickers.length===2; sent===true |
| TC-2 | AC-2 | watchlist=[VNM,FPT], daily_ohlcv: VNM=20, FPT=15 | sendFn never called; sparseTickers.length===0; sent===false |
| TC-3 | AC-3 | watchlist=empty | sendFn never called; sent===false |
| TC-4 | AC-4 | db.prepare() throws | no throw propagates; sendFn never called; sent===false |
| TC-5 | AC-5 | watchlist=[HPG], daily_ohlcv: HPG=8 | sendFn never called; sparseTickers empty |

Use injected `db` (`:memory:`) and injected `sendWorkFn` spy — never use real Telegram token.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| daily_ohlcv table missing at first boot (schema not yet created) | Low | Low | FR-3 catch covers this; server starts normally |
| DB locked briefly during startup while server.ts opens connection | Very low | Low | Caught by FR-3; probe silently skips |
| N queries slow startup perceptibly | Very low | Low | N ≤ 30, each is a COUNT index scan < 1ms; total < 50ms |
| sendTelegramWork network failure at boot | Low | Low | sendTelegramWork never throws (returns false on failure per telegram.ts contract) |

## Security Review

- [x] SQL parameterized? Yes — `WHERE code = ?` binding in both queries
- [x] File paths validated? N/A — no file access
- [x] External HTTP rate-limited? N/A — Telegram call goes through existing `sendTelegramWork` which has its own error handling
- [x] Secrets via Bun.env only? Yes — bot token accessed inside `sendTelegramWork`, not touched here
