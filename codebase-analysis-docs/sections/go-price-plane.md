# Go Services — API Gateway & Stock Price

> Zone id: `go-price-plane` · Primary paths: `apps/api-gateway`, `apps/stock-price`

## Purpose & business need

This zone is the **Go-language edge of the VN Market Intelligence platform**: the single ingress that every frontend and inter-service call passes through, and the resilient price source that backs every market read.

- **`apps/api-gateway`** is the **only public HTTP entry point** of the Docker stack (owns container port **`:4000`**, host-mapped `4000:4000` in `docker-compose.yml`). It does three jobs: (1) **reverse-proxy/route** `/:service/*` and `/api/*` requests to the right downstream microservice; (2) **aggregate health** of all 9 services into one `/health` JSON envelope + an HTML dashboard; (3) **gracefully reroute** requests for microservices that are *intentionally not deployed on this host* through the `mcp-server` fallback, so the platform degrades rather than 502s. Its business value is a stable, single contract for the frontend (`apps/frontend/app/lib/api/client.ts` sends *all* backend calls to `API_GATEWAY_URL`) plus one honest health signal for monitoring/trust dashboards.
- **`apps/stock-price`** delivers **the price number itself** with provenance. It resolves a ticker through a **3-tier fallback waterfall** (live VnDirect → legacy VnDirect → local SQLite cache) so a price is almost always returned, and it **labels data quality** (`FRESH`/`STALE`/`EXPIRED`, `isEstimate`) so consumers never mistake a stale cache hit for a live quote. This directly serves the project's standing "no fake data — real fetch only" goal: a cache fallback is surfaced as such, never as a live print.

Both services were rebuilt under a **DDD + "primitive 3-tier pilot"** pattern (domain → application → module → primitive), with pure, zero-I/O primitives validated by a sandbox scenario harness — a deliberate architecture experiment in cascade-provable correctness (`apps/api-gateway/docs/g11-coupling-design.md`).

## Tech stack

- **Language:** Go 1.22 (`apps/api-gateway/go.mod`, `apps/stock-price/go.mod`; both pin `toolchain go1.22.0`).
- **HTTP:** stdlib only — `net/http`, `net/http/httputil.NewSingleHostReverseProxy`, `http.NewServeMux` with Go 1.22 method-pattern routing (`GET /health` etc.). No web framework.
- **Logging:** stdlib `log/slog` JSON handler (structured logs; `README-log-schema.md` in each app documents the schema).
- **DB (stock-price only):** `github.com/mattn/go-sqlite3 v1.14.22` — the **only external dependency in the whole zone**, CGO-required, read-only WAL DSN.
- **api-gateway has ZERO third-party Go deps** (`go.mod` lists no `require` block) — builds `CGO_ENABLED=0`.
- **Build:** multi-stage Alpine Docker. api-gateway `CGO_ENABLED=0`; stock-price `CGO_ENABLED=1` with `gcc musl-dev` for sqlite3, `-ldflags="-s -w"` (`apps/*/Dockerfile`).
- **Lint:** `.golangci.yml` per app; `.golangci.yml` "fence" markers enforce layering (see Gotchas).

## Entry points

### api-gateway
- **Composition root:** `apps/api-gateway/cmd/server/main.go` → `main()`. Reads `PORT` (default `4000`), per-service URL env vars (`MCP_URL`, `STOCK_URL`, …), `NOT_DEPLOYED_SERVICES` (CSV), `SYSTEM_MAP_PATH` (default `docs/data/system-map.json`). Wires registry → checker → capability prober → domain service → use cases → handlers → router, then `http.ListenAndServe`.
- **Router:** `apps/api-gateway/pkg/interface/http/router.go` → `NewRouter`. Routes:
  - `GET /health` → `HandleHealth` (aggregate)
  - `GET /healthz` → `HandleHealth` (k8s liveness alias, AC-11)
  - `GET /health-dashboard` → `HandleDashboard` (HTML)
  - `GET /health/` (prefix) → `HandleServiceHealth` (per-service)
  - `/` catch-all (ANY method) → `HandleProxy` (reverse proxy + reroute)
  - All wrapped by `loggingMiddleware`.
- **Sandbox CLI:** `apps/api-gateway/cmd/sandbox/main.go` — offline scenario runner (`go run ./cmd/sandbox -tier=... -module=api-gateway -scenario=all`); zero DB/network; emits traces to `apps/api-gateway/sandbox/traces/`.
- **OpenAPI:** `apps/api-gateway/pkg/interface/http/openapi.yaml`.

### stock-price
- **Composition root:** `apps/stock-price/cmd/server/main.go` → `main()`. Reads `PORT` (default `5000`), `DB_PATH` (default `./data/market.db`), `STOCK_PRICE_DB_PATH` (default `./data/stock_price.db`). Constructs the 3 tier fetchers + history repo (**Fence-C: the only file allowed to import `pkg/infrastructure` and `mattn/go-sqlite3`**), then delegates DDD wiring to `buildHandler` in `apps/stock-price/cmd/server/wire.go`.
- **Routes:** `apps/stock-price/pkg/interface/http/router.go` → `Handler.RegisterRoutes`:
  - `GET /health` → `health`
  - `POST /price/fetch` (`{"code":"FPT"}`) → `pricesFetch` → 3-tier resolve
  - `GET /price/history?code=X&days=N` → `priceHistory` (query-param form used by `mcp-server` clients)
  - `GET /price/history/:code?days=N` → `priceHistoryPathParam` (TS backward-compat)
- **Sandbox CLI:** `apps/stock-price/cmd/sandbox/main.go` — offline primitive/module scenario runner; **must build under `CGO_ENABLED=0`** (R-CGO gate). Zero DB/network.
- **OpenAPI:** `apps/stock-price/api/openapi.yaml`.

> Neither service registers MCP tools or cron jobs — they are plain HTTP servers. MCP-tool surfacing of these capabilities happens in the TypeScript `mcp-server` zone (which proxies to them over HTTP).

## Architecture & key modules

Both apps follow the same **4-tier hexagonal layering** with a strict import-fence policy. Top to bottom:

| Layer | api-gateway | stock-price |
|---|---|---|
| **interface/http** | `pkg/interface/http/{router,handlers}.go` | `pkg/interface/http/router.go` |
| **application** (use cases) | `pkg/application/aggregate.go` | `pkg/application/usecases.go` |
| **domain** (pure VOs + service + ports) | `pkg/domain/{models,services,ports}.go` | `pkg/domain/{models,ports}.go` |
| **module** (composes primitives) | `pkg/module/gateway/gateway.go` | `pkg/module/price_resolution/price_resolution.go` |
| **primitive** (pure, zero-import functions) | `pkg/primitive/{overall-status-computer,route-service-matcher,proxy-path-resolver,not-deployed-rerouter}` | `pkg/primitive/{price-quote-normalizer,tier-fallback-selector,price-staleness-classifier}` |
| **infrastructure** (adapters/I/O) | `pkg/infrastructure/{registry,healthchecker,capability_prober}.go` | `pkg/infrastructure/fetchers.go` |

### api-gateway file roles
- `pkg/domain/models.go` — value objects: `HealthStatus` enum (`ok`/`degraded`/`down`/`not_deployed`), `CapabilityStatus` enum (`live`/`data_limited`/`dark`/`n/a`), `ServiceConfig` (incl. flags `NoProbe`, `PreservePath`, `ProxyTimeoutMs`), `AggregatedHealth`, `ServiceHealthResult`.
- `pkg/domain/services.go` — `AggregateHealthService.Aggregate()`: classifies `not_deployed` services without probing, fans out HTTP health checks **concurrently** (`sync.WaitGroup`) for the rest, computes overall status via the primitive, and **additively** enriches `not_deployed` services with capability status. Contains the **ANTI-FALSE-GREEN invariant**: a deployed service that is DOWN stays DOWN regardless of capability probe.
- `pkg/domain/ports.go` — `HealthCheckerPort`, `ServiceRegistryPort`, `CapabilityProberPort`.
- `pkg/infrastructure/registry.go` — `StaticServiceRegistry`: in-memory map of 10 `ServiceConfig` (9 real + `api` virtual alias). Holds the `notDeployedSet` SSOT shared with the proxy rerouter. `GetAllServices` filters out `NoProbe` services.
- `pkg/infrastructure/healthchecker.go` — `HTTPHealthChecker.CheckHealth`: GET `{BaseURL}{HealthPath}` with per-service `TimeoutMs` context; 2xx→`ok`, other status→`degraded`, transport error→`down`.
- `pkg/infrastructure/capability_prober.go` — `CapabilityProber`: reads `capability_manifest` from `system-map.json`, runs **bounded** probes (≤7, one per `not_deployed` short_key), 60s TTL cache, 3000ms per-probe timeout, falls back to manifest baseline on any error. Probe types: `health_endpoint` (GET), `mcp_tool` (JSON-RPC `tools/call` POST `/mcp`), `none` (static baseline).
- `pkg/interface/http/handlers.go` — `GatewayHandlers`: 4 handlers + `BuildDashboardHTML` (self-contained dark-theme HTML, auto-refresh 60s, XSS-escaped). `HandleProxy` is the core routing brain.
- `pkg/module/gateway/gateway.go` — module-tier composition over the gateway primitives (used by sandbox + cascade scenarios).

### stock-price file roles
- `pkg/domain/models.go` — `PriceQuote` (Change/ChangePercent are **pointers** so `nil`=unavailable is distinct from `0`=flat day, "DSI-INV-1"), `DailyOHLCV`, `PriceSource` enum (`hose`/`hnx`/`upcom`/`cache`), `PriceNotAvailableError`.
- `pkg/domain/ports.go` — `PriceFetcherPort`, `PriceHistoryPort`.
- `pkg/module/price_resolution/price_resolution.go` — `PriceResolutionModule.Resolve()`: fires all 3 tiers **concurrently**, selects winner via primitive, annotates staleness, applies the **Tier-3-cache-cannot-be-FRESH** downgrade rule. `ResolvedQuote` = `PriceQuote` + `Staleness`.
- `pkg/module/price_resolution/ports.go` — `TierFetcher` port (the module never imports infra; Fence-B).
- `pkg/infrastructure/fetchers.go` — `Tier1VnDirectFetcher`, `Tier2VnDirectLegacyFetcher`, `Tier3CacheFetcher` (all CGO/SQLite/network here), plus `SQLitePriceHistoryRepository` (dual-DB: read `market.db`, write `stock_price.db`).
- `pkg/application/usecases.go` — `FetchPriceUseCase` (uppercases code, derives `isEstimate` from staleness), `PriceHistoryUseCase`.
- `pkg/domain/_deprecated/services_v1.go` — the pre-refactor monolithic `ResolvePriceService` (build-tagged `//go:build ignore`; archive only — do not import).

## Feature-by-feature breakdown

### F1 — Reverse-proxy routing (api-gateway)
- **Business purpose:** One stable URL surface for the frontend; hides 9 microservice hostnames/ports.
- **Path:** request → `HandleProxy` (`pkg/interface/http/handlers.go`) → `rsm.ExtractServiceName(path, "/")` picks the first path segment → `registry.GetService(name)` → if unknown ⇒ `404 {"error":"Unknown service"}` → `ppr.ResolveProxyPath(path, NoProbe||PreservePath)` computes downstream path → `httputil.NewSingleHostReverseProxy` forwards with a context timeout (`ProxyTimeoutMs`, default `TimeoutMs*5`).
- **Path-rewrite rule (`proxy-path-resolver/resolve.go`):** normal services strip the leading `/:service` segment (`/stock/price/history` → `/price/history`); `PreservePath` services (`ta`) forward verbatim because the upstream registers its own `/ta/*` prefix — frontend therefore calls `/ta/ta/indicators` (`client.ts:306`).
- **Edge cases:** path with no trailing segment (`/stock`) → downstream `/`, never empty/panic. Upstream unreachable → `ErrorHandler` emits `502 {"error":"Upstream ... unreachable"}`.

### F2 — Virtual `/api/*` alias (api-gateway)
- **Business purpose:** Expose the MCP server's full HTTP API under `/api/*` without a separate hostname.
- **Path:** `api` is a `ServiceConfig` with `BaseURL = MCP_URL` and `NoProbe:true`. Because `NoProbe` ⇒ verbatim path, `/api/foo` forwards to `mcp-server` as `/api/foo` unchanged. `NoProbe` also excludes it from `GetAllServices`, so it never appears in `/health`.

### F3 — Aggregate health + dashboard (api-gateway)
- **Business purpose:** One JSON `/health` and one HTML dashboard for monitoring + trust UI.
- **Path:** `HandleHealth`/`HandleDashboard` → `AggregateHealthUseCase.Execute` → `AggregateHealthService.Aggregate`: classify `not_deployed` (status `not_deployed`, latency `-1`, no probe) → concurrent `CheckHealth` fan-out for the rest → `osc.ComputeOverallStatus` (filters out `not_deployed`; all-ok→`ok`, all-down→`down`, mixed→`degraded`, empty→`ok`) → capability enrichment for `not_deployed` only → JSON envelope `{status,services,latencies,capabilities,checkedAt}`.
- **HTTP status mapping:** overall `down` ⇒ `503`; otherwise `200`. Dashboard auto-refreshes every 60s; "Last 10 Signals"/"Prediction"/"Alerts" are deliberate `N/A` placeholders ("MCP data not wired in this sprint").
- **Edge cases:** XSS — all dashboard values run through `html.EscapeString`. `/healthz` is a byte-identical alias for k8s liveness.

### F4 — Capability enrichment (api-gateway, additive axis)
- **Business purpose:** For services intentionally **not deployed as containers** but still reachable as MCP tools, report whether the *capability* is live/partial/dark — without lying that a dead container is "up."
- **Path:** `CapabilityProber.ProbeAll` reads `project.infrastructure.docker.host_runtime_set.capability_manifest` from `system-map.json` (metadata `_note`/`_ground_truth_date` keys silently skipped). For each entry it probes the mcp-server: `mcp_tool` ⇒ JSON-RPC `tools/call` POST `/mcp` (2xx + no `error` field ⇒ live; SSE `text/event-stream` 200 ⇒ accepted); `health_endpoint` ⇒ GET; `none` ⇒ static baseline. Result cached 60s.
- **Live manifest (9 entries, ground-truth 2026-06-02):** `mcp`(n/a,health), `macro`→`get_macro_snapshot`, `stock`→`get_market_snapshot`, `kinh-dich`→`get_portfolio_conviction`, `alert`→`get_alerts`, `news`→`get_agent_signals`, `pdf`→`get_financial_summary` (all `live`), `ta`→`get_technical_indicators` (`data_limited`, note "30/35 candles available"), `rag` (`dark`, probe `none`).
- **Hard invariant:** capabilities are populated **only** for keys in `notDeployedSet` (`services.go` L112-124). A deployed-but-down service keeps its RED container status; no capability rescue (ANTI-FALSE-GREEN).

### F5 — Not-deployed reroute → mcp-server fallback (api-gateway)
- **Business purpose:** When a microservice isn't deployed on this host, route its requests to the equivalent mcp-server endpoint so the platform degrades gracefully instead of 502.
- **Path:** `HandleProxy` → `registry.IsNotDeployed(name)` (driven by `NOT_DEPLOYED_SERVICES` env CSV, SSOT shared with the registry) → `ndr.Reroute(path, rawQuery, name)`. Rewrite table (`not-deployed-rerouter/reroute.go`): `kinh-dich`→`/mcp/api/kinh-dich/*`; `stock`→`/mcp/api/prices/*` (e.g. `/stock/price/history` → `/mcp/api/prices/history`); `news/<source>/headlines`→`/mcp/api/news/headlines?source=<source>`. Services with no MCP equivalent (`ta`,`pdf`,`rag`,`alert`) ⇒ `("",false)` ⇒ honest `503 {"error":"not_deployed"}`. Then reverse-proxy to `mcp` base, splitting the rewritten query from the path correctly.
- **Operational note:** in current `docker-compose.yml`, `NOT_DEPLOYED_SERVICES=` is empty (all services deployed), so this path is dormant but tested (`pkg/integration`, frontend `vps-not-deployed-discrimination.test.ts`).

### F6 — 3-tier price resolution (stock-price)
- **Business purpose:** Always return a price with honest provenance; never fabricate.
- **Path:** `POST /price/fetch` → `FetchPriceUseCase.Execute` (uppercases code) → `PriceResolutionModule.Resolve`:
  1. Fire `tier1.FetchPrice`, `tier2.FetchPrice`, `tier3.FetchPrice` **concurrently** (`sync.WaitGroup`).
  2. `tier-fallback-selector.SelectWinningTier` returns the first **non-nil** quote in T1→T2→T3 order; all-nil ⇒ `PriceNotAvailableError` ⇒ handler `404`.
  3. `price-staleness-classifier.ClassifyStaleness(FetchedAt, now, 60s, 3600s)`: age≤60s→`FRESH`, ≤3600s→`STALE`, else `EXPIRED`.
  4. **Tier-3-cache-cannot-be-FRESH downgrade** (`price_resolution.go` L138): if the cache tier (index 2) won and the label computed to `FRESH`, force it to `STALE` — FRESH requires a *live*-tier success, not a cache hit (`FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL`).
  5. `FetchPriceUseCase` sets `IsEstimate = (Staleness ∈ {STALE,EXPIRED})` in the DTO.
- **Tier mechanics (`fetchers.go`):**
  - **Tier1** `Tier1VnDirectFetcher`: GET `api-finfo.vndirect.com.vn/v4/stock_prices?...date:gte:<today>...` (3s timeout, browser UA to dodge 503).
  - **Tier2** `Tier2VnDirectLegacyFetcher`: same endpoint **without** the date filter ⇒ most-recent available row (after-hours / pre-open fallback).
  - **Tier3** `Tier3CacheFetcher`: read-only SQLite `market.db` `SELECT ... FROM market_prices WHERE code=?`; `FetchedAt` is the DB's true `updated_at` (not `time.Now()`).
- **VnDirect ×1000 scale guard:** both live tiers multiply `close * 1000` **only** when `type=="STOCK"` AND floor ∈ {HOSE,HNX,UPCOM} — VN stock prices arrive in thousands-VND; indices (`type=="INDEX"`) and non-VN floors keep their raw value (`fetchers.go` L104-107, L208-211).
- **Edge cases:** All fetch errors (network, non-200, parse, empty data) return `(nil, nil)` — a "soft miss" so the waterfall continues rather than aborting; this mirrors TS `Promise.allSettled`. Change/ChangePercent are pointers so a genuine `0` (flat day) survives JSON as `0`, while truly-missing fields serialize `null`.

### F7 — Price history (stock-price)
- **Business purpose:** OHLCV candle series for charts/TA.
- **Path:** `GET /price/history?code=X&days=N` (default 30) → `PriceHistoryUseCase.Execute` → `SQLitePriceHistoryRepository.GetHistory`: read-only `market.db`, `SELECT date,open,high,low,close,volume FROM daily_ohlcv WHERE code=? AND date>=date('now','-<N> days') ORDER BY date ASC`. Never `nil` — returns `[]` on any error (graceful empty).
- **Side-effect (cache write):** `SaveQuote` writes to `stock_price.db` `market_prices_cache` (auto-`CREATE TABLE IF NOT EXISTS`) **fire-and-forget** — write failure is silently swallowed (AC-6). Note: the live `Resolve` path does **not** currently call `SaveQuote`; only the deprecated `services_v1.go` did.

## Data stores

- **`market.db`** (Docker **named volume `market_data`**, mounted `/app/data` — *not* a host bind-mount; bind would VirtioFS-corrupt per project memory). **READ-ONLY** from this zone via DSN `file:<path>?mode=ro&_journal_mode=WAL&_busy_timeout=5000`.
  - `market_prices(code, price, volume, updated_at, change_amt, change_pct)` — Tier-3 cache source.
  - `daily_ohlcv(code, date, open, high, low, close, volume)` — history source.
- **`stock_price.db`** (`STOCK_PRICE_DB_PATH`, WAL): **write** cache.
  - `market_prices_cache(code, price, volume, fetched_at)` — best-effort write-only.
- **`docs/data/system-map.json`** — read by api-gateway's `CapabilityProber` (mounted read-only at `/etc/system-map/system-map.json` via `SYSTEM_MAP_PATH`). Source of the `capability_manifest` (9 service entries) and the SSOT for service/port topology.
- **Scenario fixtures** — `apps/api-gateway/pkg/**/scenarios/*.json`, `apps/api-gateway/sandbox/traces/*.json` (offline sandbox harness; no runtime data).

## External integrations

- **VnDirect finfo API** — `https://api-finfo.vndirect.com.vn/v4/stock_prices` (Tier1/Tier2 live price source; browser UA required to avoid 503). The only outbound network call in the zone.
- **mcp-server** (`MCP_URL`, default `http://mcp-server:3000`) — target of (a) the `/api/*` virtual alias, (b) all not-deployed reroutes, and (c) every `mcp_tool`/`health_endpoint` capability probe (JSON-RPC `tools/call` on `POST /mcp`).
- **9 sibling microservices** — `pdf`(5001), `rag`(5002), `ta`(5003), `macro`(5004), `stock`(5000), `kinh-dich`(5005), `alert`(5006), `news`(5008): proxy + health targets, hostnames injected by env in `docker-compose.yml`.
- **VPS bridge — present at infra layer only.** `docker-compose.yml` sets `VPS_HOST=125.212.251.27` and `APP_ENV=production` on `stock-price`, but **no Go code reads them** (verified by grep). Geo-blocked VN fetching via the Vinahost VPS proxy is handled elsewhere (mcp-server / `docs/references/vps_setup.md`); the stock-price Go fetchers call VnDirect directly. This is a known gap/aspirational wiring — treat `VPS_HOST` as currently inert in this zone.
- **No Telegram / no webhooks / no cron** originate from this zone.

## Cross-zone interactions

- **frontend → api-gateway (HTTP):** `apps/frontend/app/lib/api/client.ts` sends *all* backend calls to `API_GATEWAY_URL` (`http://api-gateway:4000`): `/stock/price/history`, `/stock/price/batch`, `/kinh-dich/reading/:code`, `/ta/ta/indicators`, `/macro/snapshot`. The gateway is the frontend's sole backend contract.
- **mcp-server → stock-price (HTTP):** `apps/mcp-server/src/interface/mcp/tools/market-data/stockPriceHttpClient.ts` and `routes/priceHistoryServeHandler.ts` call `STOCK_PRICE_URL` (default `http://localhost:5000`, compose `http://stock-price:5000`) on `/price/history`. So mcp-server is **both** a downstream of the gateway *and* a direct upstream caller of stock-price.
- **api-gateway → mcp-server + 8 services (HTTP reverse proxy):** every proxied request and health probe.
- **api-gateway → system-map.json (shared file):** capability manifest read (mounted read-only).
- **stock-price ↔ other services (shared DB):** `market.db` named volume is **shared** with `kinh-dich-service`, `alert-engine`, mcp-server, etc.; stock-price is a read-only consumer plus a write-only writer of its own `stock_price.db`.
- **kinh-dich-service → api-gateway (HTTP):** compose sets `PRICE_HISTORY_URL=http://api-gateway:4000` — kinh-dich fetches price history *back through* the gateway (which routes to stock-price), a deliberate loop so all price reads share one contract.

## Gotchas — must know before changing

1. **Import fences are load-bearing, not stylistic.** stock-price uses named fences:
   - **Fence-C** — `mattn/go-sqlite3` and `pkg/infrastructure` may be imported **only** in `cmd/server/main.go`. Adding a sqlite import anywhere else breaks the `CGO_ENABLED=0` buildability of the module/primitive layers.
   - **Fence-B** — `pkg/module/price_resolution` imports only `pkg/primitive/*`, `pkg/domain`, stdlib.
   - **Fence-A** — each primitive imports only stdlib (+ domain). The gateway primitives deliberately **redefine** status string constants locally (`overall-status-computer/compute.go`) to import *nothing* from domain and avoid an import cycle. Don't "DRY" these into a shared import.
2. **Tier-3 cache can never be `FRESH`.** The downgrade in `price_resolution.go` L138 is intentional (`FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL`): a recently-written cache row that is <60s old still gets `STALE` because FRESH means "a live tier just answered." Removing this reintroduces the false-fresh bug. `isEstimate` derives directly from this.
3. **The VnDirect ×1000 guard is exchange-conditional.** `close*1000` applies *only* to `type=="STOCK"` on HOSE/HNX/UPCOM. Apply it to indices or non-VN floors and you 1000× an index value. If VnDirect ever changes the `type`/`floor` taxonomy, this guard silently mis-scales — non-zero ≠ correct (project memory: plausibility-check magnitudes).
4. **Fetchers swallow all errors as `(nil,nil)`.** Tiers report a miss, not an error, so the waterfall continues. This means a Tier-1 *bug* (bad URL, parse error) is indistinguishable from "VnDirect had no row" — it silently falls through to cache. Debug by checking which `Source` came back, not by expecting an error.
5. **Capability axis must never rescue a deployed-down service.** The `notDeployedSet` filter in `services.go` is the ANTI-FALSE-GREEN guard. A deployed container that fails its health probe is RED, full stop. Widening capability enrichment to deployed services would let a live MCP tool mask a dead container.
6. **`PreservePath` vs `NoProbe` are orthogonal** (`models.go` comment). `NoProbe` = skip health probe (virtual alias `api`); `PreservePath` = forward path verbatim (`ta`, still probed). Both feed the same `verbatim` boolean into `ResolveProxyPath`. Confusing them breaks either routing or health.
7. **`NOT_DEPLOYED_SERVICES` is the single SSOT** for both the health classifier and the proxy rerouter (passed once at construction). Deploying a real service = removing it from the env CSV; **no code change**. Don't hardcode a not-deployed list anywhere else.
8. **Proxy timeout default is `TimeoutMs*5`** unless `ProxyTimeoutMs` overrides it. `macro` and `news` set `ProxyTimeoutMs: 120000` (slow scrapers) — health probe still uses the 2s `TimeoutMs`, only the proxy gets 120s. Don't conflate the two timeouts.
9. **`market.db` is a named volume, not host `./data`.** Host `./data/market.db` is a stale 0-row decoy (project memory). Tier-3 reads the named volume mounted at `/app/data`; verify live row counts via a sqlite sidecar, not the host file.
10. **`VPS_HOST` is set but unused in Go.** Don't assume geo-block proxying happens here — it doesn't yet. Direct VnDirect calls will fail from geo-blocked hosts until/unless the VPS bridge is wired into the fetchers.
11. **Sandbox binaries must stay pure.** Both `cmd/sandbox/main.go` runners contract zero DB/network/keys; the stock-price one must build `CGO_ENABLED=0` (R-CGO gate). Adding I/O to a primitive breaks the cascade-scenario harness.
12. **api-gateway has the widest blast radius** (`docs/g11-coupling-design.md`): one wrong primitive output corrupts the `/health` JSON, the dashboard badge, **and** every proxy path simultaneously. Changes to `route-service-matcher`, `proxy-path-resolver`, or `overall-status-computer` need the G11 cascade scenarios, not just unit tests.

## Internal flow (Mermaid)

```mermaid
flowchart TD
  FE[frontend / mcp-server] -->|HTTP :4000| GW[api-gateway HandleProxy]
  GW -->|ExtractServiceName| REG[StaticServiceRegistry]
  REG -->|IsNotDeployed?| ND{not-deployed?}
  ND -- yes --> RR[ndr.Reroute → /mcp/api/*] --> MCP[mcp-server :3000]
  ND -- no --> PPR[ResolveProxyPath strip/verbatim] --> SVC[downstream svc]
  SVC -. e.g. stock .-> SP[stock-price :5000]
  SP --> MOD[price_resolution.Resolve]
  MOD -->|concurrent| T1[Tier1 VnDirect today]
  MOD --> T2[Tier2 VnDirect latest]
  MOD --> T3[Tier3 market.db cache RO]
  T1 & T2 & T3 --> SEL[SelectWinningTier T1>T2>T3]
  SEL --> CLS[ClassifyStaleness + T3≠FRESH downgrade] --> RESP[PriceQuote + staleness/isEstimate]
  GW -->|/health| AGG[AggregateHealthService] --> PROBE[CapabilityProber → mcp tools/call]
```
