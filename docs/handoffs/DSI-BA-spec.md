# Handoff: DSI-BA — DATA-SERVE-INTEGRITY BA Spec

**Sprint:** DATA-SERVE-INTEGRITY
**Task:** DSI-BA
**From:** ba
**To:** dev-mcp-server (DSI-S1-SLA first), dev-stock-price (DSI-S2-PRICE)
**Date:** 2026-06-04

---

## Fleet-Wide Invariant (DSI-INV-1)

Every macro, price, or financial value served by any tool MUST satisfy one of two conditions:

**A — FAIL-LOUD:** return null / error / HTTP 503. Do not serve a value.

**B — CARRY-FORWARD with full provenance:**
```
source_tier:  1 (exchange-direct) | 2 (aggregator) | 3 (stale-cache) | 4 (fixture/estimate)
fetched_at:   TRUE timestamp of the real fetch — NEVER datetime('now') or time.Now() on a fallback path
is_estimate:  true when value is not from a live fetch in this cycle
dataSource:   "live" ONLY when ALL component fields are fresh within their SLA window
```

These four fields MUST propagate through the entire chain:
`fetcher (Go/TS) → DB column → tool output (JSON) → frontend TS type → render layer`

A value where ANY link drops the provenance metadata is a DSI-INV-1 violation.

---

## Shared Domain Type — ProvenanceFields

Implement once in a shared domain model, extend all response types from it.

```typescript
// apps/mcp-server/src/domain/models/provenance.ts (new file)
export interface ProvenanceFields {
  source_tier?: 1 | 2 | 3 | 4;
  fetched_at?: string;   // ISO-8601 — true source time, never now()
  is_estimate?: boolean;
  dataSource?: "live" | "fixture" | "stale" | "estimate";
}
```

All response interfaces (MacroSnapshot, MacroSignalEntry, CommoditySnapshot, carry/yield DTOs, FetchPriceResponse) MUST extend or include ProvenanceFields.

---

## Task Specs — Dependency Order

```
DSI-S1-SLA (XS, do_first)
  → DSI-S1-MACRO (M)
  → DSI-S1-FE-TYPE (S, can parallel with S1-MACRO)
       → DSI-S2-PRICE (M)
             → DSI-S3-SECTOR-FIN (L, P2)

DSI-MACRO-INDICATORS-LATENT — BACKLOG ONLY, not in active sprint
```

Nothing downstream can be SLA-validated until DSI-S1-SLA lands.

---

## DSI-S1-SLA

**Owner:** dev-mcp-server
**Priority:** P0 — DO FIRST
**Size:** XS
**Zone:** `apps/mcp-server/src/domain/services/`
**Depends:** none (DSI-ARCH is DONE)

### Problem

`macroIndicatorSla.ts` queries `country='VN'` on both guard functions. The active writer (`macroIndicatorRefreshJob.ts:242`) writes `country='vietnam'` since commit 7a0adfdc (2026-05-17). No row is ever found → `freshnessSlaChecker` always returns false → the 24-hour SLA guard is permanently blind. The Telegram WORK staleness alert has never fired since 2026-05-17.

Secondary: `server.ts` push-gso endpoint defaults to `country='VN'` when payload omits the field (lines 1435, 1520), creating a split-key risk if VPS push scripts omit `country`.

### Requirements

**FR-SLA-1 (domain layer):** Declare ONE canonical country key constant.
```typescript
// apps/mcp-server/src/domain/services/macroIndicatorSla.ts
const MACRO_COUNTRY_KEY = "vietnam"; // single SSOT
```
Use `MACRO_COUNTRY_KEY` at both query sites (lines 35 and 73) instead of the literal `"VN"`.

**FR-SLA-2 (infrastructure layer):** Normalize push-gso defaults.
- `server.ts:1435`: change default from `"VN"` to `"vietnam"`.
- `server.ts:1520`: change default from `"VN"` to `"vietnam"`.

**FR-SLA-3 (dead code comment):** In `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts:266`, add comment:
```typescript
// @deprecated DSI: dead code — production path returns success:false (task 239c not wired)
// Writes country='VN' — do not activate without updating to 'vietnam'
```
Do NOT remove. Do NOT change the write value.

**FR-SLA-4 (VPS script audit — pre-deploy gate):** Before deploying the server.ts change, dev-mcp-server must grep `vps-scripts/` for any explicit `country.*VN` send. If found: add a note in the PR that the VPS script also needs updating before this deploy (do not block the commit, gate the deploy).

### Acceptance Criteria

**AC-SLA-1 (primary key fix, non-silent):**
Unit test: insert a row with `country='vietnam'` and `fetched_at` set to now - 25 hours.
Assert: `freshnessSlaChecker()` returns `false` AND Telegram WORK send is called.
Insert with `fetched_at` = now - 1 hour. Assert: returns `true`, no Telegram call.

**AC-SLA-2 (startup guard):**
Unit test: `detectStartupStaleData()` with a `country='vietnam'` stale row returns a non-empty alert message.

**AC-SLA-3 (zero VN queries):**
Test or grep assertion: no `.get("VN")` call remains in `macroIndicatorSla.ts` after the fix.

**AC-SLA-4 (push-gso default):**
Unit/integration: call the push-gso endpoint handler with a payload that omits `country`. Assert the upserted row has `country='vietnam'`, not `'VN'`.

**QA verification:** ops REBUILDS mcp-server. QA calls `call_tool(server="vn-market", tool="get_macro_snapshot")` and triggers a synthetic stale state; confirms guard fires WORK alert.

---

## DSI-S1-MACRO

**Owner:** dev-mcp-server
**Priority:** P0
**Size:** M
**Zone:** `apps/mcp-server/src/`
**Depends:** DSI-S1-SLA (detection net must be live first)

### Problem

Two carry inputs are hardcoded constants that masquerade as live data:

1. **fedFundsRate:** `macroTools.ts:55-58` shows `fedFundsRateIsEstimate` flag exists, but `formatThienThoi` at line 245 only suppresses carry/regime when `fedFundsRate === 0`. When `fedFundsRateIsEstimate=true` and `fedFundsRate=5.33` (fixture), the carry and regime are still computed as if real — producing `FII_OUTFLOW_RISK` when the true rate (~3.58% EFFR) gives `+1.4pp` positive spread.

2. **SBV deposit rate:** `sbv.ts:53-70` — all six SBV policy rates are hardcoded env-var defaults (overnight 3.0, refi 4.5, discount 1.5, MAX_DEPOSIT 5.0, MAX_LENDING 12.0, interbank 4.0). SBV portal is permanently 404. These are written to `sbv_rates` with `fetched_at=now`, with no `is_estimate` column. `vndDepositRate=5.0` (the deposit side of carry) is thus also a constant, making both sides of `carrySpread = vndDeposit - fedFunds` pure fixture arithmetic.

3. **Commodity zero-write:** `macroIndicatorRefreshJob.ts:273-276` — oil/gold/usdVnd values use `?? 0`; zeros are written to `commodity_prices` with `fetched_at=now`. A fetch failure silently writes stale zeros as fresh.

### Requirements

**FR-MAC-1 (fedFunds carry gate):**
In `formatThienThoi` (`macroTools.ts`): change the guard at line 245 from `fedFundsRate === 0` to `fedFundsRate === 0 || fedFundsRateIsEstimate`. When `fedFundsRateIsEstimate=true`, output carry spread and regime as `"unavailable — est. rate"`, not a computed value. Do NOT compute `carrySpread` or assign `regime` from an estimate value.

**FR-MAC-2 (SBV is_estimate column):**
Add `is_estimate INTEGER DEFAULT 1` column to `sbv_rates` schema (migration). In `sbv.ts` writer: set `is_estimate=1` whenever a rate value comes from the hardcoded fallback (env var or config default, not a real portal response). If/when the portal ever returns a real value, set `is_estimate=0`.

**FR-MAC-3 (carry/regime isEstimate propagation):**
In `carryTradeSignal.ts` or the carry computation call site: if either input (`fedFunds` or `vndDeposit`) has `is_estimate=true`, carry signal output MUST include `is_estimate: true` and `source_tier: 4`.

**FR-MAC-4 (true fetched_at for EFFR):**
In `carryTools.ts` or wherever the carry response is assembled: `fedFunds.fetched_at` must be `MAX(date)` from `fred_series_daily WHERE series='EFFR'`, not `time.Now()`. Query this at call time. If no row exists, `fedFunds.fetched_at = null`.

**FR-MAC-5 (commodity zero-write guard):**
In `macroIndicatorRefreshJob.ts:273-276`: replace `?? 0` with a fail-loud / skip-write pattern. If a commodity value is unavailable (fetch returned null/undefined), do NOT write `0` to the DB. Either skip the write entirely or write with `is_estimate=1` and keep the previous `fetched_at`. The zero-value must never be served as if freshly fetched.

**FR-MAC-6 (dataSource downgrade):**
The top-level `dataSource` in `get_macro_snapshot` response MUST be `"live"` ONLY when ALL component fields (fedFunds, vndDeposit, oil, gold, usdVnd) are fresh within their SLA window AND `is_estimate=false`. Otherwise: `"stale"`, `"fixture"`, or `"estimate"` per the worst component.

### Acceptance Criteria

**AC-MAC-1 (carry with live rate):**
With `fred_series_daily` containing a fresh EFFR row (~3.50-3.75% range): `get_macro_snapshot` returns `fedFundsRate ~3.5-3.75`, `carrySpread ~+1.4pp`, `regime != FII_OUTFLOW_RISK`. `fedFundsRateIsEstimate=false`.

**AC-MAC-2 (carry suppressed on fixture):**
With `fred_series_daily` empty or stale: `fedFundsRateIsEstimate=true`, `carrySpread` field absent or `null`, `regime` absent or `"UNKNOWN"`. No `FII_OUTFLOW_RISK` emitted from fixture arithmetic.

**AC-MAC-3 (SBV is_estimate):**
After migration: `SELECT is_estimate FROM sbv_rates` returns `1` (not 0) for the row written from fallback rates.

**AC-MAC-4 (no commodity zero-write):**
On a commodity fetch failure: `SELECT oil_usd FROM commodity_prices ORDER BY fetched_at DESC LIMIT 1` returns the previous real value with its original `fetched_at`, not 0 with a new timestamp.

**AC-MAC-5 (dataSource honest):**
With any estimate field active: `get_macro_snapshot` top-level `dataSource != "live"`.

**QA verification:** ops REBUILDS mcp-server. QA raw-verifies via `call_tool("get_macro_snapshot")`: fedFundsRate reflects real FRED value, carrySpread positive, regime not FII_OUTFLOW_RISK. Per-field timestamps present. dataSource downgraded appropriately when any field is estimate.

---

## DSI-S1-FE-TYPE

**Owner:** dev-mcp-server (frontend types live in apps/mcp-server — confirmed notebook)
**Priority:** P1
**Size:** S
**Zone:** `apps/frontend/app/domain/market.ts`
**Depends:** DSI-S1-MACRO (types must reflect what the backend now sends)
**Can parallel with:** DSI-S1-MACRO (non-conflicting files)

### Problem

`MacroSnapshot` interface (`market.ts:152-159`) has no `dataSource`, `is_estimate`, or `source_tier` fields. TypeScript structural typing silently drops extra fields at the boundary. Any render component that needs to show a staleness banner or grey out a fixture value cannot access these fields even when the backend correctly sends them.

Also: `MacroSignalEntry` (`market.ts:123`) has no per-signal provenance fields for carry/yield entries.

### Requirements

**FR-FE-1 (MacroSnapshot type extension):**
```typescript
// apps/frontend/app/domain/market.ts
export interface MacroSnapshot {
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
  signals: MacroSignals;
  fetchedAt: string;
  // DSI: provenance fields
  dataSource?: "live" | "fixture" | "stale" | "estimate";
  is_estimate?: boolean;
  source_tier?: 1 | 2 | 3 | 4;
  fedFundsRateIsEstimate?: boolean;
  carrySpread?: number | null;
  carryRegime?: string | null;
}
```

**FR-FE-2 (MacroSignalEntry type extension):**
```typescript
export interface MacroSignalEntry {
  // existing fields preserved
  is_estimate?: boolean;
  source_tier?: 1 | 2 | 3 | 4;
  fetched_at?: string;
}
```

**FR-FE-3 (CommoditySnapshot / per-symbol freshness):**
Verify whether a `CommoditySnapshot` type exists. If it does, add `is_estimate?: boolean` and `failedSymbols?: string[]`. If `yahooFinance.ts:288-323` produces per-symbol results, the type boundary must not lose the failed-symbol information.

**FR-FE-4 (StockQuote nullability for DSI-S2-PRICE):**
```typescript
// apps/frontend/app/domain/market.ts — StockQuote (line ~18)
change: number | null;       // was: number
changePercent: number | null; // was: number
staleness?: "FRESH" | "STALE" | "EXPIRED" | null;
```
This must be in the same PR as DSI-S2-PRICE (change/changePercent Go nullability is a breaking API change — both sides change together).

### Acceptance Criteria

**AC-FE-1:** `tsc --noEmit` passes with zero errors after type additions.

**AC-FE-2:** A TypeScript test or type-check file that constructs a `MacroSnapshot` object with `dataSource: "fixture"` and `is_estimate: true` compiles without error.

**AC-FE-3:** No existing consumer of `MacroSnapshot` or `MacroSignalEntry` produces a type error from the additive change (all new fields are optional).

**AC-FE-4 (StockQuote null-safety):** A TS test assigning `change: null` to a `StockQuote` compiles; assigning `change: undefined` does NOT compile.

**QA verification:** `tsc` clean in `apps/frontend/`. No runtime regression on the dashboard `:3001`.

---

## DSI-S2-PRICE

**Owner:** dev-stock-price
**Priority:** P1
**Size:** M
**Zone:** `apps/stock-price/pkg/`
**Depends:** DSI-ARCH (DONE); DSI-S1-FE-TYPE for the TS StockQuote null-handling (coordinate deploy order)

### Problem

Three issues in the Go stock-price service:

1. **Staleness dropped at DTO boundary:** `price_resolution.go:76,114` computes `ResolvedQuote.Staleness` ("FRESH" | "STALE" | "EXPIRED") correctly via `price-staleness-classifier`. But `FetchPriceResponse` in `usecases.go:19-33` has no `Staleness` field — the annotation is silently discarded before the HTTP response.

2. **Tier-3 cache re-stamps FetchedAt:** `fetchers.go:183-193` (Tier-3 SQLite cache fallback):
```go
return &domain.PriceQuote{
    Change:        0,
    ChangePercent: 0,
    FetchedAt:     time.Now().UTC().Format(time.RFC3339),  // re-stamp
}, nil
```
`time.Now()` makes a stale cached value look freshly fetched. `Source: domain.SourceCache` IS set correctly, but `FetchedAt` must be the row's actual DB write time, not serve time.

3. **Change/ChangePercent = 0 is ambiguous:** The Tier-3 path hardcodes `Change: 0` and `ChangePercent: 0` — indistinguishable from a genuine flat day. The DSI-INV-1 invariant requires unavailable values to be `null`, not `0`.

### Requirements

**FR-PRICE-1 (Staleness in DTO):**
```go
// apps/stock-price/pkg/application/usecases.go
type FetchPriceResponse struct {
    // existing fields
    Staleness  string `json:"staleness,omitempty"` // "FRESH" | "STALE" | "EXPIRED" | ""
    IsEstimate bool   `json:"isEstimate,omitempty"`
}
```
In `Resolve()` (or wherever `FetchPriceResponse` is built from `ResolvedQuote`): propagate `rq.Staleness` into `response.Staleness`. Set `IsEstimate=true` when `Staleness == "STALE" || Staleness == "EXPIRED"`.

**FR-PRICE-2 (Tier-3 true FetchedAt):**
In `fetchers.go` Tier-3 cache path: replace `time.Now()` with the `fetched_at` timestamp read from the SQLite cache row. The DB schema for `stock_price` has a `fetched_at` column — read it alongside `price`, `volume`. If the column is absent from the current query, add it to the SELECT.

**FR-PRICE-3 (Change/ChangePercent nullable):**
Change `Change float64` and `ChangePercent float64` in `domain.PriceQuote` (and the DTO) to pointer types `*float64`. In the Tier-3 cache path: set `Change: nil, ChangePercent: nil` (not 0). In Tier-1 and Tier-2 paths where values are genuinely available: set the pointer.

Go JSON serialization: `*float64` with nil serializes as `null` in JSON. `*float64` with value 0.0 serializes as `0`. This preserves real flat-day zeroes while making unavailable distinguishable.

**FR-PRICE-4 (TS caller null-safety):**
This is a breaking API change. Coordinate with DSI-S1-FE-TYPE: the `StockQuote.change: number | null` update in `market.ts` MUST be in the same deploy window. Both changes go out together (or the Go side deploys first with `null` emitted and the TS side catches up within the same PR batch).

**FR-PRICE-5 (router.go / HTTP handler propagation):**
Verify `apps/stock-price/pkg/interface/http/router.go` (or equivalent HTTP handler) writes the full `FetchPriceResponse` — including `Staleness` and `IsEstimate` — to the JSON response body. No DTO-to-response mapping should silently drop these fields.

### Acceptance Criteria

**AC-PRICE-1 (Staleness in response):**
Go unit test: construct a `ResolvedQuote` with `Staleness="STALE"`, map to `FetchPriceResponse`. Assert `response.Staleness == "STALE"` and `response.IsEstimate == true`.

**AC-PRICE-2 (Tier-3 true FetchedAt):**
Go unit test: mock the Tier-3 SQLite read returning a row with `fetched_at = "2026-06-01T10:00:00Z"`. Assert `FetchPriceResponse.FetchedAt == "2026-06-01T10:00:00Z"` (NOT time.Now()).

**AC-PRICE-3 (Change null on cache miss):**
Go unit test: Tier-3 cache path returns a quote. Assert `response.Change == nil` and `response.ChangePercent == nil`.

**AC-PRICE-4 (real zero preserved):**
Go unit test: Tier-1 live fetch returns `Change: 0.0` (genuine flat day). Assert `response.Change != nil && *response.Change == 0.0`.

**AC-PRICE-5 (JSON null serialization):**
HTTP integration test: GET /price/{ticker} with a Tier-3 cache response. Assert JSON body contains `"change":null` not `"change":0`.

**QA verification:** ops REBUILDS stock-price container. QA calls `call_tool(server="vn-market", tool="get_stock_price", arguments={ticker: "<any>"})`. Verifies `staleness` field present in response, `change` is `null` for a cache-served ticker, `fetchedAt` is the DB row timestamp not current time.

---

## DSI-S3-SECTOR-FIN

**Owner:** dev-mcp-server
**Priority:** P2
**Size:** L
**Zone:** `apps/mcp-server/src/interface/mcp/tools/`
**Depends:** DSI-ARCH (DONE). Can start independently of S1/S2 but must not be merged before DSI-S1-SLA lands (do not disrupt the critical path).

### Problem Clusters (all same DSI-INV-1 violation pattern)

**Cluster C1 — creditFlowTools:**
`creditFlowTools.ts:117-119`: mortgage rate uses `?? 10.5 / 11.0` as final fallback (VN typical 2024 avg). No label.
`creditFlowTools.ts:130-131,139-140`: `yoyGrowthPct: input.currentYoyGrowthPct ?? 15` and `?? -15` — fabricated NHNN credit growth statistics (±15% defaults). `reCreditRatioPct: 20/19` — hardcoded RE credit ratio.

**Cluster C2 — energyTools:**
`energyTools.ts:65-68`: grid dispatch figures (renewable/thermal/hydro/peak) are hardcoded: `40/22/45/85`. These are labeled `'(uoc tinh)'` in the grid section prose, but the derived stock-impact signal block based on these figures carries no caveat. The signal is presented as if computed from real data.

**Cluster C3 — bondMaturityTracker:**
`bondMaturityTracker.ts:42-91`: `SEED_BONDS` — 6 corporate bonds with hardcoded coupons (10.0/10.5/11.0/9.0/11.5/10.0), amounts, and maturity dates. `bondMaturityTools.ts:91-93`: the tracker returns `SEED_BONDS` when the DB is empty. No `static_seed` label in the emitted bond maturity alert message.

**Cluster C4 — BCTC ??0 false deltas:**
`bctcFullTools.ts:226-229`:
```typescript
netMarginPct: row.net_margin_pct ?? 0,
roe: row.roe ?? 0,
debtToEquity: row.debt_to_equity ?? 0,
```
When these columns are null (not yet computed), `0` is served. If a prior period also had `0` or a real value, `buildComparisonSection` computes a false delta vs synthetic 0. Note: `grossMarginPct` already has `bankForm ? NaN : (row.gross_margin_pct ?? 0)` — extend the NaN-guard pattern to the other ratio fields.

**Cluster C5 — extractionConfidence max-confidence default:**
`finalizeBctcRefineTool.ts:1037`: `extractionConfidence: valSrc.extraction_confidence ?? 1` — a missing confidence is given the maximum value (1.0). A report with no confidence measurement is treated as perfectly confident, bypassing PUB-5 and other confidence gates.

### Requirements

**FR-SEC-1 (creditFlow fail-loud or estimate-label):**
For each fabricated default in `creditFlowTools.ts`:
- Mortgage rate fallback `?? 10.5/11.0`: replace with `null` + `is_estimate: true` + `source_tier: 4`. Do not serve a number without provenance.
- `yoyGrowthPct ?? 15 / ?? -15`: same — `null` + `is_estimate: true`. If the carry-forward pattern is needed, add a comment citing the NHNN source and the date of the estimate.
- `reCreditRatioPct: 20/19`: add `static_seed: true` to the emitted object. These are constants, label them.

**FR-SEC-2 (energyTools signal caveat):**
In `energyTools.ts`: any signal computed from the hardcoded grid figures (40/22/45/85) must include `is_estimate: true` and `source_tier: 4` in its output. The `'(uoc tinh)'` label in the prose section is not sufficient — the downstream signal object itself must carry the flag.

**FR-SEC-3 (bondMaturity static_seed label):**
In `bondMaturityTracker.ts` / `bondMaturityTools.ts`: when `SEED_BONDS` is returned (DB empty fallback), each emitted bond maturity event must include a field `static_seed: true`. The alert message in `bondMaturityTools.ts:164` must append `[SEED DATA — không xác minh thị trường thực]` when `static_seed=true`.

**FR-SEC-4 (BCTC ??0 → null for ratio columns):**
In `bctcFullTools.ts:226-229`:
```typescript
netMarginPct: row.net_margin_pct ?? null,   // was ?? 0
roe: row.roe ?? null,                        // was ?? 0
debtToEquity: row.debt_to_equity ?? null,    // was ?? 0
```
In `buildComparisonSection`: when either period's value for a ratio is `null`, suppress the delta for that field (do not compute `null - number` or `number - null`). Output `"N/A"` for that field, same as the existing NaN guard on `grossMarginPct`.

**FR-SEC-5 (extractionConfidence missing → low not max):**
In `finalizeBctcRefineTool.ts:1037`: replace `?? 1` with `?? 0`. A missing confidence means we do NOT know the confidence — it must not be treated as maximum. A report with confidence 0 is PUB-5-gated and will not reach MARKET.

### Acceptance Criteria

**AC-SEC-1 (creditFlow is_estimate):**
Unit test: call the creditFlow tool handler with a DB that has no mortgage rate row. Assert the response carries `is_estimate: true` for the mortgage rate field (not a number without provenance).

**AC-SEC-2 (energyTools signal flag):**
Unit test: the derived stock-impact signal object from `energyTools.ts` includes `is_estimate: true` when computed from hardcoded grid values.

**AC-SEC-3 (bondMaturity seed label):**
Unit test: `getBondMaturityAlerts` with an empty DB returns events with `static_seed: true`. The alert message string contains `[SEED DATA`.

**AC-SEC-4 (BCTC ??null no false delta):**
Unit test: construct a comparison between period A (`roe: 0.27`) and period B (`roe: null`). Assert `buildComparisonSection` emits `"N/A"` for the ROE delta line (not `"-27pp"`).

**AC-SEC-5 (extractionConfidence ?? 0):**
Unit test: call `finalizeBctcRefineTool` with a validation source where `extraction_confidence` is undefined. Assert the resulting `financial_reports` row has `extraction_confidence = 0` (not 1). Assert PUB-5 would gate this report (conf < 0.5).

**QA verification:** ops REBUILDS mcp-server. QA calls relevant tools via `call_tool`. Verifies `is_estimate` or `static_seed` present in fabricated-default outputs. Verifies `extractionConfidence` defaults to 0, not 1.

---

## DSI-MACRO-INDICATORS-LATENT

**Owner:** dev-macro-indicators (BACKLOG — do NOT schedule in active sprint)
**Gate:** container enters the intended runtime set (confirmed by `docker ps -a`)

**Summary:** `apps/macro-indicators/pkg/application/usecases.go:43-51` contains `fixtureFedFundsRate=5.33` and `fixtureVNDDepositRate=4.7`. The `allLive` flag only covers oil/gold/usdVnd, not carry/yield inputs. If the container is ever started, it will serve fixture carry/yield with `dataSource:"fixture"` at response level but no per-field `is_estimate`.

**When activated — required changes:**
- `usecases.go`: add `IsEstimate bool` and true-source `FetchedAt` (last FRED `MAX(date)`, not `time.Now()`) to `MacroSnapshotResponse` and per-signal DTOs.
- `dtos.go`: extend `SignalResult` carry/yield entries with `IsEstimate bool` and `FetchedAtSource string`.
- Fixture fallback path: set `IsEstimate=true`, `FetchedAt` from DB `MAX(date)`, not `time.Now()`.

**Risk-4 pre-check:** Before treating as latent, confirm with ops: `docker ps -a | grep macro-indicators` returns no running container.

---

## Non-Functional Requirements (all tasks)

**NFR-1 (BUILD-STANDARD: lean):** All zones are existing services. No new service bootstrapped. Follow `docs/standards/microservice-build-standard.md`.

**NFR-2 (commit boundaries):**
- DSI-S1-SLA: one commit (XS, self-contained).
- DSI-S1-MACRO: one commit per logical unit (schema migration separate from code changes).
- DSI-S1-FE-TYPE: one commit (types only, no logic change).
- DSI-S2-PRICE: Go service changes in one commit; coordinate TS StockQuote null type in DSI-S1-FE-TYPE same deploy window.
- DSI-S3-SECTOR-FIN: cluster per commit (C1/C2/C3/C4/C5 may batch if same file family, must not batch across files from different clusters).

**NFR-3 (commit-mutex):** Each commit must claim `commit-mutex` via `task_claim(task_kind:"commit-mutex")` before staging. Release after push.

**NFR-4 (ops rebuild):** Every touched container must be rebuilt by ops after the commit. restart is not sufficient (relaunches stale image).

**NFR-5 (QA raw-verify):** QA must verify via `call_tool` directly (not badge relays). For each task: one live tool call proving the fix value, one proving the fail-loud / is_estimate path.

**NFR-6 (no cross-zone contamination):** dev-mcp-server and dev-stock-price are independent zones. No agent may edit files in both zones in one commit.

---

## Risk Register

| ID | Severity | Description | Mitigation |
|----|----------|-------------|------------|
| R-1 | HIGH | push-gso VPS script may send `country:"VN"` explicitly — server.ts default change won't fix it | FR-SLA-4: audit `vps-scripts/` before deploy |
| R-2 | MEDIUM | macroIndicatorFetcher.ts dead code | FR-SLA-3: comment only, do not remove |
| R-3 | LOW | Change/ChangePercent Go→TS null is a breaking API change | FR-PRICE-4: coordinate with DSI-S1-FE-TYPE in same deploy window |
| R-4 | LOW | macro-indicators container may already be running | ops: `docker ps -a` check before treating as latent |
| R-5 | MEDIUM | DSI-S3 ?? null changes may cause new N/A output visible to downstream signal consumers | Acceptable: N/A is honest. Carry-forward with is_estimate is acceptable. Fail-loud (null) is acceptable. Fabricated number is not. |

---

## RETURN

```
DONE: BA spec complete — docs/handoffs/DSI-BA-spec.md
TASKS: DSI-S1-SLA / DSI-S1-MACRO / DSI-S1-FE-TYPE / DSI-S2-PRICE / DSI-S3-SECTOR-FIN / DSI-MACRO-INDICATORS-LATENT (backlog)
BLOCKERS: none — no PO questions required
NEXT: dev-mcp-server | run DSI-S1-SLA (XS, do_first, P0)
HANDOFF: docs/handoffs/DSI-BA-spec.md
PIPELINE: continue
```
