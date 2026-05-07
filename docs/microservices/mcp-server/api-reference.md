# mcp-server — API Reference

## HTTP Endpoints

### POST /api/push-prices
- **Auth:** `X-API-Key` or `Authorization: Bearer`
- **Body:** `Array<{code, price, high?, low?, open?, close?, volume?, change_pct?, ref_price?, fetched_at?, type?: "stock"|"index"|"global_index"}>`
- **Processing:**
  1. Upsert to market_prices (INSERT OR REPLACE)
  2. Compute change_pct from ref_price → prev close → fallback
  3. Write 1-min ticks to market_prices_history (24h rolling)
  4. Upsert daily_ohlcv
  5. Force WAL checkpoint if count > 50
- **Price scaling:** Stocks x1000 (VPS API in thousands), indices/global as-is

### POST /api/push-foreign-flow
- **Auth:** Same as push-prices
- **Body:** `Array<{code, date, foreign_buy_vol, foreign_sell_vol, put_through_vol}>`
- Writes to daily_ohlcv foreign flow columns
- Circuit breaker: 5 failures → open (30s recovery)

### POST /webhook
Generic webhook receiver for external notifications

## MCP Tools (200+ across 13 categories)

### Market Data
- `get_market_snapshot` — live prices from HOSE/HNX/UPCOM
- `get_patterns` — RAG vector search for historical patterns

### Ticker Intelligence
- `get_ticker_profile`, `get_ticker_valuation`, `search_stocks`

### Price Alerts
- `create_price_alert`, `list_price_alerts`, `trigger_price_alert`

### Technical Indicators
- `get_technical_analysis` — MA, RSI, Bollinger Bands
- `get_volatility_metrics` — historical + implied volatility

### Foreign Flow
- `get_foreign_flow_summary`, `get_foreign_flow_timeline`

### Sector Analysis (15 tools)
- leadership, correlation, pharma, rotation, publicInvestment, creditFlow, supplyChain, crisis, bondMaturity, energy, legalRisk, brokerCredibility, climate

### Kinh Dich
- `cast_hexagram`, `get_hexagram_backtest`, `get_kinhDich_reading`

### Briefings
- `get_morning_briefing`, `get_evening_summary`

### Alert Management (8 tools)
- `get_alerts`, `ack_alert`, `create_custom_alert`, alert digest/mute/accuracy

### Backtesting
- `run_backtest`, `get_backtest_results`, `backtest_configure`, `backtest_cleanup`

### Macro
- `get_macro_indicators`, `get_yield_curve`, `get_earnings_yield`

### Portfolio
- `get_portfolio_snapshot`, `export_portfolio`, `rebalance_portfolio`

### Financial Reports
- BCTC discovery + parse + store pipeline

### System
- Health checks, config status, SLA dashboard, cycle bootstrap

## Scheduler / Cron Jobs (47 jobs)

### Market Data (every-minute to daily)
| Job | Interval | Purpose |
|-----|----------|---------|
| foreignFlowFetcherJob | 60s | 4-tier VPS fallback |
| marketScanJob | trading hours | Watchlist scan + signal detect |
| ohlcvDailyAggregatorJob | 30min | Intraday→daily OHLCV |
| taAlertScanJob | 5min | TA alert detection |
| vnIndexRefreshJob | 5min (trading) | VN-Index benchmark |
| foreignFlowAlertJob | 10min | Foreign flow anomalies |

### Briefings
| Job | Time (GMT+7) | Purpose |
|-----|-------------|---------|
| morningBriefingJob | 08:00 Mon-Fri | Morning intelligence |
| eveningSummaryJob | 22:00 Mon-Fri | Daily close summary |
| franceSummaryJob | 09:30 | European context |

### Financial Reports
| Job | Interval | Purpose |
|-----|----------|---------|
| bctcPdfPullJob | Daily 10:00 | SSC→VPS PDF pull |
| bctcBatchSweepJob | 4 hours | Reprocess failures |
| bctcReparseJob | Daily 02:00 | Full re-extraction |
| bctcOverdueCheckJob | Weekly Mon 08:00 | Overdue filing alerts |

### System
| Job | Interval | Purpose |
|-----|----------|---------|
| freshnessSlaMonitorJob | 10min | SLA compliance |
| askQueueCheckJob | 5min | User query processing |
| vpsServiceHealthJob | 5min | VPS availability |
| integrityCheckJob | Weekly Sat 02:00 | DB integrity |

See `.claude/knowledge/cron-jobs.md` for complete list with exact cron expressions.
