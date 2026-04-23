# Task Context — 1295b: Agent Spec Update

## TLDR (read this first — complete for simple tasks)
change: `.claude/agents/01-news-scout.md` — Add builder import + usage pattern in signal construction steps | `.claude/agents/04-market-watcher.md` — Same for price confirmation builder | `docs/agent-memory/patterns/signal-payload-quality.md` — Add "Prevention: Use builders" section with code examples
test: Manual review (no code test file — documentation task) + agent simulator verification
branch: task/1295b-agent-specs
depends: 1295a (builders must exist first)
knowledge_needed: [bundle-developer]

---

sprint: 1295
branch: task/1295b-agent-specs
status: todo
req_ref: none
tech_ref: TECH-1295

---

## [PM] Planning Context

layer: documentation + agent specifications
depends_on: [1295a ✓ builders exported]

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/01-news-scout.md # Current spec (line 92: documents required finding_data)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/04-market-watcher.md # Current spec (line 155: documents required finding_data)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/patterns/signal-payload-quality.md # Pattern reference (created 2026-04-23)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalBuilders.ts # TECH-1295 builder reference (from 1295a)

files_to_create: none (documentation only)

files_to_modify:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/01-news-scout.md # MODIFY: Add builder usage in signal construction steps
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/04-market-watcher.md # MODIFY: Add builder usage in signal construction steps
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/patterns/signal-payload-quality.md # MODIFY: Add builder prevention pattern

test_file: none (code review + agent simulator only)

acceptance_criteria:
- Given: Agent spec 01-news-scout.md and builder signalBuilders.ts exist
- When: Agent spec is updated to reference createChainCatalystBuilder() in signal construction
- Then: Spec documents builder import, setter methods, error handling, and retry logic
- When: 04-market-watcher.md is updated similarly for PriceConfirmationBuilder
- Then: Both agents show fluent API usage with method chaining examples
- When: signal-payload-quality.md pattern is updated
- Then: "Prevention" section includes builder code examples + links to agent specs
- When: Architect reviews agent memory update
- Then: Sign-off complete (QA manual review, no automated test)

---

## Implementation Guidance

### 01-news-scout.md Changes

**Current state**: Step 4 constructs finding_data as object literal (no validation)

```typescript
// OLD (current)
const finding_data = {
  event_type: "credit_policy",
  direction: "bullish",
  // ... risk: incomplete data, will be rejected at MCP tool
};
```

**New state**: Step 4 uses builder (pre-emit validation)

```typescript
// NEW (1295b update)
import { createChainCatalystBuilder } from "@domain/signals";

// Step 4.1: Construct using builder
const finding = createChainCatalystBuilder()
  .setEventType("credit_policy")
  .setDirection("bullish")
  .setConfidence(0.8)
  .addStock("VIC")
  .addSector("Banking")
  .setHeadline("Central bank policy shift")
  .setSource("cafef")
  .build(); // Throws if any required field missing

// Step 4.2: Error handling
// If build() throws, log error message + retry with clarified narrative

// Step 4.3: Safe to post (builder guarantees completeness)
post_agent_signal(signal_type="chain_catalyst", finding_data=finding, ...)
```

**Sections to update**:
- Line 92 (current required_fields doc): Update with builder reference
- Step 4.1 (new): Import statement
- Step 4.2: Constructor logic (builder pattern)
- Step 4.3: Error handling (catch builder.build() errors)
- Step 4.4: Post signal (builder guarantees valid payload)

### 04-market-watcher.md Changes

**Same pattern** for PriceConfirmation:

```typescript
import { createPriceConfirmationBuilder } from "@domain/signals";

const confirmation = createPriceConfirmationBuilder()
  .setPriceChangePct(price_change_pct)
  .setVolumeRatio(volume_ratio)
  .setConfirmsDirection(direction)
  .setFullyPriced(fully_priced)
  .setConfidence(confidence)
  .build();
```

### signal-payload-quality.md Pattern Update

**Add new section**: "Prevention: Use Typed Builders"

```markdown
## Prevention: Use Typed Builders

Instead of constructing signal payloads as object literals (error-prone), use typed builders from `src/domain/signals/signalBuilders.ts`. Builders enforce complete field set at build-time, before posting.

### Examples

**Chain Catalyst Signal**:
```typescript
import { createChainCatalystBuilder } from "@domain/signals";

const finding = createChainCatalystBuilder()
  .setEventType("credit_policy")
  .setDirection("bullish")
  .setConfidence(0.8)
  .addStock("VIC")
  .setHeadline("...")
  .setSource("...")
  .build(); // Throws if any required field missing
```

**Price Confirmation Signal**:
```typescript
import { createPriceConfirmationBuilder } from "@domain/signals";

const confirmation = createPriceConfirmationBuilder()
  .setPriceChangePct(3.2)
  .setVolumeRatio(1.5)
  .setConfirmsDirection("bullish")
  .setFullyPriced(false)
  .setConfidence(0.75)
  .build();
```

### Benefits

- Pre-emit validation (agents detect missing fields before API call)
- Clear error messages (Zod schema validation)
- Type-safe (TypeScript compiler ensures setter method correctness)
- Fluent API (method chaining encourages complete construction)
```

---

## QA Sign-Off

Task complete when:
- Agent specs reviewed by Architect (manual approval)
- Both 01-news-scout.md and 04-market-watcher.md reference builders in signal construction steps
- signal-payload-quality.md pattern includes builder examples + usage guidance
- Agent simulator can parse specs and confirm builder imports are valid (use Claude as agent simulator)
- No test failures (documentation task)

---

## [Developer] Implementation Record

files_actually_modified:
- .claude/agents/01-news-scout.md (lines 89-164)   # Added ChainCatalystBuilder + UrgentNewsBuilder import + 4-step construction pattern (4.1 fluent API, 4.2 error handling, 4.3 post signal, 4.4 urgent news)
- .claude/agents/04-market-watcher.md (lines 151-209)   # Added PriceConfirmationBuilder import + 4-step pattern (3.5.1 fetch, 3.5.2 build, 3.5.3 error handling, 3.5.4 post signal)
- docs/agent-memory/patterns/signal-payload-quality.md (lines 81-289)   # Added Prevention section: 440-word explanation, builder classes table, 3 usage examples (ChainCatalyst, PriceConfirmation, UrgentNews), error handling pattern, prevention checklist (8 items), benefits list, related tasks

tests_written: none (documentation task — no code test file required)

tests_skipped: none

tsc_clean: true (no TypeScript changes)

full_suite_pass: true (no code changes affecting test suite)
