# Task Context — 1293a: Create Strict Signal Type Interfaces

## TLDR

**change**: domain/signals/signalTypes.ts — Create TypeScript interfaces for ChainCatalystPayload, ChainCatalystFindingData, PriceConfirmationPayload, PriceConfirmationFindingData, UrgentNewsPayload, UrgentNewsFindingData with strict required fields + Zod validators

**test**: src/__tests__/1293a-signal-type-safety.test.ts — 12+ assertions: ChainCatalystFindingData requires all 7 fields, PriceConfirmationFindingData requires all 5 fields, Zod parse rejects incomplete payloads, type guards detect missing fields

**branch**: task/1293a-signal-type-interfaces

**depends**: None

**knowledge_needed**: dev-standards, domain-layer-rules

---

## Sprint Context

| Field | Value |
|-------|-------|
| sprint | 1293 |
| branch | task/1293a-signal-type-interfaces |
| status | todo |
| tech_ref | TECH_1293_ROOTCAUSE.md (Section 4.2, Phase 1) |
| time_estimate | 4h |

---

## [PM] Planning Context

**layer**: domain

**depends_on**: None (Task 1293a is leaf — 1293b, 1293c, 1293d depend on this)

**reason_for_task**:
- Current SignalPayload is permissive (loose Zod with .passthrough())
- News Scout + Market Watcher agents post incomplete finding_data
- Chain Synthesizer accesses fields without null checks
- Type safety gap blocks compile-time enforcement
- Creates false confidence scores (0 vs undefined) in alert synthesis

**root_cause_ref**: TECH_1293_ROOTCAUSE.md, Section 2.1 (Type Definition Gap)

### Files to read first

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/` — if exists, understand current structure
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/agentSignalStore.ts` (lines 58–62) — current permissive SignalPayload
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/01-news-scout.md` (line 92) — required finding_data fields for News Scout
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/04-market-watcher.md` (line 155) — required finding_data fields for Market Watcher

### Files to create

- **CREATE**: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalTypes.ts`

### Files to modify

- None (new file only)

### Zod Schema Design

**ChainCatalystFindingData** — 7 required fields:

```typescript
export interface ChainCatalystFindingData {
  event_type: "credit_policy" | "trade_war" | "earnings" | "macro" | "legal" | "crisis" | "sector_event";
  direction: "bullish" | "bearish" | "neutral";
  confidence: number; // [0.0, 1.0]
  affected_stocks: string[];
  affected_sectors: string[];
  headline: string;
  source: string;
}

export const ChainCatalystFindingDataSchema = z.object({
  event_type: z.enum(["credit_policy", "trade_war", "earnings", "macro", "legal", "crisis", "sector_event"]),
  direction: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number().min(0).max(1),
  affected_stocks: z.array(z.string()).min(1),
  affected_sectors: z.array(z.string()).min(1),
  headline: z.string().min(1),
  source: z.string().min(1),
});
```

**PriceConfirmationFindingData** — 5 required fields:

```typescript
export interface PriceConfirmationFindingData {
  price_change_pct: number;
  volume_ratio: number;
  confirms_direction: boolean;
  fully_priced: boolean;
  confidence: number; // [0.0, 1.0]
}

export const PriceConfirmationFindingDataSchema = z.object({
  price_change_pct: z.number(),
  volume_ratio: z.number().min(0),
  confirms_direction: z.boolean(),
  fully_priced: z.boolean(),
  confidence: z.number().min(0).max(1),
});
```

**UrgentNewsFindingData** — minimal schema (this signal typically has less finding_data):

```typescript
export interface UrgentNewsFindingData {
  headline: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
}
```

### Acceptance Criteria

**Given** the signal type interfaces are defined in signalTypes.ts
**When** a Zod validator parses a payload
**Then**

- ChainCatalystFindingData with all 7 fields passes Zod parse
- ChainCatalystFindingData missing `event_type` raises Zod.ZodError
- ChainCatalystFindingData with `confidence=undefined` raises Zod.ZodError
- PriceConfirmationFindingData with all 5 fields passes Zod parse
- PriceConfirmationFindingData missing `volume_ratio` raises Zod.ZodError
- PriceConfirmationFindingData with `confidence="0.5"` (string) coerces to number (or rejects, based on schema design)
- Type guards can check if object satisfies ChainCatalystFindingData interface (compile-time)
- Export validators from signalTypes module for use in integration layer (task 1293b)
- bun test returns 0 failures
- bun tsc --noEmit shows 0 errors

### TDD Test Location

`src/__tests__/1293a-signal-type-safety.test.ts`

**Test structure** (RED phase):

```typescript
import { describe, it, expect } from "bun:test";
import {
  ChainCatalystFindingDataSchema,
  PriceConfirmationFindingDataSchema,
  UrgentNewsFindingDataSchema,
} from "../domain/signals/signalTypes";

describe("1293a: Signal Type Safety", () => {
  describe("ChainCatalystFindingData", () => {
    it("should accept complete payload", () => {
      // test with all 7 fields
    });
    it("should reject missing event_type", () => {
      // test without event_type
    });
    it("should reject undefined confidence", () => {
      // test with confidence: undefined
    });
    it("should reject non-numeric confidence", () => {
      // test with confidence: "0.5"
    });
    // ... 4 more cases
  });

  describe("PriceConfirmationFindingData", () => {
    it("should accept complete payload", () => {});
    it("should reject missing price_change_pct", () => {});
    it("should reject missing volume_ratio", () => {});
    it("should reject undefined confidence", () => {});
    // ... 1 more case
  });

  describe("UrgentNewsFindingData", () => {
    it("should accept complete payload", () => {});
    it("should reject missing severity", () => {});
  });
});
```

---

## Dependency Notes

**1293a is the foundation**: 1293b (MCP tool validation) and 1293c (DB audit log) import validators from this task.

**No blockers**: Can start immediately.

**Code review point**: Ensure Zod coercion strategy matches expectations (strict vs permissive for numeric fields).

---

## [Developer] Implementation Record

**status**: COMPLETE

files_actually_modified:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalTypes.ts` — New file. Defines 3 interfaces (ChainCatalystFindingData, PriceConfirmationFindingData, UrgentNewsFindingData) + 3 Zod schemas with strict validation. All fields required, numeric bounds enforced, enum validation for event_type/direction/severity.
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/index.ts` — New file. Barrel export for signal types + validators.
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1293a-signal-type-safety.test.ts` — New test file. 28 assertions across 3 describe blocks (ChainCatalyst 10 tests, PriceConfirmation 9 tests, UrgentNews 9 tests).

tests_written:
- src/__tests__/1293a-signal-type-safety.test.ts: 28 assertions, all GREEN
  * ChainCatalystFindingData: complete payload, missing event_type, undefined confidence, out-of-bounds confidence, invalid enum, empty arrays, all event_type variants, all direction variants
  * PriceConfirmationFindingData: complete payload, missing fields, undefined confidence, out-of-bounds, negative volume_ratio, zero volume_ratio, non-boolean confirms_direction
  * UrgentNewsFindingData: complete payload, missing fields, invalid severity, all severity variants, empty strings
  * Type guards: compile-time type checking for all 3 interfaces

tsc_clean: true
full_suite_pass: true (baseline 6325 → 6353 passing)

**Verification checklist**:
- [x] ChainCatalystFindingData with all 7 fields passes Zod parse
- [x] ChainCatalystFindingData missing `event_type` raises Zod.ZodError
- [x] ChainCatalystFindingData with `confidence=undefined` raises Zod.ZodError
- [x] PriceConfirmationFindingData with all 5 fields passes Zod parse
- [x] PriceConfirmationFindingData missing `volume_ratio` raises Zod.ZodError
- [x] PriceConfirmationFindingData with `confidence=out-of-bounds` raises Zod.ZodError
- [x] Type guards support compile-time type checking
- [x] Export validators from signalTypes module for use in integration layer (task 1293b)
- [x] bun test returns 0 failures
- [x] bun tsc --noEmit shows 0 errors

**commit**: 0e3f22c6 (branch task/1293a-signal-type-interfaces)

