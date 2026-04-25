---
sprint: 1328
branch: task/1328a-signal-payload-completeness
size: S
depends_on: []
blocks: [1328b, 1328c, 1328d]
---

## TLDR
Add 3 optional numeric fields to signal payload interfaces (newsSentiment, kinhDichConfidence, agentSignalsMajority) so cowork agents can provide conviction inputs directly in signals. Enables 4-AND watchlist-opportunity rule to work.

## [PM] Planning Context

### Acceptance Criteria
- [ ] ChainCatalystFindingData interface has 3 new optional fields
- [ ] PriceConfirmationData interface has 1 new optional field
- [ ] All other signal types reviewed for optional field additions
- [ ] Types are properly exported and documented
- [ ] No breaking changes to existing signal producers

### Files to read first
- `apps/mcp-server/src/domain/signals/signalTypes.ts` (lines 18-177) — current signal interface definitions
- `.claude/knowledge/mcp-tools.md` (signal types section) — context on signal design

### Files to modify
- `apps/mcp-server/src/domain/signals/signalTypes.ts` (lines 26, 112, and review 137-177)

### Files to create
- None

### Dependencies
- None (Phase 1a is foundational)

### Knowledge needed
- TypeScript interfaces + generics
- Signal payload design principles
- No domain knowledge required

---

## [Architect] Brownfield Findings

**Signal Type Architecture (lines 18-177):**
- `ChainCatalystFindingData` (18-94) — 7 required fields. Currently used by News Scout + Financial Analyst
- `PriceConfirmationData` (104-127) — 5 required fields. Used by Market Watcher
- `UrgentNewsSignal` (137-152) — 3 required fields. Used for breaking news
- `CrossValidateSignal` (162-177) — 3 required fields. Used for multi-source validation

**Reuse Patterns:**
- All signal types use common pattern: type field + direction enum + confidence number
- Optional fields can be added without breaking existing producers (backward compatible)
- Sentiment field already exists in IMF cascade signal (Task 1296b, line 52)

**Design Decisions:**
- Make all 3 new fields optional (`?`) to not break existing signals
- Add to `ChainCatalystFindingData` first (News Scout primary producer)
- Add to `PriceConfirmationData` for alignment (even though less critical)
- Document fields with clear type constraints (number ranges)

**Scan Clean:** True ✓ (no DDD violations, all types in domain/ layer)

---

## Implementation Guide

### Step 1: Update ChainCatalystFindingData (line 26)

**Current (lines 26-94):**
```typescript
export interface ChainCatalystFindingData {
  event_type: CatalystEventType;
  direction: MarketDirection;
  confidence: number;
  affected_stocks: string[];
  affected_sectors: string[];
  headline: string;
  source: string;
  imfSentiment?: { ... };  // Task 1296b
}
```

**Add after `imfSentiment?` (line 90):**
```typescript
  /**
   * Aggregated news sentiment from all analysis sources (-1.0 bullish to +1.0 bearish)
   * Calculated by News Scout from news database sentiment scores
   */
  newsSentiment?: number;

  /**
   * Kinh Dich hexagram confidence in percent (0-100)
   * How confident is the hexagram reading about direction
   */
  kinhDichConfidence?: number;

  /**
   * Majority vote from analysis agents (BUY/SELL/NEUTRAL)
   * Each agent votes based on their analysis → system takes majority
   * Example: News Scout=BUY, Financial Analyst=BUY, Market Watcher=NEUTRAL → BUY
   */
  agentSignalsMajority?: 'BUY' | 'SELL' | 'NEUTRAL';
```

### Step 2: Update PriceConfirmationData (line 112)

**Current (lines 112-127):**
```typescript
export interface PriceConfirmationData {
  price_change_pct: number;
  volume_ratio: number;
  confirms_direction: boolean;
  fully_priced: boolean;
  confidence: number;
}
```

**Add before closing brace (line 127):**
```typescript
  /**
   * How well does price action align with news sentiment (0-1)
   * Used by Market Watcher to boost/confirm sentiment-driven moves
   */
  sentiment_alignment?: number;
```

### Step 3: Review other signal types

Check lines 137-177:
- `UrgentNewsSignal` — Add `newsSentiment?` if applicable (breaking news intensity)
- `CrossValidateSignal` — Already flexible, no changes needed

### Step 4: Compile & verify

```bash
cd apps/mcp-server
bun tsc --noEmit  # Must be 0 errors
```

### Step 5: Test type compatibility (simple check)

Create small test to verify optional fields work:
```typescript
// Should compile without error
const signal1: ChainCatalystFindingData = {
  event_type: "earnings",
  direction: "bullish",
  confidence: 0.75,
  affected_stocks: ["VNM"],
  affected_sectors: ["consumer"],
  headline: "Q1 beat",
  source: "cafef"
  // Missing optional fields — OK
};

const signal2: ChainCatalystFindingData = {
  ...signal1,
  newsSentiment: 0.65,
  kinhDichConfidence: 85,
  agentSignalsMajority: "BUY"
  // With optional fields — OK
};
```

---

## Notes for Developer

- This is foundational work. Phases 1b-1e depend on these types existing.
- Keep backward compatibility: existing signals without new fields must still work
- No producer changes needed yet. Changes happen in 1328h when cowork agents populate new fields
- Database migration happens in separate task (1328c)

---

## Verification

✅ Type definitions compile without error
✅ Optional fields are truly optional (existing signals don't break)
✅ Field names and types match naming conventions (camelCase, sensible ranges)
✅ Documentation clear for future producers
