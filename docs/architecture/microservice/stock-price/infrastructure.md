# stock-price — Infrastructure

**Package:** `pkg/infrastructure/fetchers.go`

## Tier 1: VnDirect stock_prices (Tier1Fetcher)
- **Constructor:** `NewTier1Fetcher() *Tier1Fetcher`
- **Endpoint:** `https://api-finfo.vndirect.com.vn/v4/stock_prices?sort=date&q=code:{code}~date:gte:{today}&size=1`
- **Timeout:** 3000ms (`context.WithTimeout`)
- **HTTP client:** `net/http` with 3s timeout, browser User-Agent header
- **Response mapping:** `close*1000→Price`, `nmVolume→Volume`, `change→Change`, `pctChange→ChangePercent`, `floor→Source`
- **Source:** Dynamic from `floor` field: `"hose"`, `"hnx"`, or `"upcom"`
- Returns `nil, nil` on HTTP error, JSON parse failure, or empty data (tier miss, not error)
- **Note:** FIX-HNX-UPCOM-PRICE-SOURCES-DEAD: Changed from `/v4/stocks` (company info only, no prices) to `/v4/stock_prices` (OHLCV data)

## Tier 2: VnDirect stock_prices Historical (Tier2Fetcher)
- **Constructor:** `NewTier2Fetcher() *Tier2Fetcher`
- **Endpoint:** `https://api-finfo.vndirect.com.vn/v4/stock_prices?sort=date&q=code:{code}&size=1`
- **Timeout:** 3000ms
- **Response mapping:** Same as Tier1 (`close*1000→Price`, `nmVolume→Volume`, etc.)
- **Source:** Dynamic from `floor` field
- Returns `nil, nil` on any error
- **Note:** Omits date filter to return most recent available data (fallback for after-hours or when today's data unavailable)

## Tier 3: SQLite Cache (Tier3Fetcher)
- **Constructor:** `NewTier3Fetcher(marketDBPath string) *Tier3Fetcher`
- **Driver:** `mattn/go-sqlite3` via `database/sql`
- **DSN:** `file:{marketDBPath}?mode=ro&_journal_mode=WAL&_busy_timeout=5000`
- **SQL:**
  ```sql
  SELECT price, volume, updated_at, change_amt, change_pct FROM market_prices WHERE code = ?
  ```
- `Change`, `ChangePercent` populated from `change_amt`, `change_pct` if available
- **Source:** `"cache"`
- Returns `nil, nil` if row not found (`sql.ErrNoRows`)
- **Note:** FIX-HNX-UPCOM-PRICE-SOURCES-DEAD: Column name corrected from `fetched_at` to `updated_at` to match production schema

## SQLitePriceHistoryRepository
- **Constructor:** `NewSQLitePriceHistoryRepository(marketDBPath, ownDBPath string) *SQLitePriceHistoryRepository`

### GetHistory(code string, days int) ([]DailyOHLCV, error)
- Reads from `market.db` (readonly WAL DSN)
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

### SaveQuote(quote PriceQuote) error
- Writes to `stock_price.db` (write DB, `mattn/go-sqlite3`)
- Creates table if not exists: `(code TEXT, price REAL, volume REAL, fetched_at TEXT)`
- Fire-and-forget via goroutine; error discarded
- Inserts: `(quote.Code, quote.Price, quote.Volume, quote.FetchedAt)`

## Database Configuration
- **Read DB (market.db):** `DB_PATH` env var (default: `./data/market.db`) — shared readonly WAL
- **Write DB (stock_price.db):** `STOCK_PRICE_DB_PATH` env var (default: `./data/stock_price.db`) — isolated write
- Separate write DB prevents contention with other readers (mcp-server writes market.db)

## Environment Variables
```
PORT                  → 5000 (internal, mapped to 5010 on host)
DB_PATH               → ./data/market.db  (Tier3 read source + GetHistory)
STOCK_PRICE_DB_PATH   → ./data/stock_price.db  (SaveQuote write target)
```

## CGO Driver Registration (Fence-C)

`_ "github.com/mattn/go-sqlite3"` (blank import — driver registration) lives exclusively in
`cmd/server/main.go` (composition root). `pkg/infrastructure/fetchers.go` uses only
`database/sql` with the driver name string `"sqlite3"` — it does NOT import mattn directly.
This satisfies Fence-C (depguard rule in `apps/stock-price/.golangci.yml`): CGO is confined to
the composition root; test files (`*_test.go`) are exempt.

## Build Requirements
- CGO_ENABLED=1 (mattn/go-sqlite3 requires CGO)
- Docker: `golang:1.22-alpine` + `apk add gcc musl-dev` in builder stage
- Runtime: `alpine:3.19` + `ca-certificates tzdata`
- Sandbox (`cmd/sandbox/main.go`) MUST build with `CGO_ENABLED=0` — no mattn import anywhere in primitive/module/sandbox
