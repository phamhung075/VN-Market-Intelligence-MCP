# Sprint Goal

## Current Sprint

status: COMPLETE
sprint_id: 024
started: 2026-04-01
updated: 2026-04-01
completed: 2026-04-01

---

### Theme

**"Reliability Hardening and Investor UX Polish — Risk Metrics, Alert Analytics, and Data Freshness"**

---

### Goal

The system generates alerts and conviction scores reliably, but the investor has no
standard risk measurement tools (VaR, drawdown), no way to evaluate whether past
alerts predicted correctly, no way to discover new stocks without knowing their exact
code, and no at-a-glance view of data freshness per source.

This sprint closes four operational gaps that block professional daily use:

1. Portfolio risk metrics (VaR, max drawdown, portfolio heat) give the investor
   a daily risk posture without external tools.
2. Alert accuracy tracking answers "is this system actually useful?" — did the
   signal fired 48 hours ago predict the subsequent price move correctly?
3. Stock search/discovery removes the friction of needing to know exact ticker codes.
4. Data freshness dashboard surfaces staleness per source so the investor knows when
   to distrust a signal.

---

### Scope

**IN**

1. **Task 182 — Portfolio risk metrics: VaR, max drawdown, heat map (P0)**

   New MCP tool `get_portfolio_risk` that reads `positions` + `market_prices_history`
   and computes four standard risk metrics — no new schema, no external data.

   Metrics computed:
   - **Value at Risk (95% 1-day VaR)** per stock and portfolio total: historical
     simulation from daily returns in `market_prices_history` over the last 20 trading
     days. VaR = 5th-percentile daily return applied to current position value.
   - **Max drawdown** per stock: peak-to-trough loss over the look-back window
     (max rolling drawdown from `market_prices_history`).
   - **Portfolio heat** per stock: unrealised P&L as share of total portfolio cost
     basis — shows concentration risk.
   - **Portfolio-level VaR**: sum of per-stock VaR (conservative, non-diversified).

   Output format (Vietnamese-labelled, plain text):
   ```
   DANH MUC — RUI RO (2026-04-01)
   ──────────────────────────────
   VNM   Gia tri: 80,000,000 VND | VaR 95%: -1,200,000 VND (-1.5%)
         Max drawdown 20d: -4.2% | Trong danh muc: 38%
   FPT   Gia tri: 60,000,000 VND | VaR 95%: -980,000 VND (-1.6%)
         Max drawdown 20d: -3.8% | Trong danh muc: 29%
   ...
   TONG  VaR danh muc: -2,800,000 VND (-1.3%) | Nhiet do: BINH THUONG
   ```

   Portfolio heat levels (rule-based):
   - BINH THUONG: no single stock > 40% of portfolio AND portfolio VaR < 2%
   - CANH BAO: any stock > 40% OR portfolio VaR 2-4%
   - NGUY HIEM: any stock > 60% OR portfolio VaR > 4%

   Graceful degradation:
   - If fewer than 5 price history rows for a stock, shows "(du lieu chua du — can
     them du lieu lich su)".
   - If no open positions, returns "Chua co vi the nao duoc ghi nhan".

   Files:
   - CREATE: `src/interface/mcp/tools/riskTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerRiskTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/182-portfolio-risk.test.ts`

   Acceptance criteria:
   - `get_portfolio_risk()` returns VaR, max drawdown, and heat % for each open position.
   - When fewer than 5 history rows exist for a stock, output contains "du lieu chua du".
   - Portfolio heat label is "NGUY HIEM" when any stock exceeds 60% of portfolio.
   - Portfolio-level VaR is the sum of per-stock VaRs.
   - No crash when `positions` table is empty.
   - >= 16 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 36 to 37.

2. **Task 183 — Alert accuracy tracker: outcome scoring (P0)**

   New MCP tool `get_alert_accuracy` that retrospectively scores past alerts against
   subsequent price moves. No new schema — reads `alerts` + `market_prices_history`.

   Scoring logic (rule-based, deterministic):
   - For each alert older than 24 hours and younger than 7 days, look up the closing
     price of the affected stock at alert time (T) and 24 hours later (T+24h) using
     `market_prices_history`.
   - Score: CORRECT if direction matches (bullish signal + price up, bearish + price
     down), INCORRECT if direction opposite, NEUTRAL if price moved < 0.5%.
   - Aggregate: accuracy % = CORRECT / (CORRECT + INCORRECT), total alerts scored,
     avg absolute price move after signal.

   Output (per stock and aggregate):
   ```
   HIEU QUA CANH BAO (30 ngay qua)
   ────────────────────────────────
   VNM   Dung: 8 | Sai: 3 | Trung tinh: 2 | Chinh xac: 72.7%
         Bien dong tb sau tin hieu: +/- 1.8%
   FPT   Dung: 5 | Sai: 5 | Trung tinh: 1 | Chinh xac: 50.0%
   ...
   TONG  Chinh xac: 64% (34/53 tin hieu co the danh gia)
   ```

   Graceful degradation:
   - Alerts with no price history at T or T+24h are skipped (counted as "khong du
     lieu").
   - If fewer than 3 scoreable alerts exist, returns "Chua du du lieu de danh gia
     (can it nhat 3 canh bao da 24h)".

   Files:
   - CREATE: `src/interface/mcp/tools/alertAccuracyTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerAlertAccuracyTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/183-alert-accuracy.test.ts`

   Acceptance criteria:
   - A bullish alert followed by +1.5% price move scores CORRECT.
   - A bullish alert followed by -1.5% price move scores INCORRECT.
   - A signal followed by +0.3% move scores NEUTRAL.
   - Alerts < 24 hours old are excluded from scoring.
   - Output contains per-stock accuracy % and aggregate accuracy %.
   - No crash when `alerts` table is empty.
   - >= 14 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 37 to 38.

3. **Task 184 — Stock search / discovery MCP tool (P1)**

   New MCP tool `search_stocks` that queries a built-in static lookup table of
   ~150 major VN stocks (HOSE/HNX/UPCOM) and returns matches by ticker code,
   company name, or sector keyword. No external API, no new schema.

   The lookup table is a static TypeScript array embedded in the tool file — company
   name, exchange, sector (DomainType string), market cap tier (LARGE/MID/SMALL). The
   list covers all current watchlist stocks plus the top 100 by market cap on HOSE and
   30 on HNX/UPCOM.

   Search logic: case-insensitive substring match on code OR company name OR sector.
   Returns up to 20 results ranked: exact code match first, then prefix match on code,
   then name/sector contains match.

   Output:
   ```
   KET QUA TIM KIEM: "ngan hang" (12 ket qua)
   ───────────────────────────────────────────
   VCB   Vietcombank                  HOSE | banking    | LARGE
   BID   BIDV                         HOSE | banking    | LARGE
   CTG   VietinBank                   HOSE | banking    | LARGE
   MBB   Military Bank                HOSE | banking    | MID
   ...
   ```

   Each result includes a hint line: "Them vao danh sach: add_to_watchlist({ code:
   'VCB', exchange: 'HOSE' })".

   Files:
   - CREATE: `src/interface/mcp/tools/stockSearchTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerStockSearchTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/184-stock-search.test.ts`

   Acceptance criteria:
   - `search_stocks({ query: "VCB" })` returns Vietcombank as first result.
   - `search_stocks({ query: "ngan hang" })` returns at least 5 banking stocks.
   - `search_stocks({ query: "steel" })` returns HPG (Hoa Phat — steel).
   - `search_stocks({ query: "xyz999" })` returns "Khong tim thay ket qua".
   - Results capped at 20; if more match, output notes total count.
   - Each result includes the add_to_watchlist hint.
   - >= 12 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 38 to 39.

4. **Task 185 — Data freshness dashboard: `get_data_freshness` MCP tool (P1)**

   New MCP tool `get_data_freshness` that reports the last-updated timestamp and
   staleness status for every data source the system uses. No new schema — reads from
   existing tables.

   Sources tracked and where last-updated is derived:

   | Source | Table / mechanism | Stale threshold |
   |--------|-------------------|-----------------|
   | HOSE prices | MAX(updated_at) FROM market_prices | > 30 min during market hours |
   | HNX prices | MAX(updated_at) FROM market_prices WHERE exchange='HNX' | > 30 min |
   | News (CafeF/VnExpress/VnEconomy) | MAX(created_at) FROM rag_analyses | > 60 min |
   | Cascade / analysis | MAX(created_at) FROM rag_analyses WHERE level='action' | > 60 min |
   | Alerts | MAX(created_at) FROM alerts | > 120 min |
   | BCTC reports | MAX(created_at) FROM financial_reports | > 24 h |
   | Macro indicators | MAX(recorded_at) FROM commodity_prices_history | > 120 min |
   | Summaries | MAX(created_at) FROM periodic_summaries | > 25 h |

   Status labels: OK (within threshold), STALE (exceeded threshold), NO_DATA (table
   empty or column missing — non-fatal).

   Output:
   ```
   DO MOI DU LIEU (2026-04-01 09:15)
   ──────────────────────────────────
   Gia HOSE        OK      Cap nhat: 09:00 (15 phut truoc)
   Gia HNX         OK      Cap nhat: 09:00 (15 phut truoc)
   Tin tuc         OK      Cap nhat: 08:55 (20 phut truoc)
   Phan tich       STALE   Cap nhat: 07:30 (105 phut truoc) [!]
   Canh bao        OK      Cap nhat: 09:00 (15 phut truoc)
   Bao cao BCTC    OK      Cap nhat: hom qua 20:00
   Chi so vi mo    STALE   Cap nhat: 06:00 (195 phut truoc) [!]
   Tom tat         OK      Cap nhat: hom qua 22:30
   ```

   Files:
   - CREATE: `src/interface/mcp/tools/freshnessTools.ts`
   - MODIFY: `src/interface/mcp/server.ts` — register `registerFreshnessTools`
   - MODIFY: `src/interface/mcp/tools/index.ts` — add export
   - CREATE: `src/__tests__/185-data-freshness.test.ts`

   Acceptance criteria:
   - When MAX(updated_at) in `market_prices` is > 30 min ago during market hours,
     HOSE status is "STALE".
   - When MAX(updated_at) is within 30 min, status is "OK".
   - When a table is empty, status is "NO_DATA" and tool does not throw.
   - Output shows human-readable "X phut truoc" or "hom qua HH:MM" timestamps.
   - All 8 sources appear in output.
   - >= 14 tests, 0 failures.
   - `bun tsc --noEmit` → 0 errors.
   - Tool count increases from 39 to 40.

**OUT**

- LLM-based analysis or recommendations
- New external data sources
- Backtesting / simulation engine
- Real-time WebSocket price streaming
- Multi-tranche position management (one position per stock, as established in Sprint 023)
- Chart image rendering
- Email or Slack notifications (Telegram only)
- Alert feedback loop writes back to DB (accuracy is read-only scoring)

---

### Success Metrics

1. `get_portfolio_risk()` returns VaR, max drawdown, and portfolio heat for all open
   positions without errors. The investor can see daily risk posture in one MCP call.

2. `get_alert_accuracy()` scores at least the most recent 7 days of alerts and returns
   aggregate accuracy %. The investor can judge system reliability objectively.

3. `search_stocks({ query: "ngan hang" })` returns at least 5 banking stocks. The
   investor can discover and add any major VN stock without knowing its exact code.

4. `get_data_freshness()` shows STALE status correctly when intelligence cycle has not
   run for > 30 min. The investor never acts on unknown-age data again.

5. `bun tsc --noEmit` → 0 errors. All existing 1489 tests continue to pass.

6. Tool count: 36 → 40 (get_portfolio_risk, get_alert_accuracy, search_stocks,
   get_data_freshness).

---

### Task board (Sprint 024)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 182 | Portfolio risk metrics: VaR, max drawdown, heat map | P0 | Backlog | 179 (positions) |
| 183 | Alert accuracy tracker: outcome scoring | P0 | Backlog | — |
| 184 | Stock search / discovery MCP tool | P1 | Backlog | — |
| 185 | Data freshness dashboard MCP tool | P1 | Backlog | — |

---

### Dependency chain

```
182 (portfolio risk)    — P0, needs positions table from task 179 (Sprint 023, done)
183 (alert accuracy)    — P0, independent, start immediately
184 (stock search)      — P1, independent, start immediately
185 (data freshness)    — P1, independent, start immediately

182 + 183 can run in parallel (no shared files).
184 + 185 can run in parallel with each other and with 182/183.
All four tasks touch different tool files — no merge conflicts.
```

---

### Key technical decisions (locked at PO level)

- **Task 182 uses historical simulation VaR, not parametric VaR**: simpler to
  implement correctly with no additional dependencies. 20-day window is sufficient
  for an investor watching daily risk. Parametric VaR (normal distribution assumption)
  is deferred — VN stocks are not normally distributed.

- **Task 183 scoring is directional only**: the tool does not predict magnitude — it
  checks whether the bullish/bearish direction was correct. This avoids the complexity
  of defining "how much move counts as confirmed". The 0.5% neutral band is a
  configurable constant in the tool file.

- **Task 184 stock list is static TypeScript, not a DB table**: the list changes at
  most quarterly (delistings, IPOs). A static array is simpler to ship and test.
  No migration needed. If the user adds a stock not in the list, the watchlist tools
  still work — search is discovery only, not a gate.

- **Task 185 staleness thresholds are constants in the tool file** (not in
  mcp.config.json): they are tied to the tool's display logic and are unlikely to
  change independently of the tool. Keeping them co-located with the logic avoids
  config sprawl.

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
