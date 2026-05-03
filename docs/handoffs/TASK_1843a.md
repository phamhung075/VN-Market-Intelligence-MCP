---
sprint: 1843
branch: task/1843a-combined-high-confidence-strategy
size: M
depends_on: []
blocks: [1843b, 1843c]
---

## TLDR

Implement the real `combined-high-confidence` backtesting strategy using a dual-signal agreement gate: EMA-12/26 crossover + RSI-14 must both agree (BULLISH or BEARISH) with the Kinh Dich signal direction before a position is opened. This requires creating a new pure-domain TA computation module, a factory function in the strategy registry, a new application-layer helper for pre-computing TA directions, and a full test suite.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-CHC-1: `run_backtest` with `strategy="combined-high-confidence"` executes without throwing for valid params
  - [ ] AC-CHC-2: `tradeCount` for `combined-high-confidence` is <= `tradeCount` for `kinh-dich-high-confidence` on same inputs (TA gate filters trades further)
  - [ ] AC-CHC-3: `buildCombinedHighConfidenceStrategy(Map([["VCB","BULLISH"]]))` — signalFilter passes BUY signal for VCB
  - [ ] AC-CHC-4: `buildCombinedHighConfidenceStrategy(Map([["VCB","BEARISH"]]))` — signalFilter blocks BUY signal for VCB (returns null)
  - [ ] AC-CHC-5: `buildCombinedHighConfidenceStrategy(Map([["VCB","NEUTRAL"]]))` — signalFilter blocks BUY signal for VCB (returns null)
  - [ ] AC-CHC-6: `backtestTools.ts` description for `combined-high-confidence` no longer says "stub" or "currently alias for"
  - [ ] AC-CHC-7: `tsc --noEmit` exits 0
  - [ ] `computeEMA` unit test: known sequence spot-check passes
  - [ ] `deriveTADirection` returns "NEUTRAL" for < 26 candles
  - [ ] `deriveTADirection` returns "BULLISH" for bullish EMA cross + RSI > 50
  - [ ] `deriveTADirection` returns "BEARISH" for bearish EMA cross + RSI < 50
  - [ ] `deriveTADirection` returns "NEUTRAL" for disagreeing signals
  - [ ] Warning appended to report when ticker resolves to NEUTRAL due to < 26 candles

- **Files to read first:**
  - `apps/mcp-server/src/domain/backtesting/strategyRegistry.ts` — understand existing StrategyDefinition interface + registry shape
  - `apps/mcp-server/src/application/usecases/runBacktest.ts` — understand existing runBacktest flow, RunBacktestDeps, priceRepo usage
  - `apps/mcp-server/src/domain/backtesting/backtestEngine.ts` — understand DailyCandle type, BacktestReport.warnings usage
  - `apps/mcp-server/src/domain/repositories/IBacktestPriceRepository.ts` — confirm DailyCandle type shape + getCandles signature
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/backtestTools.ts` — find the "stub" description string to remove

- **Files to create:**
  - `apps/mcp-server/src/domain/backtesting/taComputation.ts` — pure EMA/RSI computation + deriveTADirection; zero infrastructure imports; exports: `computeEMA`, `computeRSI`, `deriveTADirection`, `TADirection` (re-export from strategyRegistry or define here and import there)
  - `apps/mcp-server/src/__tests__/1843-combined-high-confidence.test.ts` — AC-CHC-3/4/5 unit tests + taComputation unit tests (no DB, no infrastructure imports)

- **Files to modify:**
  - `apps/mcp-server/src/domain/backtesting/strategyRegistry.ts` — add `export type TADirection` + `export function buildCombinedHighConfidenceStrategy(taMap: Map<string, TADirection>): StrategyDefinition`; update BacktestStrategyNotFoundError available-list to include "combined-high-confidence"; run `grep -r 'combined-high-confidence' apps/mcp-server/src` before touching the registry literal
  - `apps/mcp-server/src/application/usecases/runBacktest.ts` — add private `computeTADirectionMap(priceRepo, params)` helper; add branch for "combined-high-confidence" strategy instantiation; propagate NEUTRAL-ticker warnings to report
  - `apps/mcp-server/src/interface/mcp/tools/backtesting/backtestTools.ts` — remove "stub" / "currently alias for" language from combined-high-confidence description

- **Key design decisions (Option A — already chosen by Architect):**
  - `StrategyDefinition` interface: UNCHANGED. No new hooks.
  - `buildCombinedHighConfidenceStrategy(taMap)` is a factory exported from strategyRegistry.ts — NOT statically registered in the registry literal
  - `computeTADirectionMap` lives in runBacktest.ts (application layer) — it does I/O and belongs there
  - `taComputation.ts` is domain/backtesting — pure math, imports only DailyCandle from domain/repositories
  - Ticker set for TA map = derived from rawSignals (unique stockCode values) — NOT params.tickers

- **EMA/RSI rules:**
  - EMA-12 > EMA-26 → BULLISH; EMA-12 < EMA-26 → BEARISH; equal → NEUTRAL
  - RSI-14 > 50 → BULLISH bias; RSI-14 < 50 → BEARISH bias; exactly 50 → NEUTRAL
  - Combined: BULLISH only if BOTH agree BULLISH; BEARISH only if BOTH agree BEARISH; all other cases → NEUTRAL
  - Fewer than 26 candles → NEUTRAL (insufficient data), append warning to report
  - EMA seed: use SMA for first `period` bars (NOT close[0] seed — see RISK-2)

- **Extended date range for TA warmup:**
  - `computeTADirectionMap` calls `priceRepo.getCandles(ticker, addCalendarDays(params.startDate, -40), params.endDate)` for EMA-26 seeding
  - 40 calendar days ≈ 28+ trading days — safe margin

- **Warning format:**
  - `"combined-high-confidence: {TICKER} resolved to NEUTRAL TA direction (< 26 OHLCV candles available) — signal blocked"`

- **RISK-3 guard:** If removing "combined-high-confidence" from registry literal, ensure BacktestStrategyNotFoundError still lists it. Safe options: keep metadata-only entry in registry, OR add a `KNOWN_STRATEGY_IDS` constant.

- **Dependencies:** none — first task in sprint
- **Knowledge needed:** `.claude/knowledge/dev-standards.md` (DDD golden rule: domain/ has zero infrastructure imports, ESM .js extensions, Bun.env not process.env)
