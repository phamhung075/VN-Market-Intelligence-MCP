# Architecture Design: 1842a — Portfolio Backtesting Engine (U-8)

> **Status:** PENDING_PO_APPROVAL
> **Author:** architect
> **Sprint:** 1842 (design gate)
> **Created:** 2026-05-03

---

## 0. Executive Summary

**The most important finding of this design sprint is a data blocker.** The live `daily_ohlcv` table contains only 2 days of OHLCV data (2026-04-23 to 2026-04-24, 111 tickers). No 2025 price history exists in the database. Backtesting against 2025-01-01 to 2025-12-31 — the example call in the PO spec — is not possible until a historical price backfill is executed.

A second data issue: `kinhdich_readings` signals are stored in Vietnamese (`MUA`, `BAN`, `GIU`, `CHO`, `THAN TRONG`) not in the English `BUY`/`SELL`/`HOLD` that `hexagramBacktester.ts` already expects. The signal normalizer must handle both forms.

**Design decision:** Phase 1 of implementation is a data layer sprint — OHLCV backfill infrastructure and signal normalization. Phases 2 and 3 are blocked on Phase 1 completing. This splits the original SPRINT-L into three SPRINT-M tasks.

---

## 1. Data Availability Audit

### 1.1 OHLCV Price History — `daily_ohlcv`

| Metric | Live Value |
|--------|-----------|
| Earliest date | 2026-04-23 |
| Latest date | 2026-04-24 |
| Distinct tickers | 111 |
| Total rows | 219 |
| 2025 coverage | None |

The table DDL (in `schema-market-data.ts`) states the intent: "kept 2+ years for volatility analysis." The data is sparse because the VPS push handler in `pushPricesHandler.ts` only writes OHLCV from live price ticks going forward. No historical backfill has ever been executed beyond the `ohlcv_backfill_queue` mechanism introduced in Task 1361 / Sprint 123 — but that queue contains zero processed rows.

**Conclusion:** A minimum viable backtest requires at least 6 months of dense daily OHLCV data per ticker. The VNDirect API (already used by the system's fetcher tier via `hose.ts`) supports historical OHLCV queries. A dedicated backfill job must be written in Phase 1.

### 1.2 Kinh Dich Signals — `kinhdich_readings`

| Metric | Live Value |
|--------|-----------|
| Earliest timestamp | 2026-04-05 |
| Latest timestamp | 2026-04-28 |
| Distinct tickers | 49 |
| Total rows | 23,285 |
| Signals with direction | ~14,000 (MUA + BAN variants) |

Signal values in the database are Vietnamese: `MUA (tich cuc)`, `BAN (tich cuc)`, `GIU (tich cuc)`, `THAN TRONG (tich cuc)`, `CHO (tich cuc)`. The existing `hexagramBacktester.ts` domain service expects English `BUY`/`SELL`/`HOLD`/`WAIT`. A normalization adapter must map Vietnamese signal strings to the canonical English form.

Signal date range: ~23 days (April 2026 only). Meaningful backtesting requires signal data aligned with price data. Phase 1 cannot synthesize historical signals retroactively — Kinh Dich readings are computed on-demand from live price/fundamental inputs, not scraped from an external source. Therefore the initial backtesting window is bounded by the accumulation date: any backtest run before approximately 2027-04 will have fewer than 12 months of signal data.

**Minimum data requirement:** 3 months of simultaneous OHLCV + signals per ticker for any result to be statistically meaningful (at least 20 BUY or SELL events per ticker at the system's current 15-min cycle rate).

### 1.3 Agent Signals — `agent_signals`

Date range is only 2026-05-03 (single day). These are inter-agent coordination signals, not trading signals. They are not suitable as a backtesting signal source.

### 1.4 VN-Index Benchmark

No OHLCV for `VNINDEX` / `VNI` ticker exists in `daily_ohlcv`. The `vn_index_cache` table stores only snapshot JSON, not a time series. Phase 2 benchmark comparison requires backfilling VNI daily closes via the same backfill job (VNDirect returns VNI OHLCV under code `VN30` and `VNINDEX`).

### 1.5 TA Buy/Sell Signals

No historical TA signal log exists. The `technical-analysis` microservice computes indicators on request but does not persist signal events with timestamps. A `ta-buy-signal` strategy requires building a TA signal event store first (out of scope for this sprint, noted as a Phase 3 extension).

### 1.6 Gap Analysis Summary

| Data Required | Status | Blocker Level |
|---------------|--------|--------------|
| OHLCV history (6+ months) | Missing — 2 days only | CRITICAL — blocks all phases |
| Signal normalization (VI→EN) | Minor transform needed | Phase 1 fix, low complexity |
| Signal history (3+ months) | 23 days only | Soft — accumulates over time |
| VNI benchmark OHLCV | Missing | Blocks Phase 3 |
| TA signal event log | Does not exist | Blocks `ta-buy-signal` strategy |

---

## 2. Domain Interface Design

Following the repository pattern from Sprint 1838b (U-4). All interfaces live in `apps/mcp-server/src/domain/repositories/`. Zero imports from `infrastructure/`.

### 2.1 `IBacktestSignalRepository`

Replaces the direct `getReadingsForBacktest()` call in `hexagramStore.ts`. Accepts a date range instead of a days count, to align with the `run_backtest(strategy, start_date, end_date)` API.

```typescript
// apps/mcp-server/src/domain/repositories/IBacktestSignalRepository.ts

export type TradingSignalDirection = "BUY" | "SELL" | "HOLD" | "WAIT";

export interface BacktestSignal {
  /** Stock ticker, e.g. "VCB" */
  stockCode: string;
  /** ISO datetime string, e.g. "2026-04-05T18:20:22" */
  timestamp: string;
  /** Normalised English direction */
  direction: TradingSignalDirection;
  /** 0–1, Kinh Dich confidence or TA signal strength */
  confidence: number;
  /** Source strategy that produced this signal */
  strategy: string;
}

export interface IBacktestSignalRepository {
  /**
   * Fetch all signals for a given strategy within [startDate, endDate] (inclusive).
   * Returns signals sorted by timestamp ASC.
   */
  getSignals(
    strategy: string,
    startDate: string,
    endDate: string,
  ): BacktestSignal[];
}
```

### 2.2 `IBacktestPriceRepository`

Provides daily OHLCV by date range, used for entry/exit price lookup during simulation. Deliberately separate from the existing `IMarketPriceRepository` which deals with rolling average volume for alerts.

```typescript
// apps/mcp-server/src/domain/repositories/IBacktestPriceRepository.ts

export interface DailyCandle {
  date: string;   // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IBacktestPriceRepository {
  /**
   * Fetch daily OHLCV candles for a ticker within [startDate, endDate] inclusive.
   * Returns candles sorted by date ASC.
   * Returns [] when no data exists — caller must handle the sparse-data case.
   */
  getCandles(code: string, startDate: string, endDate: string): DailyCandle[];

  /**
   * Fetch the close price on the first available date >= targetDate.
   * Returns null when no data exists at or after targetDate.
   */
  getClosePriceOnOrAfter(code: string, targetDate: string): { date: string; close: number } | null;
}
```

### 2.3 `IBacktestResultRepository`

Persists completed backtest runs for audit trail and deduplication. Backtesting is computationally expensive; storing results lets agents query past runs instead of recomputing.

```typescript
// apps/mcp-server/src/domain/repositories/IBacktestResultRepository.ts

export interface BacktestRunRecord {
  id: string;           // UUID
  strategy: string;
  startDate: string;
  endDate: string;
  runAt: string;        // ISO datetime
  totalReturn: number;  // fraction, e.g. 0.15 = +15%
  benchmarkReturn: number | null;
  maxDrawdown: number;  // fraction, e.g. -0.12 = -12%
  sharpeRatio: number | null;
  winRate: number;      // fraction, 0–1
  tradeCount: number;
  resultJson: string;   // full BacktestReport serialised as JSON
}

export interface IBacktestResultRepository {
  /** Persist a completed backtest run. */
  saveRun(record: BacktestRunRecord): void;

  /** Retrieve runs for a given strategy, most-recent-first. */
  getRunsByStrategy(strategy: string, limit: number): BacktestRunRecord[];

  /** Retrieve a single run by ID. */
  getRunById(id: string): BacktestRunRecord | null;
}
```

---

## 3. Backtest Computation Design

The computation engine is a pure domain service — no I/O, no database imports. It extends the existing pattern established in `hexagramBacktester.ts`.

### 3.1 Entry / Exit Rule

| Decision point | Rule |
|---------------|------|
| Signal source | `kinhdich_readings` timestamp (when signal was generated) |
| Trade entry | Next available trading day open (T+1 open). This avoids look-ahead bias — the signal at T cannot be acted on at T close. |
| Trade exit | Fixed hold: 5 trading days after entry (configurable, default 5). Alternatively, a subsequent opposing signal for the same ticker. |
| Signal filter | Only `BUY` and `SELL` signals generate trades. `HOLD`/`WAIT` are no-ops in Phase 1. |
| Confidence filter | Per-strategy minimum confidence threshold (default 0.0 in Phase 1, configurable in Phase 3). |

### 3.2 Position Sizing

Phase 1: equal-weight per open trade. If N tickers have open BUY signals on the same date, each receives 1/N of the portfolio. This avoids needing confidence-weighted allocation logic before we have statistical signal quality data.

Phase 3: confidence-weighted allocation (`weight = confidence / sum(all open confidences)`).

### 3.3 Metrics — Exact Formulas

All metrics computed by the pure domain service `BacktestEngine` over the `TradeLog`:

```
portfolio_return = (final_value - initial_value) / initial_value

For drawdown:
  equity_curve = time-series of portfolio value day by day
  running_max[t] = max(equity_curve[0..t])
  drawdown[t] = (equity_curve[t] - running_max[t]) / running_max[t]
  max_drawdown = min(drawdown[t]) across all t

For Sharpe (annualised, risk-free rate = 0):
  daily_returns[t] = (equity_curve[t] - equity_curve[t-1]) / equity_curve[t-1]
  sharpe = mean(daily_returns) / stddev(daily_returns) * sqrt(252)
  Returns null when stddev = 0 (flat equity curve, e.g. no trades executed)

win_rate = trades_where_close_price_at_exit > entry_price / total_directional_trades
trade_count = count of BUY + SELL signal events that resulted in a completed round trip
```

### 3.4 Benchmark Comparison

VNI benchmark return computed using `IBacktestPriceRepository.getCandles("VNINDEX", startDate, endDate)`. If VNI data is absent (Phase 1), `benchmarkReturn` is `null` in the output — not an error.

---

## 4. Strategy Registry Design

### 4.1 Strategy Definition

Strategies are registered as a plain TypeScript `Record<string, StrategyDefinition>` constant in `domain/backtesting/strategyRegistry.ts`. No database config, no plugin system — keeps it auditable and testable.

```typescript
export interface StrategyDefinition {
  id: string;
  description: string;
  /** Maps a raw signal row to a BacktestSignal. Returns null to exclude the row. */
  signalFilter(row: RawSignalRow): BacktestSignal | null;
  /** Minimum confidence to include. Applied after signalFilter. Default: 0. */
  minConfidence: number;
  /** Hold period in trading days. Default: 5. */
  holdDays: number;
}
```

### 4.2 Initial Supported Strategies (Phase 1 + 2)

| Strategy ID | Signal source | Filter rule | Phase |
|-------------|---------------|-------------|-------|
| `kinh-dich-high-confidence` | `kinhdich_readings` | BUY or SELL signals with confidence >= 0.7 | 1 |
| `kinh-dich-all` | `kinhdich_readings` | All BUY or SELL signals regardless of confidence | 2 |
| `combined-high-confidence` | `kinhdich_readings` (combined) | BUY signals where both hexagram and TA confirm direction | 3 |
| `ta-buy-signal` | TA signal event log (not yet built) | Blocked until TA signal store exists | 3+ |

### 4.3 Strategy Name Resolution

The `run_backtest` use case calls `strategyRegistry[strategy]` to get the `StrategyDefinition`. If the key is absent, it throws a `BacktestStrategyNotFoundError` (domain error, no I/O). This is caught by the MCP tool handler and returned as a user-readable error message.

### 4.4 Vietnamese Signal Normalization

A helper `normalizeSignal(raw: string): TradingSignalDirection` handles the VI→EN mapping:

```
MUA (any suffix)         → BUY
BAN (any suffix)         → SELL
GIU (any suffix)         → HOLD
THAN TRONG (any suffix)  → WAIT
CHO (any suffix)         → WAIT
BUY / SELL / HOLD / WAIT → pass-through (already English)
```

This helper lives in `domain/backtesting/signalNormalizer.ts` — pure function, zero I/O.

---

## 5. Service Placement

### 5.1 Options Evaluated

| Option | Language | Data locality | Deployment cost | Decision |
|--------|----------|--------------|-----------------|----------|
| New `apps/backtesting-service/` (Python) | Python | Remote HTTP to stock-price | New container, new port, more operational overhead | Rejected |
| Extension of `apps/technical-analysis/` | TypeScript | Remote HTTP to stock-price | Adds responsibility to wrong service | Rejected |
| New domain module inside `apps/mcp-server/` | TypeScript | Direct SQLite (same DB) | Zero new containers | **Selected** |

### 5.2 Rationale

The backtesting engine reads from `daily_ohlcv` and `kinhdich_readings` — both in the same `market.db` SQLite file that `apps/mcp-server/` already owns. Routing through a microservice boundary introduces HTTP latency and serialization overhead that is unjustified for a computation that runs once per user request against a local file.

TypeScript is consistent with the existing MCP tool layer and domain service patterns. The computation in `hexagramBacktester.ts` (already 200 lines, pure TypeScript) proves the language is adequate.

A new microservice would be warranted only if the engine needed Python's scientific stack (NumPy, Pandas, statsmodels). The required metrics (return, drawdown, Sharpe) are simple enough in TypeScript without any scientific library.

### 5.3 Folder Structure

```
apps/mcp-server/src/
  domain/
    backtesting/                          NEW
      models.ts                           — BacktestParams, BacktestReport, TradeLog, etc.
      strategyRegistry.ts                 — StrategyDefinition + registry constant
      signalNormalizer.ts                 — VI→EN signal normalization
      backtestEngine.ts                   — pure computation: simulate, compute metrics
    repositories/
      IBacktestSignalRepository.ts        NEW — port (Phase 1)
      IBacktestPriceRepository.ts         NEW — port (Phase 1)
      IBacktestResultRepository.ts        NEW — port (Phase 1)
      index.ts                            EXTEND — add exports
  infrastructure/
    db/
      backtestPriceRepo.ts                NEW — SQLite impl of IBacktestPriceRepository
      backtestSignalRepo.ts               NEW — SQLite impl of IBacktestSignalRepository
      backtestResultRepo.ts               NEW — SQLite impl of IBacktestResultRepository
      schema-backtesting.ts               NEW — DDL for backtest_runs table
    fetchers/
      ohlcvBackfill.ts                    NEW — VNDirect historical OHLCV backfill
  application/
    usecases/
      runBacktest.ts                      NEW — orchestrate: validate params → load signals → load prices → engine → persist
  interface/
    mcp/
      tools/
        backtesting/
          backtestTools.ts                NEW — MCP tool handler for run_backtest
          index.ts                        NEW — barrel export registerBacktestTools
```

---

## 6. MCP Tool Specification

### 6.1 Tool: `run_backtest` (Tool #120)

```typescript
// interface/mcp/tools/backtesting/backtestTools.ts

server.tool(
  "run_backtest",
  "Replay historical trading signals against actual prices to compute strategy performance metrics. " +
  "Returns portfolio return, max drawdown, Sharpe ratio, and win rate. " +
  "Requires at least 6 months of OHLCV data for the requested date range.",
  {
    strategy: z.enum([
      "kinh-dich-high-confidence",
      "kinh-dich-all",
      "combined-high-confidence",
    ]).describe(
      "Strategy ID to backtest. " +
      "'kinh-dich-high-confidence' = Kinh Dich BUY/SELL signals with confidence >= 0.7. " +
      "'kinh-dich-all' = all Kinh Dich BUY/SELL signals. " +
      "'combined-high-confidence' = Kinh Dich + TA confirmation."
    ),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date YYYY-MM-DD"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date YYYY-MM-DD"),
    tickers: z.array(z.string().min(2).max(10)).optional().describe(
      "Optional list of tickers to restrict backtest to. Defaults to all watchlist tickers."
    ),
  },
  async (args) => {
    // ... handler body
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);
```

### 6.2 Output Schema — `BacktestReport`

```typescript
export interface TradeRecord {
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  direction: "BUY" | "SELL";
  returnPct: number;
  confidence: number;
}

export interface BacktestReport {
  /** Strategy that was tested */
  strategy: string;
  startDate: string;
  endDate: string;
  /** ISO datetime this run was executed */
  runAt: string;
  /** Total portfolio return as a fraction, e.g. 0.15 = +15% */
  totalReturnPct: number;
  /** VNI benchmark return over same period (null if VNI data absent) */
  benchmarkReturnPct: number | null;
  /** Max drawdown as a fraction, e.g. -0.12 = -12% */
  maxDrawdown: number;
  /** Annualised Sharpe ratio (risk-free = 0). Null when stddev = 0. */
  sharpeRatio: number | null;
  /** Fraction of closed trades with positive return (0–1) */
  winRate: number;
  /** Number of completed round-trip trades */
  tradeCount: number;
  /** Summary per ticker */
  byTicker: Array<{
    code: string;
    tradeCount: number;
    winRate: number;
    totalReturnPct: number;
  }>;
  /** Full trade log (capped at 200 rows in MCP response) */
  trades: TradeRecord[];
  /** Human-readable warning when data is insufficient */
  warnings: string[];
}
```

### 6.3 Latency and Concurrency

A full backtest over 30 watchlist tickers × 252 trading days = ~7,560 OHLCV lookups and ~N signal evaluations. With SQLite reads all on the same local file, expected latency is **200–800ms**. This is synchronous — no job queue needed for Phase 1.

Rate limit: 1 concurrent backtest per server instance (enforced via an in-memory mutex flag in the use case). If a second call arrives while one is running, return an HTTP 429-equivalent MCP error: `"Backtest already in progress. Retry in a few seconds."`.

---

## 7. Phased Implementation Plan

### Phase 1 — Data Layer (SPRINT-M, 1 sprint)

**Goal:** Data infrastructure that makes backtesting possible. No computation engine yet.

Tasks:
1. **1842b** (SPRINT-M): OHLCV historical backfill
   - Write `ohlcvBackfill.ts` fetcher using VNDirect API to populate `daily_ohlcv` for all 111 watchlist tickers, 2-year lookback (2024-01-01 to present)
   - Write `schema-backtesting.ts` with `backtest_runs` DDL
   - Write the 3 repository interfaces: `IBacktestSignalRepository`, `IBacktestPriceRepository`, `IBacktestResultRepository`
   - Write SQLite implementations: `backtestPriceRepo.ts`, `backtestSignalRepo.ts`, `backtestResultRepo.ts`
   - Include `signalNormalizer.ts` (VI→EN, pure function)
   - Unit tests: all 3 repos tested with in-memory SQLite fixtures
   - **AC:** `SELECT COUNT(*) FROM daily_ohlcv` returns >50,000 rows after backfill runs

2. **1842c** (SPRINT-S): Backfill scheduler job
   - Cron job: runs once on startup + nightly to patch any gaps
   - VNI backfill: fetch `VNINDEX` OHLCV and store under code `VNINDEX` in `daily_ohlcv`

### Phase 2 — Computation Engine (SPRINT-M, 1 sprint)

**Goal:** Working engine for single-strategy backtest with 4 metrics. MCP tool wired.

Tasks:
3. **1842d** (SPRINT-M): Engine + MCP tool
   - Write `domain/backtesting/models.ts`, `backtestEngine.ts`
   - Write `strategyRegistry.ts` with `kinh-dich-high-confidence` and `kinh-dich-all`
   - Write `application/usecases/runBacktest.ts`
   - Write `backtestTools.ts` MCP tool (tool #120)
   - Register `registerBacktestTools` in `registry.ts`
   - Unit tests: engine tested against fixture data (at least 3 scenarios: all wins, all losses, mixed)
   - **AC:** `run_backtest("kinh-dich-high-confidence", "2026-04-05", "2026-04-28")` returns a non-empty BacktestReport

### Phase 3 — Full Metrics + Benchmark (SPRINT-S, 1 sprint)

**Goal:** Sharpe ratio, benchmark comparison, confidence-weighted allocation, extended strategy registry.

Tasks:
4. **1842e** (SPRINT-S): Metrics + benchmark
   - Sharpe ratio computation (requires equity curve, not just final return)
   - VNI benchmark comparison (uses VNI OHLCV backfilled in Phase 1)
   - Confidence-weighted position sizing
   - Add `combined-high-confidence` strategy
   - `IBacktestResultRepository` persistence (save runs for audit)
   - **AC:** `run_backtest` returns non-null `benchmarkReturnPct` and `sharpeRatio`

---

## 8. Risk Assessment

### 8.1 Data Sparsity Handling

The engine MUST NOT error on missing price data — it must degrade gracefully:
- If entry price for a signal is missing (`getClosePriceOnOrAfter` returns null): skip the trade, add to `warnings[]`
- If fewer than 5 price points exist for a ticker in the date range: skip ticker entirely, add to `warnings[]`
- If no trades were executed at all: return a valid report with `tradeCount = 0`, `winRate = 0`, `totalReturnPct = 0`, and a warning: `"No trades executed — insufficient data for requested date range. Run OHLCV backfill first."`
- If the date range has less than 10 trading days: the report is returned but a warning is added: `"Short date range — results may not be statistically meaningful"`

### 8.2 Read-Only Guarantee

The backtesting domain service and use case accept only the repository interfaces as dependencies. The `IBacktestPriceRepository` and `IBacktestSignalRepository` interfaces expose only read methods (`getCandles`, `getSignals`). The only write-path is `IBacktestResultRepository.saveRun()`, which writes to the dedicated `backtest_runs` table — a new table that does not touch `daily_ohlcv`, `kinhdich_readings`, `positions`, `market_prices`, or any live signal data.

The MCP tool handler MUST NOT receive a write-capable dependency for any live-data table.

### 8.3 Test Strategy

Three test tiers:

**Unit tests (domain layer) — in-memory, no DB:**
- `signalNormalizer.test.ts`: test all Vietnamese signal variants + pass-through
- `backtestEngine.test.ts`: fixture with 10 known BUY signals, 10 SELL signals, known price history → assert exact return%, winRate, drawdown
- Edge cases: empty signal set, all signals filtered out, single-day range, confidence below threshold

**Integration tests (infrastructure layer) — in-memory SQLite:**
- `backtestPriceRepo.test.ts`: insert fixture candles, assert getCandles returns correct date range
- `backtestSignalRepo.test.ts`: insert fixture kinhdich_readings (Vietnamese signals), assert normalisation works end-to-end
- `backtestResultRepo.test.ts`: saveRun + getRunById round-trip

**E2E test (MCP tool) — full server, in-memory DB:**
- `run_backtest` with seed data: assert BacktestReport structure matches schema, no null exceptions when data is sparse

### 8.4 Additional Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| VNDirect API rate limit during backfill | Medium | Batch requests: 1 request per ticker, 200ms delay between tickers. Checkpoint state so restart can resume. |
| Docker container stops during backfill (2-year × 111 tickers ≈ 20,000 API calls) | High | Idempotent upsert (`INSERT OR IGNORE`), resume from last fetched date per ticker via `ohlcv_backfill_queue` |
| Kinhdich readings only cover 49 of 111 OHLCV tickers | Low | Backtest result per ticker is skipped if no signals exist; report includes `warnings[]` |
| Clock skew: signal generated after market close but dated same day | Low | Use T+1 open as entry price — this rule absorbs ±1 day timing ambiguity |

---

## 9. Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|---------|
| AC-1: Design document created | DONE | This file |
| AC-2: Domain interfaces for all 3 repositories | DONE | Section 2: IBacktestSignalRepository, IBacktestPriceRepository, IBacktestResultRepository |
| AC-3: Data availability verified | DONE | Section 1: live DB queried — 2 days OHLCV, 23 days signals, VNI absent |
| AC-4: Service placement with rationale | DONE | Section 5: inside mcp-server domain module, 4 options evaluated |
| AC-5: MCP tool schema (input + output) | DONE | Section 6: Zod input schema + BacktestReport TypeScript type |
| AC-6: Phased plan, 3 phases, each sized | DONE | Section 7: Phase 1 = SPRINT-M, Phase 2 = SPRINT-M, Phase 3 = SPRINT-S |
| AC-7: Risk assessment | DONE | Section 8: sparsity, read-only, test strategy, additional risks |
| AC-8: No implementation written | CONFIRMED | Design document only |

---

## 10. Implementation Sprint Summary

| Sprint task | Type | Deliverable | Blocked by |
|-------------|------|-------------|-----------|
| 1842b | SPRINT-M | OHLCV backfill + 3 repository interfaces + SQLite impls | None |
| 1842c | SPRINT-S | Nightly backfill cron + VNI backfill | 1842b |
| 1842d | SPRINT-M | Computation engine + MCP tool #120 + 2 strategies | 1842b |
| 1842e | SPRINT-S | Sharpe + benchmark + confidence-weighted allocation | 1842b, 1842c, 1842d |

**Total implementation effort:** 2 SPRINT-M + 2 SPRINT-S = approximately one SPRINT-L (matches U-8 sizing estimate).

The critical path is: 1842b → 1842c + 1842d (parallel) → 1842e.
