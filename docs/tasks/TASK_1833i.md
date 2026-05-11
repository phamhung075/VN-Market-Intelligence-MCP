# TASK_1833i — FIX: vnstock global rate limiter + officers NOT NULL alert

**Sprint:** 1833
**Priority:** P2-HIGH
**Type:** BUG
**Owner:** developer
**Branch:** `task/1833i-vnstock-rate-limiter-officers-alert`
**Closes also:** 1833e
**Spec:** `docs/specs/1833i-vnstock-global-rate-limiter-officers-alert.md`
**Estimated effort:** ~2h

---

## Context

Two tightly coupled bugs in the vnstock sync pipeline:

1. Concurrent ticker+endpoint fetches collectively exceed the VCI API rate cap (60 req/min). Per-ticker retry backoff is insufficient because multiple callers retry simultaneously, multiplying the burst. Affected tickers: ACV, VDC, ACB, VCI (and any others in the same intelligence cycle run).

2. `NOT NULL constraint failed: vnstock_officers.code` is silently swallowed as a generic WARN with no ticker identity, making the affected ticker unidentifiable.

All three modified files are tightly coupled — the rate limiter in `vnstockBridge.ts` protects the spawn calls; the null guard in `vnstockStore.ts` prevents bad rows reaching SQLite; the try/catch in `syncVnstockData.ts` surfaces the ticker identity when the constraint fires anyway. Splitting across separate tasks would require mocking the same code paths twice.

---

## Deliverables

### D1 — Global rate limiter in `vnstockBridge.ts`

- Add `VnstockRateLimiter` class: sliding-window, configurable `rpm` and `windowMs`
- Export `GLOBAL_RATE_LIMIT_RPM = 50` constant
- Create module-level `_rateLimiter` singleton using `GLOBAL_RATE_LIMIT_RPM`
- Insert `await _rateLimiter.acquire();` as first line inside `runPython()` try block (applies to both `runPython` and `runPythonWithBackoff` since `runPythonWithBackoff` delegates to `runPython`)
- Export `VnstockRateLimiter` class for test access
- ~35 lines added

### D2a — Null-code guard in `vnstockStore.ts` `storeOfficers()`

- Filter before insert: `const valid = officers.filter((o) => !!o.code);`
- Log WARN if dropped count > 0: `[vnstock-store] storeOfficers: dropped N rows with null code for ticker X`
- ~8 lines added

### D2b — NOT NULL catch + alert in `syncVnstockData.ts`

- Add `_officersNullAlertAt = new Map<string, number>()` module-level (de-dup per ticker per 24h)
- Add `OFFICERS_NULL_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000` constant
- Wrap `storeOfficers()` call in try/catch
- On catch matching `NOT NULL constraint failed: vnstock_officers.code`:
  - Log ERROR with ticker code and full error text
  - Send `sendTelegramWork` alert (de-duped via `_officersNullAlertAt`): `[DQ ALERT] vnstock_officers.code NOT NULL violation for ticker X — row skipped, manual check needed`
  - Do NOT call `markFetched()` for officers on that ticker (forces retry)
- If `sendTelegramWork` throws: log error, continue — do not re-throw
- ~25 lines added, 2 lines removed

### D3 — Test files (2 new)

- `apps/mcp-server/src/__tests__/1833i-global-rate-limiter.test.ts` (~90 lines)
  - Instantiate `VnstockRateLimiter` with small `rpm=5, windowMs=200`
  - Test: N concurrent `acquire()` calls where N > rpm — at most `rpm` resolve immediately; remainder resolve after window slides
  - Test: calls within budget resolve without delay

- `apps/mcp-server/src/__tests__/1833i-officers-null-alert.test.ts` (~100 lines)
  - Test AC-2.5: mock DB, inject officer row with `code: ""`, assert row dropped and `logger.warn` called with expected message
  - Test AC-2.6: mock `storeOfficers` to throw NOT NULL error, assert `sendTelegramWork` called with ticker code and "NOT NULL" in message
  - Test AC-2.7: second identical throw within 24h window — assert `sendTelegramWork` NOT called again (de-dup)

---

## Files to Change

| File | Change |
|------|--------|
| `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` | Add `VnstockRateLimiter`, `GLOBAL_RATE_LIMIT_RPM`, `_rateLimiter` singleton; wrap `Bun.spawn` inside `acquire()` |
| `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` | Add null-code filter + WARN log in `storeOfficers()` |
| `apps/mcp-server/src/application/usecases/syncVnstockData.ts` | Add `_officersNullAlertAt` map, `OFFICERS_NULL_ALERT_COOLDOWN_MS`, try/catch around storeOfficers, Telegram alert |
| `apps/mcp-server/src/__tests__/1833i-global-rate-limiter.test.ts` | Create — rate limiter unit tests |
| `apps/mcp-server/src/__tests__/1833i-officers-null-alert.test.ts` | Create — null guard + alert de-dup tests |

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1.1 | `VnstockRateLimiter` class exists in `vnstockBridge.ts` with `acquire()` async method that resolves only when a slot is available within the rolling window |
| AC-1.2 | `GLOBAL_RATE_LIMIT_RPM` constant defaults to 50 and is exported |
| AC-1.3 | All `Bun.spawn(["python3", ...])` calls go through `acquire()` before spawning |
| AC-1.4 | When 50 requests started in last 60s, a new call blocks (awaits) rather than spawning a 51st subprocess |
| AC-1.5 | Unit test: N concurrent `acquire()` calls with limit=5 results in at most 5 resolving immediately; remainder resolve after oldest slots expire |
| AC-1.6 | No change to observable external interface of any exported `fetchVnstock*` function (types, return values) |
| AC-1.7 | Existing tests in `1823b-vnstock-ratelimit-log.test.ts` continue passing |
| AC-2.1 | `storeOfficers()` silently drops rows where `o.code` is empty/null and logs WARN `[vnstock-store] storeOfficers: dropped N rows with null code for ticker X` |
| AC-2.2 | When NOT NULL constraint violation occurs during officer insert, catch block in `syncVnstockData.ts` sends WORK Telegram: `[DQ ALERT] vnstock_officers.code NOT NULL violation for ticker X — row skipped, manual check needed` |
| AC-2.3 | Telegram message includes ticker code and SQLite error text |
| AC-2.4 | After NOT NULL violation, `markFetched()` is NOT called for `officers` on that ticker |
| AC-2.5 | Unit test: inject row with `code: ""` into `storeOfficers` via mock DB; assert row dropped and `logger.warn` called with expected message |
| AC-2.6 | Unit test: simulate NOT NULL throw from `storeOfficers` inside `syncStock()`; assert `sendTelegramWork` called with message containing ticker code and "NOT NULL" |
| AC-2.7 | Alert de-dup: second identical throw within 24h window does NOT call `sendTelegramWork` again |
| AC-2.8 | Task 1833e is closed by this implementation |

---

## Non-Functional

- Rate limiter must not block interactive on-demand MCP tool calls (shared 50 RPM budget is acceptable if on-demand calls are infrequent)
- Backoff in `runPythonWithBackoff()` remains in effect alongside the global limiter
- Telegram NOT NULL alert fires at most once per ticker per 24h window

---

## Edge Cases to Verify

| Edge case | Expected |
|-----------|----------|
| Python returns `[]` for officers (valid empty) | No alert, no insert, `markFetched` called normally |
| List with mixed valid + `code: ""` rows | Filter drops bad rows; valid rows inserted; WARN logged with dropped count |
| `sendTelegramWork` throws on network error | Error logged; sync continues; no re-throw |
| `syncStockLight` (sector peers) triggers rate limiter | All calls go through `runPython()` — same limiter applies |

---

## Definition of Done

- [ ] `tsc --noEmit` passes with zero errors
- [ ] `bun test` passes — all prior tests green, 2 new test files green
- [ ] All 8 ACs verified (AC-1.1 through AC-1.7, AC-2.1 through AC-2.8)
- [ ] Commit: `task(1833i): vnstock global rate limiter + officers NOT NULL alert`
- [ ] Task report: `reports/TASK_REPORT_1833i.md`
- [ ] 1833e closed in TASKS.md Done column
