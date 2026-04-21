# TECH-239: Fix Macro Indicator Freshness + Daily Refresh Enforcement

**status:** DRAFT
**req_ref:** (BA pending)

---

## Brownfield Impact

**Files modified:**
- `src/infrastructure/db/schema-macro.ts` — macro_indicators table already exists (CPI, GDP, interest rate, unemployment, inflation, trade balance, current account, govt debt, budget deficit, manufacturing PMI, consumer confidence, retail sales); add `last_refresh_job` TEXT for SLA tracking
- `src/interface/mcp/server.ts` — VPS push endpoints (/api/push-tradingeconomics, /api/push-gso) already exist; already write to macro_indicators
- `docs/data/cron-registry.json` — add macroIndicatorRefreshJob entry

**Files created:**
- `src/domain/services/macro/macroIndicatorFetcher.ts` — NEW domain service: multi-source fallback (Yahoo → SBV → GSO) + circuit breaker integration
- `src/scheduler/macro/macroIndicatorRefreshJob.ts` — NEW: daily refresh scheduler with SLA validation + stale-data escalation
- `src/__tests__/239-macro-indicator-refresh.test.ts` — NEW: TDD RED → GREEN test suite

**Files deleted:** none

**Breaking changes:** no. Pure additive: new scheduler file + domain service, existing DB + endpoints unchanged.

---

## Architecture Decision

**Root cause:** `fetchMacroIndicators()` in `tradingEconomics.ts` was built as a one-off scraper (Task 024) without scheduled refresh. The macro_indicators table has been stale since 2025-03-01 (400+ days) because no job calls `fetchMacroIndicators()` + `storeMacroIndicators()` daily. Financial Analyst (02) + Market Watcher (04) in the Cowork layer depend on fresh macro data for macro-impact cascade rules but receive null fields.

**Design choice:** Implement a dedicated daily refresh job that:
1. Attempts three sources in sequence: Yahoo Finance (real-time web), SBV rates API (via VPS), GSO macro feed (via VPS push endpoint)
2. Falls back on source failure — if Yahoo fails, try SBV; if SBV fails, try GSO
3. Logs which source succeeded + column count to WORK channel
4. Validates freshness SLA post-refresh (data age ≤ 24 hours) and escalates if violated
5. Records refresh attempt in new `last_refresh_job` column for observability

This fits the modular monolith pattern: domain service (no I/O) defines fallback logic, scheduler wraps it, infrastructure handles HTTP + circuit breaker.

---

## DDD Layer Plan

| Component                      | Layer          | File Path                                          | New/Modify | Depends On                                  |
| ------------------------------ | -------------- | -------------------------------------------------- | ---------- | ------------------------------------------- |
| MacroSourceFetcher             | domain         | src/domain/services/macro/macroIndicatorFetcher.ts | NEW        | rateLimiter, timeConstants, vnNumberParser  |
| macroIndicatorRefreshJob       | scheduler      | src/scheduler/macro/macroIndicatorRefreshJob.ts    | NEW        | MacroSourceFetcher, freshnessSlaChecker     |
| macro_indicators + SLA column  | infrastructure | src/infrastructure/db/schema-macro.ts              | MODIFY     | (existing table, just +1 column)            |
| cron registry metadata         | volatile       | docs/data/cron-registry.json                       | MODIFY     | (add job entry)                             |

---

## Interface Contracts

### New domain service

```typescript
// src/domain/services/macro/macroIndicatorFetcher.ts

/**
 * Multi-source macro indicator fetcher with fallback chain.
 * Attempts Yahoo → SBV → GSO in sequence.
 * @returns { success: boolean; sourceUsed: string; indicatorCount: number; error?: string }
 */
export async function fetchAndStoreMacroIndicators(): Promise<FetchResult>;

export interface FetchResult {
  success: boolean;
  sourceUsed: "yahoo" | "sbv" | "gso" | null;
  indicatorCount: number;
  fetchedAt: string;
  error?: string;
}
```

### Schema update

```sql
-- Add column to track last refresh job attempt
ALTER TABLE macro_indicators ADD COLUMN last_refresh_job TEXT;
-- Example: "2026-04-21T08:15:30Z — yahoo (3 cols)"
```

### SLA validation (existing domain service)

Reuse existing `freshnessSlaChecker.ts`:
```typescript
import { checkDataFreshnessSla } from "../freshnessSlaChecker.js";

const isStale = !checkDataFreshnessSla("macro", 24 * 60); // 24h SLA
```

---

## Task Breakdown (for PM)

Suggested atomic tasks in dependency order:

1. **239a** — TDD RED: `239-macro-indicator-refresh.test.ts` with 10+ AC assertions
   - AC-1: mock Yahoo fetch success → 3 indicators stored
   - AC-2: Yahoo timeout → fallback to SBV
   - AC-3: SBV 401 → fallback to GSO
   - AC-4: all sources fail → return success=false, sourceUsed=null
   - AC-5: SLA check: data age ≤ 24h → passes
   - AC-6: SLA check: data age > 24h → escalate to WORK channel
   - AC-7: `last_refresh_job` column persists source + count
   - AC-8: circuit breaker wraps HTTP calls (no naked fetches)
   - AC-9: rate limiter called before each source attempt
   - AC-10: stale macro data detected on startup → alert on morningBriefing

2. **239b** — Diagnosis + GREEN: macroIndicatorFetcher.ts implementation + job scheduler
   - Implement fallback chain: try Yahoo HTTP GET, catch timeout/non-2xx → SBV
   - Implement SBV via VPS proxy (POST to /api/push-sbv or read sbv_rates table)
   - Implement GSO via VPS proxy (POST to /api/push-gso endpoint)
   - Add circuit breaker wrapper (reuse `circuitBreakerRegistry.ts`)
   - Add rate limiter call (reuse `rateLimiter.ts`)
   - Store result + source in macro_indicators.last_refresh_job
   - Call SLA checker; if stale, send WORK alert with age in hours
   - Implement macroIndicatorRefreshJob.ts: cron daily 06:00 GMT+7 (before morningBriefing 08:00)

3. **239c** — Integration: schema + registry updates + VPS coordination
   - Add `last_refresh_job TEXT` column to macro_indicators (schema-macro.ts)
   - Add cron registry entry: schedule "0 6 * * * (06:00 VN daily)", desc "Macro indicator daily refresh with SLA validation"
   - Update docs/data/cron-registry.json: schedulerFileCount → 38, append job object
   - Verify VPS endpoints `/api/push-sbv` + `/api/push-gso` are ready (already in server.ts)
   - Add morningBriefing dependency: if macro stale, prepend warning to briefing

4. **239d** — QA verification: refresh job execution audit + SLA enforcement
   - Smoke test: run job manually, verify `last_refresh_job` written
   - Verify WORK channel receives refresh status + source + column count
   - Verify SLA alert fires when data > 24h stale
   - Verify circuit breaker logs when source goes down
   - Verify fallback: kill Yahoo in test, confirm SBV is tried + succeeds
   - Verify morningBriefing includes macro section (should now be populated, not null)

---

## Risk Assessment

| Risk                                              | Probability | Impact | Mitigation                                                                                         |
| ------------------------------------------------- | ----------- | ------ | -------------------------------------------------------------------------------------------------- |
| Yahoo Finance HTML structure changes             | Medium      | High   | Abstract scraper behind domain service; unit-test with fixtures + monitor for parse errors        |
| VPS endpoints /api/push-sbv or /api/push-gso offline | Low       | High   | Implement health check in vpsProxyWatchdog; SLA checker escalates if all sources unavailable      |
| HTTP timeout cascades (all 3 sources slow)       | Low         | Medium | Set aggressive timeouts (5s per source, total 15s max), log each timeout, continue to next        |
| Circular dependency: morningBriefing calls macro refresh | Low  | High   | Run refresh job at 06:00 (2 hours BEFORE morning briefing 08:00); briefing reads cached result    |
| WAL checkpoint blocks refresh (db locked)        | Low         | Medium | Add database busy retry (3 attempts, 100ms backoff) in refresh job                               |

---

## Security Review

- **SQL parameterized?** Yes — INSERT OR REPLACE uses ? placeholders
- **File paths validated?** N/A — no file I/O in macro fetcher
- **External HTTP rate-limited?** Yes — all three sources call `rateLimiter.checkLimit()` before fetch
- **Secrets via Bun.env only?** Yes — VPS_PUSH_API_KEY used in /api/push endpoints (already in server.ts)

---

## Implementation Notes

### Why 06:00 GMT+7 (before 08:00 morning briefing)?
- Market opens 09:00 GMT+7
- Morning briefing runs 08:00 GMT+7 — by then macro data should be fresh (fetched within last 2 hours)
- SLA window: 24 hours — even if last refresh was yesterday, data is fresh enough for briefing

### Why fallback chain (Yahoo → SBV → GSO)?
- **Yahoo**: fastest, real-time, no authentication. Downside: HTML scraping fragile.
- **SBV**: official VN central bank rates. Slower (API call to Vietnam), but authoritative. Requires VPS proxy.
- **GSO**: General Statistics Office (GSO), quarterly macro releases. Fallback of last resort; data may lag 30+ days but better than null.

### Why `last_refresh_job` TEXT (not a separate table)?
- Single row per country (UNIQUE constraint) → no need for separate history table
- Text field (e.g., "2026-04-21T06:05:12Z — yahoo (3 cols)") is human-readable for debugging
- If full audit trail needed in future, add `macro_refresh_history` table (separate task)

---

## Testing Strategy

**RED phase (239a):**
- Mock three HTTP clients (Yahoo, SBV, GSO) with inject pattern (like tradingEconomics.ts)
- Mock circuit breaker + rate limiter as stubs
- Test each AC assertion in isolation: success paths, fallback paths, error paths, SLA checks

**GREEN phase (239b):**
- Implement real fetch logic with actual HTTP (but wrapped in circuit breaker)
- Use Bun's built-in HTTP client (already used in ssc.ts, hose.ts)
- Test against live Yahoo endpoint in staging (or mock if cannot reach)
- Test SBV + GSO via VPS proxy endpoints

**Integration phase (239c):**
- Run full cron job in test DB
- Verify schema migration (ALTER TABLE succeeds)
- Verify registry JSON is valid and count increments

**QA phase (239d):**
- Smoke test in production environment
- Monitor WORK channel for refresh status messages
- Verify morningBriefing displays macro values (no more nulls)
