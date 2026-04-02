# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 034
started: 2026-04-02
updated: 2026-04-02

---

### Theme

**"Depth Over Breadth — Sentiment Trend Intelligence + Context Sync"**

---

### Goal

The system has 61 tools and 1916 tests. Adding more tools delivers diminishing returns. Sprint
034 invests in depth: (1) close the institutional memory gap by syncing CLAUDE.md through
Sprint 033, and (2) surface the most under-exploited signal already in the database — per-stock
sentiment trend over time — making the investor's existing RAG and SQLite data answer the
question "is the market turning bullish or bearish on VNM this week?"

---

### Scope

**IN**

1. **Task 224 — CLAUDE.md sync: document Sprints 030-033 additions (P0)**

   CLAUDE.md currently documents through Sprint 029. Sprints 030-033 added 14 tasks across
   6 capability areas: Telegram command interface (214-216), multi-stock comparison (217),
   weekly portfolio Telegram report (218), custom alert rules engine (219), watchlist peer
   suggestions (220), alert snooze/mute (222), and portfolio target allocation (223).

   The sync must update:
   - "Current implementation status" — Done section listing all new tasks
   - Architecture summary — new files: `snoozeStore.ts`, `targetAllocationStore.ts`,
     `allocationTools.ts`, `snoozeTools.ts`, `telegramWebhook.ts`, `customAlertRules.ts`,
     `compareStocksTools.ts`, `weeklyPortfolioJob.ts`
   - Scheduled Jobs table — weekly portfolio Telegram job (Sunday 22:00)
   - Tool count: 61 registered MCP tools

   Files:
   - MODIFY: `CLAUDE.md` — sync all sections through Sprint 033

2. **Task 225 — Sentiment trend per stock: `get_sentiment_trend` MCP tool (P1)**

   The `analysis_entries` table already stores per-stock `sentiment` (bullish/bearish/neutral)
   with `created_at` timestamps, produced by `sentimentClassifier.ts` on every news poll.
   Today the investor has no way to query this time series.

   New MCP tool `get_sentiment_trend` accepts:
   - `stock_code` (required): e.g. "VNM"
   - `window_days` (optional, default 7): lookback window — 7, 14, or 30

   The tool queries `analysis_entries` for rows mentioning `stock_code` within the window,
   groups them by day, computes a daily sentiment score (bullish=+1, neutral=0, bearish=-1),
   and returns:
   - Daily breakdown: date, count, bullish%, bearish%, neutral%, net score
   - Trend direction: "improving" | "deteriorating" | "stable" (based on linear regression
     slope of net score over the window)
   - Summary sentence in Vietnamese, e.g.:
     "VNM: 7 ngay qua co xu huong tich cuc (4 ngay bullish, 2 ngay neutral, 1 ngay bearish).
      Xu huong: dang cai thien."

   Storage: no new table required. The tool reads from existing `analysis_entries`.
   A lightweight in-memory slope computation (no external math library needed).

   Files:
   - ADD: `src/domain/services/sentimentTrend.ts` — pure function: `computeSentimentTrend(entries, windowDays)` → trend object
   - ADD: `src/interface/mcp/tools/sentimentTrendTools.ts` — `get_sentiment_trend` MCP tool
   - MODIFY: `src/interface/mcp/server.ts` — register 1 new tool (62 total)
   - ADD: `src/__tests__/225-sentiment-trend.test.ts` — unit tests for trend computation and
     MCP tool response formatting

**OUT**

- Historical OHLCV chart data endpoint — requires structured price history redesign; Sprint 035+
- Automated backtesting — depends on OHLCV history being solid; deferred
- Multi-timeframe analysis (1D/1W/1M views) — partially covered by existing pattern matcher
  and periodic summaries; not the highest gap
- New external data sources
- LLM-generated text in any output

---

### Success Metrics

1. `CLAUDE.md` accurately lists all tasks through Sprint 033, all new files in the architecture
   summary, correct tool count of 61, and the weekly portfolio Telegram cron job.

2. `get_sentiment_trend VNM 7` returns a structured response with per-day sentiment breakdown
   for the last 7 days, a trend direction label, and a Vietnamese summary sentence. When there
   are fewer than 3 data points, the tool returns a graceful "Du lieu khong du" message rather
   than an error.

3. `bun test` full suite passes: existing 1916 tests + new tests for tasks 224/225, 0 failures.

4. `bun tsc --noEmit` → 0 errors.

5. Tool count after Sprint 034: 62 (task 224 adds 0 tools; task 225 adds 1 tool).

---

### Task board (Sprint 034)

| # | Title | Priority | Agent | Status | Depends on |
|---|-------|----------|-------|--------|------------|
| 224 | CLAUDE.md sync: document Sprints 030-033 | P0 | BA | Backlog | — |
| 225 | Sentiment trend per stock: `get_sentiment_trend` | P1 | BA | Backlog | 224 (soft) |

---

### Dependency chain

```
224 (CLAUDE.md sync — documentation only, no code changes; standalone)
  └─→ 225 (sentiment trend — new domain service + MCP tool; benefits from 224 being
            complete so the new tool is immediately documented)
```

224 and 225 can proceed in parallel. 225 should target merge after 224 so CLAUDE.md is
updated in one pass.

---

### Key technical decisions (locked at PO level)

- **No new SQLite table for sentiment trend**: `analysis_entries` already contains the
  required fields (`stock_code`, `sentiment`, `created_at`). A pure read-path query
  avoids schema migration risk.

- **Linear regression slope for trend direction**: a simple least-squares slope over the
  daily net sentiment scores is sufficient and avoids any external math dependency. Positive
  slope = "improving", negative = "deteriorating", near-zero (|slope| < 0.05) = "stable".

- **Tool count target 62**: 61 (current after Sprint 033) + 0 (task 224) + 1 (task 225) = 62.

- **`window_days` capped at 30**: beyond 30 days the signal-to-noise ratio of sentiment
  entries degrades because the RAG store prunes old embeddings. The tool rejects values
  outside 1–30 with a clear error message.

---

## Previous Sprint

status: COMPLETE
sprint_id: 033
started: 2026-04-01
updated: 2026-04-02
completed: 2026-04-02

### Theme

**"Investor UX Hardening — Smarter Watchlist, Quieter Alerts, Persistent Targets"**

---

### Goal

The investor's three most common friction points are: (1) manually looking up sector peers
when adding a new stock to the watchlist, (2) being flooded with expected alerts during
earnings season when a stock is naturally volatile, and (3) re-entering target portfolio
weights every time the rebalancing tool is called. Sprint 033 eliminates all three frictions
with three tightly scoped additions that build exclusively on existing infrastructure.

---

### Scope

**IN**

1. **Task 220 — Watchlist auto-enrichment: sector peer suggestions on `add_to_watchlist` (P0)**

   When the investor calls `add_to_watchlist` with stock code `VCB`, the response appends a
   suggestion block listing the top 2-3 sector peers from `sectorPeers.ts` that are not yet
   on the watchlist. Example response suffix:

   ```
   Da them VCB (banking) vao danh sach theo doi.
   Goi y them cac co phieu cung nganh: BID, CTG, MBB
   (Dung add_to_watchlist de them tung ma.)
   ```

   The suggestion is informational only — it does not add peers automatically. No new MCP
   tool is added; the existing `add_to_watchlist` tool response is enriched.

   Files:
   - MODIFY: `src/domain/services/sectorPeers.ts` — add `getSectorPeers(stockCode): string[]`
     helper that returns top peers excluding the stock itself
   - MODIFY: `src/interface/mcp/tools/watchlist.ts` — after successful add, call
     `getSectorPeers`, filter against current watchlist, append suggestion text
   - ADD: `src/__tests__/220-watchlist-peer-suggestions.test.ts` — unit tests for peer
     suggestion logic and response formatting

2. **Task 222 — Alert snooze/mute: `snooze_alerts` / `unmute_alerts` MCP tools (P1)**

   Let the investor temporarily silence alerts for a stock without removing it from the
   watchlist. A snooze record is stored in a new `alert_snooze` SQLite table:

   ```
   stock_code   TEXT
   snoozed_until  INTEGER  -- Unix timestamp; NULL = muted indefinitely
   reason       TEXT       -- investor-supplied label ("Q1 earnings volatility")
   created_at   INTEGER
   ```

   During `sendAlerts()` in the intelligence cycle, any alert whose stock code has an active
   snooze record (snoozed_until > now, or NULL) is skipped for Telegram dispatch but still
   stored in SQLite. Skipped alerts are marked with `notified = -1` (new sentinel for
   "snoozed") so they are distinguishable from unnotified (`0`) and notified (`1`).

   Two new MCP tools:
   - `snooze_alerts` — snooze a stock for N hours (or indefinitely). Returns confirmation
     with snooze expiry in Vietnamese (e.g., "VCB da tam tat thong bao den 15:00 ngay 03/04").
   - `unmute_alerts` — lift an active snooze immediately.

   `get_alerts` response prepends a warning line when any watchlist stock is currently snoozed:
   "Luu y: VCB dang tam tat thong bao (den 15:00 03/04)."

   Files:
   - MODIFY: `src/infrastructure/db/schema.ts` — add `alert_snooze` table
   - ADD: `src/infrastructure/db/snoozeStore.ts` — CRUD for snooze records
   - MODIFY: `src/scheduler/intelligenceCycleJob.ts` (or `alertStore.ts` sendAlerts path) —
     check snooze before dispatching each alert to Telegram
   - MODIFY: `src/interface/mcp/tools/alerts.ts` — prepend active snooze warnings to
     `get_alerts` response
   - ADD: `src/interface/mcp/tools/snoozeTools.ts` — 2 new MCP tools
   - MODIFY: `src/interface/mcp/server.ts` — register 2 new tools (59 total)
   - ADD: `src/__tests__/222-alert-snooze.test.ts` — unit tests

3. **Task 223 — Portfolio target allocation: `set_target_allocation` / `get_target_allocation` MCP tools (P2)**

   Store the investor's target portfolio weights in SQLite so that `get_rebalancing_signals`
   (task 195) and future rebalancing calls do not require the investor to re-specify weights
   each time. A target allocation record is simple:

   ```
   stock_code   TEXT PRIMARY KEY
   target_pct   REAL   -- 0.0–100.0
   updated_at   INTEGER
   ```

   Weights are investor-managed; the system does not auto-normalise. If weights sum to != 100,
   a warning is included in the response ("Tong trong so hien tai: 95%. Kiem tra lai.").

   Two new MCP tools:
   - `set_target_allocation` — set or update the target weight for one or more stocks.
     Accepts a list of `{stock_code, target_pct}` pairs.
   - `get_target_allocation` — return current targets, actual weights (from
     `portfolio_positions` market value), and deviation from target for each stock.

   `get_rebalancing_signals` is extended to read from `target_allocations` when no explicit
   targets are supplied in the call — making targets the new default source of truth.

   Files:
   - MODIFY: `src/infrastructure/db/schema.ts` — add `target_allocations` table
   - ADD: `src/infrastructure/db/targetAllocationStore.ts` — CRUD
   - MODIFY: `src/application/usecases/getRebalancingSignals.ts` (task 195) — fall back to
     `target_allocations` when no explicit targets provided
   - ADD: `src/interface/mcp/tools/allocationTools.ts` — 2 new MCP tools
   - MODIFY: `src/interface/mcp/server.ts` — register 2 new tools (61 total)
   - ADD: `src/__tests__/223-target-allocation.test.ts` — unit tests

**OUT**

- Historical OHLCV chart data endpoint — requires structured price history redesign; Sprint 034+
- News sentiment trend per stock — valuable but depends on RAG query patterns not yet indexed by stock; Sprint 034+
- Auto-add peers (only suggest, never add automatically) — avoids watchlist pollution
- LLM-generated text in any output — rule-based only
- New external data sources

---

### Success Metrics

1. `add_to_watchlist` with code `VCB` returns a response that includes a suggestion naming
   at least 2 sector peers (e.g., BID, CTG) that are not already on the watchlist. If all
   peers are already on the watchlist, no suggestion block appears.

2. `snooze_alerts VNM 4` silences VNM Telegram alerts for 4 hours. During that window the
   intelligence cycle stores VNM alerts in SQLite with `notified = -1`. After 4 hours the
   snooze expires and alerts resume normally. `unmute_alerts VNM` lifts the snooze immediately.

3. `set_target_allocation [{VNM: 25}, {FPT: 30}, {VCB: 30}, {VEA: 15}]` stores 4 rows.
   Subsequent `get_rebalancing_signals` call with no explicit targets reads from
   `target_allocations` and returns deviation from target for each stock.

4. `bun test` full suite passes: existing 1864 tests + new tests for tasks 220/222/223, 0
   failures.

5. `bun tsc --noEmit` → 0 errors.

6. Tool count after Sprint 033: 61 (59 after task 222, +2 from task 223). Task 220 adds no
   new MCP tools.

---

### Task board (Sprint 033)

| # | Title | Priority | Agent | Status | Depends on |
|---|-------|----------|-------|--------|------------|
| 220 | Watchlist auto-enrichment: sector peer suggestions | P0 | BA → Architect → Dev | Backlog | — |
| 222 | Alert snooze/mute: `snooze_alerts` / `unmute_alerts` | P1 | BA → Architect → Dev | Backlog | — |
| 223 | Portfolio target allocation: `set_target_allocation` / `get_target_allocation` | P2 | BA → Architect → Dev | Backlog | 195 (soft) |

---

### Dependency chain

```
220 (watchlist enrichment — touches sectorPeers + watchlist tool only; standalone)
222 (snooze — new DB table + intelligence cycle hook; standalone)
  └─→ 223 (target allocation — new DB table + rebalancing integration; benefits from 222
            DB migration pattern being established first)
```

220 and 222 can proceed in parallel. 223 starts after 222 is in Review so the DB schema
migration pattern (new table + CRUD store) is established and reviewable before 223 repeats it.

---

### Key technical decisions (locked at PO level)

- **Peer suggestions are response-only**: `getSectorPeers()` is a pure function returning
  stock codes. No new data is stored. The suggestion is appended to the existing
  `add_to_watchlist` response string — no schema changes required for task 220.

- **Snooze sentinel `notified = -1`**: the existing `alerts` table already has a `notified`
  INTEGER column (0/1). Using -1 as a snooze sentinel avoids a schema change to the `alerts`
  table itself. Only the new `alert_snooze` table and the dispatch check are added.

- **Target allocation weights are advisory**: the system stores them as supplied. It warns
  when the sum deviates from 100% but does not block the save. This keeps the tool fast and
  avoids edge cases where the investor is mid-edit.

- **Tool count target 61**: 57 (current after Sprint 032) + 0 (task 220) + 2 (snooze tools,
  task 222) + 2 (allocation tools, task 223) = 61.

- **No new external data sources or fetchers**: all three tasks operate on data already
  present in SQLite or domain services.

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
| 032 | See More, Decide Faster | 2026-04-02 | 217 (compare_stocks), 218 (weekly portfolio Telegram), 219 (custom alert rules) |
| 033 | Investor UX Hardening | 2026-04-02 | 220 (watchlist peer suggestions), 222 (alert snooze/mute), 223 (target allocation) |
