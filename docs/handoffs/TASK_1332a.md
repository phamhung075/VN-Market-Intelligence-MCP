# TASK 1332a — RED Phase: Insider Governance Signal (Sell-High-Buy-Low)

**Sprint:** 1332
**Phase:** RED — failing tests, no implementation yet
**Size:** S
**Depends on:** none
**Next:** TASK_1332b.md (GREEN implementation)

---

## Bug

Article: "Chủ tịch Phát Đạt lý giải việc bán 88 triệu cổ phiếu giá cao rồi mua lại khi giá giảm"

- **Actual:** `classifySentiment()` returns `BULLISH` (triggered by "mua lại" near "giảm", net bullish)
- **Expected:** `BEARISH` — sell-high-buy-low by a chairman is a governance red flag, not a bullish accumulation signal

**Root cause:** The phrase "bán giá cao rồi mua lại" is not in `VN_BEARISH`. The existing bullish keyword "mua" partially matches "mua lại", which combined with no bearish match produces a net-bullish score.

---

## Pattern to Detect

The sell-high-buy-low pattern signals:
- Chairman/insider extracted value at the peak (sold high)
- Re-entry at lower price signals they may know fair value is lower than the price they sold at
- Governance concern: timing suggests insider knowledge of coming decline

Vietnamese surface forms:
```
"bán giá cao rồi mua lại"          — sold high then re-bought
"bán ra X triệu cổ phiếu giá cao"  — sold X million shares at high price
"mua lại khi giá giảm"             — re-bought when price fell
"chủ tịch bán...mua lại"           — chairman sold...then re-bought
"bán X triệu cổ phiếu...mua lại"   — pattern with share count
```

---

## Test File

**Path:** `apps/mcp-server/src/__tests__/1332a-insider-governance.test.ts`

**Suite structure:**
- `TC-1332a-1`: sell-high-buy-low keyword classification (6 tests)
- `TC-1332a-2`: score arithmetic sanity — bearish must dominate (2 tests)
- `TC-1332a-3`: regression guard — existing insider buy signal still fires correctly (2 tests)

**All tests MUST FAIL on RED. No implementation in this task.**

---

## Test Content

```typescript
/**
 * Task 1332a — RED Phase: Insider Governance — Sell-High-Buy-Low Pattern
 *
 * Bug: "Chủ tịch Phát Đạt lý giải việc bán 88 triệu cổ phiếu giá cao rồi mua lại
 * khi giá giảm" classified BULLISH. Expected BEARISH.
 *
 * Pattern: executive sells at high price, then re-buys after price drops.
 * Governance signal: insider extracted value at peak — bearish intent, not bullish accumulation.
 *
 * RED phase: all tests fail until 1332b adds VN_BEARISH keywords.
 */

import { describe, test, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

// ═══════════════════════════════════════════════════════════════════════════
// TC-1332a-1: Sell-high-buy-low keyword classification
// ═══════════════════════════════════════════════════════════════════════════

describe("TC-1332a-1: Insider sell-high-buy-low pattern", () => {

  test("1a: exact article headline classifies as BEARISH", () => {
    const result = classifySentiment(
      "Chủ tịch Phát Đạt lý giải việc bán 88 triệu cổ phiếu giá cao rồi mua lại khi giá giảm"
    );
    expect(result.direction).toBe("bearish");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("1b: 'bán giá cao rồi mua lại' classifies as BEARISH", () => {
    const result = classifySentiment(
      "Lãnh đạo bán giá cao rồi mua lại cổ phiếu khi thị trường điều chỉnh"
    );
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("bán giá cao rồi mua lại");
  });

  test("1c: 'mua lại khi giá giảm' classifies as BEARISH", () => {
    const result = classifySentiment(
      "Chủ tịch công ty mua lại khi giá giảm sau khi đã chốt lời trước đó"
    );
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("mua lại khi giá giảm");
  });

  test("1d: 'bán ra...triệu cổ phiếu...giá cao' pattern classifies as BEARISH", () => {
    const result = classifySentiment(
      "Ông Nguyễn Văn A bán ra 50 triệu cổ phiếu giá cao trong tháng trước"
    );
    expect(result.direction).toBe("bearish");
  });

  test("1e: 'chủ tịch bán' with rebuy phrase classifies as BEARISH", () => {
    const result = classifySentiment(
      "Chủ tịch bán 20 triệu cổ phiếu rồi mua lại sau khi giá giảm sâu"
    );
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("bán giá cao rồi mua lại");
  });

  test("1f: 'bán rồi mua lại' variant classifies as BEARISH", () => {
    const result = classifySentiment(
      "Tổng giám đốc bán rồi mua lại cổ phần khi giá điều chỉnh — tín hiệu rủi ro quản trị"
    );
    expect(result.direction).toBe("bearish");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-1332a-2: Score arithmetic — bearish must beat any incidental bullish
// ═══════════════════════════════════════════════════════════════════════════

describe("TC-1332a-2: Score arithmetic — bearish dominates mixed text", () => {

  test("2a: article with 'mua lại' + 'giá cao rồi mua lại' net result is BEARISH", () => {
    // "mua lại" alone would be neutral/bullish — the compound phrase must override
    const result = classifySentiment(
      "Chủ tịch Phát Đạt bán 88 triệu cổ phiếu giá cao rồi mua lại sau khi giá giảm 30%"
    );
    expect(result.direction).toBe("bearish");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("2b: bearish score must exceed bullish score for sell-high-buy-low article", () => {
    const result = classifySentiment(
      "Lãnh đạo bán giá cao rồi mua lại — nhà đầu tư lo ngại về quản trị doanh nghiệp"
    );
    expect(result.direction).toBe("bearish");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-1332a-3: Regression — genuine insider buy still fires correctly
// ═══════════════════════════════════════════════════════════════════════════

describe("TC-1332a-3: Regression — genuine insider buy not affected", () => {

  test("3a: clean insider buy (no sell-then-rebuy) still classifies BULLISH", () => {
    const result = classifySentiment(
      "Chủ tịch mua thêm 5 triệu cổ phiếu tích lũy dài hạn — tín hiệu lạc quan"
    );
    expect(result.direction).toBe("bullish");
  });

  test("3b: 'mua ròng' without sell context still classifies BULLISH", () => {
    const result = classifySentiment(
      "Khối ngoại mua ròng mạnh, tín hiệu tích cực cho thị trường"
    );
    expect(result.direction).toBe("bullish");
  });
});
```

---

## Acceptance Criteria (RED)

- [ ] Test file exists at `apps/mcp-server/src/__tests__/1332a-insider-governance.test.ts`
- [ ] All 10 tests in TC-1332a-1 through TC-1332a-3 FAIL (expected — no keywords added yet)
- [ ] File compiles without TypeScript errors (`bun tsc --noEmit`)
- [ ] No new imports beyond `classifySentiment` from `sentimentClassifier.js`
- [ ] No changes to `sentimentClassifier.ts` in this task

---

## DDD Layer

- **Test file:** `apps/mcp-server/src/__tests__/` (test harness, no layer)
- **Service under test:** `apps/mcp-server/src/domain/services/sentimentClassifier.ts`
- No infrastructure imports permitted in test or implementation.

---

## Weight Rationale (for 1332b reference)

The sell-high-buy-low article title is ~90 chars. Score collision risk:
- "mua lại" alone may contribute +1 bullish (sub-phrase of longer matches)
- "giảm" contributes -1 bearish (already in VN_BEARISH)
- New keyword "bán giá cao rồi mua lại" needs weight ≥ 4 to dominate net score
- "mua lại khi giá giảm" needs weight ≥ 3

The dedup/covered-range logic in `classifySentiment` (longest-phrase-first) means the compound phrase will suppress "mua lại" sub-match — but only if the compound phrase is in the bearish table and sorts before the bullish sub-phrase.
