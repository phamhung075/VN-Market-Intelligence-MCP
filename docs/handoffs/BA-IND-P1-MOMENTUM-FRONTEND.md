---
task_id: BA-IND-P1-MOMENTUM-FRONTEND
sprint: MARKET-INDICATOR-DEPTH-P0
authored_by: ba
date: 2026-06-30T04:37Z
status: READY_FOR_ARCHITECT
zone: multi
next_agent: architect
---

# BA Spec — P1 Momentum Indicators Frontend Surface

## Context

Four P1 momentum tools are **LIVE-callable** and **qa-APPROVED** as of 2026-06-30:
- `get_roc_momentum` (tool #181) — `apps/technical-analysis` zone
- `get_relative_strength` (tool #182) — `apps/technical-analysis` zone
- `get_52w_proximity` (tool #183) — `apps/technical-analysis` zone
- `get_foreign_accum_rank` (tool #184) — `apps/stock-price` zone

**Gap confirmed:** 0 hits in `apps/frontend/app` for any of these identifiers (PO RAW-grep + router RAW-grep). The 5 P0 gauges are already LIVE at `/dashboard/indicator-gauges`. This sprint surfaces the 4 P1 tools on the dashboard for the user.

**User intent (verbatim):** "add to frontend new implement" — verbatim 2026-06-30.

**Zone boundary (CRITICAL for architect split):**
- Zone A — `apps/mcp-server`: REST aggregator `GET /api/momentum-indicators`
- Zone B — `apps/frontend`: proxy route + dashboard cards + TopNav + tests

---

## Deliverable A — `apps/mcp-server` Zone: REST Aggregator

### Reference Contract

Mirror `apps/mcp-server/src/interface/mcp/routes/indicatorGaugesHandler.ts` exactly.
The P0 endpoint is the canonical pattern for all P1 aggregators.

### FR-A1 — New REST handler `momentumIndicatorsHandler.ts`
**DDD layer: interface**
- File: `apps/mcp-server/src/interface/mcp/routes/momentumIndicatorsHandler.ts`
- Exports: `aggregateMomentumIndicators(deps)`, `handleGetMomentumIndicators(_req, res, db, deps)`
- Route registered in `server.ts`: `GET /api/momentum-indicators` (verbatim path — mirrors `GET /api/indicator-gauges` registration pattern at line 2157)
- Always returns **HTTP 200** — section failures degrade to null, never 5xx
- `generated_at` ISO timestamp ALWAYS present in response

### FR-A2 — Four-section isolation via `Promise.allSettled`
**DDD layer: application**
- Sources resolved in parallel; one rejection degrades ONLY that section to null
- `roc` section: call `computeROCMomentum({})` from `clients.ts`
- `relative_strength` section: call `computeRelativeStrength({})` from `clients.ts`
- `proximity_52w` section: call `compute52WProximity({})` from `clients.ts`
- `foreign_accum` section: call `computeForeignAccumRank({})` from `clients.ts`

**CRITICAL constraint:** REUSE the `clients.ts` data layer directly — NOT the MCP tool layer.
All four functions exist and are exported from `apps/mcp-server/src/infrastructure/microservices/clients.ts` (verified: lines 299, 352, 414, 467).

### FR-A3 — Honest-NULL passthrough per section
**DDD layer: domain**
Each section carries `null_reason: string | null`:
- `roc` section: `momentum_factor_z: null` when insufficient OHLCV history (<13 bars). `null_reason` synthesized from `computed_as_of` + historical note.
- `relative_strength` section: `market_rs_composite: null` when watchlist N < 5. `low_sample_warning` passthrough.
- `proximity_52w` section: `pct_above_ma200: null` when `denominator_ma200 = 0`. `null_reason` set when any aggregate field null.
- `foreign_accum` section: `foreign_accum_z_market: null` when < 5 tickers have ≥ 5 bars. `null_reason` from tool payload or synthesized.

**HARD rule:** NEVER fabricate or default-fill a null scalar. null + null_reason is the DESIGNED PASS STATE (OHLCV backfill still accruing; tools need 252/273 bars).

### FR-A4 — Response DTO shape `MomentumIndicatorsDto`
**DDD layer: interface**

```typescript
interface RocGauge {
  momentum_factor_z: number | null;
  computed_as_of: string;
  null_reason: string | null;
  source_tier: number;
}

interface RelativeStrengthGauge {
  market_rs_composite: number | null;
  low_sample_warning: boolean;
  computed_as_of: string;
  null_reason: string | null;
  source_tier: number;
}

interface Proximity52WGauge {
  net_new_highs: number;
  pct_above_ma50: number | null;
  pct_above_ma200: number | null;
  denominator_ma200: number;
  computed_as_of: string;
  null_reason: string | null;
  source_tier: number;
}

interface ForeignAccumGauge {
  foreign_accum_z_market: number | null;
  adtv_unit: string;
  computed_as_of: string;
  null_reason: string | null;
  source_tier: number;
}

interface MomentumIndicatorsDto {
  generated_at: string;
  error?: string;
  roc: RocGauge | null;
  relative_strength: RelativeStrengthGauge | null;
  proximity_52w: Proximity52WGauge | null;
  foreign_accum: ForeignAccumGauge | null;
}
```

**Source tier assignment:** all 4 sources route through TA service or stock-price service (compute-on-read from SQLite/service) → `source_tier = 3` (estimate/compute). Architect may refine if service guarantees differ.

### FR-A5 — Section builder functions (pure mapping, no IO)
**DDD layer: interface (projection only)**
- `buildRocSection(data: ComputeROCMomentumResponse): RocGauge`
  - Project: `momentum_factor_z`, `computed_as_of`
  - `null_reason` when `momentum_factor_z === null`: "Insufficient OHLCV history — momentum_factor_z requires ≥13 bars"
  - NEVER forward `tickers[]` — gauge response excludes per-ticker arrays
- `buildRelativeStrengthSection(data: ComputeRelativeStrengthResponse): RelativeStrengthGauge`
  - Project: `market_rs_composite`, `low_sample_warning`, `computed_as_of`
  - `null_reason` when `market_rs_composite === null`: "Watchlist too small — market_rs_composite requires N ≥ 5 tickers"
  - NEVER forward `tickers[]`
- `buildProximity52WSection(data: Compute52WProximityResponse): Proximity52WGauge`
  - Project: `net_new_highs`, `denominator_ma200` from top-level; `pct_above_ma50`, `pct_above_ma200` from `aggregate`
  - `null_reason` when `pct_above_ma200 === null`: "denominator_ma200 = 0 — no tickers have ≥200-bar OHLCV history"
  - NEVER forward `tickers[]`
- `buildForeignAccumSection(data: ComputeForeignAccumRankResponse): ForeignAccumGauge`
  - Project: `foreign_accum_z_market`, `adtv_unit`, `computed_as_of`
  - `null_reason` when `foreign_accum_z_market === null`: "Insufficient tickers with ≥5 days of flow data"
  - NEVER forward `tickers[]`

### FR-A6 — Dependency injection interface for testability
**DDD layer: interface**
```typescript
interface MomentumIndicatorsDeps {
  computeRoc?: () => Promise<ComputeROCMomentumResponse>;
  computeRS?: () => Promise<ComputeRelativeStrengthResponse>;
  compute52W?: () => Promise<Compute52WProximityResponse>;
  computeForeignAccum?: () => Promise<ComputeForeignAccumRankResponse>;
}
```
Production: all undefined → real `clients.ts` implementations.
Tests: inject stubs to avoid real TA service / stock-price service calls.

### FR-A7 — Catastrophic handler failure path
**DDD layer: interface**
Outer try/catch: if `aggregateMomentumIndicators` itself throws (not possible with `Promise.allSettled`, but defensive), return HTTP 200 with all-null sections + `error` field. Mirror line 451–463 of `indicatorGaugesHandler.ts`.

### FR-A8 — Bun test suite `apps/mcp-server/src/__tests__/`
**DDD layer: interface (test)**
- Test file pattern mirrors `ind-p1-frontend-gauge-cards.test.ts` structure
- Required test suites:
  - `aggregateMomentumIndicators — all 4 sections fulfilled → full DTO`
  - `aggregateMomentumIndicators — one rejected → that section null, others populated`
  - `aggregateMomentumIndicators — all rejected → all-null DTO, generated_at present`
  - `buildRocSection — momentum_factor_z null → null_reason set`
  - `buildRelativeStrengthSection — low_sample_warning passthrough`
  - `buildProximity52WSection — denominator_ma200=0 → null_reason set`
  - `buildForeignAccumSection — foreign_accum_z_market null → null_reason set`

---

## Deliverable B — `apps/frontend` Zone: Dashboard Cards

### Reference Contract

Mirror `apps/frontend/app/routes/dashboard.indicator-gauges.tsx` (P0 reference) and `apps/frontend/app/routes/api.indicator-gauges.tsx` (proxy reference) exactly.

### FR-B1 — Proxy route `api.momentum-indicators.tsx`
**DDD layer: interface**
- File: `apps/frontend/app/routes/api.momentum-indicators.tsx`
- Transparent proxy: `GET ${MCP_SERVER_BASE_URL}/api/momentum-indicators`
- Reuse `proxyUpstream` from `~/lib/api/fetchUtils` — identical to `api.indicator-gauges.tsx`
- `label`: `"api.momentum-indicators"`
- Only GET supported. 4xx/5xx from upstream forwarded as-is. Network failure → 502.
- No domain logic — pure proxy per DDD.

### FR-B2 — Dashboard page `dashboard.momentum.tsx`
**DDD layer: interface**
- File: `apps/frontend/app/routes/dashboard.momentum.tsx`
- Route: `/dashboard/momentum`
- Page title (meta): `"Động Lực Thị Trường — VN Market Intelligence"`
- `PageHeader` title: `"Động Lực Thị Trường P1"`, subtitle describes the 4 momentum scalars

**Loader pattern (mirror `dashboard.indicator-gauges.tsx`):**
- `fetchMomentumIndicators(origin: string): Promise<LoaderData>` — exported pure function for unit tests
- Uses `safeFetch<MomentumIndicatorsDto>` from `~/lib/api/fetchUtils`
- `parseMomentumIndicatorsDto(raw: unknown): MomentumIndicatorsDto` — exported pure parser, never throws
- Error → all-null sections + `error` string set (honest-NULL)

**Cards to render (4 total):**

| Card | Title (VN) | Subtitle | Key Scalar | Badge logic |
|---|---|---|---|---|
| ROC | "Đà Tăng Giá" | "Z-score động lượng thị trường (momentum_factor_z)" | `formatZScore(roc?.momentum_factor_z)` | z > 1.5 → TÍCH CỰC/green; z > 0.5 → TRUNG LẬP TÍCH CỰC/amber; z < -0.5 → TIÊU CỰC/red; null → gray |
| RS | "Sức Mạnh Tương Đối" | "Composite RS thị trường (market_rs_composite)" | `formatRSComposite(rs?.market_rs_composite)` | > 0 → STRONG/green; < 0 → WEAK/amber; null → gray |
| 52W | "Phân Bổ 52 Tuần" | "Số cổ phiếu tạo đỉnh ròng (net_new_highs)" | `rs?.proximity_52w?.net_new_highs?.toString() ?? "—"` | > 0 → Bứt phá/green; < 0 → Tích lũy/amber; = 0 → Trung lập/gray |
| FA | "Tích Lũy Khối Ngoại" | "Z-score tích lũy ADTV-normalized (foreign_accum_z_market)" | `formatZScore(fa?.foreign_accum_z_market)` | z < -1 → TÍCH LŨY MẠNH/green; z < 0 → TÍCH LŨY NHẸ/amber; z > 0 → PHÂN PHỐI/red; null → gray |

**Source-link per card (AC-3):** each card must show a collapsible detail dropdown (mirror `InfoCardExpand.tsx` pattern) containing:
- Source label: the MCP tool name (e.g. `get_roc_momentum`)
- Data service: `apps/technical-analysis` or `apps/stock-price`
- Computed as-of: `computed_as_of` field
- Null reason when applicable

**Freshness badge per card (AC-2):** `FreshnessBadge` with `slaTierKey="daily"` + `dataAsof={card.computed_as_of}`. Source SSOT = `frontend-data-coverage-map.json` — NEVER bake a timestamp or use `Date.now()`.

**Honest-NULL rendering:** null section → "Chưa có dữ liệu" gray badge. Null scalar within section → "—" em-dash. Null reason text shown when present.

**`useFreshnessRevalidator("daily")`** — identical to P0 gauge page.

**`GaugeCard` component reuse:** reuse the existing `GaugeCard` component from `dashboard.indicator-gauges.tsx` — do NOT duplicate it. If GaugeCard is not yet exported from that file, the architect must decide: export from shared component file vs inline (ARCH-RATIFY-M1).

### FR-B3 — TopNav entry
**DDD layer: interface**
- Add to `ANALYST_NAV` array in `apps/frontend/app/components/TopNav.tsx`:
  `{ to: "/dashboard/momentum", label: "Động Lực P1" }`
- Append after the existing `{ to: "/dashboard/indicator-gauges", label: "Chỉ Báo" }` entry (line 96)
- Route is immediately enabled (NOT comingSoon) since the route file is being shipped in this sprint

### FR-B4 — Coverage-map GAP rows (plan-only in this spec)
**DDD layer: infrastructure (SSOT update)**
Add 4 new rows to `docs/data/frontend-data-coverage-map.json` with `status: "GAP"` for:
1. `page: "/dashboard/momentum"`, `elem: "momentum_factor_z (roc gauge)"`, `endpoint: "/api/momentum-indicators → roc section"`, `writer: "get_roc_momentum → REST endpoint"`
2. `page: "/dashboard/momentum"`, `elem: "market_rs_composite (relative_strength gauge)"`, `endpoint: "/api/momentum-indicators → relative_strength section"`, `writer: "get_relative_strength → REST endpoint"`
3. `page: "/dashboard/momentum"`, `elem: "net_new_highs + pct_above_ma50/ma200 (proximity_52w gauge)"`, `endpoint: "/api/momentum-indicators → proximity_52w section"`, `writer: "get_52w_proximity → REST endpoint"`
4. `page: "/dashboard/momentum"`, `elem: "foreign_accum_z_market (foreign_accum gauge)"`, `endpoint: "/api/momentum-indicators → foreign_accum section"`, `writer: "get_foreign_accum_rank → REST endpoint"`

**GAP → LIVE transition:** dev flips each row to `status: "LIVE"` when the card renders real data. QA verifies before gate-close. NEVER pre-stamp as LIVE in this spec (AC-4).

### FR-B5 — Vitest unit tests `apps/frontend/app/__tests__/`
**DDD layer: interface (test)**
- Pure-logic test file (no jsdom) mirroring `ind-p1-frontend-gauge-cards.test.ts`
- Required suites:
  - `parseMomentumIndicatorsDto — null raw → all-null sections`
  - `parseMomentumIndicatorsDto — full valid DTO passes through`
  - `parseMomentumIndicatorsDto — partial DTO (sections null) → honest-NULL forwarded`
  - `parseMomentumIndicatorsDto — invalid non-object → graceful fallback`
  - `formatZScore — positive / negative / zero / null` (reuse helper, import from gauge page or shared util)
  - `formatRSComposite — positive / negative / zero / null → Vietnamese labels`
  - `fetchMomentumIndicators — happy path (mocked fetch)`
  - `fetchMomentumIndicators — upstream 502 → all-null + error set`
  - `fetchMomentumIndicators — network failure → all-null + error set`
  - `fetchMomentumIndicators — null sections → honest-NULL forwarded`

### FR-B6 — TopNav test
**DDD layer: interface (test)**
- Add to existing `apps/frontend/app/__tests__/ind-p1-indicator-gauges-nav.test.tsx` or create new `ind-p1-momentum-nav.test.tsx`
- Verify `ANALYST_NAV` contains `{ to: "/dashboard/momentum", label: "Động Lực P1" }`

---

## NFR Contracts

| NFR | Requirement |
|---|---|
| NFR-1 ALWAYS-200 | `GET /api/momentum-indicators` returns HTTP 200 in all cases including catastrophic handler failure |
| NFR-2 HONEST-NULL | null + null_reason per section; NEVER fabricate or default-fill; null is DESIGNED PASS STATE |
| NFR-3 SECTION-ISOLATION | Promise.allSettled — one upstream failure degrades ONLY that section |
| NFR-4 FRESHNESS-SSOT | FreshnessBadge.dataAsof sourced from `computed_as_of` in each section; SSOT = frontend-data-coverage-map.json; never baked/client-now |
| NFR-5 SOURCE-LINK | Every card carries source-link + expandable detail dropdown per project_all_info_source_link_dropdown_recheck |
| NFR-6 NO-TICKER-ARRAYS | Section builders project only market-aggregate scalars; NEVER forward `.tickers[]` per-ticker arrays |
| NFR-7 TSC-CLEAN | `tsc --noEmit` exits 0 across both zones before gate-close |
| NFR-8 MOCK-GUARD | No real service URLs in test files (mock-guard PASS) |
| NFR-9 CLIENTS-TS-ONLY | Handler imports ONLY from `clients.ts` for data layer — NOT from MCP tool handlers |

---

## Acceptance Criteria

- **AC-1 NO-FAKE-DATA:** All 4 sections honest-NULL when data unavailable. null_reason present. NEVER default-fill. QA verifies by inspecting raw JSON from `/api/momentum-indicators`.
- **AC-2 FRESHNESS:** Each of the 4 cards shows "Cập nhật lúc \<time\>" from `computed_as_of` field; SSOT = frontend-data-coverage-map.json. FreshnessBadge component sourced from same coverage-map slot as the card.
- **AC-3 SOURCE-LINK+DROPDOWN:** Every card carries source-link (tool name) + collapsible detail dropdown (service + computed_as_of + null_reason when applicable).
- **AC-4 COVERAGE-MAP-GAP:** 4 new coverage-map rows present with `status: "GAP"` pre-ship; flipped to `status: "LIVE"` at QA gate after dev ships.
- **AC-5 REST-200+ISOLATION:** GET /api/momentum-indicators returns 200 always; Promise.allSettled confirmed; any single-section failure leaves others populated.
- **AC-6 TESTS-GREEN:** vitest (frontend) + bun test (mcp-server) PASS; tsc 0 errors; mock-guard PASS.

---

## DDD Layer Map

| Requirement | Zone | DDD Layer | File (target) |
|---|---|---|---|
| FR-A1 REST handler | dev-mcp-server | interface | `apps/mcp-server/src/interface/mcp/routes/momentumIndicatorsHandler.ts` |
| FR-A2 Promise.allSettled | dev-mcp-server | application | inside `momentumIndicatorsHandler.ts` |
| FR-A3 honest-NULL | dev-mcp-server | domain rule | `momentumIndicatorsHandler.ts` buildSection fns |
| FR-A4 DTO types | dev-mcp-server | interface | `momentumIndicatorsHandler.ts` exports |
| FR-A5 section builders | dev-mcp-server | interface (projection) | `momentumIndicatorsHandler.ts` |
| FR-A6 DI interface | dev-mcp-server | interface | `momentumIndicatorsHandler.ts` |
| FR-A7 catastrophic handler | dev-mcp-server | interface | `momentumIndicatorsHandler.ts` |
| FR-A8 tests | dev-mcp-server | interface | `apps/mcp-server/src/__tests__/momentum-indicators.test.ts` |
| FR-A-REG server.ts route | dev-mcp-server | interface | `apps/mcp-server/src/interface/mcp/server.ts` (append after indicator-gauges route) |
| FR-B1 proxy route | dev-frontend | interface | `apps/frontend/app/routes/api.momentum-indicators.tsx` |
| FR-B2 dashboard page | dev-frontend | interface | `apps/frontend/app/routes/dashboard.momentum.tsx` |
| FR-B3 TopNav entry | dev-frontend | interface | `apps/frontend/app/components/TopNav.tsx` |
| FR-B4 coverage-map GAP | dev-frontend | infrastructure (SSOT) | `docs/data/frontend-data-coverage-map.json` |
| FR-B5 vitest tests | dev-frontend | interface | `apps/frontend/app/__tests__/ind-p1-momentum-cards.test.ts` |
| FR-B6 TopNav test | dev-frontend | interface | `apps/frontend/app/__tests__/ind-p1-momentum-nav.test.tsx` |

---

## Zone Boundary (for architect SPLIT)

**Zone A — dev-mcp-server** (standalone, no frontend dependency):
- `momentumIndicatorsHandler.ts` + server.ts registration + bun test
- Dependency: `clients.ts` (exists, no change needed), `server.ts` (append only)
- Can ship independently; frontend zone depends on the REST endpoint being available

**Zone B — dev-frontend** (depends on Zone A REST contract):
- `api.momentum-indicators.tsx` + `dashboard.momentum.tsx` + TopNav update + vitest tests + coverage-map GAP rows
- Dependency: MCP_SERVER_BASE_URL env var (already wired for indicator-gauges), proxyUpstream (exists), safeFetch (exists), FreshnessBadge (exists), GaugeCard (exists in gauge page — see ARCH-RATIFY-M1)

**Zone A → Zone B interface:** `MomentumIndicatorsDto` shape defined in FR-A4 above. Frontend types mirror the server DTO field-for-field (same pattern as `IndicatorGaugesDto`).

---

## Blockers

**Zero PO-blocking questions.** PO explicitly confirmed all design decisions in Decision 3 (docs/agent-memory/decisions/sprint-IND-P1-MOMENTUM-CONSUMER-WIRING-NEXTWAVE-po.md).

---

## Architect Ratification Items (non-blocking, architect decides)

**ARCH-RATIFY-M1 — GaugeCard sharing strategy:**
- Option A: Export `GaugeCard` from `dashboard.indicator-gauges.tsx` and import in `dashboard.momentum.tsx`
- Option B: Extract `GaugeCard` to a shared component (`~/components/GaugeCard.tsx`) and import in both
- Option C: Inline a separate `MomentumGaugeCard` in `dashboard.momentum.tsx` (avoids coupling)
- BA recommendation: Option B (reusability > minimal coupling at this scale). Option A risks coupling dashboard pages to each other. Option C is safest if architect prefers isolation.

**ARCH-RATIFY-M2 — `formatRSComposite` helper location:**
- Needed: format `market_rs_composite` (float, positive/negative polarity → VN label)
- Option A: Export from `dashboard.momentum.tsx` (consistent with `formatZScore` export from gauge page)
- Option B: Add to shared util alongside `formatZScore`
- BA recommendation: Option A for now (parallel to P0 pattern); architect may consolidate later.

**ARCH-RATIFY-M3 — source_tier assignment for TA service responses:**
- `computeROCMomentum`, `computeRelativeStrength`, `compute52WProximity` all route through `apps/technical-analysis` (Go service, compute-on-read from SQLite)
- `computeForeignAccumRank` routes through `apps/stock-price` (Go service)
- No `source_tier` field exists in any of the 4 client response types
- BA assigns `source_tier = 3` (estimate/compute, no live external fetch) for all 4
- Architect should confirm this is correct or override.

**ARCH-RATIFY-M4 — `low_sample_warning` passthrough for RS section:**
- `ComputeRelativeStrengthResponse.low_sample_warning: boolean` is always present
- BA includes it in `RelativeStrengthGauge` DTO for transparency
- Architect confirms whether frontend should surface this as a badge modifier or suppress it

---

## Edge Cases

### VN Data Quality

| Case | Tool | Behavior |
|---|---|---|
| OHLCV accruing (<13 bars for ROC) | `get_roc_momentum` | `momentum_factor_z: null`, `null_reason: "Insufficient OHLCV history"` |
| ROC watchlist N < 5 for cross-sectional z | `get_roc_momentum` | `momentum_factor_z: null`, `null_reason: "Insufficient tickers for cross-sectional z"` |
| RS watchlist N < 5 | `get_relative_strength` | `market_rs_composite: null`, `low_sample_warning: true` |
| 52W no tickers with 200-bar history | `get_52w_proximity` | `pct_above_ma200: null`, `denominator_ma200: 0`, `null_reason: "denominator_ma200 = 0"` |
| Foreign accum < 5 tickers with ≥5 flow bars | `get_foreign_accum_rank` | `foreign_accum_z_market: null`, `null_reason: "Insufficient ticker flow data"` |
| TA service down / timeout | all 3 TA tools | section = null (Promise.allSettled rejection) |
| Stock-price service down / timeout | foreign_accum tool | section = null (Promise.allSettled rejection) |
| All 4 services unavailable | all sections | all-null DTO, `generated_at` present, no 5xx |

### Missing Data
- If `computed_as_of` is absent in a client response: derive from `new Date().toISOString().slice(0, 10)` (mirror `buildVolatilitySection` asof pattern in P0 handler)
- Null `adtv_unit` in ForeignAccumRankResponse: default to `"ADTV-normalized"` (defensive, ARCH-RATIFY-M3 scope)

### Locale & Language
- All card text: plain Vietnamese (non-technical user)
- Labels: no abbreviations without full-form expansion in subtitle
- `computed_as_of` displayed as locale date string in detail dropdown

---

## Sequencing Dependencies

```
Zone A (dev-mcp-server):
  clients.ts [EXISTS, no change] → momentumIndicatorsHandler.ts → server.ts registration → bun test

Zone B (dev-frontend):
  api.momentum-indicators.tsx → dashboard.momentum.tsx → TopNav.tsx → vitest tests
  coverage-map GAP rows (can be done in parallel with code)

Zone A → Zone B:
  MomentumIndicatorsDto contract defined in FR-A4 is the shared boundary.
  Frontend can develop against the contract before Zone A ships (mock fetch in tests).
  Production deployment requires Zone A endpoint live at :3000 before frontend card renders real data.
```

---

## Precedents Applied

| Pattern | Source | Applied in |
|---|---|---|
| REST aggregator handler | `indicatorGaugesHandler.ts` | FR-A1 through FR-A7 |
| Promise.allSettled section isolation | `aggregateIndicatorGauges()` | FR-A2 |
| Honest-NULL null_reason | `buildBreadthSection()` | FR-A3 |
| DTO type mirror between server/frontend | `IndicatorGaugesDto` | FR-A4 / FR-B2 |
| Proxy route via `proxyUpstream` | `api.indicator-gauges.tsx` | FR-B1 |
| `GaugeCard` component | `dashboard.indicator-gauges.tsx` | FR-B2 |
| `FreshnessBadge` + `useFreshnessRevalidator` | `dashboard.indicator-gauges.tsx` | FR-B2 |
| coverage-map GAP rows (plan-only) | PO Decision 3 AC-4 | FR-B4 |
| TopNav ANALYST_NAV append | `TopNav.tsx` line 96 | FR-B3 |
| Pure-logic test file (no jsdom) | `ind-p1-frontend-gauge-cards.test.ts` | FR-B5 |

---

## [Architect] Brownfield Findings

**Produced:** 2026-06-30T05:30Z | **Sprint:** MARKET-INDICATOR-DEPTH-P0 | **Task:** BA-IND-P1-MOMENTUM-FRONTEND
**BUILD-STANDARD:** lean (both zones brownfield — mcp-server and frontend exist, no new microservice)

---

### Zone

- **Zone A:** `apps/mcp-server/` — new REST handler + server.ts registration + bun tests
- **Zone B:** `apps/frontend/` — proxy route + dashboard page + TopNav + vitest tests + coverage-map rows
- **Flag for PM:** SPLIT required — Zone A and Zone B are independent deliverables. Zone B depends on Zone A's DTO contract (not Zone A's deployment). Both zones can be developed in parallel against the `MomentumIndicatorsDto` contract.

---

### Verified Paths

**Zone A — apps/mcp-server:**

- `apps/mcp-server/src/interface/mcp/routes/indicatorGaugesHandler.ts` (465L) — P0 reference, fully verified. Pattern: DTO types → DI interface → section builders (pure) → aggregator (`Promise.allSettled`) → HTTP handler. Exact mirror target for P1 handler.
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — 4 P1 client functions verified at declared lines:
  - L299: `computeROCMomentum({})` → `ComputeROCMomentumResponse` (`momentum_factor_z: number | null`, `computed_as_of: string`, `tickers[]` — NEVER forward)
  - L352: `computeRelativeStrength({})` → `ComputeRelativeStrengthResponse` (`market_rs_composite: number | null`, `low_sample_warning: boolean`, `computed_as_of: string`, `tickers[]` — NEVER forward)
  - L414: `compute52WProximity({})` → `Compute52WProximityResponse` (`aggregate: ProximityAggregate` with `pct_above_ma50`, `pct_above_ma200`, `denominator_ma200`; top-level `net_new_highs`, `denominator_ma200`, `computed_as_of`; `tickers[]` — NEVER forward)
  - L467: `computeForeignAccumRank({})` → `ComputeForeignAccumRankResponse` (`foreign_accum_z_market: number | null`, `adtv_unit: string`, `computed_as_of: string`, `tickers[]` — NEVER forward)
- `apps/mcp-server/src/interface/mcp/server.ts` — indicator-gauges route registered at L2157. P1 route appends immediately after L2160 (`return;`), before L2162 (`// TASK-17 P2-1a`).
- **CRITICAL DIVERGENCE from P0:** `aggregateIndicatorGauges(db, deps)` requires `db: Database` for local SQLite sources (sentiment, breadth, foreign_room). `aggregateMomentumIndicators(deps)` does NOT need `db` — all 4 P1 sources are remote HTTP calls (TA service + stock-price service). Server.ts registration: `await handleGetMomentumIndicators(req, res)` (no `db` param).

**Zone B — apps/frontend:**

- `apps/frontend/app/routes/api.indicator-gauges.tsx` (55L) — proxy pattern verified: `proxyUpstream(upstream, { method: "GET", headers: … }, { label: "…" })`. Mirror exactly with `api.momentum-indicators.tsx`.
- `apps/frontend/app/routes/dashboard.indicator-gauges.tsx` (641L) — full pattern verified: loader → `safeFetch` → `parseDto` → `useLoaderData` → `useFreshnessRevalidator("daily")` → `GaugeCard` render.
  - `GaugeCard` (L368–420): NOT exported. Currently inline. Must extract to shared component per M1 decision.
  - `REGIME_COLOR_CLASSES` (L339–348): color map used by `GaugeCard`. Must co-migrate with `GaugeCard` to shared component.
  - `formatZScore` (L263): exported. P1 page imports this from `dashboard.indicator-gauges.tsx` (re-export or direct import).
- `apps/frontend/app/components/TopNav.tsx` — `ANALYST_NAV` array, last entry at L96: `{ to: "/dashboard/indicator-gauges", label: "Chỉ Báo" }`. New P1 entry appends at L97 (new line after L96 entry, before closing `]`).
- `apps/frontend/app/components/InfoCardExpand.tsx` — Radix Collapsible wrapper. Takes `summary: ReactNode`, `findingData: object | null`, `source: string | null`. P1 card expand content: pass structured detail object as `findingData`; `source=null` (no external URL).
- `apps/frontend/app/__tests__/ind-p1-frontend-gauge-cards.test.ts` — P0 test pattern file (pure-logic, no jsdom). New `ind-p1-momentum-cards.test.ts` mirrors this pattern.
- `apps/frontend/app/__tests__/ind-p1-indicator-gauges-nav.test.tsx` — existing TopNav test for P0 entry. New `ind-p1-momentum-nav.test.tsx` follows same pattern for P1 entry.

---

### ARCH-RATIFY Decisions

**M1 — GaugeCard sharing strategy: OPTION B — Extract to `~/components/GaugeCard.tsx`**

Rationale: `GaugeCard` is a page-agnostic UI primitive (no domain logic, clean `GaugeCardProps` interface). Cross-importing between `routes/` files couples two page modules — violates Remix's route isolation convention and creates brittle circular dependency potential. Extracting to `components/` is the correct DDD placement for a shared UI component.

**Migration impact on Zone B dev:** Two files must change atomically:
1. Create `apps/frontend/app/components/GaugeCard.tsx` — extract `GaugeCardProps` interface, `REGIME_COLOR_CLASSES` constant, `GaugeCard` function component from `dashboard.indicator-gauges.tsx`.
2. Extend `GaugeCardProps` with optional `expandContent?: React.ReactNode` for the P1 expand/collapse dropdown (backward-compatible: P0 page omits this prop, renders as before).
3. Update `dashboard.indicator-gauges.tsx` — remove inline `GaugeCard` + `GaugeCardProps` + `REGIME_COLOR_CLASSES`, add `import { GaugeCard } from "~/components/GaugeCard"`.
4. `dashboard.momentum.tsx` — `import { GaugeCard } from "~/components/GaugeCard"`.

Dev must commit items 1–3 together (single buildable commit) before adding item 4 in the same or next commit. `tsc --noEmit` must be 0 after each commit.

**P1 card expand content (per AC-3):** pass `expandContent` prop containing an inline Collapsible or `InfoCardExpand` with structured detail:
```tsx
expandContent={<InfoCardExpand
  summary={<span>get_roc_momentum · apps/technical-analysis</span>}
  findingData={{ computed_as_of: roc?.computed_as_of ?? null, null_reason: roc?.null_reason ?? null }}
  source={null}
/>}
```

**M2 — `formatRSComposite` location: OPTION A — define in `dashboard.momentum.tsx`, export**

Rationale: All P0 format helpers (`formatZScore`, `formatVolatilityRegime`, `formatHistoryQuality`, `formatOmoBn`) are defined in `dashboard.indicator-gauges.tsx` and exported for tests. P1 follows the same co-location pattern. `formatZScore` is already exported from `dashboard.indicator-gauges.tsx`; P1 page imports it from there directly (no duplication).

```typescript
export function formatRSComposite(value: number | null): { label: string; color: "green" | "amber" | "gray" } {
  if (value === null || value === undefined) return { label: "Chưa có dữ liệu", color: "gray" };
  if (value > 0) return { label: "MẠNH", color: "green" };
  if (value < 0) return { label: "YẾU", color: "amber" };
  return { label: "TRUNG TÍNH", color: "amber" };
}
```

**M3 — source_tier assignment: source_tier = 3 (estimate/compute) for all 4 sections**

Confirmed: none of the 4 client response types carry a `source_tier` field. All 4 tools compute from persisted SQLite rows (daily_ohlcv) — no live external market API call at query time. Endpoint-assigns `source_tier = 3` in each section builder (identical to `buildVolatilitySection`'s `data.source_tier ?? 3` pattern).

Defensive: `adtv_unit` from `ComputeForeignAccumRankResponse.adtv_unit` is always present per contract (`string`, not optional). However, defensive fallback `data.adtv_unit ?? "ADTV-normalized"` is applied in `buildForeignAccumSection` as the BA specified.

**M4 — `low_sample_warning` badge modifier: SURFACE as detail row when true**

`low_sample_warning: boolean` is always present in `RelativeStrengthGauge` DTO. Frontend renders it as an additional detail row on the RS card when `true`: `{ label: "Cảnh báo", value: "Mẫu ít tickers — kết quả có thể thiếu chính xác" }`. This is honest transparency without adding a second badge layer (which would clutter the card). The main `badge.color` for RS remains determined by `market_rs_composite` polarity.

---

### Design Decisions — Full File Map

**Zone A — apps/mcp-server (dev-mcp-server task)**

| File | Action | DDD Layer | Notes |
|---|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/momentumIndicatorsHandler.ts` | CREATE | interface | New file, ~180L. Exact mirror of `indicatorGaugesHandler.ts` minus db param. |
| `apps/mcp-server/src/interface/mcp/server.ts` | MODIFY (append) | interface | 1 import line (L111 block) + 1 route block (~8L) after L2160. |
| `apps/mcp-server/src/__tests__/momentum-indicators.test.ts` | CREATE | test | 7 test suites, bun test runner. DI stub injection pattern. |

Handler signature delta vs P0:
```typescript
// P0 (needs db for local SQLite sources)
export async function handleGetIndicatorGauges(req, res, db: Database, deps?)
// P1 (no db — all sources are remote HTTP via clients.ts)
export async function handleGetMomentumIndicators(req, res, deps?)
export async function aggregateMomentumIndicators(deps?)
```

**Zone B — apps/frontend (dev-frontend task)**

| File | Action | DDD Layer | Notes |
|---|---|---|---|
| `apps/frontend/app/components/GaugeCard.tsx` | CREATE | interface (UI primitive) | Extracted + extended from `dashboard.indicator-gauges.tsx`. Add `expandContent?: ReactNode`. |
| `apps/frontend/app/routes/dashboard.indicator-gauges.tsx` | MODIFY (refactor) | interface | Remove inline GaugeCard + REGIME_COLOR_CLASSES. Import from `~/components/GaugeCard`. 1 import, ~55L removed. |
| `apps/frontend/app/routes/api.momentum-indicators.tsx` | CREATE | interface | ~30L. Mirror `api.indicator-gauges.tsx` verbatim with path swap. |
| `apps/frontend/app/routes/dashboard.momentum.tsx` | CREATE | interface | ~280L. 4 GaugeCard renders + `formatRSComposite` + `parseMomentumIndicatorsDto` + loader. |
| `apps/frontend/app/components/TopNav.tsx` | MODIFY (append) | interface | +1 line after L96: `{ to: "/dashboard/momentum", label: "Động Lực P1" }`. |
| `docs/data/frontend-data-coverage-map.json` | MODIFY (append) | infrastructure (SSOT) | +4 GAP rows for /dashboard/momentum. |
| `apps/frontend/app/__tests__/ind-p1-momentum-cards.test.ts` | CREATE | test | Pure-logic vitest (no jsdom). 10 suites. |
| `apps/frontend/app/__tests__/ind-p1-momentum-nav.test.tsx` | CREATE | test | TopNav ANALYST_NAV entry verify. |

---

### Risk Flags

**RISK-M1-GAUGECARD-EXTRACT [MEDIUM]**
Extracting `GaugeCard` from `dashboard.indicator-gauges.tsx` modifies a currently-working production file. Dev must: (1) create `components/GaugeCard.tsx`, (2) update `dashboard.indicator-gauges.tsx` import, (3) verify `tsc --noEmit` passes before proceeding to Zone B work. If TSC fails at step 2, the P0 gauge page breaks. Mitigation: single atomic commit containing all 3 changes.

**RISK-M2-NO-DB-IN-HANDLER [LOW]**
P1 handler signature differs from P0 (no `db: Database` param). Dev who copies P0 handler verbatim will introduce an unused `db` parameter and an unnecessary `Database` import. The BA spec explicitly states "call from clients.ts directly (NOT the MCP tool layer)" — confirm developer reads this constraint.

**RISK-M3-REGIME-COLOR-CLASSES-MOVE [LOW]**
`REGIME_COLOR_CLASSES` constant (L339 in `dashboard.indicator-gauges.tsx`) is used only by `GaugeCard`. It must migrate to `components/GaugeCard.tsx` during the GaugeCard extraction, otherwise the import from `dashboard.indicator-gauges.tsx` will have a dangling reference.

**RISK-M4-SERVER-TS-IMPORT-BLOCK [LOW]**
`server.ts` imports indicator-gauges handler at a dedicated comment block (L111). The P1 import must be added to the same block (not scattered). Append pattern: after `import { handleGetIndicatorGauges } from "./routes/indicatorGaugesHandler.js"`.

---

### Scan Clean

- `apps/mcp-server/src/interface/mcp/routes/` — no existing `momentumIndicatorsHandler.ts` (confirmed via file listing)
- `apps/frontend/app/routes/` — no existing `api.momentum-indicators.tsx` or `dashboard.momentum.tsx`
- `apps/frontend/app/__tests__/` — no existing `ind-p1-momentum-cards.test.ts` or `ind-p1-momentum-nav.test.tsx`
- `apps/frontend/app/components/` — no existing `GaugeCard.tsx` (component currently inline in dashboard page)
- Scan clean: true ✓

---

### Sequencing for PM

```
Zone A (dev-mcp-server) — standalone:
  1. Create momentumIndicatorsHandler.ts (~180L)
  2. Register in server.ts (import + route block, ~10L change)
  3. Create momentum-indicators.test.ts (7 suites)
  Blocked by: nothing. Can start immediately.

Zone B (dev-frontend) — parallel:
  Step 1 (prerequisite, same task or separate):
    Extract GaugeCard to ~/components/GaugeCard.tsx + update dashboard.indicator-gauges.tsx
  Step 2 (main work):
    api.momentum-indicators.tsx (proxy)
    dashboard.momentum.tsx (4 cards)
    TopNav.tsx (+1 entry)
    coverage-map +4 GAP rows
    ind-p1-momentum-cards.test.ts
    ind-p1-momentum-nav.test.tsx
  Blocked by: Zone B Step 1 (GaugeCard extract). Not blocked by Zone A deployment.
  Production data rendering blocked by Zone A REST endpoint being live at :3000.
```

**PM split recommendation:** 2 tasks minimum, 3 tasks if GaugeCard extract warrants isolation:
- TASK-MOMENTUM-A: dev-mcp-server (handler + registration + test)
- TASK-MOMENTUM-B: dev-frontend (GaugeCard extract + new files + TopNav + tests + coverage-map)

TASK-MOMENTUM-B has no hard dependency on TASK-MOMENTUM-A for implementation (frontend tests mock fetch). QA gate for real data rendering requires TASK-MOMENTUM-A deployed first.

---

## RETURN

DONE: Technical design complete, brownfield findings written to docs/handoffs/BA-IND-P1-MOMENTUM-FRONTEND.md
ZONE: multi — apps/mcp-server/ + apps/frontend/ (SPLIT required per zone)
NEXT: pm | break design into atomic tasks and create developer handoffs
HANDOFF: docs/handoffs/BA-IND-P1-MOMENTUM-FRONTEND.md
PIPELINE: continue
