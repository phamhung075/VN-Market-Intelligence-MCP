# TASK_1353b — priceUpdateWatchdogJob _resetSshCooldown + 8 gap tests

## Source
Architect design: `docs/handoffs/TASK_1353.md` (1353b section)

## Production change required

Add one export to `apps/mcp-server/src/scheduler/market-data/priceUpdateWatchdogJob.ts`:

```typescript
/** Test-only: Reset SSH attempt timer for test isolation. */
export function _resetSshCooldown(): void {
  lastSshAttemptAt = 0;
}
```

Zero production behaviour change. Same pattern as existing `_resetWatchdogCooldown` and `_resetWatchdogStaleFlag` helpers.

## Test file to create

`apps/mcp-server/src/__tests__/1353b-price-update-watchdog-job-gaps.test.ts`

### File header (copy verbatim)

```typescript
/**
 * TASK_1353b — priceUpdateWatchdogJob gap-fill tests
 *
 * Covers paths not reached by 229-price-staleness-watchdog.test.ts,
 * 240-price-pipeline-recovery.test.ts, or 317-telegram-routing-bugs.test.ts:
 *   1–3. isVnMarketHoursUtc boundary: Sunday, 09:00 post-close, Friday mid-session
 *   4.   Future timestamp → negative priceAgeMs → treated as stale → "alert-sent"
 *   5.   notify returns false (not throw) → "notify-failed"
 *   6.   readPrice returns null → Infinity age → "alert-sent"
 *   7.   SSH in-cooldown: second stale call within 6h → sshStatus "in-cooldown" in message
 *   8.   notifyUser throws during recovery → job returns "restored", does not re-throw
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import {
  priceUpdateWatchdog,
  isVnMarketHoursUtc,
  _resetWatchdogCooldown,
  _resetWatchdogStaleFlag,
  _resetSshCooldown,
} from "../scheduler/market-data/priceUpdateWatchdogJob.js";
```

## Shared helpers

```typescript
// Wednesday 2026-04-29T05:00:00Z — market hours (Mon-Fri 02:00-08:59 UTC)
const MARKET_NOW = new Date("2026-04-29T05:00:00Z");

function stalePrice(now: Date): () => Date | null {
  return () => new Date(now.getTime() - 7 * 60 * 60 * 1000);
}

function freshPrice(now: Date): () => Date | null {
  return () => new Date(now.getTime() - 1 * 60 * 60 * 1000);
}
```

## beforeEach

All describe blocks that exercise module-level state must use:
```typescript
beforeEach(() => {
  _resetWatchdogCooldown();
  _resetWatchdogStaleFlag();
  _resetSshCooldown();
});
```

## 8 test cases (full spec in TASK_1353.md §1353b)

| # | Path | Key assertion |
|---|------|---------------|
| 1 | Sunday 04:00 UTC | isVnMarketHoursUtc → false |
| 2 | Monday 09:00 UTC | isVnMarketHoursUtc → false (post-close boundary) |
| 3 | Friday 08:00 UTC | isVnMarketHoursUtc → true (last valid weekday) |
| 4 | Future timestamp (now + 60s) | result === "alert-sent" |
| 5 | notify returns false | result === "notify-failed" |
| 6 | readPrice returns null | result === "alert-sent", notifySpy called |
| 7 | Second stale call within 6h | msgs[1].includes("in-cooldown") |
| 8 | notifyUser throws during recovery | result === "restored", does not re-throw |

## Acceptance criteria

- [ ] `_resetSshCooldown()` exported from `priceUpdateWatchdogJob.ts`
- [ ] All 8 tests pass in isolation (`bun test 1353b`)
- [ ] Full suite still passes (0 regression)
- [ ] Branch: `task/1353b-price-watchdog-ssh-cooldown-gap-tests`
