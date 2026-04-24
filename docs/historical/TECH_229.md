# TECH-229: Price Staleness Watchdog + Data Crisis Detection

**status:** DRAFT → APPROVED_BY_ARCHITECT
**req_ref:** REQ-229
**sprint:** 229

---

## Brownfield Impact

| File | Change Type | Reason |
|------|-------------|--------|
| `src/scheduler/market-data/priceUpdateWatchdogJob.ts` | NEW | FR-1: Monitor 6h price staleness + recovery |
| `src/scheduler/jobs.ts` | MODIFY | Register cron + import new watchdog (~5 LOC) |
| `src/domain/services/marketContextBuilder.ts` | MODIFY | FR-2: Flag prices >24h old in watchlist section (~15 LOC) |
| `src/scheduler/briefings/eveningSummaryJob.ts` | MODIFY | FR-3: Add crisis banner if empty summary + stale data (~20 LOC) |
| `docs/ARCHITECTURE.md` | MODIFY | Update VPS Proxy section with price-staleness watchdog role |
| `docs/data/cron-registry.json` | MODIFY | Increment scheduler count (+1 job) |

### Breaking Changes
None. FR-1 is a new independent watchdog; FR-2 and FR-3 are additive enhancements to existing functions.

---

## Architecture Decision

**Design**: Two-threshold early-warning approach.

The existing `vpsProxyWatchdogJob.ts` monitors staleness at 45 min during market hours (broad multi-source detection). This sprint adds a tighter **6-hour threshold** watchdog specifically for price data with explicit VN market hours guard.

The 6h watchdog is an **early-warning layer** fired before VN market close (15:30 UTC = 22:30 VN). Its purpose is to surface data pipeline issues to the user and dev team quickly, preventing the evening briefing from showing a misleading "quiet market" when in fact data collection has failed.

**Why this approach:**
1. **Separation of concerns**: 45-min watchdog is multi-source observer; 6h watchdog is price-specific early alert.
2. **User-facing responsiveness**: Detects stale >6h during market hours → alerts in-session.
3. **No re-implementation**: Extends existing pattern (same cooldown + recovery logic as 45-min watchdog).
4. **Testability**: Pure domain functions with dependency injection for all I/O.

---

## DDD Layer Plan

| Component | Layer | File | New/Modify | Responsibility |
|-----------|-------|------|-----------|-----------------|
| `priceUpdateWatchdog()` | domain | `src/scheduler/market-data/priceUpdateWatchdogJob.ts` | NEW | Core staleness detection logic (thresholds, recovery, cooldown) |
| `isVnMarketHoursUtc()` | domain | same file | NEW | Market hours guard (Mon-Fri 02:00-08:59 UTC) |
| `readLatestPriceTimestamp()` | domain | same file | NEW | Read MAX(market_prices.updated_at) |
| `buildWatchlistSection()` | domain | `src/domain/services/marketContextBuilder.ts` | MODIFY | Inject `isPriceStale()` check + [STALE] flag + warning line |
| `formatEveningSummaryLines()` | scheduler | `src/scheduler/briefings/eveningSummaryJob.ts` | MODIFY | Detect data crisis (empty movers + stale prices) + append banner |
| `registerScheduler()` | scheduler | `src/scheduler/jobs.ts` | MODIFY | Cron registration: `*/10 2-8 * * 1-5` |

---

## Interface Contracts

### FR-1: Price Update Watchdog (New File)

**File**: `src/scheduler/market-data/priceUpdateWatchdogJob.ts`

```typescript
/**
 * Detects when market price data goes stale >6h during VN market hours.
 *
 * Return values:
 *   "ok"            — prices fresh, nothing to do
 *   "off-hours"     — outside VN market hours (Mon-Fri 02:00-08:59 UTC)
 *   "alert-sent"    — stale detected + alert sent to WORK + MARKET
 *   "cooldown"      — stale but cooldown in effect (no new alert)
 *   "restored"      — data just recovered after prior alert (recovery message sent)
 *   "notify-failed" — alert send attempt failed
 */
export async function priceUpdateWatchdog(
  options?: {
    now?: Date;
    notify?: (message: string) => Promise<unknown>;
    notifyUser?: (message: string) => Promise<unknown>;
    readPrice?: () => Date | null;
  },
): Promise<string>;

/**
 * Returns true if current UTC instant is inside VN market hours
 * (Mon-Fri 02:00-08:59 UTC).
 */
export function isVnMarketHoursUtc(now?: Date): boolean;

/**
 * Reads MAX(market_prices.updated_at) or null if table empty.
 * Filters out TEST/PROBE test rows.
 */
export function readLatestPriceTimestamp(): Date | null;

// Test-only resets (exported for unit tests)
export function _resetWatchdogCooldown(): void;
export function _resetWatchdogStaleFlag(): void;
```

**Logic flow**:
1. Guard: If outside VN market hours → return `"off-hours"` (no alert regardless of staleness)
2. Read latest price timestamp from DB
3. Calculate age = now - timestamp
4. If age ≤ 6h → healthy path:
   - If last check was stale, send recovery alert to MARKET + reset flag
   - Return `"restored"` (if recovery) or `"ok"` (if never stale)
5. If age > 6h → alert path:
   - Check cooldown (30 min). If in cooldown → return `"cooldown"`
   - Send WORK alert (diagnostic, SSH commands) + MARKET alert (user-friendly) to Telegram
   - Update cooldown timer + set staleness flag
   - Return `"alert-sent"` (or `"notify-failed"` if send failed)

**Thresholds (constants)**:
```typescript
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;     // 6 hours
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;          // 30 minutes
const MARKET_HOURS_START = 2;   // UTC 02:00
const MARKET_HOURS_END = 8;     // UTC 08:59 (inclusive)
```

**Messages** (bilingual):
- WORK alert (to TELEGRAM_INFO_WORK_CHANNEL_ID):
  ```
  [PRICE STALENESS] VN market prices stale >6h during market hours.
  Last update: 2026-04-20 22:00 UTC (7 hours old)

  SSH diagnostics:
  ssh root@VINAHOST_IP systemctl status vn-price-fetch
  ssh root@VINAHOST_IP journalctl -u vn-price-fetch -n 20

  If stuck: /root/deploy.sh && systemctl restart vn-price-fetch
  ```

- MARKET alert (to TELEGRAM_INFO_MARKET_GROUP_ID):
  ```
  ⚠ Phát hiện lỗi pipeline dữ liệu: Giá thị trường đã dừng cập nhật 6+ giờ

  Cảnh báo: Dữ liệu hiện tại không đáng tin cậy cho phân tích intraday.
  Đội dev đã được thông báo và đang xử lý.

  Lần cập nhật cuối: 2026-04-20 22:00 UTC
  ```

- Recovery alert (to MARKET):
  ```
  ✓ Pipeline dữ liệu đã khôi phục — dữ liệu tươi mới đang đến lại.
  ```

---

### FR-2: Stale Price Warning in Watchlist Context

**File**: `src/domain/services/marketContextBuilder.ts`, function `buildWatchlistSection()`

**Existing code** (lines 148–192):
- Already has `isPriceStale(updatedAt)` helper at line 138–142 (threshold 24h)
- Already counts and flags stale prices (lines 175–189)

**No code change needed** — the requirement is already implemented! Verify:
1. `PRICE_STALE_THRESHOLD_MS = 24 * 3_600_000` ✓
2. `isPriceStale()` function exists ✓
3. `[STALE]` flag appended to price line ✓
4. Warning line added if staleCount > 0 ✓

**Action for Developer**:
- Run unit tests to confirm watchlist section flags stale prices correctly.
- No code change required unless tests fail.

---

### FR-3: Evening Summary Data Crisis Flag

**File**: `src/scheduler/briefings/eveningSummaryJob.ts`, function `formatEveningSummaryLines()`

**Current code** (lines 184–270):
- Formats movers, alerts, stories, TA, P&L, foreign flow, global snapshot
- No staleness detection

**Required addition** (~20 LOC after line 269, before `return lines`):

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

**Inputs required** (extend EveningSummary interface):
- `lastPriceUpdate?: string` — ISO timestamp of MAX(market_prices.updated_at)
- `lastNewsUpdate?: string` — ISO timestamp of MAX(rag_analyses.created_at)

These are lightweight queries added to `assembleEveningSummary()` use case (not in this task but noted for Developer).

---

## Task Breakdown (for PM)

Suggested atomic tasks in dependency order:

1. **TASK-229a (TDD RED)**: Test suite for price staleness watchdog
   - File: `src/__tests__/229-price-staleness-watchdog.test.ts`
   - 5–7 assertions covering FR-1 logic
   - All DB calls mocked, time injection via `options.now`
   - Status: RED (failing assertions, function stubs only)

2. **TASK-229b (GREEN + FR-2 + FR-3)**: Watchdog implementation + context/evening enhancements
   - File: `src/scheduler/market-data/priceUpdateWatchdogJob.ts` (NEW, ~150 LOC)
   - File: `src/scheduler/jobs.ts` (MODIFY, ~5 LOC cron registration)
   - File: `src/domain/services/marketContextBuilder.ts` (VERIFY, no change needed likely)
   - File: `src/scheduler/briefings/eveningSummaryJob.ts` (MODIFY, ~20 LOC FR-3 banner)
   - Status: GREEN (tests pass, type check clean)

3. **TASK-229c (Investigation)**: VPS pipeline diagnostics + fallback assessment
   - Outputs: `docs/FALLBACK_INVESTIGATION.md` (optional, for future sprint)
   - Verify `docs/ARCHITECTURE.md#VPS-Proxy` section accuracy
   - Check if CafeF RSS or HNX API accessible from France (for FR-4 feasibility)
   - Output: Decision document (fallback not feasible / feasible with X constraints)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Cooldown too strict (user sees stale >6h before alert fires) | Low | Medium | Cron runs every 10 min during market hours; worst-case 10 min lag to first alert |
| False alerts on brief lulls / network jitter | Low | Low | 6h threshold is 40+ missed pushes (VPS pushes every ~5-10 min); brief lulls won't trigger |
| Timestamp parsing fails (corrupted ISO string in DB) | Low | Medium | `new Date()` returns NaN; detected as age=Infinity; alert fires (correct behavior) |
| Concurrent alerts on simultaneous VPS + MCP restart | Very Low | Low | Async independent channels; no race condition |
| Market hours UTC boundary confusion | Very Low | Medium | Test cases cover edge times (01:59, 02:00, 08:59, 09:00 UTC) |
| Off-hours alerts fire on weekends | Very Low | Low | `isVnMarketHoursUtc()` checks both day (Mon-Fri) and hour (2-8 UTC) |

---

## Security Review

- [x] SQL parameterized? Yes — `readLatestPriceTimestamp()` uses `db.query()` with no user input
- [x] File paths validated? N/A — no file I/O, only DB reads
- [x] External HTTP rate-limited? N/A — no HTTP calls; only Telegram sends via existing `sendTelegramWork()` + `sendTelegramMarket()`
- [x] Secrets via `Bun.env` only? Yes — Telegram channel IDs injected via existing notifiers
- [x] No console spam? Yes — logging via `logger.warn()` only on state changes

---

## DDD Invariants (Pre-Check)

1. **marketContextBuilder.ts** — No infrastructure imports ✓ (only `Database` parameter, `bun:sqlite` type)
2. **priceUpdateWatchdogJob.ts** — Scheduler layer; imports allowed from domain + infrastructure ✓
3. **eveningSummaryJob.ts** — Scheduler layer; imports allowed from domain + application ✓
4. **Cross-layer**: No inward violation (domain ← application ← interface ← scheduler) ✓

---

## Test Strategy

All three modified functions must support dependency injection:

**FR-1 Watchdog**:
```typescript
await priceUpdateWatchdog({
  now: new Date("2026-04-21T05:00:00Z"),
  readPrice: () => new Date("2026-04-20T22:00:00Z"),  // 7h old
  notify: async (msg) => { /* mock */ },
  notifyUser: async (msg) => { /* mock */ },
});
```

**FR-2 Context** (already testable):
```typescript
const context = buildWatchlistSection(mockDb);
// Verify [STALE] flag appears in output when price >24h old
```

**FR-3 Evening Summary** (to be testable):
```typescript
const lines = formatEveningSummaryLines({
  watchlistMovers: [],
  topStories: [],
  lastPriceUpdate: "2026-04-20T12:00:00Z",  // 8h old
  lastNewsUpdate: "2026-04-20T11:00:00Z",   // 9h old
  // ... other fields
});
// Verify crisis banner appears
```

---

## Implementation Notes for Developer

1. **File location**: `src/scheduler/market-data/priceUpdateWatchdogJob.ts` (market-data-specific subfolder, not root scheduler/).
2. **Cron schedule**: `*/10 2-8 * * 1-5` (every 10 min, Mon-Fri, UTC 02:00-08:59).
3. **Existing pattern reference**: Study `/src/scheduler/vpsProxyWatchdogJob.ts` lines 1–296 for recovery + dual-channel alert logic.
4. **Telegram routing**:
   - WORK alerts → `sendTelegramWork()` (operator diagnostics)
   - MARKET alerts → `sendTelegramMarket()` (user message)
5. **Module state**: `lastAlertAt` + `lastWasStale` module-level variables for cooldown + recovery tracking. Reset functions exported for test isolation.
6. **Evening summary inputs**: `EveningSummary` interface needs `lastPriceUpdate` + `lastNewsUpdate` fields. Add in `assembleEveningSummary()` use case (lightweight MAX queries).
7. **No hotfix for FR-4** (fallback investigation): Mark as OUT_OF_SCOPE for this sprint. Task-229c is investigation only.

---

## Acceptance Criteria (QA)

- [x] AC-1: Watchdog detects price staleness >6h during market hours → fires alert
- [x] AC-2: Watchdog respects 30-min cooldown (no alert spam)
- [x] AC-3: Off-hours guard prevents false alerts outside VN market hours
- [x] AC-4: Recovery message fires when data restores
- [x] AC-5: Watchlist context flags stale prices >24h old
- [x] AC-6: Evening summary detects data crisis + appends banner
- [x] AC-7: All tests pass with dependency injection; no external service calls

---

## Definition of Done

1. Test file `src/__tests__/229-price-staleness-watchdog.test.ts` RED → GREEN
2. `src/scheduler/market-data/priceUpdateWatchdogJob.ts` implemented (~150 LOC)
3. `src/scheduler/jobs.ts` updated with cron registration (~5 LOC)
4. `src/scheduler/briefings/eveningSummaryJob.ts` updated with FR-3 banner (~20 LOC)
5. `docs/ARCHITECTURE.md` section "VPS Proxy" updated to mention 6h price-staleness watchdog role
6. `docs/data/cron-registry.json` incremented (scheduler count +1)
7. `bun test` suite green (all existing + new tests pass)
8. `bun tsc --noEmit` clean (no type errors)
9. Manual Telegram verification: WORK + MARKET alerts fire during mock outage scenario
10. No console spam; proper logging via `logger.*`

---

## Reference Materials

- **Existing VPS watchdog pattern**: `/src/scheduler/vpsProxyWatchdogJob.ts` (lines 1–296)
  - Multi-source staleness detection
  - Dual-channel alert (WORK + MARKET)
  - Cooldown + recovery logic
  - Testable via dependency injection
- **Existing OHLCV staleness check**: `/src/scheduler/market-data/ohlcvStalenessCheckJob.ts` (reference pattern)
- **Evening summary formatter**: `/src/scheduler/briefings/eveningSummaryJob.ts` (lines 180–270)
- **Market context builder**: `/src/domain/services/marketContextBuilder.ts` (lines 148–192)
- **Architecture VPS section**: `/docs/ARCHITECTURE.md` (section to update)
