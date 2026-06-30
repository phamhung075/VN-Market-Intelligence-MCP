---
sprint: BA-IND-P1-MOMENTUM-FRONTEND
task_id: TASK-502-MOMENTUM-FRONTEND
branch: task/502-momentum-frontend
size: L
zone: apps/frontend/
type: feature
priority: P1
depends_on: [TASK-501-MOMENTUM-API-HANDLER]
blocks: []
created_at: 2026-06-30T05:45Z
---

## TLDR

Implement P1 momentum dashboard frontend: extract existing `GaugeCard` component from P0 page to shared component (M1 decision), create proxy route, build 4-card dashboard page with TopNav entry, add tests, and plan coverage-map GAP rows. Depends on TASK-501 DTO contract (not deployment).

## [PM] Planning Context

**Sprint:** BA-IND-P1-MOMENTUM-FRONTEND (Architect-ratified, brownfield findings + ARCH-RATIFY M1–M4 decisions)
**Zone:** apps/frontend/ — depends on TASK-501 DTO contract
**Sequence:** TASK-501 contract-first; this task implements against that contract (tests mock fetch)

### Acceptance Criteria

- [ ] **AC-M1: GaugeCard Extraction (ARCH-RATIFY M1, M3)** — MUST BE ATOMIC COMMIT (items 1–3 together before zone-B code work)
  - **Step 1:** Create `apps/frontend/app/components/GaugeCard.tsx` (~80L)
    - Extract `GaugeCardProps` interface, `REGIME_COLOR_CLASSES` constant, `GaugeCard` function component
    - Source: `apps/frontend/app/routes/dashboard.indicator-gauges.tsx` lines 339–420
    - Add optional `expandContent?: React.ReactNode` prop (backward-compatible: P0 page omits)
  - **Step 2:** Update `apps/frontend/app/routes/dashboard.indicator-gauges.tsx` (~5L change)
    - Remove inline `GaugeCard`, `GaugeCardProps`, `REGIME_COLOR_CLASSES`
    - Add import: `import { GaugeCard, GaugeCardProps, REGIME_COLOR_CLASSES } from "~/components/GaugeCard"`
  - **Step 3:** Verify `tsc --noEmit` passes after extract (P0 page must still work identically)
  - **Commit message:** `feat(frontend/m1): extract GaugeCard component to shared location` (Task: TASK-502-MOMENTUM-FRONTEND AC-M1)

- [ ] **AC-1: Proxy Route** — `apps/frontend/app/routes/api.momentum-indicators.tsx` (~30L)
  - Transparent proxy: `GET ${MCP_SERVER_BASE_URL}/api/momentum-indicators`
  - Reuse `proxyUpstream` from `~/lib/api/fetchUtils` (identical to P0 `api.indicator-gauges.tsx`)
  - Label: `"api.momentum-indicators"`
  - Only GET supported; 4xx/5xx forwarded as-is; network failure → 502
  - No domain logic (pure DDD interface layer)

- [ ] **AC-2: Dashboard Page** — `apps/frontend/app/routes/dashboard.momentum.tsx` (~280L)
  - Route: `/dashboard/momentum`
  - Page title (meta): `"Động Lực Thị Trường — VN Market Intelligence"`
  - `PageHeader` title: `"Động Lực Thị Trường P1"`, subtitle describes 4 momentum scalars

  **Loader pattern:**
  - `fetchMomentumIndicators(origin: string): Promise<LoaderData>` — exported for unit tests
  - Uses `safeFetch<MomentumIndicatorsDto>` from `~/lib/api/fetchUtils`
  - `parseMomentumIndicatorsDto(raw: unknown): MomentumIndicatorsDto` — exported parser, never throws
  - Error → all-null sections + `error` string (honest-NULL)
  - `useFreshnessRevalidator("daily")` (identical to P0 gauge page)

  **4 GaugeCard renders with honest-NULL:**
  | Card | Title (VN) | Subtitle | Key Scalar | Badge Logic |
  |---|---|---|---|---|
  | ROC | "Đà Tăng Giá" | "Z-score động lượng thị trường" | `formatZScore(roc?.momentum_factor_z)` | z > 1.5 → TÍCH CỰC/green; z > 0.5 → TRUNG LẬP TÍCH CỰC/amber; z < -0.5 → TIÊU CỰC/red; null → gray |
  | RS | "Sức Mạnh Tương Đối" | "Composite RS thị trường" | `formatRSComposite(rs?.market_rs_composite)` | > 0 → MẠNH/green; < 0 → YẾU/amber; null → gray |
  | 52W | "Phân Bổ 52 Tuần" | "Số cổ phiếu tạo đỉnh ròng" | `proximity_52w?.net_new_highs?.toString() ?? "—"` | > 0 → Bứt phá/green; < 0 → Tích lũy/amber; = 0 → Trung lập/gray |
  | FA | "Tích Lũy Khối Ngoại" | "Z-score ADTV-normalized" | `formatZScore(fa?.foreign_accum_z_market)` | z < -1 → TÍCH LŨY MẠNH/green; z < 0 → TÍCH LŨY NHẸ/amber; z > 0 → PHÂN PHỐI/red; null → gray |

  **Per-card requirements:**
  - Source-link dropdown (AC-3): `InfoCardExpand` with tool name, service, `computed_as_of`, `null_reason` when applicable
  - Freshness badge (AC-2): `FreshnessBadge` with `slaTierKey="daily"` + `dataAsof={card.computed_as_of}` from coverage-map SSOT
  - Null rendering: section null → "Chưa có dữ liệu" gray badge; scalar null → "—" em-dash; null reason shown
  - Pass `expandContent` prop to GaugeCard (M1 extension):
    ```tsx
    expandContent={<InfoCardExpand
      summary={<span>get_roc_momentum · apps/technical-analysis</span>}
      findingData={{ computed_as_of: roc?.computed_as_of ?? null, null_reason: roc?.null_reason ?? null }}
      source={null}
    />}
    ```

- [ ] **AC-M2: formatRSComposite Helper (ARCH-RATIFY M2)** — defined in `dashboard.momentum.tsx`, exported
  ```typescript
  export function formatRSComposite(value: number | null): { label: string; color: "green" | "amber" | "gray" } {
    if (value === null || value === undefined) return { label: "Chưa có dữ liệu", color: "gray" };
    if (value > 0) return { label: "MẠNH", color: "green" };
    if (value < 0) return { label: "YẾU", color: "amber" };
    return { label: "TRUNG TÍNH", color: "amber" };
  }
  ```

- [ ] **AC-M4: low_sample_warning Detail Row (ARCH-RATIFY M4)** — RS card renders as additional detail when true
  - No second badge layer (would clutter); surface as detail row in `InfoCardExpand`
  - Detail: `{ label: "Cảnh báo", value: "Mẫu ít tickers — kết quả có thể thiếu chính xác" }`

- [ ] **AC-3: TopNav Entry** — `apps/frontend/app/components/TopNav.tsx`
  - Add to `ANALYST_NAV` array after line 96
  - Entry: `{ to: "/dashboard/momentum", label: "Động Lực P1" }`
  - Route is LIVE (not comingSoon) since dashboard page ships in this sprint

- [ ] **AC-4: Coverage-Map GAP Rows (plan-only, LIVE flip at QA)** — `docs/data/frontend-data-coverage-map.json`
  - Add 4 GAP rows for /dashboard/momentum:
    1. `page: "/dashboard/momentum"`, `elem: "momentum_factor_z (roc gauge)"`, `endpoint: "/api/momentum-indicators → roc section"`, `writer: "get_roc_momentum → REST endpoint"`, `status: "GAP"`
    2. `page: "/dashboard/momentum"`, `elem: "market_rs_composite (relative_strength gauge)"`, `endpoint: "/api/momentum-indicators → relative_strength section"`, `writer: "get_relative_strength → REST endpoint"`, `status: "GAP"`
    3. `page: "/dashboard/momentum"`, `elem: "net_new_highs + pct_above_ma50/ma200 (proximity_52w gauge)"`, `endpoint: "/api/momentum-indicators → proximity_52w section"`, `writer: "get_52w_proximity → REST endpoint"`, `status: "GAP"`
    4. `page: "/dashboard/momentum"`, `elem: "foreign_accum_z_market (foreign_accum gauge)"`, `endpoint: "/api/momentum-indicators → foreign_accum section"`, `writer: "get_foreign_accum_rank → REST endpoint"`, `status: "GAP"`
  - Dev flips each row to `status: "LIVE"` when card renders real data; QA verifies before gate-close

- [ ] **AC-5: Vitest Unit Tests** — `apps/frontend/app/__tests__/ind-p1-momentum-cards.test.ts` (~150L)
  - Pure-logic test file (no jsdom), mirror `ind-p1-frontend-gauge-cards.test.ts` pattern
  - Test suites (10 suites minimum per FR-B5):
    - `parseMomentumIndicatorsDto` — null raw → all-null sections
    - `parseMomentumIndicatorsDto` — full valid DTO passes through
    - `parseMomentumIndicatorsDto` — partial DTO (sections null) → honest-NULL forwarded
    - `parseMomentumIndicatorsDto` — invalid non-object → graceful fallback
    - `formatZScore` — positive / negative / zero / null (reuse, import from dashboard.indicator-gauges.tsx)
    - `formatRSComposite` — positive / negative / zero / null (new, local to momentum page)
    - `fetchMomentumIndicators` — happy path (mocked fetch)
    - `fetchMomentumIndicators` — upstream 502 → all-null + error set
    - `fetchMomentumIndicators` — network failure → all-null + error set
    - `fetchMomentumIndicators` — null sections → honest-NULL forwarded
  - `vitest` must PASS

- [ ] **AC-6: TopNav Test** — `apps/frontend/app/__tests__/ind-p1-momentum-nav.test.tsx` (~30L)
  - Verify `ANALYST_NAV` contains `{ to: "/dashboard/momentum", label: "Động Lực P1" }`
  - Pattern mirrors `ind-p1-indicator-gauges-nav.test.tsx`

- [ ] **AC-7: No Real Service Calls in Tests (NFR-8)** — mock-guard clean (no real TA service / stock-price service URLs in test fixtures)

- [ ] **AC-8: TypeScript Clean (NFR-7)** — `tsc --noEmit` exits 0 after all changes

### Files to Read First (reference patterns)

- **`apps/frontend/app/routes/dashboard.indicator-gauges.tsx`** (641L) — P0 reference
  - Lines 1–50: imports, loader signature
  - Lines 51–150: `safeFetch`, `parseIndicatorGaugesDto` pattern
  - Lines 200–262: `formatZScore`, `formatVolatilityRegime`, etc.
  - Lines 263–270: `formatZScore` exported (import for P1 use)
  - Lines 339–348: `REGIME_COLOR_CLASSES` constant (to be extracted)
  - Lines 368–420: `GaugeCard` component (to be extracted, add `expandContent` prop)
  - Lines 500–641: render pattern with `useFreshnessRevalidator("daily")`

- **`apps/frontend/app/routes/api.indicator-gauges.tsx`** (55L) — proxy pattern to mirror exactly

- **`apps/frontend/app/components/TopNav.tsx`** — `ANALYST_NAV` array at L96; append after existing entry

- **`apps/frontend/app/components/InfoCardExpand.tsx`** — Radix Collapsible wrapper for source-link dropdowns

- **`docs/handoffs/BA-IND-P1-MOMENTUM-FRONTEND.md`**
  - FR-B1 through FR-B6 (frontend spec)
  - ARCH-RATIFY M1–M4 decisions
  - Edge cases § VN Data Quality (null scenarios)

- **`docs/policies/dev-standards.md`** (commit convention)

- **`docs/data/frontend-data-coverage-map.json`** (current structure for GAP row format)

### Files to Create

- **`apps/frontend/app/components/GaugeCard.tsx`** (~80L) — extracted from dashboard.indicator-gauges.tsx
  - `GaugeCardProps` interface (add `expandContent?: ReactNode`)
  - `REGIME_COLOR_CLASSES` constant
  - `GaugeCard` function component

- **`apps/frontend/app/routes/api.momentum-indicators.tsx`** (~30L)
  - Proxy route via `proxyUpstream`

- **`apps/frontend/app/routes/dashboard.momentum.tsx`** (~280L)
  - Loader + parser + 4 GaugeCard renders
  - `formatRSComposite` export
  - `useFreshnessRevalidator("daily")`

- **`apps/frontend/app/__tests__/ind-p1-momentum-cards.test.ts`** (~150L)
  - 10+ test suites

- **`apps/frontend/app/__tests__/ind-p1-momentum-nav.test.tsx`** (~30L)
  - TopNav entry verify

### Files to Modify

- **`apps/frontend/app/routes/dashboard.indicator-gauges.tsx`** (~55L removed)
  - Remove inline `GaugeCard`, `GaugeCardProps`, `REGIME_COLOR_CLASSES`
  - Add import from `~/components/GaugeCard`

- **`apps/frontend/app/components/TopNav.tsx`** (+1L)
  - Add momentum entry to `ANALYST_NAV` array

- **`docs/data/frontend-data-coverage-map.json`** (+4 rows)
  - Add 4 GAP rows for /dashboard/momentum

### Dependencies

- **Upstream:** TASK-501-MOMENTUM-API-HANDLER (DTO contract)
- **Downstream:** None
- **Siblings:** TASK-501 may be in progress (this task develops against mocked contract)
- **Internal:** AC-M1 (GaugeCard extract) must complete before rest of zone-B work starts

### Knowledge & Patterns

- **DDD Layer:** interface (proxy, dashboard rendering, test)
- **Reference:** `dashboard.indicator-gauges.tsx` (P0 dashboard) + BA spec FR-B1 through FR-B6
- **GaugeCard pattern:** UI primitive extraction (Option B per M1 decision, shared `~/components/GaugeCard.tsx`)
- **Honest-NULL rule:** NFR-2 — null + null_reason per card; NEVER default-fill
- **Freshness badge:** SSOT = `frontend-data-coverage-map.json` (NEVER baked time)
- **M2 pattern:** `formatRSComposite` co-located in `dashboard.momentum.tsx` (mirrors P0 helper pattern)
- **M4 pattern:** `low_sample_warning` surfaced as detail row (no second badge layer)

### Resources

- Zone: `apps/frontend/` (dev-frontend agent)
- Estimated effort: ~4h (L size) — includes GaugeCard extract + 4 cards + tests + coverage-map
- QA gate: vitest PASS + tsc 0 + mock-guard PASS + coverage-map rows present

---

## RETURN

**Task ID:** TASK-502-MOMENTUM-FRONTEND
**Zone:** apps/frontend/
**Depends On:** TASK-501-MOMENTUM-API-HANDLER
**Status:** TODO
**Effort:** L (~4h)
