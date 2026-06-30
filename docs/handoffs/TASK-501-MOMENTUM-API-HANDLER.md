---
sprint: BA-IND-P1-MOMENTUM-FRONTEND
task_id: TASK-501-MOMENTUM-API-HANDLER
branch: task/501-momentum-api-handler
size: M
zone: apps/mcp-server/
type: feature
priority: P1
depends_on: []
blocks: [TASK-502-MOMENTUM-FRONTEND]
created_at: 2026-06-30T05:45Z
---

## TLDR

Implement REST aggregator `GET /api/momentum-indicators` as standalone handler (no database dependency) in mcp-server zone. Call 4 remote HTTP clients (ROC, RS, 52W, FA) via `Promise.allSettled`, return honest-NULL per section, ship tests.

## [PM] Planning Context

**Sprint:** BA-IND-P1-MOMENTUM-FRONTEND (Architect-ratified, brownfield findings + ARCH-RATIFY M1–M4 decisions)
**Zone:** apps/mcp-server/ — standalone (Zone B depends on this endpoint's DTO contract, not deployment)

### Acceptance Criteria

- [ ] **AC-1: REST Handler Creation** — `apps/mcp-server/src/interface/mcp/routes/momentumIndicatorsHandler.ts` created (mirror `indicatorGaugesHandler.ts` pattern)
  - Exports: `aggregateMomentumIndicators(deps?)` + `handleGetMomentumIndicators(req, res, deps?)`
  - **CRITICAL:** NO `db: Database` parameter (all 4 sources are remote HTTP via `clients.ts`, not local SQLite)
  - DTO types: `RocGauge`, `RelativeStrengthGauge`, `Proximity52WGauge`, `ForeignAccumGauge`, `MomentumIndicatorsDto` (see FR-A4 spec)
  - 4 section-builder functions (pure mapping, project only scalars, NEVER forward `.tickers[]` arrays):
    - `buildRocSection(data: ComputeROCMomentumResponse): RocGauge`
    - `buildRelativeStrengthSection(data: ComputeRelativeStrengthResponse): RelativeStrengthGauge`
    - `buildProximity52WSection(data: Compute52WProximityResponse): Proximity52WGauge`
    - `buildForeignAccumSection(data: ComputeForeignAccumRankResponse): ForeignAccumGauge`

- [ ] **AC-2: Promise.allSettled Isolation** — 4 sections resolved in parallel; one rejection degrades ONLY that section to null
  - `Promise.allSettled([computeRoc(), computeRS(), compute52W(), computeForeignAccum()])`
  - All section builders check for null and synthesize `null_reason` per FR-A3 spec
  - Honest-NULL rendering: NEVER default-fill or fabricate

- [ ] **AC-3: HTTP 200 Always** — catastrophic handler failure path returns 200 with all-null sections + `error` field (mirror P0 line 451–463)
  - `generated_at` ISO timestamp ALWAYS present

- [ ] **AC-4: Section Builders — Honest NULL per FR-A3**
  - `roc`: `momentum_factor_z null` when insufficient OHLCV (<13 bars) → `null_reason: "Insufficient OHLCV history — momentum_factor_z requires ≥13 bars"`
  - `relative_strength`: `market_rs_composite null` when N < 5 → `null_reason: "Watchlist too small — market_rs_composite requires N ≥ 5 tickers"` + passthrough `low_sample_warning`
  - `proximity_52w`: `pct_above_ma200 null` when `denominator_ma200 = 0` → `null_reason: "denominator_ma200 = 0 — no tickers have ≥200-bar OHLCV history"`
  - `foreign_accum`: `foreign_accum_z_market null` when < 5 tickers with ≥5 bars → `null_reason: "Insufficient tickers with ≥5 days of flow data"`

- [ ] **AC-5: DI Interface for Testability (FR-A6)** — `MomentumIndicatorsDeps` interface:
  ```typescript
  interface MomentumIndicatorsDeps {
    computeRoc?: () => Promise<ComputeROCMomentumResponse>;
    computeRS?: () => Promise<ComputeRelativeStrengthResponse>;
    compute52W?: () => Promise<Compute52WProximityResponse>;
    computeForeignAccum?: () => Promise<ComputeForeignAccumRankResponse>;
  }
  ```
  - Production: all undefined → real `clients.ts` implementations
  - Tests: inject stubs to avoid real service calls

- [ ] **AC-6: Server.ts Route Registration (FR-A-REG)** — append to `apps/mcp-server/src/interface/mcp/server.ts`
  - Import at L111 block (import `{ handleGetMomentumIndicators }`)
  - Route block after L2160 (after P0 indicator-gauges route): `app.get("/api/momentum-indicators", ...)`
  - Registration pattern: `await handleGetMomentumIndicators(req, res)` (no `db` argument)

- [ ] **AC-7: Bun Test Suite** — `apps/mcp-server/src/__tests__/momentum-indicators.test.ts`
  - Test suites per FR-A8 spec (7 suites minimum):
    - All 4 sections fulfilled → full DTO
    - One section rejected → that section null, others populated
    - All sections rejected → all-null DTO, generated_at present
    - `buildRocSection` — momentum_factor_z null → null_reason set
    - `buildRelativeStrengthSection` — low_sample_warning passthrough
    - `buildProximity52WSection` — denominator_ma200=0 → null_reason set
    - `buildForeignAccumSection` — foreign_accum_z_market null → null_reason set
  - DI stub injection pattern (mirror P0 tests)
  - `bun test` must PASS

- [ ] **AC-8: No Real Service Calls in Tests (NFR-8)** — mock-guard clean (no real TA service / stock-price service URLs in test fixtures)

- [ ] **AC-9: TypeScript Clean (NFR-7)** — `tsc --noEmit` exits 0 after changes

- [ ] **AC-10: source_tier Assignment (M3 decision)** — all 4 sections hardcoded `source_tier: 3` (estimate/compute, no live external fetch)

### Files to Read First (reference patterns)

- **`apps/mcp-server/src/interface/mcp/routes/indicatorGaugesHandler.ts`** (465L) — canonical P0 handler pattern
  - Lines 1–50: DTO types (mirror for ROC, RS, 52W, FA)
  - Lines 51–100: DI interface + section builders signature
  - Lines 101–200: pure section builders (honest-NULL pattern)
  - Lines 201–350: `aggregateIndicatorGauges(db, deps)` with `Promise.allSettled` isolation
  - Lines 351–463: HTTP handler + catastrophic failure path

- **`apps/mcp-server/src/infrastructure/microservices/clients.ts`**
  - L299: `computeROCMomentum({})` signature + return type
  - L352: `computeRelativeStrength({})` signature + return type
  - L414: `compute52WProximity({})` signature + return type
  - L467: `computeForeignAccumRank({})` signature + return type

- **`apps/mcp-server/src/interface/mcp/server.ts`** (2500L+)
  - L111: import block for handlers
  - L2157–2162: indicator-gauges route registration (P1 appends after L2160)

- **`docs/handoffs/BA-IND-P1-MOMENTUM-FRONTEND.md`**
  - FR-A1 through FR-A7 (REST handler spec)
  - FR-A8 (test spec)
  - ARCH-RATIFY M3 (source_tier assignment)
  - Edge cases § VN Data Quality (null scenarios)

- **`docs/policies/dev-standards.md`** (commit convention, test hygiene)

### Files to Create

- **`apps/mcp-server/src/interface/mcp/routes/momentumIndicatorsHandler.ts`** (~180L)
  - DTO types (4 section + combined)
  - DI interface
  - 4 section builders
  - `aggregateMomentumIndicators(deps?)` function
  - HTTP handler `handleGetMomentumIndicators(req, res, deps?)`

- **`apps/mcp-server/src/__tests__/momentum-indicators.test.ts`** (~200L)
  - 7+ test suites with DI stub injection
  - `bun test` runner

### Files to Modify

- **`apps/mcp-server/src/interface/mcp/server.ts`**
  - L111 block: add import line for `handleGetMomentumIndicators`
  - After L2160: add route block (GET /api/momentum-indicators)

### Dependencies

- **Upstream:** None (Zone A is standalone)
- **Downstream:** TASK-502-MOMENTUM-FRONTEND depends on this zone's DTO contract
- **Siblings:** TASK-502 may develop in parallel (against mocked contract)

### Knowledge & Patterns

- **DDD Layer:** interface (REST handler + DTO projection)
- **Reference:** `indicatorGaugesHandler.ts` (P0 handler) + BA spec FR-A1 through FR-A7
- **Key constraint:** NO `db` parameter — all sources are remote HTTP via `clients.ts`
- **Test pattern:** DI stub injection (mirror P0 tests)
- **Honest-NULL rule:** NFR-2 — null + null_reason per section; NEVER fabricate
- **No ticker arrays:** NFR-6 — section builders project only market-aggregate scalars

### Resources

- Zone: `apps/mcp-server/` (dev-mcp-server agent)
- Estimated effort: ~2h (M size)
- QA gate: bun test PASS + tsc 0 + mock-guard PASS

---

## RETURN

**Task ID:** TASK-501-MOMENTUM-API-HANDLER
**Zone:** apps/mcp-server/
**Blocks:** TASK-502-MOMENTUM-FRONTEND
**Status:** TODO
**Effort:** M (~2h)
