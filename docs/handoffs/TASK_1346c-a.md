# TASK_1346c-a: Alert Quality — Volume Spike + Sentiment Negation + VJC Alias

**Task:** 1346c-a
**Sprint:** 1346
**Developer:** Dev A
**Related Reports:** [1320, 1321, 1322]
**Dependencies:** None (parallelizable with 1346c-b, 1346d)
**WIP Limit:** Part of 3-developer parallel batch (max 2 In Progress)

---

## Summary

Three alert quality bugs affecting domain services:

1. **Bug 1320**: Volume spike rolling average includes current session (inflates ratios to ~5.909090)
2. **Bug 1321**: Sentiment classifier missing bearish keyword "lỗ" (loss) + Unicode normalization gap
3. **Bug 1322**: VJC alias missing "viet jet" (two-word form with space)

All three are isolated domain logic changes. Zero file overlap with 1346c-b or 1346d.

---

## Bug 1320: Volume Spike Calibration (avgVolume includes current session)

### Root Cause

File: `apps/mcp-server/src/application/usecases/scanMarket.ts`
Function: `getAvgVolumeSync`, lines 103–128

The query uses `ORDER BY fetched_at DESC LIMIT 20`, which pulls the last 20 rows regardless of date. During an open trading session this includes today's intraday rows, inflating the rolling average.

The correct path already exists in `server.ts` (lines 677–686), which uses `WHERE ... AND substr(fetched_at, 1, 10) < ?` to exclude today.

**Current broken query (lines 111–116):**
```sql
SELECT volume
FROM market_prices_history
WHERE code = ?
ORDER BY fetched_at DESC
LIMIT ?
```

**Result:** For stocks with ~11 rows today + 10 rows prior day, average = (total_vol_today + total_vol_yesterday) / 11. Spike ratio = today / avg ≈ (N+1)/N ≈ 5.909090 for N=11.

### Fix

Replace query in `getAvgVolumeSync` (lines 111–116) with:

```sql
SELECT AVG(day_vol) as avg_vol FROM (
  SELECT MAX(volume) as day_vol
  FROM market_prices_history
  WHERE code = ? AND substr(fetched_at, 1, 10) < ?
  GROUP BY substr(fetched_at, 1, 10)
  ORDER BY substr(fetched_at, 1, 10) DESC
  LIMIT 20
)
```

Update function signature to accept `todayUtc: string` (injectable for tests) or compute it internally:
```typescript
function getAvgVolumeSync(code: string, db: Database, todayUtc?: string): number {
  const today = todayUtc || new Date().toISOString().split('T')[0];
  // ... use `today` in WHERE clause as parameter
}
```

### Test File

Create: `apps/mcp-server/src/__tests__/1320-volume-avg-excludes-today.test.ts`

**Test cases:**
1. Seed `market_prices_history` with:
   - 10 rows for today (UTC) with volumes [100, 110, 120, ..., 190]
   - 10 rows for T-1 with volumes [50, 55, 60, ..., 95]
2. Call `getAvgVolumeSync(code, db, today)`
3. Assert: `avgVol === 72.5` (average of [50–95] only, not including today)
4. Assert: spike ratio for today = (average of today vols) / 72.5 ≈ 1.43 (not 5.909090)

**Edge case:**
- Call with `todayUtc = T-1` (simulate as if T-1 is "today")
- Assert: query uses `substr(fetched_at, 1, 10) < T-1`, excludes T-1 rows too
- Assert: avgVol uses only older data

**Regression:**
- Call with only 4 prior days of data (< 5 closed days)
- Assert: returns 0 (suppresses spike) — `MIN_HISTORY_ROWS = 5` guard still honored

---

## Bug 1321: Sentiment Negation — "lỗ" not in bearish keyword list

### Root Cause

File: `apps/mcp-server/src/domain/services/sentimentClassifier.ts`

Scanning `VN_BEARISH` (lines 125–252): standalone `"lỗ"` (loss, as in operating loss) is NOT present. Compound phrases `"thua lỗ"` and `"khoản lỗ"` exist (weight 2) but `"lỗ"` alone does not fire.

**Secondary issue:** Text normalization difference.
`normalizeText` in `stockAliases.ts` strips diacritics. `sentimentClassifier.ts` uses `text.toLowerCase()` without diacritic stripping. Vietnamese diacritics remain. "lỗ" (NFC: precomposed) vs "lơ\u0303" (NFD: decomposed) may not match due to Unicode normalization variance in RSS feeds.

**Headline:** `"VIX Q1 lợi nhuận lỗ 63% giảm"`
- Expected: bearish (loss context clear)
- Actual: bullish or neutral (missing "lỗ" + possible NFC/NFD mismatch)

### Fix

**File:** `apps/mcp-server/src/domain/services/sentimentClassifier.ts`

1. **Add NFC normalization** (line 514, in `classifySentiment`):
   ```typescript
   // BEFORE:
   const lower = text.toLowerCase();

   // AFTER:
   const lower = text.normalize("NFC").toLowerCase();
   ```

2. **Add bearish keywords** to `VN_BEARISH` array (lines 125–252, insert in appropriate section):
   ```typescript
   { word: "lỗ", weight: 2 },  // standalone loss
   { word: "lợi nhuận âm", weight: 3 },  // negative profit (explicit)
   ```

### Test File

Create: `apps/mcp-server/src/__tests__/1321-sentiment-negation-loss.test.ts`

**Test cases:**

1. **Loss context (bearish):**
   ```typescript
   const result = classifySentiment("VIX Q1 lợi nhuận lỗ 63% giảm");
   assert(result.direction === "bearish");
   ```

2. **Profit context (bullish, regression):**
   ```typescript
   const result = classifySentiment("lợi nhuận tăng 20%");
   assert(result.direction === "bullish");
   ```

3. **Generic decline (bearish):**
   ```typescript
   const result = classifySentiment("giảm 30% so với cùng kỳ");
   assert(result.direction === "bearish");
   ```

4. **Unicode normalization (NFD → NFC):**
   ```typescript
   const nfdText = "VIX lơ\u0303 63%".normalize("NFD");  // lô with combining tilde
   const result = classifySentiment(nfdText);
   assert(result.direction === "bearish");  // NFC normalization inside function handles it
   ```

5. **No false positive (word boundary):**
   ```typescript
   const result = classifySentiment("lỗi trong hệ thống");  // "lỗi" (error) not "lỗ" (loss)
   // Verify "lỗi" does NOT match "lỗ" bearish keyword (word-boundary check at lines 408–414)
   ```

**Baseline check:**
- Run full test suite: `bun test`
- Verify no regression in existing sentiment tests (especially those with NFD strings in fixtures)

---

## Bug 1322: NER Alias Missing — Vietjet → VJC

### Root Cause

File: `apps/mcp-server/src/domain/services/stockAliases.ts`
VJC entry (lines 413–420):

```typescript
VJC: {
  companyName: "VietJet Air",
  aliases: [
    "vietjet", "vietjet air", "vietjet aviation",
    ...
  ],
},
```

`"vietjet"` IS in the alias list (after `normalizeText`). However, `"Viet Jet"` (two-word form with space) normalizes to `"viet jet"`, which is NOT in the list. Missing alias breaks detection in headlines like:
- `"COMAC collaboration with Viet Jet Air"`
- `"Viet Jet expands fleet with new aircraft"`

### Fix

**File:** `apps/mcp-server/src/domain/services/stockAliases.ts`
**VJC aliases array** (lines 414–419)

Add three aliases:
```typescript
VJC: {
  companyName: "VietJet Air",
  aliases: [
    "vietjet", "vietjet air", "vietjet aviation",
    "viet jet",  // two-word form (normalizes from "Viet Jet")
    "viet jet air",  // two-word + air
    "hang khong gia re vietjet",  // Vietnamese: low-cost carrier reference
    ...
  ],
},
```

### Test File

Create: `apps/mcp-server/src/__tests__/1322-vjc-alias.test.ts`

**Test cases:**

1. **Two-word form with space:**
   ```typescript
   const stocks = detectStocksInText("Viet Jet ký hợp đồng với COMAC", ["VJC"]);
   assert(stocks.includes("VJC"));
   ```

2. **Two-word + "Air":**
   ```typescript
   const stocks = detectStocksInText("Viet Jet Air thêm 20 máy bay mới", ["VJC"]);
   assert(stocks.includes("VJC"));
   ```

3. **Single word (existing alias, regression):**
   ```typescript
   const stocks = detectStocksInText("Vietjet tuyên bố mở thêm 5 đường bay", ["VJC"]);
   assert(stocks.includes("VJC"));
   ```

4. **Vietnamese carrier reference:**
   ```typescript
   const stocks = detectStocksInText("Hãng hàng không giá rẻ Vietjet chuẩn bị IPO", ["VJC"]);
   assert(stocks.includes("VJC"));
   ```

5. **Word boundary (negative case):**
   ```typescript
   const stocks = detectStocksInText("Mục tiêu viet là tăng trưởng", ["VJC"]);
   assert(!stocks.includes("VJC"));  // "viet" alone != "viet jet"
   ```

---

## Acceptance Criteria

- [ ] **1320 resolved:** Volume spike ratio no longer clusters at 5.909090 across unrelated stocks; test confirms avg excludes current session
- [ ] **1321 resolved:** `"VIX Q1 lợi nhuận lỗ 63% giảm"` classified as BEARISH; Unicode NFC normalization applied
- [ ] **1321 regression:** Existing sentiment tests pass (especially NFD fixtures); `"lỗi"` (error) does NOT match `"lỗ"` (loss) bearish keyword
- [ ] **1322 resolved:** `"Viet Jet"` and `"Viet Jet Air"` articles trigger VJC alerts; existing single-word aliases still work
- [ ] **All baseline tests pass:** `bun test` reports 7371+ passing (no regression from 1344+1345)
- [ ] **Code review:** Changes limited to `scanMarket.ts` (SQL query), `sentimentClassifier.ts` (normalization + keywords), and `stockAliases.ts` (VJC aliases only)

---

## Test Execution

1. Create three test files in `apps/mcp-server/src/__tests__/`:
   - `1320-volume-avg-excludes-today.test.ts`
   - `1321-sentiment-negation-loss.test.ts`
   - `1322-vjc-alias.test.ts`

2. Run local: `bun test -- --files "**/1320-*.test.ts" --files "**/1321-*.test.ts" --files "**/1322-*.test.ts"`

3. Run full suite: `bun test` (verify all 7371 baseline tests pass)

---

## Branch + PR

- **Branch:** `task/1346c-a-alert-quality-volume-sentiment-vjc`
- **Commits:**
  1. `fix(1320): exclude current session from volume spike average`
  2. `fix(1321): add "lỗ" bearish keyword + NFC normalization`
  3. `fix(1322): add "viet jet" alias for VJC detection`
  4. `test(1320-1321-1322): comprehensive unit tests`

---

## Handoff Complete

TASK_1346c-a ready for development. No blockers. Parallelizable with 1346c-b and 1346d.

---

## [QA] Review Record — Round 1
date: 2026-04-27
reviewer: qa
verdict: CHANGES_REQUESTED
fixer_round: 1

### Tests
- Targeted (1320, 1321, 1322): 14 pass / 0 fail
- Full suite: 7262 pass / 106 fail / 21 skip (all failures pre-existing)

### TypeScript: FAIL (2 blocking errors)
```
src/application/usecases/scanMarket.ts(130,18): error TS2345:
  Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/application/usecases/scanMarket.ts(139,18): same error
```

### DDD: PASS
### Security: PASS

### Blocking Issues

**scanMarket.ts:115** — `split("T")[0]` returns `string | undefined` in strict TS.
Both `.get()` calls on lines 130 and 139 fail type-check because `today` has type
`string | undefined`.

**Minimum fix** (one-line change):
```typescript
// Line 115 — replace:
const today = todayUtc ?? new Date().toISOString().split("T")[0];

// With:
const today = todayUtc ?? new Date().toISOString().substring(0, 10);
```

`substring(0, 10)` always returns `string`. This resolves both TS errors.
No test changes required — existing 14 tests will continue to pass.

---

## [QA] Review Record — Round 2
date: 2026-04-27
reviewer: qa
verdict: APPROVED
fixer_round: 1 (final)

### Tests
- Targeted (1320, 1321, 1322): 14 pass / 0 fail
- Full suite: 7262 pass / 106 fail (all pre-existing) / 21 skip

### TypeScript: PASS (0 errors)
- `.substring(0, 10)` fix confirmed at scanMarket.ts:115

### DDD: PASS
### Security: PASS

### Merge
- Merged to main: 2026-04-27
- Branch deleted: task/1346c-a-alert-quality-domain
- Worktree removed: .claude/worktrees/agent-a5e75f73
- Reports closed: 1320, 1321, 1322
