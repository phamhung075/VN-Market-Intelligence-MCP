# Sprint Goal

## Current Sprint

status: COMPLETE
sprint_id: 023
started: 2026-04-01
updated: 2026-04-01
completed: 2026-04-01

---

### Theme

**"Close the Investor Loop — Price History Access, Position Tracking, and Decision Context"**

---

### Goal

The investor can monitor signals and receive alerts, but cannot close the loop from
"interesting signal" to "investment decision". Three gaps block this:

1. `market_prices_history` accumulates a 15-min price tick for every watchlist stock,
   but there is **no MCP tool to query it** — the investor cannot ask Claude "show me
   VNM's price movement over the past 5 days" without raw SQL access.

2. There is **no way to record a position** — the investor cannot say "I bought VNM at
   75,000 on March 15" and get P&L against current price. Without this, every briefing
   and conviction score is context-free: the system does not know whether a signal means
   "buy more" or "consider exiting a 15% gain".

3. The morning briefing produces a conviction score per stock but gives **no decision
   recommendation** — it stops at "high conviction, bullish" without synthesising all
   signals into a plain-language action note ("consider adding" / "hold — await BCTC Q1"
   / "reduce — sector headwinds + approaching resistance").

This sprint adds three targeted tools that together complete the investor's daily
workflow:

```
Morning briefing
  → get_price_history("VNM", days=7) — visualise recent trend
  → get_portfolio_conviction — each stock with P&L context (if position recorded)
  → decision note: hold / add / reduce (synthesised from price + conviction + alert count)
```

---

### Scope

**IN**

1. **Task 178 — `get_price_history` MCP tool (P0)**

   New MCP tool that queries `market_prices_history` for one or all watchlist stocks
   over a configurable look-back window (1 / 5 / 10 / 20 / 30 trading days).

   Inputs: `{ stock?: string, days?: 1|5|10|20|30 }`
   Output: per-stock table of (date, price, change_pct, volume) rows + summary stats
   (min, max, avg, stddev, total_return_pct over window).

   No new schema. Reads from `market_prices_history` (already populated every 15 min
   by the intelligence cycle).

   Files:
   - CREATE: `src/interface/mcp/tools/priceHistoryTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerPriceHistoryTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/178-price-history.test.ts`

   Acceptance criteria:
   - `get_price_history({ stock: "VNM", days: 5 })` returns rows for VNM with
     `date`, `price`, `changePct`, `volume` columns.
   - When `stock` is omitted, returns data for all watchlist stocks (one section each).
   - `days` defaults to 5; accepts 1, 5, 10, 20, 30.
   - Returns "no data yet" gracefully when `market_prices_history` is empty.
   - Summary stats (min, max, avg, totalReturnPct) included per stock.
   - >= 14 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 32 to 33.

2. **Task 179 — Position tracking: schema + CRUD MCP tools (P0)**

   Add a `positions` table to SQLite and 3 MCP tools:
   - `set_position(stock, entryPrice, shares, entryDate, notes?)` — upsert one row
   - `get_positions()` — return all positions with current price + P&L
   - `close_position(stock, exitPrice, exitDate, notes?)` — mark position closed,
     record realised P&L

   Schema (`positions` table, added to `schema.ts` via `CREATE TABLE IF NOT EXISTS`):
   ```sql
   CREATE TABLE IF NOT EXISTS positions (
     code          TEXT PRIMARY KEY,
     entry_price   REAL NOT NULL,
     shares        REAL NOT NULL,
     entry_date    TEXT NOT NULL,
     exit_price    REAL,
     exit_date     TEXT,
     realised_pnl  REAL,
     notes         TEXT,
     opened_at     TEXT NOT NULL,
     closed_at     TEXT
   );
   ```

   `get_positions()` joins to `market_prices` for current price and computes:
   - unrealised P&L: `(current_price - entry_price) * shares`
   - unrealised P&L %: `(current_price / entry_price - 1) * 100`
   - cost basis: `entry_price * shares`
   - current value: `current_price * shares`

   Output is Vietnamese-formatted, sorted by unrealised P&L % descending.

   Files:
   - MODIFY: `src/infrastructure/db/schema.ts` — add `positions` table DDL
   - CREATE: `src/interface/mcp/tools/positionTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerPositionTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/179-position-tools.test.ts`

   Acceptance criteria:
   - `set_position({ stock: "VNM", entryPrice: 75000, shares: 1000, entryDate: "2026-03-15" })`
     inserts a row and returns confirmation.
   - `get_positions()` returns VNM with unrealised P&L computed from `market_prices`.
   - `get_positions()` shows "no price data" gracefully when `market_prices` has no row.
   - `close_position({ stock: "VNM", exitPrice: 80000, exitDate: "2026-04-01" })`
     sets `exit_price`, `exit_date`, `realised_pnl`, `closed_at`.
   - `get_positions()` by default shows only open positions; accepts `includesClosed: true`
     to show all.
   - >= 16 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 33 to 36 (3 new tools).

3. **Task 180 — Decision note synthesis in `get_portfolio_conviction` (P1)**

   Enhance the existing `get_portfolio_conviction` tool (no schema change, no new tool).

   Current output per stock:
   ```
   VNM — HIGH (0.78)
     75,200 VND +1.2% | Ngành bán lẻ: -0.3%
     Tín hiệu mạnh theo hướng tăng
   ```

   New output per stock (add 2 extra lines):
   ```
   VNM — HIGH (0.78)
     75,200 VND +1.2% | Ngành bán lẻ: -0.3%
     Tín hiệu mạnh theo hướng tăng
     P&L: +6.8% (+5,200 VND/cp) — 1,000 cp | Chi phí: 75,000,000 VND
     Quyet dinh: THEM VAO — conviction cao + giá tăng vượt ngành
   ```

   Decision note rules (rule-based, no LLM):
   - THEM VAO (add): conviction >= 0.65 AND changePct > sectorAvg AND openAlerts == 0
   - GIU NGUYEN (hold): conviction >= 0.40 AND NOT the THEM VAO condition
   - XEM XET GIAM (reduce): openAlerts >= 2 OR (changePct < sectorAvg - 2 AND conviction < 0.45)
   - GIAM BOT (trim): conviction < 0.30 OR (openAlerts >= 3 AND direction == "bearish")
   - KHONG CO VI THE (no position): show if no `positions` row for this stock

   If no position is recorded for a stock, skip the P&L line and show:
   `Chua co vi the — dung set_position de theo doi lai/lo`

   Files:
   - MODIFY: `src/interface/mcp/tools/portfolioTools.ts` — enhance output section only
   - MODIFY: `src/__tests__/149-portfolio-conviction.test.ts` (or create
     `src/__tests__/180-portfolio-decision.test.ts` if the old test file does not exist)

   Acceptance criteria:
   - When a `positions` row exists for a stock, P&L line appears in output.
   - When conviction >= 0.65 AND changePct > sectorAvg AND openAlerts == 0, decision
     note reads "THEM VAO" (case-insensitive match in test).
   - When openAlerts >= 2, decision note reads "XEM XET GIAM".
   - When no position row exists, output contains "Chua co vi the".
   - Existing `get_portfolio_conviction` tests continue to pass.
   - >= 10 new tests for the decision logic, 0 failures.
   - `bun tsc --noEmit` → 0 errors.

4. **Task 181 — Wire `get_price_history` into morning briefing (P2)**

   Enhance `src/application/usecases/assembleBriefing.ts` to append a
   "Price Trends (7 ngay)" section after the existing conviction section.
   For each watchlist stock: one-line summary showing the 7-day return and a
   5-character ASCII sparkline derived from daily close prices.

   Sparkline characters: `_` (< -1%), `-` (-1% to 0%), `.` (~0%), `+` (0 to +1%),
   `^` (> +1%). Example: `VNM: +3.2% [_-.+^]`

   The sparkline is built from `market_prices_history` daily closes (last price of
   each calendar day). If fewer than 2 data points exist for a stock, show
   "(data insufficient — accumulating)".

   Files:
   - MODIFY: `src/application/usecases/assembleBriefing.ts`
   - CREATE or MODIFY: `src/__tests__/181-briefing-price-trends.test.ts`

   Acceptance criteria:
   - When `market_prices_history` has 7+ rows for VNM, the briefing output contains
     "Price Trends" section with VNM's 7-day return and a 5-char sparkline.
   - When fewer than 2 rows exist for a stock, output contains "data insufficient".
   - The morning briefing assembly does not throw when `market_prices_history` is empty.
   - >= 8 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.

**OUT**

- LLM-based decision recommendations (all rules are deterministic)
- Portfolio-level P&L aggregation / total portfolio value dashboard (a future sprint)
- Trade history / journal (a future sprint)
- Chart image generation (no image tooling in stack)
- New external data sources
- Schema changes beyond the `positions` table
- Backtest / simulation mode

---

### Success Metrics

1. Investor can ask Claude "show me VNM's price over the last 5 days" and receive a
   readable table with daily prices, change %, and summary stats.

2. Investor can record "I bought VNM at 75,000 on March 15 — 1,000 shares" and see
   P&L in every `get_portfolio_conviction` call going forward.

3. `get_portfolio_conviction` shows a decision note (THEM VAO / GIU NGUYEN / XEM XET
   GIAM / GIAM BOT) for every stock, derived deterministically from conviction + price
   action + alert count + position context.

4. Morning briefing includes a 5-char sparkline per watchlist stock with 7-day return.

5. `bun tsc --noEmit` → 0 errors. All existing 1440 tests continue to pass.

6. Tool count: 32 → 36 (get_price_history, set_position, get_positions, close_position).

---

### Task board (Sprint 023)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 178 | `get_price_history` MCP tool | P0 | Backlog | — |
| 179 | Position tracking: schema + 3 MCP tools | P0 | Backlog | — |
| 180 | Decision note synthesis in `get_portfolio_conviction` | P1 | 179 | — |
| 181 | Wire price trends sparkline into morning briefing | P2 | Backlog | 178 |

---

### Dependency chain

```
178 (get_price_history)   — P0, independent, start immediately
179 (position tracking)   — P0, independent, start immediately
180 (decision notes)      — P1, needs 179 for positions join
181 (briefing sparkline)  — P2, needs 178 for history query helper

178 + 179 can run in parallel (no shared files).
180 depends on 179 (reads positions table).
181 depends on 178 (reuses price history query).
```

---

### Key technical decisions (locked at PO level)

- **Task 178 is read-only**: no schema change. Reads `market_prices_history` directly.
  The table is already populated every 15 min by `intelligenceCycleJob`. Risk of
  breaking anything is zero.

- **Task 179 `positions` table uses `code` as PRIMARY KEY**: one open position per
  stock. The investor does not manage tranches — they hold one position per ticker.
  Closing a position records `exit_price` + `realised_pnl` in-place (no separate
  history table in this sprint — that is a future "trade journal" sprint).

- **Task 180 is pure output formatting**: only `portfolioTools.ts` is touched.
  The `computeConviction` domain service is NOT modified. The decision note is computed
  in the tool layer from conviction output + a `positions` DB read. DDD layering preserved.

- **Task 181 sparkline uses ASCII only**: no Unicode block characters (they render
  inconsistently in Telegram plain-text). Five characters: `_`, `-`, `.`, `+`, `^`.
  The sparkline is a 5-element window over the 7-day history (one char per 1.4 days).

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
