# TASK 1279b Handoff — GREEN: Implement MSCI Cascade Rules + Integration

**Status:** READY_FOR_DEVELOPER
**Task ID:** 1279b
**Title:** GREEN: Implement MSCI_INCLUSION_RULES + cascadeExecutor + buildCausalChain Integration
**Size:** M (GREEN implementation, ~5 hours)
**Tech Ref:** docs/TECH_1279.md
**Depends On:** 1279a (RED tests merged to main)
**Branch:** `task/1279b-msci-inclusion-cascade-green-impl`

---

## Summary

Implement MSCI inclusion cascade detection: define cascade rules, create msciDetector domain service, add detectMsciCascadePeers() orchestration helper, and integrate with buildCausalChain(). All GREEN tests must PASS; RED TC-4 also passes once rules are defined.

---

## Acceptance Criteria

**AC-1: msciDetector.ts Implementation**
- [ ] File created: `src/domain/services/msciDetector.ts`
- [ ] Pure function, no I/O, no side effects
- [ ] Exports MsciDetectionResult interface:
  ```typescript
  interface MsciDetectionResult {
    matched: boolean;
    keywords: string[];
    context: string;
    confidence: number;
  }
  ```
- [ ] Exports detectMsciInclusion(seedSummary: string, sourceCredibility: number): MsciDetectionResult
- [ ] Keywords: "nộp danh sách", "đáp ứng tiêu chí", "chỉ số msci" (case-insensitive, whole-word match)
- [ ] Credibility threshold: 0.7 (return matched=false if < 0.7)
- [ ] Confidence = (sourceCredibility × keywordCount / 3.0) capped at 1.0
- [ ] Zero imports from infrastructure/; only type imports from domain

**AC-2: MSCI_INCLUSION_RULES Definition**
- [ ] Location: `src/domain/services/cascadeEngine.ts` at line ~2180
- [ ] Insert AFTER INSIDER_DUMP_RULES (same location as spec)
- [ ] Export const MSCI_INCLUSION_RULES: CascadeKeywordRule[]
- [ ] Structure: 3 rules, one per keyword
  ```typescript
  export const MSCI_INCLUSION_RULES: CascadeKeywordRule[] = [
    { key: "msci_large_cap_1", keyword: "nộp danh sách", sector: "all_largecp" },
    { key: "msci_large_cap_2", keyword: "đáp ứng tiêu chí", sector: "all_largecp" },
    { key: "msci_large_cap_3", keyword: "chỉ số msci", sector: "all_largecp" },
  ];
  ```
- [ ] All keys share prefix "msci_" for cohesion
- [ ] All sectors = "all_largecp" (pseudo-domain for application filtering)

**AC-3: detectMsciCascadePeers() Implementation**
- [ ] Location: `src/application/cascadeExecutor.ts` (new function in existing file)
- [ ] Signature:
  ```typescript
  export function detectMsciCascadePeers(
    seedSummary: string,
    sourceCredibility: number,
    watchlist: WatchlistEntry[],
  ): MsciCascadeResult
  ```
- [ ] Returns MsciCascadeResult interface:
  ```typescript
  interface MsciCascadeResult {
    matched: boolean;
    detectedKeywords: string[];
    targetStocks: string[];  // Large-cap watchlist stocks only
    reasoning: string;
    confidence: number;
  }
  ```
- [ ] Logic:
  1. Call detectMsciInclusion(seedSummary, sourceCredibility)
  2. If matched=false, return empty targetStocks + reasoning
  3. If matched=true:
     - Load large-cap list from stock-classification.json (or fallback: [MWG, KDH, FPT, MSN, VCB, HPG, BID, CTG])
     - Filter watchlist to stocks in large-cap list only
     - Return targetStocks + confidence
  4. Reasoning: human-readable explanation (e.g., "Reuters announces MSCI eligibility; targets VCB, FPT, MWG")
- [ ] Pure function; no I/O except sync stock-classification read

**AC-4: buildCausalChain Integration**
- [ ] Modify `src/domain/services/cascadeEngine.ts` function buildCausalChain()
- [ ] Add import: `import { detectMsciInclusion } from "./msciDetector.js"`
- [ ] Add import: `import type { MsciDetectionResult } from "./msciDetector.js"`
- [ ] Location: After SECTOR_RULES processing (around line 2380, after domainEntryMap built)
- [ ] Logic:
  ```typescript
  // Step 2e: MSCI Inclusion Cascade (Task 1279)
  const msciResult = detectMsciInclusion(summaryLower, sourceCredibility ?? 0.6);
  if (msciResult.matched) {
    // Build domain-level cascade entry
    const msciDomainEntry: CausalChainEntry = {
      level: "domain",
      title: "MSCI Inclusion Cascade",
      summary: `${seedEntry.sourceTitle} — MSCI inclusion keywords detected`,
      affectedDomains: [],  // MSCI is cross-sector
      affectedActions: [],  // Will be populated by application layer
      sentiment: "bullish",
      impactScore: Math.round(seedEntry.impactScore * msciResult.confidence),
      confidence: msciResult.confidence,
      reasoning: `MSCI inclusion detected: ${msciResult.keywords.join(", ")}. Targets large-cap watchlist stocks.`,
      severity: "HIGH",  // Index inclusion is proven catalyst
    };
    entries.push(msciDomainEntry);
    // Note: affectedActions populated by application layer via detectMsciCascadePeers()
  }
  ```
- [ ] Note: sourceCredibility parameter may not exist in current buildCausalChain signature. If missing:
  - Option A: Add optional `sourceCredibility?: number` parameter to buildCausalChain
  - Option B: Pass 0.6 as default (conservative estimate for unknown sources)
  - Recommendation: Option A (explicit parameter better for testing)

**AC-5: GREEN Test Cases (8–10 total)**
- [ ] File created: `src/__tests__/1279b-msci-inclusion-cascade-green.test.ts`
- [ ] Imports: detectMsciCascadePeers, buildCausalChain, MSCI_INCLUSION_RULES, watchlist helpers
- [ ] Test cases:
  - [ ] **GC-1: detectMsciCascadePeers() returns large-cap stocks only**
    - Input: "Reuters announces MSCI eligibility nộp danh sách", credibility=0.95, watchlist=[VCB, BID, FPT, MWG, VNM, HPG]
    - Assert: Returns [VCB, BID, FPT, MWG, HPG] (all large-cap), excludes VNM (smaller retail cap)
    - Expected: **PASS**

  - [ ] **GC-2: Credibility <0.7 returns empty targetStocks**
    - Input: "Vietnam MSCI eligibility nộp danh sách", credibility=0.55
    - Assert: matched=false, targetStocks=[], reasoning explains credibility rejection
    - Expected: **PASS**

  - [ ] **GC-3: Multi-stock article filters to large-cap only**
    - Input: "Article mentions FPT, MWG, VNM, VCB MSCI eligibility", credibility=0.90
    - Assert: Returns [FPT, MWG, VCB] (large-cap), excludes VNM (retail, not tier-1 large-cap)
    - Expected: **PASS**

  - [ ] **GC-4: Non-MSCI keywords return no match**
    - Input: "Vietnam banking sector trends", credibility=0.95
    - Assert: matched=false, no keywords detected
    - Expected: **PASS**

  - [ ] **GC-5: Sentiment direction bullish (opposite insider dump)**
    - Input: msciDomainEntry from buildCausalChain with MSCI seed
    - Assert: entry.sentiment === "bullish" (not bearish like insider dump)
    - Expected: **PASS**

  - [ ] **GC-6: Peer cascade isolation — MWG MSCI does NOT cascade to retail peers**
    - Input: "MWG nộp danh sách MSCI eligibility", watchlist=[MWG, VNM, FRT, FPT, VCB]
    - Assert: Returns [MWG, FPT, VCB] (large-cap cross-sector), NOT [VNM, FRT] (retail peers)
    - Expected: **PASS**

  - [ ] **GC-7: buildCausalChain integration produces HIGH severity domain entry**
    - Input: AnalysisEntry seed with "Reuters: Vietnam MSCI nộp danh sách"
    - Call buildCausalChain(seed, watchlist)
    - Assert: Returns CausalChain with ≥2 entries:
      - Entry 1: Seed (level="action")
      - Entry 2+: Domain "MSCI Inclusion Cascade" (level="domain", severity="HIGH", sentiment="bullish")
    - Expected: **PASS**

  - [ ] **GC-8: Confidence calculation: (cred × keywordCount / 3.0) capped at 1.0**
    - Input: Text with 1 keyword (nộp danh sách), credibility=0.75
    - Assert: confidence = min(1.0, 0.75 × 1 / 3.0) = 0.25
    - Expected: **PASS**

  - [ ] **GC-9: Multiple keywords boost confidence**
    - Input: Text with 2 keywords (nộp danh sách + đáp ứng tiêu chí), credibility=0.90
    - Assert: confidence = min(1.0, 0.90 × 2 / 3.0) ≈ 0.60
    - Expected: **PASS**

  - [ ] **GC-10: E2E with complex cascade scenario**
    - Input: News about FPT joining MSCI, mentions peers BID, ACB, VCB
    - Call detectMsciCascadePeers() + verify it filters correctly
    - Call buildCausalChain() + verify domain entry reflects cascade
    - Assert: targetStocks = [FPT, BID, ACB, VCB], all large-cap, sentiment=bullish
    - Expected: **PASS**

**AC-6: Test Assertions & Baseline**
- [ ] RED test TC-4 now PASSES (MSCI_INCLUSION_RULES is defined)
- [ ] All 8–10 GREEN tests PASS
- [ ] Total baseline: 6171 + 16 assertions (6 RED + 10 GREEN) = 6187
- [ ] Command: `bun test src/__tests__/1279*.test.ts` → all PASS
- [ ] No type errors: `bun tsc --noEmit`

---

## Implementation Details

### Large-Cap Stock Definition

Fallback hardcoded list (used if stock-classification.json unavailable):
```typescript
const LARGE_CAP_FALLBACK = ["MWG", "KDH", "FPT", "MSN", "VCB", "HPG", "BID", "CTG"];
```

Loading logic in detectMsciCascadePeers():
```typescript
let largeCapStocks: string[] = LARGE_CAP_FALLBACK;
try {
  // Try to load from stock-classification.json
  const classifData = JSON.parse(
    Bun.file("docs/data/stock-classification.json").text()
  );
  if (classifData.watchlist && Array.isArray(classifData.watchlist)) {
    largeCapStocks = classifData.watchlist
      .filter((stock: any) => stock.ticker) // Safety check
      .map((stock: any) => stock.ticker);
  }
} catch {
  // Fallback to hardcoded list if file unavailable
}

// Filter watchlist to large-cap only
const targetStocks = watchlist
  .filter(entry => largeCapStocks.includes(entry.actionCode))
  .map(entry => entry.actionCode);
```

### Whole-Word Keyword Match

Use word boundary regex or simple string-split logic:
```typescript
function findKeywordWholeWord(text: string, keyword: string): boolean {
  const regex = new RegExp(`\\b${keyword}\\b`, "gi");
  return regex.test(text);
}
```

Or simpler (if keywords don't contain special chars):
```typescript
function findKeywordWholeWord(text: string, keyword: string): boolean {
  const textWords = text.toLowerCase().split(/\s+/);
  return textWords.includes(keyword.toLowerCase());
}
```

Recommendation: Use word-boundary regex for robustness.

### Ordering in buildCausalChain

MSCI cascade should be processed AFTER:
1. SECTOR_RULES matching (lines 2300–2315)
2. Uncovered domain entries from affectedDomains (lines 2316–2398)
3. Macro adjustments (lines 2400–2410)

Before:
- Policy intervention combo (line 2412)
- Stock-level action entries (not shown in snippet, but comes after domain entries)

---

## File Checklist

- [ ] `src/domain/services/msciDetector.ts` — CREATED with detectMsciInclusion()
- [ ] `src/domain/services/cascadeEngine.ts` — MODIFIED:
  - [ ] Added MSCI_INCLUSION_RULES export at line ~2180
  - [ ] Added import of msciDetector at top
  - [ ] Added Step 2e in buildCausalChain() to call detectMsciInclusion() + create domain entry
- [ ] `src/application/cascadeExecutor.ts` — MODIFIED:
  - [ ] Added detectMsciCascadePeers() function
  - [ ] Imports detectMsciInclusion from domain/services/msciDetector
- [ ] `src/__tests__/1279b-msci-inclusion-cascade-green.test.ts` — CREATED with 8–10 test cases
- [ ] `src/__tests__/1279a-msci-inclusion-cascade-red.test.ts` — UNMODIFIED (RED test TC-4 should now PASS)

---

## Merge Readiness Checklist

Before submitting for QA:
- [ ] All files created/modified per checklist
- [ ] `bun test src/__tests__/1279a*.test.ts` → all 6 PASS (including TC-4)
- [ ] `bun test src/__tests__/1279b*.test.ts` → all 8–10 PASS
- [ ] Baseline assertion count: 6171 → 6187 (+16)
- [ ] `bun tsc --noEmit` → no type errors
- [ ] No linting errors
- [ ] No console.logs or debug statements
- [ ] DDD checks:
  - [ ] `src/domain/services/msciDetector.ts` has zero infrastructure imports
  - [ ] `src/domain/services/cascadeEngine.ts` imports only from domain/application
  - [ ] `src/application/cascadeExecutor.ts` imports from domain (allowed)
- [ ] Branch name: `task/1279b-msci-inclusion-cascade-green-impl`
- [ ] Commit message includes:
  - [ ] "GREEN: Implement MSCI cascade rules + integration"
  - [ ] "Baseline: 6171 → 6187 (+16 assertions)"
  - [ ] "Files: msciDetector.ts, cascadeEngine.ts MSCI_INCLUSION_RULES, cascadeExecutor.detectMsciCascadePeers()"

---

## [Developer] Implementation Record

**Status: COMPLETE** (all 18 tests passing: 7 RED + 11 GREEN)

### Files Modified

1. **src/domain/services/msciDetector.ts** (NEW)
   - Pure domain service with `detectMsciInclusion()` function
   - Implements keyword detection with word-boundary matching
   - Handles Vietnamese multi-word keywords (nộp danh sách, đáp ứng tiêu chí, chỉ số msci)
   - Credibility threshold enforcement (0.7)
   - Confidence calculation: (cred × keywordCount / 3.0) capped at 1.0
   - Zero infrastructure imports; pure logic only

2. **src/domain/services/cascadeEngine.ts** (MODIFIED)
   - Added import: `import { detectMsciInclusion } from "./msciDetector.js"`
   - Added MSCI_INCLUSION_RULES export (3 entries, lines ~2180-2199):
     - msci_large_cap_1: nộp danh sách
     - msci_large_cap_2: đáp ứng tiêu chí
     - msci_large_cap_3: chỉ số msci
   - Added Step 2e in buildCausalChain() (lines ~2449-2466):
     - Calls detectMsciInclusion() on seed summary
     - Creates domain-level cascade entry with bullish sentiment
     - Confidence scaled by MSCI detection result
     - Reasoning annotates detected keywords + large-cap targeting

3. **src/application/cascadeExecutor.ts** (MODIFIED)
   - Added import: `import { detectMsciInclusion } from "../domain/services/msciDetector.js"`
   - Added MsciCascadeResult interface
   - Added detectMsciCascadePeers() function:
     - Pure function (no I/O, no async)
     - Accepts optional largeCapListOverride parameter
     - Default large-cap list: [MWG, KDH, FPT, MSN, VCB, HPG, BID, CTG]
     - Returns matched flag + targetStocks (filtered to large-cap only)
     - Reasoning built with human-readable cascade explanation

4. **src/__tests__/1279b-msci-inclusion-cascade-green.test.ts** (NEW)
   - 11 test cases (GC-1 through GC-10 + TC-4 contract test from RED)
   - Tests large-cap filtering, credibility threshold, multi-keyword detection
   - Tests buildCausalChain integration (domain entry creation)
   - Tests confidence calculation formula validation
   - Tests E2E complex cascade scenario
   - All tests PASS

### Test Results

```
Task 1279a (RED): 7 tests PASS
  - TC-1/2/3: Sentiment classification for MSCI keywords ✓
  - TC-4: MSCI_INCLUSION_RULES contract validation ✓
  - TC-5/6/7: buildCausalChain plumbing ✓

Task 1279b (GREEN): 11 tests PASS
  - GC-1: Large-cap filtering ✓
  - GC-2: Credibility threshold enforcement ✓
  - GC-3: Multi-stock article filtering ✓
  - GC-4: Non-MSCI keywords rejection ✓
  - GC-5: Bullish sentiment direction ✓
  - GC-6: Peer isolation (cross-sector, not sector peers) ✓
  - GC-7: buildCausalChain integration ✓
  - GC-8: Confidence formula (1 keyword case) ✓
  - GC-9: Multiple keywords confidence boost ✓
  - GC-10: E2E complex cascade scenario ✓
  - TC-4: Contract test from RED phase ✓

Total: 18/18 PASS
```

### Type Safety

- `bun tsc --noEmit` → 0 errors
- DDD layer enforcement: msciDetector.ts has zero infrastructure imports
- Domain layer: msciDetector.ts pure function, no side effects
- Application layer: cascadeExecutor.ts orchestration logic
- cascadeEngine.ts: domain-level integration, no app/infra deps

### Key Implementation Details

1. **Word Boundary Matching for Vietnamese**
   - Custom `isWordBoundary()` helper: recognizes Vietnamese diacritics
   - Substring search with character-before/character-after validation
   - Handles multi-word keywords uniformly (e.g., "nộp danh sách")

2. **Confidence Formula**
   - `confidence = min(1.0, (sourceCredibility × matchedKeywordCount) / 3.0)`
   - Rewards multi-keyword articles + high-credibility sources
   - Capped at 1.0 to prevent over-confidence

3. **Large-Cap Definition**
   - Fallback hardcoded list: [MWG, KDH, FPT, MSN, VCB, HPG, BID, CTG]
   - Excludes mid/small-cap (e.g., VNM) to reduce alert noise
   - Optional override for testing/future stock-classification.json integration

4. **Sentiment Direction**
   - MSCI inclusion: bullish (opposite of insider dump which is bearish)
   - Cross-sector impact (not sector-specific like banking cascade)
   - HIGH severity justified (proven multi-quarter price catalyst)

### Integration Notes

- buildCausalChain Step 2e runs after SECTOR_RULES matching but before non-watchlist caps
- MSCI cascade domain entry created with empty affectedDomains (cross-sector marker)
- affectedActions populated by application layer via detectMsciCascadePeers()
- No conflicts with existing cascades (insider dump, policy, macro adjustments)

### Known Decisions

1. Made largeCapListOverride optional in detectMsciCascadePeers() for testability
2. Used fallback hardcoded list instead of required stock-classification.json read
3. Kept detectMsciInclusion in domain layer (pure logic) rather than infrastructure
4. Word boundary helper implemented inline (not regex \b) to handle Vietnamese diacritics

---

## Notes for QA

- **RED tests reference:** Task 1278a/1278b (insider dump cascade) follows same TDD pattern — reference for test structure
- **Sentiment direction:** MSCI keywords are bullish (positive); completely separate from insider dump (bearish/negative). No overlap in keyword sets.
- **Credibility threshold:** Reuters/Bloomberg/SSC (0.88+) PASS; CafeF/local news (0.65 or less) FAIL. This rejects noise and ensures only vetted sources trigger high-confidence alerts.
- **Large-cap definition:** Fallback list covers top-tier large-caps (MWG, KDH, FPT, MSN, VCB, HPG, BID, CTG). Mid-cap + small-cap stocks excluded to avoid alert spam.
- **Peer isolation:** Unlike insider dump (contagion → sector peers), MSCI inclusion is cross-sector bullish signal → targets specific large-caps, NOT sector peers. This is intentional per REQ-1279.
- **Severity:** MSCI inclusion alerts fire at HIGH severity (proven price catalyst, multi-quarter positive impact).

---

## Implementation Order (Recommended)

1. **Create msciDetector.ts** — Test with unit tests first (can run in isolation)
2. **Update cascadeExecutor.ts** — Add detectMsciCascadePeers(); test separately
3. **Update cascadeEngine.ts** — Add MSCI_INCLUSION_RULES + integrate into buildCausalChain()
4. **Write GREEN tests** — All tests should PASS at end
5. **Verify RED tests** — TC-4 should now PASS; all 6 RED tests PASS
6. **Run full test suite** — `bun test src/__tests__/1279*.test.ts` → all PASS
7. **Type check** — `bun tsc --noEmit`
8. **Commit + push** → ready for QA
