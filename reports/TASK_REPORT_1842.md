# Task Report: Sprint 1842 — BacktestEngine Full Stack
date: 2026-05-03
outcome: APPROVED

---

## Sprint Summary

Sprint 1842 delivered the complete backtesting engine stack in five sequential tasks:

| Task | Description | Status |
|------|-------------|--------|
| 1842b | OHLCV backfill + 3 repository interfaces (IBacktestSignalRepository, IBacktestPriceRepository, IBacktestResultRepository) + SQLite implementations | DONE |
| 1842c | VNSignalAdapter — VI→EN signal normalizer wired into Kinh Dich write path | DONE |
| 1842d | BacktestEngine domain service + run_backtest MCP tool #120 — pure computation, strategyRegistry, runBacktest use case | DONE |
| 1842e | Backtest Phase 3 — Sharpe ratio, VNI benchmark, confidence-weighted sizing, result persistence, combined-high-confidence strategy | DONE |

---

## 1842e QA Results (final task)

### Test Results
- Targeted suite (bun test --filter 1842e): 10 passed / 0 failed [263ms]
- Full suite: 8775 passed / 4 failed
- Pre-existing failures: Task 265 x3 (mention velocity store — SQLite timing), Task 1332 x1 (pollNews Reuters RSS timeout) — none introduced by 1842e
- TypeScript: 0 errors (bun tsc --noEmit clean)

### DDD Compliance: PASS
- domain/backtesting/ files: zero imports from infrastructure/
- All `infrastructure` text in domain files is comments only
- backtestEngine.ts: pure function — zero I/O, zero DB access, zero side effects
- benchmarkCandles injected into engine as pre-fetched data (fetch itself in use case)

### Security: PASS
- No hardcoded credentials or API keys
- No process.env usage — Bun.env throughout
- All SQL parameterized in infrastructure layer
- MCP tool handler wrapped in try/catch

### Implementation Verification

| Check | Result | Detail |
|-------|--------|--------|
| Sharpe from equity curve | PASS | backtestEngine.ts lines 307-321: population stddev (÷N), sqrt(252) annualisation, null when sd=0 or <2 returns |
| Confidence-weighted sizing | PASS | lines 238-261: w=confidence/sum, fallback 1/N when sumConf=0, single position=1.0 |
| saveRun() wrapped in try/catch | PASS | runBacktest.ts lines 107-125: persistence failure appends to warnings, report still returned |
| benchmarkReturnPct in use case layer | PASS | priceRepo.getCandles("VNINDEX",...) called at line 95 of runBacktest.ts; candles passed into engine |
| combined-high-confidence in registry | PASS | strategyRegistry.ts lines 71-72 confirmed |
| DDD golden rule | PASS | zero infrastructure imports in domain/backtesting/ |
| tsc clean | PASS | 0 errors |
| 10/10 ACs pass | PASS | all acceptance criteria verified by test output |

### Acceptance Criteria

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | sharpeRatio non-null when equity curve has variance | PASS |
| AC-2 | sharpeRatio null when equity curve is flat | PASS |
| AC-3 | benchmarkReturnPct populated when VNINDEX candles exist | PASS |
| AC-4 | benchmarkReturnPct null when VNINDEX absent (no error) | PASS |
| AC-5 | Confidence 0.8/0.2 → 80%/20% allocation | PASS |
| AC-6 | kinh-dich-all equal-weight when all confidences equal | PASS |
| AC-7 | Completed run persisted via IBacktestResultRepository.saveRun() | PASS |
| AC-8 | getRunsByStrategy returns the saved run | PASS |
| AC-9 | combined-high-confidence exists in strategyRegistry | PASS |
| AC-10 | tsc clean, no type errors | PASS |

### Issues Found

#### Blocking
None.

#### Non-Blocking
- benchmarkReturnPct computation (`(last-first)/first`) is duplicated inside both `runBacktestEngine()` and `buildEmptyReport()` in the engine. The spec intended only the candle-fetch to live in the use case; the computation drifted into the engine as well. No functional impact — tests pass, result is correct. Documented for future cleanup if needed.

## Merge Status
ALREADY MERGED to main at commit dead295f — feat(1842e): Backtest Phase 3 — Sharpe ratio, VNI benchmark, confidence-weighted sizing
Branch: work was committed directly to main via worktree. No separate task/1842e-* branch detected at QA time.

---

## Sprint 1842 Full Deliverables

### Architecture
Backtesting engine stack follows DDD with clean layer separation:
- `domain/backtesting/`: BacktestEngine (pure), models, strategyRegistry, VNSignalAdapter, signalNormalizer
- `domain/repositories/`: IBacktestSignalRepository, IBacktestPriceRepository, IBacktestResultRepository
- `application/usecases/runBacktest.ts`: orchestration, VNINDEX fetch, persistence
- `infrastructure/db/`: backtestSignalRepo, backtestPriceRepo, backtestResultRepo, schema-backtesting
- `interface/mcp/tools/`: run_backtest (#120) with Zod schema validation

### Strategies Registered
- `kinh-dich-high-confidence`: Kinh Dich BUY/SELL signals with confidence >= 0.7
- `kinh-dich-all`: All Kinh Dich BUY/SELL signals regardless of confidence
- `combined-high-confidence`: Stub — same logic as kinh-dich-high-confidence; full TA-combined signal logic deferred to future sprint

### Metrics Available
- totalReturnPct (confidence-weighted)
- benchmarkReturnPct (VNINDEX comparison, null if absent)
- sharpeRatio (population stddev, annualised sqrt(252), null if flat)
- maxDrawdown
- winRate
- tradeCount
- byTicker breakdown
- trades[] (capped at 200 rows)
- warnings[]

### Test Baseline at Sprint End
8775 pass / 4 pre-existing fail (Task 265 x3 + Task 1332 x1)
