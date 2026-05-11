# BA Spec — Task 1833i
## vnstock global rate limiter + surface officers NOT NULL as data quality alert

**Sprint:** 1833
**Priority:** P2-HIGH
**Type:** BUG
**Assigned to:** developer
**Closes also:** 1833e

---

## 1. Problem Statement

### 1.1 Rate-limit root cause

`syncVnstockData()` in `syncVnstockData.ts` iterates over all watchlist tickers
sequentially **per-ticker**, but `syncSectorPeers()` calls `syncStockLight()` for
up to 5 peers **concurrently** (Step C2 of intelligenceCycleJob). Both paths are
active in the same intelligence cycle run.

Within each ticker `syncStock()` the calls are serial with a 1500 ms inter-call
delay. However, when the cycle triggers syncVnstockData (Step A3) and
syncSectorPeers (Step C2) in the same run, those two code paths share the same
VCI endpoint without any global coordination. With 30 watchlist tickers at up to
7 endpoints each, plus 5 peers at 3 endpoints each, a burst of 30+ concurrent
Python subprocesses is possible. VCI rate cap is 60 req/min; bursts well above
that number are observed on ACV, VDC, ACB, VCI.

The existing `runPythonWithBackoff()` retries after a rate-limit response, but
**retries happen per-call in isolation**. Multiple callers retrying simultaneously
multiply the problem.

### 1.2 NOT NULL constraint swallowed

`fetchVnstockOfficers()` uses `runPython()` (not `runPythonWithBackoff()`). When
the VCI response returns a row where the `officer_name` or the ticker `code` field
is null/empty, the Python script emits an `[]` or partially-populated list. The
caller in `syncStock()` does:

```
if (officers.length > 0) storeOfficers(code, officers);
```

`storeOfficers()` runs `INSERT OR REPLACE INTO vnstock_officers (code, name, ...)`.
The `code` column has `NOT NULL` in the DDL. When the data row carries an empty
string or null for `code` (which can happen if the Python side fails to inject the
symbol into the dict entry), SQLite throws:

```
NOT NULL constraint failed: vnstock_officers.code
```

This exception bubbles through the transaction, is caught by the outer `try/catch`
in `syncVnstockData()`, and is logged as a generic `[vnstock-sync] failed for stock`
WARN **without the ticker identity**. The DBA sees the error message but cannot
identify which ticker caused it. Task 1833e documented this; 1833i absorbs the
alerting requirement.

---

## 2. Deliverables

### Deliverable 1 — Global rate limiter (infrastructure layer)

A module-level token-bucket or sliding-window rate limiter shared across all
callers of `runPython()` / `runPythonWithBackoff()` in `vnstockBridge.ts`.

**Requirement:** At most N Python subprocesses may be in-flight or started within
any rolling 60-second window, where N is a configurable constant defaulting to 50
(safe margin below the 60 req/min VCI cap). Callers that exceed the budget wait
(async) until a slot is available rather than spawning immediately.

**Scope:** The limiter lives in `vnstockBridge.ts` (infrastructure layer). It wraps
all calls to `Bun.spawn(["python3", ...])`, not the higher-level fetch functions.
`syncVnstockData.ts` and `syncSectorPeers.ts` do not need modification for the
limiter itself.

**Configuration constant:** `GLOBAL_RATE_LIMIT_RPM = 50` (exported, testable).

### Deliverable 2 — Officers NOT NULL alert (application layer, closes 1833e)

Two sub-deliverables:

**2a. Guard in `storeOfficers()`** (`vnstockStore.ts`, infrastructure layer):
Before inserting, filter out any officer row where `o.code` is falsy (empty string
or null). Log WARN with the ticker and the count of dropped rows.

**2b. Alert on NOT NULL violation** (`syncVnstockData.ts`, application layer):
Wrap the `storeOfficers()` call in a try/catch that catches the specific
`NOT NULL constraint failed: vnstock_officers.code` message and:
- Sends a WORK Telegram message identifying the ticker.
- Logs ERROR (not WARN) with the full error and the code.
- Does NOT call `markFetched()` for officers (forces retry at next cycle).

---

## 3. Acceptance Criteria

### Deliverable 1 — Rate limiter

| ID | Criterion |
|----|-----------|
| AC-1.1 | A `VnstockRateLimiter` class (or equivalent module singleton) exists in `vnstockBridge.ts` with a `acquire()` async method that resolves only when a slot is available within the rolling window. |
| AC-1.2 | `GLOBAL_RATE_LIMIT_RPM` constant defaults to 50 and is exported. |
| AC-1.3 | All `Bun.spawn(["python3", ...])` calls go through `acquire()` before spawning. |
| AC-1.4 | When 50 requests have been started in the last 60 s, a new call blocks (awaits) rather than spawning a 51st subprocess. |
| AC-1.5 | Unit test: 60 concurrent `acquire()` calls with limit=50 results in at most 50 resolving immediately; the remaining 10 resolve after the oldest slots expire. |
| AC-1.6 | No change to the observable external interface of any exported `fetchVnstock*` function (types, return values). |
| AC-1.7 | Existing tests in `1823b-vnstock-ratelimit-log.test.ts` continue passing. |

### Deliverable 2 — Officers NOT NULL alert

| ID | Criterion |
|----|-----------|
| AC-2.1 | `storeOfficers()` silently drops rows where `o.code` is empty/null and logs WARN `[vnstock-store] storeOfficers: dropped N rows with null code for ticker X`. |
| AC-2.2 | When a NOT NULL constraint violation occurs during officer insert, `syncVnstockData.ts` catch block sends a WORK Telegram: `[DQ ALERT] vnstock_officers.code NOT NULL violation for ticker X — row skipped, manual check needed`. |
| AC-2.3 | The Telegram message includes the ticker code and the SQLite error text. |
| AC-2.4 | After the NOT NULL violation, `markFetched()` is NOT called for `officers` on that ticker — forcing a retry at next cycle. |
| AC-2.5 | Unit test: inject a row with `code: ""` into `storeOfficers` via mock DB; assert the row is dropped and logger.warn is called with the expected message. |
| AC-2.6 | Unit test: simulate NOT NULL throw from `storeOfficers` inside `syncStock()`; assert `sendTelegramWork` is called with a message containing the ticker code and "NOT NULL". |
| AC-2.7 | Task 1833e is closed by this implementation. |

---

## 4. DDD Layer Map

| Change | File | DDD Layer |
|--------|------|-----------|
| Global rate limiter | `infrastructure/fetchers/vnstockBridge.ts` | Infrastructure |
| Guard: filter null-code rows | `infrastructure/db/vnstockStore.ts` | Infrastructure |
| Alert on NOT NULL catch | `application/usecases/syncVnstockData.ts` | Application |
| Telegram send call | `infrastructure/notifiers/telegram.ts` (existing) | Infrastructure (already wired) |

No domain layer changes. No interface layer changes. No new tables.

---

## 5. Files to Change

| File | Change type | Notes |
|------|-------------|-------|
| `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` | Modify | Add token-bucket/sliding-window limiter; wrap `Bun.spawn` call inside `acquire()` |
| `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` | Modify | Add null-code guard + WARN log in `storeOfficers()` |
| `apps/mcp-server/src/application/usecases/syncVnstockData.ts` | Modify | Add specific NOT NULL catch + `sendTelegramWork` call around `storeOfficers` call |
| New test file `apps/mcp-server/src/__tests__/1833i-global-rate-limiter.test.ts` | Create | Tests AC-1.5 |
| New test file `apps/mcp-server/src/__tests__/1833i-officers-null-alert.test.ts` | Create | Tests AC-2.5 and AC-2.6 |

---

## 6. Non-Functional Requirements

- **No regression on latency of on-demand MCP tools.** The rate limiter must not
  block interactive tool calls (e.g. `get_vnstock_snapshot`). If needed, the limiter
  may distinguish between background-job and on-demand callers via a priority flag,
  but this is optional — the simpler solution of a shared 50 RPM budget is
  acceptable if on-demand calls are infrequent.
- **No Telegram spam.** The NOT NULL alert must not fire more than once per ticker
  per 24-hour window. Reuse or mirror the pattern of `_lastVnstockAlertAt` already
  in `syncVnstockData.ts`, keyed by ticker.
- **Backoff still applies.** The global rate limiter does not replace per-call
  `runPythonWithBackoff()`. Both layers remain in effect.

---

## 7. Edge Cases

| Edge case | Expected behaviour |
|-----------|-------------------|
| Python returns `[]` for officers (valid empty result) | No alert, no insert, `markFetched` called normally |
| Python returns list with some rows having `code: ""` mixed with valid rows | Filter drops bad rows; valid rows are inserted; WARN logged with dropped count |
| Rate limiter full AND a call is waiting AND server shuts down | Pending `acquire()` must resolve (or reject) before process exit — architect to specify timeout behaviour |
| `sendTelegramWork` fails (network error) when sending NOT NULL alert | Error logged; sync continues; no re-throw |
| `syncStockLight` (sector peers) also triggers rate limiter | Confirmed: all calls go through `runPython()` / `runPythonWithBackoff()` which both wrap `Bun.spawn` — same limiter applies |

---

## 8. Blockers for PO Approval

None identified. All decisions are technical implementation choices within the
existing DDD boundaries.

---

## 9. Out of Scope

- Persisting rate-limit state across server restarts (in-memory window is sufficient).
- Changing the VCI account tier or requesting a higher rate limit from the vendor.
- Modifying the `fetchVnstockSnapshot()` batch function (already sequential).
- Any change to the Python scripts embedded in `vnstockBridge.ts`.
