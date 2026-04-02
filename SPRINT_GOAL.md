# Sprint Goal

## Current Sprint

status: ACTIVE
sprint_id: 029
started: 2026-04-01
updated: 2026-04-01

---

### Theme

**"Always-On Investor — Query Anywhere, Trust Everything"**

---

### Goal

The investor is in France watching a Vietnamese market 6 hours ahead. Sprint 029 closes three
daily-use gaps: a Telegram command interface so the investor can query the system without
opening Claude Desktop; a P&L snapshot baked into the morning briefing so portfolio
performance is visible at 08:00 every day; and a news source health monitor so the investor
knows immediately when an intelligence source goes silent and cannot trust the cascade engine.

---

### Scope

**IN**

1. **Task 208 — Telegram command interface: query system via Telegram messages (P0)**

   The investor sends a message to the Telegram bot and receives a structured reply. The bot
   polls for incoming messages using `getUpdates` (long polling, no webhook required). Commands
   are processed synchronously and replies are sent back to the same chat.

   Supported commands (MVP):
   - `/watchlist` — list current watchlist stocks with latest prices
   - `/alerts` — last 5 unresolved HIGH/CRITICAL alerts
   - `/briefing` — trigger the morning briefing summary on demand
   - `/price VCB` — current price for one stock (any stock code)
   - `/health` — system health: last cycle time, DB size, active sources

   Architecture:
   - New file `src/infrastructure/notifiers/telegramCommands.ts` — `TelegramCommandHandler`
     class with `poll()` method. Runs a `setInterval` every 5 seconds inside the scheduler.
   - Scheduler integration: `src/scheduler/jobs.ts` starts the command handler alongside
     existing cron jobs. No new cron expression — uses `setInterval(poll, 5000)`.
   - Command routing: simple `if/else` on `text.trim().toLowerCase()`. No external NLP.
   - Reply format: plain text Vietnamese, same style as existing Telegram notifier.
   - `getUpdates` uses `offset` param to avoid re-processing old messages. Offset stored in
     memory (resets on restart — acceptable for MVP).
   - On unknown command: reply "Lenh khong hop le. Cac lenh: /watchlist /alerts /briefing
     /price [MA_CP] /health"
   - Bot token and chat ID reuse `infrastructure/config.ts` Telegram config. If Telegram is
     disabled (`telegram.enabled = false`), command handler does not start.

   Graceful degradation:
   - `getUpdates` timeout or network error: log at WARN, skip cycle, retry next 5 s.
   - Individual command handler throws: reply "Loi xu ly lenh. Vui long thu lai." — never
     crash the poller.
   - If `TELEGRAM_BOT_TOKEN` not set: handler does not start, logs INFO "Telegram commands
     disabled — no token".

   Acceptance criteria:
   - `TelegramCommandHandler.poll()` called with mock returning `/watchlist` message → calls
     watchlist DB query and sends reply via `sendTelegramMessage`.
   - `poll()` with `/price VCB` → fetches price and sends "VCB: 89,500 VND" reply.
   - `poll()` with `/alerts` → returns last 5 HIGH/CRITICAL alerts formatted in Vietnamese.
   - `poll()` with `/briefing` → triggers `assembleBriefing()` and sends truncated output.
   - `poll()` with unknown command → sends the help text.
   - `poll()` when `getUpdates` throws → logs WARN, does not throw, does not crash.
   - Offset advances after each processed update so messages are not re-processed on next poll.
   - `telegram.enabled = false` → handler never calls `getUpdates`.
   - >= 16 tests, 0 failures. `bun tsc --noEmit` → 0 errors.
   - No new MCP tools (Telegram interface, not MCP). Tool count unchanged.

   Files:
   - CREATE: `src/infrastructure/notifiers/telegramCommands.ts`
   - MODIFY: `src/scheduler/jobs.ts` — start command handler on scheduler init
   - MODIFY: `src/infrastructure/config.ts` — expose `telegram.enabled` flag if not already
   - CREATE: `src/__tests__/208-telegram-commands.test.ts`

2. **Task 209 — Daily P&L snapshot in morning briefing (P1)**

   Every morning at 08:00 the briefing fires. It already shows VN-Index, macro dashboard,
   alerts. Add a "DANH MUC" section showing each portfolio position with:
   - Current price (from last prices fetch)
   - Entry price (from `portfolio_positions` table, `buy_price` column)
   - P&L in VND and % since entry
   - Total portfolio P&L across all open positions

   New use case `src/application/usecases/getPortfolioPnl.ts`:
   - Reads all open positions (`status = 'open'`) from `portfolio_positions`.
   - Reads latest prices from `stock_prices` table (most recent row per stock_code).
   - Computes: `pnl_vnd = (current_price - buy_price) * quantity`,
     `pnl_pct = (current_price - buy_price) / buy_price * 100`.
   - Returns array of `PositionSnapshot` + `totalPnlVnd` + `totalPnlPct` (weighted avg).
   - If no price found for a stock: include row with `current_price = null`, `pnl = null`,
     note "Chua co gia".

   `assembleBriefing.ts` integration:
   - Call `getPortfolioPnl()` after existing sections.
   - Append "--- DANH MUC ---" section to briefing text if at least 1 open position exists.
   - Format: one line per position: `VCB: mua 88,000 | hien 92,300 | +4,300 (+4.9%)` followed
     by total line: `Tong P&L: +12,450,000 VND (+3.2%)`.
   - If no open positions: section is omitted entirely.

   SQLite snapshot storage:
   - New table `portfolio_pnl_snapshots`:
     ```sql
     CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (
       id           INTEGER PRIMARY KEY AUTOINCREMENT,
       snapshot_at  TEXT NOT NULL DEFAULT (datetime('now')),
       stock_code   TEXT NOT NULL,
       buy_price    REAL NOT NULL,
       current_price REAL,
       quantity     REAL NOT NULL,
       pnl_vnd      REAL,
       pnl_pct      REAL
     );
     CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_date
       ON portfolio_pnl_snapshots(snapshot_at);
     ```
   - `getPortfolioPnl()` writes a row per position to this table on every call. This gives a
     P&L history the investor can query later.

   Acceptance criteria:
   - `getPortfolioPnl()` with 2 open positions and matching prices → returns correct pnl_vnd
     and pnl_pct for each, plus correct total.
   - Position with no matching price → `current_price = null`, `pnl_vnd = null`, no crash.
   - No open positions → returns empty array, `totalPnlVnd = 0`.
   - `assembleBriefing()` output contains "DANH MUC" section when positions exist.
   - `assembleBriefing()` output does NOT contain "DANH MUC" when no positions exist.
   - Snapshot rows written to `portfolio_pnl_snapshots` after each call.
   - >= 14 tests, 0 failures. `bun tsc --noEmit` → 0 errors.
   - No new MCP tools. Tool count unchanged.

   Files:
   - MODIFY: `src/infrastructure/db/schema.ts` — add `portfolio_pnl_snapshots` table + index
   - CREATE: `src/application/usecases/getPortfolioPnl.ts`
   - MODIFY: `src/application/usecases/assembleBriefing.ts` — add DANH MUC section
   - CREATE: `src/__tests__/209-portfolio-pnl.test.ts`

3. **Task 210 — News source health monitoring (P1)**

   The investor relies on 5 news sources for the cascade engine. When one goes silent (0
   articles returned for N consecutive cycles) the cascade analysis degrades silently. The
   investor has no way to know that FX macro news is missing because VnEconomy has been
   blocking requests for 3 hours.

   New domain service `src/domain/services/sourceHealthTracker.ts`:
   - In-memory map: `source_name → { lastSuccessAt: number, consecutiveFailures: number,
     articlesLastCycle: number }`.
   - `recordFetch(source: string, articleCount: number): void` — updates the map. If
     `articleCount === 0`, increments `consecutiveFailures`; else resets to 0 and sets
     `lastSuccessAt = Date.now()`.
   - `getHealthReport(): SourceHealth[]` — returns one row per source with fields:
     `source`, `status` ('ok' | 'degraded' | 'down'), `consecutiveFailures`,
     `lastSuccessAt`, `minutesSinceSuccess`.
   - Status thresholds (configurable in `mcp.config.json` `sourceHealth`):
     - `ok`: consecutiveFailures < 2
     - `degraded`: 2 <= consecutiveFailures < 5
     - `down`: consecutiveFailures >= 5
   - Singleton exported from module. Resets on server restart.

   Integration in `pollNews.ts`:
   - After each fetcher call, call `sourceHealthTracker.recordFetch(sourceName, items.length)`.
   - 5 sources: 'cafef', 'vnexpress', 'vneconomy', 'reuters', 'tradingeconomics'.

   Telegram alert on source going `down`:
   - In `pollNews.ts`, after recording fetches: check `getHealthReport()`. For any source
     that just transitioned to `down` (consecutiveFailures === 5 exactly), send a Telegram
     message: "CANH BAO: Nguon tin [cafef] ngung hoat dong (5 chu ky lien tiep khong co du
     lieu). Kiem tra ket noi."
   - Transition detection: compare before/after `recordFetch` — only alert on the cycle where
     `consecutiveFailures` hits exactly 5, not on every subsequent cycle.

   New MCP tool `get_source_health` in `src/interface/mcp/tools/systemTools.ts`:
   - Returns `getHealthReport()` formatted as a Vietnamese table.
   - Registered via `registry.ts` (requires task 193 complete; if 193 not done, register
     directly in `server.ts` as a fallback — use same pattern as other tools).

   `mcp.config.json` addition:
   ```json
   "sourceHealth": {
     "degradedThreshold": 2,
     "downThreshold": 5
   }
   ```

   Acceptance criteria:
   - `recordFetch('cafef', 0)` 5 times → status 'down', `consecutiveFailures = 5`.
   - `recordFetch('cafef', 3)` after 5 failures → status 'ok', `consecutiveFailures = 0`.
   - `recordFetch('vnexpress', 5)` → status 'ok'.
   - Different sources are independent (cafef down does not affect vnexpress counter).
   - Telegram message sent exactly once when source hits 5 consecutive failures (not on 6th).
   - `get_source_health` MCP tool returns all 5 sources with correct status.
   - `mcp.config.json` thresholds respected at runtime.
   - >= 16 tests, 0 failures. `bun tsc --noEmit` → 0 errors.
   - Tool count increases by 1 (get_source_health). 52 → 53.

   Files:
   - CREATE: `src/domain/services/sourceHealthTracker.ts`
   - MODIFY: `src/application/usecases/pollNews.ts` — wire recordFetch + down-alert
   - MODIFY: `src/interface/mcp/tools/systemTools.ts` — add `get_source_health` tool
   - MODIFY: `src/interface/mcp/tools/registry.ts` — register systemTools (if 193 done)
   - MODIFY: `mcp.config.json` — add `sourceHealth` section
   - CREATE: `src/__tests__/210-source-health.test.ts`

**OUT**

- Watchlist auto-enrichment with sector peers (deferred — investor has 4 stocks, sector
  context already in place via sectorPeers.ts)
- Historical analysis replay / backtesting engine (high complexity, no daily urgency)
- Circuit breaker improvements (already functional from Sprint 015; tuning deferred)
- LLM-based recommendations (out of scope permanently — rule-based only)
- Tasks 196 (worktree cleanup) and 197 (Reuters RSS) remain deferred

---

### Success Metrics

1. The investor sends `/briefing` to the Telegram bot from France at any hour and receives
   a full market summary within 10 seconds. No Claude Desktop required. (Task 208)

2. The 08:00 morning briefing contains a "DANH MUC" section showing P&L for all open
   positions. The investor reads their portfolio performance before market open every day.
   Historical P&L rows accumulate in `portfolio_pnl_snapshots` for future trend analysis.
   (Task 209)

3. When CafeF blocks requests for 3 consecutive intelligence cycles, a Telegram warning fires
   exactly once. `get_source_health` MCP tool shows which sources are ok/degraded/down at any
   time. The investor can trust the cascade engine or know when to be cautious. (Task 210)

4. `bun tsc --noEmit` → 0 errors. `bun test` full suite → 0 failures. All 1731 existing
   tests continue to pass.

5. Tool count: 52 → 53 (1 new tool: `get_source_health` from task 210).

---

### Task board (Sprint 029)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 208 | Telegram command interface: query system via Telegram messages | P0 | Backlog | 034 (done) |
| 209 | Daily P&L snapshot in morning briefing | P1 | Backlog | 190 (done) |
| 210 | News source health monitoring + get_source_health MCP tool | P1 | Backlog | 193 (partial — fallback allowed) |

---

### Dependency chain

```
208 (Telegram commands)  — P0, depends on 034 (Telegram notifier, done)
209 (P&L snapshot)       — P1, depends on portfolio_positions table (task 190, done)
210 (source health)      — P1, optional soft dep on 193 for registry; fallback registration allowed

All three tasks can run in parallel.
```

---

### Key technical decisions (locked at PO level)

- **Task 208 uses long-polling (`getUpdates`), not webhooks**: no public URL required. The
  server is running locally in production; a webhook would need ngrok or a public endpoint.
  Long polling with a 5 s interval is sufficient for investor command latency.

- **Task 208 command set is fixed at 5 commands**: no dynamic command registration for MVP.
  Adding new commands in a future sprint requires editing `telegramCommands.ts` only.

- **Task 209 snapshots are append-only**: `portfolio_pnl_snapshots` is an audit log. No
  updates, no deletes. This gives the investor a complete P&L history from day one.

- **Task 209 uses `stock_prices` table for current price**: this is the same table populated
  by the intelligence cycle price fetchers. No new HTTP calls in `getPortfolioPnl()` — pure
  SQLite reads. If the cycle has not run since server start, prices may be stale; the briefing
  will show the last known price with its timestamp.

- **Task 210 sourceHealthTracker is in `domain/services/`**: pure logic, no I/O. The Telegram
  alert side-effect lives in `pollNews.ts` (application layer), which is the correct place for
  cross-cutting notification concerns.

- **Task 210 alert fires exactly once at consecutiveFailures === 5**: not on 4, not on 6+.
  This prevents alert fatigue if a source stays down for hours. A recovery alert (back to ok)
  is out of scope for MVP.

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
| 028 | Structural Integrity and Investor Safety Net | 2026-04-02 | 192, 193, 206, 207 |
