# Tool Group: market-data (mcp-server)

**Module path:** `src/interface/mcp/tools/market-data/`
**Scheduler:** `src/scheduler/market-data/` (8 jobs)
**Domain services:** foreignFlowAnalyzer, technicalIndicators, intradayAnalyzer, priceAlertChecker, orderBookAnalyzer, volatilityCalculator

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_price_history` | OHLCV + price history for a ticker | ticker, days | market.db ohlcv_daily |
| `get_market_snapshot` | Current prices for entire watchlist | — | market.db market_prices |
| `get_market_context` | Market context: prices + sentiment + macro summary | — | market.db + macro-indicators |
| `get_technical_indicators` | RSI, MACD, BB, MA for a ticker | ticker, indicators[] | technical-analysis svc (HTTP) |
| `get_ticker_intelligence` | Combined TA + price + context for one ticker | ticker | technical-analysis svc + market.db |
| `get_patterns` | Pattern matches (head-shoulders, wedges, etc.) | ticker, lookback | technical-analysis svc |
| `get_insider_signals` | Insider trade signals above threshold | — | market.db (insider_trades) |
| `get_foreign_flow` (market-data_foreignFlow) | Foreign buy/sell flow by ticker/sector | ticker?, sector? | market.db (foreign_flow) |
| `get_price_alert` (market-data_priceAlert) | Active price alerts for watchlist | — | market.db (price_alerts) |
| `validate_signal_price` | Validate a signal price vs live ±5% | ticker, price | market.db market_prices |

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `marketScanJob` | Every 5min (market hours) | Scan market for unusual moves |
| `foreignFlowAlertJob` | Every 15min | Alert on foreign buy/sell anomalies |
| `insiderCheckJob` | Daily | Check new insider trade filings |
| `taAlertScanJob` | Every 30min | Scan TA signals across watchlist |
| `taAlertNotifierJob` | After taAlertScan | Telegram notify triggered TA alerts |
| `ohlcvDailyAggregatorJob` | Daily 16:30 VN | Aggregate daily OHLCV |
| `ohlcvStalenessCheckJob` | Hourly | Alert if OHLCV data goes stale |
| `ohlcvStartupProbe` | Startup | Verify OHLCV data available on boot |

---

## Invariants

1. All price data in VND.
2. `validate_signal_price` ±5% tolerance — mandatory before any trade signal is confirmed.
3. Foreign flow data pushed by VPS at 60s intervals during market hours.
4. taAlertScanJob calls technical-analysis microservice via HTTP (not direct domain import — Phase 3b).
