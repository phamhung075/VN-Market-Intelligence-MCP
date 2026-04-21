# Task Context — 240b: GREEN — backfill service + watchdog escalation + freshness gates

## TLDR (read this first)
change: CREATE priceBackfillService.ts | MODIFY watchdog + briefing/evening gates
test: 240a test suite passes + ≥90% coverage of new code
branch: task/240b-green-impl
depends: 240a ✓
knowledge_needed: [resilientFetcher-pattern, TECH-240, dev-standards]

---

**sprint:** 240
**branch:** task/240b-green-impl
**status:** todo (after 240a done)
**req_ref:** REQ-240
**tech_ref:** TECH-240

---

## [PM] Planning Context

**layer:** domain + application + scheduler

**depends_on:** [240a ✓ test suite merged]

**files_to_read:**
- `/absolute/path/to/docs/TECH_240.md` — architecture decision + interface contracts (lines 49–223)
- `/absolute/path/to/src/domain/services/resilientFetcher.ts` — fallback chain pattern (Sprint 232)
- `/absolute/path/to/src/domain/services/macroIndicatorFetcher.ts` — reference domain service (Sprint 239)
- `/absolute/path/to/src/scheduler/market-data/priceUpdateWatchdogJob.ts` — existing watchdog to enhance
- `/absolute/path/to/src/application/usecases/assembleBriefing.ts` — where to add freshness gate
- `/absolute/path/to/src/application/usecases/assembleEveningSummary.ts` — where to add freshness gate

**files_to_create:**
- `/absolute/path/to/src/domain/services/priceBackfillService.ts` — NEW: backfill orchestration (200 lines)

**files_to_modify:**
- `/absolute/path/to/src/domain/services/index.ts` — add barrel export for priceBackfillService
- `/absolute/path/to/src/scheduler/market-data/priceUpdateWatchdogJob.ts` — add SSH restart + escalation (60 lines)
- `/absolute/path/to/src/application/usecases/assembleBriefing.ts` — add freshness gate before send
- `/absolute/path/to/src/application/usecases/assembleEveningSummary.ts` — add freshness gate before send

**acceptance_criteria:**

Given: 240a test suite (RED phase complete)
When: Developer implements priceBackfillService, watchdog SSH/escalation, freshness gates
Then:

- **Domain:** `priceBackfillService.ts` exports `backfillPrices(db, dateRange, tickers): Promise<BackfillResult>`
- **Domain:** Returns { tickersProcessed, rowsInserted, rowsSkipped, errors, firstInsertedAt, lastInsertedAt, insertedAt }
- **Domain:** Uses resilientFetcher for Yahoo API fallback (no direct HTTP calls)
- **Domain:** Detects duplicates via UNIQUE(ticker, date, source) + INSERT OR IGNORE pattern
- **Domain:** Validates OHLCV: High ≥ Close ≥ Low ≥ 0, Volume > 0
- **Domain:** Sets source='backfill' + inserted_at=NOW() on all inserts
- **Scheduler:** watchdog detects staleness >6h during market hours
- **Scheduler:** watchdog attempts SSH systemctl restart (30s timeout, non-blocking)
- **Scheduler:** watchdog sends WORK alert with diagnostics (last price + SSH status + manual check cmd)
- **Scheduler:** watchdog sends MARKET alert to user ("[Market Data Alert] Prices updating...")
- **Scheduler:** watchdog respects 30-min cooldown (no repeat alerts during cooldown period)
- **Application:** `isPriceFresh(db): Promise<boolean>` checks max(updated_at) ≤ 24h old
- **Application:** assembleBriefing suppresses MARKET send if >24h stale, alerts WORK instead
- **Application:** assembleBriefing persists JSON output even if suppressed
- **Application:** assembleEveningSummary mirrors briefing freshness gate behavior
- **All 12+ tests from 240a PASS** with ≥90% coverage
- **Type check:** bun tsc --noEmit = 0 errors

---

## Implementation Notes

### 1. priceBackfillService (domain/services/priceBackfillService.ts)

- No direct DB imports; pass `db: Database` as parameter
- Use resilientFetcher pattern from Sprint 232 (fallback: Yahoo → cache → skip)
- Idempotency: INSERT OR IGNORE on (ticker, date, source) unique constraint
- Error handling: collect errors in array, don't throw on single ticker failure
- Timestamp all inserts with `inserted_at = NOW()`, source='backfill'
- Log each ticker processed (info level)
- Return detailed BackfillResult object

**Reference:** TECH-240 lines 64–106 (interface + key behaviors)

### 2. Watchdog Enhancement (scheduler/market-data/priceUpdateWatchdogJob.ts)

- Add SSH wrapper near line 37 (after off-hours guard)
- SSH timeout: 30s max (use executeWithTimeout helper or similar)
- If SSH fails, log + escalate, don't block watchdog
- Command: `ssh root@${process.env.VINAHOST_IP} systemctl restart vn-price-fetch.service`
- Dual-channel alerts on staleness:
  - WORK: diagnostic message (price age, SSH status, manual check command)
  - MARKET: user-facing message ("[Market Data Alert] Prices updating...")
- Respect existing 30-min cooldown + market-hours guard

**Reference:** TECH-240 lines 175–224 (watchdog enhancement pseudocode)

### 3. Freshness Gates (application/usecases/)

In **assembleBriefing.ts** and **assembleEveningSummary.ts**:
- Query: `SELECT MAX(updated_at) FROM market_prices`
- Calculate age in hours: `(NOW - maxUpdatedAt) / (1000 * 60 * 60)`
- If ageHours > 24:
  - Skip sendTelegram(channel="market")
  - Persist briefing JSON to ./data/briefings/YYYY-MM-DD.json
  - Send WORK alert: `[FRESHNESS GATE] Briefing suppressed. Last price update: ${row?.latest}`
- Else: proceed with normal MARKET send

**Reference:** TECH-240 lines 108–149 (freshness gate pseudocode)

---

## Verification Checklist

- [ ] `src/domain/services/priceBackfillService.ts` created with BackfillResult interface
- [ ] `backfillPrices()` uses resilientFetcher, dedup logic, OHLCV validation
- [ ] `src/domain/services/index.ts` updated with barrel export
- [ ] `priceUpdateWatchdogJob.ts` enhanced with SSH + dual alerts + cooldown logic
- [ ] `assembleBriefing.ts` + `assembleEveningSummary.ts` have freshness gates (isPriceFresh helper)
- [ ] All 12+ tests from 240a PASS
- [ ] bun test output: all passing, ≥90% coverage
- [ ] bun tsc --noEmit = 0 errors
- [ ] Ready for 240c integration

---
