# TECH-1279b: MSCI Inclusion Cascade Detection — GREEN Phase Implementation

**status:** APPROVED_BY_ARCHITECT
**req_ref:** REQ-1279b
**sprint:** 1279
**date:** 2026-04-22

---

## Brownfield Impact

### Files Modified
- `/src/domain/services/cascadeEngine.ts` — Add MSCI_INCLUSION_RULES + integrate into buildCausalChain() step 2e
- `/src/application/cascadeExecutor.ts` — Add detectMsciCascadePeers() + MsciCascadeResult interface

### Files Created
- `/src/domain/services/msciDetector.ts` — MSCI keyword detection (NEW)
- `/src/__tests__/1279b-msci-inclusion-cascade-green.test.ts` — GREEN test suite (NEW)

### Files Verified (No Changes)
- `/src/domain/services/newsNormalizer.ts` — Type imports only (AnalysisEntry, Sentiment)
- `/src/__tests__/1279a-msci-inclusion-cascade-red.test.ts` — RED tests (merged, TC-4 will now PASS)

### Breaking Changes
**None.** MSCI detection is purely additive:
- New domain service + cascade rules + executor function
- No changes to existing function signatures
- buildCausalChain() remains backward compatible (msciResult check is defensive)
- All existing tests remain PASSING

---

## Architecture Decision

MSCI inclusion is a high-conviction, cross-sector bullish catalyst (proven 10–30% appreciation over 6 months). Unlike insider dump cascades (which target sector-specific peers via contagion), MSCI cascades target **tier-1 large-cap stocks** across sectors — a macroeconomic index-level effect.

**Design rationale:**
1. **Pure domain service** (`msciDetector.ts`) — Whole-word keyword matching with Vietnamese diacritic support + credibility filtering. No I/O, no side effects.
2. **Cascade rules in cascadeEngine.ts** — Three hardcoded keywords (nộp danh sách, đáp ứng tiêu chí, chỉ số msci) prefixed with "msci_". Reuses existing CascadeKeywordRule pattern.
3. **Application executor** (`detectMsciCascadePeers()`) — Orchestrates detector + large-cap filtering. Mirrors insider dump executor pattern.
4. **buildCausalChain integration** — Step 2e creates a domain-level entry with sentiment=bullish, severity=HIGH (proven catalyst).

**Why not reuse insider dump rules?** Insider dumps target **sector peers** (banking contagion); MSCI targets **cross-sector large-caps** (index-level impact). Separate rules + executor maintain clean separation of concerns.

---

## DDD Layer Plan

| Component | Layer | File Path | Modification | LOC |
|-----------|-------|-----------|--------------|-----|
| MsciDetectionResult | domain/types | src/domain/services/msciDetector.ts | NEW | 155 |
| detectMsciInclusion() | domain/services | src/domain/services/msciDetector.ts | NEW | 155 |
| MSCI_INCLUSION_RULES | domain/services | src/domain/services/cascadeEngine.ts:2199–2202 | NEW | 19 |
| buildCausalChain() integration | domain/services | src/domain/services/cascadeEngine.ts:2488–2506 | MODIFY | +18 |
| MsciCascadeResult | application/types | src/application/cascadeExecutor.ts | NEW | 10 |
| detectMsciCascadePeers() | application/usecases | src/application/cascadeExecutor.ts:166–233 | NEW | +67 |
| GREEN test suite | test/__tests__ | src/__tests__/1279b-msci-inclusion-cascade-green.test.ts | NEW | 200 |

**Layer compliance:**
- ✓ msciDetector.ts: Zero infrastructure imports (pure domain logic)
- ✓ cascadeEngine.ts: Imports only from domain (detectMsciInclusion, types)
- ✓ cascadeExecutor.ts: Imports from domain (allowed in application layer)
- ✓ Tests: Full DDD layer isolation verified

---

## Interface Contracts

### Domain Service: msciDetector.ts

```typescript
/**
 * MSCI Inclusion Cascade Detector (Task 1279)
 *
 * Pure domain function that detects Vietnamese MSCI inclusion keywords
 * in news text and returns detection result with confidence scoring.
 */

export interface MsciDetectionResult {
  /** True if MSCI keywords detected + credibility >= 0.7 */
  matched: boolean;
  /** List of matched keywords (lowercase) */
  keywords: string[];
  /** Excerpt of text around matched keywords */
  context: string;
  /** Confidence score: (cred × matchedCount / 3.0) capped at 1.0 */
  confidence: number;
}

/**
 * Detect MSCI inclusion keywords in seed text.
 *
 * Keywords (whole-word, case-insensitive):
 *   - "nộp danh sách" (submit list)
 *   - "đáp ứng tiêu chí" (meet criteria)
 *   - "chỉ số msci" (MSCI index)
 *
 * Credibility threshold: 0.7
 *   - If sourceCredibility < 0.7, return matched=false
 *   - If sourceCredibility >= 0.7, proceed with keyword matching
 *
 * Confidence calculation:
 *   - confidence = min(1.0, sourceCredibility × matchedKeywordCount / 3.0)
 *   - Formula rewards multi-keyword articles + high-credibility sources
 *   - Capped at 1.0 (prevents false certainty)
 *
 * @param seedSummary - News article text (may contain diacritics)
 * @param sourceCredibility - Credibility score [0, 1]
 * @returns Detection result with matched flag and confidence
 */
export function detectMsciInclusion(
  seedSummary: string,
  sourceCredibility: number,
): MsciDetectionResult
```

**Helper functions (internal):**
```typescript
function findKeywordWholeWord(text: string, keyword: string): boolean
function isWordBoundary(char: string): boolean
```

---

### Cascade Rules: cascadeEngine.ts

```typescript
export interface CascadeKeywordRule {
  /** Machine-readable rule identifier */
  key: string;
  /** Vietnamese keyword that triggers this rule */
  keyword: string;
  /** Sector pseudo-identifier (e.g., "all_largecp" for MSCI) */
  sector: string;
  /** Optional: impact type for agriculture rules */
  impactType?: string;
}

/**
 * MSCI Inclusion Cascade Rules (Task 1279)
 *
 * Three rules, one per keyword. All target "all_largecp" pseudo-sector
 * to signal cross-sector large-cap filtering (no peer cascade).
 *
 * Contrast with INSIDER_DUMP_RULES:
 *   - Insider dump: bearish, sector-specific (banking), peer contagion
 *   - MSCI inclusion: bullish, cross-sector, large-cap specific (no peer cascade)
 */
export const MSCI_INCLUSION_RULES: CascadeKeywordRule[] = [
  { key: "msci_large_cap_1", keyword: "nộp danh sách", sector: "all_largecp" },
  { key: "msci_large_cap_2", keyword: "đáp ứng tiêu chí", sector: "all_largecp" },
  { key: "msci_large_cap_3", keyword: "chỉ số msci", sector: "all_largecp" },
];
```

**Location in cascadeEngine.ts:** Lines 2199–2202 (immediately after INSIDER_DUMP_RULES)

---

### buildCausalChain Integration

**Location:** src/domain/services/cascadeEngine.ts, Step 2e (lines 2488–2506)

```typescript
// ── Step 2e: MSCI Inclusion Cascade (Task 1279) ─────────────────────────
// Detect MSCI index inclusion keywords + create domain-level cascade entry.
// MSCI inclusion is a cross-sector bullish catalyst affecting large-cap stocks.
// Application layer (detectMsciCascadePeers) filters watchlist to large-cap only.
const msciResult = detectMsciInclusion(summaryLower, seedEntry.confidence ?? 0.6);
if (msciResult.matched) {
  const msciDomainEntry: CausalChainEntry = {
    level: "domain",
    title: "MSCI Inclusion Cascade",
    summary: `${seedEntry.sourceTitle} — MSCI inclusion keywords detected`,
    affectedDomains: [],  // MSCI is cross-sector
    affectedActions: [],  // Populated by application layer via detectMsciCascadePeers()
    sentiment: "bullish",
    impactScore: Math.round(seedEntry.impactScore * msciResult.confidence),
    confidence: msciResult.confidence,
    reasoning: `MSCI inclusion detected: ${msciResult.keywords.join(", ")}. Targets large-cap watchlist stocks.`,
  };
  entries.push(msciDomainEntry);
}
```

**Key observations:**
- Uses `seedEntry.confidence ?? 0.6` as sourceCredibility (conservative default)
- `affectedDomains=[]` (cross-sector marker)
- `sentiment="bullish"` (MSCI inclusion is positive)
- impactScore scaled by msciResult.confidence (confidence-weighted impact)

---

### Application Executor: cascadeExecutor.ts

```typescript
/**
 * Result of MSCI inclusion detection + large-cap peer filtering.
 */
export interface MsciCascadeResult {
  /** True if MSCI keywords detected + credibility >= 0.7 */
  matched: boolean;
  /** List of detected MSCI keywords (lowercase) */
  detectedKeywords: string[];
  /** Large-cap watchlist stocks affected by cascade */
  targetStocks: string[];
  /** Human-readable explanation of cascade logic */
  reasoning: string;
  /** Confidence score: (credibility × keywordCount / 3.0) capped at 1.0 */
  confidence: number;
}

/**
 * Detect MSCI inclusion keywords + identify large-cap watchlist stocks.
 *
 * Logic:
 *   1. Call detectMsciInclusion(seedSummary, sourceCredibility)
 *   2. If matched=false, return empty targetStocks + credibility rejection reason
 *   3. If matched=true:
 *      - Use largeCapListOverride if provided (for testing flexibility)
 *      - Else use fallback: ["MWG", "KDH", "FPT", "MSN", "VCB", "HPG", "BID", "CTG"]
 *      - Filter watchlist to large-cap stocks only
 *      - Return result with confidence + human-readable reasoning
 *
 * @param seedSummary - News article text
 * @param sourceCredibility - Credibility score [0, 1]
 * @param watchlist - Full watchlist with domain/sector info
 * @param largeCapListOverride - Optional: override large-cap stock list (for testing)
 * @returns MsciCascadeResult with matched flag and targetStocks list
 */
export function detectMsciCascadePeers(
  seedSummary: string,
  sourceCredibility: number,
  watchlist: WatchlistEntry[],
  largeCapListOverride?: string[],
): MsciCascadeResult
```

**Implementation pattern (mirrors detectInsiderDumpPeers):**

1. Call domain detector: `detectMsciInclusion(summaryLower, sourceCredibility)`
2. If `matched=false`: Return rejection reason (credibility threshold)
3. If `matched=true`:
   - Use `largeCapListOverride` if provided, else fallback
   - Filter watchlist to large-cap codes only
   - Build reasoning annotation
   - Return MsciCascadeResult with confidence + targetStocks

---

## Task Breakdown (for Developer)

**Atomic implementation order (satisfies dependencies):**

| Task | Dependency | Description | Est. LOC |
|------|------------|-------------|----------|
| 1279b-a | None | Create msciDetector.ts + unit tests | 155 |
| 1279b-b | 1279b-a | Add MSCI_INCLUSION_RULES to cascadeEngine.ts (lines ~2199) | 19 |
| 1279b-c | 1279b-a | Add detectMsciCascadePeers() to cascadeExecutor.ts + test | 67 |
| 1279b-d | 1279b-b | Integrate into buildCausalChain() step 2e + test | 18 |
| 1279b-e | 1279b-c | Write 10 GREEN test cases (GC-1 through GC-10) + verify RED TC-4 | 200 |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Vietnamese diacritic edge cases in keyword matching | Low | Medium | Comprehensive test fixtures (GC-1 to GC-10) cover multi-diacritic scenarios + edge cases in spec |
| sourceCredibility < 0.7 boundary off-by-one | Low | Low | Unit test with credibility=0.69999 (must FAIL) + credibility=0.70000 (must PASS) |
| Large-cap list override missing in tests | Low | Medium | Fallback hardcoded list always available; tests can override via parameter |
| buildCausalChain sourceCredibility parameter missing | **Medium** | **Medium** | Uses `seedEntry.confidence ?? 0.6` as fallback; REQ-1279b specifies this mitigation |
| Confidence formula overflow (3 keywords × cred 1.0) | Low | Low | Formula: `min(1.0, ...)` prevents overflow; unit test covers this |
| Cross-sector logic not isolated (peers accidentally cascade) | Low | High | MSCI rules use "all_largecp" pseudo-sector (not real domain); application layer enforces large-cap filtering |

---

## Security Review

- [x] **SQL injection risk:** No SQL operations in detector or executor (pure logic only)
- [x] **Code injection risk:** No regex eval or dynamic code generation. Keyword matching is substring-based.
- [x] **Credibility threshold prevents low-confidence sources:** sourceCredibility < 0.7 → matched=false
- [x] **No unvalidated user input:** Keywords hardcoded in source; only tested with fixtures
- [x] **DDD layering:** Zero imports from infrastructure; domain ← application ← interface

---

## Type Safety & Testing Strategy

### RED Phase (1279a — merged, TC-4 currently FAILS)

**6 test cases:**
- TC-1: Basic keyword detection
- TC-2: Confidence formula (1 keyword)
- TC-3: Credibility threshold
- TC-4: MSCI_INCLUSION_RULES contract (intentional FAIL until GREEN) ← **WILL NOW PASS**
- TC-5: buildCausalChain integration
- TC-6: Edge cases (empty text, diacritics)

**Status:** 5 PASS, 1 FAIL (TC-4) → After 1279b merge: **6 PASS**

### GREEN Phase (1279b — this task)

**10 test cases (GC-1 through GC-10):**

| ID | Name | Scenario | Expected |
|----|------|----------|----------|
| GC-1 | Large-cap filtering | Reuters + MSCI keywords + mixed watchlist | Returns large-cap only (VCB, FPT, MWG, HPG), excludes VNM |
| GC-2 | Credibility threshold | Same text, credibility=0.55 (< 0.7) | matched=false, targetStocks=[], rejects credibility |
| GC-3 | Multi-stock article | "Article mentions FPT, MWG, VNM, VCB MSCI eligibility" (cred=0.90) | Returns [FPT, MWG, VCB], excludes VNM |
| GC-4 | Non-MSCI keywords | "Vietnam banking sector trends" (cred=0.95) | matched=false, no keywords detected |
| GC-5 | Bullish sentiment | msciDomainEntry from buildCausalChain | entry.sentiment === "bullish" |
| GC-6 | Peer isolation | "MWG nộp danh sách MSCI", watchlist=[MWG, VNM, FRT, FPT, VCB] | Returns [MWG, FPT, VCB] (large-cap), NOT [VNM, FRT] (retail peers) |
| GC-7 | buildCausalChain integration | AnalysisEntry seed + "Reuters: Vietnam MSCI nộp danh sách" | CausalChain with ≥2 entries: seed + domain (severity=HIGH, sentiment=bullish) |
| GC-8 | Confidence formula (1 keyword) | Text with "nộp danh sách", cred=0.75 | confidence = min(1.0, 0.75 × 1 / 3.0) = 0.25 |
| GC-9 | Confidence formula (2 keywords) | Text with 2 keywords, cred=0.90 | confidence = min(1.0, 0.90 × 2 / 3.0) ≈ 0.60 |
| GC-10 | E2E complex scenario | FPT joining MSCI + mentions peers BID, ACB, VCB | targetStocks = [FPT, BID, ACB, VCB] (all large-cap), sentiment=bullish |

**Status:** All 10 PASS after implementation

### Test Baseline

| Phase | Count | Range | Total |
|-------|-------|-------|-------|
| Before 1279 | 6171 | – | 6171 |
| After 1279a (RED) | +6 | TC-1 to TC-6 | 6177 |
| After 1279b (GREEN) | +10 | GC-1 to GC-10 | 6187 |
| **Final** | **6187** | **+16 total** | **PASS** |

---

## Implementation Checklist

### AC-1: msciDetector.ts Implementation ✓

- [ ] File exists: `src/domain/services/msciDetector.ts` (155 lines)
- [ ] Exports `MsciDetectionResult` interface with all required fields
- [ ] Exports `detectMsciInclusion(seedSummary, sourceCredibility)` pure function
- [ ] Keywords: "nộp danh sách", "đáp ứng tiêu chí", "chỉ số msci" (whole-word, case-insensitive)
- [ ] Credibility threshold: 0.7 (return matched=false if sourceCredibility < 0.7)
- [ ] Confidence formula: `min(1.0, sourceCredibility × matchedCount / 3.0)`
- [ ] Zero imports from infrastructure; only type imports from domain
- [ ] Pure function: no async, no I/O, no side effects

### AC-2: MSCI_INCLUSION_RULES Definition ✓

- [ ] Location: `src/domain/services/cascadeEngine.ts` (lines 2199–2202, after INSIDER_DUMP_RULES)
- [ ] Export: `const MSCI_INCLUSION_RULES: CascadeKeywordRule[]`
- [ ] 3 rules (one per keyword):
  - `{ key: "msci_large_cap_1", keyword: "nộp danh sách", sector: "all_largecp" }`
  - `{ key: "msci_large_cap_2", keyword: "đáp ứng tiêu chí", sector: "all_largecp" }`
  - `{ key: "msci_large_cap_3", keyword: "chỉ số msci", sector: "all_largecp" }`
- [ ] All keys prefixed with "msci_"
- [ ] All sectors = "all_largecp"

### AC-3: detectMsciCascadePeers() Implementation ✓

- [ ] File: `src/application/cascadeExecutor.ts` (new function)
- [ ] Signature: `detectMsciCascadePeers(seedSummary, sourceCredibility, watchlist, largeCapListOverride?)`
- [ ] Returns `MsciCascadeResult` interface with matched, detectedKeywords, targetStocks, reasoning, confidence
- [ ] Logic:
  1. Calls `detectMsciInclusion()` domain service
  2. If matched=false, returns empty result with credibility rejection reason
  3. If matched=true:
     - Uses largeCapListOverride if provided, else fallback: `["MWG", "KDH", "FPT", "MSN", "VCB", "HPG", "BID", "CTG"]`
     - Filters watchlist to large-cap stocks only
     - Returns targetStocks + confidence + human-readable reasoning
- [ ] Pure function; no I/O except optional stock-classification.json read

### AC-4: buildCausalChain Integration ✓

- [ ] File: `src/domain/services/cascadeEngine.ts`
- [ ] Import: `import { detectMsciInclusion } from "./msciDetector.js"`
- [ ] Location: Step 2e in `buildCausalChain()` (lines 2488–2506)
- [ ] Logic:
  - Calls `detectMsciInclusion(summaryLower, seedEntry.confidence ?? 0.6)`
  - If matched=true, creates domain-level CausalChainEntry with:
    - level: "domain"
    - title: "MSCI Inclusion Cascade"
    - sentiment: "bullish"
    - confidence: scaled by msciResult.confidence
    - reasoning: annotates detected keywords + large-cap targeting
  - Appends entry to causal chain

### AC-5: GREEN Test Cases (10 total) ✓

- [ ] File: `src/__tests__/1279b-msci-inclusion-cascade-green.test.ts` (200 lines)
- [ ] Test cases GC-1 through GC-10 all PASS
- [ ] RED test TC-4 (MSCI_INCLUSION_RULES contract) now PASSES
- [ ] All assertions documented in table above

### AC-6: Test Baseline & Type Safety ✓

- [ ] RED tests: 6 PASS (from 1279a, TC-4 now passes with rules defined)
- [ ] GREEN tests: 10 PASS (GC-1 through GC-10)
- [ ] Total: 16 new assertions (6171 → 6187)
- [ ] Command: `bun test src/__tests__/1279*.test.ts` → all 16 PASS
- [ ] TypeScript: `bun tsc --noEmit` → 0 errors
- [ ] No linting errors, no console.logs, no debug statements

---

## Merge Readiness Checklist

Before submission to QA:

- [ ] All files created/modified per checklist (msciDetector.ts, cascadeEngine.ts, cascadeExecutor.ts, test file)
- [ ] `bun test src/__tests__/1279a*.test.ts` → all 7 PASS (TC-4 now PASSES)
- [ ] `bun test src/__tests__/1279b*.test.ts` → all 10 PASS
- [ ] Baseline assertion count: 6171 → 6187 (+16)
- [ ] `bun tsc --noEmit` → 0 type errors
- [ ] No linting errors, no console.logs, no debug statements
- [ ] DDD compliance verified:
  - `msciDetector.ts` zero infrastructure imports
  - `cascadeEngine.ts` imports only from domain/application
  - `cascadeExecutor.ts` imports from domain (allowed in app layer)
- [ ] Branch: `task/1279b-msci-inclusion-cascade-green-impl`
- [ ] Commit includes baseline assertion count + file list

---

## Implementation Notes

### Large-Cap Stock Definition (Fallback List)

The fallback list `["MWG", "KDH", "FPT", "MSN", "VCB", "HPG", "BID", "CTG"]` represents tier-1 Vietnamese large-caps by:

- **Market cap:** VCB ($8B+), MWG ($5B+), FPT ($4B+), KDH ($3B+)
- **Liquidity:** Daily volume >1M shares at reasonable spreads
- **Index inclusion:** All 8 are in VN30 (top 30 by market cap)

**Explicitly excluded** from large-cap for MSCI cascade:
- **VNM (Vinamilk):** ~$2B market cap (mid-cap tier), dairy/agriculture focus
- **FRT (Phan Rui):** ~$1B (mid-cap), retail sector
- **PNJ (PNJ):** ~$1.5B (mid-cap), jewelry

This prevents alert spam for mid-cap inclusion announcements (which are less impactful).

### Word Boundary Matching for Vietnamese

The detector uses a custom `isWordBoundary()` helper (inline, not regex `\b`) because Vietnamese diacritical marks are not recognized by standard regex word boundaries.

Pattern:
```
/[a-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i
```

This ensures "nộp danh sách" is matched as a phrase at word boundaries, not as a substring.

### Confidence Formula Justification

**Formula:** `min(1.0, sourceCredibility × matchedKeywordCount / 3.0)`

**Rationale:**
- **Baseline:** Single keyword + perfect source (cred=1.0) → 0.33 confidence (preliminary signal)
- **Multi-keyword boost:** 2 keywords → 0.67, 3 keywords → 1.0 (strong confirmation)
- **Source credibility scaling:** Lower credibility (0.7) reduces confidence proportionally
- **Capping at 1.0:** Prevents false certainty; multiple keywords don't guarantee impact

**Examples:**
- Reuters (0.95) + "nộp danh sách" alone → 0.32 (preliminary)
- Reuters (0.95) + "nộp danh sách" + "đáp ứng tiêu chí" → 0.63 (solid)
- Reuters (0.95) + all 3 keywords → 0.95 (near-certain)

---

## Related Context

### Task 1278: Insider Dump Cascade (COMPLETED)

Similar cascade pattern: detect keywords → identify peer stocks → create domain-level entry.

**Key difference:**
- **Insider dump:** Targets sector peers (banking contagion), bearish sentiment
- **MSCI inclusion:** Targets cross-sector large-caps (index-level impact), bullish sentiment

Reference: `src/domain/services/cascadeEngine.ts` INSIDER_DUMP_RULES + `src/application/cascadeExecutor.ts` detectInsiderDumpPeers()

### Task 1281: Agriculture Weather Cascade (COMPLETED)

Same TDD approach (RED tests first, GREEN implementation).

Similar structure: detector service + cascade executor function + integration into buildCausalChain.

Reference: `src/domain/services/agricultureDetector.ts` + `cascadeExecutor.detectAgricultureCascadePeers()`

---

## Handoff for Developer

**TECH-1279b.md APPROVED**

Technical design complete. Ready for implementation.

**Developer handoff:** See `docs/handoffs/TASK_1279b.md` for RED (failing) test file + GREEN implementation stub + injection points.

**Commit format:**
```
feat(1279b): Implement MSCI inclusion cascade detection (GREEN phase)

- Add msciDetector.ts (domain service, pure keyword detection)
- Add MSCI_INCLUSION_RULES to cascadeEngine.ts
- Add detectMsciCascadePeers() to cascadeExecutor.ts
- Integrate MSCI detection into buildCausalChain() step 2e
- Add 10 GREEN test cases (GC-1 through GC-10)
- Baseline: 6187 assertions (6 RED TC-1 to TC-6 + 10 GREEN GC-1 to GC-10)
- DDD: zero infrastructure imports, pure domain logic

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

---

**TECH_1279b.md — READY FOR HANDOFF**
