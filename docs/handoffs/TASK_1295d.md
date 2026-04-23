# Task Context — 1295d: Integration Test + Verification

## TLDR (read this first — complete for simple tasks)
change: `src/__tests__/1295d-integration-builders-to-synthesis.test.ts` — CREATE E2E test: builder → MCP post → DB retrieve → chainSynthesizer (verify no fallback penalties, all fields populated)
test: `src/__tests__/1295d-integration-*.test.ts` — 12+ assertions (chain_catalyst, price_confirmation, urgent_news signal types, each tested for field completeness + synthesis success)
branch: task/1295d-integration
depends: [1295a ✓ builders exist, 1295b ✓ agent specs updated, 1295c ✓ audit service exists]
knowledge_needed: [bundle-developer]

---

sprint: 1295
branch: task/1295d-integration
status: todo
req_ref: none
tech_ref: TECH-1295

---

## [PM] Planning Context

layer: tests (integration across domain + application + interface)
depends_on: [1295a ✓ builders, 1295b ✓ agent specs, 1295c ✓ audit service]

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalBuilders.ts # Builders from 1295a
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/chainSynthesizer.ts # Synthesis service (1293d) — verify no fallback penalties
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/news-analysis/agentSignalTools.ts # MCP tool validation (1293b)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1293b-post-signal-validation.test.ts # Reference test (MCP rejection patterns)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1293d-chain-synthesizer-fallbacks.test.ts # Reference test (synthesis logic)

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1295d-integration-builders-to-synthesis.test.ts # NEW: E2E test

files_to_modify:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/modules/signalBuilders.md # NEW: Builders module analysis (during merge)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/patterns/signal-payload-quality.md # UPDATED: Add builder prevention step (during merge)

test_file: src/__tests__/1295d-integration-builders-to-synthesis.test.ts

acceptance_criteria:
- Given: ChainCatalystBuilder with all required fields set
- When: Signal is posted via MCP tool post_agent_signal()
- Then: Signal stored in agent_signals DB (no rejection), field completeness 100%
- When: Signal is retrieved from DB
- Then: All required fields present (headline, source, confidence, affected_stocks, etc.)
- When: Signal passed to chainSynthesizer.synthesize()
- Then: Synthesis succeeds WITHOUT fallback penalties (no 0.3 confidence hit)
- When: PriceConfirmationBuilder + UrgentNewsBuilder tested same way
- Then: All 3 signal types pass E2E (no rejections, no fallbacks)
- When: Tests run (bun test 1295d-integration-*.test.ts)
- Then: 12+ assertions PASS, logs show no confidence penalties, no missing field warnings

---

## Implementation Guidance

### E2E Test Pattern (per signal type)

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createChainCatalystBuilder } from "@domain/signals";
import { postAgentSignal } from "@interface/mcp";
import { chainSynthesizer } from "@domain/services";
import { getDB } from "@infrastructure/db";

describe("1295d: E2E Signal Flow (Builder → MCP → DB → Synthesis)", () => {
  let db: any;

  beforeEach(() => {
    db = getDB();
    // Clear test tables
    db.exec("DELETE FROM agent_signals");
    db.exec("DELETE FROM signal_rejections");
  });

  afterEach(() => {
    // Cleanup
  });

  it("ChainCatalyst: Builder → MCP → DB → Synthesis (no fallback penalties)", async () => {
    // 1. Use builder to construct complete payload
    const finding = createChainCatalystBuilder()
      .setEventType("credit_policy")
      .setDirection("bullish")
      .setConfidence(0.8)
      .addStock("VIC")
      .addStock("VNM")
      .addSector("Banking")
      .setHeadline("Central bank policy shift")
      .setSource("cafef")
      .build();

    // 2. Post via MCP tool (should NOT be rejected)
    const postResult = await postAgentSignal({
      from_agent: "news-scout",
      signal_type: "chain_catalyst",
      finding_data: finding,
      metadata: { test: true },
    });

    expect(postResult.status).toBe("accepted");
    expect(postResult.signal_id).toBeDefined();

    // 3. Verify signal stored in DB with complete fields
    const storedSignal = db.prepare(`
      SELECT * FROM agent_signals WHERE id = ?
    `).get(postResult.signal_id);

    expect(storedSignal).toBeDefined();
    expect(storedSignal.finding_data.confidence).toBe(0.8);
    expect(storedSignal.finding_data.affected_stocks).toContain("VIC");
    expect(storedSignal.finding_data.headline).toBe("Central bank policy shift");

    // 4. Verify synthesis does NOT apply fallback penalties
    const synthesisInput = {
      signals: [storedSignal],
      context: { timestamp: Date.now() },
    };

    const synthesis = await chainSynthesizer.synthesize(synthesisInput);

    expect(synthesis.conviction).toBeGreaterThanOrEqual(0.75); // No penalty
    expect(synthesis.logs).not.toContain("fallback"); // No fallback applied
  });

  it("PriceConfirmation: Builder → MCP → DB → Synthesis", async () => {
    // Similar pattern for PriceConfirmation
    // Builder validates 5 required fields: price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence
  });

  it("UrgentNews: Builder → MCP → DB → Synthesis", async () => {
    // Similar pattern for UrgentNews
    // Builder validates 3 required fields: headline, source, confidence
  });
});
```

### Assertions Per Signal Type

**ChainCatalyst** (4 assertions):
1. postAgentSignal() returns status="accepted"
2. Retrieved signal has all 7 fields: event_type, direction, confidence, affected_stocks, affected_sectors, headline, source
3. chainSynthesizer.synthesize() conviction ≥ 0.75 (no fallback)
4. No "fallback" or "missing field" logs

**PriceConfirmation** (4 assertions):
1. postAgentSignal() returns status="accepted"
2. Retrieved signal has all 5 fields: price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence
3. Synthesis applies confidence correctly (no penalty)
4. No fallback penalties in conviction score

**UrgentNews** (4 assertions):
1. postAgentSignal() returns status="accepted"
2. Retrieved signal has 3 required fields: headline, source, confidence
3. Synthesis handles urgent_news priority correctly
4. No fallback penalties

**Total: 12+ assertions**

---

## Agent Memory Updates

During merge, create/update:

1. **NEW**: `docs/agent-memory/modules/signalBuilders.md`
   - Module analysis: 4 builder classes, factory functions, Zod integration
   - Lines of code: ~150
   - Dependencies: signalTypes.ts (Zod schemas)
   - Exports: 4 factory functions (createChainCatalystBuilder, etc.)
   - Usage: Agent specs (01-news-scout.md, 04-market-watcher.md)

2. **UPDATE**: `docs/agent-memory/patterns/signal-payload-quality.md`
   - Add section: "Prevention: Use Typed Builders" (from TECH-1295)
   - Link to signalBuilders module + agent specs
   - Document error handling (build() throws on incomplete data)

---

## QA Sign-Off

Task complete when:
- `bun test 1295d-integration-builders-to-synthesis.test.ts` → 12+ assertions PASS
- No "fallback" or "missing field" penalties in logs
- All 3 signal types (ChainCatalyst, PriceConfirmation, UrgentNews) tested E2E
- Agent memory modules/patterns updated in merge
- `bun tsc --noEmit` → 0 TS errors
- Branch merged to main with all 1295a–1295d tasks DONE
