# Contract Ruling: `/macro/snapshot` `signals` Field — Keyed-Object vs Array

**Architect:** Architect agent  
**Date:** 2026-05-26T13:12Z  
**Trigger:** ops-frontend-p2h-incident-20260526T150702Z.json — P2-H BLOCKED on `snapshot.signals.map is not a function`  
**Zone:** multi (apps/macro-indicators/ producer · apps/frontend/ consumer · apps/mcp-server/ pass-through)  
**Status:** RULING ISSUED — frontend adapts, macro service unchanged

---

## 1. Evidence Base

### 1a. Macro service — canonical Go DTO (keyed-object shape is intentional)

`apps/macro-indicators/pkg/application/dtos.go` (lines 13–32):

```go
type SignalResult struct {
    InvestmentClock interface{} `json:"investment-clock"`
    Oil             interface{} `json:"oil"`
    Gold            interface{} `json:"gold"`
    UsdVnd          interface{} `json:"usdvnd"`
    Carry           interface{} `json:"carry"`
    Yield           interface{} `json:"yield"`
}

type MacroSnapshotResponse struct {
    ...
    Signals SignalResult `json:"signals"`
    ...
}
```

This is a Go **struct** serialised by `encoding/json`. It produces a keyed-object at the wire level: `{"signals": {"investment-clock": {...}, "oil": {...}, ...}}`. This is the only definition of the response shape in the macro service codebase. There is no array serializer, no adapter, no alternate code path.

`apps/macro-indicators/pkg/application/usecases.go` (lines 126–142) constructs `SignalResult` with named fields at every `Execute()` call. The TS-era array shape is gone — it never existed in the Go service.

### 1b. Macro service contract tests — do NOT test `/snapshot` response body shape

`apps/macro-indicators/pkg/interface/http/router_test.go`: the `newTestRouter()` fixture passes `nil` useCase to `NewRouter`. There is no `TestSnapshotRoute` function in the file. The router test file only covers `/health`, `/carry-trade-signal`, `/yield-spread-signal`, and `/macro-calendar`. The snapshot endpoint's response body shape is **not covered by any contract test**. This is a gap, but it does not change the ruling — the DTO code is the canonical contract.

`apps/macro-indicators/pkg/application/usecases_test.go`: covers only VNIndex seed-data-leak detection. No assertion on `Signals` shape.

**Conclusion:** The macro service shipped the keyed-object as its Phase-2 design. The absence of a snapshot body contract test is a risk flag (see §5) but does not invalidate the shape — the DTO is the SSOT.

### 1c. MCP server — pass-through, never iterates signals

`apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` (lines 321–366): `get_macro_snapshot` handler does `JSON.stringify(data, null, 2)` and returns the raw blob as a text string. It applies no structure to `signals`. Cowork agents (market-watcher, unified-agent, etc.) receive the JSON text and parse it in natural language — they never call `.map()` on `signals`.

`apps/mcp-server/src/infrastructure/microservices/clients.ts` (lines 200–235): `getMacroSnapshot()` does `signals: raw.signals ?? []`. The TypeScript type annotation says array, but `raw.signals` is now a Go struct-object. The `?? []` fallback does not fire (the object is truthy). The actual runtime value stored is the keyed object. However `macroIndicatorRefreshJob.ts` never accesses `snapshot.signals` — it only reads `oilUsd`, `goldUsd`, `usdVnd`, `brentPrice`, `goldPrice`, `sbvRefinancingRate`. So this type mismatch in `clients.ts` is a latent bug but does NOT cause any current runtime failure in the mcp-server.

**Conclusion:** No mcp-server consumer breaks on the keyed-object. The mcp-server's `MacroSnapshotResponse` type annotation (signals as array) is stale but harmless in production today.

### 1d. Frontend — sole broken consumer

`apps/frontend/app/domain/market.ts` (lines 117–133):
```typescript
export interface MacroSignal { indicator, value, unit, direction, impact }
export interface MacroSnapshot { ..., signals: MacroSignal[] }
```

`apps/frontend/app/routes/dashboard.analysis.tsx`:
- Line 705: `snapshot.signals.map((sig) => ...)` — direct `.map()` on what is now an object → runtime TypeError
- Line 1067: `snapshot.signals.length > 0` — `.length` on an object → `undefined` (falsy)
- Line 1068: `[...snapshot.signals].sort(...)` — spread of an object → empty array (silent miss)

`apps/frontend/app/__tests__/1934-macro-panel.test.ts`: tests cover `MacroData` / `parseMacroSources`, NOT `MacroSnapshot.signals`. The test file has zero assertions on the `MacroSnapshot` type or `MacroSignalPanel` rendering. It is NOT the test that needs updating — it passes today and will continue to pass after the fix.

The real test gap is that there is no unit test for `MacroSignalPanel` or `InfoSourcePanel` rendering against the signals field. The fix must add coverage.

---

## 2. Ruling

**CANONICAL CONTRACT: keyed-object (`SignalResult` struct) is the current and correct contract.**

The Go DTO in `dtos.go` is the single source of truth for the wire shape. This is a CLOSED Phase-2 scale pilot for macro-indicators. Reverting to an array would require reopening the pilot, modifying the Go DTO and serializer, rebuilding the macro container, and risking re-breaking the cowork MCP path. None of that is warranted when the sole broken consumer is a frontend type annotation and two rendering sites.

The object-keyed shape is semantically better for this use case: each of the 6 signals has a distinct name and schema (investment-clock has tier/score/phase; oil has impact/priceUSD/reasoning; etc.). Forcing them into a homogeneous array was always an impedance mismatch. The refactor to Go named fields is an architectural improvement.

**Fix owner: dev-frontend.** Three files in `apps/frontend/` require changes. The macro service and its container are NOT touched.

---

## 3. Exact Minimal Fix — dev-frontend

### File 1: `apps/frontend/app/domain/market.ts`

Replace `MacroSignal` and `MacroSnapshot` types. The old flat-array shape is gone. The canonical keyed-object shape has heterogeneous per-key schemas. The frontend only needs to display the subset of fields it can render; unknown keys are tolerated via the index signature.

**Remove:**
```typescript
export interface MacroSignal {
  indicator: string;
  value: number;
  unit: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | string;
  impact: "HIGH" | "MEDIUM" | "LOW" | string;
}

export interface MacroSnapshot {
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
  signals: MacroSignal[];
  fetchedAt: string;
}
```

**Replace with:**
```typescript
/**
 * A single macro signal entry from the keyed-object returned by
 * POST /macro/snapshot. Each key is a signal name (e.g. "oil", "gold").
 * Fields vary by signal type; optional fields may be absent.
 * New primitives may add new keys — use the index signature for forward-compat.
 */
export interface MacroSignalEntry {
  // investment-clock fields
  tier?: string;
  score?: number;
  phase?: string;
  // oil / gold / usdvnd fields
  impact?: string;
  direction?: string;
  priceUSD?: number;
  rateVND?: number;
  reasoning?: string;
  // carry fields
  regime?: string;
  carrySpread?: number;
  // yield fields
  label?: string;
  spread?: number;
  // forward-compat catch-all
  [key: string]: unknown;
}

/**
 * Keyed-object map of macro signal entries.
 * Keys: "investment-clock" | "oil" | "gold" | "usdvnd" | "carry" | "yield"
 * Shape is intentional — macro-indicators Go DTO SignalResult (dtos.go).
 */
export type MacroSignals = Record<string, MacroSignalEntry>;

/** Macro snapshot from POST /macro/snapshot (macro-indicators Go service). */
export interface MacroSnapshot {
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
  signals: MacroSignals;
  fetchedAt: string;
}
```

### File 2: `apps/frontend/app/routes/dashboard.analysis.tsx`

Three rendering sites must be updated to use `Object.entries(snapshot.signals)`:

**MacroSignalPanel (line ~696–742):** Replace `snapshot.signals.map((sig) => ...)` with iteration over `Object.entries(snapshot.signals)`. The `key` becomes the signal name (e.g. "oil"); the `value` is the `MacroSignalEntry`. Display must adapt: use `entry.direction ?? entry.impact ?? entry.regime ?? entry.label` for the direction field; use `entry.impact ?? entry.tier ?? "—"` for the impact badge; use `entry.priceUSD ?? entry.rateVND ?? entry.score` for the numeric value. The `indicatorLabel()` helper already maps "oil_usd" → "Dầu thô" etc. and needs a new mapping for the new key names ("oil" → "Dầu thô", "gold" → "Vàng", "usdvnd" → "USD/VND", "investment-clock" → "Investment Clock", "carry" → "Carry Trade", "yield" → "Yield Spread").

**InfoSourcePanel (lines ~1067–1084):** Replace `snapshot.signals.length > 0` guard and `[...snapshot.signals].sort(...)` with `Object.values(snapshot.signals).length > 0` and `Object.entries(snapshot.signals).sort(([, a], [, b]) => ...)`. The impact ranking function must read `entry.impact ?? "LOW"`.

**Import in dashboard.analysis.tsx:** Remove the `MacroSignal` import from `~/domain/market` (it no longer exists). Keep `MacroSnapshot`. Add `MacroSignalEntry` if it is referenced explicitly in the render logic.

### File 3: `apps/frontend/app/__tests__/1934-macro-panel.test.ts`

This test file today covers `MacroData` / `parseMacroSources` — unrelated to `MacroSnapshot.signals`. It does NOT test `MacroSignalPanel` rendering.

**The fix must ADD** a new `describe("MacroSnapshot signals keyed-object shape")` block (can be appended to the existing file or in a new test):

```typescript
import type { MacroSnapshot, MacroSignalEntry } from "~/domain/market";

describe("MacroSnapshot signals — keyed-object contract", () => {
  const REAL_SIGNALS_SHAPE: MacroSnapshot["signals"] = {
    "investment-clock": { tier: "RECOVERY", score: 65, phase: "EARLY_EXPANSION" },
    "oil": { impact: "NEUTRAL", priceUSD: 82.5, reasoning: "within normal band" },
    "gold": { direction: "BULLISH", priceUSD: 2350.0, reasoning: "above 2200" },
    "usdvnd": { direction: "NEUTRAL", rateVND: 24500, reasoning: "below 25500" },
    "carry": { regime: "NEUTRAL", carrySpread: -0.63 },
    "yield": { label: "FAIRLY_VALUED", spread: 2.87 },
  };

  it("signals is an object (not an array)", () => {
    expect(Array.isArray(REAL_SIGNALS_SHAPE)).toBe(false);
    expect(typeof REAL_SIGNALS_SHAPE).toBe("object");
  });

  it("Object.entries iterates over all 6 signal keys", () => {
    const entries = Object.entries(REAL_SIGNALS_SHAPE);
    expect(entries).toHaveLength(6);
  });

  it("each entry has the correct key and a MacroSignalEntry value", () => {
    const oil = REAL_SIGNALS_SHAPE["oil"];
    expect(oil?.impact).toBe("NEUTRAL");
    expect(oil?.priceUSD).toBe(82.5);
  });

  it("Object.values returns 6 MacroSignalEntry objects", () => {
    const values = Object.values(REAL_SIGNALS_SHAPE);
    expect(values).toHaveLength(6);
    expect(values.every((v) => typeof v === "object" && v !== null)).toBe(true);
  });
});
```

---

## 4. Consumers Verified — Full Census

| Consumer | Path | Access pattern | Breaks on object? |
|---|---|---|---|
| **frontend MacroSignalPanel** | `apps/frontend/app/routes/dashboard.analysis.tsx:705` | `.map()` on signals | **YES — TypeError** |
| **frontend InfoSourcePanel** | `apps/frontend/app/routes/dashboard.analysis.tsx:1067-1084` | `.length`, spread+`.sort()` | **YES — silent miss (length=undefined, spread produces empty)** |
| **frontend domain type** | `apps/frontend/app/domain/market.ts:132` | `signals: MacroSignal[]` | **YES — type mismatch, stale annotation** |
| **mcp-server macroTools.ts** | `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:348` | `JSON.stringify(data)` raw passthrough | NO — not parsed |
| **mcp-server clients.ts getMacroSnapshot** | `apps/mcp-server/src/infrastructure/microservices/clients.ts:226` | `raw.signals ?? []` — stores object as-is | NO runtime error, but type annotation is stale (latent) |
| **mcp-server macroIndicatorRefreshJob** | `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` | reads oilUsd/goldUsd/usdVnd/brentPrice/goldPrice only | NO — never touches signals |
| **cowork agents (market-watcher, unified-agent, etc.)** | prompt/text consumption of get_macro_snapshot text output | natural language JSON reading | NO — text blob, no `.map()` |
| **frontend 1934-macro-panel.test.ts** | `apps/frontend/app/__tests__/1934-macro-panel.test.ts` | tests MacroData/parseMacroSources only | NO — does not touch MacroSnapshot.signals |

---

## 5. Risk Flags

**R-HIGH: Snapshot body shape is not covered by any macro-service contract test.** The router_test.go skips snapshot entirely (nil useCase). If the Go DTO is ever refactored, there is no regression guard. Dev-macro-indicators should add a `TestSnapshotBody` test that POSTs to the handler and asserts `signals` is an object with the 6 expected keys. This is NOT required to unblock P2-H but should be tracked as a backlog item.

**R-MEDIUM: mcp-server clients.ts MacroSnapshotResponse.signals is typed as array (line 131).** The runtime object is silently stored under an array type. If any future code iterates `snapshot.signals` in the mcp-server (e.g. a new predictionJob that wants to read regime from carry), it will get a runtime TypeError. Dev-mcp-server should update the type to `MacroSignals | MacroSignal[]` or a union until the old array path is formally deprecated.

**R-LOW: ARCHITECTURE.md still shows macro-indicators as "TypeScript/Bun".** The service was rewritten to Go (commit f85ad1d9). This is a doc drift that should be corrected in a maintenance pass.

---

## 6. Rebuild Decision

**No macro container rebuild is needed.** The fix is entirely in `apps/frontend/` TypeScript/TSX source. The macro-indicators container image remains at its current state (image 91c1184d, commit 3e4a00c4). After the frontend fix lands, ops must rebuild the **frontend** container (Remix SSR bundle changes) and re-run P2-H Playwright checks.

---

## 7. BUILD-STANDARD tag

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: In-zone frontend fix (3 files). No new primitives or services.
```
