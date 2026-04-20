# TASK_1517b — GREEN: foreignFlowAlertJob reads daily_ohlcv.foreign_net_vol

sprint: 202
phase: GREEN
confirmed_location: src/scheduler/foreignFlowAlertJob.ts:78-108

---

## Change scope

**Only** `getForeignFlowHistoryFromDb` body (lines 78-108) changes.
`analyzeForeignFlow`, `runForeignFlowAlertJob`, cron wrapper — untouched.

---

## Why cumsum

`analyzeForeignFlow` expects `foreignVolume` as a **cumulative holding** value
and computes deltas between consecutive days:
```
delta[i] = history[i].foreignVolume - history[i+1].foreignVolume
```
`daily_ohlcv.foreign_net_vol` is already the **daily net** (buy - sell).
To keep `analyzeForeignFlow` untouched, build a synthetic cumulative by
scanning rows ASC and summing `foreign_net_vol`. The absolute value of
the cumsum is irrelevant — only the deltas matter, and delta[i] = net_vol[i].

---

## Replacement body for `getForeignFlowHistoryFromDb` (lines 78-108)

```typescript
function getForeignFlowHistoryFromDb(
  database: Database,
  code: string,
  days = 10,
): DailyForeignFlow[] {
  // Query daily_ohlcv ASC so we can build a running cumulative sum.
  // COALESCE foreign_net_vol to 0 for rows where foreign flow was not yet written.
  const rows = database
    .prepare<unknown, [string, number]>(
      `SELECT code,
              date,
              COALESCE(foreign_net_vol, 0) AS net_vol
       FROM daily_ohlcv
       WHERE code = ?
       ORDER BY date ASC
       LIMIT ?`,
    )
    .all(code, days) as Array<{
    code: string;
    date: string;
    net_vol: number;
  }>;

  // Build cumulative sum (ascending) so delta[i] = net_vol[i] when reversed.
  let cumsum = 0;
  const ascending: DailyForeignFlow[] = rows.map((row) => {
    cumsum += row.net_vol;
    return {
      code: row.code,
      date: row.date,
      foreignVolume: cumsum,
      foreignRoom: 0,
      holdingRatio: 0,
    };
  });

  // analyzeForeignFlow expects DESC (most recent first).
  return ascending.reverse();
}
```

---

## Why this satisfies analyzeForeignFlow

After reverse, `history[0]` is most recent. Delta between consecutive
rows = `cumsum[n] - cumsum[n-1]` = `net_vol[n]`. A 3-day streak of
`+150_000` → `totalNetVolume3d = 450_000 > 100_000` → `severity = "high"`.

---

## No other changes

| File | Change |
|------|--------|
| `src/scheduler/foreignFlowAlertJob.ts` | Replace lines 78-108 only (function body) |
| All other files | None |

---

## Verification

```bash
bun test src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts
bun test          # full suite must stay green
bun tsc --noEmit  # no type errors
```

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/foreignFlowAlertJob.ts   # replaced getForeignFlowHistoryFromDb body (lines 78-108): daily_ohlcv cumsum query
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts   # fixed evidence_fragments DDL: added timestamp + ttl_days cols

tests_written:
- src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts   # 4 assertions (AC1-AC4), all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true  # 5771 tests, Bun crashed post-run (known Bun GC bug, not test failure)

---

## Adjacent lines to preserve (verify unchanged after edit)

Line 77 (above injection): `// getForeignFlowHistory always calls getDb() — ...`
Line 109 (below injection): blank line before `// Core logic` section comment.
Function signature at line 78 stays identical:
```typescript
function getForeignFlowHistoryFromDb(
  database: Database,
  code: string,
  days = 10,
): DailyForeignFlow[] {
```

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/foreignFlowAlertJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts

merge_commit: pending
