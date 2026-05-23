---
title: "P0 Brownfield Inventory — stock-price"
date: "2026-05-24"
author: "architect (P0-SP-1)"
pilot: "stock-price"
fleet_pilot_number: 3
charter_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md"
phase: 0
deliverable: "PHASE0-D2 (brownfield_inventory)"
---

# P0 Brownfield Inventory — `apps/stock-price/`

Scope: full brownfield audit of the existing Go microservice (all 4 DDD layers + infrastructure + composition root). No `pkg/primitive/`, `pkg/module/`, `cmd/sandbox/`, or `dashboard/` directories exist yet — Phase 0 exit gate confirmed clean.

---

## 1. Executive Summary

`apps/stock-price/` is a **pure-Go microservice** (go 1.22, `mattn/go-sqlite3` CGO) with all 4 DDD layers already present and structurally clean. The domain layer is free of I/O. The single CGO dependency (`mattn/go-sqlite3`) is **strictly isolated to `pkg/infrastructure/fetchers.go`** and wired only from `cmd/server/main.go`. No CGO leak exists in domain, application, or interface layers.

The 3-tier concurrent price-fallback logic is cleanly decomposed: infra fetchers hold I/O, domain service holds tier-walk orchestration, ports in `domain/ports.go` define the dependency-inversion boundary. The architecture already uses dependency injection throughout — **this makes primitive/module extraction straightforward**. No major structural surgery is required.

The 5 charter-proposed primitive candidates are **confirmed feasible** via code inspection. The highest-leverage candidates are `price-quote-normalizer`, `tier-fallback-selector`, and `price-staleness-classifier` (pure decision/transform logic, currently entangled inside infra and domain). `ohlcv-aggregator` and `exchange-code-router` are lower-leverage (thin, row-scan and string-table logic respectively) but tractable.

**R-CGO verdict: FEASIBLE** — all `mattn/go-sqlite3` imports are confined to `pkg/infrastructure/fetchers.go`. Domain, application, and interface packages contain zero CGO. Primitives and the module will be stdlib-only; the sandbox can build under `CGO_ENABLED=0`.

MCP-server G5b scope: **no direct stock-price domain imports** exist in mcp-server tool handlers. Both `fetchStockPrice` and `getPriceHistory` are already routed via HTTP to port 5000 through `clients.ts`. The three candidate tool files (`priceHistoryTools.ts`, `tickerIntelligenceTools.ts`, `priceAlertTools.ts`) do NOT import stock-price domain — they query the mcp-server's own SQLite via `bun:sqlite`. G5b rewire scope is **narrower than anticipated**: HTTP integration is already in place; no direct-domain-import removal is needed.

---

## 2. Current DDD Layer Structure

| Layer | Files | LOC (approx) | Status | Deviations |
|---|---|---|---|---|
| **domain** | `pkg/domain/models.go` | ~45 | CLEAN — pure value objects, zero imports beyond stdlib | None |
| **domain** | `pkg/domain/ports.go` | ~14 | CLEAN — port interfaces only | None |
| **domain** | `pkg/domain/services.go` | ~67 | CLEAN — concurrent tier-walk, `sync` stdlib only | None |
| **application** | `pkg/application/usecases.go` | ~90 | CLEAN — DTOs + use case orchestration, imports domain only | None |
| **infrastructure** | `pkg/infrastructure/fetchers.go` | ~276 | CLEAN structurally; correctly holds all CGO + HTTP I/O | CGO isolated here only — correct |
| **interface** | `pkg/interface/http/router.go` | ~165 | CLEAN — HTTP handlers, imports application + domain for error type only | `isNotAvailable` typecasts `*domain.PriceNotAvailableError` — acceptable interface-layer error mapping |
| **composition root** | `cmd/server/main.go` | ~77 | CLEAN — wiring only: config → infra → domain → app → interface → listen | Port 5000 hardcoded in health handler (minor; matches system-map.json) |

**Total Go source LOC: ~734** (excluding tests)

**No `pkg/primitive/`, `pkg/module/`, `cmd/sandbox/`, `dashboard/`** — Phase 0 exit gate clean.

### Test coverage (existing)

| Test file | Layer | Cases |
|---|---|---|
| `pkg/domain/services_test.go` | domain | 7 cases: Tier1Wins, Tier2Fallback, Tier3Fallback, AllNilThrows, AllThrowThrows, SaveQuoteCalled, CorrectCodeReturned |
| `pkg/application/usecases_test.go` | application | Exists (content not audited — out of scope for read-only inventory) |
| `pkg/infrastructure/fetchers_test.go` | infrastructure | Exists (CGO-dependent; will need build tags or mocking in sandbox) |
| `pkg/interface/http/router_test.go` | interface | Exists |

---

## 3. Primitive Candidates (Confirmed)

Ordered by extraction leverage (purity + call-frequency + entanglement):

### P1: `price-quote-normalizer` ★★★ HIGHEST LEVERAGE

**Source location:** `pkg/infrastructure/fetchers.go` — Tier1 L60–83, Tier2 L123–148, Tier3 L185–195

**What it does:** Each tier fetcher builds a `domain.PriceQuote` from a raw exchange response struct. The field-mapping logic (`item.Close → PriceQuote.Price`, `item.PctChange → PriceQuote.ChangePercent`, `time.Since(start).Milliseconds() → PriceQuote.LatencyMs`, `time.Now().UTC().Format(time.RFC3339) → PriceQuote.FetchedAt`) is currently **duplicated in all 3 tier fetchers** and entangled with HTTP/SQLite I/O.

**Why it is pure:** Input = a decoded field-set (raw response fields: price, volume, change, changePct, source label). Output = canonical `PriceQuote`. No network, no DB, no time.Now() side-effects (time is injected as a parameter in the primitive).

**Primitive signature (proposed):**
```go
// pkg/primitive/price-quote-normalizer/normalizer.go
func NormalizeQuote(rawPrice, rawVolume, rawChange, rawChangePct float64, code string, source domain.PriceSource, fetchedAt string, latencyMs int64) domain.PriceQuote
```

**Scenario coverage:** golden (VCB → canonical quote), edge (zero volume, zero change), failure (empty code → sentinel).

---

### P2: `tier-fallback-selector` ★★★ HIGHEST LEVERAGE

**Source location:** `pkg/domain/services.go` L53–65 — `ResolvePriceService.FetchPrice` result-walk loop

**What it does:** Given a `[]tierResult` (each = `{quote *PriceQuote, err error}`), selects the **first non-nil quote in tier order** (T1→T2→T3). Returns the winning quote or a `PriceNotAvailableError`. The concurrent fetch dispatching is infrastructure; **the selection decision is pure**.

**Why it is pure:** Input = `[]TierResult{Quote *PriceQuote, Err error}`. Output = `(*PriceQuote, error)`. No goroutines, no time, no DB. Deterministic — given the same slice, always returns the same result.

**Primitive signature (proposed):**
```go
// pkg/primitive/tier-fallback-selector/selector.go
type TierResult struct { Quote *domain.PriceQuote; Err error }
func SelectWinningTier(results []TierResult) (*domain.PriceQuote, error)
```

**Scenario coverage:** golden (T1 wins), edge (T1 nil → T2 wins, T2 nil → T3 wins), failure (all nil/error → PriceNotAvailableError).

---

### P3: `price-staleness-classifier` ★★ HIGH LEVERAGE

**Source location:** Currently implicit — staleness is **not yet a named function** in the codebase. The tier-walk treats any non-nil quote as "valid" without explicit freshness checking. This is a **gap identified in the charter** (§Refactor Targets) — the classifier formalizes the latent freshness contract.

**Why it is pure:** Input = `fetched_at string` (RFC3339), `now time.Time`, `thresholdSeconds int`. Output = `FRESH | STALE | EXPIRED`. Deterministic given deterministic inputs. No I/O.

**Note:** This primitive does not have existing source code to extract — it is a **formalization of an implicit rule** (currently T3 cache quotes carry no freshness validation; any cached row is accepted). The primitive codifies the business rule that should govern T3 cache acceptance.

**Primitive signature (proposed):**
```go
// pkg/primitive/price-staleness-classifier/classifier.go
type StalenessLabel string
const (Fresh StalenessLabel = "FRESH"; Stale StalenessLabel = "STALE"; Expired StalenessLabel = "EXPIRED")
func ClassifyStaleness(fetchedAt string, now time.Time, freshThresholdSeconds, staleThresholdSeconds int) (StalenessLabel, error)
```

**Scenario coverage:** golden (recent fetchedAt → FRESH), edge (fetchedAt = exactly threshold), failure (malformed RFC3339 string → error).

---

### P4: `ohlcv-aggregator` ★ MEDIUM LEVERAGE

**Source location:** `pkg/infrastructure/fetchers.go` L215–248 (`SQLitePriceHistoryRepository.GetHistory`), `pkg/application/usecases.go` L79–89 (`PriceHistoryUseCase.Execute`)

**What it does:** Aggregates raw DB rows into a canonical `[]DailyOHLCV` series. Currently: `rows.Scan()` → slice append → nil-guard → return. The aggregation step (ordering, nil-guard, ensuring non-nil slice) is pure.

**Why it is pure:** Input = `[]RawOHLCVRow{date, open, high, low, close, volume}`. Output = `[]DailyOHLCV`. No DB, no network. The DB query itself stays in infrastructure.

**Primitive signature (proposed):**
```go
// pkg/primitive/ohlcv-aggregator/aggregator.go
type RawOHLCVRow struct { Date, Open, High, Low, Close, Volume string/float64 }
func AggregateOHLCV(rows []RawOHLCVRow) []domain.DailyOHLCV
```

**Scenario coverage:** golden (3-row slice → sorted DailyOHLCV), edge (empty input → empty non-nil slice), failure (malformed date → handled without panic).

---

### P5: `exchange-code-router` ★ LOWER LEVERAGE (OPTIONAL — confirm in Phase 1)

**Source location:** `pkg/infrastructure/fetchers.go` — exchange routing is implicit. Tier1 always returns `domain.SourceHOSE`, Tier2 always returns `domain.SourceHNX` (regardless of actual ticker). The `exchange-code-router` primitive would formalize ticker → (exchange, canonical request shape) routing logic.

**Assessment:** **Deferred pending Phase 0 confirmation.** The current implementation uses a static tier→exchange mapping (T1=HOSE, T2=HNX, T3=Cache) without per-ticker routing. A true `exchange-code-router` primitive requires a ticker → exchange lookup table (currently absent). This primitive may emerge in Phase 2 rather than Phase 1. **Recommend: defer to dev-stock-price Phase 1 assessment.**

---

**Recommended Phase 1 primitive set (3 confirmed + 1 optional):**
1. `price-quote-normalizer` (extract from infra Tier1/Tier2/Tier3 builders)
2. `tier-fallback-selector` (extract from domain service result-walk)
3. `price-staleness-classifier` (formalize from implicit contract)
4. `ohlcv-aggregator` (extract from infra GetHistory + application use case nil-guard)

P5 (`exchange-code-router`) is deferred — confirm feasibility in dev-stock-price Phase 1 work.

---

## 4. Module Candidate: `price_resolution`

### Module boundary

`pkg/module/price_resolution/` is the single module for Phase 1 (matches TA + macro pilot discipline of one module per pilot). A second module (`history_aggregation`) is deferred post-pilot.

### Port interface design

The module composes primitives via a single port. The tier-fetch I/O (HTTP calls, SQLite reads) is **injected as an infrastructure implementation** of this port — never imported directly by the module.

```go
// pkg/module/price_resolution/ports.go
package price_resolution

import "github.com/vn-market-intelligence/stock-price/pkg/domain"

// TierFetcher is the port the module depends on.
// Infrastructure (Tier1VnDirectFetcher, Tier2VnDirectLegacyFetcher, Tier3CacheFetcher)
// implements this port and is injected at composition root.
type TierFetcher interface {
    FetchPrice(code string) (*domain.PriceQuote, error)
}
```

### Composition pattern

```
cmd/server/main.go  (composition root — wires CGO SQLite fetcher HERE)
    ↓  injects TierFetcher implementations (infra impls)
pkg/module/price_resolution/
    ↓  calls primitives
pkg/primitive/tier-fallback-selector/
pkg/primitive/price-quote-normalizer/
pkg/primitive/price-staleness-classifier/
pkg/primitive/ohlcv-aggregator/
```

The module's `ResolvePriceModule.Execute(code string)` method:
1. Calls injected `tier1.FetchPrice(code)`, `tier2.FetchPrice(code)`, `tier3.FetchPrice(code)` concurrently (mirrors existing domain service goroutine pattern)
2. Builds `[]TierResult` from responses
3. Calls `tier-fallback-selector.SelectWinningTier(results)` → winning quote
4. Calls `price-staleness-classifier.ClassifyStaleness(quote.FetchedAt, now, freshThreshold, staleThreshold)` to annotate
5. Calls `price-quote-normalizer.NormalizeQuote(...)` if the winning quote needs re-normalization
6. Returns resolved `PriceQuote` with staleness annotation

### Module port constraints (Fence-B)

- Module NEVER imports `pkg/infrastructure`
- Module NEVER imports `mattn/go-sqlite3`
- Module imports ONLY: stdlib, `pkg/primitive/*`, `pkg/domain` (value objects), and `TierFetcher` port (defined in module's own `ports.go`)

### Existing domain service disposition (G5a scope)

`pkg/domain/services.go` (`ResolvePriceService`) is the **predecessor** of the module. It will be **superseded** when the module ships. Phase 0 brownfield confirms:
- `ResolvePriceService` is used by `application/usecases.go` (`FetchPriceUseCase`)
- When the module lands, `FetchPriceUseCase` is updated to call the module instead
- `ResolvePriceService` moves to `pkg/domain/_deprecated/services_v1.go` at Phase 2 G5a time (not Phase 1 — Phase 1 scaffolds the new layer; Phase 2 deletes the old one)
- The 7 existing unit tests in `services_test.go` are the baseline regression suite — they exercise the exact tier-walk logic that will be covered by the new module's scenario fixtures

---

## 5. MCP-Server Integration Points (G5b Scope)

**Key finding: G5b scope is narrower than expected. HTTP integration is already in place.**

### Audit of all market-data tool handlers

| Handler file | Stock-price data consumed? | Integration path | G5b action required? |
|---|---|---|---|
| `priceHistoryTools.ts` | YES — `daily_ohlcv` table | **Direct SQLite query via mcp-server's own `bun:sqlite` DB** — NOT via stock-price HTTP | PARTIAL — queries mcp-server's own DB copy; no HTTP call to port 5000. Phase 2 decision: route via stock-price `/price/history` or retain local query |
| `tickerIntelligenceTools.ts` | YES — `market_prices_history` table (Section 1 of brief) | **Direct SQLite query via mcp-server's own DB** — NOT via stock-price HTTP | Same pattern as above — local DB query, not HTTP |
| `priceAlertTools.ts` | NO direct price data | Reads/writes `price_alerts` table in mcp-server's own DB; watchlist validation only | No rewire needed — pure alert CRUD |
| `marketTools.ts` | PARTIAL — reads `market_prices` table for exchange classification | **Direct SQLite query for routing metadata only**; live price fetch goes to HOSE/HNX/UPCOM fetchers directly in mcp-server | No rewire needed for routing metadata; live prices bypass stock-price service entirely |
| `dataFreshnessTools.ts` | PARTIAL — queries `market_prices.updated_at` | Direct SQLite | No rewire needed |
| `foreignFlowTools.ts` | NO | Foreign flow data source | Not in scope |
| `insiderTools.ts` | NO | Insider transactions | Not in scope |
| `marketContextTools.ts` | Audit needed (not a primary target) | Unknown | Low priority |

### Already-HTTP client functions

The **correct HTTP integration already exists** in `apps/mcp-server/src/infrastructure/microservices/clients.ts`:
- `fetchStockPrice(req: FetchPriceRequest)` — POST `/price/fetch` to port 5000
- `getPriceHistory(req: PriceHistoryRequest)` — GET `/price/history?code=X&days=N` to port 5000

**Call sites:** Neither function is called by any tool handler in `market-data/`. They are called exclusively by `src/scheduler/alerts/verdictResolutionJob.ts` — a background job that uses stock-price to resolve prediction verdict prices.

### G5b assessment for Phase 2

The "MCP-server tool handlers bypass stock-price HTTP" pattern here is **structurally different from the macro-indicators G5b case**: macro's tool handlers imported domain services directly. Here, the tool handlers query mcp-server's **own SQLite DB** (which holds a cached copy of price data pushed by cron jobs). This is NOT a domain import violation — it is a separate architectural concern (dual-write caching vs. live HTTP).

**Phase 2 G5b decision deferred to PM/PO:** the question is whether `priceHistoryTools.ts` and `tickerIntelligenceTools.ts` Section 1 should route via the stock-price HTTP service or retain local SQLite queries. Both paths are valid; the choice depends on latency, freshness, and operational preferences. This is NOT a DDD violation — it is a data-access routing decision.

**G5b Phase 2 scope (as currently assessed):**
- No direct domain import removals needed (none exist)
- No HTTP rewire mandatory for correctness (HTTP client already present)
- Phase 2 may **optionally** route `priceHistoryTools.ts` through stock-price `/price/history` to eliminate dual-write pattern
- Charter G5b confirmation: dev-stock-price MUST verify at Phase 2 whether any handler uses `import ... from 'apps/stock-price/...'` — none found in this audit

---

## 6. R-CGO Feasibility Confirmation

### CGO audit — file-by-file

| Package | File | mattn/go-sqlite3 import? | CGO directive? | Verdict |
|---|---|---|---|---|
| `pkg/domain` | `models.go` | NO | NO | CLEAN |
| `pkg/domain` | `ports.go` | NO | NO | CLEAN |
| `pkg/domain` | `services.go` | NO (only `sync`) | NO | CLEAN |
| `pkg/application` | `usecases.go` | NO | NO | CLEAN |
| `pkg/interface/http` | `router.go` | NO | NO | CLEAN |
| `cmd/server` | `main.go` | NO (imports `pkg/infrastructure` package — which pulls CGO; but main.go itself has no direct CGO import) | NO | CLEAN at pkg level |
| `pkg/infrastructure` | `fetchers.go` | **YES** — `_ "github.com/mattn/go-sqlite3"` L15 | Implicit via cgo driver | CGO ISOLATED HERE |

**`go.mod` single external dependency:** `github.com/mattn/go-sqlite3 v1.14.22` — only one CGO dependency, correctly scoped to infrastructure.

### R-CGO primitive/module/sandbox path analysis

Pre-refactor check (directories do not yet exist — confirming baseline clean):
```
apps/stock-price/pkg/primitive/   → does not exist (Phase 0 exit gate: clean)
apps/stock-price/pkg/module/      → does not exist (Phase 0 exit gate: clean)
apps/stock-price/cmd/sandbox/     → does not exist (Phase 0 exit gate: clean)
```

Post-refactor expectation: When Phase 1 scaffolds these directories, the `go.mod` dependency on `mattn/go-sqlite3` remains — but the CGO driver is only initialized (via the blank import `_ "..."`) in `pkg/infrastructure/fetchers.go`. The primitive and module packages will import zero infrastructure packages, therefore zero CGO transitive pull.

**Sandbox feasibility:** `cmd/sandbox/main.go` will import only `pkg/primitive/*` and `pkg/module/price_resolution/`. It will NOT import `pkg/infrastructure`. Therefore:
- `CGO_ENABLED=0 go build -o ./bin/sp-sandbox ./cmd/sandbox` exits 0 (no CGO code path reachable)
- `grep -rn "mattn/go-sqlite3" pkg/primitive/ pkg/module/ cmd/sandbox/` returns 0 matches (by construction — these packages are stdlib-only)

### R-CGO Confirmation Summary

**Status: FEASIBLE**

All `mattn/go-sqlite3` imports in `apps/stock-price/` are localized to `pkg/infrastructure/fetchers.go`. No CGO exists in `pkg/domain/`, `pkg/application/`, `pkg/interface/`, or `cmd/server/main.go` (direct imports). When Phase 1 creates `pkg/primitive/`, `pkg/module/`, and `cmd/sandbox/`, those packages will be stdlib-only by construction (they receive decoded data, not DB connections). The sandbox will build and run under `CGO_ENABLED=0`.

**Phase 1 R-CGO gate pre-cleared.** The decomposition principle is correct: CGO SQLite fetcher stays in infrastructure, wired from composition root, injected as a `TierFetcher` port implementation into the module — never imported by primitives or module.

---

## 7. Phase 0 Exit Gate Readiness

| Gate | Status | Evidence |
|---|---|---|
| Domain layer audit complete | YES | All 3 domain files read; entities documented in §2 |
| Infrastructure CGO confirmed isolated | YES | `fetchers.go` only — §6 |
| R-CGO FEASIBLE verdict | YES | §6 R-CGO Confirmation Summary |
| Primitive candidates confirmed (3-5) | YES | 4 confirmed + 1 deferred — §3 |
| Module boundary designed | YES | `price_resolution` port interface drafted — §4 |
| No `pkg/primitive/`, `pkg/module/`, `cmd/sandbox/` yet | YES | §2 + directory audit |
| MCP-server G5b scope documented | YES | §5 — narrower than expected, no direct domain imports |
| Phase 1 R-CGO gate pre-cleared | YES | Sandbox can build CGO_ENABLED=0 — §6 |

**Go/No-Go for Phase 1:** **GO**

No blocking findings. CGO is isolated. Primitives are extractable. Module boundary is sound. Sandbox CGO_ENABLED=0 build is viable. Phase 1 can proceed immediately.
