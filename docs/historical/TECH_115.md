# TECH-115: fix(france-summary): stale alerts in France morning digest

status: APPROVED_BY_ARCHITECT
req_ref: REQ-115

## Brownfield Impact

- Files modified: `src/scheduler/franceSummaryJob.ts`
- Files created: `src/__tests__/1344-france-summary-stale-alerts.test.ts`
- Files deleted: none
- Breaking changes: no — `FranceSummaryResult` shape unchanged; `formatFranceSummaryVI` and `fetchTopMovers` signatures untouched; all 12 existing test cases in 1316 remain green.

## Architecture Decision

All three fixes are scoped to a single file (`franceSummaryJob.ts`) within the interface/scheduler layer, requiring no new domain types, no new infrastructure adapters, and no schema migrations. The dedup pattern is copied verbatim from the established `eveningSummaryJob.ts` precedent (lines 27-41), keeping the codebase internally consistent. The `persist` option fix closes a silent data-quality gap that was already designed into `telegram.ts` but never activated for this job.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `fetchTopAlerts` SQL | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| `alreadySentToday` helper | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | NEW (add to file) |
| dedup guard in `runFranceSummary` | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| `resolvedSend` default — add `persist` | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| TDD test suite (AC-1..AC-6) | test | `src/__tests__/1344-france-summary-stale-alerts.test.ts` | NEW |

## Interface Contracts

### No new exported interfaces

`FranceSummaryOptions`, `FranceSummaryResult`, `SendFn` — all unchanged.

### Modified: `fetchTopAlerts` (internal, lines 117-133)

Add `WHERE triggered_at >= datetime('now', '-24 hours')` before the ORDER BY clause. Full query delta:

```sql
-- BEFORE
SELECT id, severity, message, triggered_at
FROM alerts
ORDER BY <SEVERITY_CASE>, triggered_at DESC
LIMIT 3

-- AFTER
SELECT id, severity, message, triggered_at
FROM alerts
WHERE triggered_at >= datetime('now', '-24 hours')
ORDER BY <SEVERITY_CASE>, triggered_at DESC
LIMIT 3
```

### New: `alreadySentToday` helper (add after `fetchTaSignalCount`, before formatting helpers)

```typescript
function alreadySentToday(db: Database): boolean {
  try {
    const row = db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt
         FROM market_messages
         WHERE from_agent = 'france-summary'
           AND sent_at >= date('now')`,
      )
      .get()
    return (row?.cnt ?? 0) > 0
  } catch {
    return false // fail-open: do not suppress if DB check fails
  }
}
```

### Modified: `runFranceSummary` — dedup guard (insert after DB resolution, before per-query fetch)

```typescript
// DB-level same-day dedup guard (FR-2)
// Fail-open: if check throws, proceed with send.
if (alreadySentToday(resolvedDb)) {
  return { sent: false, moverCount: 0, alertCount: 0, taCount: 0 }
}
```

### Modified: `resolvedSend` default (line 264)

```typescript
// BEFORE
resolvedSend = (text: string) => sendTelegramMarket(text, { parseMode: "" })

// AFTER
resolvedSend = (text: string) =>
  sendTelegramMarket(text, {
    parseMode: "",
    persist: { from_agent: "france-summary", message_type: "france_summary" },
  })
```

`"france-summary"` is already in the `MarketAgent` union (`marketMessageStore.ts` line 39). No schema change required.

## Task Breakdown

Dependency order (task 1344 must merge before 1345):

| # | Task ID | Description | Depends on |
|---|---|---|---|
| 1 | 1344 | TDD: write `1344-france-summary-stale-alerts.test.ts` with 6 failing tests (AC-1..AC-6) | — |
| 2 | 1345 | Fix: apply FR-1 + FR-2 + FR-3 to `franceSummaryJob.ts` — all 6 tests green | 1344 |

## Test File Spec (Task 1344)

File: `src/__tests__/1344-france-summary-stale-alerts.test.ts`

```
Line 1:  process.env["DB_PATH"] = ":memory:"
Imports: bun:test, bun:sqlite, runFranceSummary

makeDb() creates:
  - alerts table (same DDL as 1316)
  - market_prices table (same DDL as 1316)
  - market_messages table (DDL from REQ-115 implementation notes)

6 test cases:
  1. AC-1: alert triggered_at = datetime('now','-25 hours') → alertCount === 0
  2. AC-2: alert triggered_at = datetime('now','-1 hour')  → alertCount === 1, message contains severity label
  3. AC-3: market_messages row from_agent='france-summary' sent_at=datetime('now') → sent===false, sendFn not called
  4. AC-4: market_messages row sent_at=datetime('now','-1 day') → sent===true, sendFn called once
  5. AC-5: DB with no market_messages table → sent===true (fail-open)
  6. AC-6: sendFn spy captures persist object → from_agent==='france-summary', message_type==='france_summary'
```

Note: AC-7 (existing 1316 tests still pass) is verified by CI running both test files, not by adding cases to 1344.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `date('now')` boundary at midnight UTC causes one spurious skip | Very Low | Low | Documented in REQ-115 edge cases; acceptable per spec |
| `market_messages` table absent on first boot silently swallows dedup | — | — | Mitigated by fail-open catch block; boot scenario tested in AC-5 |
| NULL `triggered_at` rows excluded by new WHERE clause | Low | Low | NULL inequality is safe in SQLite (NULLs fail `>=`); matches spec intent |
| 1316 tests break due to missing `market_messages` table in `makeDb()` | Low | Medium | 1316 `makeDb()` does not include `market_messages` — dedup guard wraps its query in try/catch, so missing table returns `false` (proceed). No breakage. |

## Security Review

- SQL parameterized? Yes — `datetime('now', '-24 hours')` and `date('now')` are SQLite built-ins, not user input; no interpolation.
- File paths validated? N/A
- External HTTP rate-limited? N/A (send path unchanged)
- Secrets via Bun.env only? Yes — no new env vars introduced
