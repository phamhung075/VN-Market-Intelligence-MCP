# TASK 1333a — RED: Source Attribution False Match Test

**Sprint:** 1333 | **Size:** S | **Phase:** RED (failing test)
**Branch:** `task/1333a-red-msn-source-suffix-test`

---

## Bug Context

Headline: `"Vietnam stock market gathers pace - MSN"`
- "MSN" here = MSN.com (Microsoft News) source attribution suffix
- "MSN" is also the ticker for Masan Group (HOSE)
- `tickerWholeWordMatch("vietnam stock market gathers pace - msn", "MSN")` returns `true`
- This is a whole-word match — "msn" is bounded by " - " and end-of-string
- The bug is NOT in the matcher; it is in the input: the raw headline is passed unstripped

---

## Root Cause

In `/apps/mcp-server/src/application/usecases/pollNews.ts` line 717:

```ts
const titleAndSummary = `${entry.sourceTitle} ${entry.summary}`.toLowerCase();
const tickerMatch = tickerWholeWordMatch(titleAndSummary, impact.actionCode);
```

`entry.sourceTitle` is the raw headline including the " - SOURCE" attribution suffix
injected by news aggregators (MSN, Reuters, Bloomberg, etc.). The suffix token is a
valid standalone word, so the whole-word matcher fires correctly but on wrong input.

Pattern: `" - [A-Z]{2,5}"` at the **end** of a headline = news source label, not ticker.

Known suffix tokens that collide with VN tickers:
- `MSN` — Masan Group
- `VCB` — (hypothetical: unlikely but Vietcombank ticker)
- Any 2–5 char uppercase word that a news aggregator uses as attribution

---

## Test File

**Create:** `apps/mcp-server/src/__tests__/1333a-msn-source-suffix.test.ts`

```ts
// apps/mcp-server/src/__tests__/1333a-msn-source-suffix.test.ts
// RED: source attribution suffix " - MSN" must NOT trigger ticker match for MSN
import { describe, it, expect } from "bun:test";
import { stripSourceAttributionSuffix } from "../domain/services/stockAliases.js";

describe("1333a — stripSourceAttributionSuffix: RED (function does not exist yet)", () => {
  it("strips ' - MSN' from headline end", () => {
    const raw = "Vietnam stock market gathers pace - MSN";
    expect(stripSourceAttributionSuffix(raw)).toBe("Vietnam stock market gathers pace");
  });

  it("strips ' - REUTERS' from headline end", () => {
    expect(stripSourceAttributionSuffix("Copper prices fall - REUTERS")).toBe("Copper prices fall");
  });

  it("strips ' - Bloomberg' (mixed case) from headline end", () => {
    expect(stripSourceAttributionSuffix("Fed rate cut expected - Bloomberg")).toBe("Fed rate cut expected");
  });

  it("does NOT strip ticker-like token that appears mid-sentence", () => {
    // "MSN" in the body — not a suffix, leave untouched
    expect(stripSourceAttributionSuffix("MSN shares rise sharply today")).toBe("MSN shares rise sharply today");
  });

  it("does NOT strip when pattern is part of a longer word at end", () => {
    // "BUSINESS" ends the headline but is >5 chars — keep
    expect(stripSourceAttributionSuffix("Growth outlook positive - BUSINESS")).toBe("Growth outlook positive - BUSINESS");
  });

  it("strips only the last suffix, not inner ' - X' patterns", () => {
    // Headlines like "A - B analysis - MSN" → "A - B analysis"
    expect(stripSourceAttributionSuffix("VCB - bank analysis - MSN")).toBe("VCB - bank analysis");
  });

  it("no-op when no suffix present", () => {
    expect(stripSourceAttributionSuffix("Vietnam GDP grows 7%")).toBe("Vietnam GDP grows 7%");
  });

  it("no-op on empty string", () => {
    expect(stripSourceAttributionSuffix("")).toBe("");
  });
});
```

---

## Expected Outcome

All 8 tests **FAIL** at this phase because `stripSourceAttributionSuffix` does not yet exist in
`stockAliases.ts`. This is the required RED state before 1333b.

---

## DDD Layer

- Test imports from `domain/services/stockAliases.ts` — correct layer (pure text transform, no I/O)
- No infrastructure imports

---

## Files to Touch

| Action | Path |
|--------|------|
| Create | `apps/mcp-server/src/__tests__/1333a-msn-source-suffix.test.ts` |
| Read-only reference | `apps/mcp-server/src/domain/services/stockAliases.ts` (export target) |
| Read-only reference | `apps/mcp-server/src/__tests__/FIX-1304-ticker-whole-word.test.ts` (test style guide) |
