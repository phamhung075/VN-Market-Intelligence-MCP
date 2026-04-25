# TASK 1328d — enrichDimensionScores() in convictionScorer.ts

**Sprint:** 1328 | **Phase:** 1 | **Layer:** domain/services | **Size:** M
**Status:** Todo | **Depends on:** 1328a merged | **Blocks:** 1328e, 1328f

---

## File to change

`apps/mcp-server/src/domain/services/convictionScorer.ts`

---

## Change 1 — Extend ConvictionInput (after kinhDichScore? at line 70)

```typescript
/** From ChainCatalystFindingData.newsSentiment [-1.0, 1.0]. Overrides sentimentDirection when present and sentimentDirection is absent. */
newsSentimentScore?: number;
/** From ChainCatalystFindingData.kinhDichConfidence [0, 100]. Overrides kinhDichScore when present and kinhDichScore is absent. */
kinhDichConfidenceRaw?: number;
/** From ChainCatalystFindingData.agentSignalsMajority. Used as secondary cascade signal when cascadeDirection is absent. */
agentSignalsMajority?: "BUY" | "SELL" | "NEUTRAL";
```

---

## Change 2 — New exported function (insert after deriveKinhDichScore ends at line 259)

```typescript
/**
 * Enriches a ConvictionInput with the three new signal fields.
 * Pure function — returns new ConvictionInput, does not mutate input.
 *
 * Rules:
 *   newsSentimentScore [-1,1] → sentimentDirection + sentimentConfidence
 *     (only when sentimentDirection is not already set)
 *   kinhDichConfidenceRaw [0,100] → kinhDichScore [-1,+1]
 *     (only when kinhDichScore is not already set; direction from agentSignalsMajority)
 *   agentSignalsMajority → cascadeDirection
 *     (only when cascadeDirection is not already set)
 */
export function enrichDimensionScores(input: ConvictionInput): ConvictionInput {
  const enriched = { ...input };

  if (input.newsSentimentScore != null && enriched.sentimentDirection == null) {
    enriched.sentimentDirection =
      input.newsSentimentScore > 0.1 ? "bullish" :
      input.newsSentimentScore < -0.1 ? "bearish" : "neutral";
    enriched.sentimentConfidence = Math.abs(input.newsSentimentScore);
  }

  if (input.kinhDichConfidenceRaw != null && enriched.kinhDichScore == null) {
    const sign =
      input.agentSignalsMajority === "BUY" ? 1 :
      input.agentSignalsMajority === "SELL" ? -1 : 0;
    enriched.kinhDichScore = sign * (input.kinhDichConfidenceRaw / 100);
  }

  if (input.agentSignalsMajority != null && enriched.cascadeDirection == null) {
    enriched.cascadeDirection =
      input.agentSignalsMajority === "BUY" ? "up" :
      input.agentSignalsMajority === "SELL" ? "down" : "neutral";
    enriched.cascadeConfidence = 0.6;
  }

  return enriched;
}
```

---

## Change 3 — Call enricher at top of computeConviction (line 274)

Replace the opening lines of `computeConviction`:
```typescript
export function computeConviction(input: ConvictionInput): ConvictionResult {
  const enriched = enrichDimensionScores(input);
  // Dimension 1: Price action
  const price = scorePriceAction(enriched.changePct);
  const priceDirection = price.direction;
  // Dimension 2: Volume
  const vol = scoreVolume(enriched.volume, enriched.avgVolume);
  // Dimension 3: Sentiment
  const sent = scoreSentiment(enriched.sentimentDirection, enriched.sentimentConfidence, priceDirection);
  // Dimension 4: Cascade
  const casc = scoreCascade(enriched.cascadeDirection, enriched.cascadeConfidence, priceDirection);
  // Dimension 5: Sector alignment
  const sect = scoreSectorAlignment(enriched.changePct, enriched.sectorAvgPct);
  // Dimension 6: Kinh Dich
  const kd = scoreKinhDich(enriched.kinhDichScore);
  // ... rest unchanged
```

**Important:** Replace all `input.` references inside `computeConviction` with `enriched.`.

---

## DDD invariants

- No imports outside convictionScorer.ts module
- No I/O, no side effects
- WEIGHTS unchanged (PO decision 1 — no weight rebalancing this sprint)
- All 3 new `ConvictionInput` fields are optional — backward compatible

---

## Test file

`apps/mcp-server/src/__tests__/1328d-conviction-enrichment.test.ts`

- `computeConviction({ code: "VNM", newsSentimentScore: 0.8 })` → `dimensions.sentiment > 0.5`
- `computeConviction({ code: "VNM", newsSentimentScore: -0.8 })` → `dimensions.sentiment < 0.5`
- `computeConviction({ code: "VNM", kinhDichConfidenceRaw: 90, agentSignalsMajority: "BUY" })` → `dimensions.kinhDich > 0.5` and `dimensions.cascade > 0.5`
- `computeConviction({ code: "VNM" })` (no new fields) → identical result to pre-1328d baseline
- `enrichDimensionScores` does not mutate the input object

---

## Acceptance criteria

- [ ] `ConvictionInput` has 3 new optional fields
- [ ] `enrichDimensionScores` exported and pure
- [ ] `computeConviction` calls `enrichDimensionScores` at the top
- [ ] All `input.` references inside the function replaced with `enriched.`
- [ ] `bun test --grep "1328d"` passes
- [ ] `bun tsc --noEmit` clean
