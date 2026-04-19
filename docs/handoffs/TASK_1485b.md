# TASK_1485b — GREEN: fix 034 + 1254 + 1163 + vnstock-3statement isolation

task: 1485_b
phase: GREEN
sprint: 186
depends_on: 1485_a

---

## Root cause

`mock.module()` in Bun is **process-global**. 047 registers a stub factory for
`../infrastructure/notifiers/telegram.js`. That factory wins for every subsequent
`import()` or `require()` in the same Bun test process — including all dynamic
imports inside 034, 1254, and 1163 tests.

The stub returned `{ ok: true, result: {} }` (CoreSendResult object), not `boolean`,
causing assertions like `expect(result).toBe(true)` to fail.

For `vnstock-3statement.test.ts`: top-level `await import()` runs once at module
load time. `initDatabase()` in `beforeEach` re-creates the DB, but the store
functions captured the old `_db` handle (or no handle if `closeDb()` cleared it).
Fix: call `getDb()` inside each test after `initDatabase()`, not relying on
module-level import order.

---

## Fix 1 — `src/__tests__/034-telegram-notifier.test.ts`

Inject at **line 1** (before all imports):

```typescript
// Isolation: reset telegram.js to real implementation.
// mock.module() is process-global — 047 may have registered a stub before this
// file runs. This override wins because Bun uses the last-registered factory.
import { mock } from "bun:test";
mock.module("../infrastructure/notifiers/telegram.js", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../infrastructure/notifiers/telegram.js")
);
```

**Why this works**: `mock.module()` with a factory that delegates to `require()` of
the real path forces Bun to load the actual file, bypassing the cached stub. Because
`mock.module()` calls are ordered, the last registration wins in Bun's resolver.

**Exact edit — insert after line 1 (`Bun.env["DB_PATH"] = ":memory:";`), before the
block comment:**

Old (line 1):
```
Bun.env["DB_PATH"] = ":memory:";
```

New (lines 1-7):
```typescript
Bun.env["DB_PATH"] = ":memory:";

import { mock } from "bun:test";
// Isolation guard: reset telegram.js to real impl.
// 047 calls mock.module() globally; this override wins (last registration).
mock.module("../infrastructure/notifiers/telegram.js", () =>
  require("../infrastructure/notifiers/telegram.js")
);
```

**Note**: The `import { mock }` at top-level is acceptable here because the
`mock.module()` call must execute before any other import resolution. In Bun,
top-level statements in a test file run in declaration order before any `describe`
blocks execute, so this is safe.

---

## Fix 2 — `src/__tests__/1254-morning-briefing-no-dup-insert.test.ts`

Same pattern. Insert after line 1:

```typescript
Bun.env["DB_PATH"] = ":memory:";

import { mock } from "bun:test";
// Isolation guard: reset telegram.js to real impl (047 poisons module cache).
mock.module("../infrastructure/notifiers/telegram.js", () =>
  require("../infrastructure/notifiers/telegram.js")
);
```

File path: `src/__tests__/1254-morning-briefing-no-dup-insert.test.ts`
Injection point: after line 1, before the block comment `/** Task 1254 ...`

---

## Fix 3 — `src/__tests__/1163-market-message-review.test.ts`

This file uses `require()` for `marketMessageStore.js` (line 124) and static-like
top-level requires. The telegram import is dynamic inside tests (`sendTelegramMarket`
is imported via the real telegram module which 1163 imports through
`insertMarketMessage` side-effects).

Insert after line 1 (`Bun.env["DB_PATH"] = ":memory:";`):

```typescript
Bun.env["DB_PATH"] = ":memory:";

import { mock } from "bun:test";
// Isolation guard: reset telegram.js to real impl (047 poisons module cache).
mock.module("../infrastructure/notifiers/telegram.js", () =>
  require("../infrastructure/notifiers/telegram.js")
);
```

File path: `src/__tests__/1163-market-message-review.test.ts`
Injection point: after line 1 (first `Bun.env` set), before line 25 (second
`Bun.env["DB_PATH"] = ":memory:";` — keep that line, it is redundant but harmless).

---

## Fix 4 — `src/__tests__/vnstock-3statement.test.ts` — stale DB handle

**Problem**: The file imports `storeBalanceSheet` / `getLatestBalanceSheet` etc. at
top level (lines 21-22) via top-level `await import()`. These store functions call
`getDb()` internally. `beforeEach` calls `initDatabase()` which replaces `_db` with
a fresh `Database` instance. But the **test DB path** (line 16) is a unique tmpfile,
so `initDatabase()` creates a new `Database` each call. After the second `beforeEach`
call, `_db` is a new handle but the tables from the first call may or may not exist
depending on whether `closeDb()` was called.

**Root fix**: add `closeDb()` call in `beforeEach` **before** `initDatabase()`, so
each test starts with a clean fresh DB:

Old (lines 24-27):
```typescript
describe("vnstock balance sheet store", () => {
  beforeEach(async () => {
    await initDatabase();
  });
```

New:
```typescript
describe("vnstock balance sheet store", () => {
  beforeEach(async () => {
    closeDb();           // drop stale handle
    await initDatabase(); // fresh DB + schema
  });
```

Apply the same pattern to the second `describe` block (cash flow store):

```typescript
describe("vnstock cash flow store", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
```

**Why `closeDb()` first**: `initDatabase()` checks `if (_db) return;` (or similar
guard). Without `closeDb()`, the second `beforeEach` call is a no-op, leaving the DB
with rows from the previous test. `closeDb()` sets `_db = null`, forcing
`initDatabase()` to open a new `Database`.

Verify the guard pattern in `schema.ts` (line ~60):
```typescript
export function getDb(): Database { ... }
```
and `closeDb()` sets `_db = null` — confirm before applying.

---

## Fix 5 — `src/__tests__/1485-telegram-mock-isolation.test.ts` (GREEN version)

Replace the `?real` URL probe (which throws) with a proper inline require:

```typescript
// Step 4 — restore real module via mock.module + require
mock.module("../infrastructure/notifiers/telegram.js", () =>
  require("../infrastructure/notifiers/telegram.js")
);
```

Remove the `?real` import line entirely. Tests should now pass.

---

## Verification sequence

```bash
# Run only the 5 affected files
bun test src/__tests__/1485-telegram-mock-isolation.test.ts
bun test src/__tests__/034-telegram-notifier.test.ts
bun test src/__tests__/1254-morning-briefing-no-dup-insert.test.ts
bun test src/__tests__/1163-market-message-review.test.ts
bun test src/__tests__/vnstock-3statement.test.ts

# Full suite regression check
bun test 2>&1 | tail -20
```

Expected: 28 previously-failing tests now pass. No new failures.

---

## Acceptance criteria

| Check | Expected |
|-------|----------|
| 1485 both tests | PASS |
| 034 all 21 TCs | PASS |
| 1254 AC-1/AC-2/AC-3 | PASS |
| 1163 all ACs | PASS |
| vnstock-3statement all 8 | PASS |
| Full suite delta | 0 new failures |
| `bun tsc --noEmit` | 0 errors |

---

## Files modified

| File | Change |
|------|--------|
| `src/__tests__/034-telegram-notifier.test.ts` | +5 lines at top: mock.module isolation guard |
| `src/__tests__/1254-morning-briefing-no-dup-insert.test.ts` | +5 lines at top: mock.module isolation guard |
| `src/__tests__/1163-market-message-review.test.ts` | +5 lines at top: mock.module isolation guard |
| `src/__tests__/vnstock-3statement.test.ts` | beforeEach: add `closeDb()` before `initDatabase()` in both describe blocks |
| `src/__tests__/1485-telegram-mock-isolation.test.ts` | Fix `?real` probe → `require()` pattern |

## Files NOT modified

- `src/__tests__/047-bctc-orchestrator.test.ts` — 047 is not wrong; it correctly mocks for its own tests. The fix lives in victims only.
- Any production source files — this is test isolation only.

---

## [Developer] Implementation Record

files_actually_modified:
- /abs/src/__tests__/034-telegram-notifier.test.ts   # cache-bust guard + all dynamic imports replaced with _realMod
- /abs/src/__tests__/1254-morning-briefing-no-dup-insert.test.ts   # cache-bust guard + dynamic imports replaced with _realMod1254
- /abs/src/__tests__/1163-market-message-review.test.ts   # cache-bust guard + static import replaced with _telegramRealMod
- /abs/src/__tests__/vnstock-3statement.test.ts   # cache-bust for vnstockStore.js + closeDb() before initDatabase() in both describe blocks
- /abs/src/__tests__/1485-telegram-mock-isolation.test.ts   # test redesigned to prove cache-bust pattern works (GREEN)

tests_written:
- src/__tests__/1485-telegram-mock-isolation.test.ts   # 2 assertions, all GREEN

tests_skipped: []

key_insight:
  The handoff's `require()` pattern does NOT work in Bun ESM context — require() inside
  mock.module() factory returns {}. The actual fix: load real modules via absolute-path
  + query-bust (`await import(Bun.resolveSync(...) + "?isolate=FILE")`), which bypasses
  the Bun mock cache. Tests reference _realMod directly instead of re-importing.

  Additional discovery: vnstock-3statement was also poisoned by 1466-sync-db-corruption-bail
  which stubs vnstockStore.js. Same cache-bust fix applied.

tsc_clean: true
full_suite_pass: true   # 5629 pass, 0 fail (was 30 fail before)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
  - "src/__tests__/1163-market-message-review.test.ts:718-828 — 12 residual process.env usages (pre-existing, not introduced by this task)"

files_confirmed_clean:
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1485-telegram-mock-isolation.test.ts
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/034-telegram-notifier.test.ts
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1254-morning-briefing-no-dup-insert.test.ts
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1163-market-message-review.test.ts
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/vnstock-3statement.test.ts

merge_commit: 88962e9
