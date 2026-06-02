# FE-REROUTE-REAL-DATA — Architecture Brief

**Date:** 2026-06-02
**Sprint:** FE-REROUTE
**Author:** architect
**Status:** READY FOR PM

---

## 1. Problem Statement

Three Remix frontend pages (`dashboard.analysis`, `dashboard.db`, `dashboard.fetch`) call
api-gateway paths that proxy to services in `not_deployed_short_keys`. Every call gets a
502. The operator sees: blank Kinh Dich panels, empty price charts, no headlines.

**Not-deployed set (from `docs/data/system-map.json .project.infrastructure.docker.host_runtime_set`):**

| short_key | compose service | deployed? |
|-----------|----------------|-----------|
| kinh-dich | kinh-dich-service | NO |
| stock | stock-price | NO |
| ta | technical-analysis | NO |
| news | news-fetch | NO |
| pdf, rag, alert | various | NO |

---

## 2. Brownfield Investigation Summary

### 2.1 Frontend call map (exact endpoints)

**dashboard.analysis.tsx loader:**
- `GET /kinh-dich/market` → `fetchKinhDichMarket()` → expects `{ hexagram, name, trend, signal, confidence, timestamp }`
- `GET /kinh-dich/reading/{code}` → `fetchKinhDichReading(code)` → extends KinhDichMarket + `{ stock, actionNote?, overallReading? }`
  - Called for 8 `KD_SAMPLE_TICKERS` (FPT/VNM/HPG/VCB/MSN/VIC/SSI/VJC) in parallel
  - Called again for any `?stock=` selected stock
- `GET /stock/price/batch?tickers=VNM,FPT,...` → `fetchWatchlistPrices()` → `{ quotes: Record<ticker, { close, changePct, direction, signalCount }> }` OR flat array
- `GET /stock/price/history?code=X&days=N` → `fetchPriceHistory(code, 90)` → `{ code, history: DailyOHLCV[] }` — history array contains `{ date, code, open, high, low, close, volume }`
- `POST /ta/ta/indicators` body `{ code, date }` → `fetchTASnapshot()` → `{ code, rsi, macd:{line,signal,histogram}, movingAverages, bollingerBands, trend, computedAt }`
- `/macro/snapshot` and `/mcp/api/*` — WORK (macro-indicators + mcp virtual alias deployed)

**dashboard.db.tsx loader:**
- `GET /stock/price/history?code=VNINDEX&days=30` → same shape as above
- `GET /news/reuters/headlines` → `fetchReutersHeadlines()` → array parsed from `{ articles: [{title|headline, url, publishedAt, source, summary}] }` OR flat array

**dashboard.fetch.tsx loader:**
- `GET /news/reuters/headlines` → same as above
- `GET /news/bloomberg/headlines` → same shape, bloomberg source
- `GET /macro/external` — WORKS (macro-indicators deployed)

### 2.2 Data availability in mcp-server plane (:3000)

#### Kinh Dich reading — REAL-REACHABLE

`kinhdich_readings` table in `market.db` is written by the 15-min intelligence cycle (source=`cycle`).
`hexagramStore.getLatestReading(code)` returns: `{ hexagramNumber, hoQueNumber, bienQueNumber, haoStates, timestamp, tradingSignal, confidence }`.
`QUE_META` array in `hexagramNames.ts` maps hexagramNumber → `{ id, name, chinese }`.
`hexagramLibrary.ts` has `trend`, `tradingSignal` derivation.

**Sufficient to answer `KinhDichReading` shape.** The `actionNote` and `overallReading` fields
require the full domain re-computation (kinhDichReading.ts). These are non-fatal optional fields in
the frontend — absent values show nothing, no error. Do NOT re-run the full domain computation
server-side per HTTP request; serve what is cached.

#### Kinh Dich market — REAL-REACHABLE (derived)

`get_market_hexagram` was deregistered (TSH-1, 2026-05-31) — kinh-dich-service:5005/market returns 501.
No VNINDEX row exists in `kinhdich_readings` by default.

**Design**: aggregate the most recent reading across all watchlist stocks. Take the
hexagram with the highest confidence among the latest-per-stock readings. Use its
`tradingSignal` + `confidence` as the market signal. `trend` derived from tradingSignal.
`timestamp` = MAX(timestamp) across selected rows. This is an honest derived view, not fabricated.
Document in the endpoint response: `derived: true, note: "Aggregated from watchlist readings"`.

#### Stock price history — REAL-REACHABLE

`daily_ohlcv` table: columns `code, date, open, high, low, close, volume, updated_at`.
Query: `SELECT code, date, open, high, low, close, volume FROM daily_ohlcv WHERE code = ? ORDER BY date ASC` with LIMIT on days.
VNINDEX is stored as code `VNINDEX` (reference stock, present in `mcp.config.json globalIndices`).
Verify: the VPS push script pushes VNINDEX as part of the reference stocks fetch.

#### Stock price batch — REAL-REACHABLE

`market_prices` table: `code, price, change_pct, volume, updated_at`.
`daily_ohlcv` fallback for stale/missing market_prices (same pattern as `priceQueries.ts`).
`agent_signals` count per stock_code for `signalCount` field.
Shape required: `{ quotes: { [ticker]: { close, changePct, direction, signalCount } } }`.

#### News (Reuters/Bloomberg headlines) — REAL-REACHABLE (existing endpoint, routing only)

`/api/news-fetch/live?source=reuters` already exists in mcp-server and queries `rag_analyses`
filtering `WHERE source_url LIKE '%reuters%'`. Returns `{ ok, source, count, rows: [{headline, url, published_at, sentiment, impact_direction, impact_score, created_at}] }`.

The frontend `parseHeadlines()` in client.ts already handles the `{ articles: [...] }` envelope
AND flat arrays. The `newsFetchLiveHandler` returns an `{ ok, rows: [...] }` shape — `rows` not
`articles`. This mismatch requires a **minimal frontend shim** OR a thin new endpoint that wraps
the existing handler in an `articles`-keyed envelope.

Simplest: add a wrapper endpoint `GET /mcp/api/news/headlines?source=reuters` that calls
through to the DB query and returns `{ articles: [{ title, url, publishedAt, source }] }`.
This matches the existing client-side `parseHeadlines` logic exactly.

#### TA indicators — HONEST UNAVAILABLE

`technical-analysis:5003` is NOT deployed. There is NO cached TA data in mcp-server's DB.
The domain service files (`hexagramLibrary`, `kinhDichReading`) do not compute RSI/MACD.
`fetchTASnapshot()` is already wrapped in a non-fatal try/catch in the loader — `ta: null` flows
through to the `AnalysisDecision` component which shows `—` for TA rows.

**No new work needed for TA.** The frontend already handles `ta=null` gracefully.
The only change: add an honest sub-text to the InfoSourcePanel "TA service (not deployed on
this host)" instead of a bare `—`. This is a minimal frontend-only label change, optional.

---

## 3. New mcp-server REST Endpoints

### ZONE: dev-mcp-server

All new endpoints follow the established pattern in `server.ts` — inline route-match +
`handleXxx(req, res, db)` call to a new route handler in
`apps/mcp-server/src/interface/mcp/routes/`.

#### 3.1 GET /mcp/api/kinh-dich/reading/:code

**Purpose:** Per-stock hexagram reading from DB cache.

**Request:** `GET /mcp/api/kinh-dich/reading/{code}` (no query params required)

**Response shape** (matches `KinhDichReading` frontend interface exactly):
```json
{
  "stock": "FPT",
  "hexagram": 42,
  "name": "Ích",
  "trend": "THUẬN LỢI",
  "signal": "MUA (tích cực)",
  "confidence": 0.72,
  "timestamp": "2026-06-01T14:30:00.000Z",
  "actionNote": null,
  "overallReading": null
}
```

**Source:** `kinhdich_readings` table (latest row per `stock_code`).
`QUE_META[hexagram_number]` → `name`. `tradingSignal` → `signal`. `confidence` direct.
`trend` derived: if tradingSignal contains "MUA" → "THUẬN LỢI"; contains "BÁN" → "BẤT LỢI";
else "TRUNG TÍNH".

**Error cases:**
- `404` when no row exists for the code (no data yet from intelligence cycle).
- `400` when code is empty.

**File:** `apps/mcp-server/src/interface/mcp/routes/kinhDichReadingHandler.ts`

#### 3.2 GET /mcp/api/kinh-dich/market

**Purpose:** Aggregate market hexagram signal derived from watchlist readings.

**Request:** `GET /mcp/api/kinh-dich/market` (no params)

**Response shape** (matches `KinhDichMarket` frontend interface):
```json
{
  "hexagram": 42,
  "name": "Ích",
  "trend": "THUẬN LỢI",
  "signal": "MUA (tích cực)",
  "confidence": 0.68,
  "timestamp": "2026-06-01T14:30:00.000Z",
  "derived": true,
  "note": "Aggregated from watchlist readings"
}
```

**Derivation algorithm (pure, no I/O beyond DB read):**
1. Fetch latest `kinhdich_readings` row per distinct `stock_code` from `watchlist` table.
2. Among all rows, pick the row with maximum `confidence` as the representative.
3. `hexagram` = its `hexagram_number`, `name` from `QUE_META`, `signal` = `trading_signal`,
   `confidence` = weighted average of all watchlist confidences.
4. `timestamp` = MAX timestamp across all selected rows.
5. If 0 rows: `503` with `{ error: "no_readings", detail: "Intelligence cycle has not run yet" }`.

**File:** `apps/mcp-server/src/interface/mcp/routes/kinhDichMarketHandler.ts`

#### 3.3 GET /mcp/api/prices/history

**Purpose:** OHLCV price history for a single ticker (including VNINDEX).

**Request:** `GET /mcp/api/prices/history?code=FPT&days=30`
- `code`: required, uppercase ticker or index code
- `days`: optional integer, default 30, max 365, clamped server-side

**Response shape** (matches what `fetchPriceHistory` client parses — `{ history: [...] }` envelope):
```json
{
  "code": "FPT",
  "days": 30,
  "count": 22,
  "history": [
    { "date": "2026-05-01", "code": "FPT", "open": 112000, "high": 116000, "low": 111000, "close": 115000, "volume": 1230000 }
  ]
}
```

**Source:** `daily_ohlcv` table. Query:
```sql
SELECT code, date, open, high, low, close, volume
FROM daily_ohlcv
WHERE code = ?
  AND date >= date('now', '-' || ? || ' days')
ORDER BY date ASC
```

**Error cases:** `400` empty code, `404` no rows.

**File:** `apps/mcp-server/src/interface/mcp/routes/priceHistoryHandler.ts`

#### 3.4 GET /mcp/api/prices/batch

**Purpose:** Latest price snapshot for a set of tickers (watchlist overview tiles).

**Request:** `GET /mcp/api/prices/batch?tickers=VNM,FPT,HPG`
- `tickers`: comma-separated list, max 50 tickers

**Response shape** (matches Shape 1 of `fetchWatchlistPrices` client parse — `{ quotes: {...} }`):
```json
{
  "quotes": {
    "FPT": { "ticker": "FPT", "close": 115000, "changePct": 1.23, "direction": "up", "signalCount": 3 },
    "VNM": { "ticker": "VNM", "close": 67000, "changePct": -0.45, "direction": "down", "signalCount": 1 }
  }
}
```

**Source:**
- Price: `COALESCE(market_prices.price, latest daily_ohlcv.close)` — reuse `currentPriceQuery()` helper from `priceQueries.ts`.
- `changePct`: from `market_prices.change_pct` (null when no intraday data → 0).
- `direction`: `changePct > 0.01` → "up", `< -0.01` → "down", else "flat".
- `signalCount`: `SELECT COUNT(*) FROM agent_signals WHERE stock_code = ? AND created_at >= datetime('now', '-24 hours')`.

**File:** `apps/mcp-server/src/interface/mcp/routes/priceBatchHandler.ts`

#### 3.5 GET /mcp/api/news/headlines

**Purpose:** Serve news headlines by source from DB cache. Thin wrapper over existing `newsFetchLiveHandler` logic, with shape aligned to frontend `parseHeadlines()`.

**Request:** `GET /mcp/api/news/headlines?source=reuters&limit=15`
- `source`: `reuters` | `bloomberg` | `cafef` | `vnexpress` | `vneconomy` | `all` (default: `all`)
- `limit`: integer 1–50 (default 15)

**Response shape** (matches `parseHeadlines` client — `articles` envelope):
```json
{
  "source": "reuters",
  "count": 12,
  "articles": [
    { "title": "Vietnam...", "url": "https://reuters.com/...", "publishedAt": "2026-06-01T09:00:00Z", "source": "reuters" }
  ]
}
```

**Source:** `rag_analyses` table. Reuse `buildSql(source)` from `newsFetchLiveHandler.ts`.
Map `source_title → title`, `source_url → url`, `published_at → publishedAt`,
`deriveProvider(url) → source`. No duplication of the filtering SQL — import and reuse.

**Note:** The existing `/api/news-fetch/live` returns `{ ok, rows: [{headline, url,...}] }` shape
and is NOT re-pointed. It stays as-is for the news-fetch dashboard. The new endpoint serves
the Remix frontend with the correct `articles` envelope.

**File:** `apps/mcp-server/src/interface/mcp/routes/newsHeadlinesHandler.ts`

---

## 4. API-Gateway Re-Route Rules

### ZONE: dev-api-gateway

The proxy works by extracting the first path segment as the service key
(`route-service-matcher/match.go` → `ExtractServiceName`), then looking up `registry.go`.
`proxy-path-resolver/resolve.go` strips the leading `/:service` segment before forwarding.

**Re-route mechanism:** Add a `FallbackBaseURL` field to `domain.ServiceConfig`. When a
service is in `not_deployed_short_keys`, replace its `BaseURL` with the mcp-server URL.
The downstream path stripping in `proxy-path-resolver` is preserved — the downstream
path after stripping the service key MUST match the mcp-server endpoint.

This means the path rewrite map MUST be path-preserving from the client's perspective.
Example: `GET /kinh-dich/reading/FPT` → service key `kinh-dich`, downstream path `/reading/FPT`.
But the new mcp-server endpoint is `/mcp/api/kinh-dich/reading/FPT`. The stripped path
`/reading/FPT` does NOT match.

**Simpler approach (recommended):** Do NOT use `FallbackBaseURL`. Instead, add a new
`NotDeployedServices []string` field to `StaticServiceRegistry`. In `HandleProxy`, when the
service is in `NotDeployedServices`, look up the mcp service config and reroute to it with
the **full original path** preserved (using `noProbe=true` semantics — verbatim path pass-through).
The mcp-server endpoints are mapped under `/mcp/api/{service-key}/...` — they accept verbatim
incoming paths from the not-deployed service slots.

**Path rewrite table** (original client path → mcp-server receives):

| Client path | api-gateway rewrites to mcp-server |
|-------------|-------------------------------------|
| `GET /kinh-dich/market` | `GET /mcp/api/kinh-dich/market` |
| `GET /kinh-dich/reading/{code}` | `GET /mcp/api/kinh-dich/reading/{code}` |
| `GET /stock/price/history?code=X&days=N` | `GET /mcp/api/prices/history?code=X&days=N` |
| `GET /stock/price/batch?tickers=X,Y` | `GET /mcp/api/prices/batch?tickers=X,Y` |
| `GET /news/reuters/headlines` | `GET /mcp/api/news/headlines?source=reuters` |
| `GET /news/bloomberg/headlines` | `GET /mcp/api/news/headlines?source=bloomberg` |

**Implementation in `handlers.go` `HandleProxy`:**

After `svc := h.registry.GetService(serviceName)` and before the proxy execution, add:

```go
// NOT_DEPLOYED re-route: redirect to mcp-server with path rewrite
if h.registry.IsNotDeployed(serviceName) {
    mcpSvc := h.registry.GetService("mcp")
    if mcpSvc == nil {
        writeJSON(w, http.StatusBadGateway, ...)
        return
    }
    targetBase, _ = url.Parse(mcpSvc.BaseURL)
    downstreamPath = reroute(r.URL.Path, r.URL.RawQuery, serviceName)
    // ... proceed with proxy using mcpSvc.BaseURL + downstreamPath
}
```

**`reroute()` pure function** in `pkg/primitive/not-deployed-rerouter/reroute.go`:
```go
func Reroute(originalPath, rawQuery, serviceName string) string {
    switch serviceName {
    case "kinh-dich":
        // /kinh-dich/market → /mcp/api/kinh-dich/market
        // /kinh-dich/reading/FPT → /mcp/api/kinh-dich/reading/FPT
        suffix := strings.TrimPrefix(originalPath, "/" + serviceName)
        return "/mcp/api/kinh-dich" + suffix + queryPart(rawQuery)
    case "stock":
        // /stock/price/history?... → /mcp/api/prices/history?...
        // /stock/price/batch?... → /mcp/api/prices/batch?...
        suffix := strings.TrimPrefix(originalPath, "/stock/price")
        return "/mcp/api/prices" + suffix + queryPart(rawQuery)
    case "news":
        // /news/reuters/headlines → /mcp/api/news/headlines?source=reuters
        // /news/bloomberg/headlines → /mcp/api/news/headlines?source=bloomberg
        parts := strings.SplitN(strings.TrimPrefix(originalPath, "/news/"), "/", 2)
        source := parts[0] // "reuters", "bloomberg", etc.
        return "/mcp/api/news/headlines?source=" + source + addQuery(rawQuery)
    default:
        return originalPath + queryPart(rawQuery)
    }
}
```

**IsNotDeployed** method added to `StaticServiceRegistry`:
```go
func (r *StaticServiceRegistry) IsNotDeployed(name string) bool {
    notDeployed := map[string]bool{
        "stock": true, "kinh-dich": true, "ta": true,
        "news": true, "pdf": true, "rag": true, "alert": true,
    }
    return notDeployed[name]
}
```

**SSOT binding:** Populate `notDeployed` map at construction time from an env variable
`NOT_DEPLOYED_SERVICES=stock,kinh-dich,ta,news,pdf,rag,alert` (default mirrors system-map).
This means deploying the real service and removing it from the env var restores direct routing
without a code change. The default keeps the 16GB host safe.

**File changes:**
- `apps/api-gateway/pkg/domain/ports.go` — add `IsNotDeployed(name string) bool` to `ServiceRegistryPort`
- `apps/api-gateway/pkg/infrastructure/registry.go` — add `notDeployedSet`, `IsNotDeployed()`, `NOT_DEPLOYED_SERVICES` env parse
- `apps/api-gateway/pkg/primitive/not-deployed-rerouter/reroute.go` — NEW pure function + tests
- `apps/api-gateway/pkg/interface/http/handlers.go` — `HandleProxy` not-deployed branch

---

## 5. Frontend Changes

### ZONE: dev-frontend

**Minimal changes only.**

#### 5.1 News client path alignment (required)

`fetchReutersHeadlines()` calls `GET /news/reuters/headlines`. After api-gateway reroutes to
`/mcp/api/news/headlines?source=reuters`, the response shape `{ source, count, articles: [...] }`
matches the existing `parseHeadlines` envelope handler. No code change needed on the frontend
for news.

#### 5.2 TA honest empty state (optional, low-priority)

In `dashboard.analysis.tsx` `InfoSourcePanel`, the TA rows already show `—` when `ta=null`.
Optional enhancement: change the source label from "TA service" to
"TA service (not deployed)" when `ta` is null. Single string change, no logic change.

**DoD:** This is cosmetic. Do NOT block Phase 1 on it.

#### 5.3 No other frontend changes required

All response shapes from the new mcp-server endpoints are designed to match the existing
`toPricePoint`, `toWatchlistTileData`, `parseHeadlines`, `KinhDichReading`, `KinhDichMarket`
parsers in `client.ts`. No loader rewrites needed.

---

## 6. Honest-Unavailable Contract

| Dataset | Available | Endpoint | Frontend behavior |
|---------|-----------|----------|-------------------|
| Kinh Dich reading | YES — from DB cache | `/mcp/api/kinh-dich/reading/:code` | Real hexagram + signal |
| Kinh Dich market | YES — derived aggregate | `/mcp/api/kinh-dich/market` | Real aggregate signal |
| Price history (OHLCV) | YES — `daily_ohlcv` | `/mcp/api/prices/history` | Real chart data |
| Price batch (watchlist) | YES — `market_prices` + fallback | `/mcp/api/prices/batch` | Real price tiles |
| News headlines | YES — `rag_analyses` | `/mcp/api/news/headlines` | Real cached headlines |
| TA indicators | NO — no cache exists | (none) | Existing `ta=null` graceful `—` |

**Anti-fabrication rule:** `ta=null` is the honest state. The `computeDecision()` in the frontend
already handles `ta=null` with neutral scores. No mock/fallback TA values may be introduced.
Any QA test that sees an RSI value in the frontend when TA service is not deployed = FAIL.

---

## 7. Phased Task Decomposition

### Phase 1 — Kinh Dich + Prices (operator's explicit FPT 502 + watchlist core)

**Target: ship these in one dev sprint. Operator sees FPT hexagram and watchlist grid working.**

| Task | Description | Zone | Route_to | DoD |
|------|-------------|------|----------|-----|
| FE-RR-1 | NEW `kinhDichReadingHandler.ts`: `GET /mcp/api/kinh-dich/reading/:code` reading from DB | dev-mcp-server | dev-mcp-server | `curl :3000/mcp/api/kinh-dich/reading/FPT` returns real hexagram number (not 0, not mock) |
| FE-RR-2 | NEW `kinhDichMarketHandler.ts`: `GET /mcp/api/kinh-dich/market` derived aggregate | dev-mcp-server | dev-mcp-server | `curl :3000/mcp/api/kinh-dich/market` returns derived market hexagram; 503 when 0 readings |
| FE-RR-3 | Register FE-RR-1 + FE-RR-2 in `server.ts` under `/mcp/api/kinh-dich/*` | dev-mcp-server | dev-mcp-server | Routes exist and respond; no existing route shadowed |
| FE-RR-4 | NEW `priceHistoryHandler.ts`: `GET /mcp/api/prices/history?code=X&days=N` | dev-mcp-server | dev-mcp-server | `curl :3000/mcp/api/prices/history?code=VNINDEX&days=14` returns OHLCV array with real dates/prices |
| FE-RR-5 | NEW `priceBatchHandler.ts`: `GET /mcp/api/prices/batch?tickers=X,Y` | dev-mcp-server | dev-mcp-server | `curl :3000/mcp/api/prices/batch?tickers=FPT,VNM` returns quotes map with real closes |
| FE-RR-6 | Register FE-RR-4 + FE-RR-5 in `server.ts` | dev-mcp-server | dev-mcp-server | Routes wired, no regression on existing `/api/push-prices` or `/api/watchlist` |
| FE-RR-7 | `not-deployed-rerouter/reroute.go` NEW pure function + unit tests | dev-api-gateway | dev-api-gateway | Test: `/kinh-dich/reading/FPT` → `/mcp/api/kinh-dich/reading/FPT`; `/stock/price/history?code=VNINDEX` → `/mcp/api/prices/history?code=VNINDEX` |
| FE-RR-8 | `registry.go` add `notDeployedSet` + `IsNotDeployed()` + `NOT_DEPLOYED_SERVICES` env | dev-api-gateway | dev-api-gateway | `IsNotDeployed("kinh-dich")` true; `IsNotDeployed("mcp")` false |
| FE-RR-9 | `ports.go` add `IsNotDeployed` to `ServiceRegistryPort` interface | dev-api-gateway | dev-api-gateway | Interface updated; `StaticServiceRegistry` satisfies it |
| FE-RR-10 | `handlers.go` add not-deployed branch in `HandleProxy` for kinh-dich + stock | dev-api-gateway | dev-api-gateway | `curl :4000/kinh-dich/reading/FPT` returns same body as `curl :3000/mcp/api/kinh-dich/reading/FPT` |
| FE-RR-11 | Rebuild api-gateway container after FE-RR-7..10 | dev-ops | dev-ops | `docker logs api-gateway` shows new routing log entries |
| FE-RR-12 | Rebuild mcp-server container after FE-RR-1..6 | dev-ops | dev-ops | `docker logs mcp-server` shows new endpoint registrations at startup |
| FE-RR-QA-1 | QA end-to-end Phase 1 | qa | qa | See Phase 1 QA DoD below |

**Phase 1 QA DoD (anti-mock clause):**
- `curl http://localhost:4000/kinh-dich/reading/FPT` returns JSON with `hexagram` between 1 and 64 (real value), `signal` is a non-empty string, `confidence` in `[0,1]`.
- `curl http://localhost:4000/kinh-dich/market` returns JSON with `hexagram` between 1 and 64, `derived: true`.
- `curl "http://localhost:4000/stock/price/history?code=VNINDEX&days=14"` returns `history` array with `>= 5` entries, `close` values are realistic VN index points (e.g. 1100–1400).
- `curl "http://localhost:4000/stock/price/batch?tickers=FPT,VNM"` returns `quotes.FPT.close > 0` AND `quotes.VNM.close > 0`.
- Dashboard Analysis page renders watchlist overview grid with price tiles showing real values.
- Dashboard Analysis page with `?stock=FPT` shows a Kinh Dich hexagram panel (not 502 error).
- No `ta` value appears (RSI/MACD) — InfoSourcePanel TA rows show `—` (honest unavailable).
- REJECT if any endpoint returns `0` for hexagram, `0` for close price, or hardcoded/placeholder values.

### Phase 2 — News + DB page (after Phase 1 ships and QA passes)

| Task | Description | Zone | Route_to | DoD |
|------|-------------|------|----------|-----|
| FE-RR-13 | NEW `newsHeadlinesHandler.ts`: `GET /mcp/api/news/headlines?source=X` | dev-mcp-server | dev-mcp-server | `curl :3000/mcp/api/news/headlines?source=reuters` returns `{ articles: [...] }` with real titles |
| FE-RR-14 | Register FE-RR-13 in `server.ts` under `/mcp/api/news/headlines` | dev-mcp-server | dev-mcp-server | Route wired; existing `/api/news-fetch/live` unaffected |
| FE-RR-15 | `handlers.go` add not-deployed branch for `news` service | dev-api-gateway | dev-api-gateway | `curl :4000/news/reuters/headlines` returns articles array |
| FE-RR-16 | `reroute.go` add `news` case (reuters/bloomberg source mapping) | dev-api-gateway | dev-api-gateway | `Reroute("/news/reuters/headlines","","news")` → `/mcp/api/news/headlines?source=reuters` |
| FE-RR-17 | Rebuild mcp-server + api-gateway | dev-ops | dev-ops | Containers rebuilt |
| FE-RR-QA-2 | QA end-to-end Phase 2 | qa | qa | See Phase 2 QA DoD below |

**Phase 2 QA DoD:**
- `curl http://localhost:4000/news/reuters/headlines` returns array with >= 1 entry having a non-empty `title` from a real reuters URL (contains "reuters" in url).
- `curl http://localhost:4000/news/bloomberg/headlines` same for bloomberg.
- Dashboard DB page shows VNINDEX price table with real historical dates.
- Dashboard DB page shows Reuters Headlines section with real article titles (not "No headline data").
- Dashboard Fetch page shows both Reuters and Bloomberg columns populated.
- REJECT if 0 articles returned and `rag_analyses` has > 0 reuters rows (QA must verify DB count first).

---

## 8. Risk Flags

### R-1: VNINDEX in daily_ohlcv — must verify presence

The VPS push script fetches VNINDEX as part of `mcp.config.json globalIndices`. If the code stored
is `VNINDEX` (as per `mcp.config.json`) but the DB has it under `VN-INDEX`, the price history
endpoint will return 0 rows. Developer must verify the actual code stored in `daily_ohlcv` before
hardcoding the query. QA check: `SELECT DISTINCT code FROM daily_ohlcv WHERE code LIKE '%VNINDEX%' OR code LIKE '%VN-INDEX%'`.

### R-2: kinhdich_readings may be empty on a fresh container

If the intelligence cycle has not run yet (fresh deploy), `kinhdich_readings` has 0 rows. The
`/reading/:code` endpoint returns 404 — the frontend shows the "detailError" message
"Không tải được dữ liệu cho FPT". This is honest. Operator must wait for the first intelligence cycle (15 min) or trigger manually via `get_kinhdich_reading` tool.

### R-3: api-gateway rebuild required — not just restart

The `HandleProxy` re-route logic is a code change in a compiled Go binary. A `docker restart`
relaunch the stale image. Must `docker compose up -d --build api-gateway` to pick up the change.
Same for mcp-server (Bun TypeScript). Ops task FE-RR-11 / FE-RR-12 must use `--build`.

### R-4: socat band-aid still in effect

Per memory [VPS /api 502 → socat band-aid]: the api-gateway:4000 is bridged to mcp-server:3000
via socat on the VPS. The new routes on mcp-server:3000 are immediately reachable via the socat
bridge without any VPS-side change. Risk: socat dies on VPS reboot (tracked VPS-SOCAT-PERSIST).

### R-5: `market_prices` may be empty outside trading hours

`changePct` in the batch endpoint comes from `market_prices.change_pct`. Outside 09:00–15:30
VN time this table may have no rows for some tickers. The endpoint must gracefully fall back to
`changePct=0`, `direction="flat"` when `market_prices` is stale. This mirrors existing
`priceQueries.ts` pattern.

### R-6: DDD violation risk — no domain imports in route handlers

Route handlers in `apps/mcp-server/src/interface/mcp/routes/` must NOT import from
`domain/services/kinhDich/` for live computation. The handlers serve cached DB data only.
Importing `kinhDichReading.ts` would run the full domain computation per HTTP request — that's
a footgun. Source data for the handlers: `hexagramStore.ts` + `QUE_META` (static data) + direct
`db.prepare()` for prices/news. No domain service invocations.

---

## 9. Files to Create / Modify

### New files (dev-mcp-server)
- `apps/mcp-server/src/interface/mcp/routes/kinhDichReadingHandler.ts`
- `apps/mcp-server/src/interface/mcp/routes/kinhDichMarketHandler.ts`
- `apps/mcp-server/src/interface/mcp/routes/priceHistoryHandler.ts`
- `apps/mcp-server/src/interface/mcp/routes/priceBatchHandler.ts`
- `apps/mcp-server/src/interface/mcp/routes/newsHeadlinesHandler.ts` (Phase 2)

### Modified files (dev-mcp-server)
- `apps/mcp-server/src/interface/mcp/server.ts` — add route registrations for all 5 new handlers

### New files (dev-api-gateway)
- `apps/api-gateway/pkg/primitive/not-deployed-rerouter/reroute.go`
- `apps/api-gateway/pkg/primitive/not-deployed-rerouter/reroute_test.go`

### Modified files (dev-api-gateway)
- `apps/api-gateway/pkg/domain/ports.go` — add `IsNotDeployed` to `ServiceRegistryPort`
- `apps/api-gateway/pkg/domain/models.go` — optionally add `NotDeployed bool` to `ServiceConfig`
- `apps/api-gateway/pkg/infrastructure/registry.go` — `notDeployedSet`, `IsNotDeployed()`, env parse
- `apps/api-gateway/pkg/interface/http/handlers.go` — not-deployed branch in `HandleProxy`

### Modified files (dev-frontend, Phase 1 optional)
- `apps/frontend/app/routes/dashboard.analysis.tsx` — TA label cosmetic (optional, low priority)

---

## 10. Anti-Patterns Forbidden

- NEVER return mock/hardcoded hexagram numbers (e.g. `hexagram: 1` always)
- NEVER compute TA indicators server-side without the TA microservice (no fake RSI)
- NEVER forward requests to `kinh-dich-service:5005` — it is NOT deployed, would 502
- NEVER call domain service `kinhDichReading.ts` per HTTP request in route handlers
- NEVER make the rerouter unconditional — deploying the real service later MUST restore direct routing via env var change

---

## 11. Signal

On completion of this brief, PM should create tasks from the decomposition above.
Phase 1 is sequentially: mcp-server routes first (FE-RR-1..6), then api-gateway wiring
(FE-RR-7..10), then ops rebuild (FE-RR-11..12), then QA (FE-RR-QA-1).
Phase 2 follows the same sequence.

Sequential dispatch is required: mcp-server and api-gateway share no files; however
the QA step depends on both being rebuilt. api-gateway FE-RR-9 (`ports.go`) and FE-RR-8
(`registry.go`) may run in parallel (different files), FE-RR-10 (`handlers.go`) depends on both.
