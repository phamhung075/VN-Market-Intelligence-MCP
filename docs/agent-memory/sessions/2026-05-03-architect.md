# Architect Session — 2026-05-03

## Task
1842a — Portfolio Backtesting Engine design (U-8).

## Work Done

### Data Audit (live DB queries on data/market.db)
- `daily_ohlcv`: 219 rows, 111 tickers, only 2026-04-23 to 2026-04-24. CRITICAL: no 2025 history.
- `kinhdich_readings`: 23,285 rows, 49 tickers, 2026-04-05 to 2026-04-28.
- Signals are in Vietnamese (MUA/BAN/GIU/etc), not English BUY/SELL/HOLD.
- `market_prices_history`: empty (pruned rolling 24h window).
- VNI OHLCV: not stored anywhere.

### Key Design Decisions
1. Domain module inside mcp-server (not new microservice) — data locality + TS consistency.
2. T+1 open entry rule — avoids look-ahead bias.
3. Phase 1 = data sprint (OHLCV backfill via VNDirect) is critical path blocker.
4. Tool #120 = `run_backtest`.
5. Signal normalizer needed: VI→EN (MUA→BUY, BAN→SELL, GIU→HOLD, etc.).
6. hexagramBacktester.ts already exists as pure domain service — extend it, don't duplicate.

### Files Produced
- `docs/architecture/1842a-backtesting-engine.md` — full design (10 sections)
- `docs/handoffs/TASK_1842a.md` — updated with design record + all ACs checked
- `docs/pipeline-state.json` — status=in_progress, nextAgent=pm

## Implementation Sprint Map
| Task | Size | Deliverable |
|------|------|-------------|
| 1842b | SPRINT-M | OHLCV backfill + 3 repo interfaces + SQLite impls |
| 1842c | SPRINT-S | Nightly backfill cron + VNI backfill |
| 1842d | SPRINT-M | Engine + MCP tool #120 |
| 1842e | SPRINT-S | Sharpe + benchmark + confidence weighting |

## Existing Code Leveraged
- `hexagramBacktester.ts` — pure domain computation pattern to extend
- `IHexagramRepository.ts` — existing port with `getReadingsForBacktest()` to reference
- `schema-market-data.ts` — daily_ohlcv DDL confirmed
- `registry.ts` — last tool is #119, #120 is free for run_backtest
