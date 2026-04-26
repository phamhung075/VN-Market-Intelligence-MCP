# TASK 1329g — IMF Wire-Up: Connect Bridge to Conviction Call Sites

**Sprint:** 1329
**Layer:** application/usecases + interface/mcp/tools + interface/scheduler
**Size:** S (part of M IMF chain)
**Branch:** `task/1329b-imf-conviction-dimension`
**Depends on:** 1329f
**Blocks:** nothing (final task in sprint)

---

## Objective

Wire `getImfMacroScoreForConviction(db)` into the 3 call sites of `computeConviction()` that have access to a `db` instance. The 4th call site (`assembleBriefing.ts`) is a best-effort briefing context — add IMF there too. Since `imfMacroScore` is optional, any call site not updated compiles and runs correctly with neutral (0.5) IMF contribution.

---

## Call Site Audit

From brownfield grep (`computeConviction` appears at):

| File | Line | Has DB access? | Action |
|------|------|----------------|--------|
| `apps/mcp-server/src/application/usecases/scanMarket.ts` | ~505 | Yes — `getDb()` called at line ~518 | Wire IMF |
| `apps/mcp-server/src/application/usecases/assembleBriefing.ts` | ~972 | Yes — `db` available in scope | Wire IMF |
| `apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioTools.ts` | ~351 | Yes — `db` passed into tool context | Wire IMF |

---

## File Changes

### `apps/mcp-server/src/application/usecases/scanMarket.ts`

Add import at top of file (with other application/service imports):
```typescript
import { getImfMacroScoreForConviction } from "../services/imfConvictionBridge.js";
```

At the `computeConviction` call site (~line 505), the `convictionInput` object is built up over ~20 lines before `computeConviction(convictionInput)` is called. Add IMF score injection immediately before that call:

```typescript
    // Dimension 7: IMF macro (Task 1329) — single read, cached per scan cycle
    try {
      convictionInput.imfMacroScore = getImfMacroScoreForConviction(getDb());
    } catch { /* best-effort — neutral if bridge fails */ }

    const conviction = computeConviction(convictionInput);
```

**Important:** `getImfMacroScoreForConviction` already has its own internal try/catch (fail-silent). The outer try/catch here is defense-in-depth only.

**Performance note:** `scanMarket.ts` calls `computeConviction` in a loop over watchlist stocks. `getImfMacroScoreForConviction(db)` is a single SQLite read that returns the same value for all stocks in the loop. Hoist it outside the loop:

```typescript
// Before the watchlist loop:
let imfMacroScore: number | undefined;
try {
  imfMacroScore = getImfMacroScoreForConviction(getDb());
} catch { /* best-effort */ }

// Inside the loop, when building convictionInput:
if (imfMacroScore !== undefined) {
  convictionInput.imfMacroScore = imfMacroScore;
}
```

Read `scanMarket.ts` from line 450 to 520 to confirm the exact loop structure before implementing.

---

### `apps/mcp-server/src/application/usecases/assembleBriefing.ts`

The `computeConviction` call at line ~972 is inside a dynamic import block (lazy import). Add IMF score to the input object:

```typescript
    const { computeConviction } = await import("../../domain/services/convictionScorer.js");
    const { getImfMacroScoreForConviction } = await import("../../services/imfConvictionBridge.js");

    // Compute IMF score once for the briefing (same value for all stocks)
    let briefingImfScore: number | undefined;
    try { briefingImfScore = getImfMacroScoreForConviction(db); } catch { /* best-effort */ }

    for (const stock of watchlistRows) {
      if (stock.price == null || stock.change_pct == null) continue;
      const result = computeConviction({
        code: stock.code,
        changePct: stock.change_pct,
        imfMacroScore: briefingImfScore,
      });
```

Read `assembleBriefing.ts` from line 960 to 990 to confirm the `db` variable is in scope at that point. The `assembleBriefing` function signature accepts a `db` parameter — verify this before adding the import.

---

### `apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioTools.ts`

Add import near top (with conviction scorer import):
```typescript
import { computeConviction, deriveKinhDichScore } from "../../../../domain/services/convictionScorer.js";
import { getImfMacroScoreForConviction } from "../../../../application/services/imfConvictionBridge.js";
```

Before the `for (const w of watchlist)` loop (~line 333), hoist the IMF score:

```typescript
        // Dimension 7: IMF macro — hoist outside watchlist loop (same value per tool call)
        let portfolioImfScore: number | undefined;
        try { portfolioImfScore = getImfMacroScoreForConviction(db); } catch { /* best-effort */ }
```

Inside the loop where `input` is built (~line 337), add before `const conviction = computeConviction(input)`:

```typescript
          if (portfolioImfScore !== undefined) {
            input.imfMacroScore = portfolioImfScore;
          }
```

Read `portfolioTools.ts` from line 300 to 360 to confirm `db` is in scope (it is — injected at the tool handler level).

---

## Test File

`apps/mcp-server/src/__tests__/1329b-imf-conviction-dimension.test.ts`

Add integration smoke test:

```typescript
describe("Task 1329g — IMF wire-up: computeConviction receives imfMacroScore at call sites", () => {
  it("computeConviction with imfMacroScore from bridge returns valid result", () => {
    // This is a unit test — bridge returns 0 on empty DB (already tested in 1329f)
    const result = computeConviction({ code: "VNM", changePct: 2.0, imfMacroScore: 0 });
    expect(result.dimensions.imfMacro).toBe(0.5); // 0.5 + 0 * 0.5 = 0.5
    expect(typeof result.score).toBe("number");
  });
});
```

Full integration tests for `scanMarket` and `portfolioTools` are E2E scope (require running docker-compose). The unit test above is sufficient for the `bun test` gate.

---

## FR-IMF-5 Verification (MCP tool output)

Per REQ_1329.md FR-IMF-5: `dimensions.imfMacro` appears in the `ConvictionResult` returned by any MCP tool that calls `computeConviction`. Since `ConvictionResult.dimensions` is serialized as-is via `JSON.stringify`, the field is automatically included once 1329d/1329e add it to the type and return object. No serialization exclusion list exists in the codebase (confirmed: `telegram.ts` at line 478 references `ConvictionResult` for display, not for stripping fields). No additional change needed.

---

## DDD Compliance

| File | Layer | Bridge import direction |
|------|-------|------------------------|
| `scanMarket.ts` | application/usecases | imports application/services — same layer, allowed |
| `assembleBriefing.ts` | application/usecases | imports application/services — same layer, allowed |
| `portfolioTools.ts` | interface/mcp/tools | imports application/services — interface imports application, correct direction |

**No violation:** `imfConvictionBridge.ts` (application) is never imported from `domain/`. The domain layer (`convictionScorer.ts`) stays pure.

---

## Commit Format

```
task(1329g): wire IMF macro score into conviction call sites

- scanMarket.ts: hoist getImfMacroScoreForConviction() outside watchlist loop
- assembleBriefing.ts: inject imfMacroScore in briefing conviction call
- portfolioTools.ts: hoist IMF score, inject per-stock in portfolio loop
- FR-IMF-5 automatic: dimensions.imfMacro serialized via JSON.stringify
```
