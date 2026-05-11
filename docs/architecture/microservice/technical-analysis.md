# Microservice: technical-analysis

**Language:** TypeScript / Bun
**Port:** 5003 (external + internal)
**Role:** Technical indicator computation. Computes RSI, MACD, Bollinger Bands, moving averages, and intraday patterns on demand. Reads `market.db` (readonly) for price history. Returns computed indicators to mcp-server via HTTP.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | TA indicator logic | technicalIndicators.ts, intradayAnalyzer.ts, orderBookAnalyzer.ts, volatilityCalculator.ts |
| infrastructure | `market.db` (readonly), HTTP server | Read price/OHLCV data, serve computed results |
| interface | HTTP endpoints | Called by mcp-server |

---

## Tool Surface

TA tools live in mcp-server. See `docs/architecture/microservice/mcp-server/market-data.md` for: `get_technical_indicators`, `get_ticker_intelligence`, `get_price_history`, `get_patterns`.

---

## Upstream Dependencies (data in)

| Source | How |
|--------|-----|
| `market.db` | Read-only SQLite access (ohlcv_daily, market_prices) |
| mcp-server | HTTP requests triggering computation |

---

## Downstream Dependencies (calls out)

None. Leaf service.

---

## Database Write Authority

None. Reads `market.db` with `readonly:true`. Does not own any database.

---

## Scheduler Jobs (in mcp-server)

TA alert jobs run in mcp-server's scheduler, not in this service:
- `taAlertScanJob` — scans watchlist tickers for TA signals
- `taAlertNotifierJob` — sends Telegram for triggered TA alerts
- `ohlcvDailyAggregatorJob` — aggregates daily OHLCV

These jobs call technical-analysis microservice via HTTP (Phase 3b refactor — no direct domain imports).

---

## Known Invariants

1. Reads `market.db` in readonly mode — never writes.
2. TA computation is stateless — no DB write authority.
3. Phase 3c: TA alert scan runs concurrently with BB alert scan via `Promise.allSettled()` in mcp-server scheduler.
