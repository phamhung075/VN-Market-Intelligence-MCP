# Task Context — 229b: GREEN + FR-2 + FR-3 — watchdog implementation + context/evening enhancements

## TLDR (read this first)
change: src/scheduler/market-data/priceUpdateWatchdogJob.ts — NEW (~150 LOC), src/scheduler/jobs.ts — MODIFY (~5 LOC), src/scheduler/briefings/eveningSummaryJob.ts — MODIFY (~20 LOC)
test: src/__tests__/229-price-staleness-watchdog.test.ts — all 5–7 assertions GREEN
branch: task/229b-price-watchdog-green
depends: 229a ✓ (RED test file merged)
knowledge_needed: [bundle-developer] — Telegram channels, market hours logic, dependency injection patterns

---

sprint: 229
branch: task/229b-price-watchdog-green
status: todo
req_ref: REQ-229
tech_ref: TECH-229

---

## [PM] Planning Context

layer: scheduler + domain
depends_on: [229a ✓ merged]

files_to_read:
- src/scheduler/vpsProxyWatchdogJob.ts  # lines 1–296: cooldown + recovery + dual-channel alert pattern
- src/scheduler/market-data/ohlcvStalenessCheckJob.ts  # reference pattern
- src/domain/services/marketContextBuilder.ts  # lines 138–192: existing isPriceStale + watchlist flagging
- src/scheduler/briefings/eveningSummaryJob.ts  # lines 180–270: formatEveningSummaryLines
- docs/TECH_229.md  # FR-1, FR-2, FR-3 detailed specs

---

## [QA] Review Record

**verdict**: APPROVED

**blocking_issues**: []

**non_blocking**: []

**files_confirmed_clean**:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/market-data/priceUpdateWatchdogJob.ts — Implements all 5 functions with proper dependency injection, DDD compliant
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/jobs.ts — Cron registered with correct schedule (*/10 2-8 * * 1-5)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/briefings/eveningSummaryJob.ts — FR-3 crisis detection added (lines 269-289)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleEveningSummary.ts — lastPriceUpdate/lastNewsUpdate fields added
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/marketContextBuilder.ts — FR-2 already implemented, verified correct

**test_results**:
- Unit tests: 11 pass / 0 fail (src/__tests__/229-price-staleness-watchdog.test.ts)
- Full regression: 5966 pass / 0 fail (pre-existing 6 failures unrelated)
- TypeScript: 0 errors

**merge_commit**: pending (awaiting merge)

files_to_create:
- src/scheduler/market-data/priceUpdateWatchdogJob.ts  # CREATE (~150 LOC, functions: priceUpdateWatchdog, isVnMarketHoursUtc, readLatestPriceTimestamp, _resetWatchdogCooldown, _resetWatchdogStaleFlag)

files_to_modify:
- src/scheduler/jobs.ts  # MODIFY: register cron `*/10 2-8 * * 1-5` for priceUpdateWatchdog (~5 LOC)
- src/scheduler/briefings/eveningSummaryJob.ts  # MODIFY: FR-3 data crisis detection (~20 LOC after line 269, before return)
- src/domain/services/marketContextBuilder.ts  # VERIFY: no change needed (FR-2 already implemented at lines 138–192)

test_file: src/__tests__/229-price-staleness-watchdog.test.ts

acceptance_criteria:
- **Given** priceUpdateWatchdogJob.ts implementation complete with all functions
- **When** tests run with mocked dependencies
- **Then**
  - AC-1: Watchdog detects price staleness >6h during market hours → fires alert
  - AC-2: Watchdog respects 30-min cooldown (no alert spam)
  - AC-3: Off-hours guard prevents false alerts outside VN market hours
  - AC-4: Recovery message fires when data restores
  - AC-5: Watchlist context flags stale prices >24h old (already implemented, verify)
  - AC-6: Evening summary detects data crisis + appends banner
  - AC-7: All tests pass with dependency injection; no external service calls
  - AC-8: `bun tsc --noEmit` clean, no type errors
  - AC-9: `bun test` all tests pass (existing + new)

---

## Implementation Guidance

### FR-1: Create priceUpdateWatchdogJob.ts (~150 LOC)

**File**: src/scheduler/market-data/priceUpdateWatchdogJob.ts

**Exports**:
```typescript
export async function priceUpdateWatchdog(
  options?: {
    now?: Date;
    notify?: (message: string) => Promise<unknown>;
    notifyUser?: (message: string) => Promise<unknown>;
    readPrice?: () => Date | null;
  },
): Promise<string>;

export function isVnMarketHoursUtc(now?: Date): boolean;

export function readLatestPriceTimestamp(): Date | null;

export function _resetWatchdogCooldown(): void;
export function _resetWatchdogStaleFlag(): void;
```

**Constants**:
```typescript
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;     // 6 hours
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;          // 30 minutes
const MARKET_HOURS_START = 2;   // UTC 02:00
const MARKET_HOURS_END = 8;     // UTC 08:59 (inclusive)
```

**Module-level state**:
```typescript
let lastAlertAt: number | null = null;
let lastWasStale = false;
```

**Logic flow** (priceUpdateWatchdog):
1. Guard: If outside VN market hours → return "off-hours"
2. Read latest price timestamp from DB
3. Calculate age = now - timestamp
4. If age ≤ 6h → healthy path:
   - If lastWasStale was true, send recovery alert to MARKET
   - Set lastWasStale = false
   - Return "restored" (if was stale) or "ok" (if never stale)
5. If age > 6h → alert path:
   - Check cooldown. If in cooldown (now - lastAlertAt < 30 min) → return "cooldown"
   - Send WORK alert (diagnostic) + MARKET alert (user-friendly) via notify/notifyUser
   - Update lastAlertAt = now, lastWasStale = true
   - Return "alert-sent" (or "notify-failed" if notify threw)

**Alert messages** (bilingual):
- WORK: Diagnostic SSH commands + deployment steps
- MARKET: User-friendly warning with Vietnamese notice

See TECH_229.md lines 119–145 for exact message text.

**Reference pattern**: Study vpsProxyWatchdogJob.ts for cooldown + recovery logic template.

### FR-2: Verify marketContextBuilder.ts

**File**: src/domain/services/marketContextBuilder.ts

**Current status**: Already implemented at lines 138–192. No code change needed.

**Verify only**:
1. `PRICE_STALE_THRESHOLD_MS = 24 * 3_600_000` is set ✓
2. `isPriceStale(updatedAt)` helper function exists ✓
3. `[STALE]` flag appended to price line in output ✓
4. Warning line added if staleCount > 0 ✓

Run unit tests to confirm watchlist section flags stale prices correctly. If tests pass, mark FR-2 done.

### FR-3: Enhance eveningSummaryJob.ts

**File**: src/scheduler/briefings/eveningSummaryJob.ts, function formatEveningSummaryLines()

**Add after line 269** (before `return lines`):

```typescript
// ── Data crisis detection (FR-3) ──────────────────────────────────
// If watchlistMovers + topStories both empty, check if reason is stale data
if (summary.watchlistMovers.length === 0 && summary.topStories.length === 0) {
  const priceAgeMs = summary.lastPriceUpdate
    ? Date.now() - new Date(summary.lastPriceUpdate).getTime()
    : Infinity;
  const newsAgeMs = summary.lastNewsUpdate
    ? Date.now() - new Date(summary.lastNewsUpdate).getTime()
    : Infinity;

  const PRICE_STALE_6H = 6 * 60 * 60 * 1000;
  const NEWS_STALE_15M = 15 * 60 * 1000;

  if (priceAgeMs > PRICE_STALE_6H || newsAgeMs > NEWS_STALE_15M) {
    const priceHours = Math.round(priceAgeMs / 3_600_000);
    const newsHours = Math.round(newsAgeMs / 3_600_000);
    lines.push(
      `\n[⚠ Data pipeline crisis: prices stale ${priceHours}h, last news ${newsHours}h ago]`,
    );
  }
}
```

**Extend EveningSummary interface** (in assembleEveningSummary use case):
- Add `lastPriceUpdate?: string` — ISO timestamp of MAX(market_prices.updated_at)
- Add `lastNewsUpdate?: string` — ISO timestamp of MAX(rag_analyses.created_at)

These are lightweight DB queries (single SELECT MAX per table).

### Update jobs.ts

**File**: src/scheduler/jobs.ts

Add cron registration (~5 LOC):
```typescript
schedule("*/10 2-8 * * 1-5", async () => {
  const result = await priceUpdateWatchdog();
  logger.info(`priceUpdateWatchdog: ${result}`);
});
```

Imports needed:
```typescript
import { priceUpdateWatchdog } from "./market-data/priceUpdateWatchdogJob";
```

---

## DDD Invariant Checklist

- [ ] priceUpdateWatchdogJob.ts has NO imports from `application/` or `interface/` (scheduler layer only)
- [ ] marketContextBuilder.ts has NO imports from `infrastructure/` except `Database` type (domain layer)
- [ ] eveningSummaryJob.ts has valid imports from `domain/` + `application/` (scheduler layer)
- [ ] All layer boundaries respected (domain ← application ← interface ← scheduler)

---

## Test Strategy

Tests written in 229a should now pass:
- priceUpdateWatchdog() with mocked notify/notifyUser
- isVnMarketHoursUtc() with injected now parameter
- readLatestPriceTimestamp() with mocked DB
- Module state reset functions for test isolation

Run `bun test` to verify all 5–7 assertions GREEN.

---

## TypeScript + Linting Checklist

- [ ] `bun tsc --noEmit` shows 0 errors
- [ ] No unused imports
- [ ] All function signatures match TECH_229.md FR-1 interface contracts
- [ ] Module-level state variables properly scoped (not exported except reset functions)

---

## Done Criteria

1. priceUpdateWatchdogJob.ts created (~150 LOC) with all functions implemented
2. isVnMarketHoursUtc() correctly guards Mon-Fri 02:00-08:59 UTC
3. readLatestPriceTimestamp() reads MAX(market_prices.updated_at), filters TEST/PROBE rows
4. jobs.ts updated with cron registration (~5 LOC)
5. eveningSummaryJob.ts updated with FR-3 banner detection (~20 LOC)
6. marketContextBuilder.ts verified (no change needed or minimal fix if tests fail)
7. src/__tests__/229-price-staleness-watchdog.test.ts all assertions GREEN
8. `bun test` suite green (all existing + new tests pass)
9. `bun tsc --noEmit` clean (no type errors)
10. No console spam; proper logging via `logger.*`
11. Task marked Done in TASKS.md

---

## Reference

- TECH-229: FR-1 (lines 56–110), FR-2 (lines 150–166), FR-3 (lines 169–201)
- Existing watchdog pattern: src/scheduler/vpsProxyWatchdogJob.ts (lines 1–296)
- Market context builder: src/domain/services/marketContextBuilder.ts (lines 138–192)
- Evening summary: src/scheduler/briefings/eveningSummaryJob.ts (lines 180–270)
