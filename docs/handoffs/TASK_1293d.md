# Task Context — 1293d: Defensive Fallbacks in Synthesizer

## TLDR

**change**: domain/services/chainSynthesizer.ts — Add confidence penalty (0.3) when confidence field is undefined vs legitimately 0; log uninitialized fields to console + agent-memory for pattern tracking; prevent downstream crashes with safe accessors

**test**: src/__tests__/1293d-chain-synthesizer-fallbacks.test.ts — 6+ assertions: missing confidence triggers 0.3 penalty, conviction calculated without crash, synthesis continues (graceful degradation), log messages generated, empty/partial chain links handled

**branch**: task/1293d-synthesizer-fallback-safety

**depends**: None (orthogonal to 1293a/1293b/1293c)

**knowledge_needed**: dev-standards, chain-synthesizer-logic, ddd-safety-patterns

---

## Sprint Context

| Field | Value |
|-------|-------|
| sprint | 1293 |
| branch | task/1293d-synthesizer-fallback-safety |
| status | todo |
| tech_ref | TECH_1293_ROOTCAUSE.md (Section 4.2, Phase 4) |
| time_estimate | 3h |

---

## [PM] Planning Context

**layer**: domain (service logic)

**depends_on**: None (can run in parallel with 1293a/1293b/1293c; defensive fallback is independent)

**reason_for_task**:
- Even with strict validation (1293a–1293c), signals may arrive incomplete (e.g., old signals in DB, agents with bugs, edge cases)
- Chain Synthesizer accesses findingData["confidence"] without guards → returns 0 on undefined → false convictions
- Need to distinguish between "confidence=0" (legitimate low signal) and "confidence=undefined" (missing field)
- Fallback with 0.3 penalty signals to QA that confidence was imputed (not real)
- Log pattern to agent-memory so Architect can improve agent prompts
- **Defense in depth**: even if validation fails, synthesizer doesn't crash

**root_cause_ref**: TECH_1293_ROOTCAUSE.md, Section 4.2, Phase 4

### Files to read first

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/chainSynthesizer.ts` (lines 140–160) — confidence extraction logic
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/chain-synthesizer.test.ts` (if exists) — understand test structure
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/modules/` — check if synthesizer module has known issues
- `TECH_1293_ROOTCAUSE.md` (Section 3.2, Incident Reconstruction) — understand confidence penalty design

### Files to modify

- **MODIFY**: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/chainSynthesizer.ts`

### Implementation Details

**Step 1: Create safe confidence extractor** (helper function in chainSynthesizer.ts):

```typescript
function extractConfidence(findingData: Record<string, unknown>): {
  confidence: number;
  isInitialized: boolean;
} {
  const raw = findingData["confidence"];

  // Distinguish undefined vs 0
  if (raw === undefined || raw === null) {
    console.warn(
      `[ChainSynthesizer] Uninitialized confidence field detected. Applying fallback (0.3 penalty).`
    );
    return { confidence: 0.3, isInitialized: false };
  }

  // Valid numeric confidence
  if (typeof raw === "number") {
    return { confidence: Math.max(0, Math.min(1, raw)), isInitialized: true };
  }

  // Coerce string to number (edge case)
  const coerced = Number(raw);
  if (!isNaN(coerced)) {
    console.warn(
      `[ChainSynthesizer] Coerced confidence from ${typeof raw} to number: ${coerced}`
    );
    return { confidence: Math.max(0, Math.min(1, coerced)), isInitialized: true };
  }

  // Unparseable — fallback
  console.error(
    `[ChainSynthesizer] Invalid confidence type: ${typeof raw}. Applying fallback (0.3 penalty).`
  );
  return { confidence: 0.3, isInitialized: false };
}
```

**Step 2: Update conviction calculation** (in synthesizeChain function):

```typescript
function synthesizeChain(links: ChainLink[]): SynthesizedChain | null {
  if (links.length < 2) return null;

  const sorted = [...links].sort((a, b) => a.depth - b.depth);
  const stockCode = sorted.find(link => link.stockCode)?.stockCode ?? "";
  const rootId = sorted[0]!.id;

  // ── Confidence extraction with fallback ──────────────────────────
  const confidences: number[] = [];
  const uninitializedLinks: string[] = [];

  for (const link of sorted) {
    const { confidence, isInitialized } = extractConfidence(link.findingData ?? {});
    confidences.push(confidence);

    if (!isInitialized) {
      uninitializedLinks.push(`${link.id} (${link.agent})`);
    }
  }

  // Log if ANY links had uninitialized fields
  if (uninitializedLinks.length > 0) {
    console.warn(
      `[ChainSynthesizer] Chain ${rootId} (${stockCode}): ${uninitializedLinks.length} of ${links.length} links had uninitialized confidence. Links: ${uninitializedLinks.join(", ")}`
    );
  }

  // ── Direction validation ──────────────────────────────────────────
  const directions = sorted
    .map((link) => {
      const dir = link.findingData["direction"];
      if (!dir || typeof dir !== "string") {
        console.warn(`[ChainSynthesizer] Link ${link.id}: missing or invalid direction. Defaulting to "neutral".`);
        return "neutral";
      }
      return dir;
    });

  // ── Conviction calculation ────────────────────────────────────────
  const conviction = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  // ... rest of function (direction consensus, narrative, etc.)
}
```

**Step 3: Add logging to agent-memory** (after synthesis completes):

Create or update `docs/agent-memory/modules/chainSynthesizer.md`:

```markdown
### Module: chainSynthesizer.ts (verified 2026-04-23)

**Status**: SAFE (defensive fallbacks implemented)

**Fallback behavior**:
- Uninitialized confidence field → applies 0.3 penalty, logs warning
- Distinguishes undefined vs 0 (important for signal quality assessment)
- Invalid direction → defaults to "neutral", logs warning

**Known patterns**:
- News Scout sometimes omits finding_data (response truncation)
- Market Watcher sometimes posts with confidence=undefined (type error in agent)

**Last verified**: 2026-04-23 (Task 1293d)
**Tests**: 6 assertions, RED→GREEN coverage
```

### Acceptance Criteria

**Given** a ChainLink with missing or uninitialized confidence field
**When** synthesizeChain() processes the chain
**Then**

- extractConfidence() returns { confidence: 0.3, isInitialized: false } for undefined field
- extractConfidence() returns { confidence: actual_value, isInitialized: true } for valid number
- Conviction still calculated (= avg of all confidences, including penalties)
- synthesis continues (does not crash)
- Chain output includes conviction score (even if degraded by penalties)
- Log warning generated for each uninitialized field
- Log specifies link ID and agent name
- Direction field also validated with fallback ("neutral")
- Summary narrative reflects low conviction if penalties applied (e.g., "THEO DÕI: 45% xác tín")
- bun test returns 0 failures
- bun tsc --noEmit shows 0 errors

### TDD Test Location

`src/__tests__/1293d-chain-synthesizer-fallbacks.test.ts`

**Test structure**:

```typescript
import { describe, it, expect } from "bun:test";
import { synthesizeChain } from "../domain/services/chainSynthesizer";

describe("1293d: Chain Synthesizer Fallbacks", () => {
  describe("extractConfidence helper", () => {
    it("should return 0.3 for undefined confidence", () => {
      const result = extractConfidence({ direction: "bullish" }); // no confidence
      expect(result.confidence).toBe(0.3);
      expect(result.isInitialized).toBe(false);
    });

    it("should return exact value for valid number", () => {
      const result = extractConfidence({ confidence: 0.8 });
      expect(result.confidence).toBe(0.8);
      expect(result.isInitialized).toBe(true);
    });

    it("should clamp out-of-range values", () => {
      const result = extractConfidence({ confidence: 1.5 });
      expect(result.confidence).toBe(1); // clamped to max
    });

    it("should coerce string to number", () => {
      const result = extractConfidence({ confidence: "0.7" });
      expect(result.confidence).toBe(0.7);
      expect(result.isInitialized).toBe(true);
    });
  });

  describe("synthesizeChain with missing fields", () => {
    it("should calculate conviction even with missing confidence in one link", () => {
      const links = [
        makeLink({ findingData: { confidence: 0.8, direction: "bullish" } }),
        makeLink({ findingData: { direction: "bullish" } }), // missing confidence
      ];

      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      expect(result!.conviction).toBe((0.8 + 0.3) / 2); // avg of [0.8, 0.3 (fallback)]
    });

    it("should not crash on empty chain", () => {
      const result = synthesizeChain([]);
      expect(result).toBeNull(); // or undefined, depending on design
    });

    it("should handle all links with uninitialized confidence", () => {
      const links = [
        makeLink({ findingData: {} }),
        makeLink({ findingData: {} }),
      ];

      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      expect(result!.conviction).toBe(0.3); // all fallback values
    });

    it("should log warning when uninitialized fields detected", () => {
      // Mock console.warn
      let loggedMessage = "";
      const originalWarn = console.warn;
      console.warn = (msg: string) => {
        loggedMessage = msg;
      };

      const links = [
        makeLink({ findingData: { direction: "bullish" } }),
      ];
      synthesizeChain(links);

      expect(loggedMessage).toMatch(/uninitialized/i);
      console.warn = originalWarn;
    });

    it("should default direction to 'neutral' if missing", () => {
      const links = [
        makeLink({ findingData: { confidence: 0.8 } }), // missing direction
      ];

      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // Check narrative or direction field reflects "neutral"
    });
  });

  describe("synthesis continues gracefully", () => {
    it("should produce SynthesizedChain output even with degraded fields", () => {
      const links = [
        makeLink({ findingData: { confidence: 0.5, direction: "bullish" } }),
        makeLink({ findingData: { } }), // all missing
      ];

      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      expect(result!.stockCode).toBeDefined();
      expect(result!.conviction).toBeGreaterThan(0);
      expect(result!.narrative).toBeDefined();
    });
  });
});

// Helper to construct test ChainLink
function makeLink(overrides: Partial<ChainLink>): ChainLink {
  return {
    id: 1,
    stockCode: "VIC",
    agent: "news_scout",
    signalType: "chain_catalyst",
    depth: 0,
    findingData: {},
    ...overrides,
  };
}
```

---

## Dependency Notes

**No blockers**: Task 1293d can run in parallel with 1293a/1293b/1293c.

**Orthogonal to validation**: This task assumes validation (1293a–1293c) may fail or signals may be stored incomplete; defensive fallbacks are a last-resort safety net.

**Code review point**:
- Ensure log messages are clear and actionable (include link ID + agent)
- Check that fallback value (0.3) is appropriate (mid-range, signals degradation)
- Verify no performance regression in conviction calculation

