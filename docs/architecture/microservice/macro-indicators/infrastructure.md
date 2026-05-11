# macro-indicators — Infrastructure

## HTTPCommodityFetcher
- **File:** `apps/macro-indicators/src/infrastructure/repositories.ts`
- Implements `CommodityFetcherPort`
- All requests use `AbortSignal.timeout(5000)` (5 seconds)
- Returns `null` on any error (network, parse, timeout)

### Yahoo Finance API Endpoints

| Method | Symbol | URL |
|--------|--------|-----|
| `fetchOilUsd()` | `CL=F` | `https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=1d` |
| `fetchGoldUsd()` | `GC=F` | `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d` |
| `fetchUsdVnd()` | `USDVND=X` | `https://query1.finance.yahoo.com/v8/finance/chart/USDVND=X?interval=1d&range=1d` |

**Response extraction:** `data.chart.result[0].meta.regularMarketPrice`

## SQLiteMacroRepository
- **File:** `apps/macro-indicators/src/infrastructure/repositories.ts`
- Implements `SBVRatePort`
- Opens DB readonly for each query (no persistent connection)

### fetchVnIndex()
```sql
SELECT value FROM macro_indicators
WHERE indicator_name LIKE '%VN-Index%' OR indicator_name LIKE '%VNINDEX%'
ORDER BY fetched_at DESC LIMIT 1
```

### fetchSBVRates()
```sql
SELECT indicator_name, value FROM macro_indicators
WHERE indicator_name LIKE '%SBV%' OR indicator_name LIKE '%exchange%'
ORDER BY fetched_at DESC LIMIT 10
```

## Database
- **Table used:** `macro_indicators` (columns: indicator_name, value, fetched_at)
- **Access:** readonly (`market.db`)
- **No owned tables** — reads only from mcp-server's macro_indicators table

## Environment Variables
```
PORT    → 5004
DB_PATH → ./data/market.db (readonly)
```
