# TASK 1328f — Track suppression reasons in alertPolicyChecker.ts

**Sprint:** 1328 | **Phase:** 2 | **Layer:** domain/services | **Size:** M
**Status:** Todo | **Depends on:** 1328d merged | **Blocks:** 1328g

---

## TLDR

Extend `AlertCheckResult` with `suppressionReasons` field. Populate it in `checkPositionDanger()` and `checkWatchlistOpportunity()` when `fire: false`, listing which conditions failed with actual vs threshold values.

---

## File to modify

`apps/mcp-server/src/domain/services/alertPolicyChecker.ts`

---

## Change 1 — Extend AlertCheckResult interface (lines 59–67)

Replace current interface:
```typescript
export interface AlertCheckResult {
  fire: boolean;
  reason?: string;
  /** Present only when fire=false. Lists which conditions failed with actual values. */
  suppressionReasons?: {
    rule: "position_danger_3and" | "watchlist_opportunity_4and";
    failedConditions: string[];
  };
}
```

## Change 2 — checkPositionDanger (line 83): populate suppressionReasons when fire=false

Replace the `return { fire: false };` at line 99 with:
```typescript
const failed: string[] = [];
if (!cond1) failed.push("stopLossHit=false");
if (!cond2) failed.push(`singleDayDropPct=${singleDayDropPct.toFixed(1)} (threshold=${thresholds.singleDayDropPct})`);
if (!cond3) failed.push(`newsSentiment=${newsSentiment.toFixed(2)} (threshold=${thresholds.newsSentimentThreshold})`);
return {
  fire: false,
  suppressionReasons: { rule: "position_danger_3and", failedConditions: failed },
};
```

## Change 3 — checkWatchlistOpportunity (line 117): populate suppressionReasons when fire=false

Replace the `return { fire: false };` at line 135 with:
```typescript
const failed: string[] = [];
if (!cond1) failed.push(`kinhDichConfidence=${kinhDichConfidence} (min=${thresholds.kinhDichConfidenceMin})`);
if (!cond2) failed.push(`kinhDichSignal=${kinhDichSignal} (expected=BUY)`);
if (!cond3) failed.push(`newsSentiment=${newsSentiment.toFixed(2)} (min=${thresholds.newsSentimentMin})`);
if (!cond4) failed.push(`agentSignalsMajority=${agentSignalsMajority} (expected=BUY)`);
return {
  fire: false,
  suppressionReasons: { rule: "watchlist_opportunity_4and", failedConditions: failed },
};
```

---

## DDD invariants

- Pure function, no I/O, no imports added.
- `fire: true` path unchanged — no `suppressionReasons` when firing.
- Caller (infrastructure layer) is responsible for logging `suppressionReasons` to DB (1328g).

---

## Test file

`apps/mcp-server/src/__tests__/1328f-suppression-reasons.test.ts`

Required cases for `checkPositionDanger`:
- `stopLossHit=false` only fails → `failedConditions = ["stopLossHit=false"]`
- `singleDayDropPct` below threshold → `failedConditions` contains the drop line
- All 3 fail → `failedConditions` length = 3
- All 3 pass → `{ fire: true, reason: "..." }` no `suppressionReasons`

Required cases for `checkWatchlistOpportunity`:
- `kinhDichSignal="NEUTRAL"` fails → `failedConditions` contains `"kinhDichSignal=NEUTRAL (expected=BUY)"`
- 2 of 4 fail → `failedConditions` length = 2
- All 4 pass → `{ fire: true }` no `suppressionReasons`

---

## Acceptance criteria

- [ ] `AlertCheckResult` has `suppressionReasons` optional field
- [ ] `checkPositionDanger` populates `suppressionReasons` when fire=false
- [ ] `checkWatchlistOpportunity` populates `suppressionReasons` when fire=false
- [ ] `fire: true` path unchanged
- [ ] `bun test --grep "1328f"` passes
- [ ] `bun tsc --noEmit` clean
