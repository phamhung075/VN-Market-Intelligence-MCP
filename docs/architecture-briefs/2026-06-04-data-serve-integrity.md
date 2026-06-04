# Architecture Brief: DATA-SERVE-INTEGRITY (DSI-ARCH)

**Date:** 2026-06-04
**Sprint:** DATA-SERVE-INTEGRITY
**Lead agent:** architect
**Next agent:** BA-DSI
**Handoff:** `docs/handoffs/DSI-ARCH.md`
**Status:** DESIGN COMPLETE — hand to BA-DSI

---

## 1. The Systemic Anti-Pattern

Every incident in this sprint is one variation of the same anti-pattern:

> A fetch fails (timeout, empty DB, network error, missing FRED key). The code silently degrades to a hardcoded constant, zero, or last-persisted value. It then stamps the record with `fetched_at = datetime('now')` — making the value appear freshly retrieved. Staleness flags (`is_estimate`, `source_tier`, `dataSource`) are either absent from the schema, not propagated through the tool output, dropped at the TS type boundary, or never rendered. The consumer (MCP tool → LLM agent → cowork signal → Telegram market post) reads the value as live fact.

The consequence is not just stale data — it is **fabricated provenance**. The value is wrong AND it presents as authoritative.

---

## 2. The Fleet-Wide Invariant (DSI-INV-1)

**No served macro, price, or financial value may be a hardcoded substitute presented as live.**

Formally:

```
IF a field value is not derived from a real fetch in the current cycle:
  THEN either:
    (A) FAIL-LOUD: return error / null / HTTP 503; do not serve a value at all.
    (B) CARRY-FORWARD: serve the value WITH ALL of the following properties set:
        - source_tier: integer (1 = exchange-direct, 2 = aggregator, 3 = stale-cache, 4 = fixture/estimate)
        - fetched_at:  TRUE source timestamp — when the live data was actually obtained.
                       NEVER re-stamp to datetime('now') or time.Now() on a fallback path.
        - is_estimate: true  (boolean; absent or false only when data is definitively live)
        - dataSource:  "live" only when ALL component fields are fresh within their SLA window.
                       "fixture", "stale", or "estimate" otherwise.
  AND these four properties MUST propagate:
    fetcher (Go/TS) → DB column (schema) → tool output (JSON) → frontend TS type → render layer
  A value where ANY link in this chain drops the provenance metadata is a DSI-INV-1 violation.
```

### Why "safe-degrade" as currently implemented is unsafe

The Go macro-indicators `usecases.go` comments the fixture fallbacks as "safe-degrade" (DPI-2b note). The implementation is structurally unsound for one reason: the degrade is invisible to consumers. `dataSource` in the response DTO (`MacroSnapshotResponse`) is set to `"live"` only when `allLive=true` for the commodity trio, but is set to `"fixture"` otherwise. However:

1. The carry/yield resolver degrading to `fixtureFedFundsRate=5.33` (or `fixtureVNDDepositRate=4.7`) does NOT affect the `allLive` flag — that flag only covers oil/gold/usdVnd.
2. A consumer reading `dataSource:"fixture"` for the commodity block gets no signal that `fedFunds=5.33` is also a fixture value. There is no per-field provenance.
3. The `SignalResult` DTO (`dtos.go`, `carry` + `yield` sub-objects) carries no `is_estimate` field. A downstream agent reading `carrySpread=-0.63` with `regime:FII_OUTFLOW_RISK` has no way to know the spread was computed from a 2-year-old fixture rate.

The correct pattern is: per-field provenance, not response-level provenance. When `fedFunds` falls back to fixture, that field is individually marked `is_estimate:true` with `source_tier:4` and the `fetched_at` is the last time FRED actually returned a row (from `fred_series_daily MAX(date)`), not `time.Now()`.

### DSI-INV-1 Taxonomy Addendum — SBV Administered Rate Tier Ruling (FINAL, 2026-06-05, FU-SBV-DEPOSIT-PROVENANCE-GO)

**Context:** With macro-indicators confirmed LIVE (container healthy :5004), the `resolveVNDDepositRate` path in `usecases.go` (L309-316) returns 5.0 from `CarryYieldInputsPort.GetVNDDepositRate()` and the carry DTO emits `is_estimate:false, source_tier:1`. `source_tier:1` is wrong — it is reserved for exchange-direct data (FRED EFFR qualifies; quarterly SBV decree rate does not).

**Live schema probe result (2026-06-05):** `sbv_rates` columns: `source, overnight_rate_pct, refinancing_rate_pct, usd_vnd_official, discount_rate_pct, max_deposit_rate_pct, max_lending_rate_pct, interbank_overnight_pct, fetched_at`. **No `effective_date` column.** Latest row: `source=sbv, max_deposit_rate_pct=5.0, fetched_at=2026-05-16T13:25:52Z`.

**Final ruling: `source_tier:2` / `is_estimate:false` — unconditional.**

Rationale: The tier taxonomy classifies the epistemological status of the VALUE, not the completeness of our schema's provenance record. The SBV deposit rate of 5.0% is a real administered rate set by SBV decree, fetched from the SBV-maintained source, and written to the DB by the SBV cron with `source='sbv'`. It is not estimated, interpolated, or hardcoded. The absence of an `effective_date` column is a **provenance-completeness gap in our schema** — it does not reclassify a correct, real, authoritative value as a fixture estimate. Suppressing the carry regime (fed=3.62, SBV=5.0, spread=+1.38pp, NEUTRAL) because our DB lacks a decree-date column would destroy a correct live signal to honour a schema formalism. That violates DSI-INV-1's purpose, which targets fabricated provenance, not missing audit fields on real data.

The `source_tier:4` / `is_estimate:true` path remains correct only for the fixture fallback constant (4.7) — a hardcoded value with no external source linkage at all.

**EFFR (fedFunds) is unaffected** — FRED EFFR is tier:1 (published daily series, exchange-grade). Unchanged.

**Impact on carry DTO:** Minimal — one constant in `buildCarryDTO`. When both carry inputs are live-resolved (no fixture fallback), set `SourceTier` to 2 (the LOWER of fedFunds=tier:1 and vndDeposit=tier:2). This prevents the carry signal from claiming tier:1 when one component is only tier:2. `is_estimate` stays false; regime and carrySpread are not suppressed.

**`FetchedAtSource` on carry DTO:** Remains the FRED `MAX(date)` for the fedFunds input via `GetFedFundsSourceDate`. No SBV-side `effective_date` to stamp — the SBV carry input uses `fetched_at` (row write time) as the best available provenance timestamp. A separate follow-up adds a proper `effective_date` column to `sbv_rates`.

**Minimal code change for dev-macro-indicators:**

In `apps/macro-indicators/pkg/application/usecases.go`, `buildCarryDTO`:
```go
// Replace:
sourceTier := 1 // live

// With:
sourceTier := 2 // SBV administered rate (tier:2) caps the carry DTO; EFFR alone is tier:1
```
No new port methods. No new DB columns. No `GetVNDDepositEffectiveDate` — that method would be dead code against the live schema; do not implement it.

**Test addition:** `TestDSIINV1_CarrySourceTierAdministeredRate` in `usecases_test.go` — table-driven, asserts live path emits `source_tier:2` (not 1, not 4); fixture fallback path emits `source_tier:4` (unchanged).

**Follow-up (separate, non-blocking):** `FU-SBV-EFFECTIVE-DATE-COLUMN` (P3/backlog) — add `effective_date TEXT` to `sbv_rates` and populate it in the SBV VPS fetcher with the known decree date. Provenance-completeness improvement, not a correctness fix.

---

## 3. Regression Root-Cause: The VN/vietnam Key Mismatch

### 3.1 Confirmed timeline

| Commit | Change | Effect |
|--------|--------|--------|
| Pre-sprint | `macroIndicatorFetcher.ts` (domain service, now dead) writes `country='VN'` | `'VN'` rows exist in prod DB |
| `7a0adfdc` (1923a, 2026-05-17) | `macroIndicatorRefreshJob.ts` + `investmentClockTools.ts` switched to `country='vietnam'` as DB SSOT | Active write path now writes `'vietnam'` |
| `ff9a64ce` (DPI-FU-A, 2026-05-30) | Added `checkAndAlertEffrStaleness` + wired EFFR fetch | EFFR staleness alert wired; macroIndicatorSla.ts NOT updated |
| Present | `macroIndicatorSla.ts:35,73` queries `country='VN'`; active writer uses `'vietnam'` | SLA guard is fully blind |

### 3.2 Exact defect location

```
apps/mcp-server/src/domain/services/macroIndicatorSla.ts

Line 35:  .prepare("SELECT fetched_at FROM macro_indicators WHERE country = ?").get("VN")
Line 73:  .prepare("SELECT fetched_at FROM macro_indicators WHERE country = ?").get("VN")
```

Both `freshnessSlaChecker` and `detectStartupStaleData` query `country='VN'`. No active writer uses `'VN'`. Therefore:

- `freshnessSlaChecker` always returns `false` (no row found → code path `if (!row) return false`).
- The SLA breach path is never reached.
- The Telegram WORK alert for macro staleness has never fired since commit 7a0adfdc (2026-05-17).
- The 24-hour SLA is effectively disabled.

### 3.3 Does anything write country='VN' today?

Three code paths examined:

1. **`domain/services/macro/macroIndicatorFetcher.ts:266`** — writes `'VN'`. This is the old domain fetch service. The application usecase wrapper (`application/usecases/macroIndicatorFetcher.ts:35`) has a `TODO: Wire real infrastructure when needed in 239c` and returns `success:false` immediately in the production path. This path is **dead** — never called in production scheduling.

2. **`interface/mcp/server.ts:1435` and `:1520`** — HTTP push endpoint defaults to `country='VN'` when the incoming payload does not contain a `country` field. This endpoint accepts VPS push payloads. If the VPS push script omits `country`, rows with `'VN'` are written. Whether the push script sends `country` is not visible in the repo — the VPS scripts are in `vps-scripts/` and not examined here.

3. **`scheduler/macro/macroIndicatorRefreshJob.ts:242`** — writes `'vietnam'`. Primary writer.

**Conclusion:** Rows with `country='VN'` MAY exist from the push-gso HTTP endpoint (depending on VPS script payload). If they do, `freshnessSlaChecker` would find them and incorrectly assess staleness based on the last VPS GSO push, not the actual macro refresh job. This is a secondary integrity gap but does not change the primary fix: the SSOT key for the VN macro row must be declared in one place and enforced at all write sites.

### 3.4 Why the EFFR staleness guard (DPI-FU-A) did not catch the regression

`checkAndAlertEffrStaleness` checks `fred_series_daily WHERE series='EFFR'` — a completely separate table and query. It does not detect that `usecases.go` fell back to `fixtureFedFundsRate=5.33` because the `CarryYieldInputsSQLiteAdapter.GetFedFundsRate()` found no fresh row (or FRED was unreachable). The adapter returns `(0, nil)` on absence → `resolveFedFundsRate` returns the fixture. EFFR staleness alert fires only if the FRED fetch network is down AND the `fred_series_daily` row has aged past 96h. If the row exists but hasn't advanced (INSERT OR IGNORE semantics), the alert fires. But the adapter's zero-return path is never surfaced as a `dataSource:"fixture"` on the carry signal specifically.

---

## 4. Task Sequence and Rationale

### DSI-S1-SLA (P0, XS — fix key mismatch)

**Scope:** `apps/mcp-server/src/domain/services/macroIndicatorSla.ts` lines 35 and 73.

**Change:** Replace `.get("VN")` with `.get("vietnam")` at both query sites.

**Rationale:** This MUST ship first. Without it, every subsequent fix that writes correct data to the `'vietnam'` row is invisible to the detection net. The SLA guard is the canary — it must be alive before we validate any downstream fix. Secondary cleanup: the push-gso HTTP endpoint default (`"VN"`) should be normalized to `"vietnam"` at the same time to eliminate the key split permanently.

**Test:** Unit test: insert a row with `country='vietnam'` and `fetched_at` >24h ago → `freshnessSlaChecker` returns `false` + Telegram called. Insert with `fetched_at` fresh → returns `true`. Verify neither query path hits `'VN'`.

### DSI-S1-MACRO (P0, M — live fed + SBV deposit carry/yield)

**Scope:** `apps/macro-indicators/pkg/application/usecases.go` (Go plane) + `apps/mcp-server/src/interface/mcp/tools/macro/` carry output.

**Change:** The `MacroSnapshotResponse.DataSource` field must reflect per-carry-input provenance, not just the commodity trio. Specifically: if `resolveFedFundsRate` returns the fixture value, the carry signal output must include `is_estimate:true` and `source_tier:4`. The `fetched_at` on the carry sub-signal must be the actual `MAX(date)` from `fred_series_daily` for EFFR, not `time.Now()`.

**Expected outcome:** With FRED reachable and `fred_series_daily` populated, `fedFunds` resolves from the live DB row (~5.33% EFFR as of H1 2026 → carry spread = VND_deposit(4.7%) - fedFunds(5.33%) = -0.63pp, i.e. FII_OUTFLOW_RISK). With `fixtureSBVDepositRate=4.7` and `fixtureFedFundsRate=5.33` this is exactly the fixture regime. The task note says "expect ~+1.4pp positive spread, not FII_OUTFLOW_RISK" — this implies the live SBV max deposit rate that should be read is closer to 6.7%+ (current SBV rate 2026), not the 4.7% fixture. The DPI-FU-D fix (`d7ee43d7`) added a zero-write guard for SBV deposit, but if the DB row for `max_deposit_rate_pct` is stale or missing, the adapter returns 0 and the fixture 4.7% is served. Verify live `sbv_rates.max_deposit_rate_pct` is populated before attributing the regime error solely to FRED.

**Important note on the Go plane deploy status:** `apps/macro-indicators/` is NOT currently deployed as the live serve path on this host (16GB cap, Docker fleet restriction, this service is not in the intended runtime set per `docs/data/system-map.json`). The `get_macro_snapshot` MCP tool proxies through the micro-service only when the container is running. When it is not running, `getMacroSnapshot()` in `clients.ts` receives a 502/ECONNREFUSED and the calling agent falls through to `get_market_snapshot` or returns an error. **The fixture values in `usecases.go` are only in-play when the macro-indicators container IS running.** This must be confirmed before prescribing Go-plane changes as blocking fixes for the running system.

> **CORRECTION 2026-06-05 (R-4 resolved HOT via `docker ps`):** The above deploy-status note is WRONG as of 2026-06-05. `docker ps` confirms `vn-market-intelligence-mcp-macro-indicators-1` is Up 3 hours (healthy) on port 0.0.0.0:5004→5004/tcp. macro-indicators IS the live carry/yield serve path. The DSI-INV-1 producer-side fix in `usecases.go` (resolveFedFundsRate/resolveVNDDepositRate → (value,isLive); buildCarryDTO suppression on fixture fallback) is the LIVE fix, not a latent one. Live-verified: carry fed=3.62/NEUTRAL/+1.38pp/is_estimate=false/tier=1 this tick. See §7 R-4 correction.

### DSI-S1-FE-TYPE (P1, S — stop dropping dataSource/staleness at TypeScript boundary)

**Scope:** `apps/frontend/app/domain/market.ts` — `MacroSnapshot` interface (lines 152-159).

**Defect:** `MacroSnapshot` has no `dataSource`, `is_estimate`, or `source_tier` fields. If the Go macro service returns these fields, the TS type silently drops them (structural typing — extra fields are not an error but are not accessible to callers). Any render layer that needs to show a "FIXTURE DATA" banner or grey out a stale value cannot do so.

**Change:** Add optional fields to `MacroSnapshot`:
```typescript
dataSource?: "live" | "fixture" | "stale" | "estimate";
is_estimate?: boolean;
source_tier?: 1 | 2 | 3 | 4;
```
And similarly on `MacroSignalEntry` for per-signal carry/yield provenance.

**Rationale:** The type boundary is the last defence before render. If the type drops the field, downstream code can never access it even if the backend correctly sends it.

### DSI-S2-PRICE (P1, M — stock-price staleness propagation)

**Scope:** `apps/stock-price/` (Go plane) + `apps/mcp-server/src/` (TS client that calls it).

**Current state:** `PriceResolutionModule.Resolve()` correctly computes a `Staleness` annotation (`"FRESH" | "STALE" | "EXPIRED"`) via the `price-staleness-classifier` primitive. However:

1. `FetchPriceResponse` (usecases.go, line 19-33) does NOT include a `Staleness` field. The annotation is computed in the module but never propagated to the HTTP response.
2. `domain.PriceQuote` has no `is_estimate` or `source_tier` field.
3. `Change` and `ChangePercent` fields in `PriceQuote`: if a tier fails and returns 0 for these fields, the response presents `change: 0, changePercent: 0` — this is indistinguishable from a genuine flat day. The invariant requires that unavailable change data is represented as `null`/absent, not `0`.
4. The `FetchedAt` on a Tier-3 cache response is re-stamped to now in the fetcher (verify in `apps/stock-price/pkg/infrastructure/fetchers.go`). If a cached row is served, its `FetchedAt` must be the cache write time, not the serve time.

**Changes required:**
- Add `Staleness string` and `IsEstimate bool` to `FetchPriceResponse` (usecases.go).
- Propagate `ResolvedQuote.Staleness` into the response.
- Change `Change` / `ChangePercent` to pointer types (or use a sentinel) so unavailable = null not 0.
- Verify fetchers.go Tier-3 does not re-stamp `FetchedAt`.

### DSI-S3-SECTOR-FIN (P2, L — sector/financial fixtures)

**Scope:** `apps/mcp-server/src/` — multiple tool files.

Known fixture clusters confirmed by prior QA/router-raw-verify (not re-verified in this brownfield pass — treat as evidence from task notes + prior architect briefs):

- `creditFlow`: hardcoded sector credit flow values served as live (no DB source).
- `energyOutput`: hardcoded values.
- `bondMaturity`: `bond_maturity` table exists in schema-macro.ts but data is static seed, not live fetch.
- `BCTC ratios`: extractionConfidence served as `0.8` even when extraction never ran.

**Design prescription:** Each of these must follow the same DSI-INV-1 pattern. Until a live fetch is wired: serve `null` with `is_estimate:true` and `source_tier:4`. Do not serve a hardcoded number with `source_tier:2` or absent provenance fields.

This cluster is P2 because the downstream consumers (cowork chef signals) currently generate regime calls based on macro/price, not these sector financials. The macro/price fix (S1+S2) corrects the highest-impact fabrication first.

---

## 5. Per-Zone Split for BA-DSI

### Zone A: `apps/mcp-server/` → `dev-mcp-server`

All TypeScript fixes. Highest priority — this is the live serve plane.

| Task | Layer | Files | Size |
|------|-------|-------|------|
| DSI-S1-SLA | domain/services | `macroIndicatorSla.ts` (lines 35, 73) + server.ts push-gso default country | XS |
| DSI-S1-FE-TYPE | interface/mcp (types) + frontend domain | `market.ts` MacroSnapshot + MacroSignalEntry interfaces | S |
| DSI-S2-PRICE (client side) | interface/mcp + infra/clients | MCP tool that calls stock-price service: surface Staleness from response | S |
| DSI-S3-SECTOR-FIN | interface/mcp/tools | creditFlow, energy, bondMaturity tools — null+is_estimate pattern | L |

### Zone B: `apps/stock-price/` → `dev-stock-price`

Go plane. Currently deployed (stock-price container is in the intended runtime set).

| Task | Layer | Files | Size |
|------|-------|-------|------|
| DSI-S2-PRICE (service side) | application + interface/http + domain | `usecases.go` FetchPriceResponse add Staleness+IsEstimate; `models.go` Change nullable; `router.go` propagate; `fetchers.go` Tier-3 restamp audit | M |

### Zone C: `apps/macro-indicators/` → `dev-macro-indicators` — ~~LATENT LANDMINE, NOT HOT~~ LIVE (CORRECTED 2026-06-05)

> **CORRECTION 2026-06-05:** The "LATENT LANDMINE / NOT HOT" and "not in deploy set" classification is WRONG. `docker ps` (2026-06-05 tick) confirms the container is Up and healthy on :5004. This zone is LIVE and HOT. See §7 R-4 correction below.

~~**CRITICAL flag for BA and PM:** This Go service is NOT in the intended deploy set for this host. Its fixture fallbacks are only in-play when the container is running. DO NOT schedule `dev-macro-indicators` work as blocking for the S1/S2 fixes.~~

~~However, the code is a **latent landmine**: if the container is ever started (e.g., during a host memory investigation, ops experiment, or future scale-up), it will silently serve fixture carry/yield signals as `dataSource:"fixture"` at the response level but with no per-field `is_estimate`. The fix is low-risk and well-scoped.~~

~~If/when this zone is activated, the changes are:~~
~~- `usecases.go`: add `IsEstimate bool` and true-source `FetchedAt` to `MacroSnapshotResponse` and per-signal DTO.~~
~~- `dtos.go`: extend `SignalResult` carry/yield entries with `IsEstimate bool` and `FetchedAtSource string`.~~
~~- Fixture fallback path: set `IsEstimate=true`, set `FetchedAt` to last FRED `MAX(date)` (query at call time), not `time.Now()`.~~

~~BA should create a separate backlog item `DSI-MACRO-INDICATORS-LATENT` rather than including this in the active sprint. Gate on: container enters intended runtime set.~~

**LIVE STATUS — dev-macro-indicators is now an active zone.** The DSI-INV-1 producer-side fix (`resolveFedFundsRate`/`resolveVNDDepositRate` returning (value, isLive); `buildCarryDTO` suppressing to regime=UNKNOWN/carrySpread=null/is_estimate=true/tier=4 on fixture) has already shipped in this sprint and is serving live. `DSI-MACRO-INDICATORS-LATENT` is reclassified from "deferred backlog" to "live fix, already shipped." Residual open item is the SBV administered-rate tier ruling — see §2 addendum and §7 R-4.

---

## 6. Build Standard Classification

All zones are EXISTING services with NEW features/fixes (no new service bootstrapped):

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: dev-mcp-server and dev-stock-price drive end-to-end within their zones;
      no cross-zone relay required for S1/S2.
      DSI-S1-SLA is XS and must not be blocked behind S2 sequencing.
```

---

## 7. Risk Flags

**R-1 (HIGH): Key normalization breaks push-gso if VPS script omits country field.**
The server.ts push-gso default is currently `"VN"`. If changed to `"vietnam"` and the VPS script sends no `country` field, existing VPS data continues to work. If the VPS script explicitly sends `country: "VN"` (hardcoded), changing the default does not fix it. BA must include: verify VPS push scripts in `vps-scripts/` send either no country or `country: "vietnam"` before deploying the key normalization.

**R-2 (MEDIUM): macroIndicatorFetcher.ts (domain service) dead code — leave in place.**
The dead `fetchAndStoreMacroIndicators` path (application usecase, production path returns `success:false`) should NOT be removed as part of this sprint. Removal requires verifying zero test references and zero scheduler wiring, which is out of scope. Mark it with a `@deprecated DSI: dead code, task 239c not wired` comment only.

**R-3 (LOW): stock-price Change/ChangePercent nullability is a breaking API change.**
Changing `Change float64` to `*float64` in the Go DTO changes the JSON serialization from `0` to `null` for unavailable values. Verify all TS callers of `change` / `changePercent` handle `null` before deploying. The frontend `StockQuote` interface (market.ts line 18) has `change: number` — this must be updated to `change: number | null` in the same PR.

**R-4 ~~(LOW): macro-indicators Go plane not deployed — no deploy step required for DSI-S1/S2.~~**
~~Confirm with ops: `docker ps -a` shows no macro-indicators container. If it is running, the latent landmine is HOT and `dev-macro-indicators` must be scheduled immediately.~~

> **RESOLVED HOT 2026-06-05:** `docker ps` confirmed `vn-market-intelligence-mcp-macro-indicators-1` Up 3 hours (healthy) :5004. The "not deployed" premise was incorrect. The producer-side DSI-INV-1 fix has shipped and is live. Residual item: SBV administered-rate tier ruling (FU-SBV-DEPOSIT-PROVENANCE-GO) — see §2 addendum below. dev-macro-indicators must apply the tier correction before this sprint closes.

---

## 8. Verified Paths

| File | Verified Finding |
|------|-----------------|
| `apps/mcp-server/src/domain/services/macroIndicatorSla.ts:35,73` | Queries `country='VN'` — dead since 1923a (2026-05-17) |
| `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts:242` | Writes `country='vietnam'` — active primary writer |
| `apps/mcp-server/src/infrastructure/fetchers/tradingEconomics.ts:195,231,306` | Writes `country='vietnam'` — secondary writer |
| `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts:266,296` | Writes `country='VN'` — dead code, production path returns success:false |
| `apps/mcp-server/src/interface/mcp/server.ts:1435,1520` | Push-gso endpoint defaults to `country='VN'` when payload omits field — active but unknown payload shape from VPS |
| `apps/macro-indicators/pkg/application/usecases.go:43-51` | fixtureFedFundsRate=5.33, fixtureVNDDepositRate=4.7 — safe-degrade fallbacks; allLive flag covers only oil/gold/usdVnd, NOT carry/yield inputs |
| `apps/stock-price/pkg/module/price_resolution/price_resolution.go:76,114` | `ResolvedQuote.Staleness` computed correctly but NOT in `FetchPriceResponse` DTO |
| `apps/stock-price/pkg/application/usecases.go:19-33` | `FetchPriceResponse` has no Staleness, no IsEstimate, no source_tier |
| `apps/frontend/app/domain/market.ts:152-159` | `MacroSnapshot` interface missing dataSource, is_estimate, source_tier |

---

## 9. Sequence Summary (for BA sprint decomposition)

```
DSI-S1-SLA   → unblock detection net (XS, ship first, no dependencies)
  ↓
DSI-S1-MACRO → live fedFunds + SBV deposit in carry/yield; per-field is_estimate (M)
  ↓
DSI-S1-FE-TYPE → TypeScript type boundary (S, can parallel with S1-MACRO)
  ↓
DSI-S2-PRICE → stock-price Staleness propagation + Change nullability (M)
  ↓
DSI-S3-SECTOR-FIN → sector/fin fixture clusters → null+is_estimate (L, P2)
  ↓
FU-SBV-DEPOSIT-PROVENANCE-GO → LIVE (container up); tier correction for administered rate
  [DSI-MACRO-INDICATORS-LATENT was WRONG label — container is deployed, fix already shipped]
```

---

## 10. Handoff Block

```
## [Architect] Brownfield Findings

- **Zone:** multi-zone
  - apps/mcp-server/    → dev-mcp-server   (S1-SLA, S1-FE-TYPE, S3-SECTOR-FIN, S2-PRICE client side)
  - apps/stock-price/   → dev-stock-price  (S2-PRICE service side)
  - apps/macro-indicators/ → dev-macro-indicators — ~~LATENT LANDMINE, not-hot, backlog only~~ LIVE (CORRECTED 2026-06-05); fix already shipped; FU-SBV-DEPOSIT-PROVENANCE-GO open

- **Verified paths:** see §8 above

- **Reuse patterns:**
  - DSI-INV-1 is one pattern repeated across all fixes. Implement it once as a shared type/interface
    (`ProvenanceFields`) in a domain model and extend all response types from it.
  - `price-staleness-classifier` primitive in stock-price already classifies staleness correctly —
    extend, never duplicate.

- **Design decisions:**
  - DSI-S1-SLA: 2-line fix + single country key SSOT constant; no architectural change.
  - DSI-INV-1 compliance: per-field provenance, not response-level. Each computed value carries
    its own source_tier + fetched_at + is_estimate.
  - Nullable Change/ChangePercent: pointer types in Go (*float64), number | null in TS.
  - macro-indicators Go plane: ~~fix is scoped to latent backlog item only~~ LIVE; DSI-INV-1 producer fix shipped; FU-SBV-DEPOSIT-PROVENANCE-GO tier correction still open (CORRECTED 2026-06-05).

- **Scan clean:** true ✓
- **BUILD-STANDARD:** lean
- **BUILD-STANDARD-REF:** docs/standards/microservice-build-standard.md
```
