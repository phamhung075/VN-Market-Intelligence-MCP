# TASK_1356a — patternWatchJob Gap Tests (8 cases)

**Sprint:** 1356
**Layer:** Test (interface/scheduler)
**Size:** S (approx 2h)
**Owner:** Developer
**Status:** Ready for execution

---

## Context

`patternWatchJob.ts` (`apps/mcp-server/src/scheduler/news-analysis/patternWatchJob.ts`) exports one function `runPatternWatch(): Promise<void>`. It is 129 lines of pure rule-based logic with no constructor DI — all dependencies are resolved via `await import()` inside the function body.

Existing coverage (test 1138) is two structural wiring checks only: they assert that `jobs.ts` wraps the call in `recordJobRun`. They do not exercise the job logic at all.

---

## Production Code Analysis

```
runPatternWatch()
  ├─ dynamic import: getDb() from ../../infrastructure/db/schema.js
  ├─ dynamic import: sendTelegramBug() from ../../infrastructure/notifiers/telegram.js
  ├─ db.prepare("SELECT code, domain FROM watchlist").all()
  │     → if length === 0 → return early (no Telegram, no logger.info)
  ├─ for each stock:
  │     ├─ db.query recent (LIMIT 5).all(code)
  │     │     → if recent.length < 3 → continue
  │     ├─ db.query historical (30-90 days).all(code)
  │     │     → if historical.length < 10 → continue
  │     ├─ compute currentAvgChange
  │     ├─ sliding window loop (i < historical.length - 10):
  │     │     ├─ windowAvgChange
  │     │     ├─ if |windowAvgChange - currentAvgChange| > 2 → continue
  │     │     ├─ afterWindow = historical.slice(max(0,i-10), i)
  │     │     ├─ if afterWindow.length < 3 → continue
  │     │     ├─ compute maxMove, minMove
  │     │     ├─ if |maxMove| >= 5 OR |minMove| >= 5:
  │     │     │     → push warning string, break (one match per stock)
  │     └─ per-stock try/catch → swallows individual stock errors
  ├─ if warnings.length > 0:
  │     → sendTelegramBug(message, {parseMode:""})
  │     → logger.info("[patternWatch] sent weekly pattern alert", {matches})
  └─ else:
        → logger.debug("[patternWatch] no matching patterns found")
  outer catch:
        → logger.error("[patternWatch] failed", {error})
```

---

## DI / Mock Strategy

The job uses `await import()` at runtime, so there is no constructor injection. The correct strategy is `mock.module()` at file top-level (worker-scoped), identical to the 1355b reference pattern.

Modules to mock:

| Module path (relative to `__tests__/`) | Exports used |
|---|---|
| `../infrastructure/db/schema.js` | `getDb` |
| `../infrastructure/notifiers/telegram.js` | `sendTelegramBug` |
| `../infrastructure/logger.js` | `logger` (info, error, debug) |

The DB is abstracted as a mock `getDb()` returning a fake object whose `.prepare()` and `.query()` methods are controlled per test. No real SQLite instance needed — return plain mock objects with `.all()` methods.

DB mock shape:
```ts
_getDbImpl = () => ({
  prepare: (sql: string) => ({ all: () => /* watchlist rows */ }),
  query: (_sql: string) => ({ all: (_code: string) => /* price rows */ }),
})
```

Because `prepare` is for the watchlist SELECT and `query` is for the two parameterised price queries, the mock can inspect the SQL string to decide which rows to return, or — simpler — use separate call-count-based logic.

---

## Test File

**Path:** `apps/mcp-server/src/__tests__/1356a-pattern-watch-job-gaps.test.ts`

**Header line:** `Bun.env["DB_PATH"] = ":memory:";`

---

## 8 Test Cases

### PWJ-1: Empty watchlist — early return, no Telegram, no logger.info

**Setup:**
- `_getDbImpl` returns mock DB where `prepare().all()` returns `[]`
- `_sendTelegramBugImpl` records calls
- `_loggerInfoCalls = []`

**Assert:**
- `runPatternWatch()` resolves to `undefined`
- `_sendTelegramBugCalls.length === 0`
- `_loggerInfoCalls.length === 0`

---

### PWJ-2: Single stock, insufficient recent data (< 3 rows) — stock skipped, no alert

**Setup:**
- watchlist returns `[{ code: "VCB", domain: "banking" }]`
- `query().all("VCB")` for recent returns only 2 rows
- historical query returns 15 rows (sufficient, but never reached)
- `_sendTelegramBugImpl` records calls

**Assert:**
- resolves `undefined`
- `_sendTelegramBugCalls.length === 0`
- `_loggerInfoCalls.length === 0`

---

### PWJ-3: Single stock, insufficient historical data (< 10 rows) — stock skipped, no alert

**Setup:**
- watchlist: `[{ code: "VCB", domain: "banking" }]`
- recent: 5 rows (sufficient)
- historical: 8 rows (below the 10-row threshold)
- `_sendTelegramBugImpl` records calls

**Assert:**
- resolves `undefined`
- `_sendTelegramBugCalls.length === 0`

---

### PWJ-4: Pattern match fires — sendTelegramBug called with message containing stock code

**Setup:**
- watchlist: `[{ code: "VCB", domain: "banking" }]`
- recent: 5 rows, all `change_pct: 1.0` (currentAvgChange = 1.0)
- historical: 20 rows constructed so:
  - window at index 0: avg change_pct = 1.0 (matches current, diff < 2)
  - afterWindow (indices max(0,-10)..0 = empty for i=0, so push i high enough)
  - For the match to fire: set i such that `i >= 10`, so `afterWindow = historical.slice(i-10, i)` has 10 rows; afterWindow prices include one that is 6% above `window[0].price`

Precise fixture: 20 historical rows where:
- rows 10–14 (window at i=10): `change_pct: 1.0`, `price: 100`
- rows 0–9 (afterWindow for i=10): one row has `price: 106` (maxMove = 6%)

**Assert:**
- `_sendTelegramBugCalls.length === 1`
- message contains `"VCB"`
- message contains `"↑"` or `"↓"`
- `_loggerInfoCalls` has entry matching `"[patternWatch] sent weekly pattern alert"`
- meta `matches === 1`

---

### PWJ-5: No profile similarity — no match, logger.debug called

**Setup:**
- watchlist: `[{ code: "VCB", domain: "banking" }]`
- recent: 5 rows, `change_pct: 5.0` (currentAvgChange = 5.0)
- historical: 20 rows, all windows have `change_pct: -5.0` (diff = 10 > 2, never similar)
- `_loggerDebugCalls` captures `.debug()` calls

**Assert:**
- `_sendTelegramBugCalls.length === 0`
- `_loggerDebugCalls` has entry matching `"[patternWatch] no matching patterns found"`

---

### PWJ-6: Per-stock error catch — one stock throws, loop continues, other stock matches

**Setup:**
- watchlist: `[{ code: "ERR", domain: "error" }, { code: "VCB", domain: "banking" }]`
- For `"ERR"`: `query().all("ERR")` throws `new Error("DB error")`
- For `"VCB"`: valid data that produces a match (reuse PWJ-4 fixture)

**Assert:**
- resolves `undefined` (no re-throw from outer catch)
- `_sendTelegramBugCalls.length === 1` (VCB matched)
- `_loggerErrorCalls.length === 0` (per-stock error is silently caught — no logger call in the inner catch)

---

### PWJ-7: Multiple stocks — both match, two warnings in one Telegram message

**Setup:**
- watchlist: `[{ code: "VCB", domain: "banking" }, { code: "HPG", domain: "steel" }]`
- Both stocks have valid recent + historical data producing a match (reuse PWJ-4 fixture shape for each, using `change_pct: 1.0` and matching history)
- DB mock routes by code: if `code === "VCB"` → VCB fixture; if `code === "HPG"` → HPG fixture

**Assert:**
- `_sendTelegramBugCalls.length === 1` (one combined message)
- message contains `"VCB"` AND `"HPG"`
- logger.info meta `matches === 2`

---

### PWJ-8: Alert message content — message structure contains header and disclaimer

**Setup:**
- Same as PWJ-4 (one stock match)

**Assert:**
- `_sendTelegramBugCalls.length === 1`
- message contains `"PATTERN WATCH"`
- message contains `"không phải khuyến nghị đầu tư"`
- `sendTelegramBug` called with second arg `{ parseMode: "" }`

---

## DB Mock Design Notes

The `patternWatchJob` uses two different DB methods:
- `db.prepare(sql).all()` — for watchlist (no parameters)
- `db.query(sql).all(code)` — for recent and historical price queries

The mock must distinguish the two query calls per stock (recent vs historical). Simplest approach: track call count per code, or inspect the SQL string for `LIMIT 5` vs the date range clause.

Recommended mock factory:

```ts
_getDbImpl = () => {
  const queryCallCount: Record<string, number> = {};
  return {
    prepare: (_sql: string) => ({ all: () => _watchlistRows }),
    query: (_sql: string) => ({
      all: (code: string) => {
        queryCallCount[code] = (queryCallCount[code] ?? 0) + 1;
        // first call per code = recent, second call = historical
        return queryCallCount[code] === 1
          ? _recentRowsMap[code] ?? []
          : _historicalRowsMap[code] ?? [];
      },
    }),
  };
};
```

---

## Real-module Captures + Teardown

Follow 1355b pattern exactly:

1. Import real modules at top of file before any `mock.module()` call
2. Freeze references into `_frozen*` variables
3. `afterAll()` restores all mocked modules to frozen real implementations

Modules to restore:
- `../infrastructure/db/schema.js` → `{ getDb: _frozenGetDb }`
- `../infrastructure/notifiers/telegram.js` → `{ sendTelegramBug: _frozenSendTelegramBug }`
- `../infrastructure/logger.js` → `{ logger: _realLogger }`

---

## Success Criteria

- 8 tests, all pass
- Zero production file changes
- `bun test 1356a` exits 0
- Baseline: 7737 + 8 = 7745 pass, 0 fail

---

## Files to Create

| Path | Action |
|---|---|
| `apps/mcp-server/src/__tests__/1356a-pattern-watch-job-gaps.test.ts` | Create |

## Files to Modify

None.
