# stock-price — Infrastructure

## Tier 1: VnDirect api-finfo (Tier1VnDirectFetcher)
- **File:** `apps/stock-price/src/infrastructure/repositories.ts`
- **Endpoint:** `https://api-finfo.vndirect.com.vn/v4/stocks?q=code:{code}&size=1`
- **Timeout:** 3000ms (AbortSignal)
- **Response mapping:** `close→price`, `volume→volume`, `change→change`, `pctChange→changePercent`
- **Source:** `'hose'`
- Returns `null` on HTTP error or JSON parse failure

## Tier 2: VnDirect Legacy (Tier2VnDirectLegacyFetcher)
- **File:** `apps/stock-price/src/infrastructure/repositories.ts`
- **Endpoint:** `https://finfo-api.vndirect.com.vn/v4/stocks?q=code:{code}&size=1`
- **Timeout:** 3000ms
- **Response mapping:** `matchPrice→price`, `totalVolume→volume`, `priceChange→change`, `pctPriceChange→changePercent`
- **Source:** `'hnx'`

## Tier 3: SQLite Cache (Tier3CacheFetcher)
- **File:** `apps/stock-price/src/infrastructure/repositories.ts`
- Opens DB with `{ readonly: true }`
- **SQL:**
  ```sql
  SELECT price, volume FROM market_prices
  WHERE code = ? ORDER BY fetched_at DESC LIMIT 1
  ```
- `change: 0`, `changePercent: 0` (not tracked in cache)
- **Source:** `'cache'`

## SQLitePriceHistoryRepository

### getHistory(code, days)
```sql
SELECT
  date(fetched_at) AS day,
  MIN(price) AS low, MAX(price) AS high,
  AVG(price) AS close, AVG(price) AS open,
  SUM(volume) AS volume
FROM market_prices
WHERE code = ? AND fetched_at >= date('now', ? || ' days')
GROUP BY date(fetched_at) ORDER BY day ASC
```

### saveQuote(quote)
- Writes to **isolated** `market_prices_cache` table (separate DB file)
- Creates table if not exists: `(code TEXT, price REAL, volume REAL, fetched_at TEXT)`
- Fire-and-forget, exceptions swallowed

## Database Configuration
- **Read DB:** `DB_PATH` env var (default: `./data/market.db`) — shared readonly
- **Write DB:** `STOCK_PRICE_DB_PATH` env var (default: `./data/stock_price.db`) — isolated
- Separate write DB prevents contention with other readers

## Environment Variables
```
PORT              → 5000 (internal, mapped to 5010 on host)
DB_PATH           → ./data/market.db
STOCK_PRICE_DB_PATH → ./data/stock_price.db
```
