# Backtesting MCP Tools

## Summary

**Category:** Backtesting
**Module:** `apps/mcp-server/src/interface/mcp/tools/backtesting/`
**Tools:** 6

Historical trading signal replay engine. Tests strategy performance (return, drawdown, Sharpe ratio, win rate) against OHLCV price data. Supports multiple strategies and per-ticker lifecycle management.

---

## Core Tools

### 1. `run_backtest`

**File:** `backtestTools.ts`
**Task:** Task 1842d, Task 1844a
**MCP Tool #:** 120
**Type:** Main backtest execution tool

Replays historical trading signals against actual OHLCV prices to compute portfolio performance metrics.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `strategy` | enum | ✓ | Strategy ID (see table below) |
| `start_date` | string | ✓ | YYYY-MM-DD format (inclusive) |
| `end_date` | string | ✓ | YYYY-MM-DD format (inclusive) |
| `tickers` | array[string] | | Optional list (e.g. ["VCB", "HPG"]). Defaults to all tickers in signal data. |

#### Supported Strategies

| Strategy ID | Description | Signal Source | Conditions |
|-------------|-------------|---|---|
| `kinh-dich-high-confidence` | Kinh Dich BUY/SELL | `kinhdich_readings` | confidence ≥ 0.7 |
| `kinh-dich-all` | All Kinh Dich signals | `kinhdich_readings` | any confidence |
| `combined-high-confidence` | Kinh Dich + TA confirmation | `kinhdich_readings` + TA direction | KD confidence ≥ 0.7 AND (BUY→TA bullish, SELL→TA bearish) |

#### Return Value (Sample)

```json
{
  "id": "uuid-here",
  "strategy": "kinh-dich-high-confidence",
  "startDate": "2025-01-01",
  "endDate": "2025-05-05",
  "tickers": ["VCB", "HPG", "FPT"],
  "metrics": {
    "totalReturn": 0.1523,
    "annualizedReturn": 0.3045,
    "maxDrawdown": -0.1234,
    "sharpeRatio": 1.85,
    "winRate": 0.68,
    "totalTrades": 45,
    "profitableTrades": 31,
    "averageWinPct": 0.0245,
    "averageLossPct": -0.0156
  },
  "perTickerResults": [
    {
      "ticker": "VCB",
      "return": 0.1834,
      "trades": 15,
      "winRate": 0.73
    },
    ...
  ],
  "equityCurve": [100000, 101234, 102567, ...],
  "createdAt": "2025-05-05T14:22:00Z"
}
```

#### Metrics

| Metric | Definition |
|--------|-----------|
| `totalReturn` | (final equity - initial) / initial |
| `annualizedReturn` | total return annualized to 252 trading days |
| `maxDrawdown` | largest cumulative loss from peak |
| `sharpeRatio` | excess return / volatility (assuming 2% risk-free) |
| `winRate` | profitable trades / total trades |
| `totalTrades` | number of entry signals |
| `profitableTrades` | trades with positive close |
| `equityCurve` | daily equity array (for charting) |

#### Execution Details

- **Data requirement:** Minimum 6 months OHLCV data (use `ohlcv_backfill` if sparse)
- **Mutex:** Only 1 backtest can run per server instance (queuing supported)
- **Signal matching:** Signals joined with OHLCV on ticker + date
- **Position sizing:** Equal weight (1/N per ticker)
- **Trade logic:**
  - **Entry:** On signal date, open at next day's open price
  - **Exit:** At end_date or when opposite signal generated
  - **Return:** (exit_price - entry_price) / entry_price

#### Error Cases

- **Strategy not found:** Returns `{ error: "Strategy not found: xxx" }`
- **No data:** Returns `{ error: "No signals or prices for date range" }`
- **Backtest running:** Returns `{ error: "Backtest already running" }` (mutex busy)

---

### 2. `get_backtest_runs`

**File:** `backtestTools.ts`
**Task:** Task 1842d
**MCP Tool #:** 121
**Type:** List/query tool

Lists all completed backtest runs with summary metrics (filter by strategy optional).

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `strategy` | string | | Filter by strategy ID (optional) |
| `limit` | number | | Max results (default 50) |

#### Return Value

```json
{
  "runs": [
    {
      "id": "uuid-1",
      "strategy": "kinh-dich-high-confidence",
      "startDate": "2025-01-01",
      "endDate": "2025-05-05",
      "totalReturn": 0.1523,
      "maxDrawdown": -0.1234,
      "sharpeRatio": 1.85,
      "winRate": 0.68,
      "createdAt": "2025-05-05T14:22:00Z"
    },
    ...
  ],
  "total": 12
}
```

#### Use Cases

- Review all backtests run on a strategy
- Compare different date ranges
- Track performance evolution

---

### 3. `get_backtest_run`

**File:** `backtestTools.ts`
**Task:** Task 1842d
**MCP Tool #:** 122
**Type:** Detail retrieval tool

Retrieves full details of a specific backtest run by UUID.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `id` | string | ✓ | Backtest run UUID |

#### Return Value

Complete backtest output (see `run_backtest` return format). Includes:

- All metrics from `run_backtest`
- Per-ticker breakdown
- Full equity curve
- Trade log (entry date, ticker, price, exit price, return)

---

## Lifecycle Tools

### 4. `delete_backtest_run`

**File:** `backtestLifecycleTools.ts`
**Task:** Task 1846b
**MCP Tool #:** 123
**Type:** Cleanup tool

Permanently deletes a backtest run by UUID. **Irreversible.**

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `id` | string | ✓ | Backtest run UUID |

#### Return Value

```json
{
  "deleted": true,
  "id": "uuid-here"
}
```

or error:

```json
{
  "error": "Backtest run not found: uuid-here"
}
```

#### Authorization

None (any tool caller can delete any run). Use discretion.

---

### 5. `export_backtest_run_csv`

**File:** `backtestLifecycleTools.ts`
**Task:** Task 1846b
**MCP Tool #:** 124
**Type:** Export tool

Exports a backtest run's trade list as CSV for spreadsheet analysis.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `id` | string | ✓ | Backtest run UUID |

#### Return Value

CSV-formatted string:

```csv
Ticker,Direction,EntryDate,ExitDate,EntryPrice,ExitPrice,ReturnPct,PositionWeight
VCB,BUY,2025-01-15,2025-01-22,45600,46200,1.32,3.33
HPG,SELL,2025-01-18,2025-01-25,38000,37500,-1.32,3.33
...
```

#### Columns

| Column | Type | Notes |
|--------|------|-------|
| Ticker | string | Stock code |
| Direction | string | "BUY" or "SELL" |
| EntryDate | string | YYYY-MM-DD |
| ExitDate | string | YYYY-MM-DD (backtest end or opposite signal) |
| EntryPrice | number | Entry price (next day open) |
| ExitPrice | number | Exit price (next day open or end-of-period close) |
| ReturnPct | number | (exit - entry) / entry, as percent |
| PositionWeight | number | % of portfolio (e.g. 3.33 for 30 tickers) |

#### Use Cases

- Excel / Google Sheets analysis
- Per-trade statistics
- Correlation analysis with external events

---

### 6. `compare_backtest_runs`

**File:** `backtestLifecycleTools.ts`
**Task:** Task 1846b
**MCP Tool #:** 125
**Type:** Comparative analysis tool

Compares two (or more) backtest runs to identify performance differences.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `ids` | array[string] | ✓ | 2+ backtest UUIDs |

#### Return Value

Side-by-side comparison:

```json
{
  "comparison": [
    {
      "id": "uuid-1",
      "strategy": "kinh-dich-high-confidence",
      "period": "2025-01-01 to 2025-05-05",
      "totalReturn": 0.1523,
      "maxDrawdown": -0.1234,
      "sharpeRatio": 1.85,
      "winRate": 0.68
    },
    {
      "id": "uuid-2",
      "strategy": "combined-high-confidence",
      "period": "2025-01-01 to 2025-05-05",
      "totalReturn": 0.2145,
      "maxDrawdown": -0.0876,
      "sharpeRatio": 2.34,
      "winRate": 0.74
    }
  ],
  "winner": "uuid-2",
  "delta": {
    "returnDelta": 0.0622,
    "drawdownImprovement": 0.0358,
    "sharpeImprovement": 0.49,
    "winRateDelta": 0.06
  }
}
```

#### Use Cases

- Strategy A vs Strategy B (same period)
- Same strategy, different date ranges
- Evaluate TA confirmation impact

---

## Database Tables

### `backtest_signals`

Stores trading signals ready for backtesting.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | UUID |
| `ticker` | TEXT | Stock code |
| `signal_date` | TEXT | Date signal generated (YYYY-MM-DD) |
| `direction` | TEXT | "BUY" or "SELL" |
| `signal_source` | TEXT | "kinhdich_reading" or "ta_direction" |
| `confidence` | REAL | 0.0 … 1.0 |
| `source_id` | TEXT | FK to kinhdich_readings.id or ta_result.id |

### `backtest_prices`

OHLCV data for backtesting.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | UUID |
| `ticker` | TEXT | Stock code |
| `trade_date` | TEXT | YYYY-MM-DD |
| `open` | REAL | Opening price (VND) |
| `high` | REAL | High price |
| `low` | REAL | Low price |
| `close` | REAL | Closing price |
| `volume` | INTEGER | Trading volume (shares) |

### `backtest_results`

Stores completed backtest outputs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | UUID |
| `strategy` | TEXT | Strategy ID |
| `start_date` | TEXT | YYYY-MM-DD |
| `end_date` | TEXT | YYYY-MM-DD |
| `total_return` | REAL | As fraction (0.1523 = 15.23%) |
| `max_drawdown` | REAL | Worst cumulative loss |
| `sharpe_ratio` | REAL | Risk-adjusted return |
| `win_rate` | REAL | Profitable trades / total |
| `metrics_json` | TEXT | Full metrics (JSON) |
| `per_ticker_json` | TEXT | Per-ticker breakdown (JSON) |
| `equity_curve_json` | TEXT | Daily equity array (JSON) |
| `created_at` | TEXT | ISO datetime (UTC) |

---

## Strategy Details

### kinh-dich-high-confidence

**Signal Source:** `kinhdich_readings` where confidence ≥ 0.7

**Entry Logic:**
- BUY signal (trading_signal = "BUY" AND confidence ≥ 0.7) → buy at next day open
- SELL signal (trading_signal = "SELL" AND confidence ≥ 0.7) → sell at next day open

**Exit Logic:**
- Opposite signal generated
- End of backtest period (force close)

**Example Scenario:**
```
2025-01-15: Kinh Dich reading for VCB → Quẻ 29 (BUY, confidence 0.82)
  → Entry at 2025-01-16 open = 45,600 VND
2025-01-22: Kinh Dich reading for VCB → Quẻ 31 (SELL, confidence 0.75)
  → Exit at 2025-01-23 open = 46,200 VND
  → Return = (46,200 - 45,600) / 45,600 = +1.32%
```

### kinh-dich-all

**Signal Source:** `kinhdich_readings` (all, regardless of confidence)

Same logic as `kinh-dich-high-confidence`, but includes signals with confidence < 0.7.

**Effect:** More trades, likely lower win rate (noise included).

### combined-high-confidence

**Signal Source:** `kinhdich_readings` + TA direction (EMA-12/26 + RSI-14)

**Entry Logic:**
- BUY: Kinh Dich BUY (confidence ≥ 0.7) AND TA direction = BULLISH
- SELL: Kinh Dich SELL (confidence ≥ 0.7) AND TA direction = BEARISH

**Effect:** Fewer trades, higher confidence (double confirmation).

**Example:**
```
2025-01-15: KD reading → BUY (0.82), TA direction → BULLISH
  → Valid entry signal

2025-01-17: KD reading → BUY (0.75), TA direction → NEUTRAL
  → Skipped (no TA confirmation)
```

---

## Data Requirements

### Minimum OHLCV Data

For statistically meaningful results:
- **6 months** of continuous OHLCV data per ticker
- **252+ trading days** (typical year = 250-252 trading days)
- **No gaps** (use `ohlcv_backfill` to fill)

### Sparse Data

If fewer than 6 months:
- Backtest still runs
- Results less reliable
- Sharpe ratio, drawdown measurements less meaningful

### Data Source

- **Current:** Fetched from VnStock or SSC via `ohlcv_backfill` or `ohlcv_fetch_daily`
- **Storage:** `backtest_prices` table

---

## Error Handling

### No Signals Found

```json
{
  "error": "No signals or prices for date range 2025-01-01 to 2025-05-05"
}
```

### Mutex Busy (Another Backtest Running)

```json
{
  "error": "Backtest already running. Please wait or delete the running instance."
}
```

### Strategy Not Found

```json
{
  "error": "Strategy not found: invalid-strategy-id"
}
```

Valid strategies: `kinh-dich-high-confidence`, `kinh-dich-all`, `combined-high-confidence`.

### Backtest Run Not Found

```json
{
  "error": "Backtest run not found: invalid-uuid"
}
```

---

## Performance Considerations

### Concurrency

- **1 backtest per server instance** (global mutex)
- Concurrent requests queue
- Lock held during entire computation + DB write

### Large Date Ranges

- 2+ years of data × 30 tickers = ~15k price rows
- Computation time: typically 5-30 seconds
- Equity curve stored as JSON array (can be large)

### CSV Export

- Full trade list exported (one row per trade)
- File size proportional to number of trades
- Typical: 40-500 trades per month

---

## Vietnamese Notes

- All metrics in output are in **Vietnamese** (e.g. "Tổng lợi nhuận")
- Date format: **YYYY-MM-DD** (ISO, for precision)
- Return percentages: decimal (0.1523 = 15.23%)

---

## Related Tools

- `run_kinhdich_backtest` — Hexagram-specific accuracy test (separate tool)
- `ohlcv_backfill` — Fill OHLCV data gaps before backtesting
- `ohlcv_fetch_daily` — Fetch latest OHLCV data

---

## Implementation Notes

- **Mutex pattern:** Global lock prevents concurrent execution
- **DB transactions:** Each backtest run is a single DB insert (ACID)
- **Signal matching:** Indexed queries on ticker + date for performance
- **Equity curve:** Calculated as cumulative product of daily returns
- **Per-ticker tracking:** Position weight = 1 / num_tickers

