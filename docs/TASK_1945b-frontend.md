# TASK 1945b-frontend — AccuracyDigestCard Component + Types + Fetch Helpers

**Task ID:** 1945b-frontend  
**Sprint:** 1945 TIER 2b  
**Owner:** dev-frontend  
**Type:** FEATURE  
**Priority:** MEDIUM  
**Zone:** `apps/frontend/`  
**Time estimate:** ~2.5h  
**Arch brief:** `docs/architecture-briefs/2026-05-18-accuracy-digest-frontend-card.md`

---

## Context

ARCH-1945b is complete. This task delivers the frontend component and wiring. **Blocked by 1945b-backend** — HTTP endpoint must exist before this task begins.

**Dependency graph:**
- Blocks: none
- Blocked by: 1945b-backend (HTTP endpoint required for testing)
- Parallel: 1945a (verdict-resolution fix) — no shared files

**Existing components:**
- `SectionCard` component at `dashboard.analysis.tsx:215–239` ✓ (reused as-is)
- `accuracyBadgeProps()` colour thresholds at `client.ts:372–387` ✓ (referenced for digest row colours)
- `ClientTimestamp` component at `components/ClientTimestamp.tsx` ✓ (for hydration safety, if needed)

---

## Deliverables

### 1. Frontend domain types (domain/market.ts)

**File:** `apps/frontend/app/domain/market.ts`  
**Change type:** MODIFY  
**Insertion point:** After line 168 (after `AgentSignal` interface closes)  
**Approx. lines:** 25

```typescript
// --------------------------------------------------------------------------
// Accuracy digest types (system-level, Sprint 1945b)
// --------------------------------------------------------------------------

/**
 * Per-signal-type row in the system accuracy digest.
 * signal_types with ≥ 3 resolved samples only.
 */
export interface SignalTypeAccuracyDigest {
  signal_type: string;
  correct: number;
  total: number;
  /** correct / total (0–1). */
  rate: number;
}

/**
 * System-level accuracy digest response.
 * Mirrors SystemAccuracyDigestStats from signalOutcomeStore.ts
 * plus server-side generatedAt timestamp.
 */
export interface AccuracyDigestStats {
  totalResolved: number;
  totalCorrect: number;
  /** null when totalResolved < 10 */
  overallRate: number | null;
  bySignalType: SignalTypeAccuracyDigest[];
  newStocksCount: number;
  /** Rows with outcome_24h='neutral' AND predicted_direction!='NEUTRAL' */
  neutralOnlyRows: number;
  generatedAt: string; // ISO-8601
}
```

**Design notes:**
- `SignalTypeAccuracyDigest` ≠ `SignalTypeAccuracy` (backend type) — avoid naming collision
- `overallRate: number | null` — null when < 10 resolved samples (per BA spec)
- `generatedAt` is server timestamp, included in response for audit trail (not rendered in card UI per R-2)

---

### 2. Fetch helpers (client.ts)

**File:** `apps/frontend/app/lib/api/client.ts`  
**Change type:** MODIFY  
**Insertion point:** After line 519 (after `fetchCascadeSignals` closes), before `// Macro snapshot` comment  
**Approx. lines:** 30

First, add import at top of file (alongside other `domain/market` imports):

```typescript
import type { AccuracyDigestStats } from "~/domain/market";
```

Then add the two functions:

```typescript
// --------------------------------------------------------------------------
// Accuracy digest (system-level, Sprint 1945b)
// --------------------------------------------------------------------------

/**
 * System-level accuracy digest.
 * Endpoint: GET /mcp/api/accuracy/digest?days=30
 * Non-fatal — callers should catch and treat as null on failure.
 */
export async function fetchAccuracyDigest(days = 30): Promise<AccuracyDigestStats | null> {
  try {
    const raw = await apiGet<unknown>(`/mcp/api/accuracy/digest?days=${days}`);
    if (raw === null || typeof raw !== "object") return null;
    return raw as AccuracyDigestStats;
  } catch {
    return null;
  }
}

/**
 * Derive UI state from accuracy digest response.
 * Used for state discriminator in AccuracyDigestCard.
 * Extracted for testability (pure function, no React dependency).
 */
export function deriveAccuracyDigestState(
  data: AccuracyDigestStats | null
): "loading" | "empty" | "all-neutral" | "insufficient-sample" | "partial" | "normal" {
  if (data === null) return "loading";
  if (data.totalResolved === 0 && data.neutralOnlyRows === 0) return "empty";
  if (data.totalResolved === 0 && data.neutralOnlyRows > 0) return "all-neutral";
  if (data.bySignalType.length === 0 && data.totalResolved > 0) return "insufficient-sample";
  if (data.bySignalType.length >= 1 && data.bySignalType.length < 3) return "partial";
  return "normal";
}
```

**Design notes:**
- `fetchAccuracyDigest()` is non-fatal; returns null on any error (HTTP 500, network, parse failure)
- `deriveAccuracyDigestState()` is a pure function with no side effects — can be unit-tested independently
- 6 states mapped to render conditions in component

---

### 3. Loader integration (dashboard.analysis.tsx)

**File:** `apps/frontend/app/routes/dashboard.analysis.tsx`  
**Change type:** MODIFY — 4 places  

#### 3a. Module-level constant (before loader, ~line 30)

```typescript
// Seeding window end date — 1945b-signal-outcomes-seed-window AC.
const ACCURACY_SEEDING_WINDOW_END = "2026-05-25";
```

#### 3b. Imports (top of file, ~line 5–20 area)

Add to existing imports:

```typescript
import { fetchAccuracyDigest } from "~/lib/api/client";
import type { AccuracyDigestStats } from "~/domain/market";
```

#### 3c. LoaderData interface (lines 54–75 area)

Add field to the LoaderData interface:

```typescript
export interface LoaderData {
  // ...existing fields...
  accuracyDigest: AccuracyDigestStats | null;
}
```

#### 3d. Loader Promise.allSettled block (lines 87–91 area)

Extend the settled promises array to include accuracy fetch. Current pattern:

```typescript
const [marketResult, snapshotResult, ...readingResults] =
  await Promise.allSettled([
    fetchKinhDichMarket(),
    fetchMacroSnapshot(),
    ...KD_SAMPLE_TICKERS.map((t) => fetchKinhDichReading(t)),
  ]);
```

Updated pattern:

```typescript
const [marketResult, snapshotResult, accuracyResult, ...readingResults] =
  await Promise.allSettled([
    fetchKinhDichMarket(),
    fetchMacroSnapshot(),
    fetchAccuracyDigest(30),
    ...KD_SAMPLE_TICKERS.map((t) => fetchKinhDichReading(t)),
  ]);
```

Then resolve accuracy with non-fatal fallback:

```typescript
const accuracyDigest =
  accuracyResult.status === "fulfilled" ? accuracyResult.value : null;
```

Finally, add `accuracyDigest` to the `json<LoaderData>({...})` return:

```typescript
return json<LoaderData>({
  // ...existing fields...
  accuracyDigest,
});
```

**Design notes:**
- Accuracy fetch is parallel, non-fatal (entire page renders even if it fails)
- Index shift: market=0, snapshot=1, accuracy=2, readings=3+
- Non-fatal fallback: `null` on any error

---

### 4. Component (dashboard.analysis.tsx, inline)

**File:** `apps/frontend/app/routes/dashboard.analysis.tsx`  
**Change type:** MODIFY — 3 places  

#### 4a. Colour helper function (before component, ~line 215 area)

```typescript
function digestRateColor(rate: number): string {
  if (rate >= 0.70) return "text-green-400";
  if (rate >= 0.40) return "text-amber-400";
  return "text-red-400";
}
```

This matches `accuracyBadgeProps()` thresholds exactly.

#### 4b. AccuracyDigestCard component (inline, ~line 250–450 area)

Add the component before JSX rendering begins:

```typescript
/**
 * System-level accuracy digest card — 6 states.
 * Displays top-3 / bottom-3 signal types by accuracy rate.
 * Non-fatal — shows graceful degradation on null data or errors.
 */
function AccuracyDigestCard({
  data,
  seedingWindowEnd,
}: {
  data: AccuracyDigestStats | null;
  seedingWindowEnd: string;
}) {
  const state = deriveAccuracyDigestState(data);

  if (state === "loading") {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <div className="h-5 w-24 bg-slate-800 animate-pulse rounded" />
            <div className="h-5 w-16 bg-slate-800 animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (state === "empty") {
    return (
      <p className="text-sm text-slate-400">
        No accuracy data yet. Signal outcomes are being seeded — check back after {seedingWindowEnd}.
      </p>
    );
  }

  if (state === "all-neutral") {
    return (
      <p className="text-sm text-slate-400">
        All resolved outcomes are neutral — no directional accuracy measurable yet. ({data!.neutralOnlyRows} neutral outcomes recorded)
      </p>
    );
  }

  if (state === "insufficient-sample") {
    return (
      <p className="text-sm text-slate-400">
        No signal types have ≥3 resolved samples yet. ({data!.totalResolved} resolved rows recorded — tracking in progress)
      </p>
    );
  }

  // Partial or normal state — render table
  const displayRows = data!.bySignalType;
  const topThree = displayRows.slice(0, 3);
  const bottomThree = displayRows.slice(-3).reverse();
  const uniqueRows = Array.from(new Map(
    [...topThree, ...bottomThree].map(r => [r.signal_type, r])
  ).values());

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 text-xs">
        {/* Top-3 column header */}
        <div>
          <p className="text-slate-500 font-semibold mb-2">Best</p>
          {topThree.map((row) => (
            <div key={row.signal_type} className="flex justify-between gap-2 py-1 border-b border-slate-700">
              <span className="truncate">{row.signal_type}</span>
              <span className={`font-mono font-semibold ${digestRateColor(row.rate)}`}>
                {(row.rate * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        {/* Bottom-3 column header */}
        <div>
          <p className="text-slate-500 font-semibold mb-2">Worst</p>
          {bottomThree.map((row) => (
            <div key={row.signal_type} className="flex justify-between gap-2 py-1 border-b border-slate-700">
              <span className="truncate">{row.signal_type}</span>
              <span className={`font-mono font-semibold ${digestRateColor(row.rate)}`}>
                {(row.rate * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-4 pt-2 border-t border-slate-700 text-xs text-slate-400">
        {data!.overallRate === null ? (
          <p>
            System: n/a <span className="text-slate-600">(need 10+ resolved)</span>
          </p>
        ) : (
          <p>
            System: <span className="font-semibold text-slate-200">{(data!.overallRate * 100).toFixed(1)}%</span>{" "}
            <span className="text-slate-600">
              ({data!.totalCorrect.toLocaleString("vi-VN")} / {data!.totalResolved.toLocaleString("vi-VN")} total)
            </span>{" "}
            · {data!.newStocksCount} stocks still seeding
          </p>
        )}
      </div>
    </div>
  );
}
```

**Design notes:**
- 6 state discriminators (loading/empty/all-neutral/insufficient/partial/normal)
- Colour helper applied to each row (rate ≥ 0.70 = green, ≥ 0.40 = amber, else red)
- Top-3 and bottom-3 without duplication: unique rows computed, rendered in two columns
- Footer handles `overallRate === null` guard (< 10 samples)
- Count formatting: `toLocaleString("vi-VN")` for thousands separator
- Percentage formatting: `.toFixed(1)` + `%` (EC-7 — no locale percentage format)

#### 4c. SectionCard insertion (lines 1417–1418 area)

After the Kinh Dịch — Cổ phiếu mẫu SectionCard closes (line 1417), add:

```tsx
{/* Signal Accuracy digest — always visible, non-fatal */}
<SectionCard title="Signal Accuracy" subtitle="30d · top-3 / bottom-3">
  <AccuracyDigestCard
    data={accuracyDigest}
    seedingWindowEnd={ACCURACY_SEEDING_WINDOW_END}
  />
</SectionCard>
```

Destructure `accuracyDigest` from `useLoaderData<typeof loader>()` at the top of JSX section.

---

### 5. Test file

**File:** `apps/frontend/app/__tests__/1945b-accuracy-digest-card.test.ts`  
**Change type:** CREATE  
**Approx. lines:** 150–180 (16 test cases)

Test cases (one per state or boundary):

| Group | Test | Scenario | Assert |
|-------|------|----------|--------|
| `fetchAccuracyDigest` | HTTP 200 | Valid response | Returns `AccuracyDigestStats` with all fields |
| | HTTP 500 | Server error | Returns null |
| | Network error | Connection fails | Returns null |
| | Null body | Response is null | Returns null |
| | Non-object | Response is string | Returns null |
| `deriveAccuracyDigestState` | null input | loading state | Returns `"loading"` |
| | empty (0/0) | empty state | Returns `"empty"` |
| | all-neutral (0/N) | all-neutral state | Returns `"all-neutral"` |
| | insufficient (N/[]) | insufficient state | Returns `"insufficient-sample"` |
| | partial (N/[..., ...,]) | partial state | Returns `"partial"` |
| | normal (N/[..., ..., ...]) | normal state | Returns `"normal"` |
| `digestRateColor` | rate=0.70 | green threshold | Returns `"text-green-400"` |
| | rate=0.69 | amber zone | Returns `"text-amber-400"` |
| | rate=0.40 | amber threshold | Returns `"text-amber-400"` |
| | rate=0.39 | red zone | Returns `"text-red-400"` |
| Footer | overallRate=null | insufficient sample | Contains "n/a" + "need 10+" |
| Component | 3+ bySignalType | normal render | Top-3 + bottom-3 columns |

Follow the pattern used in `1940-accuracy-badge.test.ts` (same test infrastructure).

---

## Acceptance Criteria

**AC-1: Normal render (bySignalType ≥ 3)**
- Component displays top-3 + bottom-3 signal types in two-column grid
- Each row shows signal_type name + rate as percentage (X.X%)
- Colours match thresholds: 0.70+ green, 0.40–0.69 amber, <0.40 red
- Footer shows overall rate + count + newStocksCount

**AC-2: Empty state (totalResolved=0, neutralOnlyRows=0)**
- Card displays: "No accuracy data yet. Signal outcomes are being seeded — check back after {seedingWindowEnd}."
- `seedingWindowEnd` correctly interpolated to "2026-05-25"

**AC-3: Insufficient-sample state (totalResolved>0, bySignalType=[])**
- Card displays: "No signal types have ≥3 resolved samples yet. (N resolved rows recorded — tracking in progress)"
- Actual totalResolved count interpolated

**AC-4: All-neutral state (totalResolved=0, neutralOnlyRows>0)**
- Card displays: "All resolved outcomes are neutral — no directional accuracy measurable yet. (N neutral outcomes recorded)"
- Actual neutralOnlyRows count interpolated

**AC-5: Non-fatal degradation (HTTP 500)**
- Fetch returns null
- Loader returns `accuracyDigest: null`
- Component shows loading state (skeleton) or empty state gracefully
- Rest of page renders without error

**AC-6: HTTP handler clamps days param** *(verified in 1945b-backend)*
- Backend already tested; frontend fetches with `days=30` default

**AC-7: Colour coding matches thresholds**
- rate ≥ 0.70 → `text-green-400`
- 0.40 ≤ rate < 0.70 → `text-amber-400`
- rate < 0.40 → `text-red-400`
- Matches `accuracyBadgeProps()` logic exactly

---

## Risk Flags

**R-1 (LOW) — Type mismatch: `SignalTypeAccuracyDigest` vs `SignalTypeAccuracy`**

`signalOutcomeStore.ts` exports `SignalTypeAccuracy` (backend type). Frontend creates parallel type `SignalTypeAccuracyDigest` to avoid collision with existing per-stock `SignalAccuracy` type. Do NOT import or re-export backend type — create the new frontend type.

**R-2 (LOW) — `generatedAt` field hydration**

`generatedAt` is a server-generated timestamp. If displayed in JSX, it causes hydration mismatch (server renders at T0, client rehydrates at T1, timestamp differs). BA spec §3 does NOT require displaying `generatedAt` in card UI. Current design: omit from rendered output. If debugging timestamp needed, use `<ClientTimestamp>` component (Sprint 1936 precedent).

**R-3 (LOW) — `Promise.allSettled` index shift**

Adding `fetchAccuracyDigest(30)` as the third leg (after snapshot) changes destructuring indices. The spread `...readingResults` handles this automatically, but verify indices are correct:
- `marketResult` = index 0 ✓
- `snapshotResult` = index 1 ✓
- `accuracyResult` = index 2 ✓
- `readingResults` = indices 3+ ✓

---

## Testing Checklist

- [ ] `bun test 1945b-accuracy-digest-card.test.ts` — all 16 tests GREEN
- [ ] `tsc` — 0 errors (type imports resolve)
- [ ] Component renders all 6 states without error
- [ ] Colours applied correctly per thresholds
- [ ] Footer guards `overallRate === null` correctly
- [ ] Count formatting uses `toLocaleString("vi-VN")`
- [ ] Percentage formatting uses `.toFixed(1)` (no locale)

---

## No-touch zones

- ✓ Do NOT modify `SectionCard` component (reuse as-is)
- ✓ Do NOT display `generatedAt` in rendered card (R-2)
- ✓ Do NOT call `accuracyBadgeProps()` directly (implement own colour logic inline)

---

## File Change Surface

| File | Change | Lines |
|------|--------|-------|
| `apps/frontend/app/domain/market.ts` | MODIFY — 2 new types | ~25 |
| `apps/frontend/app/lib/api/client.ts` | MODIFY — fetch helper + state helper | ~30 |
| `apps/frontend/app/routes/dashboard.analysis.tsx` | MODIFY — loader + component + SectionCard | ~100 |
| `apps/frontend/app/__tests__/1945b-accuracy-digest-card.test.ts` | CREATE — 16 test cases | ~150 |

---

## Blockers before starting

- [ ] 1945b-backend HTTP handler is live and tested
- [ ] `GET /api/accuracy/digest?days=30` returns 200 with valid schema

Once unblocked: all frontend work can proceed in parallel without backend changes.
