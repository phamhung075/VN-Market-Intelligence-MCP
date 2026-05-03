# TASK 1842e — Backtest Phase 3: Full Metrics + Benchmark

> **Sprint:** 1842 | **Task ID:** 1842e | **Type:** SPRINT-S
> **Owner:** developer | **Created by:** pm | **Date:** 2026-05-03
> **Priority:** P1
> **Depends on:** 1842b (DONE), 1842c (DONE), 1842d (DONE)
> **Blocks:** nothing (final phase of Sprint 1842 backtest track)

---

## Context

1842d delivered the core `BacktestEngine` domain service with basic metrics (`totalReturnPct`, `winRate`, `maxDrawdown`) and MCP tool #120 (`run_backtest`). It uses equal-weight position sizing and does not yet persist run results.

Phase 3 (this task) adds four enhancements:

1. **Sharpe ratio** — computed from the equity curve (population stddev, annualised with sqrt(252)). Returns `null` when stddev = 0.
2. **VNI benchmark comparison** — fetch `VNINDEX` candles from `IBacktestPriceRepository`. Populate `benchmarkReturnPct`. Returns `null` when VNINDEX data is absent (not an error).
3. **Confidence-weighted position sizing** — replace equal-weight with `weight = confidence / sum(all open confidences for that date)`.
4. **Result persistence** — wire `IBacktestResultRepository.saveRun()` in the use case after the engine completes.
5. **`combined-high-confidence` strategy** — register in `strategyRegistry.ts`. Signal source logic is identical to `kinh-dich-high-confidence` for now (full TA-combined logic is out of scope for this sprint, documented in arch doc Section 4.2).

Architecture reference: `docs/architecture/1842a-backtesting-engine.md` — Sections 3.2, 3.3, 3.4, 4.2, 7 (Phase 3).

---

## Scope

### Files to Modify

```
apps/mcp-server/src/
  domain/
    backtesting/
      backtestEngine.ts         — add Sharpe from equity curve, add confidence-weighted position sizing
      strategyRegistry.ts       — add combined-high-confidence strategy entry
  application/
    usecases/
      runBacktest.ts            — wire IBacktestResultRepository.saveRun() after engine completes;
                                   fetch VNINDEX candles and compute benchmarkReturnPct
  __tests__/
    1842e-backtest-phase3.test.ts   — NEW test file (10 ACs)
```

No other files require modification. No schema changes — `backtest_runs` table and `IBacktestResultRepository` already exist from 1842b.

---

## Key Specifications

All specs derive from `docs/architecture/1842a-backtesting-engine.md`.

### Sharpe Ratio Formula (Section 3.3)

```
daily_returns[t] = (equity_curve[t] - equity_curve[t-1]) / equity_curve[t-1]
sharpe = mean(daily_returns) / stddev(daily_returns) * sqrt(252)
```

Constraints:
- Use **population stddev** (divide by N, not N-1) for consistency with the arch doc.
- Return `null` when stddev = 0 (flat equity curve — no trades executed, or all daily returns are identical).
- Equity curve must have at least 2 data points to compute daily_returns. If only 1 point, return `null`.

Reference TypeScript pseudo-code:
```typescript
function computeSharpe(equityCurve: number[]): number | null {
  if (equityCurve.length < 2) return null;
  const dailyReturns = equityCurve.slice(1).map((v, i) => (v - equityCurve[i]) / equityCurve[i]);
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / dailyReturns.length; // population
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return null;
  return (mean / stddev) * Math.sqrt(252);
}
```

### VNI Benchmark Comparison (Section 3.4)

```typescript
const vniCandles = priceRepo.getCandles("VNINDEX", params.startDate, params.endDate);
const benchmarkReturnPct = vniCandles.length >= 2
  ? (vniCandles[vniCandles.length - 1].close - vniCandles[0].close) / vniCandles[0].close
  : null;
```

- If `getCandles("VNINDEX", ...)` returns 0 or 1 candles: set `benchmarkReturnPct = null`. Do NOT throw.
- This computation lives in `runBacktest.ts` (use case layer), not in `backtestEngine.ts` (domain engine). The engine receives `benchmarkReturnPct` as an input parameter if needed, or the use case patches it onto the report after `engine.run()` returns.

### Confidence-Weighted Position Sizing (Section 3.2)

Replace the Phase 2 equal-weight rule in `backtestEngine.ts`:

```
weight[ticker] = confidence[ticker] / sum(confidence for all open positions on that date)
```

Edge cases:
- If all open positions on a date have confidence = 0: fall back to equal-weight (1/N) to avoid divide-by-zero.
- If a single position is open: weight = 1.0 (full allocation), regardless of confidence value.
- Equal-weight still works correctly for `kinh-dich-all` because all signals have equal confidence in that strategy.

AC-6 verifies that `kinh-dich-all` still produces equal allocation when all confidences are the same value.

### Result Persistence (Section 2.3)

After `engine.run()` completes in `runBacktest.ts`, call `resultRepo.saveRun(record)`:

```typescript
const record: BacktestRunRecord = {
  id: crypto.randomUUID(),
  strategy: params.strategy,
  startDate: params.startDate,
  endDate: params.endDate,
  runAt: report.runAt,
  totalReturn: report.totalReturnPct,
  benchmarkReturn: report.benchmarkReturnPct,
  maxDrawdown: report.maxDrawdown,
  sharpeRatio: report.sharpeRatio,
  winRate: report.winRate,
  tradeCount: report.tradeCount,
  resultJson: JSON.stringify(report),
};
resultRepo.saveRun(record);
```

The `saveRun()` call must be wrapped in a try/catch. A persistence failure must NOT abort the MCP tool response — log a warning to `warnings[]` and return the report anyway.

### `combined-high-confidence` Strategy (Section 4.2)

Add to `strategyRegistry.ts`:

```typescript
"combined-high-confidence": {
  id: "combined-high-confidence",
  description: "Kinh Dich BUY/SELL signals with confidence >= 0.7 (combined strategy stub — full TA confirmation logic is out of scope for Sprint 1842)",
  signalFilter: (row) => { /* same logic as kinh-dich-high-confidence */ },
  minConfidence: 0.7,
  holdDays: 5,
}
```

The `combined-high-confidence` strategy only needs to exist in the registry so that:
- The `run_backtest` Zod enum accepts it without error.
- AC-9 can verify its presence.
- The strategy produces valid (if identical to `kinh-dich-high-confidence`) results when called.

Full TA-combined signal logic is a future sprint item. Document this clearly in the strategy's `description` field.

---

## Architecture Constraints

- `backtestEngine.ts`: zero I/O, zero DB imports. Pure function — no side effects. Equity curve and Sharpe are domain-layer computations.
- `runBacktest.ts`: all repository calls injected via interfaces. Zero `getDb()` calls. Use `.js` ESM extensions on all imports.
- `strategyRegistry.ts`: plain TypeScript constant, no dynamic loading, no I/O.
- `domain/backtesting/` must have ZERO imports from `infrastructure/`.
- All confidence-weighted sizing logic lives in `backtestEngine.ts`, not in the use case.
- `benchmarkReturnPct` computation lives in `runBacktest.ts` (use case), not in the engine, because it requires a repository call.
- Use `Bun.env` not `process.env`.
- No `any` — use `unknown` + type narrowing.
- Import paths: `.js` extension (ESM compatibility).

---

## Acceptance Criteria

Test file: `apps/mcp-server/src/__tests__/1842e-backtest-phase3.test.ts`

| AC | Description |
|----|-------------|
| AC-1 | `run_backtest("kinh-dich-high-confidence", ...)` returns non-null `sharpeRatio` when fixture equity curve has variance in daily returns |
| AC-2 | `sharpeRatio` returns `null` when equity curve is flat (stddev = 0) — e.g. no trades executed |
| AC-3 | `benchmarkReturnPct` is populated (non-null) when VNINDEX candles exist in DB fixture |
| AC-4 | `benchmarkReturnPct` is `null` (not an error) when VNINDEX data is absent from DB |
| AC-5 | Confidence-weighted position sizing: 2 open trades with confidence 0.8 and 0.2 → allocations 80% / 20% of portfolio on that date |
| AC-6 | Equal-weight sizing still works when `kinh-dich-all` is used (all confidences same weight → each gets 1/N) |
| AC-7 | Completed backtest run is persisted to `backtest_runs` table via `IBacktestResultRepository.saveRun()` |
| AC-8 | `getRunsByStrategy("kinh-dich-high-confidence", 5)` returns the saved run from AC-7 |
| AC-9 | `combined-high-confidence` strategy exists in `strategyRegistry` and returns a valid `BacktestReport` when called |
| AC-10 | `bun test` 0 new failures, `tsc` clean |

---

## Test File Template

```typescript
// apps/mcp-server/src/__tests__/1842e-backtest-phase3.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";

describe("1842e — Backtest Phase 3: Full Metrics + Benchmark", () => {

  it("AC-1: sharpeRatio is non-null when equity curve has variance", () => {
    // fixture: equity curve [100, 102, 101, 104, 103] → non-zero daily_returns stddev
    // expect sharpeRatio to be a finite number
  });

  it("AC-2: sharpeRatio is null when equity curve is flat (no trades)", () => {
    // fixture: no signals → equity curve stays flat at initial value
    // expect sharpeRatio === null
  });

  it("AC-3: benchmarkReturnPct is populated when VNINDEX candles exist", () => {
    // insert VNINDEX candles into fixture priceRepo
    // expect report.benchmarkReturnPct to be a number (not null)
  });

  it("AC-4: benchmarkReturnPct is null when VNINDEX data absent", () => {
    // priceRepo returns [] for getCandles("VNINDEX", ...)
    // expect report.benchmarkReturnPct === null (no error thrown)
  });

  it("AC-5: confidence-weighted sizing allocates 80%/20% for confidences 0.8/0.2", () => {
    // fixture: 2 BUY signals same date, confidence 0.8 and 0.2
    // inspect trade allocations — 80% weight to high-confidence, 20% to low-confidence
  });

  it("AC-6: kinh-dich-all produces equal-weight allocation when all confidences equal", () => {
    // fixture: 3 BUY signals same date, all confidence = 0.5
    // expect each trade gets 1/3 allocation
  });

  it("AC-7: completed run is persisted via IBacktestResultRepository.saveRun()", async () => {
    // run backtest with fixture data
    // query resultRepo after run completes
    // expect at least 1 record exists with matching strategy
  });

  it("AC-8: getRunsByStrategy returns the saved run", async () => {
    // depends on AC-7 fixture
    // expect getRunsByStrategy("kinh-dich-high-confidence", 5).length >= 1
    // expect returned record .strategy === "kinh-dich-high-confidence"
  });

  it("AC-9: combined-high-confidence exists in strategyRegistry", () => {
    // import strategyRegistry
    // expect "combined-high-confidence" in Object.keys(strategyRegistry)
  });

  it("AC-10: tsc clean — no type errors in modified files (verified via bun test run)", () => {
    // This AC is verified by running bun test without tsc errors surfacing.
    // Explicitly assert that strategyRegistry["combined-high-confidence"] has the correct shape.
    expect(true).toBe(true); // placeholder — actual check is tsc in CI
  });
});
```

---

## Branch

`task/1842e-backtest-phase3`

---

## Commit Format

```bash
git commit -m "$(cat <<'EOF'
feat(1842e): Backtest Phase 3 — Sharpe ratio, VNI benchmark, confidence-weighted sizing

- backtestEngine.ts: Sharpe from equity curve (population stddev, sqrt(252) annualisation)
- backtestEngine.ts: confidence-weighted position sizing replacing equal-weight
- runBacktest.ts: IBacktestResultRepository.saveRun() after engine completes
- runBacktest.ts: VNINDEX benchmark via IBacktestPriceRepository.getCandles
- strategyRegistry.ts: combined-high-confidence strategy registered
- 10/10 AC tests pass, 0 fail, tsc clean

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Return Condition

Task is complete when:
- `bun test` shows 0 new failures (all 10 ACs pass)
- `tsc` is clean across all modified files
- All 10 ACs tagged as passing in test output
- `docs/pipeline-state.json` written with `status: "in_progress"`, `nextAgent: "qa"`, `activeTaskId: "1842e"`
