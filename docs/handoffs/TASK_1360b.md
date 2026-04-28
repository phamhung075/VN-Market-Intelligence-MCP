# TASK 1360b — priceNewsValidator Unit Tests (24 tests, pure function)

## Context

Sprint 1360. Domain layer. `priceNewsValidator.ts` (314 lines) gates alert quality —
it cross-validates news sentiment against actual price action to detect divergences
before signals are emitted. Zero tests exist today.

**Source file (read-only — no production changes):**
- `apps/mcp-server/src/domain/services/financial-reports/priceNewsValidator.ts`

**Output file to create:**
- `apps/mcp-server/src/__tests__/1360b-price-news-validator.test.ts`

---

## Coverage Gap Analysis

### Exported public surface

```typescript
export function validatePriceNews(
  price: PriceAction,
  sentiment: NewsSentiment | null,
): ValidationResult

export function extractHistoricalParallels(
  ragResults: { title: string; summary: string; distance: number; tags: string[] }[],
  currentCondition: string,
): HistoricalParallel[]

export function detectSensitiveDates(date?: Date): string[]
```

### Key constants (thresholds to test at boundary)

```typescript
const MIN_PRICE_CHANGE_PCT = 1.0;      // below this → price is "flat"
const MIN_SENTIMENT_CONFIDENCE = 0.4;  // below this → no_data
const VOLUME_SPIKE_THRESHOLD = 2.0;    // volume >= avgVolume * 2.0 → spike
```

### Decision tree for validatePriceNews

```
sentiment === null OR articleCount === 0
  → volume >= avgVolume * 2.0  → "volume_no_news" (alert)
  → else                       → "no_data" (info)

sentiment.confidence < 0.4     → "no_data" (info)

sentimentBull AND priceDown    → "news_bullish_price_bearish" (warn)
sentimentBear AND priceUp      → "news_bearish_price_bullish" (info)
(sentimentBull AND priceUp) OR (sentimentBear AND priceDown)
                               → "confirmed" (info)
else (flat price)              → "no_data" (info)
```

Note: `priceDown = changePct <= -1.0`, `priceUp = changePct >= +1.0`.
Values in the range `(-1.0, +1.0)` exclusive are considered flat → `"no_data"`.

---

## Section A — validatePriceNews: null/absent sentiment (PNV-1 through PNV-4)

**PNV-1: null sentiment + volume spike — divergence = volume_no_news, severity = alert**

```typescript
const price: PriceAction = { code: "VCB", changePct: 3.0, volume: 2_000_000, avgVolume: 900_000 };
// volume (2_000_000) >= avgVolume (900_000) * 2.0 = 1_800_000 → spike
const result = validatePriceNews(price, null);
expect(result.divergence).toBe("volume_no_news");
expect(result.severity).toBe("alert");
expect(result.insight).toContain("VCB");
expect(result.insight).toContain("KL giao dịch");
```

**PNV-2: null sentiment + volume exactly at threshold (2.0×) — divergence = volume_no_news**

```typescript
const price: PriceAction = { code: "TCB", changePct: 0, volume: 2_000_000, avgVolume: 1_000_000 };
// volume (2_000_000) >= avgVolume * 2.0 (2_000_000) exactly → spike
const result = validatePriceNews(price, null);
expect(result.divergence).toBe("volume_no_news");
```

Rationale: the guard is `>=`, so exact 2.0× triggers the spike path.

**PNV-3: null sentiment + volume below spike threshold — divergence = no_data, insight empty**

```typescript
const price: PriceAction = { code: "MBB", changePct: 2.0, volume: 1_500_000, avgVolume: 1_000_000 };
// 1_500_000 < 1_000_000 * 2.0 = 2_000_000 → no spike
const result = validatePriceNews(price, null);
expect(result.divergence).toBe("no_data");
expect(result.insight).toBe("");
expect(result.severity).toBe("info");
```

**PNV-4: sentiment present but articleCount = 0 + spike — divergence = volume_no_news**

```typescript
const price: PriceAction = { code: "HPG", changePct: 1.5, volume: 3_000_000, avgVolume: 1_000_000 };
const sentiment: NewsSentiment = { code: "HPG", direction: "bullish", confidence: 0.9, articleCount: 0 };
// articleCount === 0 → falls into null-sentiment branch → spike check
const result = validatePriceNews(price, sentiment);
expect(result.divergence).toBe("volume_no_news");
```

---

## Section B — validatePriceNews: weak confidence (PNV-5 through PNV-6)

**PNV-5: confidence below threshold (0.39) — no_data regardless of direction**

```typescript
const price: PriceAction = { code: "VNM", changePct: 2.0, volume: 500_000, avgVolume: 500_000 };
const sentiment: NewsSentiment = { code: "VNM", direction: "bullish", confidence: 0.39, articleCount: 3 };
const result = validatePriceNews(price, sentiment);
expect(result.divergence).toBe("no_data");
expect(result.insight).toBe("");
```

**PNV-6: confidence exactly at threshold (0.4) — proceeds to divergence check (not no_data)**

```typescript
const price: PriceAction = { code: "VNM", changePct: 2.0, volume: 500_000, avgVolume: 500_000 };
const sentiment: NewsSentiment = { code: "VNM", direction: "bullish", confidence: 0.4, articleCount: 3 };
// confidence 0.4 >= MIN_SENTIMENT_CONFIDENCE 0.4 → passes the guard
const result = validatePriceNews(price, sentiment);
expect(result.divergence).not.toBe("no_data");
// bullish sentiment + changePct 2.0 >= 1.0 → confirmed
expect(result.divergence).toBe("confirmed");
```

---

## Section C — validatePriceNews: divergence detection (PNV-7 through PNV-13)

**PNV-7: bullish news + price falls 2% — divergence = news_bullish_price_bearish, severity = warn**

```typescript
const price: PriceAction = { code: "VCB", changePct: -2.0, volume: 500_000, avgVolume: 500_000 };
const sentiment: NewsSentiment = { code: "VCB", direction: "bullish", confidence: 0.8, articleCount: 5 };
const result = validatePriceNews(price, sentiment);
expect(result.divergence).toBe("news_bullish_price_bearish");
expect(result.severity).toBe("warn");
expect(result.insight).toContain("VCB");
expect(result.insight).toContain("Tin tức tích cực");
expect(result.insight).toContain("giá giảm");
expect(result.insight).toContain("5 bài");
```

**PNV-8: bullish news + price falls exactly at threshold (-1.0%) — divergence triggered**

```typescript
const price: PriceAction = { code: "ACB", changePct: -1.0, volume: 500_000, avgVolume: 500_000 };
const sentiment: NewsSentiment = { code: "ACB", direction: "bullish", confidence: 0.7, articleCount: 2 };
// priceDown = changePct <= -1.0; -1.0 <= -1.0 = true → divergence
const result = validatePriceNews(price, sentiment);
expect(result.divergence).toBe("news_bullish_price_bearish");
```

**PNV-9: bearish news + price rises 3% — divergence = news_bearish_price_bullish, severity = info**

```typescript
const price: PriceAction = { code: "TCB", changePct: 3.0, volume: 500_000, avgVolume: 500_000 };
const sentiment: NewsSentiment = { code: "TCB", direction: "bearish", confidence: 0.75, articleCount: 4 };
const result = validatePriceNews(price, sentiment);
expect(result.divergence).toBe("news_bearish_price_bullish");
expect(result.severity).toBe("info");
expect(result.insight).toContain("TCB");
expect(result.insight).toContain("Tin tiêu cực");
expect(result.insight).toContain("giá tăng");
```

**PNV-10: bullish news + price rises — divergence = confirmed, severity = info**

```typescript
const price: PriceAction = { code: "MBB", changePct: 1.5, volume: 500_000, avgVolume: 500_000 };
const sentiment: NewsSentiment = { code: "MBB", direction: "bullish", confidence: 0.9, articleCount: 6 };
const result = validatePriceNews(price, sentiment);
expect(result.divergence).toBe("confirmed");
expect(result.severity).toBe("info");
expect(result.insight).toContain("MBB");
expect(result.insight).toContain("tích cực");
```

**PNV-11: bearish news + price falls — divergence = confirmed with bearish label**

```typescript
const price: PriceAction = { code: "HPG", changePct: -2.5, volume: 500_000, avgVolume: 500_000 };
const sentiment: NewsSentiment = { code: "HPG", direction: "bearish", confidence: 0.85, articleCount: 3 };
const result = validatePriceNews(price, sentiment);
expect(result.divergence).toBe("confirmed");
expect(result.insight).toContain("tiêu cực");
```

**PNV-12: flat price (changePct = 0.5, within -1.0/+1.0 band) — no_data**

```typescript
const price: PriceAction = { code: "STB", changePct: 0.5, volume: 500_000, avgVolume: 500_000 };
const sentiment: NewsSentiment = { code: "STB", direction: "bullish", confidence: 0.8, articleCount: 2 };
// priceUp = 0.5 >= 1.0 = false; priceDown = 0.5 <= -1.0 = false → flat → no_data
const result = validatePriceNews(price, sentiment);
expect(result.divergence).toBe("no_data");
expect(result.insight).toBe("");
```

**PNV-13: volume spike insight contains ratio string (e.g. "2.2×")**

```typescript
const price: PriceAction = { code: "VIC", changePct: 1.0, volume: 2_200_000, avgVolume: 1_000_000 };
const result = validatePriceNews(price, null);
expect(result.divergence).toBe("volume_no_news");
// volRatio = (2_200_000 / 1_000_000).toFixed(1) = "2.2"
expect(result.insight).toContain("2.2×");
```

---

## Section D — extractHistoricalParallels (PNV-14 through PNV-18)

**PNV-14: empty ragResults — returns empty array**

```typescript
const result = extractHistoricalParallels([], "oil +2σ");
expect(result).toHaveLength(0);
```

**PNV-15: results with distance > 0.8 are excluded**

```typescript
const ragResults = [
  { title: "Dầu tăng 03/2022", summary: "HK giảm 15%", distance: 0.85, tags: [] },
  { title: "Dầu tăng 06/2021", summary: "HK giảm 8%", distance: 0.5, tags: [] },
];
const result = extractHistoricalParallels(ragResults, "oil +2σ");
expect(result).toHaveLength(1);
expect(result[0]!.description).toContain("2021");
```

**PNV-16: results are sorted by relevance descending (lower distance = higher relevance)**

```typescript
const ragResults = [
  { title: "Event A", summary: "Outcome A", distance: 0.6, tags: [] },
  { title: "Event B", summary: "Outcome B", distance: 0.2, tags: [] },
  { title: "Event C", summary: "Outcome C", distance: 0.4, tags: [] },
];
const result = extractHistoricalParallels(ragResults, "condition");
// Relevance = 1 - distance: B=0.8, C=0.6, A=0.4
expect(result[0]!.description).toContain("Event B");
expect(result[1]!.description).toContain("Event C");
expect(result[2]!.description).toContain("Event A");
```

**PNV-17: at most 3 results returned even when more qualify**

```typescript
const ragResults = Array.from({ length: 5 }, (_, i) => ({
  title: `Event ${i}`,
  summary: `Outcome ${i}`,
  distance: 0.1 * (i + 1),
  tags: [],
}));
const result = extractHistoricalParallels(ragResults, "condition");
expect(result.length).toBeLessThanOrEqual(3);
```

**PNV-18: date extracted from title when present in YYYY-MM-DD format**

```typescript
const ragResults = [
  { title: "VN-Index crash 2022-03-15 oil spike", summary: "Drop 8%", distance: 0.3, tags: [] },
];
const result = extractHistoricalParallels(ragResults, "oil +2σ");
expect(result[0]!.date).toBe("2022-03-15");
```

---

## Section E — detectSensitiveDates (PNV-19 through PNV-24)

Note: `detectSensitiveDates(date)` applies a GMT+7 offset before checking. Pass dates
already adjusted to produce the intended local time.

**PNV-19: BCTC season — month=4 (April), day=20 → returns BCTC description**

```typescript
// April 20 is within [1,4,7,10] month AND day 15-28
// Pass UTC date where +7h offset results in April 20
const d = new Date(Date.UTC(2026, 3, 20, 0, 0, 0)); // UTC 2026-04-20 00:00 → GMT+7 = 07:00 April 20
const result = detectSensitiveDates(d);
expect(result.some(s => s.includes("BCTC"))).toBe(true);
```

**PNV-20: BCTC season — month=4, day=14 (before window) → no BCTC event**

```typescript
const d = new Date(Date.UTC(2026, 3, 14, 0, 0, 0)); // April 14 UTC → April 14 GMT+7
const result = detectSensitiveDates(d);
expect(result.some(s => s.includes("BCTC"))).toBe(false);
```

**PNV-21: YEAR_END_WINDOW — December 25 → returns year-end description**

```typescript
const d = new Date(Date.UTC(2026, 11, 25, 0, 0, 0)); // Dec 25 UTC → Dec 25 GMT+7
const result = detectSensitiveDates(d);
expect(result.some(s => s.includes("Window dressing"))).toBe(true);
```

**PNV-22: YEAR_END_WINDOW — December 19 (outside window) → no year-end event**

```typescript
const d = new Date(Date.UTC(2026, 11, 19, 0, 0, 0));
const result = detectSensitiveDates(d);
expect(result.some(s => s.includes("Window dressing"))).toBe(false);
```

**PNV-23: QUARTER_END_REBALANCE — March 28 → returns quarter-end description**

```typescript
const d = new Date(Date.UTC(2026, 2, 28, 0, 0, 0)); // March 28
const result = detectSensitiveDates(d);
expect(result.some(s => s.includes("cuối quý") || s.includes("Cuối quý"))).toBe(true);
```

**PNV-24: no events active on a neutral date — returns empty array**

```typescript
// March 5 — not BCTC season, not quarter-end, not year-end, not TET window
const d = new Date(Date.UTC(2026, 2, 5, 0, 0, 0));
const result = detectSensitiveDates(d);
// May still hit FOMC_PROXIMITY (month=3, day=5 is outside 13-21 range)
expect(result.some(s => s.includes("BCTC"))).toBe(false);
expect(result.some(s => s.includes("Window dressing"))).toBe(false);
expect(result.some(s => s.includes("Cuối quý") || s.includes("cuối quý"))).toBe(false);
```

---

## DI Strategy Summary

| Function | DI mechanism | Mock needed |
|----------|-------------|-------------|
| `validatePriceNews` | pure function — `(price, sentiment)` args | none |
| `extractHistoricalParallels` | pure function — `(ragResults, condition)` args | none |
| `detectSensitiveDates` | pure function — optional `Date` arg | none |

No `mock.module`. No DB. No `Bun.env` overrides. Zero infrastructure.

---

## Import Block

```typescript
import { describe, it, expect } from "bun:test";
import {
  validatePriceNews,
  extractHistoricalParallels,
  detectSensitiveDates,
  type PriceAction,
  type NewsSentiment,
} from "../domain/services/financial-reports/priceNewsValidator.js";
```

---

## File Header

```typescript
// apps/mcp-server/src/__tests__/1360b-price-news-validator.test.ts
// Task 1360b — priceNewsValidator unit tests (24 tests, pure function)
// No mock.module, no DB, no production changes.
```

---

## Test Count Breakdown

| Section | IDs | Count |
|---------|-----|-------|
| A — null/absent sentiment | PNV-1 to PNV-4 | 4 |
| B — weak confidence boundary | PNV-5 to PNV-6 | 2 |
| C — divergence detection | PNV-7 to PNV-13 | 7 |
| D — extractHistoricalParallels | PNV-14 to PNV-18 | 5 |
| E — detectSensitiveDates | PNV-19 to PNV-24 | 6 |
| **Total** | | **24** |

---

## Constraints

- No production file changes.
- All 24 tests must pass in the baseline suite (`bun test`).
- Test file path: `apps/mcp-server/src/__tests__/1360b-price-news-validator.test.ts`

---

## Acceptance Criteria (from SPRINT_GOAL.md)

- 24 new tests, all green.
- Covers: divergence detection (bullish+bear, bearish+bull, volume spike), aligned
  sentiment pass-through, historical parallel extraction (distance filter, sort, top-3
  cap, date extraction), sensitive-date detection edge cases (boundary in/out for BCTC,
  year-end, quarter-end).
- Full suite (after 1360a also lands): baseline 7803 + 40 = 7843 pass, 0 fail, 0 TS errors.
- No new source files — tests only.
