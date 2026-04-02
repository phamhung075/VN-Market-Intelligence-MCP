# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 032
started: 2026-04-01
updated: 2026-04-01

---

### Theme

**"See More, Decide Faster — Multi-Stock Comparison and Weekly Portfolio Report"**

---

### Goal

The investor monitors VNM, FPT, VCB, and VEA but currently has no single view that places
them side by side. Sprint 032 builds a multi-stock comparison MCP tool so the investor can
compare 2-5 stocks on financials, current price, and live signal state in one call. It also
extends the existing Sunday weekly summary job to append a portfolio performance section and
push it to Telegram — closing the "how did my week go?" loop without opening Claude Desktop.

---

### Scope

**IN**

1. **Task 217 — Multi-stock comparison tool: `compare_stocks` (P0)**

   New MCP tool `compare_stocks` that accepts a list of 2-5 stock codes and returns a
   structured side-by-side comparison covering:

   | Dimension | Source |
   |-----------|--------|
   | Last price + % change (today) | HOSE/HNX fetcher |
   | P/E, P/B, ROE, ROA (latest BCTC) | `ratioComputer` via SQLite |
   | Revenue YoY delta, Net profit YoY delta | `periodDeltaComputer` via SQLite |
   | Active alerts count (HIGH + CRITICAL) | `alertStore` |
   | Conviction score (latest) | `convictionScorer` via SQLite |
   | Sector | `sectorPeers` mapping |

   Output format: plain Vietnamese text table, one row per stock, sortable column headers
   omitted (plain text, no markdown tables — same style as Telegram messages).

   The tool must handle the case where a stock has no BCTC data in SQLite — show "N/A" for
   financial columns rather than erroring. Handles 2-5 stocks; rejects fewer than 2 or more
   than 5 with a clear Vietnamese error message.

   Files:
   - ADD: `src/application/usecases/compareStocks.ts` — aggregation logic (pure, no I/O)
   - ADD: `src/interface/mcp/tools/comparisonTools.ts` — MCP tool registration
   - MODIFY: `src/interface/mcp/server.ts` — register new tool (54 total)
   - ADD: `src/__tests__/217-compare-stocks.test.ts` — unit + integration tests

2. **Task 218 — Weekly portfolio report via Telegram (P1)**

   Extend the existing Sunday 23:00 weekly summary (`summaryJobs.ts` + `generatePeriodicSummary.ts`)
   to append a **portfolio performance section** to the weekly Telegram message. The section
   includes:

   - Each watchlist stock: entry price (from `portfolio_positions` table), current price,
     unrealised P&L in VND and percent.
   - Portfolio total: sum of unrealised P&L, best performer, worst performer.
   - Week-over-week comparison: last Sunday close vs this Sunday close (uses stored price
     history rows already in SQLite from the intelligence cycle).

   The weekly Telegram push is currently absent — the summary is stored in SQLite but never
   sent. This task wires the send. The morning briefing Telegram send (already live) is the
   reference implementation.

   Files:
   - MODIFY: `src/application/usecases/generatePeriodicSummary.ts` — add portfolio section
     to weekly summary output string
   - ADD: `src/application/usecases/getWeeklyPortfolioPerf.ts` — pure function: reads
     `portfolio_positions` + `price_history`, returns per-stock and totals
   - MODIFY: `src/scheduler/summaryJobs.ts` — after Sunday weekly summary generated, send
     to Telegram via existing `sendTelegram()` helper
   - ADD: `src/__tests__/218-weekly-portfolio-report.test.ts` — unit tests for portfolio
     performance calculation and summary formatting

3. **Task 219 — Custom alert rules engine: `add_alert_rule` / `list_alert_rules` / `delete_alert_rule` (P2)**

   Let the investor define custom threshold conditions beyond the built-in price drop / volume
   spike signals. A custom rule is a simple predicate stored in SQLite:

   ```
   stock_code  TEXT
   metric      TEXT   -- "price_above", "price_below", "pe_above", "pe_below",
                      --  "volume_above", "roe_above"
   threshold   REAL
   message     TEXT   -- Vietnamese label shown in the alert
   enabled     BOOLEAN
   ```

   During the intelligence cycle's signal detection pass, custom rules are evaluated after
   built-in signals. A rule firing emits a new `custom_rule` signal type that goes through the
   same alert pipeline (dedup, cooldown, severity) as built-in signals.

   Three new MCP tools:
   - `add_alert_rule` — add a custom rule for a stock
   - `list_alert_rules` — show all rules (active + disabled)
   - `delete_alert_rule` — remove a rule by ID

   Files:
   - ADD: `src/infrastructure/db/alertRuleStore.ts` — CRUD for `custom_alert_rules` table
   - MODIFY: `src/infrastructure/db/schema.ts` — add `custom_alert_rules` table
   - MODIFY: `src/domain/services/signalDetector.ts` — evaluate custom rules after built-ins
   - ADD: `src/interface/mcp/tools/alertRuleTools.ts` — 3 new MCP tools
   - MODIFY: `src/interface/mcp/server.ts` — register 3 new tools (57 total)
   - ADD: `src/__tests__/219-custom-alert-rules.test.ts` — unit tests

**OUT**

- Automated backtesting — requires historical price storage not yet designed; deferred to Sprint 033+
- Watchlist auto-enrichment (sector peer suggestions) — nice-to-have; deferred to Sprint 033
- Long-poll Telegram fallback — deferred from Sprint 031; monitor webhook reliability first
- Inline keyboard / button UX in Telegram — plain text only
- LLM-generated commentary in comparison output — rule-based formatting only
- New data sources or fetchers

---

### Success Metrics

1. `compare_stocks` called with `["VNM","FPT","VCB","VEA"]` returns a response within 5
   seconds containing price, P/E, ROE, and alert count for each stock. Stocks without BCTC
   data show "N/A" — no error thrown.

2. Sunday 23:00 cron fires, generates weekly summary with portfolio P&L section, and sends
   the full message to Telegram. The Telegram message arrives on the investor's phone in
   France within 30 seconds of the cron tick.

3. `add_alert_rule` for `VCB price_below 85000` stores the rule. Next intelligence cycle
   where VCB price is below 85000 emits a `custom_rule` alert visible in `get_alerts`.

4. `bun test` full suite passes: existing 1809 tests + new tests for tasks 217-219, 0
   failures.

5. `bun tsc --noEmit` → 0 errors.

6. Tool count after Sprint 032: 57 (54 after task 217, +3 from task 219).

---

### Task board (Sprint 032)

| # | Title | Priority | Agent | Status | Depends on |
|---|-------|----------|-------|--------|------------|
| 217 | Multi-stock comparison tool: `compare_stocks` | P0 | BA → Architect → Dev | Backlog | — |
| 218 | Weekly portfolio report via Telegram | P1 | BA → Architect → Dev | Backlog | 217 (soft) |
| 219 | Custom alert rules engine | P2 | BA → Architect → Dev | Backlog | 218 (soft) |

---

### Dependency chain

```
217 (compare_stocks — standalone new tool)
  └─→ 218 (weekly report — reuses getPortfolioPnl patterns, independent of 217 code)
        └─→ 219 (custom rules — extends signal pipeline; most complex, closes sprint)
```

217 can start immediately. 218 is logically independent of 217 but shares the portfolio data
layer patterns reviewed in 217. 219 starts after 218 is in Review so the DB schema migration
pattern is established.

---

### Key technical decisions (locked at PO level)

- **compare_stocks is a pure aggregation tool**: it calls existing fetchers and SQLite
  readers but introduces no new data model. The use case layer (`compareStocks.ts`) holds the
  aggregation logic; the MCP tool layer holds only input validation and output formatting.

- **Weekly Telegram send uses existing `sendTelegram()` helper**: no new notifier code.
  The Sunday summary cron already runs; this sprint adds a single `await sendTelegram(msg)`
  call after the summary is stored. If Telegram send fails, the summary remains in SQLite —
  the failure is logged but does not block the cron.

- **Custom rules are evaluated client-side in the signal detector**: the rule engine is
  intentionally simple — no scripting language, no expression parser. Only the six metric
  types listed in scope are supported. The investor can add more metric types in a future
  sprint once usage patterns are clear.

- **Tool count target 57**: 53 (current) + 1 (compare_stocks, task 217) + 3 (alert rule
  tools, task 219) = 57. Task 218 adds no new MCP tools — it extends an existing cron job.

- **No new external data sources**: all data for compare_stocks comes from existing SQLite
  tables and the existing HOSE/HNX price fetchers already called by the intelligence cycle.

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
| 029 | Always-On Investor | 2026-04-02 | 208 (Telegram commands), 209 (P&L snapshot), 210 (source health) |
| 030 | Quality Before Quantity | 2026-04-02 | 211 (CLAUDE.md sync), 212 (worktree cleanup), 213 (test isolation) |
| 031 | Telegram Command Interface | 2026-04-02 | 214 (webhook + router), 215 (registration + security), 216 (integration tests) |
