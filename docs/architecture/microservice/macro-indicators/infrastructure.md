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

## FredMacroAdapter
- **File:** `apps/macro-indicators/src/infrastructure/scrapers/fred-macro.ts`
- Implements `FredMacroPort`
- **Auth:** `FRED_API_KEY` env var (32-char key). If absent, `isAvailable()` returns false and all methods return null-filled records.
- **Base URL:** `https://api.stlouisfed.org/fred/series/observations`
- **Per-series timeout:** `AbortSignal.timeout(10_000)` (10s)
- **Concurrency:** `Promise.all` across all 8 series — parallel dispatch, ~1s total wall time (previously sequential + 0.6-1s sleeps = 8-12s which exceeded the 8s per-source budget)
- **FRED rate limit:** 120 req/min — 8 parallel calls is safe

### fetchSeries(seriesId, limit=10)
Fetches the N most-recent observations for a single FRED series. Returns `FredSeriesResult | null`.
FRED API returns HTTP 200 with `error_code` in body on key failure — handled explicitly.

### fetchAllMacro()
Fan-out via `Promise.all` over `FRED_SERIES` entries. Returns `Record<name, FredSeriesResult | null>`.
One series failure returns null for that key; others are unaffected.

### FRED_SERIES catalog (8 series)
| Key | Series ID | Description |
|-----|-----------|-------------|
| `fed_funds_rate` | FEDFUNDS | Federal Funds Rate (monthly) |
| `us_cpi` | CPIAUCSL | US CPI (monthly) |
| `vix` | VIXCLS | CBOE VIX (daily) |
| `us_10y_yield` | GS10 | 10-Year Treasury Yield |
| `yield_spread_10y2y` | T10Y2Y | 10Y-2Y spread (recession signal) |
| `usd_broad_index` | DTWEXBGS | USD Broad Goods Index |
| `us_unemployment` | UNRATE | US Unemployment Rate |
| `us_10y_breakeven_infl` | T10YIE | 10-Year Breakeven Inflation Rate |

## WorldBankMacroAdapter
- **File:** `apps/macro-indicators/src/infrastructure/scrapers/world-bank-macro.ts`
- Implements `WorldBankMacroPort`
- **Base URL:** `https://api.worldbank.org/v2/country/VN/indicator`
- **Auth:** None (open API)
- **Per-indicator timeout:** `AbortSignal.timeout(10_000)` (10s)
- **Concurrency:** `Promise.all` across all 7 indicators — parallel dispatch, ~2-3s total wall time (previously sequential + 1.5-2.5s jitter sleeps = 10-17s which exceeded the 8s per-source budget)
- **World Bank rate limit:** 10 req/10s public limit — 7 parallel calls is safe
- Fetches 7 VN annual macro indicators: GDP, GDP growth, CPI, FDI, exports, imports, unemployment.

### fetchVnIndicator(indicatorCode, mostRecentN=10)
Fetches the N most-recent annual data points for one indicator. Returns `WorldBankDataPoint[]` (empty array on any error).

### fetchVnMacroBatch()
Fan-out via `Promise.all` over `VN_INDICATORS` entries. Returns `Record<name, WorldBankDataPoint[]>`.
One indicator failure returns `[]` for that key; others are unaffected.

### VN_INDICATORS catalog (7 indicators)
| Key | WB Code | Description |
|-----|---------|-------------|
| `gdp_usd` | NY.GDP.MKTP.CD | GDP (current US$) |
| `gdp_growth` | NY.GDP.MKTP.KD.ZG | GDP growth (annual %) |
| `cpi_inflation` | FP.CPI.TOTL.ZG | Inflation, CPI (annual %) |
| `fdi_inflows` | BX.KLT.DINV.CD.WD | FDI net inflows (BoP, current US$) |
| `exports_usd` | NE.EXP.GNFS.CD | Exports of goods and services (US$) |
| `imports_usd` | NE.IMP.GNFS.CD | Imports of goods and services (US$) |
| `unemployment` | SL.UEM.TOTL.ZS | Unemployment, total (% of labor force) |

## NullCalendarAdapter (wontfix 2026-05-18)
- **File:** `apps/macro-indicators/src/infrastructure/scrapers/investing-economic-calendar.ts`
- Implements `InvestingCalendarPort`
- **Status:** Wontfix — investing.com/economic-calendar permanently unreachable from Docker container. Cloudflare Turnstile v2 JS challenge blocks all bypass attempts (FlareSolverr v3.4.6, curl_cffi chrome124/136).
- **Current behavior:** `NullCalendarAdapter` — returns `[]` immediately with zero CPU/RAM cost.
- **Per-source timeout (orchestrator level):** `0ms` — `DEFAULT_TIMEOUTS.calendar = 0`; NullCalendarAdapter resolves instantly.
- **History:**
  - 2026-05-13: FlareSolverr smoke test passed (1.53MB HTML, 5s) — initial hope
  - 2026-05-13: Subsequent calls always timeout — endpoint permanently blocked
  - 2026-05-17: Timeout cap reduced 30s → 10s → 5s to limit cycle blocking
  - 2026-05-18: Wontfix — `InvestingCalendarAdapter` (deprecated) replaced by `NullCalendarAdapter`
- **InvestingCalendarPort + EconomicCalendarEvent types retained** in `domain/repositories.ts` for future use.
- **Python helper retained** (`investing_calendar_fetch.py`) as historical reference; not executed.

## Environment Variables
```
PORT         → 5004
DB_PATH      → ./data/market.db (readonly)
FRED_API_KEY → 32-char FRED API key (optional — adapter activates automatically when set)
```
