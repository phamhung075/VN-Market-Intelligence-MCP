# Sprint Goal

## Current Sprint

status: COMPLETE
sprint_id: 028
started: 2026-04-01
updated: 2026-04-02
completed: 2026-04-02

---

### Theme

**"Structural Integrity and Investor Safety Net"**

---

### Goal

Two structural debts from Sprint 027 (dynamic registry, flaky test) are resolved first so
the codebase is clean before new investor-facing features land. Then two production-grade
investor tools are added: stop-loss/take-profit threshold alerts so positions have a safety
net, and per-source API rate limiting so the 15-min intelligence cycle cannot be throttled
or banned by external services.

---

### Scope

**IN**

1. **Task 192 — Fix flaky test: `164-polymarket-fetcher.test.ts` mock timing (P0, carry-over)**

   The polymarket fetcher test fires randomly in the full suite due to a shared Bun.fetch
   mock being reset by a racing test between the timer fire and the assertion. The fix scopes
   the mock to the test file only and replaces wall-clock timer reliance with a deterministic
   fake timer so concurrent tests cannot interfere.

   Acceptance criteria:
   - `bun test src/__tests__/164-polymarket-fetcher.test.ts` passes 10/10 consecutive runs.
   - `bun test` full suite passes 3/3 consecutive runs with zero flaky failures in task 164.
   - No production files modified — only `src/__tests__/164-polymarket-fetcher.test.ts` and
     any extracted shared test helper.
   - >= 1 new assertion pins the previously-flaky timing behaviour.
   - `bun tsc --noEmit` → 0 errors.

   Files:
   - MODIFY: `src/__tests__/164-polymarket-fetcher.test.ts`
   - MODIFY (optional): shared mock helper if extracted

2. **Task 193 — Dynamic tool registration: eliminate server.ts merge conflicts (P0, carry-over)**

   Replace the flat list of `register*Tools(server, db)` calls in
   `src/interface/mcp/server.ts` with an auto-discovery registry. Each tool module exports
   a `register(server, db)` function. `server.ts` iterates `toolRegistry` from
   `src/interface/mcp/tools/registry.ts` and calls `r.register(server, db)` for each entry.

   Design constraints (locked at PO level):
   - The module array lives exclusively in `src/interface/mcp/tools/registry.ts`.
   - `server.ts` imports `toolRegistry` and runs one `forEach` loop — nothing else changes.
   - Each existing tool module gains `export function register(server, db)` containing the
     existing registration logic verbatim.
   - `tools/index.ts` is NOT changed — backward-compatible re-exports remain.
   - No tool behaviour changes. All 48 existing tools must pass their existing tests.

   Acceptance criteria:
   - `src/interface/mcp/tools/registry.ts` exists and exports `toolRegistry` as an array of
     objects with a `register(server: McpServer, db: Database): void` method.
   - `src/interface/mcp/server.ts` body contains only the `toolRegistry.forEach(...)` loop —
     no individual `register*Tools(...)` call sites remain.
   - All 48 tools remain registered and functional after refactor.
   - `bun test` full suite → 0 failures, `bun tsc --noEmit` → 0 errors.
   - A stub tool added only to `registry.ts` and its own file is sufficient to register it.
     Verified by a test in `src/__tests__/193-tool-registry.test.ts`.

   Files:
   - CREATE: `src/interface/mcp/tools/registry.ts`
   - MODIFY: `src/interface/mcp/server.ts` — replace call list with forEach loop
   - MODIFY: every tool module file — add `export function register(...)` named export
   - CREATE: `src/__tests__/193-tool-registry.test.ts`

3. **Task 206 — Stop-loss / take-profit threshold alerts (P1)**

   New MCP tool `set_price_alert` lets the investor define a stop-loss or take-profit price
   level for any stock. The intelligence cycle checks these thresholds on every price fetch
   and emits a HIGH severity alert (→ Telegram) when a threshold is breached.

   Data model: new table `price_alerts` in SQLite:
   ```sql
   CREATE TABLE IF NOT EXISTS price_alerts (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     stock_code  TEXT NOT NULL,
     alert_type  TEXT NOT NULL CHECK(alert_type IN ('stop_loss','take_profit')),
     threshold   REAL NOT NULL,
     note        TEXT,
     triggered   INTEGER NOT NULL DEFAULT 0,   -- 0 = pending, 1 = triggered
     triggered_at TEXT,
     created_at  TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_price_alerts_stock ON price_alerts(stock_code, triggered);
   ```

   MCP tools (new file `src/interface/mcp/tools/priceAlertTools.ts`):
   - `set_price_alert(stock_code, alert_type, threshold, note?)` — inserts a pending alert.
   - `get_price_alerts(stock_code?)` — lists pending (and optionally triggered) alerts.
   - `delete_price_alert(id)` — removes an alert row.

   Intelligence cycle integration:
   - After `fetchHosePrices()` / `fetchHnxPrices()` in the intelligence cycle, call
     `checkPriceAlerts(prices)` from `src/application/usecases/checkPriceAlerts.ts`.
   - For each pending `price_alerts` row where the current price has crossed the threshold:
     - stop_loss: current_price <= threshold → breach.
     - take_profit: current_price >= threshold → breach.
   - On breach: emit an Alert with severity HIGH, stock_code, message in Vietnamese:
     `"[VCB] STOP-LOSS kích hoạt: giá 87,500 ≤ ngưỡng 88,000. Xem xét cắt lỗ ngay."` or
     `"[FPT] TAKE-PROFIT kích hoạt: giá 123,000 ≥ ngưỡng 120,000. Chốt lời?"`.
   - Mark `triggered = 1`, `triggered_at = now()` — one-shot, does not re-fire.
   - Store alert in `alerts` table via existing `alertStore`. Let the normal Telegram
     dispatch path send it (no new notification code needed).

   Graceful degradation:
   - No price data for a stock: threshold check is skipped silently.
   - Duplicate set for same stock/type/threshold: allowed (investor may want two levels).
   - `get_price_alerts` with no rows: returns "Khong co nguong gia nao duoc cai dat."

   Acceptance criteria:
   - `set_price_alert('VCB', 'stop_loss', 88000)` inserts a row with `triggered = 0`.
   - When price 87,500 is processed: row is marked `triggered = 1` and HIGH alert inserted.
   - When price 90,000 is processed for the same triggered row: alert does NOT fire again.
   - `set_price_alert('FPT', 'take_profit', 120000)` + price 123,000 → take-profit alert.
   - `get_price_alerts()` returns all pending alerts in Vietnamese table format.
   - `delete_price_alert(id)` removes the row; subsequent `get_price_alerts` does not show it.
   - `checkPriceAlerts([])` (empty prices array) → no crash, returns 0 breaches.
   - >= 18 tests, 0 failures. `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 48 to 51 (3 new tools).

   Files:
   - MODIFY: `src/infrastructure/db/schema.ts` — add `price_alerts` table + index
   - CREATE: `src/application/usecases/checkPriceAlerts.ts`
   - CREATE: `src/interface/mcp/tools/priceAlertTools.ts`
   - MODIFY: `src/interface/mcp/tools/registry.ts` — add priceAlertTools entry (requires 193)
   - MODIFY: `src/scheduler/intelligenceCycleJob.ts` — wire `checkPriceAlerts` after price fetch
   - CREATE: `src/__tests__/206-price-alert-tools.test.ts`

   Dependency: task 193 must land first (registry.ts must exist).

4. **Task 207 — Per-source API rate limiting for external fetchers (P1)**

   The 5 news fetchers + 2 price fetchers make outbound HTTP calls every 15 minutes with no
   rate-limit protection. A burst during a catch-up (e.g., server restart after 2 h downtime)
   or concurrent MCP tool calls can send dozens of requests to the same host in seconds,
   triggering 429 responses or IP bans from CafeF, VnDirect, and HNX.

   New domain service `src/domain/services/rateLimiter.ts`:
   - In-memory map: `host → { lastCallMs: number, minIntervalMs: number }`.
   - `RateLimiter.canCall(host: string): boolean` — returns true if
     `Date.now() - lastCallMs >= minIntervalMs`.
   - `RateLimiter.record(host: string): void` — updates `lastCallMs = Date.now()`.
   - Default per-host intervals (configurable via `mcp.config.json` `fetchers.rateLimits`):
     - `cafef.vn`: 8 000 ms (8 s)
     - `vnexpress.net`: 8 000 ms
     - `vneconomy.vn`: 8 000 ms
     - `news.google.com`: 5 000 ms
     - `tradingeconomics.com`: 10 000 ms
     - `api-finfo.vndirect.com.vn`: 5 000 ms
     - `api.hnx.vn`: 5 000 ms
     - `query1.finance.yahoo.com`: 5 000 ms
     - `portal.vietcombank.com.vn`: 10 000 ms
     - default (any other host): 3 000 ms
   - `RateLimiter` is a singleton exported from the module.

   Integration: each fetcher (`cafef.ts`, `vnexpress.ts`, `vneconomy.ts`, `reuters.ts`,
   `tradingEconomicsStream.ts`, `hose.ts`, `hnx.ts`) wraps its primary HTTP call:
   ```typescript
   if (!rateLimiter.canCall(host)) {
     logger.debug(`Rate limited: ${host}, skipping`);
     return [];   // or cached value / empty result
   }
   rateLimiter.record(host);
   // ... existing fetch logic
   ```
   - On rate-limit skip: return the same empty/null value the fetcher already returns on
     error — no new error types, no throws.
   - The rate limiter is in-process only (resets on server restart) — no persistence needed.

   `mcp.config.json` addition:
   ```json
   "rateLimits": {
     "cafef.vn": 8000,
     "vnexpress.net": 8000,
     "vneconomy.vn": 8000,
     "news.google.com": 5000,
     "tradingeconomics.com": 10000,
     "api-finfo.vndirect.com.vn": 5000,
     "api.hnx.vn": 5000,
     "query1.finance.yahoo.com": 5000,
     "portal.vietcombank.com.vn": 10000,
     "default": 3000
   }
   ```

   Acceptance criteria:
   - `canCall('cafef.vn')` returns `true` before first call, `false` immediately after
     `record('cafef.vn')`, `true` again after 8 s (mocked timer).
   - Two rapid calls to the same host: second is skipped (logged at DEBUG level).
   - Different hosts: independent counters — one being rate-limited does not block others.
   - All 7 modified fetchers return `[]` / `null` gracefully when rate-limited (no throws).
   - `mcp.config.json` `fetchers.rateLimits` section parsed and applied at startup.
   - `rateLimiter.ts` is in `src/domain/services/` (pure logic, no I/O).
   - >= 14 tests, 0 failures. `bun tsc --noEmit` → 0 errors.
   - No new MCP tools (this is infrastructure only). Tool count unchanged.

   Files:
   - CREATE: `src/domain/services/rateLimiter.ts`
   - MODIFY: `src/infrastructure/fetchers/cafef.ts`
   - MODIFY: `src/infrastructure/fetchers/vnexpress.ts`
   - MODIFY: `src/infrastructure/fetchers/vneconomy.ts`
   - MODIFY: `src/infrastructure/fetchers/reuters.ts`
   - MODIFY: `src/infrastructure/fetchers/tradingEconomicsStream.ts`
   - MODIFY: `src/infrastructure/fetchers/hose.ts`
   - MODIFY: `src/infrastructure/fetchers/hnx.ts`
   - MODIFY: `mcp.config.json` — add `fetchers.rateLimits` section
   - CREATE: `src/__tests__/207-rate-limiter.test.ts`

**OUT**

- End-to-end integration test of the full intelligence cycle (task 125 — blocked on test
  harness design; remains deferred)
- Watchlist auto-enrichment with sector peers (deferred to Sprint 029)
- Historical analysis replay / backtesting engine (deferred — high complexity, low urgency)
- LLM-based recommendations (out of scope permanently — rule-based only)
- Tasks 196 (worktree cleanup) and 197 (Reuters RSS + delete_telegram_report test) from
  Sprint 027: rolled into Sprint 028 backlog but not scheduled for this sprint iteration —
  Reuters is an external service issue; worktree cleanup is housekeeping without code value.

---

### Success Metrics

1. `bun test` full suite passes 3/3 consecutive runs with zero flaky failures in any test
   file. Task 164 polymarket timing flakiness is eliminated permanently. (Task 192)

2. `src/interface/mcp/server.ts` body contains only one `toolRegistry.forEach(...)` loop.
   Adding a new tool in a future sprint requires editing only the tool file + one line in
   `registry.ts`. Merge conflicts on `server.ts` become structurally impossible. (Task 193)

3. An investor can call `set_price_alert('VCB', 'stop_loss', 88000)` and receive a
   Telegram notification the moment VCB trades at or below 88,000 VND — with the exact
   price and a Vietnamese-language action prompt. One-shot, no re-fire. (Task 206)

4. No fetcher can fire more than once per configured interval per host. A server restart
   after 2 h downtime does not send a burst of simultaneous requests to CafeF or VnDirect.
   All 7 fetchers degrade gracefully (return `[]`) when rate-limited. (Task 207)

5. `bun tsc --noEmit` → 0 errors. All 1688 existing tests continue to pass.

6. Tool count: 48 → 51 (3 new tools from task 206; tasks 192, 193, 207 add no net tools).

---

### Task board (Sprint 028)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 192 | Fix flaky test: `164-polymarket-fetcher.test.ts` mock timing | P0 | Backlog | — |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | P0 | Backlog | — |
| 206 | Stop-loss / take-profit threshold alerts | P1 | Backlog | 193 |
| 207 | Per-source API rate limiting for external fetchers | P1 | Backlog | — |

---

### Dependency chain

```
192 (fix flaky test)       — P0, independent, touches only __tests__/164-*.test.ts
193 (dynamic registry)     — P0, independent, refactor only
207 (rate limiter)         — P1, independent, new domain service + 7 fetchers
206 (stop-loss/TP alerts)  — P1, depends on 193 (registry.ts must exist)

192 + 193 + 207 can run in parallel.
206 must wait for 193 (registry.ts must exist before task 206 appends to it).
```

---

### Key technical decisions (locked at PO level)

- **Task 192 uses mock isolation, not wall-clock timers**: fix is test-layer only. Production
  code is not touched.

- **Task 193 registry in `tools/registry.ts`**: `server.ts` becomes a pure wiring file (one
  loop). The existing `tools/index.ts` re-export pattern is preserved for backward compat.

- **Task 206 threshold alerts are one-shot**: once `triggered = 1`, the row is never
  re-evaluated. The investor must call `set_price_alert` again to re-arm. This prevents
  alert storms on volatile days.

- **Task 206 uses the existing alert pipeline**: no new Telegram code. The HIGH severity
  alert inserted into `alerts` table is picked up by the existing dispatch path in
  `intelligenceCycleJob.ts` step E (`sendAlerts()`).

- **Task 207 rate limiter is in `domain/services/`**: it is pure logic (no I/O, no imports
  from infrastructure). Intervals are injected from `mcp.config.json` at startup so they
  are tunable without code changes.

- **Task 207 degrades to `[]` on rate limit**: this matches the existing behaviour of every
  fetcher on network failure. No new error types introduced.

---

## Completed Sprints

| Sprint | Theme | Completed | Tasks |
|--------|-------|-----------|-------|
| 000 | Foundation | 2026-03-24 | 000 |
| 001 | BCTC Pipeline Wave 1 | 2026-03-25 | 001, 002, 003, 011, 012, 041, 042, 014 |
| 002 | BCTC Pipeline Wave 2 | 2026-03-26 | 043, 044, 013, 045, 046, 047, 029, 030, 048, 085 |
| 003 | News + Alerts | 2026-03-27 | 021, 082, 063, 064, 086 |
| 004 | MCP Wiring + Analysis | 2026-03-27 | 087, 022, 023, 061, 062, 083 |
| 005 | Market Data + Scheduler | 2026-03-28 | 088, 026, 102, 104, 103, 101 |
| 006 | Analytical Depth | 2026-03-28 | 065, 066, 027, 084, 105, 123 |
| 007 | Doc + Tests | 2026-03-28 | DOC-001, 081, 122, 124, 125 |
| 008 | Macro Intelligence | 2026-03-29 | FIX-081, 025, 028, 126, 089 |
| 009 | SSC Automation + Telegram | 2026-03-29 | 031, 034, 106 |
| 010 | Security + Alert Quality | 2026-04-01 | SQL-fix, 131, 132 |
| 011 | Adaptive Signals + Sentiment | 2026-04-01 | 133, 134, 135, 137 |
| 012 | Periodic Summaries | 2026-04-01 | 130 |
| 013 | Fetcher Reliability + Sector Context | 2026-04-01 | 035, 024, 035-TE, sectorPeers, macroThresholds, priceNewsValidator, commodityTracker |
| 014 | Trade Relationships | 2026-04-01 | tradeRelationships, tradeStore |
| 015 | Circuit Breaker | 2026-04-01 | 136 |
| 016 | Conviction Scorer + Portfolio Tools | 2026-04-01 | convictionScorer, portfolioTools, feedbackTools |
| 017 | Production Hardening | 2026-04-01 | 152, 153, 154, 155, 156 |
| 018 | Data Integrity First | 2026-04-01 | 157, 158, 159 |
| 019 | Stock Aliases + Market Broadcast | 2026-04-01 | 160, 161, 162 |
| 020 | Prediction Market Intelligence | 2026-04-01 | 163, 164, 165, 166 (stub), 167, 168, 169 |
| 021 | Close the Loop — Prediction Signals Live | 2026-04-01 | 170, 171, 172, 173 |
| 022 | House in Order | 2026-04-01 | 174, 175, 176, 177 |
| 023 | Close the Investor Loop | 2026-04-01 | 178, 179, 180, 181 |
| 024 | Reliability Hardening and Investor UX Polish | 2026-04-01 | 182, 183, 184, 185 |
| 025 | Daily Investor Intelligence | 2026-04-01 | 186, 187, 188 |
| 026 | Signal Quality and Portfolio Correlation | 2026-04-02 | 189, 190, 191 |
| 027 | Stability First | 2026-04-02 | 194 (CLAUDE.md sync), 195 (rebalancing, in Review), hotfixes 198-205 |
