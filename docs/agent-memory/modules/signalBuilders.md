# Module: signalBuilders.ts

**Location**: `src/domain/signals/signalBuilders.ts`

**Lines of code**: ~248 (150 core logic)

**Task origin**: 1295a (Signal Builder Implementation)

---

## Overview

The `signalBuilders` module provides **fluent API builder classes** for type-safe construction of agent signal `finding_data` payloads. Each builder enforces required fields at compile-time (TypeScript interfaces) and runtime (Zod validation on `build()`).

**Goal**: Eliminate incomplete signal payloads that would either:
1. Be rejected by MCP tools (task 1293b validation)
2. Cause fallback penalties in chain synthesis (task 1293d)

---

## Four Builder Classes

### 1. ChainCatalystBuilder
**Required fields**: 7
- `event_type`: "credit_policy" | "trade_war" | "earnings" | "macro" | "legal" | "crisis" | "sector_event"
- `direction`: "bullish" | "bearish" | "neutral"
- `confidence`: number in [0, 1]
- `affected_stocks`: string[] (min 1 item)
- `affected_sectors`: string[] (min 1 item)
- `headline`: string (min 1 char)
- `source`: string (min 1 char)

**Factory function**: `createChainCatalystBuilder()`

**Validation schema**: `ChainCatalystFindingDataSchema` (zod)

**Used by**: News Scout agent (01-news-scout.md) — posts chain catalysts to trigger enrichment

**Example**:
```typescript
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
```

---

### 2. PriceConfirmationBuilder
**Required fields**: 5
- `price_change_pct`: number (can be negative, zero, or positive)
- `volume_ratio`: number (must be >= 0, relative to rolling average)
- `confirms_direction`: boolean (does move align with catalyst?)
- `fully_priced`: boolean (is all catalytic value captured?)
- `confidence`: number in [0, 1]

**Factory function**: `createPriceConfirmationBuilder()`

**Validation schema**: `PriceConfirmationFindingDataSchema` (zod)

**Used by**: Market Watcher agent (04-market-watcher.md) — posts price confirmations at depth=2

**Example**:
```typescript
const finding = createPriceConfirmationBuilder()
  .setPriceChangePct(3.5)
  .setVolumeRatio(1.8)
  .setConfirmsDirection(true)
  .setFullyPriced(false)
  .setConfidence(0.85)
  .build();
```

**Synthesis bonus**: `confirms_direction=true` adds +0.05 to conviction

---

### 3. UrgentNewsBuilder
**Required fields**: 3
- `headline`: string (min 1 char)
- `source`: string (min 1 char)
- `severity`: "low" | "medium" | "high" | "critical"

**Factory function**: `createUrgentNewsBuilder()`

**Validation schema**: `UrgentNewsFindingDataSchema` (zod)

**Used by**: Market Monitor agent — posts urgent news (market halts, flash crashes, etc.)

**Example**:
```typescript
const finding = createUrgentNewsBuilder()
  .setHeadline("Vietnam stock market circuit breaker triggered")
  .setSource("vietstock")
  .setSeverity("critical")
  .build();
```

**Note**: Urgent news typically requires a companion `chain_catalyst` or `price_confirmation` signal for synthesis. When used in chains, add synthetic fields (confidence, direction) for synthesis logic.

---

### 4. CrossValidateBuilder
**Required fields**: 3
- `direction`: "bullish" | "bearish" | "neutral"
- `confidence`: number in [0, 1]
- `summary`: string (min 1 char)

**Factory function**: `createCrossValidateBuilder()`

**Validation schema**: `CrossValidateFindingDataSchema` (zod)

**Used by**: Validator agents (BCTC Analyst, Risk Monitor) — cross-validates findings from multiple sources

**Example**:
```typescript
const finding = createCrossValidateBuilder()
  .setDirection("bullish")
  .setConfidence(0.9)
  .setSummary("BCTC reports strong Q1 cash flow")
  .build();
```

---

## How Builders Work

### Fluent API Design
Each builder method returns `this` (the builder instance), enabling method chaining:
```typescript
builder
  .setEventType("macro")
  .setDirection("bullish")
  .setConfidence(0.8)
```

### Validation on build()
The `build()` method calls Zod validation:
```typescript
build(): ChainCatalystFindingData {
  return ChainCatalystFindingDataSchema.parse(this.data);
}
```

**If validation fails**: `ZodError` is thrown immediately. This prevents incomplete payloads from being posted to the signal bus.

### Type Safety
- **Compile-time**: TypeScript interfaces ensure correct method order (developers can't call `setConfidence()` on a PriceConfirmationBuilder without implementing the method)
- **Runtime**: Zod schemas validate field types and ranges (e.g., `confidence` must be in [0, 1])

---

## Integration with Signal Bus

### Flow: Builder → MCP Tool → DB → Synthesis

1. **Builder constructs finding_data** (typed, validated)
2. **MCP tool (post_agent_signal)** validates via `validateSignalPayload()` (uses same Zod schemas)
3. **postSignal()** stores finding_data as JSON in `agent_signals.finding_data`
4. **chainSynthesizer** deserializes and extracts fields with defensive fallbacks (task 1293d)

### Task 1293b Integration
The MCP tools use the **same Zod schemas** as the builders:
- `SIGNAL_TYPE_VALIDATORS` in `agentSignalTools.ts`
- Maps signal_type → schema (e.g., "chain_catalyst" → `ChainCatalystFindingDataSchema`)
- Rejects payloads that builders would have rejected

**Result**: No incomplete signals reach the DB or synthesis.

### Task 1295d Integration
Integration test (`1295d-integration-builders-to-synthesis.test.ts`) verifies:
- All 3 signal types build successfully with complete fields
- MCP tool accepts built payloads without rejection
- Stored signals have all required fields
- Synthesis receives fully initialized signals → conviction NOT reduced by fallback penalties

---

## Error Handling

### Builder Validation Failure
```typescript
try {
  const incomplete = createChainCatalystBuilder()
    .setEventType("macro")
    // Missing: direction, confidence, stocks, sectors, headline, source
    .build(); // ZodError thrown here
} catch (err) {
  if (err instanceof ZodError) {
    console.error("Incomplete signal payload:", err.issues);
  }
}
```

### MCP Tool Rejection (1293b)
Even if a builder is misused by an agent, the MCP tool validates a second time:
```typescript
const validation = validateSignalPayload("chain_catalyst", incompletePayload);
if (!validation.valid) {
  // Signal rejected + logged to signal_rejections table
  logSignalRejection(db, { ... });
}
```

---

## Prevention Patterns

See `docs/agent-memory/patterns/signal-payload-quality.md` → "Prevention: Use Typed Builders"

**Summary**:
- **Always use builders** when constructing signal payloads
- **Never manually construct** finding_data objects
- **Call build()** to trigger validation before posting
- **Catch ZodError** in agent code if validation may fail

---

## Dependencies

**Inbound**:
- `src/domain/signals/signalTypes.ts` — Zod schemas (ChainCatalystFindingDataSchema, etc.)
- `zod` — validation library

**Outbound** (modules using builders):
- `01-news-scout.md` — posts ChainCatalyst signals
- `04-market-watcher.md` — posts PriceConfirmation signals
- `src/interface/mcp/tools/agentSignalTools.ts` — uses same Zod schemas for validation

**Test coverage**:
- `src/__tests__/1295d-integration-builders-to-synthesis.test.ts` — E2E tests (all 3 types, 53+ assertions)

---

## Version History

| Date | Change | Task |
|------|--------|------|
| 2026-04-23 | Created module analysis | 1295d |
| 2026-04-22 | Implemented builders (fluent API, Zod validation) | 1295a |

---

## Key Invariants

1. **Every builder enforces its required fields** — missing even one field causes `build()` to throw
2. **No partial/incomplete signals reach the DB** — blocked at builder AND MCP validation layers
3. **Synthesis never applies fallback penalties for builder-constructed signals** — all confidence fields are initialized
4. **Builders are the SSOT for signal field requirements** — update builder + schemas, everything else (MCP, synthesis) inherits validation
