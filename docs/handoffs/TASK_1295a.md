# Task Context — 1295a: Signal Builders

## TLDR (read this first — complete for simple tasks)
change: `src/domain/signals/signalBuilders.ts` — CREATE typed builder classes (ChainCatalystBuilder, PriceConfirmationBuilder, UrgentNewsBuilder, CrossValidateBuilder) with fluent API, each enforcing required fields via TypeScript type system + Zod validation on build()
test: `src/__tests__/1295a-signal-builders.test.ts` — 16 assertions (4 signal types × 4 scenarios: complete payload, missing field1, missing field2, missing field3)
branch: task/1295a-signal-builders
depends: none
knowledge_needed: [bundle-developer, portfolio-schema]

---

sprint: 1295
branch: task/1295a-signal-builders
status: todo
req_ref: none (recurring bug escalation)
tech_ref: TECH-1295

---

## [PM] Planning Context

layer: domain
depends_on: none (can start immediately)

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalTypes.ts # Zod schemas (1293a) — reuse these in builders
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1293a-signal-type-safety.test.ts # Reference: existing schema validation test

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalBuilders.ts # NEW: 4 builder classes + factories
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1295a-signal-builders.test.ts # NEW: 16 test cases

files_to_modify:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/index.ts # barrel export: export builders

test_file: src/__tests__/1295a-signal-builders.test.ts

acceptance_criteria:
- Given: Four signal types (ChainCatalyst, PriceConfirmation, UrgentNews, CrossValidate) with required Zod schemas
- When: builder.build() is called on incomplete object (missing any required field)
- Then: Throws error with field name + expected type
- When: builder.build() is called on complete object
- Then: Returns validated signal payload (Zod schema passes)
- When: Tests run (bun test 1295a-signal-builders.test.ts)
- Then: 16 assertions PASS, 0 FAIL, each signal type tested 4 ways (complete + 3 missing field scenarios)

---

## Implementation Guidance

### Builder Class Structure (per signal type)

```typescript
// Example: ChainCatalystBuilder

interface ChainCatalystBuilder {
  setEventType(type: string): this;
  setDirection(direction: "bullish" | "bearish" | "neutral"): this;
  setConfidence(confidence: number): this;
  addStock(code: string): this;
  addSector(sector: string): this;
  setHeadline(headline: string): this;
  setSource(source: string): this;
  build(): ChainCatalystFindingData; // Throws if required fields missing
}

class ChainCatalystBuilderImpl implements ChainCatalystBuilder {
  private data: Partial<ChainCatalystFindingData> = {
    affected_stocks: [],
    affected_sectors: [],
  };

  // Each setter returns 'this' for method chaining
  setEventType(type: string): this {
    this.data.event_type = type as any;
    return this;
  }

  // ... other setters ...

  build(): ChainCatalystFindingData {
    // Call Zod schema.parse() to validate + throw on missing fields
    return ChainCatalystFindingDataSchema.parse(this.data);
  }
}

export function createChainCatalystBuilder(): ChainCatalystBuilder {
  return new ChainCatalystBuilderImpl();
}
```

### Key Points

1. **Fluent API**: Each setter returns `this` to enable method chaining
2. **Zod reuse**: Use existing Zod schemas from signalTypes.ts (no duplication)
3. **Clear errors**: Zod.parse() throws with field names on validation failure
4. **Required fields enforcement**: build() validates complete payload before returning
5. **Array fields**: addStock(), addSector() append to arrays (not set)

### Test Scenarios (per signal type)

- **Scenario 1**: Complete payload → build() succeeds, returns valid object
- **Scenario 2**: Missing required field 1 → build() throws with field name
- **Scenario 3**: Missing required field 2 → build() throws with field name
- **Scenario 4**: Missing required field 3 → build() throws with field name

Total: 4 signal types × 4 scenarios = 16 test assertions

---

## QA Sign-Off

Task complete when:
- `bun test src/__tests__/1295a-signal-builders.test.ts` → 16/16 GREEN
- `bun tsc --noEmit` → 0 TS errors (builders are type-safe)
- DDD rule check: domain/signals/signalBuilders.ts does NOT import infrastructure/
- Builders exported in src/domain/signals/index.ts (barrel export)

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalBuilders.ts (NEW — 4 builder classes + 4 factory functions, 240 LOC)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1295a-signal-builders.test.ts (NEW — 16 test assertions, 4 scenarios per builder, 168 LOC)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/index.ts (MODIFIED — added barrel exports for builders, 12 lines added)

tests_written:
- src/__tests__/1295a-signal-builders.test.ts — 16 assertions, all GREEN
  - 4 builders tested (ChainCatalyst, PriceConfirmation, UrgentNews, CrossValidate)
  - 4 scenarios per builder: (a) complete payload passes, (b) missing field1 throws, (c) missing field2 throws, (d) missing field3 throws
  - All assertions use fluent API chaining and validate build() behavior

tests_skipped: []

tsc_clean: true (no TypeScript errors)
full_suite_pass: true (signal builders: 16/16, signal types: 28/28, total: 44/44)

key_findings:
- Fluent API pattern works as designed: each setter returns 'this' for method chaining
- Zod validation correctly throws on missing/invalid required fields
- DDD layering maintained: signalBuilders.ts imports only from domain/signals/ (no infrastructure/application)
- CrossValidateFindingData interface was already defined in signalTypes.ts (task 1293a)
- No breaking changes to existing signal type tests

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalBuilders.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1295a-signal-builders.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/index.ts

merge_commit: pending
