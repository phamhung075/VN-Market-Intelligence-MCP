# TECH-076: Pipeline Watchdog — Stale-Pipeline Telegram Alert

status: APPROVED_BY_ARCHITECT
req_ref: REQ-076
task: 1190

---

## Brownfield Impact

- Files created: `src/scheduler/pipelineWatchdogJob.ts`
- Files created: `src/__tests__/1190-pipeline-watchdog.test.ts`
- Files modified: `src/scheduler/jobs.ts` (new CRONS key + cron.schedule block + jsdoc)
- Files modified: `docs/data/cron-registry.json` (count 27 → 28, new entry)
- Files deleted: none
- Breaking changes: no

---

## Architecture Decision

### File placement: `src/scheduler/pipelineWatchdogJob.ts` (flat, not `jobs/` subdirectory)

The REQ-076 spec mentions `src/scheduler/jobs/pipelineWatchdogJob.ts` as a proposed path. That
path does not exist — there is no `jobs/` subdirectory. All 27 existing scheduler files sit flat
in `src/scheduler/` (e.g. `vpsProxyWatchdogJob.ts`, `cronHealthAlertJob.ts`, `insiderCheckJob.ts`).
Creating a one-file `jobs/` subdirectory would break the established convention, require a
relative-path change in `jobs.ts` (`./jobs/pipelineWatchdogJob.js` vs `./pipelineWatchdogJob.js`),
and would not justify the subdirectory abstraction overhead for a single file.

**Decision: place the file flat at `src/scheduler/pipelineWatchdogJob.ts`**, matching every
other scheduler job in the project. The `jobs.ts` import path is therefore
`'./pipelineWatchdogJob.js'`.

### Design rationale

The job follows the exact same structure as `vpsProxyWatchdogJob.ts`: module-level `lastAlertAt`
for cooldown state, injectable `now`/`notify`/`getPipelineHealthFn` for test isolation, and
production defaults wired at call time (not at import time). This pattern is already
battle-tested in the codebase and requires no new abstractions.

The `getPipelineHealth` use case is imported via dynamic `import()` in production to mirror the
lazy-load pattern used in `getPipelineHealth.ts` itself (which lazy-loads `getDb`). However,
since `pipelineWatchdogJob.ts` is a scheduler file (outermost layer), a static top-level import
is also acceptable — it does not create a DDD layer violation. Static import is preferred for
simplicity and to avoid the async cost of a cold dynamic import on every 30-minute tick.

---

## DDD Layer Plan

| Component                    | Layer       | File Path                                              | New/Modify |
| ---------------------------- | ----------- | ------------------------------------------------------ | ---------- |
| `runPipelineWatchdog`        | scheduler   | `src/scheduler/pipelineWatchdogJob.ts`                 | NEW        |
| `_resetWatchdogCooldown`     | scheduler   | `src/scheduler/pipelineWatchdogJob.ts`                 | NEW        |
| `CRONS.pipelineWatchdog`     | scheduler   | `src/scheduler/jobs.ts`                                | MODIFY     |
| `cron.schedule` registration | scheduler   | `src/scheduler/jobs.ts`                                | MODIFY     |
| jsdoc comment block          | scheduler   | `src/scheduler/jobs.ts`                                | MODIFY     |
| test file                    | —           | `src/__tests__/1190-pipeline-watchdog.test.ts`         | NEW        |
| cron registry                | —           | `docs/data/cron-registry.json`                         | MODIFY     |

DDD compliance: `pipelineWatchdogJob.ts` imports from `application/usecases/` (permitted:
scheduler → application) and from `infrastructure/notifiers/` (permitted: scheduler →
infrastructure). No domain-layer imports are needed. No violations.

---

## Interface Contracts

### New exported symbols — `src/scheduler/pipelineWatchdogJob.ts`

```typescript
export const STALE_THRESHOLD_MINS = 90;
export const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 10_800_000 ms

let lastAlertAt = 0; // module-level, epoch ms, initialised to 0

export function _resetWatchdogCooldown(): void  // test-only; sets lastAlertAt = 0

export type WatchdogResult =
  | "ok"             // staleMins <= 90
  | "no-data"        // staleMins === null (empty table)
  | "alert-sent"     // stale + cooldown passed + notify returned truthy
  | "cooldown"       // stale but within 3-hour cooldown window
  | "notify-failed"  // stale + cooldown passed + notify returned false or threw

export async function runPipelineWatchdog(options?: {
  now?: Date;
  notify?: (message: string) => Promise<boolean>;
  getPipelineHealthFn?: (opts?: GetPipelineHealthOptions) => Promise<PipelineHealthResult>;
}): Promise<WatchdogResult>
```

### Imports required in `pipelineWatchdogJob.ts`

```typescript
import { getPipelineHealth } from '../application/usecases/getPipelineHealth.js'
import type { GetPipelineHealthOptions, PipelineHealthResult } from '../application/usecases/getPipelineHealth.js'
import { sendTelegramWork } from '../infrastructure/notifiers/telegram.js'
import { logger } from '../infrastructure/logger.js'
```

### Changes to `src/scheduler/jobs.ts`

1. Add import:
   ```typescript
   import { runPipelineWatchdog } from './pipelineWatchdogJob.js'
   ```

2. Add to `CRONS` object (after `insiderCheck`):
   ```typescript
   /** Pipeline watchdog: every 30 min 24/7 — task 1190, Sprint 076 */
   pipelineWatchdog: Bun.env.CRON_PIPELINE_WATCHDOG ?? '*/30 * * * *',
   ```

3. Add cron registration block inside `startScheduler()`:
   ```typescript
   // Every 30 min 24/7 — Pipeline watchdog — task 1190
   // Polls getPipelineHealth() and alerts WORK channel when staleMins > 90.
   // 3-hour cooldown prevents alert floods during sustained outages.
   cron.schedule(CRONS.pipelineWatchdog, async () => {
     await recordJobRun(getDb(), 'pipelineWatchdogJob', async () => {
       const result = await runPipelineWatchdog()
       if (result === 'alert-sent' || result === 'notify-failed') {
         log(`[pipeline-watchdog] ${result}`)
       }
       return { staleMins: undefined } // observability: result string stored via log
     })
   }, { timezone: 'UTC' })
   ```

   Note on `recordJobRun` return shape: the wrapper signature accepts
   `Promise<{ rowsWritten?: number } | void>`. There is no `staleMins` field in the
   `CronJobRunRow` schema — `recordJobRun` only persists `rowsWritten`. The REQ-076 FR-5 note
   about `{ staleMins }` refers to operator observability in logs, not in the DB column.
   The `log()` call above covers that. Return `void` (or `{ rowsWritten: 0 }`) from the fn.

4. Update the jsdoc comment block at the top of `jobs.ts` to include:
   ```
   *   pipelineWatchdog      every 30 min 24/7  (task 1190) ✓
   ```

---

## Full Logic Spec — `runPipelineWatchdog`

```
1. Resolve now = options.now ?? new Date()
2. Resolve getPipelineHealthFn = options.getPipelineHealthFn ?? getPipelineHealth
3. Resolve notify = options.notify ?? ((msg) => sendTelegramWork(msg, { parseMode: "" }))

4. Call health = await getPipelineHealthFn()
   — if throws: log error, return "notify-failed"
     (do NOT call it "health-check-failed"; keep WatchdogResult to 5 variants as per REQ-076)

5. staleMins = health.ragRows.staleMins
   — if null: logger.debug "[pipelineWatchdog] no data", return "no-data"
   — if <= 90: logger.debug "[pipelineWatchdog] healthy", return "ok"

6. Cooldown check:
   — if now.getTime() - lastAlertAt < COOLDOWN_MS: return "cooldown"

7. Build message string (exact template from FR-4):
   [Pipeline Watchdog] News pipeline silent.
   Stale for: <staleMins> min
   Today's rag_analyses rows: <health.ragRows.today>
   Last insert: <health.ragRows.lastInsertedAt ?? "never">
   VPS news pushes (24h): <health.vpsPushLast24h ?? "unknown">

   Check intelligenceCycleJob logs and VPS vn-news-fetch.service.

8. try:
     ok = await notify(message)
     if ok is falsy: return "notify-failed"   // do NOT advance lastAlertAt
     lastAlertAt = now.getTime()
     return "alert-sent"
   catch:
     log error
     return "notify-failed"                   // do NOT advance lastAlertAt
```

**Key invariant**: `lastAlertAt` is only advanced when `notify` resolves to a truthy value.
A false return or thrown exception leaves `lastAlertAt` unchanged so the next run retries.

---

## Test Fixture Design — `src/__tests__/1190-pipeline-watchdog.test.ts`

### Setup

```typescript
process.env["DB_PATH"] = ":memory:";  // prevent real DB access

import { describe, it, expect, beforeEach } from "bun:test";
import {
  runPipelineWatchdog,
  _resetWatchdogCooldown,
  STALE_THRESHOLD_MINS,
  COOLDOWN_MS,
} from "../scheduler/pipelineWatchdogJob.js";
import type { PipelineHealthResult } from "../application/usecases/getPipelineHealth.js";
```

No real DB, no real Telegram connection, no network access in any test.

### Helper: `makeHealth(staleMins, overrides?)`

```typescript
function makeHealth(staleMins: number | null, overrides?: Partial<PipelineHealthResult>): PipelineHealthResult {
  return {
    generatedAt: new Date().toISOString(),
    ragRows: {
      today: 3,
      yesterday: 10,
      lastInsertedAt: staleMins !== null ? "2026-04-13T08:00:00.000Z" : null,
      staleMins,
    },
    sources: [],
    vpsPushLast24h: 5,
    eveningReportLastRun: null,
    ...overrides,
  };
}
```

### Test structure

```
describe("runPipelineWatchdog — staleness gate")

  beforeEach: _resetWatchdogCooldown()

  it("staleMins = 45 (healthy) → 'ok', notify not called")
    getPipelineHealthFn returns makeHealth(45)
    notify spy initialized
    expect result === "ok"
    expect notify call count === 0

  it("staleMins = 90 (boundary) → 'ok', notify not called")
    getPipelineHealthFn returns makeHealth(90)
    expect result === "ok"

  it("staleMins = null (empty table) → 'no-data', notify not called")
    getPipelineHealthFn returns makeHealth(null)
    expect result === "no-data"
    expect notify call count === 0

  it("staleMins = 120, lastAlertAt = 0 → 'alert-sent', notify called once")
    getPipelineHealthFn returns makeHealth(120)
    notify spy returns true
    expect result === "alert-sent"
    expect notify call count === 1

  it("alert message contains staleMins, today count, lastInsertedAt, vpsPushLast24h")
    health: staleMins=120, today=3, lastInsertedAt="2026-04-13T08:00:00.000Z", vpsPushLast24h=0
    capture message passed to notify
    expect message to include "120 min"
    expect message to include "3"
    expect message to include "2026-04-13T08:00:00.000Z"
    expect message to include "0"

  it("lastInsertedAt null renders 'never' in message")
    health: staleMins=120, lastInsertedAt=null
    // Note: staleMins=120 with lastInsertedAt=null is an unusual combination
    // but must not crash. Use a manually crafted PipelineHealthResult.
    expect message to include "never"

  it("vpsPushLast24h null renders 'unknown' in message")
    health: vpsPushLast24h=null
    expect message to include "unknown"

describe("runPipelineWatchdog — cooldown logic")

  beforeEach: _resetWatchdogCooldown()

  it("staleMins = 200, within 3h cooldown → 'cooldown', notify not called")
    // Send first alert to establish lastAlertAt
    now1 = new Date("2026-04-13T10:00:00.000Z")
    await runPipelineWatchdog({ now: now1, getPipelineHealthFn, notify })  // alert-sent
    _resetWatchdogCooldown is NOT called here
    // 90 min later — still within cooldown
    now2 = new Date("2026-04-13T11:30:00.000Z")
    result = await runPipelineWatchdog({ now: now2, getPipelineHealthFn, notify })
    expect result === "cooldown"
    expect notify total call count === 1 (only the first call)

  it("staleMins = 200, cooldown expired (> 3h) → 'alert-sent', notify called again")
    now1 = new Date("2026-04-13T10:00:00.000Z")
    await runPipelineWatchdog({ now: now1, ... })   // first alert
    now2 = new Date("2026-04-13T14:01:00.000Z")    // 4h01m later
    result = await runPipelineWatchdog({ now: now2, ... })
    expect result === "alert-sent"
    expect notify total call count === 2

  it("notify returns false → 'notify-failed', lastAlertAt not advanced")
    now = new Date("2026-04-13T10:00:00.000Z")
    notify returns false
    result = await runPipelineWatchdog({ now, getPipelineHealthFn, notify })
    expect result === "notify-failed"
    // Immediately retry — should attempt to send again (cooldown not advanced)
    result2 = await runPipelineWatchdog({ now, getPipelineHealthFn, notify })
    expect result2 === "notify-failed"    // still tries, not "cooldown"
    expect notify call count === 2

  it("notify throws → 'notify-failed', lastAlertAt not advanced")
    notify = async () => { throw new Error("Telegram timeout") }
    result = await runPipelineWatchdog({ ... })
    expect result === "notify-failed"

  it("getPipelineHealthFn throws → 'notify-failed', no crash")
    getPipelineHealthFn = async () => { throw new Error("DB offline") }
    result = await runPipelineWatchdog({ ... })
    expect result === "notify-failed"

  it("_resetWatchdogCooldown resets state between tests")
    // Covered implicitly by beforeEach; add explicit check:
    await runPipelineWatchdog({ staleMins=200, notify returning true, now=T0 })  // alert-sent
    _resetWatchdogCooldown()
    result = await runPipelineWatchdog({ staleMins=200, notify, now=T0+1min })
    expect result === "alert-sent"   // not "cooldown" — reset worked

describe("cron-registry.json integrity")

  it("schedulerFileCount === 28")
    const json = JSON.parse(readFileSync("docs/data/cron-registry.json", "utf8"))
    expect json.schedulerFileCount === 28

  it("jobs array contains entry with name 'pipelineWatchdog'")
    const entry = json.jobs.find(j => j.name === "pipelineWatchdog")
    expect entry to be defined
    expect entry.schedule === "*/30 min"

describe("CRONS map — jobs.ts export")

  it("CRONS.pipelineWatchdog exists and matches default pattern")
    import { CRONS } from "../scheduler/jobs.js"
    expect Object.keys(CRONS) to contain "pipelineWatchdog"
    // If CRON_PIPELINE_WATCHDOG env not set, value is '*/30 * * * *'
    delete process.env["CRON_PIPELINE_WATCHDOG"]
    expect CRONS.pipelineWatchdog === '*/30 * * * *'
```

---

## `docs/data/cron-registry.json` Change

Increment `schedulerFileCount` from 27 to 28. Append to `jobs` array:

```json
{ "schedule": "*/30 min", "name": "pipelineWatchdog", "desc": "Stale news pipeline detection — alerts work channel when staleMins > 90, 3h cooldown" }
```

Update `lastUpdated` to the implementation date.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| Alert flood during sustained outage | Low | High | Module-level `lastAlertAt` + 3h `COOLDOWN_MS` — exactly one alert per 3h window |
| `getPipelineHealth` throws on DB lock / schema change | Low | Medium | Wrapped in try/catch; returns `"notify-failed"` without crashing scheduler |
| `sendTelegramWork` unavailable (Telegram API 429/503) | Medium | Low | `notify-failed` path; `lastAlertAt` not advanced so next 30-min tick retries automatically |
| Module restart during active outage sends duplicate alert | Low | Low | Acceptable per REQ-076: "at most one extra notification after restart" |
| Cron pattern collision with `intelligenceCycleJob` at :00/:30 | Certain | None | Both are async and independent; SQLite WAL mode allows concurrent reads |
| `jobs/` subdirectory misread | N/A | — | Resolved: file placed flat in `src/scheduler/`, no new directory created |

---

## Security Review

- [ ] SQL parameterized? N/A — this file issues no SQL queries directly (`getPipelineHealth` handles all DB access with parameterized bindings, already reviewed in TECH-075).
- [ ] File paths validated (no `../`)? N/A — no filesystem access in this file.
- [ ] External HTTP rate-limited? N/A — no direct HTTP calls. Telegram send delegates to `sendTelegramWork`, which already uses the existing Telegram client.
- [ ] Secrets via `Bun.env` only? Yes — no secrets in this file. Telegram token consumed inside `sendTelegramWork`.

---

## Task Breakdown (for Developer)

Single task (no subtask split needed — scope is contained):

**Task 1190** — implement `pipelineWatchdogJob.ts` + register in `jobs.ts` + update `cron-registry.json` + write tests.

Dependency order within the task:

1. Write `src/__tests__/1190-pipeline-watchdog.test.ts` (all test cases, failing).
2. Implement `src/scheduler/pipelineWatchdogJob.ts` (make tests pass).
3. Modify `src/scheduler/jobs.ts` (import + CRONS key + cron.schedule block + jsdoc).
4. Update `docs/data/cron-registry.json`.
5. Run `bun test src/__tests__/1190-pipeline-watchdog.test.ts` — all green.
6. Run `bun tsc --noEmit` — 0 errors.
