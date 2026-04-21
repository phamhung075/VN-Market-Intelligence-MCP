# TECH-240: Price Pipeline Recovery + Data Freshness Enforcement

**Status:** APPROVED_BY_ARCHITECT
**Req Ref:** REQ-240
**Sprint:** 240
**Date:** 2026-04-21

---

## Brownfield Impact

| Category | Details |
|----------|---------|
| **Files Modified** | src/scheduler/jobs.ts:670 (wrap watchdog in recordJobRun) |
| **Files Modified** | src/scheduler/market-data/priceUpdateWatchdogJob.ts (add SSH restart + escalation) |
| **Files Modified** | src/application/usecases/assembleBriefing.ts (add freshness gate before send) |
| **Files Modified** | src/application/usecases/assembleEveningSummary.ts (add freshness gate before send) |
| **Files Created** | src/domain/services/priceBackfillService.ts (NEW — backfill logic) |
| **Breaking Changes** | No |

**Context:**
- priceUpdateWatchdogJob already exists (Sprint 229) with 6h staleness detection + cooldown + market-hours guard
- Existing SSH-free architecture: VPS watchdog is observe-only (jobs.ts comment: `vpsProxyWatchdogJob.ts observe-only`)
- assembleBriefing.ts + assembleEveningSummary.ts exist; both send to MARKET channel via `sendTelegram(channel="market")`
- resilientFetcher pattern (Sprint 232) provides fallback orchestration template
- macroIndicatorSla.ts pattern (Sprint 239) demonstrates SLA freshness check + escalation

---

## Architecture Decision

**Problem:** market_prices stale 25 days → briefings show 0 alerts, 0 movers, 0 stories. Pipeline halt undetected.

**Solution:** Four-part recovery:

1. **NEW priceBackfillService** (domain) — pure logic for backfilling 25-day gap using fallback chain (cache → Yahoo → skip)
2. **ENHANCE watchdog** (scheduler) — detect stale during market hours → attempt SSH restart (systemctl) + send dual-channel alerts (WORK + MARKET) + cooldown
3. **ADD freshness gates** (application) — before sending briefing to MARKET, check max(updated_at) in market_prices; if >24h stale, suppress send, alert WORK
4. **WRAP watchdog in recordJobRun()** (scheduler) — consistent job execution logging per Sprint 234 pattern

**Rationale:**
- Backfill is domain logic (no DB/SSH direct); resilientFetcher pattern proven (Sprint 232)
- Watchdog enhancement reuses existing flow (priceReader DI already in place); SSH wrapper minimal
- Freshness gate mirrors macroIndicatorSla.ts pattern (30-sec query + age calc + escalation)
- recordJobRun wrapping ensures observability (matches vpsHealthPollerJob pattern)

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify | Reason |
|-----------|-------|-----------|------------|--------|
| **priceBackfillService** | domain | src/domain/services/priceBackfillService.ts | NEW | Pure backfill orchestration: fallback chain, dedup logic, error handling. No DB/HTTP calls directly. |
| **SSH restart helper** | infrastructure | (inline in priceUpdateWatchdogJob) | MODIFY | SSH systemctl command wrapper (minimal, <20 lines). Kept local to watchdog (not reusable). |
| **watchdog escalation** | scheduler | src/scheduler/market-data/priceUpdateWatchdogJob.ts | MODIFY | Add SSH restart attempt + dual-channel alerts (WORK + MARKET) + escalation fallback. |
| **watchdog recordJobRun wrapper** | scheduler | src/scheduler/jobs.ts:670 | MODIFY | Wrap priceUpdateWatchdog call in recordJobRun() for consistent logging. |
| **freshness gate** | application | src/application/usecases/assembleBriefing.ts | MODIFY | Query max(updated_at), check age, suppress send if >24h. Persist JSON always. |
| **freshness gate** | application | src/application/usecases/assembleEveningSummary.ts | MODIFY | Mirror of assembleBriefing gate. |

---

## Interface Contracts

### Domain Service: priceBackfillService

**File:** `src/domain/services/priceBackfillService.ts`

```typescript
export interface BackfillResult {
  tickersProcessed: number;        // How many tickers attempted
  rowsInserted: number;             // Total rows inserted
  rowsSkipped: number;              // Rows detected as duplicate + skipped
  errors: Array<{
    ticker: string;
    reason: string;                 // "yahoo-timeout" | "no-data" | "validation-error"
  }>;
  firstInsertedAt: Date;            // Earliest insert timestamp (source='backfill')
  lastInsertedAt: Date;             // Latest insert timestamp
  insertedAt: string;               // ISO timestamp when backfill ran
}

/**
 * Backfill market_prices table for a date range.
 * Fallback chain: local cache → Yahoo Finance API → skip ticker.
 * Idempotent: skips duplicates by (ticker, date, source).
 *
 * @param db SQLite database
 * @param dateRange { start, end } — ISO date strings (e.g., "2026-03-27")
 * @param tickers List of stock tickers (e.g., ["VNM", "FPT", "VCB"])
 * @returns BackfillResult with counts + errors
 */
export async function backfillPrices(
  db: Database,
  dateRange: { start: string; end: string },
  tickers: string[],
): Promise<BackfillResult>;
```

**Key behaviors:**
- No direct Yahoo calls; uses resilientFetcher (reuse Sprint 232 pattern)
- Detects duplicates via UNIQUE(ticker, date, source)
- Validates OHLCV: High ≥ Close ≥ Low ≥ 0, Volume > 0
- Timestamp all inserts with inserted_at = NOW (2026-04-21)
- Sets source='backfill' to distinguish from live pushes
- If Yahoo timeout → circuit breaker + skip ticker
- Returns detailed counts + error array for logging

### Application Layer: Freshness Gate

**Files:** `src/application/usecases/assembleBriefing.ts` + `assembleEveningSummary.ts`

```typescript
/**
 * Check if market_prices data is fresh enough to send briefing.
 * Returns true if max(updated_at) ≤ 24h old, false if stale.
 */
async function isPriceFresh(db: Database): Promise<boolean> {
  const row = db
    .prepare("SELECT MAX(updated_at) as latest FROM market_prices")
    .get() as { latest: string | null } | undefined;

  if (!row?.latest) {
    return false;  // No data at all
  }

  const ageMs = Date.now() - new Date(row.latest).getTime();
  const ageHours = Math.round(ageMs / (1000 * 60 * 60));

  if (ageHours > 24) {
    logger.warn(`[freshness-gate] prices stale ${ageHours}h, suppressing briefing send`);
    return false;
  }

  return true;
}

// Before: await sendTelegram(channel="market", briefingText);
// After:
const isFresh = await isPriceFresh(db);
if (!isFresh) {
  // Still persist for debugging
  writeBriefingToFile(briefing);
  // Alert dev team
  await sendTelegram(channel="work",
    `[FRESHNESS GATE] Briefing suppressed. Last price update: ${row?.latest}`);
  return;  // Do NOT send to MARKET
}
await sendTelegram(channel="market", briefingText);
```

### Scheduler: watchdog recordJobRun Wrapper

**File:** `src/scheduler/jobs.ts:670`

```typescript
// Before:
cron.schedule(CRONS.priceUpdateWatchdog, async () => {
  const result = await priceUpdateWatchdog()
  if (result !== "ok" && result !== "off-hours" && result !== "cooldown") {
    log(`[price-watchdog] ${result}`)
  }
}, { timezone: 'UTC' })

// After:
cron.schedule(CRONS.priceUpdateWatchdog, async () => {
  await recordJobRun(getDb(), 'price-update-watchdog', async () => {
    const result = await priceUpdateWatchdog()
    if (result !== "ok" && result !== "off-hours" && result !== "cooldown") {
      log(`[price-watchdog] ${result}`)
    }
  })
}, { timezone: 'UTC' })
```

### Scheduler: watchdog SSH Restart + Escalation

**File:** `src/scheduler/market-data/priceUpdateWatchdogJob.ts:37`

**Enhancement to priceUpdateWatchdog():**

```typescript
// Add near line 37 (after off-hours guard):

// Stale path: attempt SSH restart
if (priceAgeMs > STALE_THRESHOLD_MS && now.getTime() - lastAlertAt >= ALERT_COOLDOWN_MS) {
  lastAlertAt = now.getTime();
  lastWasStale = true;

  // Attempt SSH restart (optional, best-effort)
  let restartStatus = "unknown";
  try {
    const sshCmd = `ssh root@${process.env.VINAHOST_IP} systemctl restart vn-price-fetch.service`;
    // Use exec with 30s timeout
    restartStatus = await executeWithTimeout(sshCmd, 30000);
  } catch (err) {
    logger.error("[price-watchdog] SSH restart failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    restartStatus = "failed";
  }

  // Send WORK alert (diagnostic)
  const workMessage =
    `[PRICE STALENESS] VN prices >6h old (last: ${latestPrice?.toISOString()}).\n` +
    `Restart attempt: ${restartStatus === "running" ? "SUCCESS" : "FAILED"}\n` +
    `Manual check: ssh root@$VINAHOST_IP systemctl status vn-price-fetch`;

  try {
    await sendTelegramWork(workMessage);
  } catch (err) {
    logger.warn("[price-watchdog] WORK alert send failed");
  }

  // Send MARKET alert (user-facing)
  const marketMessage = `[Market Data Alert] Prices updating. Will resume shortly.`;
  try {
    await sendTelegramMarket(marketMessage);
  } catch (err) {
    logger.warn("[price-watchdog] MARKET alert send failed");
  }

  return "alert-sent";
}
```

---

## Task Breakdown

**Atomic tasks in dependency order:**

| ID | Title | Layer | Dependencies | Notes |
|-------|--------|-------|--------------|-------|
| 240a | RED: backfill + watchdog + gate tests | test | REQ-240 | TDD: test file + 12+ assertions |
| 240b | GREEN: priceBackfillService impl | domain | 240a | ~200 lines, resilientFetcher reuse |
| 240c | GREEN: watchdog SSH + escalation | scheduler | 240a, resilientFetcher✓ | ~60 lines, DI pattern |
| 240d | GREEN: freshness gates in briefing/evening | application | 240a, 240b | ~40 lines total, mirrors macroSla |
| 240e | Integration: jobs.ts recordJobRun wrap | scheduler | 240c | ~5 lines |
| 240f | QA smoke test: live flow + briefing check | qa | 240a-240e | Market hours + offline verification |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Yahoo API rate limit during backfill | Medium | Medium | resilientFetcher circuit breaker + exponential backoff already in place; gracefully skip on exhaustion |
| Duplicate (ticker, date, source) inserts corrupt history | High | High | Add UNIQUE constraint during migration; INSERT OR IGNORE pattern in backfill |
| SSH restart times out, watchdog hangs | Medium | Medium | 30s timeout wrapper; if hung, escalate to WORK + move on (no blocking) |
| Freshness gate suppresses legitimate briefings | Low | Low | Only suppress if age > 24h; if prices updating live, gate passes; JSON persisted for debugging |
| Watchdog cooldown hides recurring failures | Low | Low | 30-min cooldown reasonable for market-hours; each cooldown expiry retries |
| priceBackfillService not called (backfill forgotten) | Medium | High | Document in SPRINT_GOAL.md; add manual task 240a ops checklist to run backfill once at sprint start |

---

## Security Review

- **SQL injection:** ✓ Parameterized bindings used in all queries (existing schema)
- **File path traversal:** ✓ No file paths from user input; JSON output to ./data/briefings/
- **SSH command injection:** ⚠️ Using hardcoded systemctl cmd + env var `$VINAHOST_IP`; no user input in SSH string
- **Secrets via Bun.env:** ✓ `VINAHOST_IP` and SSH key via env only
- **Rate limiting:** ✓ resilientFetcher circuit breaker in place (Sprint 232)
- **HTTP timeouts:** ✓ 30s timeout on SSH exec, 180s total timeout on resilientFetcher

---

## Testing Strategy (TDD)

### Test File: `src/__tests__/240-price-pipeline-recovery.test.ts`

**RED Phase (acceptance criteria):**

```typescript
describe("SPRINT 240: Price Pipeline Recovery", () => {
  describe("AC-1: Backfill Service", () => {
    test("backfillPrices inserts ≥500 rows for 25-day × 200+ tickers", async () => {
      // Mock resilientFetcher to return Yahoo data
      // Call backfillPrices(db, dateRange, tickers)
      // Assert result.rowsInserted ≥ 500
      // Assert all rows have source='backfill' + inserted_at >= 2026-04-20
    });

    test("backfillPrices skips duplicates by (ticker, date, source)", async () => {
      // Insert seed row: (VNM, 2026-03-27, backfill)
      // Call backfillPrices with same data
      // Assert result.rowsSkipped ≥ 1
    });

    test("backfillPrices validates OHLCV: High ≥ Close ≥ Low ≥ 0", async () => {
      // Mock Yahoo return invalid OHLCV
      // Assert ticker skipped + error in result.errors
    });

    test("backfillPrices uses resilientFetcher fallback if Yahoo fails", async () => {
      // Mock Yahoo timeout → fallback cache returns data
      // Assert result.rowsInserted > 0 + source includes fallback
    });
  });

  describe("AC-2: Watchdog SSH Restart + Escalation", () => {
    test("watchdog detects staleness >6h during market hours", async () => {
      // Stub readPrice to return 8h-old timestamp
      // Call priceUpdateWatchdog(now=market-hours)
      // Assert result includes "alert-sent" or "restart"
    });

    test("watchdog attempts SSH restart systemctl restart vn-price-fetch", async () => {
      // Mock SSH exec
      // Stub readPrice 8h stale
      // Assert SSH command executed
    });

    test("watchdog sends WORK alert with diagnostics", async () => {
      // Mock sendTelegramWork
      // Stub staleness
      // Assert sendTelegramWork called with message including last price + SSH cmd
    });

    test("watchdog sends MARKET alert to user", async () => {
      // Mock sendTelegramMarket
      // Stub staleness
      // Assert sendTelegramMarket called with "[Market Data Alert]..." message
    });

    test("watchdog respects 30-min cooldown (no repeat alerts)", async () => {
      // Call watchdog 3x within 30 min, staleness ↑
      // Assert result="alert-sent" once, then "cooldown" twice
    });
  });

  describe("AC-3: Freshness Gate in Briefing", () => {
    test("assembleBriefing skips MARKET send if prices >24h stale", async () => {
      // Set market_prices.updated_at to 2026-03-27 (25 days old)
      // Mock sendTelegram
      // Call assembleBriefing
      // Assert sendTelegram(channel="market") NOT called
      // Assert sendTelegram(channel="work") called with freshness warning
    });

    test("freshness gate persists JSON even if suppressed", async () => {
      // Stub stale prices
      // Call assembleBriefing
      // Assert briefing JSON written to ./data/briefings/YYYY-MM-DD.json
    });

    test("assembleBriefing sends MARKET if prices fresh (≤24h old)", async () => {
      // Set market_prices.updated_at to 2h ago
      // Call assembleBriefing
      // Assert sendTelegram(channel="market") called
    });
  });

  describe("AC-4: Freshness Gate in Evening Summary", () => {
    test("assembleEveningSummary skips MARKET send if prices >24h stale", async () => {
      // Mirror of AC-3 but for eveningSummary
    });

    test("assembleEveningSummary sends MARKET if prices fresh", async () => {
      // Mirror of AC-3 but for eveningSummary
    });
  });

  describe("AC-5: Watchdog recordJobRun Integration", () => {
    test("priceUpdateWatchdog wrapped in recordJobRun at jobs.ts:670", async () => {
      // Mock getDb() + recordJobRun
      // Trigger cron job
      // Assert recordJobRun called with 'price-update-watchdog' + result logged
    });
  });
});
```

**Coverage target:** ≥90% of new domain logic (priceBackfillService + freshness gate helpers).

---

## Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| market_prices rows ≥500 with updated_at >= 2026-04-20 | ✓ | `SELECT COUNT(*) FROM market_prices WHERE inserted_at >= '2026-04-20'` |
| Evening briefing shows ≥3 watchlist movers with recent prices | ✓ | Manual 2026-04-21 evening JSON + telegram check |
| VN Index price ≤1 day stale in briefing | ✓ | `briefing.vnIndex.fetchedAt` within 24h of NOW |
| Briefing freshness gate logs suppression (if stale) | ✓ | `grep "freshness-gate" logs/ \| grep -E "STALE\|OK"` |
| Watchdog escalates to WORK + MARKET on staleness >6h | ✓ | Trigger stale condition, verify dual-channel messages in Telegram history |
| No duplicate (ticker, date, source) tuples in market_prices | ✓ | `SELECT COUNT(*) FROM market_prices GROUP BY ticker, date, source HAVING COUNT(*) > 1` = 0 |

---

## Implementation Notes

### 1. priceBackfillService Design

- **No DB imports directly.** Pass `db: Database` as parameter.
- **Use resilientFetcher from Sprint 232.** Reuse fallback chain: Yahoo → cache file → exhausted.
- **Idempotency:** INSERT OR IGNORE on (ticker, date, source) unique constraint.
- **Error collection:** Don't throw on single ticker failure; collect in result.errors array, continue.
- **Timestamp:** All inserts use `inserted_at = NOW()` (Bun `Date.now()`); `source='backfill'`.
- **Logging:** Log each ticker processed + row count + errors to logger (info level).

### 2. SSH Restart Wrapper

- **Timeout:** 30s max for `systemctl restart` command.
- **No blocking:** If SSH fails, log + escalate to WORK, continue (don't halt watchdog).
- **Command:** `ssh root@$VINAHOST_IP systemctl restart vn-price-fetch.service`
- **Check beforehand:** Query DB for latest price timestamp; only attempt restart if stale.

### 3. Freshness Gate Location

In both `assembleBriefing.ts` and `assembleEveningSummary.ts`:
- **After** briefing object is fully assembled
- **Before** `sendTelegram(channel="market")`
- **Query:** `SELECT MAX(updated_at) FROM market_prices`
- **Age calc:** `ageHours = (NOW - maxUpdatedAt) / 3600000`
- **Threshold:** 24 hours
- **Suppress:** If ageHours > 24, skip send, alert WORK, persist JSON

### 4. recordJobRun Wrapping

- Existing pattern in Sprint 234 (vpsHealthPollerJob, macroIndicatorJob)
- Wraps job execution to record start time, end time, status in job_runs table
- Keep existing logging inside; just add wrapper around the call

---

## References

- **Sprint 229:** Price Staleness Watchdog (baseline watchdog implementation)
- **Sprint 232:** Resilient Fetcher + Fallback Chains (resilientFetcher pattern, circuit breaker)
- **Sprint 234:** VPS Health SLA + Data Freshness SLA (freshnessSlaChecker pattern, recordJobRun)
- **Sprint 239:** Macro Indicator Refresh (similar domain service pattern)
- **ARCHITECTURE.md:** DDD layers, VPS proxy design, recordJobRun wrapper
- **REQ-240:** Full requirement spec (input to this design)
