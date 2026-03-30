# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 014

### Goal

Fix the broken alert pipeline and harden the intelligence cycle so that a solo
investor in France actually receives actionable Telegram alerts about their four
Vietnamese stocks — the core promise of the product that has been silently
broken since Sprint 009.

### Scope

**IN**

**P0 — Alert pipeline fix (tasks 137, 138): production is deaf**

The cycle's Step E always passes an empty `alerts` array to `sendAlertsFn`
(line 297 of `intelligenceCycleJob.ts`). This is a structural bug: alerts are
generated inside `pollNews` and written to SQLite, but the cycle never reads
them back before dispatching to Telegram.

- Task 137: Fix Step E — query `alerts` table for HIGH/CRITICAL entries created
  in the current cycle window (last 16 minutes) and pass them to `sendAlertsFn`.
- Task 138: Fix Step D — replace the hardcoded `return 0` placeholder in
  `defaultRunImpactChain` with a real call to `runImpactChain` on the new
  `AnalysisEntry` rows inserted by `pollNews` in step A. Pass entry IDs through
  from the `PollNewsResult`.

**P1 — VN-Index live data (task 139): the market's primary signal is missing**

VnDirect is geo-blocked from France. CafeF banggia only serves stocks, not the
VNINDEX. Without a live index feed the user cannot gauge broad market direction
during the trading session.

- Task 139: Add `fetchVnIndex()` using the CafeF index endpoint
  `https://banggia.cafef.vn/stockhandler.ashx?index=0` (returns VN-Index,
  HNX-Index, UPCOM-Index as separate records). Store as a special row
  `code = "VNINDEX"` in `market_prices`. Expose the current value in
  `get_market_snapshot` MCP tool output.

**P2 — Database WAL checkpoint (task 140): data safety**

The WAL file is 2.5x the main DB. SQLite WAL is designed to checkpoint
automatically at 1000 pages but better-sqlite3 does not trigger this from Bun's
process lifecycle.

- Task 140: Add `db.pragma('wal_checkpoint(PASSIVE)')` called once daily (new
  cron at 03:00 GMT+7) and on graceful server shutdown (`process.on('SIGTERM')`
  / `process.on('SIGINT')`). Add `db.pragma('optimize')` alongside it. No
  schema changes required.

**P3 — Circuit breaker for fetchers (task 136): already planned in Sprint 013**

The VnDirect geo-block exposed that a timed-out fetcher stalls the whole cycle.
The `circuitBreaker` config block already exists in `mcp.config.json`. Wire it
into the three external fetchers (VnDirect, CafeF banggia, SSC) so a source
that trips 5 consecutive failures opens its breaker for 60 seconds before
retrying (half-open probe). This prevents the 30-50s cycle stall when VnDirect
is blocked.

- Task 136 (carried over from Sprint 013): implement `CircuitBreaker` class in
  `src/infrastructure/circuitBreaker.ts`, wrap `fetchHosePrices` (VnDirect
  path), `fetchFromCafef`, and `listSscDocuments`.

**P4 — System health MCP tool (task 141): observability**

The operator (the user) has no programmatic way to check whether the server is
healthy without reading logs. A `get_system_health` tool would allow Claude
Desktop to surface cycle status, DB file sizes, last Telegram send time, and
circuit breaker states on demand.

- Task 141: `src/interface/mcp/tools/systemTools.ts` — register
  `get_system_health` tool that returns: last cycle result, DB file size (bytes),
  WAL file size, LanceDB directory size, last Telegram alert timestamp, circuit
  breaker states per source, server uptime.

**OUT**

- Changes to BCTC PDF parser, ratio computer, or any domain business logic
- New RSS sources beyond the six already wired
- Any changes to MCP tool signatures for watchlist / analysis / reports tools
- Pagination or full parse changes to the SSC Puppeteer scraper
- Telegram group routing or multi-user support
- LLM-driven auto-analysis (deferred indefinitely)

### Success Metrics

1. **Alert pipeline**: given one or more HIGH/CRITICAL alerts in the `alerts`
   table created within the last 16 minutes, `runIntelligenceCycle()` returns
   `telegramAlertsSent >= 1` and the Telegram Bot API receives the corresponding
   `sendMessage` call — verified by unit test with mocked Telegram + seeded DB.

2. **Impact chain**: `impactEventsRan` in `CycleResult` reflects the actual
   number of `runImpactChain` calls processed during step D (not hardcoded 0).
   At least one new news entry in a test scenario produces `impactEventsRan = 1`.

3. **VN-Index**: `fetchVnIndex()` returns a `VnIndexSnapshot` with a non-null
   `value > 0` when called in isolation (mocked CafeF response). The
   `get_market_snapshot` MCP tool response includes a `vnIndex` field.

4. **WAL checkpoint**: after calling the new checkpoint function with a live DB,
   the WAL file size drops to near-zero (verified in integration test using a
   real SQLite file). The SIGTERM handler runs checkpoint before exit.

5. **Circuit breaker**: after 5 simulated VnDirect failures the breaker enters
   OPEN state; `fetchHosePrices` returns `[]` immediately (no HTTP call) until
   the reset timeout elapses, at which point it enters HALF_OPEN and makes
   exactly one probe request.

6. **System health tool**: `get_system_health` returns a JSON object with keys
   `lastCycleResult`, `dbSizeBytes`, `walSizeBytes`, `uptimeSeconds`,
   `circuitBreakers`, `lastTelegramSentAt`. All values are non-null when the
   server has completed at least one cycle.

7. **Full test suite**: `bun test` passes with 0 failures; `bun tsc --noEmit`
   reports 0 errors after all tasks merged.

### Dependency chain

```
137 (fix Step E — read alerts from DB)      — independent
138 (fix Step D — real impact chain)         — independent
  └─ 137 + 138 can run in parallel

139 (VN-Index via CafeF)                     — independent of 137/138
140 (WAL checkpoint)                          — independent, no schema change
136 (circuit breaker)                         — independent; wraps hose.ts + ssc.ts
  └─ 141 (system health tool) — depends on 136 (needs breaker state API)
```

### Sprint task order (recommended)

1. 137 (TDD Red + Green — alert DB read + Step E fix) — P0, fast win
2. 138 (TDD Red + Green — Step D real impact chain) — P0, parallel with 137
3. 139 (TDD Red + Green — VN-Index CafeF fetcher) — P1, parallel
4. 140 (checkpoint job + shutdown hook) — P2, small change
5. 136 (circuit breaker class + wrapping) — P3, foundational
6. 141 (system health MCP tool) — P4, depends on 136

### Key technical decisions (locked at PO level)

- **Alert query window**: Step E reads `alerts` WHERE `created_at >= now - 16min`
  AND severity IN ('high', 'critical') AND `notified_telegram = 0`. Update
  `notified_telegram = 1` after successful send to prevent re-sends on next cycle.
  This requires adding `notified_telegram INTEGER DEFAULT 0` column to `alerts`
  table — migration via `ALTER TABLE IF NOT EXISTS` in `initDatabase()`.
- **Impact chain entry IDs**: `PollNewsResult` gains an optional `insertedIds`
  field (`string[]`). `pollNews` populates it; `intelligenceCycleJob` passes
  those IDs to `runImpactChain`.
- **VN-Index CafeF URL**: `https://banggia.cafef.vn/stockhandler.ashx?index=0`
  returns an array; the record with `a === "VNINDEX"` is extracted.
- **Circuit breaker state**: exported as `CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'`.
  The `CircuitBreaker` class is a simple counter + timestamp, no external dependency.
- **WAL checkpoint pragma**: `db.pragma('wal_checkpoint(PASSIVE)')` — PASSIVE
  mode does not block readers/writers, safe to call from a scheduler job.
- **Telegram `notified_telegram` flag**: avoids double-sending if the server
  restarts between cycles. Critical alerts are never suppressed by cooldown
  (existing `neverSuppressSeverity: ["critical"]` rule preserved).

---

## Completed Sprints

| Sprint | Goal | Status |
|--------|------|--------|
| 000 | Project setup, DB schema, env config, embeddings, vectorstore, watchlist, BCTC balance sheet + income stmt | Done |
| 001 | BCTC RAG pipeline: cash flow, ratio, delta, orchestrator, RAG retriever | Done |
| 002 | SSC portal scraper, PDF extractor, full BCTC pipeline, Bun MCP server, SSC report MCP tools | Done |
| 003 | News intelligence + watchlist/alert system (021, 082, 063, 064, 086) | Done |
| 004 | Cascade engine, analysis MCP tools, legacy cleanup (087, 022, 023, 061, 062, 083, 088) | Done |
| 005 | Market data, scheduler jobs — morning briefing, news poll, market scan, SSC nightly (088, 026, 102, 104, 103, 101) | Done |
| 006 | Analytical depth — pattern matcher, AI summary, HNX fetcher, market MCP tools, integration tests (065, 066, 027, 084, 105, 123) | Done |
| 007 | BCTC edge-case tests, domain coverage, SSC pipeline mock tests, E2E briefing (121, 122, 124, 125, DOC-001, 024) | Done |
| 008 | Macro intelligence layer — Yahoo Finance commodities, SBV rates, macro cascade, get_macro_snapshot MCP tool (FIX-081, 025, 028, 126, 089) | Done |
| 009 | SSC Puppeteer automation, Telegram notifier, 15-min intelligence cycle (031, 034, 106) | Done |
| 010 | Security (SQL injection), alert quality system — cooldown/dedup/grouping, BCTC validator (131, 132, SQL-fix) | Done |
| 011 | Adaptive signal thresholds, sentiment classifier, RAG temporal decay, VnEconomy RSS (133, 134, 135, 035) | Done |
| 012 | Periodic summaries — daily/weekly/monthly/quarterly/yearly, cron triggers, MCP tools (130) | Done |
| 013 | OCR fallback for scanned BCTCs (Tesseract + Vietnamese), BCTC Collector SSC call removal, Chrome zombie fix | Done |
