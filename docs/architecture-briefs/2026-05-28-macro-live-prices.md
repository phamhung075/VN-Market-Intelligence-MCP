# Architecture Brief: MACRO-LIVE-PRICES — Live Oil / Gold / USD-VND Wiring

**Sprint:** MACRO-LIVE-PRICES
**Date:** 2026-05-28
**Architect:** architect
**Input spec:** docs/REQ_MACRO-LIVE-PRICES.md (PO-approved 2026-05-27T22:08:19Z)
**Zone:** apps/macro-indicators/
**Sprint size:** SPRINT-S
**Data-source decision:** OPTION A — read `commodity_prices` table (shared market.db volume)

---

## 1. Data-Source Decision: Option A (Confirmed)

**Decision: Option A — SQLiteCommodityRepository reading the shared `commodity_prices` table.**

Rationale:
- The VN-Index precedent (`SQLiteMarketIndexRepository`) proves this pattern works end-to-end: same DB_PATH env var, same `?mode=ro` open, same `(0, nil)` safe-degradation contract. Zero new design surface.
- `commodity_prices` (source='yahoo') is already written by `commodityTrackerRefreshJob.ts` (06:00 UTC daily, INSERT OR REPLACE on `source` PK, columns: `brent_crude_usd`, `gold_usd_per_oz`, `usd_vnd_rate`, `fetched_at`). The data is confirmed present and proven in production.
- The `market_data` named volume is mounted on both `mcp-server` (docker-compose.yml L12) and `macro-indicators` (L192). The DB_PATH + DB_READONLY=true env vars are already in the macro-indicators environment block (L195-196). The ONLY new env var is `COMMODITY_LIVE_MODE`.
- Option B (direct Yahoo HTTP from macro-indicators) is rejected: it duplicates the Yahoo fetch already in mcp-server, carries geo-block risk from the French Docker host under `project_bctc_vps_proxy.md`, and requires ops scope changes that re-size the sprint to SPRINT-M. Not needed.
- Option C (SBV XML for usdVnd only) is rejected: it adds a new HTTP dependency for one indicator, requires SBV XML parse logic, and contradicts the §10 deferral of the SBVRateRepository implementation.

---

## 2. Recency-Bound Decision: Widen to 26 Hours

**Decision: staleness threshold = 26 hours (not 4 hours).**

**Problem with 4h as written:** `commodityTrackerRefreshJob` runs once daily at 06:00 UTC. A strict 4h gate would expire the live value by ~10:00 UTC and force fixture mode until the next 06:00 UTC run — fixture mode for ~20 of every 24 hours. This re-introduces exactly the stale-fixture bug this sprint exists to kill. The REQ §3 NFR-1 rationale says as much: "serving a 25h-old stale DB value is better than serving the wrong fixture." The PO spec-gate (§12 axis 2) flags this asymmetry as the mandatory design carry.

**Resolution: widen the staleness bound to 26 hours.** 26h = 24h producer cadence + 2h cron drift tolerance (covers delayed runs, container restart lag). A 26h window guarantees that a successful 06:00 UTC run keeps the live value valid through the following 06:00 UTC window even if the next run drifts by up to 2 hours. This is consistent with the REQ's own stated rationale.

**Why not 4h + intraday refresh?** §10 explicitly defers intraday commodity refresh to a separate sprint. Combining it here would re-size to SPRINT-M. Rejected.

**Fixture fallback trigger:** if `fetched_at` is NULL, or the row is absent, or `fetched_at` is older than 26 hours, the repository returns `(nil, nil)` — the application layer (`resolveMarketPrices()`, already correct per spec) uses fixture defaults and the response carries `data_source: "fixture"` (see §5).

---

## 3. Canonical Source Row Decision

**Decision: `WHERE source = 'yahoo' ORDER BY fetched_at DESC LIMIT 1`.**

Two jobs upsert `commodity_prices`:
1. `commodityTrackerRefreshJob.ts` — source='yahoo', columns fully populated (brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at). This is the canonical, primary, authoritative row.
2. `macroIndicatorRefreshJob.ts` — source='macro-snapshot', same columns. This is a mirrored secondary write; values may differ slightly due to fetch-time skew.

The canonical row is `source='yahoo'`. It is the primary Yahoo Finance fetch (BZ=F, GC=F, USDVND=X) with full column coverage. The `ORDER BY fetched_at DESC LIMIT 1` guard is defensive in case the PK upsert semantics ever change, but in practice there is exactly one row per source.

**Query:**
```sql
SELECT brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at
FROM commodity_prices
WHERE source = 'yahoo'
ORDER BY fetched_at DESC
LIMIT 1
```

---

## 4. usdVnd Port Decision

**Decision: `usdVnd` comes from `CommodityFetcherPort`, NOT from `SBVRatePort`.**

`resolveMarketPrices()` (usecases.go L160-180) already reads `USDVND` from `commodityFetcher.FetchPrices()`. The `commodity_prices` table has a `usd_vnd_rate` column populated by the Yahoo USDVND=X ticker. Mapping it through the `SQLiteCommodityRepository` (which implements `CommodityFetcherPort`) unifies all three commodity values under one port call, zero new ports, no change to `ports.go`, no change to `usecases.go`. The SBVRateRepository remains a fixture stub; its live XML adapter is §10-deferred.

---

## 5. `data_source` Degraded-Mode Flag

**Decision: add `dataSource string` field to the snapshot response when fixture fallback fires.**

When `resolveMarketPrices()` falls back to fixture values for one or more commodity fields (because the port returned 0 for that field), the response object MUST carry `data_source: "fixture"` (or `"live"` when all three come from the DB). This is a pre-existing design intent in the spec (FR-1/FR-4) and aligns with the VN-Index pattern's use of zero as the degradation signal.

**Implementation note (for developer):** the `data_source` flag lives on the HTTP response JSON, not on the domain object. The application use case already returns a snapshot struct; the interface layer marshals it. Architect recommends adding a `DataSource string` field to the existing snapshot response struct in `pkg/interface/http/` (the handler/router layer) — NOT in the domain struct. The use case can pass a computed `allLive bool` flag (all three >0 from port) to the response builder. No domain change.

---

## 6. DDD Layer Placement

| Component | DDD Layer | File | Status |
|-----------|-----------|------|--------|
| `CommodityFetcherPort` interface | Domain | `pkg/domain/ports.go` | READ-ONLY — no change |
| `SQLiteCommodityRepository` (new) | Infrastructure | `pkg/infrastructure/repositories.go` | ADD — new struct + constructor |
| `fetchCommodityPricesFromDB()` (new) | Infrastructure | `pkg/infrastructure/repositories.go` | ADD — pure query helper (testable, mirrors `fetchVNIndexFromDB` pattern) |
| `HTTPCommodityFetcher` (existing) | Infrastructure | `pkg/infrastructure/repositories.go` | NO CHANGE — stays as fixture adapter behind gate |
| Env gate wiring | Composition Root | `cmd/server/main.go` | MODIFY — read `COMMODITY_LIVE_MODE`, branch on it |
| `ComputeMacroUseCase` + `resolveMarketPrices()` | Application | `pkg/application/usecases.go` | READ-ONLY — no change (already correct) |
| `DataSource` field in snapshot response | Interface | `pkg/interface/http/` (handler/response type) | MODIFY — add `DataSource string` to response struct |
| `docker-compose.yml` | Infrastructure (config) | `docker-compose.yml` | MODIFY — one additive env line |

**DDD violation check:** clean. `SQLiteCommodityRepository` lives in infrastructure, imports only `database/sql`, `os`, and the SQLite driver. It implements `domain.CommodityFetcherPort` without importing domain (Go structural typing — no import cycle). `cmd/server/main.go` is the only file outside `pkg/infrastructure/` that imports it (Fence-C maintained).

---

## 7. `SQLiteCommodityRepository` Contract (Go)

```go
// SQLiteCommodityRepository implements domain.CommodityFetcherPort.
// Reads the most recent commodity prices from the shared market.db SQLite
// database (mounted at DB_PATH env var, readonly).
//
// Resolution: commodity_prices WHERE source='yahoo' ORDER BY fetched_at DESC LIMIT 1.
// Staleness bound: 26 hours (24h producer cadence + 2h cron drift tolerance).
// Returns (nil, nil) — treated as empty map by application layer — when:
//   - DB file is missing or unreadable
//   - commodity_prices table has no 'yahoo' row
//   - fetched_at is NULL or older than 26 hours
//   - all three columns are NULL or <= 0
type SQLiteCommodityRepository struct {
    dbPath string
}

func NewSQLiteCommodityRepository() *SQLiteCommodityRepository

// FetchPrices returns commodity prices for the requested symbols.
// Symbols recognised: "OIL" → brent_crude_usd, "GOLD" → gold_usd_per_oz,
// "USDVND" → usd_vnd_rate. Unknown symbols are silently omitted.
// Returns an empty (or nil) map — NOT an error — when data is absent or stale;
// caller treats zero-valued symbol as "no data" and applies fixture fallback.
func (r *SQLiteCommodityRepository) FetchPrices(
    ctx context.Context,
    symbols []string,
) (map[string]float64, error)
```

**Extracted helper for testability (mirrors `fetchVNIndexFromDB`):**

```go
// fetchCommodityPricesFromDB is the pure query logic extracted from FetchPrices
// so tests can inject a *sql.DB directly (in-memory :memory:) without
// touching the file-path constructor.
// Returns a map with only the non-zero, non-NULL, freshness-validated values.
func fetchCommodityPricesFromDB(
    ctx context.Context,
    db *sql.DB,
    staleBound time.Duration,   // caller passes 26 * time.Hour
) (map[string]float64, error)
```

**Staleness check implementation note:** `fetched_at` is stored as ISO-8601 UTC string (from TypeScript `new Date().toISOString()`). The repository parses it with `time.Parse(time.RFC3339, ...)` and checks `time.Since(fetchedAt) > staleBound`. NULL `fetched_at` → `sql.Scan` error → treat as stale → return empty map.

**Partial-row handling:** if `brent_crude_usd` is NULL or ≤ 0, the "OIL" key is omitted from the returned map. Same for GOLD and USDVND. This ensures per-commodity fixture fallback fires correctly in `resolveMarketPrices()` for any individual missing value (the use case already does per-key `v > 0` guards).

---

## 8. Env Gate Wiring — Composition Root

`cmd/server/main.go` change (the ONLY change to this file):

```go
// DI wiring: select commodity adapter based on COMMODITY_LIVE_MODE env gate.
var commodityFetcher domain.CommodityFetcherPort
if os.Getenv("COMMODITY_LIVE_MODE") == "true" {
    commodityFetcher = infrastructure.NewSQLiteCommodityRepository()
} else {
    commodityFetcher = infrastructure.NewHTTPCommodityFetcher("")
}
```

The existing line `commodityFetcher := infrastructure.NewHTTPCommodityFetcher("")` is replaced by the block above. All other wiring is untouched. No business logic in main.go — this is pure DI adapter selection.

---

## 9. docker-compose.yml Change

One additive line in the `macro-indicators` environment block, after `DB_READONLY=true`:

```yaml
- COMMODITY_LIVE_MODE=true
```

Full resulting environment block:

```yaml
environment:
  - PORT=5004
  - DB_PATH=/app/data/market.db
  - DB_READONLY=true
  - COMMODITY_LIVE_MODE=true
```

No other docker-compose.yml change. The `market_data` volume mount on `macro-indicators` is already present (L192) — no change.

---

## 10. Files to Create / Modify

| File | Action | Scope |
|------|--------|-------|
| `apps/macro-indicators/pkg/infrastructure/repositories.go` | MODIFY — add `SQLiteCommodityRepository` struct, `NewSQLiteCommodityRepository()`, `FetchPrices()`, `fetchCommodityPricesFromDB()` helper | ~70 lines added at end of file |
| `apps/macro-indicators/pkg/infrastructure/repositories_test.go` | MODIFY — add T-MLP-1/2/3 tests (SQLiteCommodityRepository: live row, stale row, empty table) using `:memory:` + the `fetchCommodityPricesFromDB` helper pattern | ~80 lines added |
| `apps/macro-indicators/pkg/application/usecases_test.go` | MODIFY — add T-MLP-4/5 tests (resolveMarketPrices: live port values pass through; zero port values → fixture fallback) | ~50 lines added |
| `apps/macro-indicators/cmd/server/main.go` | MODIFY — replace single `NewHTTPCommodityFetcher` line with env-gate branch (§8 above) | 5–8 lines net change |
| `apps/macro-indicators/pkg/interface/http/` (handler/response struct) | MODIFY — add `DataSource string` field to snapshot response struct; set to `"live"` or `"fixture"` | ~5 lines |
| `docker-compose.yml` | MODIFY — add `COMMODITY_LIVE_MODE=true` to macro-indicators environment block | 1 line |

**Read-only (no change):**
- `apps/macro-indicators/pkg/domain/ports.go`
- `apps/macro-indicators/pkg/application/usecases.go`
- All `apps/mcp-server/` files
- All `apps/macro-indicators/pkg/primitive/` and `pkg/module/` files

---

## 11. Test Strategy

All tests T-MLP-1..T-MLP-10 use zero-network in-memory SQLite (`:memory:` + Go httptest). T-MLP-11 is the live Docker stack QA gate.

| ID | File | Layer | What to prove |
|----|------|-------|---------------|
| T-MLP-1 | repositories_test.go | Infra | `fetchCommodityPricesFromDB` returns live values when `fetched_at` < 26h ago |
| T-MLP-2 | repositories_test.go | Infra | returns empty map when `fetched_at` > 26h ago (staleness enforcement) |
| T-MLP-3 | repositories_test.go | Infra | returns empty map when table has no 'yahoo' row |
| T-MLP-4 | usecases_test.go | App | `resolveMarketPrices()` passes live DB values through when port returns {OIL:96.0, GOLD:4480.0, USDVND:26150.0} |
| T-MLP-5 | usecases_test.go | App | `resolveMarketPrices()` returns fixture constants when port returns empty map |
| T-MLP-6..8 | existing test files | App/Infra/Iface | All existing tests unchanged and green (COMMODITY_LIVE_MODE unset) |
| T-MLP-9 | main.go path | Composition | COMMODITY_LIVE_MODE unset → `HTTPCommodityFetcher` wired |
| T-MLP-10 | main.go path | Composition | COMMODITY_LIVE_MODE=true → `SQLiteCommodityRepository` wired |
| T-MLP-11 | live Docker | E2E MCP | `get_macro_snapshot` via `call_tool`: oilUsd>90, goldUsd>3000, usdVnd>25000 |
| T-MLP-12 | signal primitive | Domain | oil=96.0 input → `macro_oil_impact_classifier` emits ELEVATED not NEUTRAL |

**Test injection pattern for T-MLP-1..3:** use `fetchCommodityPricesFromDB(ctx, db, 26*time.Hour)` directly, matching the existing `fetchVNIndexFromDB` pattern in `repositories_test.go`. The `newInMemoryDB` helper in `repositories_test.go` must be extended with the `commodity_prices` table schema:

```sql
CREATE TABLE commodity_prices (
    source          TEXT PRIMARY KEY,
    brent_crude_usd REAL,
    gold_usd_per_oz REAL,
    usd_vnd_rate    REAL,
    fetched_at      TEXT
)
```

**Injected fake values for T-MLP-4:** oil=96.0, gold=4480.0, usdVnd=26150.0. These differ from fixtures (82.5/2350.0/24500.0) so a passing test proves the port was read, not the constants (per QA-GATE-1 spec note).

---

## 12. Risk Flags

**R-1 (LOW) — Partial NULL columns in commodity_prices row:** if one of the three columns is NULL (e.g. usd_vnd_rate is NULL because the Yahoo USDVND=X ticker failed), `sql.Scan` into a `*float64` will set it to nil. The per-commodity omission logic (§7 partial-row handling) ensures the missing key is absent from the returned map, triggering per-commodity fixture fallback in `resolveMarketPrices()`. Developer must use `sql.NullFloat64` for scanning, not `float64` directly.

**R-2 (LOW) — `fetched_at` format assumption:** TypeScript stores `new Date().toISOString()` = RFC3339/ISO-8601 UTC with milliseconds (`2026-05-28T06:01:23.456Z`). Go's `time.RFC3339` does not parse milliseconds. Developer MUST use `time.RFC3339Nano` or a custom layout `"2006-01-02T15:04:05.999Z07:00"` for the parse call. Incorrect layout → all rows treated as stale → fixture mode always active (re-introduces bug). Add a T-MLP-2 sub-case with a millisecond timestamp to catch this.

**R-3 (LOW) — DB connection leak:** `FetchPrices` opens `market.db` on every call (same pattern as `FetchVNIndex`). For the macro-indicators `/snapshot` endpoint this is acceptable (P99 <200ms for single-row indexed read per NFR-4), but the developer MUST `defer db.Close()` before any early return. Use the `//nolint:nilerr` convention from the existing pattern for intentional `(0, nil)` returns.

**R-4 (VERY LOW) — Two commodity_prices sources ('yahoo' + 'macro-snapshot'):** the WHERE source='yahoo' filter eliminates ambiguity. The ORDER BY fetched_at DESC LIMIT 1 is a defensive belt-and-suspenders for schema drift. No action needed beyond the documented canonical query.

**R-5 (INFORMATIONAL) — dataAuditJob.ts gold ceiling:** the existing `dataAuditJob.ts` enforces a gold sanity band of 500–5000. The live gold value (~4500) is within this band. No conflict, no action.

---

## 13. Brownfield Findings Summary

- **Zone:** apps/macro-indicators/
- **BUILD-STANDARD:** lean (existing service, new feature)
- **BUILD-STANDARD-REF:** docs/standards/microservice-build-standard.md
- **Verified paths:**
  - `apps/macro-indicators/pkg/infrastructure/repositories.go:108-187` — `SQLiteMarketIndexRepository` is the exact precedent; `SQLiteCommodityRepository` mirrors this struct, constructor, and query helper pattern
  - `apps/macro-indicators/pkg/infrastructure/repositories_test.go:79-104` — `fetchVNIndexFromDB` helper + `:memory:` injection pattern is the test template for `fetchCommodityPricesFromDB`
  - `apps/macro-indicators/pkg/application/usecases.go:158-180` — `resolveMarketPrices()` is ALREADY CORRECT per spec; zero application-layer changes required
  - `apps/macro-indicators/cmd/server/main.go:42-44` — single DI wiring line to replace with env-gate branch
  - `docker-compose.yml:185-217` — macro-indicators block; `market_data` volume already mounted; only one new env line needed
  - `apps/mcp-server/src/scheduler/macro/commodityTrackerRefreshJob.ts:104` — source='yahoo' INSERT OR REPLACE confirmed
  - `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts:207-214` — source='macro-snapshot' secondary upsert confirmed
- **Reuse patterns:**
  - `SQLiteMarketIndexRepository` → `SQLiteCommodityRepository` (direct mirror)
  - `fetchVNIndexFromDB` helper → `fetchCommodityPricesFromDB` helper (same injection pattern)
  - `newInMemoryDB` test helper extended with `commodity_prices` table
- **Scan clean:** true
- **No domain or application layer changes required beyond tests**
- **No new ports, no new interfaces — `CommodityFetcherPort` satisfied by new adapter**
