# TASK 1842d — BacktestEngine + MCP tool #120 (run_backtest)

> **Sprint:** 1842 | **Task ID:** 1842d | **Type:** SPRINT-M
> **Owner:** developer | **Created by:** pm | **Date:** 2026-05-03
> **Priority:** P1
> **Depends on:** 1842b (DONE), 1842c (DONE)
> **Blocks:** 1842e

---

## Context

1842b delivered the three repository interfaces (`IBacktestSignalRepository`, `IBacktestPriceRepository`, `IBacktestResultRepository`), their SQLite implementations, and the OHLCV backfill infrastructure. 1842c delivered the `VNSignalAdapter` (VI→EN normalizer) and wired it into the Kinh Dich write path.

This task builds Phase 2: the pure computation engine, the orchestration use case, and the MCP tool that exposes it as tool #120.

Architecture reference: `docs/architecture/1842a-backtesting-engine.md` — Sections 3, 4, 5, 6, 7 (Phase 2).

---

## Scope

### Files to Create

```
apps/mcp-server/src/
  domain/
    backtesting/
      models.ts                           — BacktestParams, BacktestReport, TradeRecord, TradeLog types
      strategyRegistry.ts                 — StrategyDefinition interface + registry with kinh-dich-high-confidence and kinh-dich-all
      backtestEngine.ts                   — pure computation service: simulate trades, compute metrics
  application/
    usecases/
      runBacktest.ts                      — orchestrate: validate params → load signals → load prices → engine → persist result
  interface/
    mcp/
      tools/
        backtesting/
          backtestTools.ts                — MCP tool handler for run_backtest (tool #120)
          index.ts                        — barrel export registerBacktestTools
  __tests__/
    1842d-backtest-engine.test.ts         — unit + integration tests (12 ACs)
```

### Files to Modify

```
apps/mcp-server/src/
  domain/
    backtesting/
      index.ts                            — add exports for models, strategyRegistry, backtestEngine
  interface/
    mcp/
      registry.ts (or equivalent)        — register registerBacktestTools
```

---

## Key Specifications

All specs derive from `docs/architecture/1842a-backtesting-engine.md`.

### Entry / Exit Rules (Section 3.1)

- **Entry:** T+1 open after signal date (next available trading-day open). Avoids look-ahead bias.
- **Exit:** 5 trading days after entry (configurable, default 5) OR an opposing signal for the same ticker — whichever comes first.
- **Signal filter:** Only `BUY` and `SELL` signals generate trades. `HOLD`/`WAIT` are no-ops.
- **Confidence filter:** Per-strategy minimum confidence threshold (see strategyRegistry).

### Position Sizing (Section 3.2)

Equal-weight per open trade. If N tickers have open BUY signals on the same date, each receives 1/N of the portfolio. No confidence-weighted allocation in Phase 2 (that is Phase 3 / 1842e).

### Metric Formulas (Section 3.3)

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
  Returns null when stddev = 0 (flat equity curve — no trades, or all identical returns)

win_rate = trades_where_exit_price > entry_price / total_directional_trades
trade_count = count of BUY + SELL signal events that resulted in a completed round trip
```

### Benchmark (Section 3.4)

`benchmarkReturnPct` is computed from `IBacktestPriceRepository.getCandles("VNINDEX", startDate, endDate)`. If VNI data is absent, set `benchmarkReturnPct: null` — not an error.

### Strategy Registry (Section 4)

```typescript
// domain/backtesting/strategyRegistry.ts

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

| Strategy ID | Filter rule |
|-------------|-------------|
| `kinh-dich-high-confidence` | BUY or SELL signals with confidence >= 0.7 |
| `kinh-dich-all` | All BUY or SELL signals regardless of confidence |

If `strategyRegistry[strategy]` key is absent, throw `BacktestStrategyNotFoundError` (domain error, no I/O). Catch in tool handler and return as user-readable MCP error.

### Mutex (Section 6.3)

1 concurrent backtest per server instance. Enforce via in-memory boolean flag in `runBacktest.ts`. If a second call arrives while one is in progress, return: `"Backtest already in progress. Retry in a few seconds."` — do NOT throw; return as a valid MCP error content block.

### Sparse Data (Section 8.1)

- Missing entry price (`getClosePriceOnOrAfter` returns null): skip trade, add to `warnings[]`.
- Fewer than 5 price points for a ticker: skip ticker, add to `warnings[]`.
- No trades executed at all: return valid report with `tradeCount: 0`, `winRate: 0`, `totalReturnPct: 0`, warning: `"No trades executed — insufficient data for requested date range. Run OHLCV backfill first."`
- Date range < 10 trading days: add warning `"Short date range — results may not be statistically meaningful"`.

---

## Type Definitions

### `models.ts`

```typescript
export interface BacktestParams {
  strategy: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  tickers?: string[];  // undefined = all watchlist tickers
}

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

export type TradeLog = TradeRecord[];

export interface BacktestReport {
  strategy: string;
  startDate: string;
  endDate: string;
  runAt: string;                  // ISO datetime
  totalReturnPct: number;
  benchmarkReturnPct: number | null;
  maxDrawdown: number;
  sharpeRatio: number | null;
  winRate: number;
  tradeCount: number;
  byTicker: Array<{
    code: string;
    tradeCount: number;
    winRate: number;
    totalReturnPct: number;
  }>;
  trades: TradeRecord[];          // capped at 200 rows in MCP response
  warnings: string[];
}
```

---

## MCP Tool Specification (Section 6.1)

Tool name: `run_backtest`
Tool slot: **#120** — confirmed unregistered (current toolCount = 122 but slot #120 not yet claimed; verify with grep before registering).

```typescript
// Zod input schema
{
  strategy: z.enum([
    "kinh-dich-high-confidence",
    "kinh-dich-all",
    "combined-high-confidence",
  ]).describe("Strategy ID to backtest..."),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date YYYY-MM-DD"),
  tickers: z.array(z.string().min(2).max(10)).optional().describe(
    "Optional list of tickers to restrict backtest to. Defaults to all watchlist tickers."
  ),
}
```

Return format (always):
```typescript
return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
```

---

## Architecture Constraints

- `backtestEngine.ts`: **zero I/O, zero DB imports** — pure function over repository interfaces. Matches the domain layer golden rule: `domain/` has ZERO imports from `infrastructure/`.
- `runBacktest.ts`: inject `IBacktestSignalRepository`, `IBacktestPriceRepository`, `IBacktestResultRepository` (all created in 1842b). No `getDb()` calls.
- New files in `domain/backtesting/` must not import from `infrastructure/`.
- Tool handler in `interface/` may import from `application/` and `domain/`, never from `infrastructure/` directly.
- All imports use `.js` extension (ESM compatibility).
- Use `Bun.env` not `process.env`.
- No `any` — use `unknown` + type narrowing where needed.

---

## Acceptance Criteria

Tests file: `apps/mcp-server/src/__tests__/1842d-backtest-engine.test.ts`

| AC | Description |
|----|-------------|
| AC-1 | Engine with fixture data (10 BUY signals, 10 known prices) returns correct `totalReturnPct` |
| AC-2 | Engine with all-loss fixture returns negative `totalReturnPct` and `winRate = 0` |
| AC-3 | Engine with empty signal list returns `tradeCount = 0`, no error thrown |
| AC-4 | Engine with all signals filtered (below confidence threshold) returns `tradeCount = 0` with warning |
| AC-5 | Engine computes `maxDrawdown` correctly from fixture equity curve |
| AC-6 | Engine computes Sharpe ratio; returns `null` when all returns are identical (stddev = 0) |
| AC-7 | `run_backtest("kinh-dich-high-confidence", "2026-04-05", "2026-04-28")` returns a valid `BacktestReport` structure (integration test: in-memory SQLite + fixture signals + fixture prices) |
| AC-8 | Calling `run_backtest` while another is running returns a user-readable error string, not an exception |
| AC-9 | `strategyRegistry["kinh-dich-high-confidence"]` filters confidence >= 0.7 (signals below threshold excluded) |
| AC-10 | `strategyRegistry["kinh-dich-all"]` includes all BUY/SELL regardless of confidence |
| AC-11 | `BacktestReport.warnings[]` contains `"No trades executed"` message when no signals match the date range |
| AC-12 | Tool returns MCP-format `{ content: [{ type: "text", text: JSON }] }` |

All 12 ACs must pass. `bun test` must show 0 fail after this task. `tsc` must be clean.

---

## Test File Template

```typescript
// apps/mcp-server/src/__tests__/1842d-backtest-engine.test.ts
import { describe, it, expect } from "bun:test";

describe("1842d — BacktestEngine + MCP tool #120", () => {
  // AC-1: correct totalReturnPct from fixture
  it("AC-1: engine returns correct totalReturnPct with all-win fixture", () => { ... });

  // AC-2: all-loss fixture
  it("AC-2: engine returns negative totalReturnPct and winRate=0 on all-loss fixture", () => { ... });

  // AC-3: empty signals
  it("AC-3: engine returns tradeCount=0 without error on empty signal list", () => { ... });

  // AC-4: confidence filter
  it("AC-4: engine returns tradeCount=0 with warning when all signals below threshold", () => { ... });

  // AC-5: drawdown
  it("AC-5: engine computes maxDrawdown correctly from fixture equity curve", () => { ... });

  // AC-6: Sharpe
  it("AC-6: engine returns null sharpeRatio when stddev of returns is 0", () => { ... });

  // AC-7: integration
  it("AC-7: run_backtest integration returns valid BacktestReport structure", async () => { ... });

  // AC-8: mutex
  it("AC-8: concurrent run_backtest returns user-readable error string", async () => { ... });

  // AC-9: kinh-dich-high-confidence filter
  it("AC-9: kinh-dich-high-confidence filters confidence < 0.7", () => { ... });

  // AC-10: kinh-dich-all
  it("AC-10: kinh-dich-all includes all BUY/SELL regardless of confidence", () => { ... });

  // AC-11: no-trades warning
  it("AC-11: warnings[] contains no-trades message when no signals match", () => { ... });

  // AC-12: MCP return format
  it("AC-12: tool returns { content: [{ type: text }] } format", async () => { ... });
});
```

---

## Branch

`task/1842d-backtest-engine-mcp-tool`

---

## Commit Format

```bash
git commit -m "$(cat <<'EOF'
feat(1842d): BacktestEngine domain service + MCP tool #120 run_backtest

- domain/backtesting/models.ts, strategyRegistry.ts, backtestEngine.ts
- application/usecases/runBacktest.ts with IRepo injection
- interface/mcp/tools/backtesting/backtestTools.ts (tool #120)
- 12/12 AC tests pass, 0 fail, tsc clean

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Return Condition

QA merge complete when:
- `bun test` 0 fail
- `tsc` clean
- All 12 ACs tagged as passing in test output
- `docs/data/tool-registry.json` updated: `toolCount` incremented, `run_backtest` added to a new `"Backtesting"` category
- `docs/pipeline-state.json` written with `status: "in_progress"`, `nextAgent: "qa"`, `activeTaskId: "1842d"`
