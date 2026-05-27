# Tool Group: backtesting (mcp-server)

**Module path:** `src/interface/mcp/tools/backtesting/`
**Scheduler:** none (on-demand only)
**Domain services:** backtesting execution engine

Individual tool signatures: `docs/agents/tools/list/backtesting.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `run_backtest` | Execute a strategy backtest | strategy, tickers[], start_date, end_date, params | market.db (ohlcv_daily) + domain backtest engine |
| `get_backtest_runs` | List all historical backtest runs | limit? | market.db (backtest_runs) |
| `get_backtest_run` | Retrieve detailed results for one backtest | run_id | market.db (backtest_runs) |

---

## Invariants

1. Backtests run on historical OHLCV data from `market.db` (ohlcv_daily table).
2. Results stored in `market.db` (backtest_runs table).
3. On-demand only — no scheduled execution.
4. Strategy architecture: see `docs/architecture/1842a-backtesting-engine.md` (existing design doc).
