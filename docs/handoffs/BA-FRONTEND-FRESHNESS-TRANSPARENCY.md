# BA Spec — FRONTEND-FRESHNESS-TRANSPARENCY

**Sprint:** FRONTEND-FRESHNESS-TRANSPARENCY  
**BA task:** BA-FRONTEND-FRESHNESS-TRANSPARENCY  
**Produced:** 2026-06-27  
**Next:** architect  
**Handoff:** docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md

---

## Surface Reconciliation

Probed all live routes in `apps/frontend/app/routes/`. Result:

- **35 live page-rendering routes** (34 dashboard.* + `_index`) all match the 34 unique pages in `docs/data/frontend-data-coverage-map.json`.
- **No live page route is absent from the coverage map.** The reconciliation is clean.
- **One coverage-map row has no live route:** `(NEW) cheb-synthesis` — status GAP. This is the L5 CHEF synthesis card tracked separately. Out of scope for this sprint.

The 8 `rows_no_asof` from the coverage map summary:

| page | endpoint | status | action |
|------|----------|--------|--------|
| `_index` | `/api/market-digest` | L2 | Add `data_asof` to marketDigestHandler |
| `intel` | `/api/market-digest` | L2 | Shares fix with `_index` |
| `alerts` | `/api/alerts` | STALE_RISK | Add `data_asof` to alertsHandler |
| `kinh-dich-reference` | none (static) | STATIC | No fix needed — show "Nội dung tĩnh" label |
| `quality-audit` | `/api/quality-checklist` | L2 | Add `data_asof` to qualityChecklistHandler |
| `technical` | `/api/price-history/:ticker` | DEPTH_THIN | Add `data_asof` to priceHistoryHandler |
| `vps` | `/api/vps-proxy-health` | L2 | Add `data_asof` to vpsProxyHealthHandler |
| `(NEW) cheb-synthesis` | none (GAP) | GAP | Out of scope — separate sprint |

**Net L2 work = 5 handler fixes** (marketDigest, alerts, qualityChecklist, priceHistory, vpsProxyHealth).  
After fix: `rows_no_asof` drops from 8 to 2 (STATIC + GAP only).

---

## Anchor Task Validation

The 3 existing backlog anchors are **validated** — they collectively cover every surface. Do NOT re-mint them.

| Anchor | Coverage |
|--------|----------|
| FIX-L2-FRESHNESS-DATAASOF-FIELDS | Closes all 5 endpoint gaps; establishes `data_asof` contract per handler |
| FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE | Shared component + hook applied to all 34 live pages |
| FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING | Extends existing `freshnessSlaMonitorJob` to use coverage-map as SSOT |

---

## Requirements

### FR-1: data_asof field — 5 handler fixes
**DDD layer:** Infrastructure (handler/route layer; no domain logic change)  
**Zone:** `apps/mcp-server/src/interface/mcp/routes/`  
**Anchor:** FIX-L2-FRESHNESS-DATAASOF-FIELDS

Every endpoint where the coverage map carries `asof: null` and status ≠ {STATIC, GAP} MUST return a top-level `data_asof` field (ISO 8601 UTC string) in its response JSON.

Canonical response key: **`data_asof`** (normalized surface key — see ARCH-RATIFY-FFT-4).  
Server-side value rule:
- Primary: `MAX(<asof_column>) FROM <store_table>` — reflects actual last-write time, not handler call time.
- Fallback (empty table): `new Date().toISOString()`.

Pattern reference: `sectorRotationHandler.ts` (generatedAt + tradingDate shape).

Endpoints and their store columns:

| Handler file | Endpoint | Store table | Column |
|---|---|---|---|
| `marketDigestHandler.ts` | `/api/market-digest` | `market_summaries` | `generated_at` |
| `alertsHandler.ts` | `/api/alerts` | `alerts` | `created_at` or `updated_at` |
| `qualityChecklistHandler.ts` | `/api/quality-checklist` | computed-on-read | use `new Date().toISOString()` (compute time) |
| `priceHistoryHandler.ts` | `/api/price-history/:ticker` | `daily_ohlcv` | `updated_at` |
| `vpsProxyHealthHandler.ts` | `/api/vps-proxy-health` | `vps_push_log` | `created_at` (latest push) |

---

### FR-2: Shared FreshnessBadge component
**DDD layer:** Interface (React component)  
**Zone:** `apps/frontend/app/components/FreshnessBadge.tsx`  
**Anchor:** FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE

A single shared component that encapsulates all freshness display logic.

Props contract:
```typescript
interface FreshnessBadgeProps {
  dataAsof: string | null;       // ISO 8601 from loader data
  slaTierKey: SlaTierKey;        // "realtime"|"intraday"|"daily"|"weekly"|"event"|"static"
  marketHoursOnly?: boolean;     // true for STALE_RISK rows (alerts, foreign-flow)
  className?: string;
}

type SlaTierKey = "realtime" | "intraday" | "daily" | "weekly" | "event" | "static";
```

SLA thresholds (from coverage-map `sla_tiers`):

| tier | max_staleness_min | client_refresh_ms |
|------|---|---|
| realtime | 15 | 60000 |
| intraday | 60 | 300000 |
| daily | 1560 | null |
| weekly | 11520 | null |
| event | 1560 | 300000 |
| static | null | null |

Color logic:
- `dataAsof = null` → gray, label "Chưa có dữ liệu"
- `age ≤ 0.5 × max_staleness_min` → green (tươi)
- `0.5 × max_staleness_min < age ≤ max_staleness_min` → amber (có thể cũ)
- `age > max_staleness_min` AND `marketHoursOnly=false` → red (đã cũ)
- `age > max_staleness_min` AND `marketHoursOnly=true` AND outside market hours (02:00-08:59 UTC Mon-Fri) → amber with qualifier "số liệu phiên gần nhất"
- `slaTierKey = "static"` → no badge; render "Nội dung tĩnh" plain text

Label format: `"Cập nhật lúc HH:MM"` (time only, Asia/Ho_Chi_Minh timezone).  
Hydration: use existing `ClientTimeString` component for the time portion (no SSR/CSR mismatch).

---

### FR-3: Shared useFreshnessRevalidator hook
**DDD layer:** Interface (React hook)  
**Zone:** `apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts`  
**Anchor:** FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE

```typescript
function useFreshnessRevalidator(slaTierKey: SlaTierKey): void
```

Behavior:
- Reads `client_refresh_ms` from SLA tiers map for the given key.
- If `client_refresh_ms = null` (daily, weekly, static) → no interval; returns immediately.
- If `client_refresh_ms > 0` → `setInterval(revalidator.revalidate, client_refresh_ms)` in `useEffect`; cleans up interval on unmount.
- `useRevalidator` is already available in Remix; this hook wraps it — no new dependency.

---

### FR-4: Wire FreshnessBadge + hook into all 34 page routes
**DDD layer:** Interface (route pages)  
**Zone:** `apps/frontend/app/routes/`  
**Anchor:** FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE

Every data-rendering page route must:
1. Call `useFreshnessRevalidator(slaTierKey)` once at the top of the component (for its primary SLA tier).
2. Render `<FreshnessBadge dataAsof={loaderData.data_asof} slaTierKey="<tier>" />` next to each data element.

Pages with multiple elements (analysis page): render one FreshnessBadge per element with its own `dataAsof` + `slaTierKey`.

DRY invariant: `grep -r "FreshnessBadge" apps/frontend/app/ | grep -v "FreshnessBadge.tsx" | grep -v ".test."` must list usage sites but zero alternative implementations.

---

### FR-5: STATIC and STALE_RISK presentation
**DDD layer:** Interface  
**Zone:** `apps/frontend/app/components/FreshnessBadge.tsx` (handled internally via props)

- `kinh-dich-reference` (STATIC): renders "Nội dung tĩnh" (no badge, no revalidator).
- `alerts` (STALE_RISK): `marketHoursOnly=true` → amber + qualifier off-hours.
- `foreign-flow` (STALE_RISK): same as alerts.
- `sector-rotation` (DEPTH_THIN with tradingDate): already has inline timestamp on line 453-454 — refactor to use FreshnessBadge (removes inline duplicate).

---

### FR-6: L4 coverage-map-aware SLA self-policing
**DDD layer:** Application (extends existing scheduler)  
**Zone:** `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` + `apps/mcp-server/src/domain/services/`  
**Anchor:** FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING

Current state: `freshnessSlaMonitorJob.ts` monitors 12 internal DB tables via raw SQL age queries. These signal types (price, bctc, news…) are backend-internal and do NOT map 1:1 to the frontend SLA tiers.

Extension requirement:
1. A new domain service (recommended: `coverageMapFreshnessChecker.ts` per ARCH-RATIFY-FFT-3) reads `docs/data/frontend-data-coverage-map.json` as SSOT.
2. For each LIVE/L2/DEPTH_THIN/STALE_RISK row in the map, compute age from the relevant DB column (same columns as FR-1 table above, plus existing live rows using their `asof` column).
3. Compare age to `sla_tiers[row.sla].max_staleness_min`.
4. If age > max_staleness_min → call `postSignal` with `signalType="urgent_news"`, `fromAgent="freshness-sla-monitor"`, `toAgent="alert-commander"`, `payload={ title: "SLA BREACH: <page>/<elem>", age_minutes, threshold_minutes, endpoint }`.
5. STALE_RISK rows (alerts, foreign-flow): suppress escalation outside VN market hours (reuse existing `isVnMarketHours()` gate).
6. STATIC and GAP rows: skip entirely.
7. Additive only: the existing 12-signal SQL monitoring path runs first, unchanged. Coverage-map reader runs as a second pass in the same job cycle.
8. Injectable pattern: new checker must accept `coverageMapPath?: string` for test isolation (same injectable pattern as `injectedSignalAges` in `runFreshnessSlaMonitor`).

---

## Non-Functional Requirements

| ID | Requirement | Layer |
|---|---|---|
| NFR-A1 | FreshnessBadge time display uses `ClientTimeString` (no SSR/CSR mismatch) | Interface |
| NFR-A2 | useFreshnessRevalidator cleans up interval via useEffect return function | Interface |
| NFR-A3 | `data_asof` from all handlers is always ISO 8601 UTC (not epoch, not date-only) | Infrastructure |
| NFR-A4 | All Vietnamese labels: "Cập nhật lúc" (never English) | Interface |
| NFR-A5 | L4 extension is additive — zero modification to the existing 12-signal monitoring path | Application |
| NFR-A6 | Zero new per-page fetch utilities — reuse `safeFetch` from `fetchUtils.ts` (FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH dependency) | Interface |
| NFR-A7 | Ship completion across ALL 34 pages — not a slice | Interface |

---

## Edge Cases

| ID | Scenario | Required Behavior |
|---|---|---|
| EC-1 | `dataAsof = null` in FreshnessBadge | Render gray "Chưa có dữ liệu"; no amber/red |
| EC-2 | Server-side clock drift | Use `MAX(column)` from DB for data_asof, not handler call time; fallback `new Date().toISOString()` only for empty table |
| EC-3 | STALE_RISK off-hours (alerts, foreign-flow) | Badge shows amber + "số liệu phiên gần nhất"; no red; no L4 escalation |
| EC-4 | STATIC page (kinh-dich-reference) | No FreshnessBadge rendered; no useFreshnessRevalidator called; show "Nội dung tĩnh" |
| EC-5 | `client_refresh_ms = null` | useFreshnessRevalidator skips interval (daily/weekly/static tiers) |
| EC-6 | Analysis page — 2 elements | Each element renders its own FreshnessBadge with its own `dataAsof` + `slaTierKey` |
| EC-7 | L4 empty-table sentinel | Coverage-map reader applies same -1 sentinel guard as existing `querySignalAges` — skip breach if table is not yet seeded |
| EC-8 | `sector-rotation` inline timestamp | The existing inline render at lines 453-454 of `dashboard.sector-rotation.tsx` is refactored to use FreshnessBadge (removes only non-DRY surface) |

---

## Blockers / Architect Open Items

No PO blockers.

| ID | Item | BA Recommendation |
|---|---|---|
| ARCH-RATIFY-FFT-1 | FreshnessBadge file location | Option A: `apps/frontend/app/components/FreshnessBadge.tsx` (product component, mirrors InfoCardExpand.tsx) |
| ARCH-RATIFY-FFT-2 | useFreshnessRevalidator location | Option A: `apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts` (hook ≠ component; mirrors lib/api/ convention) |
| ARCH-RATIFY-FFT-3 | L4 coverage-map reader location | Option B: `apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts` (DDD pure; injectable; consistent with freshnessSlaChecker.ts) |
| ARCH-RATIFY-FFT-4 | Canonical response key name | Option A: single normalized `data_asof` key in all handler responses (each handler may use any internal column; the surface key is always `data_asof`) — simplifies FreshnessBadge consumer |

---

## Dev Chain (Ordered — Dependency-Gated)

```
TASK-FFT-L2  (dev-mcp-server)  ──────────────┐
                                              ├──► TASK-FFT-L3A (dev-frontend: shared primitives)
                                              │        │
                                              │        ▼
                                              │    TASK-FFT-L3B (dev-frontend: wire all 34 routes)
                                              │
                                              └──► TASK-FFT-L4  (dev-mcp-server: coverage-map SLA)
```

### TASK-FFT-L2 — L2 data_asof contract
- **Owner:** dev-mcp-server
- **Zone:** `apps/mcp-server/src/interface/mcp/routes/`
- **Anchor:** FIX-L2-FRESHNESS-DATAASOF-FIELDS
- **Work:** Add `data_asof` (ISO 8601) to 5 handlers — marketDigestHandler, alertsHandler, qualityChecklistHandler, priceHistoryHandler, vpsProxyHealthHandler — following sectorRotationHandler.ts pattern
- **DoD:**
  - `curl .../api/market-digest | jq .data_asof` returns ISO 8601 string
  - Same for all 5 endpoints
  - Coverage-map `rows_no_asof` count verifiably drops to 2 (STATIC + GAP only)
  - Tests: one test per handler asserting `data_asof` present and ISO 8601 formatted
  - tsc clean; existing tests unbroken

### TASK-FFT-L3A — Shared FreshnessBadge + useFreshnessRevalidator
- **Owner:** dev-frontend
- **Zone:** `apps/frontend/app/components/FreshnessBadge.tsx`, `apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts`
- **Anchor:** FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE
- **Depends on:** TASK-FFT-L2 (needs live `data_asof` in payloads to validate badge state)
- **Work:** Create FreshnessBadge component + useFreshnessRevalidator hook (shared primitives only; no page wiring in this task)
- **DoD:**
  - Unit tests: green/amber/red thresholds for all 5 SLA tiers (realtime, intraday, daily, weekly, event)
  - Unit tests: hook fires interval for tiers with client_refresh_ms; does NOT set interval for null tiers (daily, weekly, static)
  - Unit tests: hook cleans up interval on unmount (no memory leak)
  - Unit tests: EC-1 (null dataAsof → gray), EC-3 (marketHoursOnly=true off-hours → amber), EC-4 (static → "Nội dung tĩnh")
  - tsc clean

### TASK-FFT-L3B — Wire badge into all 34 pages
- **Owner:** dev-frontend
- **Zone:** `apps/frontend/app/routes/`
- **Anchor:** FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE
- **Depends on:** TASK-FFT-L3A
- **Work:** Import FreshnessBadge + useFreshnessRevalidator in all 34 page routes; refactor `sector-rotation` inline timestamp; add static label to kinh-dich-reference
- **DoD:**
  - `grep -r "FreshnessBadge" apps/frontend/app/routes/` lists exactly 34 usage sites (one per page; analysis page has 2 elements = 2 FreshnessBadge calls in 1 route file)
  - `grep -rn "FreshnessBadge" apps/frontend/app/ | grep "export" | wc -l` = 1 (single definition)
  - `grep -n "toLocaleTimeString\|new Date().*toLocale" apps/frontend/app/routes/dashboard.sector-rotation.tsx` returns 0 (old inline removed)
  - No TypeScript errors; no hydration warnings in browser console
  - QA: every page shows "Cập nhật lúc HH:MM" badge with correct color

### TASK-FFT-L4 — Coverage-map-aware SLA monitor
- **Owner:** dev-mcp-server
- **Zone:** `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts`, `apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts`
- **Anchor:** FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING
- **Depends on:** TASK-FFT-L2 (data_asof DB columns must be queryable)
- **Work:** New domain service `coverageMapFreshnessChecker.ts`; integrate as second pass in `runFreshnessSlaMonitor`
- **DoD:**
  - Forced breach: set a watched endpoint's DB column to an old timestamp → `postSignal` called → `agent_signals` row created with `fromAgent="freshness-sla-monitor"`
  - STALE_RISK rows (alerts, foreign-flow): forced breach outside VN market hours → NO escalation (isVnMarketHours gate honored)
  - Existing 12-signal SQL path: breaches 0, recoveries 0, escalations 0 in the same test run (additive, not modified)
  - `coverageMapFreshnessChecker.ts` has unit tests using injected map path (no filesystem access in tests)
  - tsc clean

---

## DDD Layer Summary

| Layer | Artifact |
|---|---|
| Infrastructure | 5 handler fixes (FR-1); `vpsProxyHealthHandler`, `marketDigestHandler`, etc. |
| Application | `freshnessSlaMonitorJob.ts` extension + `coverageMapFreshnessChecker.ts` (FR-6) |
| Interface | `FreshnessBadge.tsx`, `useFreshnessRevalidator.ts`, 34 route wirings (FR-2, FR-3, FR-4, FR-5) |
| Domain | No domain model changes (SLA tiers live in coverage-map SSOT, not in domain entities) |

---

## [Architect] Brownfield Findings

**Task:** ARCH-FRONTEND-FRESHNESS-TRANSPARENCY | 2026-06-27 | Sprint: FRONTEND-FRESHNESS-TRANSPARENCY

### Zone

Multi-zone — PM must split per-zone subtasks (already captured in BA dev chain):

| Zone | Specialist | Tasks |
|------|-----------|-------|
| `apps/mcp-server/` | dev-mcp-server | TASK-FFT-L2 (5 handler fixes) + TASK-FFT-L4 (domain service + scheduler) |
| `apps/frontend/` | dev-frontend | TASK-FFT-L3A (shared primitives) + TASK-FFT-L3B (34 route wirings) |

### BUILD-STANDARD: lean

Both `apps/mcp-server/` and `apps/frontend/` are existing services. No new service scaffolding required.

---

### ARCH-RATIFY Verdicts (4 of 4)

#### ARCH-RATIFY-FFT-1: FreshnessBadge location → RATIFIED
`apps/frontend/app/components/FreshnessBadge.tsx`

Confirmed scan: `components/` contains `InfoCardExpand.tsx`, `ClientTimestamp.tsx`, `PageHeader.tsx`, `TopNav.tsx` — product-domain components pattern. `FreshnessBadge` is a domain-aware product component (encodes SLA tier semantics), not a UI primitive — the `components/ui/badge.tsx` primitive is a different layer. Placement is correct. No collision.

DDD: Interface layer (React component).

#### ARCH-RATIFY-FFT-2: useFreshnessRevalidator location → RATIFIED with FLAG
`apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts`

Confirmed scan: `apps/frontend/app/lib/` has subdirectories `api/` and `view-models/` only — `hooks/` does NOT exist yet. Developer must create the directory. Convention is correct: `lib/` hosts shared non-component utilities, `hooks/` is the right sub-namespace for shared React hooks.

`useRevalidator` from `@remix-run/react` is already used in 3 places (`EvalTable.tsx`, `dashboard.orchestration.tsx`, `dashboard.bctc-eval.$reportId.tsx`) — no new dependency introduced.

FLAG for developer: create `apps/frontend/app/lib/hooks/` directory as part of TASK-FFT-L3A.

DDD: Interface layer (React hook).

#### ARCH-RATIFY-FFT-3: coverageMapFreshnessChecker location → RATIFIED with DDD OVERRIDE
`apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts`

Confirmed scan: `freshnessSlaChecker.ts` is a valid pattern model — pure functions, zero I/O, injectable parameters. Placement in `domain/services/` is correct.

**DDD OVERRIDE on injectable type:** BA spec recommends `coverageMapPath?: string` for test isolation. This is a DDD violation — domain services must not import from `fs` or read files (golden rule: domain has ZERO imports from infrastructure). Override:

- Injectable parameter: `injectedRows?: CoverageMapRow[]` (pre-parsed JS objects)
- File reading: delegated to the scheduler layer (`freshnessSlaMonitorJob.ts`), which already uses this pattern for `injectedSignalAges?: Record<SignalType, number>`
- Test isolation: pass mock row arrays directly — no filesystem access in tests (matches BA DoD requirement, just via a different injection shape)
- `CoverageMapRow` type: defined in the domain service file itself (mirrors `SignalSlaConfig` in `freshnessSlaChecker.ts`)

The scheduler reads `docs/data/frontend-data-coverage-map.json` via `Bun.file().json()` and passes the `.rows` array to the domain service. Same pattern as `querySignalAges → injectedSignalAges` in `runFreshnessSlaMonitor`.

DDD: Domain layer (pure checker). Infra/file-read: interface/scheduler layer.

#### ARCH-RATIFY-FFT-4: Canonical API surface key → RATIFIED
Single normalized `data_asof` key in all 5 handler responses (ISO 8601 UTC string).

Confirmed scan: no existing handler already uses `data_asof` as key — no naming conflict. The 5 handlers in scope (`marketDigestHandler.ts`, `alertsHandler.ts`, `qualityChecklistHandler.ts`, `priceHistoryHandler.ts`, `vpsProxyHealthHandler.ts`) currently return no top-level timestamp field. Each handler will add exactly one `data_asof` field mapped from its specific internal DB column (see FR-1 table). Internal column naming is irrelevant to the surface contract.

Existing LIVE handlers (`sectorRotationHandler` → `generatedAt`+`tradingDate`, others → `asOf`, `generatedAt`, etc.) are NOT changed — they are out of scope. The 5 L2 handlers get `data_asof` added as a NEW top-level field.

---

### Verified Paths

**apps/mcp-server — TASK-FFT-L2 (5 handler fixes)**

| File | Location | DB column → `data_asof` source |
|------|----------|-------------------------------|
| `apps/mcp-server/src/interface/mcp/routes/marketDigestHandler.ts` | exists | `MAX(generated_at) FROM market_summaries` |
| `apps/mcp-server/src/interface/mcp/routes/alertsHandler.ts` | exists | `MAX(updated_at) FROM alerts` (prefer `updated_at`; fall back to `created_at`) |
| `apps/mcp-server/src/interface/mcp/routes/qualityChecklistHandler.ts` | exists | `new Date().toISOString()` (compute-on-read; no store) |
| `apps/mcp-server/src/interface/mcp/routes/priceHistoryHandler.ts` | exists | `MAX(updated_at) FROM daily_ohlcv` |
| `apps/mcp-server/src/interface/mcp/routes/vpsProxyHealthHandler.ts` | exists | `MAX(created_at) FROM vps_push_log` |

Pattern reference: `apps/mcp-server/src/interface/mcp/routes/sectorRotationHandler.ts` — `generatedAt: now.toISOString()` at body assembly (line 339). For `data_asof`, use `MAX(column)` from store table, not handler call time. Fallback to `new Date().toISOString()` only for empty-table sentinel (null MAX).

**apps/mcp-server — TASK-FFT-L4 (domain service + scheduler extension)**

| File | Location | Action |
|------|----------|--------|
| `apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts` | NEW | Pure domain checker: `CoverageMapRow` type + `checkCoverageMapFreshness(rows, db, now?, injectedRows?)` |
| `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` | exists (501L) | Extend `runFreshnessSlaMonitor` — second pass reads coverage map, calls checker, processes breaches |
| `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` | exists (832L) | READ-ONLY — reuse `isVnMarketHours()` imported by scheduler for STALE_RISK gate |

**apps/frontend — TASK-FFT-L3A (shared primitives)**

| File | Location | Action |
|------|----------|--------|
| `apps/frontend/app/components/FreshnessBadge.tsx` | NEW | Product component; uses `ClientTimeString` from `ClientTimestamp.tsx` |
| `apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts` | NEW (dir also new) | Hook; wraps `useRevalidator` from `@remix-run/react` |
| `apps/frontend/app/components/ClientTimestamp.tsx` | READ-ONLY | `ClientTimeString` consumed by FreshnessBadge |

**apps/frontend — TASK-FFT-L3B (34 route wirings)**

- `apps/frontend/app/routes/dashboard.sector-rotation.tsx` — refactor inline `new Date(generatedAt).toLocaleTimeString("vi-VN")` (line 454) to `<FreshnessBadge dataAsof={generatedAt} slaTierKey="realtime" />` (see EC-8 note below)
- All other 33 `apps/frontend/app/routes/dashboard.*.tsx` — add `useFreshnessRevalidator` call + `<FreshnessBadge>` render
- Total route files confirmed: 65 files in `routes/`; 34 data-rendering page routes as per BA spec

---

### Reuse Patterns

1. `ClientTimeString` (from `apps/frontend/app/components/ClientTimestamp.tsx`) — MUST be used for the time portion inside FreshnessBadge. Do NOT use `toLocaleTimeString` directly in FreshnessBadge (same hydration-mismatch class as the sector-rotation inline that is being removed).

2. `isVnMarketHours()` (from `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts`) — MUST be imported by `freshnessSlaMonitorJob.ts` for the STALE_RISK gate in the L4 second pass. Already imported there. No duplication.

3. `injectedSignalAges` pattern (in `freshnessSlaMonitorJob.ts:357`) — `coverageMapFreshnessChecker.ts` injectable follows this exact pattern. Scheduler reads file, passes parsed data; tests inject mock data.

4. `safeFetch` from `apps/frontend/app/lib/api/fetchUtils.ts` — NFR-A6: no new per-page fetch utilities. All 34 page loaders already use `safeFetch` or direct loader data; no new fetch util needed for freshness (data_asof arrives in the existing loader payload).

---

### Design Decisions

**D1 — FreshnessBadge SLA tier constants:** SLA tier table (`sla_tiers` from `docs/data/frontend-data-coverage-map.json`) must be baked into `FreshnessBadge.tsx` as a `const` map at module level. Do NOT fetch the JSON at runtime (no server round-trip for a badge component). The map is structural config, not live data. The 6 tiers and their `[max_staleness_min, client_refresh_ms]` values are stable enough to live as TS constants — any change requires a frontend rebuild anyway.

**D2 — Null guard before ClientTimeString:** `ClientTimeString` requires a non-null ISO string (`iso: string` in its props type). FreshnessBadge must short-circuit when `dataAsof === null` and render the gray "Chưa có dữ liệu" span directly, never passing null to `ClientTimeString`.

**D3 — sector-rotation EC-8:** The inline at line 454 uses `generatedAt` (ISO 8601 from handler response). The FreshnessBadge replacement should use `generatedAt` as `dataAsof` with `slaTierKey="realtime"`. The `tradingDate` field (last session date string, not ISO 8601 UTC) is a separate metadata field and is NOT the freshness stamp — keep existing `tradingDate` display as-is, only replace the `toLocaleTimeString` fallback with FreshnessBadge.

**D4 — qualityChecklist compute-time asof:** `new Date().toISOString()` as `data_asof` for computed-on-read is correct. FreshnessBadge will always show green for this page (compute happens at request time, so age ≈ 0). Add a comment in `qualityChecklistHandler.ts` explaining this is intentional (not a missing writer).

**D5 — L4 runFreshnessSlaMonitor signature extension:** Add `injectedCoverageMapRows?: CoverageMapRow[]` parameter after `now`. Existing call sites (production `runFreshnessSlaMonitorJob`, all existing tests) pass no coverage-map argument → default to undefined → scheduler reads the live JSON file. Backward-compatible.

**D6 — SLA tiers in FreshnessBadge:** The `sla_tiers` block in `docs/data/frontend-data-coverage-map.json` uses `[max_staleness_min, client_refresh_ms]` as a 2-tuple array. In the TS constant, expand to a named-field object `{ maxStalenessMin: number | null, clientRefreshMs: number | null }` for readability and type safety.

---

### Risk Flags

| ID | Severity | Description | Mitigation |
|----|----------|-------------|------------|
| RISK-1 | MEDIUM | BA spec `coverageMapPath?: string` injectable = DDD violation (domain doing I/O) | Override to `injectedRows?: CoverageMapRow[]` — see ARCH-RATIFY-FFT-3 override above |
| RISK-2 | MEDIUM | `qualityChecklistHandler` has no DB store — `data_asof` = compute time; badge always shows green | Document in handler JSDoc: "computed-on-read; freshness = request time by design" — avoids future confusion |
| RISK-3 | LOW | sector-rotation has two timestamp fields: `generatedAt` (ISO 8601) + `tradingDate` (date string). Only `generatedAt` feeds FreshnessBadge; `tradingDate` stays as separate display | Dev must use `loaderData.generatedAt` as `dataAsof`, not `loaderData.tradingDate` |
| RISK-4 | LOW | `apps/frontend/app/lib/hooks/` directory does not exist | Developer creates dir in TASK-FFT-L3A |
| RISK-5 | MEDIUM | `ClientTimeString` does not accept null. Null guard in FreshnessBadge required before delegating to `ClientTimeString` | FreshnessBadge must branch on `dataAsof === null` before rendering `<ClientTimeString>` |
| RISK-6 | LOW | L4 second pass adds ~5 MAX() DB queries per 30-min tick to an existing 501L cron job | Negligible load. All 5 queries are same MAX() pattern as existing `querySignalAges` — no perf concern |

---

### Test Strategy

**TASK-FFT-L2 (dev-mcp-server):**
- 1 test per handler (5 total): assert `response.data_asof` is present and matches ISO 8601 regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$`
- Empty-table test per handler: assert `data_asof` falls back to `new Date().toISOString()` shape (not null/undefined)
- File: `apps/mcp-server/src/__tests__/freshness-dataasof-handlers.test.ts`

**TASK-FFT-L3A (dev-frontend):**
- FreshnessBadge unit tests: one per SLA tier × {within 0.5×, between 0.5× and 1×, above 1×} color thresholds = 15 scenarios
- Edge cases: null `dataAsof` → gray; static tier → "Nội dung tĩnh"; STALE_RISK off-hours → amber
- useFreshnessRevalidator unit tests: interval fires for realtime/intraday/event tiers; no interval for daily/weekly/static; cleanup on unmount (no memory leak)

**TASK-FFT-L4 (dev-mcp-server):**
- `coverageMapFreshnessChecker.ts` unit tests: inject mock rows; forced breach → checker returns breach; STALE_RISK off-hours → no breach escalated; empty-table sentinel (-1) → skipped
- Integration test: forced DB column old timestamp → `postSignal` called with `fromAgent="freshness-sla-monitor"` and `payload.title` containing "SLA BREACH"
- File: `apps/mcp-server/src/__tests__/freshness-coverage-map-checker.test.ts`
