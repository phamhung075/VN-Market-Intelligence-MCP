# Task 1343b — HOSE PDF Discovery Fix (RED Tests)

**Sprint:** 1343 — BCTC PDF Pipeline Recovery

**Owner:** Developer

**Status:** Ready for RED phase

**Size:** S (1–1.5h)

---

## Problem Statement

HOSE portal migrated to React SPA. The old direct-URL pattern (`https://iboard.ssc.vn/company/<ticker>`) no longer returns PDF discovery results. All HOSE-listed tickers now return 0 results:
- BID, EIB, FPT, VCB, HPG, VNM, SBT, TNG, HVN, ACB, etc.

The `bctcQueueEnricherJob` calls an HOSE scraper (or SSC API) to fetch PDF URLs for BCTC discovery. Broken discovery = no PDF URLs populated in `bctc_vps_queue.source_url` = VPS has nothing to fetch.

---

## Solution Design

**RED Phase Strategy:**

Write failing tests that verify HOSE PDF discovery for 7 HOSE-listed tickers. Tests should cover:

1. **PDF URL discovery for HOSE tickers**
   - Input: ticker (BID, EIB, FPT, VCB, HPG, VNM, SBT)
   - Expected: valid PDF URLs returned (not empty)
   - Assertion: `url.length > 0 && url.includes('.pdf')`

2. **Fallback sources** (optional, for later if SSC returns nothing)
   - Input: same 7 tickers
   - Expected: cafef.vn or vietstock.vn URLs as fallback
   - Assertion: at least one source returns a URL

3. **Source attribution**
   - Each result should have `source` field: 'ssc' | 'cafef' | 'vietstock'
   - Assertion: `result.source !== undefined`

---

## Test Structure

**File:** `src/__tests__/1343b-hose-pdf-discovery-red.test.ts`

```typescript
import { describe, it, expect } from "bun:test";
import { discoverHosePdfUrls } from "../domain/services/bctcDiscovery.js";

describe("1343b — HOSE PDF Discovery RED", () => {

  // RED Test 1: SSC API returns PDF URLs for HOSE tickers
  it("should discover PDF URLs from SSC for HOSE-listed tickers", async () => {
    const hoseTickersSample = ["BID", "EIB", "FPT", "VCB", "HPG", "VNM", "SBT"];

    for (const ticker of hoseTickersSample) {
      const result = await discoverHosePdfUrls(ticker);
      expect(result).toBeDefined();
      expect(result.urls?.length).toBeGreaterThan(0); // RED: will fail
      expect(result.source).toBe("ssc");
      result.urls?.forEach(url => {
        expect(url).toMatch(/\.pdf$/i);
      });
    }
  });

  // RED Test 2: Fallback to cafef.vn if SSC fails
  it("should fallback to cafef.vn when SSC returns no results", async () => {
    const ticker = "FPT";
    const result = await discoverHosePdfUrls(ticker);

    if (!result.urls || result.urls.length === 0) {
      // Expect cafef fallback
      expect(result.fallbackSource).toBe("cafef");
      expect(result.fallbackUrls?.length).toBeGreaterThan(0); // RED: will fail
    }
  });

  // RED Test 3: Source attribution
  it("should include source attribution in result", async () => {
    const ticker = "VCB";
    const result = await discoverHosePdfUrls(ticker);

    expect(result.source).toBeDefined();
    expect(["ssc", "cafef", "vietstock"]).toContain(result.source);
  });

  // RED Test 4: Return empty gracefully if no source works
  it("should return empty result if all sources fail", async () => {
    const ticker = "FAKE_TICKER";
    const result = await discoverHosePdfUrls(ticker);

    expect(result).toEqual({
      urls: [],
      source: null,
      fallbackUrls: [],
      fallbackSource: null
    });
  });
});
```

---

## Acceptance Criteria

- [ ] Test file created: `src/__tests__/1343b-hose-pdf-discovery-red.test.ts`
- [ ] 4 test cases defined (all RED/failing)
- [ ] Test imports `discoverHosePdfUrls()` function (to be implemented in 1343c)
- [ ] Each test asserts on URL pattern, source attribution, and fallback behavior
- [ ] Test baseline: +1 test file with 4 test cases (will fail; 1343c fixes them)

---

## Technical Notes

- Function signature (to be implemented in 1343c):
  ```typescript
  export async function discoverHosePdfUrls(
    ticker: string
  ): Promise<{
    urls: string[];
    source: 'ssc' | 'cafef' | 'vietstock' | null;
    fallbackUrls?: string[];
    fallbackSource?: string | null;
  }>
  ```

- Expected location: `src/domain/services/bctcDiscovery.ts` (new or extends existing)
- No DB changes in RED phase; tests are pure functions
- Tests will fail → 1343c implements the function

---

## Blockers

None. RED tests can be written independently.

---

## Next Task

→ 1343c (GREEN implementation of HOSE PDF discovery)
