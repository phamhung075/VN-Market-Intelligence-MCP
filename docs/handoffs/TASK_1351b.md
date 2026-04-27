# TASK_1351b — vpsProxyWatchdogJob: gap-fill tests

## Architect finding

`vpsProxyWatchdogJob.ts` has **partial coverage** in:

```
apps/mcp-server/src/__tests__/313-vps-proxy-watchdog.test.ts
```

The existing 9 tests cover the core happy/sad path and cooldown for price staleness.
Task 1345a added Reuters + TradingEconomics staleness detection (new `readReuters`,
`readTe` injectable readers and `REUTERS_STALE_MS`/`TE_STALE_MS` constants) — none
of that is tested. Additionally the `restored`, `notify throws`, and
`_resetWatchdogStaleFlag` paths are untested.

## Source file

```
apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts
```

## Test file to create

```
apps/mcp-server/src/__tests__/1351b-vps-proxy-watchdog-gaps.test.ts
```

## Injectable surface (runVpsProxyWatchdog options)

```typescript
runVpsProxyWatchdog({
  now?: Date,
  notify?: (msg: string) => Promise<unknown>,
  notifyUser?: (msg: string) => Promise<unknown>,
  readPrice?:       () => Date | null,
  readNews?:        () => Date | null,
  readOhlcv?:       () => Date | null,
  readForeignFlow?: () => Date | null,
  readReuters?:     () => Date | null,   // Task 1345a
  readTe?:          () => Date | null,   // Task 1345a
})
```

Reset helpers exported from source:
- `_resetWatchdogCooldown()` — resets `lastAlertAt` and `lastWasStale`
- `_resetWatchdogStaleFlag()` — resets `lastWasStale` only

Constants exported:
- `REUTERS_STALE_MS = 90 * 60 * 1000`
- `TE_STALE_MS = 90 * 60 * 1000`

## Required mocks / stubs

- **No DB**: all reader fns injected — never call `readLatestPriceTimestamp` etc. directly
- **No real Telegram**: inject `notify` as a spy
- `now` injected as a fixed `Date` to control market-hours gate
- All reader fns default: return a fresh timestamp to avoid cross-test stale bleed

### Shared helpers

```typescript
// Market-hours instant (Monday 03:00 UTC)
const MARKET_NOW = new Date("2026-04-06T03:00:00Z");

// Returns a timestamp `ageMs` milliseconds before `now`
function tsAgo(now: Date, ageMs: number): () => Date | null {
  return () => new Date(now.getTime() - ageMs);
}

// Fresh reader — age 0ms (never stale)
function fresh(now: Date): () => Date | null {
  return tsAgo(now, 0);
}
```

## Test cases

### describe: Reuters staleness (Task 1345a)

1. **Reuters stale (age > 90 min), all others fresh → "alert-sent", message contains "vn-reuters-fetch"**
   - `readReuters: tsAgo(MARKET_NOW, REUTERS_STALE_MS + 1)`
   - all other readers: `fresh(MARKET_NOW)`
   - assert `result === "alert-sent"`, `capturedMsg.includes("vn-reuters-fetch")`

2. **Reuters fresh (age < 90 min) → "ok"**
   - `readReuters: tsAgo(MARKET_NOW, REUTERS_STALE_MS - 60_000)`
   - all others fresh
   - assert `result === "ok"`, notify not called

3. **Reuters null (never pushed, fresh deploy) → treated as stale → "alert-sent"**
   - `readReuters: () => null`
   - all others fresh
   - assert `result === "alert-sent"`, message contains "no data since boot"

### describe: TradingEconomics staleness (Task 1345a)

4. **TE stale (age > 90 min), all others fresh → "alert-sent", message contains "vn-tradingeconomics-fetch"**
   - `readTe: tsAgo(MARKET_NOW, TE_STALE_MS + 1)`
   - all others fresh
   - assert `result === "alert-sent"`, `capturedMsg.includes("vn-tradingeconomics-fetch")`

5. **Both Reuters and TE stale → single alert lists both services**
   - assert `result === "alert-sent"`, message contains both "vn-reuters-fetch" and "vn-tradingeconomics-fetch"

### describe: restored path

6. **All sources become fresh after a stale run → "restored" returned, lastWasStale reset**
   - Run 1: all stale → "alert-sent" (sets `lastWasStale = true`)
   - `_resetWatchdogCooldown()` to clear cooldown
   - Run 2 (31+ min later): all fresh → expect `result === "restored"`
   - Run 3 (same): all fresh → expect `result === "ok"` (not "restored" again)

### describe: notify throws

7. **notify throws → "notify-failed", does not crash**
   - `notify: async () => { throw new Error("Telegram timeout") }`
   - assert `result === "notify-failed"`

### describe: _resetWatchdogStaleFlag

8. **_resetWatchdogStaleFlag resets lastWasStale independently of lastAlertAt**
   - Run 1: stale → "alert-sent" (sets lastWasStale, lastAlertAt)
   - `_resetWatchdogStaleFlag()` only (do NOT call `_resetWatchdogCooldown`)
   - Run 2 (within cooldown, all fresh) → expect `result === "ok"` (not "restored",
     because lastWasStale was reset)

## Implementation notes

- Set `Bun.env["DB_PATH"] = ":memory:"` at file top (same as 313 file)
- `beforeEach(() => { _resetWatchdogCooldown(); _resetWatchdogStaleFlag(); })`
- All readers for sources not under test must return `fresh(MARKET_NOW)` to
  prevent cross-contamination with price/news/ohlcv/foreignFlow staleness
- Test file is additive — do NOT modify `313-vps-proxy-watchdog.test.ts`

## Parallel eligibility

Independent of 1351c (different source file). Can run in parallel.

## RETURN
DONE: Gap analysis complete — 8 missing test cases identified for vpsProxyWatchdogJob covering Task 1345a Reuters/TE staleness, restored path, notify-throws, and _resetWatchdogStaleFlag
NEXT: developer | implement apps/mcp-server/src/__tests__/1351b-vps-proxy-watchdog-gaps.test.ts per spec above
HANDOFF: docs/handoffs/TASK_1351b.md
PIPELINE: continue
