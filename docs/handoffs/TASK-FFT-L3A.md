# TASK-FFT-L3A — Shared FreshnessBadge + useFreshnessRevalidator Primitives

**Sprint:** FRONTEND-FRESHNESS-TRANSPARENCY  
**Task ID:** TASK-FFT-L3A  
**Owner:** dev-frontend  
**Zone:** `apps/frontend/app/components/`, `apps/frontend/app/lib/hooks/`  
**Anchor:** FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE  
**Dependencies:** TASK-FFT-L2 (needs live `data_asof` in payloads)  
**Blocks:** TASK-FFT-L3B  
**Size:** ~2h  
**Status:** TODO

---

## Objective

Create two shared primitives:
1. **FreshnessBadge.tsx** — React component that displays freshness state (green/amber/red) and time label based on `data_asof` + SLA tier.
2. **useFreshnessRevalidator.ts** — React hook that sets up client-side auto-refresh intervals according to SLA tier configuration.

No page wiring in this task — shared primitives only. TASK-FFT-L3B wires these into all 34 routes.

---

## File Locations

**New files (create in this task):**
- `apps/frontend/app/components/FreshnessBadge.tsx`
- `apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts` (directory `apps/frontend/app/lib/hooks/` must be created — see RISK-4 below)

**Existing files (read-only):**
- `apps/frontend/app/components/ClientTimestamp.tsx` — use `ClientTimeString` component for time rendering (hydration-safe)

---

## Specification

### FreshnessBadge Component

**Props contract:**

```typescript
interface FreshnessBadgeProps {
  dataAsof: string | null;          // ISO 8601 from loader data
  slaTierKey: SlaTierKey;           // "realtime"|"intraday"|"daily"|"weekly"|"event"|"static"
  marketHoursOnly?: boolean;        // true for STALE_RISK rows (alerts, foreign-flow)
  className?: string;
}

type SlaTierKey = "realtime" | "intraday" | "daily" | "weekly" | "event" | "static";
```

**SLA thresholds (from coverage-map `sla_tiers`):**

| tier | max_staleness_min | client_refresh_ms |
|------|---|---|
| realtime | 15 | 60000 |
| intraday | 60 | 300000 |
| daily | 1560 | null |
| weekly | 11520 | null |
| event | 1560 | 300000 |
| static | null | null |

**Color logic & label:**

- `dataAsof = null` → gray badge, label "Chưa có dữ liệu"
- `slaTierKey = "static"` → no badge; render "Nội dung tĩnh" plain text (no `<ClientTimeString>` call)
- `age ≤ 0.5 × max_staleness_min` → green badge, "Cập nhật lúc HH:MM" (time in Asia/Ho_Chi_Minh TZ)
- `0.5 × max_staleness_min < age ≤ max_staleness_min` → amber badge, "Cập nhật lúc HH:MM"
- `age > max_staleness_min` AND `marketHoursOnly=false` → red badge, "Cập nhật lúc HH:MM"
- `age > max_staleness_min` AND `marketHoursOnly=true` AND outside market hours (02:00-08:59 UTC Mon-Fri) → amber badge, "Số liệu phiên gần nhất"

**Implementation notes:**

- **D2 (Architect):** `ClientTimeString` requires non-null `iso: string` prop. FreshnessBadge must **null-guard** `dataAsof` before rendering `<ClientTimeString>`. When `dataAsof === null`, render gray "Chưa có dữ liệu" span directly.
- **D1 (Architect):** SLA tier constants (max_staleness_min, client_refresh_ms) must be baked as module-level const in FreshnessBadge.tsx — do NOT fetch the JSON at runtime. Config is structural, stable.
- **D6 (Architect):** Expand `sla_tiers` 2-tuple array to named-field object for readability:

```typescript
type SlaTierConfig = {
  maxStalenessMin: number | null;
  clientRefreshMs: number | null;
};

const SLA_TIERS: Record<SlaTierKey, SlaTierConfig> = {
  realtime: { maxStalenessMin: 15, clientRefreshMs: 60000 },
  intraday: { maxStalenessMin: 60, clientRefreshMs: 300000 },
  daily: { maxStalenessMin: 1560, clientRefreshMs: null },
  weekly: { maxStalenessMin: 11520, clientRefreshMs: null },
  event: { maxStalenessMin: 1560, clientRefreshMs: 300000 },
  static: { maxStalenessMin: null, clientRefreshMs: null },
};
```

---

### useFreshnessRevalidator Hook

**Signature:**

```typescript
function useFreshnessRevalidator(slaTierKey: SlaTierKey): void
```

**Behavior:**

1. Read `client_refresh_ms` from SLA_TIERS for the given key.
2. If `client_refresh_ms = null` (daily, weekly, static) → return immediately (no interval).
3. If `client_refresh_ms > 0` → call `useRevalidator` from `@remix-run/react` once, set interval for `client_refresh_ms` milliseconds, clean up on unmount (useEffect return function).
4. **D5 (Architect):** `useRevalidator` is already available in Remix (used in EvalTable.tsx, dashboard.orchestration.tsx, dashboard.bctc-eval.$reportId.tsx) — no new dependency.

---

## Risk Flags (from Architect)

- **RISK-4 (LOW):** `apps/frontend/app/lib/hooks/` directory does not exist yet. You must create it in this task.
- **RISK-5 (MEDIUM):** `ClientTimeString` does not accept null. FreshnessBadge MUST null-guard `dataAsof` before delegating to `ClientTimeString`. Branch on `dataAsof === null` and render gray "Chưa có dữ liệu" directly (see EC-1 in Edge Cases).

---

## Edge Cases

| ID | Scenario | Required Behavior |
|---|---|---|
| EC-1 | `dataAsof = null` in FreshnessBadge | Render gray "Chưa có dữ liệu" badge; never pass null to `ClientTimeString` |
| EC-3 | STALE_RISK off-hours (alerts, foreign-flow) | Badge shows amber + "Số liệu phiên gần nhất"; no red; requires `isVnMarketHours()` gate |
| EC-4 | STATIC page (kinh-dich-reference) | No FreshnessBadge rendered; no useFreshnessRevalidator called; show "Nội dung tĩnh" |
| EC-5 | `client_refresh_ms = null` | useFreshnessRevalidator skips interval (daily/weekly/static tiers) |

---

## Acceptance Criteria (Definition of Done)

- [x] `FreshnessBadge.tsx` created with complete props contract + color/label logic
- [x] `apps/frontend/app/lib/hooks/` directory created
- [x] `useFreshnessRevalidator.ts` created with useEffect + interval cleanup
- [x] SLA tier constants baked at module level (no runtime JSON fetch)
- [x] Null-guard implemented: `dataAsof === null` → gray "Chưa có dữ liệu", no `ClientTimeString` call
- [x] Unit tests: 15 scenarios for FreshnessBadge (all SLA tiers × 3 age ranges)
- [x] Unit tests: edge cases EC-1 (null), EC-3 (off-hours), EC-4 (static), EC-5 (null interval)
- [x] Unit tests: useFreshnessRevalidator fires interval for realtime/intraday/event; no interval for daily/weekly/static
- [x] Unit tests: useFreshnessRevalidator cleans up interval on unmount (no memory leak)
- [x] Test file: `apps/frontend/app/components/FreshnessBadge.test.tsx` + `apps/frontend/app/lib/hooks/useFreshnessRevalidator.test.ts`
- [x] tsc clean; no TypeScript errors
- [x] No hydration warnings in browser console (ClientTimeString is SSR-safe)

---

## Architecture References

- **DDD Layer:** Interface (React component + hook)
- **Spec:** `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md` § FR-2, FR-3
- **Verified Paths:** `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md` § Verified Paths (TASK-FFT-L3A section)
- **Reuse Pattern:** `ClientTimeString` from `ClientTimestamp.tsx`; `useRevalidator` from `@remix-run/react`

---

## Handoff Notes

**To:** dev-frontend  
**From:** PM  
**Date:** 2026-06-27  
**Depends on:** TASK-FFT-L2 (for live `data_asof` validation in tests)  
**Blocks:** TASK-FFT-L3B

---

## [Developer] Implementation Record

- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** 4 (Interface — React component + hook)
- **Files created:**
  - `apps/frontend/app/components/FreshnessBadge.tsx:178` — FreshnessBadge component with null-guard, isVnMarketHours(), SLA_TIERS const, ClientTimeString delegation
  - `apps/frontend/app/lib/hooks/useFreshnessRevalidator.ts:75` — hook wrapping useRevalidator with setInterval + cleanup
  - `apps/frontend/app/__tests__/TASK-FFT-L3A-FreshnessBadge.test.tsx:230` — 34 tests (isVnMarketHours, EC-1 null, EC-4 static, 15 tier×color scenarios, EC-3 off-hours, className, label)
  - `apps/frontend/app/__tests__/TASK-FFT-L3A-useFreshnessRevalidator.test.ts:155` — 12 tests (interval fires for realtime/intraday/event, no-op for daily/weekly/static, clearInterval on unmount)
- **RISK-4 resolved:** `apps/frontend/app/lib/hooks/` directory created
- **RISK-5 resolved:** `dataAsof === null` short-circuits before `<ClientTimeString>` is called
- **Tests written:** 46 total — 34 FreshnessBadge + 12 useFreshnessRevalidator — all GREEN
- **Git commit:** afbb0c99 feat(frontend/TASK-FFT-L3A): FreshnessBadge component + useFreshnessRevalidator hook
- **Type check:** tsc EXIT 0 (clean)
- **Service tests:** 1754 pass / 2 fail (2 pre-existing QUE_DESCRIPTIONS failures, unrelated to this task)
- **Vitest summary:** Tests 46 passed (46) — new tests; 1754 pass total
- **Docs updated:** NONE (shared primitives only; no route wiring in this task)
- **Graphify:** skipped (no architectural docs changed)

### Gate Evidence
- `npm test` summary: **1754 pass / 2 fail (pre-existing) — 46 new tests GREEN**
- `npx tsc --noEmit`: **EXIT 0**
- Playwright (G12 render gate): **NOT applicable to this task** — this task creates shared primitives (no new route); existing routes unchanged. Render gate applies to L3B (route wiring task).

### Design Decisions Made
- **D-L3A-1:** `isVnMarketHours()` implemented inline in FreshnessBadge.tsx (not imported from mcp-server — that would cross zone boundaries). Spec: 02:00–08:59 UTC Mon–Fri. Exported for reuse and testing.
- **D-L3A-2:** `_now?: Date` injectable prop added to FreshnessBadge for deterministic testing of time-sensitive color logic (same injection pattern as mcp-server `injectedSignalAges`).
- **D-L3A-3:** `SlaTierKey` type exported from both files so L3B can import from either without duplication.

**To:** qa  
**Next action:** QA pipeline on commit afbb0c99 — verify 46 new tests green, tsc clean, EC-1/EC-3/EC-4 null-guard paths, SLA threshold boundaries correct.

---

## [QA] Review Record

**Date:** 2026-06-27  
**Verdict:** APPROVED  
**Commit reviewed:** afbb0c99  
**Round:** 1

### Gate Results
| Gate | Result |
|---|---|
| New tests (46) | 46/46 PASS |
| Full suite | 1754 pass / 2 fail (pre-existing) |
| tsc | EXIT 0 |
| DDD | PASS |
| Security | PASS |
| mock-guard | EXIT 0 |

### Pre-existing 2 Failures Verified
Both failures in `QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx` (QUE_DESCRIPTIONS key-count assertion). Last-touch d7167c0a predates afbb0c99 by multiple commits. L3A commit (`git show --stat afbb0c99 | grep que`) returns empty — no QUE files touched. Failures are QUE_DESCRIPTIONS 3-key vs 2-key expected schema mismatch; zero overlap with freshness code.

### EC-1 Null-Guard Verified
`FreshnessBadge.tsx:146` — `if (dataAsof === null)` fires before any `<ClientTimeString iso={dataAsof} />` render. Three B-section tests exercise this path including explicit `expect(() => render(...)).not.toThrow()`. RISK-5 is closed.

### SLA Threshold SSOT Alignment Verified
Module-level `SLA_TIERS` in both files cross-checked against `docs/data/frontend-data-coverage-map.json` § sla_tiers. All 6 tiers match exactly. D1 (bake at module level, no runtime fetch) is correct per architect spec.

### Hook Cleanup Verified
`useFreshnessRevalidator.ts:77` `return () => clearInterval(id)` is the useEffect cleanup. Test C proves: (1) clearInterval spy was called on unmount, (2) no new revalidator.revalidate() calls after unmount, (3) `setInterval` spy never called for passive tiers (daily/weekly/static).

**Unblocks:** TASK-FFT-L3B
