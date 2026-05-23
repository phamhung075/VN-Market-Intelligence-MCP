---
title: "P0 Brownfield Inventory — macro-indicators"
date: "2026-05-23"
author: "architect (cycle-29 phase-0)"
pilot: "macro-indicators"
charter_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md"
phase: 0
deliverable: "PHASE0-D1"
---

# P0 Brownfield Inventory — `apps/macro-indicators/`

Scope: full brownfield scan of the existing TypeScript microservice prior to Go rewrite. No Go files exist yet (`apps/macro-indicators/pkg/` = absent = Phase 0 exit gate confirmed clean).

---

## 1. Source Files — LOC + DDD Layer Mapping

### Core source (`src/`)

| File | LOC | DDD Layer | Status |
|---|---|---|---|
| `src/domain/models.ts` | 49 | **domain** — value objects | CLEAN — pure types, zero infra imports |
| `src/domain/repositories.ts` | 153 | **domain** — port interfaces | CLEAN — all interfaces, no implementation |
| `src/domain/defaults.ts` | 42 | **domain** — default values | CLEAN — pure constants |
| `src/domain/services.ts` | 101 | **domain** — domain service | **RISK** — `scoreIndicator()` uses `Math.random()` for score (non-deterministic pure function — see §5 risks) |
| `src/application/dtos.ts` | 18 | **application** — DTOs | CLEAN |
| `src/application/usecases.ts` | 22 | **application** — use case | CLEAN — `ComputeMacroUseCase.execute()` delegates entirely to `MacroScoreService.buildSnapshot()` |
| `src/application/fetch-external-macro.ts` | 244 | **application** — use case | CLEAN structurally; imports 6 infra adapters via ports |
| `src/application/fetch-international-macro.ts` | 44 | **application** — use case | CLEAN |
| `src/infrastructure/repositories.ts` | 87 | **infrastructure** — adapters | CLEAN — `HTTPCommodityFetcher` + `SQLiteMacroRepository` |
| `src/interface/handlers.ts` | 95 | **interface** — HTTP handlers | CLEAN — Hono router, no domain bypass |
| `src/index.ts` | 79 | **composition root** | PARTIALLY CLEAN — wiring only except `fred.isAvailable()` guard + `console.warn` (acceptable; not business logic) |

**Subtotal source LOC: 934**

### Scrapers (`src/infrastructure/scrapers/`)

| File | LOC | Status |
|---|---|---|
| `scrapers/world-bank-macro.ts` | 118 | LIVE — World Bank Open Data API (header-rotation) |
| `scrapers/yahoo-finance-fx-indices.ts` | 107 | LIVE — Yahoo Finance v8 chart API (header-rotation) |
| `scrapers/cnbc-world-markets.ts` | 113 | LIVE — CNBC quote API (header-rotation) |
| `scrapers/trading-economics-vn.ts` | 113 | LIVE — TradingEconomics schema.org scrape (header-rotation) |
| `scrapers/fred-macro.ts` | 120 | LIVE — FRED API (requires `FRED_API_KEY`; graceful-degrade if absent) |
| `scrapers/imf-weo.ts` | 182 | LIVE — IMF api.imf.org SDMX 3.0 |
| `scrapers/adb-kidb.ts` | 190 | LIVE — ADB KIDB SDMX v4 direct API |
| `scrapers/investing-economic-calendar.ts` | 59 | **WONTFIX** (2026-05-18) — NullCalendarAdapter. Cloudflare Turnstile v2 permanently blocked. Returns `[]` immediately. Zero cost. |

**Subtotal scraper LOC: 1 002**

**Total LOC: 1 936**

---

## 2. External Scrapers Status

| Scraper | Adapter | Status | Notes |
|---|---|---|---|
| World Bank Open Data | `WorldBankMacroAdapter` | LIVE | Public REST API; `fetchVnMacroBatch()` pulls 6 VN indicators |
| Yahoo Finance v8 | `YahooFxIndicesAdapter` | LIVE | FX rates + global indices; ~5MB/call |
| CNBC World Markets | `CnbcWorldMarketsAdapter` | LIVE | Global index quotes; ~5MB/call |
| Trading Economics VN | `TradingEconomicsVnAdapter` | LIVE | schema.org JSON-LD scrape; ~5MB/call; 65s timeout budget |
| FRED (St. Louis Fed) | `FredMacroAdapter` | LIVE (keyed) | US macro series; requires `FRED_API_KEY`; graceful-degrade if absent |
| IMF WEO | `ImfWeoAdapter` | LIVE | SDMX 3.0 `api.imf.org`; ~5MB/call |
| ADB KIDB | `AdbKidbAdapter` | LIVE | SDMX v4 `api.adb.org`; ~15MB/call |
| Investing.com calendar | `NullCalendarAdapter` | **WONTFIX** | CF Turnstile permanently blocked (2026-05-18). Null stub. |

**8 scrapers, 7 live (1 WONTFIX null-stub). Go rewrite decision: see §6.**

---

## 3. Existing MCP Tool Callers

The 7 tools named in the dispatch signal are NOT HTTP-calling the macro-indicators microservice. They are implemented as **direct domain calls within mcp-server**. This is the core G5 gap.

| MCP Tool | Caller File | Implementation Mode | G5 Action Required |
|---|---|---|---|
| `get_macro_snapshot` | `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` | Direct import of `fetchYahooFinancePrices`, `fetchSbvRates` infra fetchers + `computeCarryTradeSignal` domain | Rewire to HTTP POST `http://macro-indicators:5004/snapshot` after Go service ships |
| `get_macro_calendar` | `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts` | Direct DB reads + domain service | Rewire to HTTP after Go service ships |
| `get_carry_trade_signal` | `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts` | Direct domain: `computeCarryTradeSignal()` | Rewire to HTTP after Go service ships |
| `get_yield_spread_signal` | `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts` | Direct DB reads + domain: `computeYieldSpreadSignal()` | Rewire to HTTP after Go service ships |
| `get_imf_signals` | `apps/mcp-server/src/interface/mcp/tools/macro/imfSignals.ts` | Direct call to macro-indicators HTTP (`/external/international`) on port 5004 | Already HTTP — verify port 5004 route after Go service ships |
| `get_fed_liquidity_signal` | `apps/mcp-server/src/interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts` | TBD — needs separate scan | Rewire audit needed |
| `get_credit_flow_signal` | `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts` | Direct domain/DB call (sector boundary) | Rewire audit needed |

**Key architectural finding:** `get_macro_snapshot`, `get_carry_trade_signal`, `get_yield_spread_signal`, `get_macro_calendar` are NOT routing through the macro-indicators microservice HTTP layer at all — they call domain logic directly from within mcp-server. This is a DDD violation (interface layer in mcp-server importing domain services from macro-indicators domain) that G5b is designed to fix.

**Macro tool files in mcp-server (scope of G5b):**
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/imfSignals.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/investmentClockTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts`

---

## 4. Tests Inventory

### Unit tests (`__tests__/unit/`)

| File | Coverage target |
|---|---|
| `domain-defaults.test.ts` | `src/domain/defaults.ts` |
| `fetch-external-macro.test.ts` | `src/application/fetch-external-macro.ts` |
| `macro-score-service.test.ts` | `src/domain/services.ts` — MacroScoreService |
| `scrapers/adb-kidb.test.ts` | `src/infrastructure/scrapers/adb-kidb.ts` |
| `scrapers/cnbc-world-markets.test.ts` | `src/infrastructure/scrapers/cnbc-world-markets.ts` |
| `scrapers/flaresolverr-helper.test.ts` | FlareSolverr helper (wontfix zone; test kept as regression guard) |
| `scrapers/fred-macro.test.ts` | `src/infrastructure/scrapers/fred-macro.ts` |
| `scrapers/imf-weo.test.ts` | `src/infrastructure/scrapers/imf-weo.ts` |
| `scrapers/investing-economic-calendar.test.ts` | WONTFIX null stub |
| `scrapers/trading-economics-vn.test.ts` | `src/infrastructure/scrapers/trading-economics-vn.ts` |
| `scrapers/world-bank-macro.test.ts` | `src/infrastructure/scrapers/world-bank-macro.ts` |
| `scrapers/yahoo-finance-fx-indices.test.ts` | `src/infrastructure/scrapers/yahoo-finance-fx-indices.ts` |

**12 unit test files.**

### Integration tests (`__tests__/integration/`)

| File | Coverage target |
|---|---|
| `compute-macro-usecase.test.ts` | `ComputeMacroUseCase` end-to-end |
| `scrapers/external-macro-live.test.ts` | Live scraper calls — skipped in CI |

**2 integration test files.**

**Total test files: 14**

---

## 5. DDD Layer Assessment

| Layer | Files | Status | Notes |
|---|---|---|---|
| **domain/** | models.ts, repositories.ts, defaults.ts, services.ts | MOSTLY CLEAN | `scoreIndicator()` uses `Math.random()` — non-deterministic (see §5 risks) |
| **application/** | usecases.ts, dtos.ts, fetch-external-macro.ts, fetch-international-macro.ts | CLEAN | Imports domain + infra via ports only |
| **infrastructure/** | repositories.ts + 8 scrapers | CLEAN | All implement domain ports |
| **interface/** | handlers.ts | CLEAN | Hono router delegates to use cases only |
| **composition root** | index.ts | PARTIALLY CLEAN | `fred.isAvailable()` check + `console.warn` are acceptable infra-guard patterns |

**Golden rule check:** `domain/` has zero imports from `infrastructure/` — CONFIRMED CLEAN.

---

## 6. Risk Flags

### R-1 — `scoreIndicator()` uses `Math.random()` (MEDIUM)
`MacroScoreService.scoreIndicator()` returns `score: 8 + Math.floor(Math.random() * 3)` for VN tier. This is non-deterministic — the same indicator name returns different scores on different calls. Non-deterministic domain logic cannot be tested with stable scenario JSON. **Go rewrite must replace `Math.random()` with deterministic scoring logic** (e.g., fixed lookup table per tier, or stable hash). This affects `macro-investment-clock` primitive directly.

### R-2 — 8 scrapers have live external data dependency (HIGH for sandbox)
The sandbox process (G7 §Security Clause) must NEVER call live scrapers. Go primitive extraction must isolate all scraper I/O behind ports. Scenario JSON files must freeze representative data snapshots for each primitive. FRED_API_KEY must not leak into sandbox env (charter §Security Clause explicitly names this key).

### R-3 — `get_macro_snapshot` domain bypass is a DDD violation in mcp-server (HIGH)
`macroTools.ts` imports `fetchYahooFinancePrices` and `fetchSbvRates` directly from mcp-server's own infra fetchers — not from the macro-indicators microservice. This means the current MCP tool is NOT using the macro-indicators service at all for its core data. G5b rewire is more extensive than a simple HTTP swap: it requires dev-macro-indicators to expose equivalent Go endpoints for all 4 directly-calling tools.

### R-4 — Trading Economics 65s timeout blocks the compose cycle (MEDIUM)
`idleTimeout: 90` in index.ts exists specifically to allow TE's 65s worst-case. The Go service at port 5004 must preserve this timeout budget or provide an equivalent async pattern.

### R-5 — Composition root LOC is acceptable (LOW)
`src/index.ts` is 79 LOC, within G3 spirit. The Go equivalent `cmd/server/main.go` should target ≤80 lines (same as TA pilot per architect spec §6 OQ-3). The macro service has 3 use cases vs TA's 1, so 80 lines is a tighter constraint — architect recommends ≤100 lines for macro given the additional wiring.

---

## 7. Primitive Extraction Recommendations (G1 Candidate List Refinement)

Charter §G1 lists 9 candidates. Architect selects **6 primitives** for this pilot (5 minimum per charter; 7 maximum; 6 chosen to avoid scope creep while exceeding minimum):

| # | Primitive Name | Go Package Path | Source in TS | Rationale |
|---|---|---|---|---|
| 1 | `macro-investment-clock` | `pkg/primitive/macro_investment_clock/` | `MacroScoreService.scoreIndicator()` (deterministic rewrite) + regime phase logic | First primitive (simplest independent calc after removing Math.random) |
| 2 | `macro-oil-impact-classifier` | `pkg/primitive/macro_oil_impact_classifier/` | `MacroScoreService.oilDirection()` | Pure function, 3-state output (BULLISH/BEARISH/NEUTRAL), trivially testable |
| 3 | `macro-gold-direction-classifier` | `pkg/primitive/macro_gold_direction_classifier/` | `MacroScoreService.goldDirection()` | Same shape as oil classifier — fast to extract |
| 4 | `macro-usdvnd-direction-classifier` | `pkg/primitive/macro_usdvnd_direction_classifier/` | `MacroScoreService.usdVndDirection()` | Same shape as oil/gold classifiers |
| 5 | `macro-carry-trade-signal` | `pkg/primitive/macro_carry_trade_signal/` | `computeCarryTradeSignal()` in mcp-server domain (to be unified in Go service) | Used by MCP tool — good rewire target |
| 6 | `macro-yield-spread-signal` | `pkg/primitive/macro_yield_spread_signal/` | `computeYieldSpreadSignal()` in mcp-server domain | Same reasoning as carry-trade |

**Deferred to post-pilot:**
- `macro-fed-liquidity-spread` — depends on FRED data; complex external key management for sandbox
- `macro-ism-regime-signal` — ISM is US-only; lower VN market relevance
- `macro-pyramid-tier` — abstract tier concept; needs more design work

**Module recommendation (G2):** Pilot ONE module only — `macro-signals` — composing primitives 1–6. Defer `macro-core` (World Bank, FRED, IMF, ADB data aggregation) to post-pilot. This matches charter §G2 calibration paragraph.

---

## 8. Go Service Layout (Macro-Specific)

Follows TA pilot's `pkg/` convention per p0-4-composition-root-plan-go.md §2 layout decision. Macro-specific additions:

```
apps/macro-indicators/
├── cmd/
│   ├── server/
│   │   └── main.go          # Composition root — port 5004
│   └── sandbox/
│       └── main.go          # Sandbox runner (clone TA pattern)
├── pkg/
│   ├── domain/
│   │   ├── models.go        # MacroSnapshot, PriceSignal, SignalDirection
│   │   └── ports.go         # CommodityFetcherPort, SBVRatePort interfaces
│   ├── application/
│   │   ├── dtos.go          # MacroSnapshotRequest, MacroSnapshotResponse
│   │   └── usecases.go      # ComputeMacroUseCase.Execute()
│   ├── infrastructure/
│   │   └── repositories.go  # HTTPCommodityFetcher (Go), SQLiteMacroRepository
│   ├── interface/
│   │   └── http/
│   │       └── router.go    # chi router: GET /health, POST /snapshot
│   ├── primitive/
│   │   ├── macro_investment_clock/
│   │   ├── macro_oil_impact_classifier/
│   │   ├── macro_gold_direction_classifier/
│   │   ├── macro_usdvnd_direction_classifier/
│   │   ├── macro_carry_trade_signal/
│   │   └── macro_yield_spread_signal/
│   └── module/
│       └── macro_signals/   # Composes 6 primitives via ports
├── api/
│   └── openapi.yaml         # HTTP contract
├── dashboard/
│   └── index.html           # Three-level dashboard (Phase 1 stub → Phase 2 full)
├── go.mod                   # Module: github.com/vn-market-intelligence/macro-indicators
├── go.sum
└── Dockerfile               # Multi-stage: golang:1.22-alpine + alpine:3.20 — CGO_ENABLED=0
```

**Port 5004** — unchanged from existing TS service. No docker-compose.yml port change needed.

**Dependency choices (following TA precedent):**
- `github.com/go-chi/chi/v5 v5.2.1` — matches alert-engine + TA
- `modernc.org/sqlite` — pure-Go, no CGO (same as TA; macro-indicators reads market.db readonly)

**go.mod module path:** `github.com/vn-market-intelligence/macro-indicators`

---

## 9. Scraper Strategy for Phase 1/2

The 7 live TS scrapers create an architectural decision for the Go pilot:

**Architect recommendation: Option A — keep TS scrapers running as a sidecar service in Phase 1; port the 2 core primitives (carry-trade + yield-spread) to Go with fixture-based data. Port remaining scrapers to Go in Phase 2 (P2-B bucket).**

Rationale:
- Phase 1 scope is first primitive only (`macro-investment-clock`). That primitive uses no live scraper data — it is a deterministic classification function.
- Primitives 2-4 (oil/gold/usdvnd direction classifiers) also use no scraper data — pure math with threshold lookup.
- Primitives 5-6 (carry-trade, yield-spread) do use SBV data — but can run against fixture JSON in sandbox.
- Live scraper integration is a Phase 2 concern. Option A avoids premature scraper porting that blocks first primitive delivery.

This decision must be confirmed in the Phase 1 task plan (PHASE0-D5).

---

## 10. Phase 0 Exit Gate Verification

| Gate criterion | Status |
|---|---|
| All 5 deliverables landed (signal trail) | PENDING (this scan = D1 complete) |
| `pilot-status-macro-indicators.json` Phase 0 fields populated | PENDING (architect fills brownfield link in D5) |
| No code in `apps/macro-indicators/pkg/` yet | CONFIRMED — directory absent |
| Go module file absent | CONFIRMED — `go.mod` absent |

---

**Scan complete. 6 primitives selected. 1 module recommended (`macro-signals`). R-1 `Math.random()` is the highest-impact pre-rewrite finding — must be addressed in Phase 1 primitive extraction.**
