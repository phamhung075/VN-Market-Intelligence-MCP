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
| `get_market_snapshot` | Current prices for entire watchlist + breadth + liquidity summary | — | market.db market_prices + vnmarket_prices API |
| `get_market_breadth` | HOSE market breadth (advances/declines/ceiling/floor) + liquidity (tỷ đồng, delta vs prior session) | — | VnDirect api-finfo.vndirect.com.vn/v4/vnmarket_prices |
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
5. Writer B (storeTradingStats / VCI) must NOT overwrite foreign_volume / foreign_room — those belong to Writer A (upsertForeignFlow / VPS). ON CONFLICT DO UPDATE excludes those columns (FIX-FOREIGN-FLOW-INTEGRITY-BREAK).
6. daily_ohlcv.foreign_buy_value / foreign_sell_value store VND money-value from bgapidatafeed fBValue/fSValue. `get_foreign_flow` serves these as tỷ đồng ("Mua ròng") and derives foreign_net_value on read (buy − sell) — not a stored column (FIX-FOREIGN-FLOW-COVERAGE).
7. `get_market_snapshot` + `get_market_breadth` both read from the same VnDirect vnmarket_prices endpoint (zero extra network cost). Breadth counts reflect HOSE composite (VNINDEX). Turnover in tỷ đồng.
8. `GET /api/ohlcv-codes` (`ohlcvBackfillHandler.ts`) serves `SELECT DISTINCT code FROM daily_ohlcv` — the full traded-code universe (~1459 codes live), no hardcoded list. `vps-scripts/fetch-foreign-flow.sh` sources its CODES list from this endpoint (fallback: `/api/watchlist`, the 111-code watchlist+referenceStocks subset), so foreign-flow coverage tracks the full traded universe rather than a fixed allowlist. `foreign_net_vol`/`foreign_buy_value`/`foreign_sell_value` stay NULL for a code+date until (a) that code has a `daily_ohlcv` row for the date (written by the price/backfill pipelines) and (b) a foreign-flow push cycle lands after that row exists — no fabricated OHLCV rows are ever created to force a foreign-flow write (FIX-FOREIGN-FLOW-COVERAGE).
9. `POST /api/ohlcv-backfill-done` (`ohlcvBackfillHandler.ts` `handleOhlcvBackfillDone`) closes `ohlcv_backfill_queue` rows (`done=1`) unconditionally on every call — this preserves `vn-ohlcv-backfill.timer`'s (30-min systemd oneshot on the VPS) documented "regardless of exit code" unblock contract. Since ALPHA-S1-OHLCV-BACKFILL-DONE-BUG (2026-07-13) the closing row's `bars_inserted` column (nullable) records the authoritative `bars_pushed_total` reported by `fetch-ohlcv-backfill.sh`'s own POST — `NULL` means no authoritative report ever landed for that row (e.g. the poller's own blind ack closed it first, or the fetch script crashed before reporting). A `bars_inserted` of `NULL` or `0` on the row THIS call actually closed re-queues a fresh `done=0` row (reusing the existing R-5 retry/escalate ladder: `retry_count>=5` → `sendTelegramBug`, else re-queue with `retry_count+1`) instead of a silent no-op success — closing the "457+ queue rows done with zero bars degrading ALPHA-S3 cross-sectional z-scores" gap. Mutually exclusive with the pre-existing watchlist/VNINDEX depth-probe re-queue (only one of the two paths fires per call) to avoid a double re-queue/double Telegram alert for the same underlying event. Design: `docs/handoffs/ALPHA-S1-architect-design.md` §3.
