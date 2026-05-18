# ARCH-1945b — Accuracy Digest Frontend Card

**Date:** 2026-05-18
**Sprint:** 1945b
**Architect:** architect agent
**Status:** Design complete — ready for PM

---

## 1. Brownfield Scan Summary

### Zones touched (multi-zone)

| Zone | Files affected | Reason |
|------|----------------|--------|
| `apps/mcp-server/` | `src/interface/mcp/server.ts` | New HTTP handler |
| `apps/frontend/` | `app/routes/dashboard.analysis.tsx`, `app/lib/api/client.ts`, `app/domain/market.ts` | Component + fetch helper + domain type |

No `api-gateway` code change required (confirmed — see §2 Gateway proxy).

---

### Key findings

**F-1 — `getSystemAccuracyDigestStats` already fully implemented.**
`apps/mcp-server/src/infrastructure/db/signalOutcomeStore.ts` lines 380–481.
Function signature: `getSystemAccuracyDigestStats(db: Database, days = 30): SystemAccuracyDigestStats`.
Already exports `SystemAccuracyDigestStats` and `SignalTypeAccuracy` interfaces.
Table guard (lines 394–398) catches missing `signal_outcomes` table and returns zero struct silently.
No domain change needed — wire directly.

**F-2 — `signalOutcomeStore.ts` is already imported in `server.ts`.**
`server.ts` line 48: `import { getAccuracyStats } from "../../infrastructure/db/signalOutcomeStore.js"`.
Adding `getSystemAccuracyDigestStats` to this import is a one-line diff.

**F-3 — Exact HTTP handler insertion point confirmed.**
Pattern: `GET /api/signals/stock/:code` handler ends at `server.ts:1020` (`return;`).
Next handler starts at line 1022 (`POST /api/ohlcv-backfill-done`).
New `GET /api/accuracy/digest` handler inserts between lines 1020 and 1022.

**F-4 — SectionCard component confirmed at lines 215–239 of `dashboard.analysis.tsx`.**
It accepts `title`, `subtitle`, `children` props. No changes to `SectionCard` itself.

**F-5 — Last SectionCard in the page JSX confirmed.**
`dashboard.analysis.tsx` lines 1412–1417: `<SectionCard title="Kinh Dịch — Cổ phiếu mẫu" ...>`.
JSX closes at line 1418 (`</div>`), then `);` line 1419.
New `AccuracyDigestCard` SectionCard inserts between lines 1417 and 1418 (after `</SectionCard>`).

**F-6 — Loader already uses `Promise.allSettled` pattern (lines 87–91).**
Base data block resolves `marketResult`, `snapshotResult`, `readingResults` in one `Promise.allSettled`.
New accuracy fetch joins this same block as an additional settled leg.

**F-7 — `accuracyBadgeProps()` colour thresholds confirmed at `client.ts` lines 372–387.**
Thresholds: `rate >= 0.7` → green, `rate >= 0.4` → amber, else red.
The digest card row colouring must use these same numeric thresholds (not the badge component, but same logic).

**F-8 — No `fetchAccuracyDigest()` exists yet in `client.ts`.**
`grep` returned no match. New function to be added after `fetchCascadeSignals` (line 519) and before the Macro snapshot section (line 521).

**F-9 — `SignalAccuracy` type exists in `domain/market.ts` (line 146) — distinct from what is needed.**
`SignalAccuracy` is per-stock per-signal-type accuracy from the `signals/stock` endpoint.
`AccuracyDigestStats` is a new system-level type representing the `getSystemAccuracyDigestStats` response shape. Must be added to `domain/market.ts` after line 168.

**F-10 — Api-gateway proxy confirmed: no gateway change needed.**
`apps/api-gateway/pkg/infrastructure/registry.go` line 26: `"mcp"` service maps to `mcp-server:3000`.
Router `HandleProxy` strips leading `/:service` segment from path.
`GET /mcp/api/accuracy/digest` → strips `/mcp` → forwards `GET /api/accuracy/digest` to port 3000.
This catch-all is already live. No gateway code change.

**F-11 — `LoaderData` interface (implicit) currently has no accuracy field.**
Loader returns `json<LoaderData>({...})` at line 146. `LoaderData` is defined as an inline interface at the top of the file (lines 54–75). New `accuracyDigest: AccuracyDigestStats | null` field must be added.

---

## 2. Gateway Proxy — Confirmed Routing

```
Frontend browser → GET /mcp/api/accuracy/digest?days=30
  → api-gateway (port 4000) HandleProxy
  → strips /mcp prefix
  → forwards GET /api/accuracy/digest?days=30 to mcp-server:3000
  → new handler in server.ts calls getSystemAccuracyDigestStats(db, days)
  → returns SystemAccuracyDigestStats as JSON (+ generatedAt timestamp)
```

No api-gateway code change. No new route file. No VPS involvement.

---

## 3. New Frontend Types (domain/market.ts)

Insert after line 168 (after `AgentSignal` interface closes):

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

---

## 4. HTTP Handler (server.ts)

### Import diff

`server.ts` line 48 — extend existing signalOutcomeStore import:

```typescript
// Before:
import { getAccuracyStats } from "../../infrastructure/db/signalOutcomeStore.js";

// After:
import { getAccuracyStats, getSystemAccuracyDigestStats } from "../../infrastructure/db/signalOutcomeStore.js";
```

### Handler insertion point

**Insert after line 1020** (after the `GET /api/signals/stock/:code` handler's closing `return;`), before line 1022 (the `POST /api/ohlcv-backfill-done` handler).

```typescript
// ── GET /api/accuracy/digest — system-level accuracy digest for frontend ─
// Returns getSystemAccuracyDigestStats aggregated over `days` look-back.
// Non-authenticated — read-only, no sensitive data.
// days param: integer, default 30, clamped [1, 90] (EC-5).
if (method === "GET" && pathname === "/api/accuracy/digest") {
  const daysParam = url.searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam ?? "30", 10) || 30, 1), 90);
  try {
    const stats = getSystemAccuracyDigestStats(db, days);
    const body = { ...stats, generatedAt: new Date().toISOString() };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    log.error("[accuracy/digest] query error", { error: err instanceof Error ? err.message : String(err) });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
  return;
}
```

**DDD layer:** interface — HTTP request handler in `apps/mcp-server/src/interface/mcp/server.ts`.

**Notes:**
- `getSystemAccuracyDigestStats` already has its own internal try/catch and table guard returning zero struct. The outer try/catch in the handler catches unexpected errors only.
- `generatedAt` is appended at HTTP handler level (server timestamp of response, as per BA spec §2c).
- No authentication (read-only, same pattern as `/api/signals/stock/:code`).

---

## 5. Fetch Helper (client.ts)

**Insert after line 519** (after `fetchCascadeSignals` closes, before the `// Macro snapshot` comment block).

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
```

**Import dependency:** `AccuracyDigestStats` must be imported at the top of `client.ts` from `~/domain/market` (alongside existing imports from that file).

---

## 6. Component Breakdown

### 6a. Loader changes (dashboard.analysis.tsx)

**Constant at module level (loader-level, not JSX):**
```typescript
// Seeding window end date — 1945b-signal-outcomes-seed-window AC.
const ACCURACY_SEEDING_WINDOW_END = "2026-05-25";
```

**LoaderData interface** — add field:
```typescript
accuracyDigest: AccuracyDigestStats | null;
```

**Loader `Promise.allSettled` base block** — add accuracy fetch as a parallel leg alongside the existing `fetchKinhDichMarket()`, `fetchMacroSnapshot()`, `...KD_SAMPLE_TICKERS.map(...)` calls. Pattern:
```typescript
const [marketResult, snapshotResult, accuracyResult, ...readingResults] =
  await Promise.allSettled([
    fetchKinhDichMarket(),
    fetchMacroSnapshot(),
    fetchAccuracyDigest(30),
    ...KD_SAMPLE_TICKERS.map((t) => fetchKinhDichReading(t)),
  ]);
```

Resolve accuracy with non-fatal fallback:
```typescript
const accuracyDigest =
  accuracyResult.status === "fulfilled" ? accuracyResult.value : null;
```

Add `accuracyDigest` to the `json<LoaderData>({...})` return.

**Import addition at top of file:**
```typescript
import { fetchAccuracyDigest } from "~/lib/api/client";
import type { AccuracyDigestStats } from "~/domain/market";
```

### 6b. AccuracyDigestCard component (inline in dashboard.analysis.tsx)

New component `AccuracyDigestCard` added inline in `dashboard.analysis.tsx`, following the existing inline-component pattern (SectionCard, KinhDichMarketPanel, etc.).

**Props:**
```typescript
function AccuracyDigestCard({
  data,
  seedingWindowEnd,
}: {
  data: AccuracyDigestStats | null;
  seedingWindowEnd: string;
})
```

**Discriminator logic — 6 states mapped to conditions:**

| State | Condition | Render |
|-------|-----------|--------|
| Loading/null | `data === null` | Skeleton: 2 grey placeholder rows per column (`bg-slate-800 animate-pulse`) |
| Empty | `data.totalResolved === 0 && data.neutralOnlyRows === 0` | "No accuracy data yet. Signal outcomes are being seeded — check back after {seedingWindowEnd}." |
| All-neutral | `data.totalResolved === 0 && data.neutralOnlyRows > 0` | "All resolved outcomes are neutral — no directional accuracy measurable yet. (N neutral outcomes recorded)" |
| Insufficient-sample | `data.bySignalType.length === 0 && data.totalResolved > 0` | "No signal types have ≥3 resolved samples yet. (N resolved rows recorded — tracking in progress)" |
| Partial | `data.bySignalType.length >= 1 && data.bySignalType.length < 3` | Show available rows only — no placeholder rows. Footer row. |
| Normal | `data.bySignalType.length >= 3` | Top-3 + Bottom-3 columns + footer row. |

**Colour helper (inline, reuses same thresholds as `accuracyBadgeProps`):**
```typescript
function digestRateColor(rate: number): string {
  if (rate >= 0.70) return "text-green-400";
  if (rate >= 0.40) return "text-amber-400";
  return "text-red-400";
}
```

**Rate display:** `(rate * 100).toFixed(1) + "%"` (EC-7 — no `toLocaleString` for percentages).
**Count display:** `count.toLocaleString("vi-VN")`.

**Footer — overallRate null guard:**
When `overallRate === null`: render `System: n/a (need 10+ resolved)`.
When not null: render `System: X.X% (N correct / M total) · K stocks still seeding`.

**NFR-5 compliance:** Do not display `generatedAt` directly in JSX without `suppressHydrationWarning` or `ClientTimestamp`. If `generatedAt` is shown it must use `ClientTimestamp` component (per Sprint 1936 precedent at `apps/frontend/app/components/ClientTimestamp.tsx`). BA spec §3 does not require displaying `generatedAt` in the card UI — omit it from the rendered card.

### 6c. SectionCard insertion (dashboard.analysis.tsx)

**Insertion point: after line 1417** (after `</SectionCard>` closing the "Kinh Dịch — Cổ phiếu mẫu" section, before the `</div>` at line 1418).

```tsx
{/* Signal Accuracy digest — always visible, non-fatal */}
<SectionCard title="Signal Accuracy" subtitle="30d · top-3 / bottom-3">
  <AccuracyDigestCard
    data={accuracyDigest}
    seedingWindowEnd={ACCURACY_SEEDING_WINDOW_END}
  />
</SectionCard>
```

`accuracyDigest` is destructured from `useLoaderData<typeof loader>()`.

---

## 7. DDD Layer Assignments

| Artefact | Layer | File | Action |
|----------|-------|------|--------|
| `getSystemAccuracyDigestStats` | infrastructure/db | `signalOutcomeStore.ts:380` | REUSE — no change |
| `SystemAccuracyDigestStats` interface | infrastructure/db (type) | `signalOutcomeStore.ts:354` | REUSE — no change |
| `GET /api/accuracy/digest` handler | interface | `server.ts:~1021` | CREATE — inline handler |
| `AccuracyDigestStats` frontend type | interface/domain | `domain/market.ts:~169` | CREATE — new interface |
| `SignalTypeAccuracyDigest` frontend type | interface/domain | `domain/market.ts:~169` | CREATE — new interface |
| `fetchAccuracyDigest()` | interface | `client.ts:~521` | CREATE — new function |
| Loader accuracy leg | interface/application | `dashboard.analysis.tsx:~87` | MODIFY — add to allSettled |
| `AccuracyDigestCard` component | interface | `dashboard.analysis.tsx:~1200` | CREATE — inline component |
| `ACCURACY_SEEDING_WINDOW_END` constant | interface | `dashboard.analysis.tsx:~30` | CREATE — module-level const |

---

## 8. Test Strategy

### 8a. Frontend Vitest tests

**File:** `apps/frontend/app/__tests__/1945b-accuracy-digest-card.test.ts`

Following the naming convention of `1940-accuracy-badge.test.ts` (same test infrastructure).

**Test cases required (one per state transition):**

| Test group | Scenario | What to assert |
|------------|----------|----------------|
| `fetchAccuracyDigest` | HTTP 200 valid response | Returns `AccuracyDigestStats` with all fields |
| `fetchAccuracyDigest` | HTTP 500 | Returns null (non-fatal) |
| `fetchAccuracyDigest` | Network error | Returns null (non-fatal) |
| `fetchAccuracyDigest` | Null/non-object body | Returns null |
| State discriminator — Empty | `totalResolved=0, neutralOnlyRows=0` | State = "empty" |
| State discriminator — All-neutral | `totalResolved=0, neutralOnlyRows=3` | State = "all-neutral" |
| State discriminator — Insufficient | `totalResolved=5, bySignalType=[]` | State = "insufficient-sample" |
| State discriminator — Partial | `bySignalType.length=2` | State = "partial" |
| State discriminator — Normal | `bySignalType.length=3` | State = "normal" |
| `digestRateColor` | `rate=0.70` | Returns `"text-green-400"` |
| `digestRateColor` | `rate=0.69` | Returns `"text-amber-400"` |
| `digestRateColor` | `rate=0.40` | Returns `"text-amber-400"` |
| `digestRateColor` | `rate=0.39` | Returns `"text-red-400"` |
| Footer — `overallRate=null` | `totalResolved=5` | Contains "n/a" + "need 10+" |
| EC-3 — Top/Bottom overlap | `bySignalType.length=3` | Same 3 entries appear in both top-3 and bottom-3 |
| EC-7 — Rate formatting | `rate=0.667` | Renders as `"66.7%"` not `"66,7%"` |

State discriminator logic (pure function, no React dependency) must be extracted from the component and unit-tested independently — see `parseAccuracyFromResponse` pattern in `1940-accuracy-badge.test.ts`.

Export `deriveAccuracyDigestState(data: AccuracyDigestStats): "empty" | "all-neutral" | "insufficient-sample" | "partial" | "normal"` from `client.ts` or as a standalone helper so tests can import it without React.

### 8b. HTTP handler test (mcp-server)

**File:** `apps/mcp-server/src/__tests__/1945b-accuracy-digest-handler.test.ts`

```typescript
// Mock getSystemAccuracyDigestStats from signalOutcomeStore
// Test cases:
// 1. days=30 (default) → calls function with days=30
// 2. days=200 → clamps to days=90
// 3. days=0 → clamps to days=1
// 4. days absent → defaults to days=30
// 5. Function throws → returns 500 with { error: "internal error" }
// 6. Signal_outcomes table absent (function returns zero struct) → returns 200 with zero struct + generatedAt
```

Mock strategy: `vi.mock("../../infrastructure/db/signalOutcomeStore.js", ...)` to inject controlled return values without a real SQLite connection. Same pattern as existing mcp-server tests.

---

## 9. Risk Flags

**R-1 (LOW) — Type mismatch: `SignalTypeAccuracyDigest` vs `SignalTypeAccuracy` naming.**
`signalOutcomeStore.ts` exports `SignalTypeAccuracy`. The frontend domain type is named `SignalTypeAccuracyDigest` to avoid collision with the existing per-stock `SignalAccuracy` type in `domain/market.ts`. Developer must NOT re-export or import `SignalTypeAccuracy` from the store — create the parallel frontend type.

**R-2 (LOW) — `generatedAt` field hydration.**
`generatedAt` is a server-generated timestamp. If displayed in JSX, it will cause hydration mismatch (server renders one timestamp, client rehydrates with another). BA spec §3 does not require displaying `generatedAt` in the card UI. If added for debugging, wrap in `<ClientTimestamp>` (Sprint 1936 component at `apps/frontend/app/components/ClientTimestamp.tsx`). Current design: omit from rendered card.

**R-3 (LOW) — `Promise.allSettled` index shift.**
Adding `fetchAccuracyDigest(30)` as the third leg changes the destructuring indices for `readingResults`. The spread `...readingResults` handles this automatically but the developer must verify the positional destructuring remains correct after insertion (market=0, snapshot=1, accuracy=2, readings=3+).

**R-4 (MEDIUM) — `days` param injection in SQL template literal.**
`getSystemAccuracyDigestStats` uses a template literal `datetime('now', '-${days} days')` in the SQL query (lines 411, 434, 451, 463). The `days` value is already clamped `[1, 90]` by the HTTP handler before being passed to the function. The function itself does not clamp. Developer must ensure the HTTP handler clamping runs before the function call, not after. This is already in the design (`Math.min(Math.max(...), 90)` before `getSystemAccuracyDigestStats(db, days)`).

**R-5 (SPIKE-1945 isolation) — Do NOT touch `verdictResolutionJob.ts` or `alert_accuracy` tables.**
SPIKE-1945 is running in parallel. `signalOutcomeStore.ts` is read-only in this task. No schema changes. No writes to `signal_outcomes`. Read path only.

---

## 10. File Change Surface

| File | Change type | Zone |
|------|-------------|------|
| `apps/mcp-server/src/interface/mcp/server.ts` | MODIFY — import + new handler (~20 lines) | mcp-server |
| `apps/mcp-server/src/__tests__/1945b-accuracy-digest-handler.test.ts` | CREATE — 6 test cases | mcp-server |
| `apps/frontend/app/domain/market.ts` | MODIFY — 2 new interfaces (~25 lines) | frontend |
| `apps/frontend/app/lib/api/client.ts` | MODIFY — new fetch helper + state helper (~30 lines) | frontend |
| `apps/frontend/app/routes/dashboard.analysis.tsx` | MODIFY — loader + component + SectionCard (~100 lines) | frontend |
| `apps/frontend/app/__tests__/1945b-accuracy-digest-card.test.ts` | CREATE — 16 test cases | frontend |

Total: 4 file modifications, 2 new test files. No new route files. No schema changes. No VPS changes. No api-gateway changes.

---

## 11. Child Task Definition

### Task 1945b

| Field | Value |
|-------|-------|
| **Task ID** | 1945b |
| **Type** | FEATURE |
| **Priority** | MEDIUM |
| **Owner** | dev-frontend + dev-api-gateway |
| **Zone** | `apps/frontend/` + `apps/mcp-server/` |
| **Sprint** | 1945 TIER 2 |
| **BA spec** | `docs/REQ_1945b-accuracy-digest-frontend-card.md` |
| **Arch brief** | `docs/architecture-briefs/2026-05-18-accuracy-digest-frontend-card.md` |
| **Parallel isolation** | Sequential (touches shared `dashboard.analysis.tsx` + `client.ts` + `server.ts`) |

**Delivery sequence (sequential, single developer handles both zones):**

1. Add `AccuracyDigestStats` + `SignalTypeAccuracyDigest` to `domain/market.ts`
2. Add `fetchAccuracyDigest()` + `deriveAccuracyDigestState()` to `client.ts`
3. Write frontend Vitest tests (`1945b-accuracy-digest-card.test.ts`) — tests must pass before wiring
4. Add HTTP handler to `server.ts` (import extension + handler block)
5. Write HTTP handler tests (`1945b-accuracy-digest-handler.test.ts`)
6. Wire loader in `dashboard.analysis.tsx` (allSettled + LoaderData + useLoaderData destructure)
7. Add `AccuracyDigestCard` component + `digestRateColor` helper to `dashboard.analysis.tsx`
8. Add SectionCard at bottom of page JSX
9. Run `tsc` (0 errors) + `bun test` (all tests pass including new 22 tests)

**ACs to verify:**
- AC-1: Normal render (bySignalType ≥ 3 → Top-3 + Bottom-3 columns + footer)
- AC-2: Empty state (totalResolved=0, neutralOnlyRows=0 → seeding message with ACCURACY_SEEDING_WINDOW_END)
- AC-3: Insufficient-sample (totalResolved>0, bySignalType=[] → ≥3 samples message)
- AC-4: Non-fatal degradation (HTTP 500 → rest of page renders, card shows empty state)
- AC-5: Colour coding (rate ≥ 0.70 green, < 0.40 red, 0.40–0.69 amber — matches accuracyBadgeProps thresholds)
- AC-6: HTTP handler clamps days param (200→90, 0→1, absent→30)
- AC-7: All-neutral state (totalResolved=0, neutralOnlyRows>0 → neutral message + count)
