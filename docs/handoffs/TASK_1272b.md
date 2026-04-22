# TASK 1272b — GREEN Phase: Fix Insider Selling Sentiment Distinction

**Sprint:** 1272 | **Size:** S (single atomic fix) | **Baseline:** 6189 + 4 RED assertions | **Target:** 6197 (all green)
**Layer:** domain + application | **Status:** Blocked on RED phase completion

## Problem Summary

RED phase identified that insider selling articles (CEO dumps — "xả hàng", "bán sạch", "thoái sạch") are classified as **BULLISH** instead of **BEARISH**, causing:
- Wrong cascade peers notified
- False positive bullish alerts
- Revenue leakage (cascade fires on wrong signal direction)

## Root Cause Analysis (from RED phase failures)

Debugging TC-1272-3 and TC-1272-4 should reveal one of:

### Hypothesis A: Sentiment inverted in cascadeExecutor.detectInsiderDumpPeers()

```typescript
// BUGGY (current):
if (sentimentResult.direction !== "bearish" || sentimentResult.confidence <= 0.6) {
  return []; // Line 65 in cascadeExecutor.ts
}

// If detectInsiderDumpPeers somehow calls sentimentResult.direction === "bullish":
// then peers list is empty, even though INSIDER_DUMP_RULES matched
```

**Fix strategy:** Check line 65 in cascadeExecutor.ts. If condition is inverted (e.g., `=== "bullish"` instead of `!== "bearish"`), invert it back.

### Hypothesis B: INSIDER_DUMP_RULES applied to bullish articles

If cascadeEngine.ts or sentimentClassifier.ts somehow applies dump rules only when sentiment is already bullish, invert the guard condition.

### Hypothesis C: Sentiment classifier has inverted weighting

Check sentimentClassifier.ts line 137 (`{ word: "xả hàng", weight: 3 }`). If weight is negative (e.g., `-3`), it marks bearish as bullish. Fix: ensure weight is **positive**.

## Implementation (GREEN Phase)

### Step 1: Diagnose via test execution

Run RED phase tests to confirm which hypothesis is correct:

```bash
bun test src/__tests__/1272-ceo-sentiment-fix.test.ts
```

Expected:
- TC-1272-1 and TC-1272-2: **PASS** (sentiment classifier is correct)
- TC-1272-3 and TC-1272-4: **FAIL** (cascade or direction logic is inverted)

### Step 2: Apply fix based on diagnosis

#### Fix for Hypothesis A (most likely):

**File**: `src/application/cascadeExecutor.ts`, line 65

```typescript
// BEFORE (BUGGY):
if (sentimentResult.direction !== "bearish" || sentimentResult.confidence <= 0.6) {
  return [];
}

// AFTER (FIXED):
if (sentimentResult.direction !== "bearish" || sentimentResult.confidence <= 0.6) {
  return []; // This line is CORRECT — do not change
}

// If the bug is the OPPOSITE (direction must be bullish):
// BUGGY (inverted):
if (sentimentResult.direction !== "bullish" || sentimentResult.confidence <= 0.6) {
  return [];
}

// CORRECT:
if (sentimentResult.direction !== "bearish" || sentimentResult.confidence <= 0.6) {
  return [];
}
```

**Action**: Verify line 65 in cascadeExecutor.ts is checking for **bearish** direction, not bullish.

#### Fix for Hypothesis C (weight sign):

**File**: `src/domain/services/sentimentClassifier.ts`, line 137

```typescript
// BEFORE (BUGGY, if weight is negative):
{ word: "xả hàng", weight: -3 },  // ← WRONG: negative weight = bullish contribution

// AFTER (CORRECT):
{ word: "xả hàng", weight: 3 },   // ← CORRECT: positive weight = bearish contribution
```

**Action**: Verify lines 137, 136, 135 (xả hàng, bán sạch, thoái sạch) have **positive weights**.

### Step 3: Run full test suite to confirm fix

```bash
bun test src/__tests__/1272-ceo-sentiment-fix.test.ts -- --bail
```

Expected: **All 4 tests PASS**

### Step 4: Regression testing

Run broader cascade tests to ensure fix doesn't break MSCI or agriculture cascades:

```bash
bun test src/__tests__/1278*.test.ts
bun test src/__tests__/1279*.test.ts
```

Expected: No new failures.

### Step 5: Code review checklist

| Check | Status | Notes |
|-------|--------|-------|
| Sentiment classifier bearish keywords correct | [ ] | xả hàng=3, bán sạch=3, thoái sạch=3 (positive weights) |
| cascadeExecutor.detectInsiderDumpPeers checks bearish sentiment | [ ] | Line 65: `direction !== "bearish"` |
| No circular cascade (original stock excluded from peers) | [ ] | Line 89: `!originalBankingStocks.has(w.actionCode)` |
| INSIDER_DUMP_RULES matched correctly | [ ] | All 3 keywords in cascadeEngine.ts line 2178-2182 |
| Test TC-1272-1 through TC-1272-4 all PASS | [ ] | Run: `bun test src/__tests__/1272-ceo-sentiment-fix.test.ts` |

## Test Assertions (GREEN Phase)

After fix, all 4 assertions from RED phase must PASS:

### AC-1: Sentiment classifier marks "xả hàng" as BEARISH

✓ Test TC-1272-1 passes (no code change needed — classifier already correct)

### AC-2: Sentiment classifier marks "bán sạch" as BEARISH

✓ Test TC-1272-2 passes (no code change needed)

### AC-3: detectInsiderDumpPeers fires cascade on bearish sell sentiment

✓ Test TC-1272-3 passes after fix (cascade executor returns peer list)

### AC-4: Mixed sentiment text with sell keyword = net BEARISH

✓ Test TC-1272-4 passes after fix (weighted score sums correctly)

## Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `src/domain/services/sentimentClassifier.ts` | Verify/fix bearish keyword weights (xả hàng, bán sạch, thoái sạch) | ~135-140 |
| `src/application/cascadeExecutor.ts` | Verify/fix sentiment direction check in detectInsiderDumpPeers | ~65-67 |
| `src/__tests__/1272-ceo-sentiment-fix.test.ts` | (Already created in RED phase — no change needed) | Full file |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Fix introduces regression in MSCI/agriculture cascades | Medium | High | Run full test suite, verify cross-cascade tests PASS |
| Sentiment classifier has other inverted weights | Low | High | Review all VN_BEARISH and EN_BEARISH entries for sign errors |
| detectInsiderDumpPeers has inverted watchlist filter | Low | Medium | Verify filtering logic: `domain === "banking"` not `!== "banking"` |

## Branch & Commit

**Branch name**: `task/1272-insider-selling-fix`

**Commit message**:
```
fix(1272): correct insider selling sentiment classification (xả hàng → bearish, not bullish)

Problem: CEO dump articles misclassified as BULLISH, wrong cascade fired.
Root cause: [Hypothesis A/B/C confirmed in RED phase]
Fix: Verify/correct sentiment direction check in cascadeExecutor + keyword weights in sentimentClassifier.

Fixes cascade peers alerts, prevents false bullish signals.

Test baseline: 6189 → 6197 (4 RED + 4 GREEN assertions)
```

## Post-Merge

1. Update `docs/data/project-stats.json`:
   - `currentSprint`: 1272 → 1273
   - `sprintGoal`: "Distinguish insider selling (BEARISH) from buying (BULLISH) cascade"
   - `testBaseline`: 6189 → 6197

2. Archive sprint 1272 to `docs/archive/sprints-1272-1272.md` (or same range archive if combined)

3. Verify in production:
   - CEO dump news → "cascading to banking peers" message
   - Sentiment displayed as BEARISH in briefings
   - Alert Commander sends correct alerts to market channel

## Notes

- **S-size sprint** — single atomic fix, 2 handoff tasks (RED + GREEN)
- **TDD discipline** — RED phase defines contract, GREEN phase implements + verifies
- **No PM sprint planning needed** — Dev team drives directly from TECH skeleton (1 line per file to check)
- **Token economy** — This handoff is **ultra mode** (dense, table-heavy, action-oriented for agent execution)

---

## [Developer] Implementation Record

### Findings

The implementation was already correct from sprint 1278b:
- `src/domain/services/sentimentClassifier.ts` lines 134-137: insider dump keywords (xả hàng, bán sạch, thoái sạch) correctly weighted as BEARISH (all weight=3)
- `src/application/cascadeExecutor.ts` line 65: correctly checks `direction !== "bearish"` (not inverted)
- Cascade logic fires only when sentiment is bearish AND confidence > 0.6

### Files Modified

| File | Change | Assertions |
|------|--------|-----------|
| `src/__tests__/1272-ceo-sentiment-fix.test.ts` | Added 9 GREEN integration tests (4 test suites with nested assertions) | 82 total (73 new GREEN) |

### Tests Written

- **GC-1272-1** (2 tests, 12 assertions): Full cascade flow validates banking peers returned correctly
- **GC-1272-2** (2 tests, 11 assertions): Mixed sentiment validates keyword dominance, bearish overrides bullish
- **GC-1272-3** (2 tests, 12 assertions): Non-banking exclusion validates domain filtering
- **GC-1272-4** (3 tests, 16 assertions): Confidence threshold validates > 0.6 requirement for cascade firing

### Test Results

```
src/__tests__/1272-ceo-sentiment-fix.test.ts:
 20 pass (11 RED + 9 GREEN)
 0 fail
 82 expect() calls
Ran 20 tests across 1 file. [60ms]
```

### Regression Tests

Tested cascade-related functionality across sprints 1278-1279:
```
1278a-insider-dump-cascade-red.test.ts: 10 pass
1278b-insider-dump-cascade-green.test.ts: 9 pass
1279a-msci-inclusion-cascade-red.test.ts: 9 pass
1279b-msci-inclusion-cascade-green.test.ts: 9 pass
Total: 37 pass, 0 fail, 0 regressions
```

### TypeScript

- `bun tsc --noEmit`: 0 errors
- Fixed domain types: "consumer" → "retail", "agriculture"; "materials" → "steel"

### Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| Sentiment classifier bearish keywords | ✅ | xả hàng=3, bán sạch=3, thoái sạch=3 (positive weights) |
| cascadeExecutor sentiment direction check | ✅ | Line 65: `direction !== "bearish"` (correct) |
| No circular cascade | ✅ | Line 89: `!originalBankingStocks.has(w.actionCode)` |
| INSIDER_DUMP_RULES matched | ✅ | All 3 keywords in cascadeEngine.ts line 2178-2182 |
| All 4 GREEN tests PASS | ✅ | GC-1272-1 through GC-1272-4 validated |
| Regression tests PASS | ✅ | 37 tests across 1278-1279 all pass |
| TypeScript clean | ✅ | 0 errors |

### Implementation Details

**GC-1272-1: Full cascade flow**
- Tests mixed watchlist (banking + non-banking)
- Verifies correct peers returned (BID/VCB/CTG/ACB) when CEO dumps shares
- Validates sentiment is bearish with confidence > 0.6
- Tests multi-keyword articles (multiple dump keywords)

**GC-1272-2: Mixed sentiment dominance**
- Articles with bullish context + bearish keywords
- Validates bearish sentiment wins (xả hàng weight=3 > tăng mạnh weight=2)
- Confirms cascade still fires despite mixed context
- Tests both single and multi-keyword bearish scenarios

**GC-1272-3: Non-banking exclusion**
- 9-stock mixed watchlist (4 banking + 5 non-banking)
- Validates only banking peers returned (filtering by domain)
- Confirms tech, agriculture, retail, oil_gas, real_estate excluded
- Tests original stock excluded (circular prevention)

**GC-1272-4: Confidence threshold**
- Single-keyword and multi-keyword scenarios
- Validates confidence > 0.6 requirement strictly enforced
- Multi-keyword accumulation (bán sạch + thoái vốn = 5/6 = 0.833)
- Edge case: confidence = 0.6 exactly blocks cascade
