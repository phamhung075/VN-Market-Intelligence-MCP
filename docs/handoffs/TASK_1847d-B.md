# TASK-1847d-B — Domain: Alert Outcome Scorer

**Task:** 1847d-B | **Status:** READY FOR DEVELOPER (after 1847d-A)
**Sprint:** 1847
**Owner:** dev-alert-engine
**Arch Design:** docs/handoffs/ARCH_1847d.md (section 3)

---

## Summary

Create pure domain functions for alert classification and outcome scoring. ZERO infrastructure imports. Functions accept pre-fetched data; scorer decides nothing about outcome visibility or persistence.

**Files to create: 1 + test file**
**Files to modify: 0**
**Tests: 14 unit tests**

---

## Files

### 1. CREATE: `apps/mcp-server/src/domain/services/alertOutcomeScorer.ts`

**Structure:** Pure functions + type definitions. No DB, no HTTP, no side effects.

#### 1a. Type Definitions

```typescript
export type AlertOutcome = 'hit' | 'miss' | 'unknown';

export type AlertClass =
  | 'position-danger'
  | 'watchlist-opportunity'
  | 'price-signal'
  | 'composite'
  | 'unscoreable';

export interface AlertClassification {
  alertClass: AlertClass;
  evalWindowDays: number;      // calendar days
  hitThresholdPct: number;     // signed: negative for position-danger HIT
  direction: 'up' | 'down' | 'neutral';
}

export interface PricePoint {
  price: number;
  fetchedAt: string; // ISO 8601
}

export interface OutcomeResult {
  outcome: AlertOutcome;
  detail: string;
}
```

#### 1b. `classifyAlertType(signalsJson: string | null, message: string | null): AlertClassification`

**Detection priority order:**

```typescript
export function classifyAlertType(
  signalsJson: string | null,
  message: string | null,
): AlertClassification {
  // 1. Check for position-danger in signals_json
  if (signalsJson) {
    try {
      const signals = JSON.parse(signalsJson);
      if (signals.type === 'position-danger' || signals.some((s: any) => s.type === 'position-danger')) {
        return {
          alertClass: 'position-danger',
          evalWindowDays: 5,       // 5 calendar days = ~3 trading days
          hitThresholdPct: 0,      // HIT = price stays ≤0% (loss not recovered)
          direction: 'down',
        };
      }
      // 2. Check for watchlist-opportunity
      if (signals.type === 'watchlist-opportunity' || signals.some((s: any) => s.type === 'watchlist-opportunity')) {
        return {
          alertClass: 'watchlist-opportunity',
          evalWindowDays: 7,       // 7 calendar days = ~5 trading days
          hitThresholdPct: 1.0,    // HIT = price rises ≥1% (BLK-1 decision)
          direction: 'up',
        };
      }
      // 3. Check for price_drop / price_surge / volume_spike
      if (
        signals.some((s: any) => s.type === 'price_drop') ||
        signals.some((s: any) => s.type === 'price_surge') ||
        signals.some((s: any) => s.type === 'volume_spike')
      ) {
        const direction = signals.some((s: any) => s.type === 'price_drop') ? 'down' : 'up';
        return {
          alertClass: 'price-signal',
          evalWindowDays: 3,
          hitThresholdPct: direction === 'up' ? 0.1 : -0.1,
          direction,
        };
      }
      // 4. Multiple signal types → composite
      if (Array.isArray(signals) && signals.length > 1) {
        const primaryType = signals[0]?.type || 'neutral';
        const direction = primaryType === 'price_drop' ? 'down' : 'up';
        return {
          alertClass: 'composite',
          evalWindowDays: 3,
          hitThresholdPct: direction === 'up' ? 0.1 : -0.1,
          direction,
        };
      }
    } catch (e) {
      // parse fail → unscoreable
    }
  }

  // 5. No signals_json but has message → legacy Commander narrative
  if (!signalsJson && message) {
    return {
      alertClass: 'unscoreable',
      evalWindowDays: 999, // never scored (per BLK-4)
      hitThresholdPct: 0,
      direction: 'neutral',
    };
  }

  // Fallback: unscoreable
  return {
    alertClass: 'unscoreable',
    evalWindowDays: 999,
    hitThresholdPct: 0,
    direction: 'neutral',
  };
}
```

#### 1c. `scoreAlertOutcome(classification, alertPrice, windowPrices, calendarDaysElapsed): OutcomeResult`

```typescript
export function scoreAlertOutcome(
  classification: AlertClassification,
  alertPrice: number | null,
  windowPrices: PricePoint[],
  calendarDaysElapsed: number,
): OutcomeResult {
  // Unscoreable always returns unknown
  if (classification.alertClass === 'unscoreable') {
    return {
      outcome: 'unknown',
      detail: 'unscoreable alert type',
    };
  }

  // No price data
  if (!alertPrice || windowPrices.length === 0) {
    if (calendarDaysElapsed >= 14) {
      return {
        outcome: 'unknown',
        detail: 'data timeout (≥14 days, no prices)',
      };
    }
    return {
      outcome: 'unknown',
      detail: 'no price data',
    };
  }

  // --- POSITION-DANGER (direction=down, HIT = price stays low) ---
  if (classification.alertClass === 'position-danger') {
    const maxPrice = Math.max(...windowPrices.map(p => p.price));
    const recoveryPct = ((maxPrice - alertPrice) / alertPrice) * 100;

    if (maxPrice >= alertPrice * 1.02) {
      // price recovered +2% → MISS
      return {
        outcome: 'miss',
        detail: `price recovered +${recoveryPct.toFixed(1)}% (threshold +2%)`,
      };
    }
    if (maxPrice <= alertPrice) {
      // all prices ≤ alert price → HIT
      return {
        outcome: 'hit',
        detail: `price stayed ≤0% over ${calendarDaysElapsed}d`,
      };
    }
    // -2% to +2% → UNKNOWN
    return {
      outcome: 'unknown',
      detail: `ambiguous: ${recoveryPct.toFixed(1)}% (±2% band)`,
    };
  }

  // --- WATCHLIST-OPPORTUNITY (direction=up, HIT = price rises ≥1%) ---
  if (classification.alertClass === 'watchlist-opportunity') {
    const maxPrice = Math.max(...windowPrices.map(p => p.price));
    const gainPct = ((maxPrice - alertPrice) / alertPrice) * 100;
    const endPrice = windowPrices[windowPrices.length - 1].price;

    if (maxPrice >= alertPrice * 1.01) {
      // price hit +1% → HIT
      return {
        outcome: 'hit',
        detail: `price +${gainPct.toFixed(1)}% in ${calendarDaysElapsed}d (threshold ≥1%)`,
      };
    }
    if (endPrice <= alertPrice * 0.99) {
      // end-of-window price at -1% → MISS
      const lossPct = ((endPrice - alertPrice) / alertPrice) * 100;
      return {
        outcome: 'miss',
        detail: `price ${lossPct.toFixed(1)}% at window close (threshold -1%)`,
      };
    }
    // < ±1% → UNKNOWN
    return {
      outcome: 'unknown',
      detail: `ambiguous: ${gainPct.toFixed(1)}% (±1% band)`,
    };
  }

  // --- PRICE-SIGNAL / COMPOSITE (reuse existing direction logic) ---
  if (classification.alertClass === 'price-signal' || classification.alertClass === 'composite') {
    const maxPrice = Math.max(...windowPrices.map(p => p.price));
    const minPrice = Math.min(...windowPrices.map(p => p.price));
    const changePct = classification.direction === 'up'
      ? ((maxPrice - alertPrice) / alertPrice) * 100
      : ((minPrice - alertPrice) / alertPrice) * 100;

    const noiseThreshold = 0.1;
    const hitThreshold = Math.abs(classification.hitThresholdPct);

    if (Math.abs(changePct) < noiseThreshold) {
      return {
        outcome: 'unknown',
        detail: `noise <0.1% (noise threshold)`,
      };
    }

    if (classification.direction === 'up' && changePct >= hitThreshold) {
      return {
        outcome: 'hit',
        detail: `price +${changePct.toFixed(2)}% (threshold ≥${hitThreshold}%)`,
      };
    }
    if (classification.direction === 'down' && changePct <= -hitThreshold) {
      return {
        outcome: 'hit',
        detail: `price ${changePct.toFixed(2)}% (threshold ≤-${hitThreshold}%)`,
      };
    }
    if (
      (classification.direction === 'up' && changePct < -hitThreshold) ||
      (classification.direction === 'down' && changePct > hitThreshold)
    ) {
      return {
        outcome: 'miss',
        detail: `price ${changePct.toFixed(2)}% opposite expected direction`,
      };
    }

    return {
      outcome: 'unknown',
      detail: `ambiguous: ${changePct.toFixed(2)}%`,
    };
  }

  // Fallback (should never reach)
  return {
    outcome: 'unknown',
    detail: 'internal error: unknown alert class',
  };
}
```

---

### 2. CREATE: `apps/mcp-server/src/__tests__/1847d-alert-outcome-scorer.test.ts`

**14 unit tests** (no DB, pure function testing)

```typescript
import { describe, it, expect } from 'bun:test';
import {
  classifyAlertType,
  scoreAlertOutcome,
  AlertOutcome,
  PricePoint,
} from '../domain/services/alertOutcomeScorer';

describe('alertOutcomeScorer', () => {
  describe('classifyAlertType', () => {
    it('TEST-1: classifies position-danger when signals_json contains position-danger', () => {
      const signals = JSON.stringify([{ type: 'position-danger' }]);
      const result = classifyAlertType(signals, 'alert message');
      expect(result.alertClass).toBe('position-danger');
      expect(result.evalWindowDays).toBe(5);
      expect(result.direction).toBe('down');
    });

    it('TEST-2: classifies watchlist-opportunity when signals_json contains watchlist-opportunity', () => {
      const signals = JSON.stringify([{ type: 'watchlist-opportunity' }]);
      const result = classifyAlertType(signals, 'alert message');
      expect(result.alertClass).toBe('watchlist-opportunity');
      expect(result.evalWindowDays).toBe(7);
      expect(result.direction).toBe('up');
    });

    it('TEST-3: classifies price-signal for price_drop', () => {
      const signals = JSON.stringify([{ type: 'price_drop' }]);
      const result = classifyAlertType(signals, null);
      expect(result.alertClass).toBe('price-signal');
      expect(result.direction).toBe('down');
    });

    it('TEST-4: classifies unscoreable when signals_json is null', () => {
      const result = classifyAlertType(null, 'legacy narrative alert');
      expect(result.alertClass).toBe('unscoreable');
      expect(result.direction).toBe('neutral');
    });

    it('TEST-5: classifies composite for multi-signal non-policy type', () => {
      const signals = JSON.stringify([{ type: 'price_drop' }, { type: 'volume_spike' }]);
      const result = classifyAlertType(signals, null);
      expect(result.alertClass).toBe('composite');
    });
  });

  describe('scoreAlertOutcome - position-danger', () => {
    const positionDangerClass = {
      alertClass: 'position-danger' as const,
      evalWindowDays: 5,
      hitThresholdPct: 0,
      direction: 'down' as const,
    };

    it('TEST-6: position-danger HIT when all prices ≤ alertPrice', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 98, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 95, fetchedAt: '2026-05-06T15:00:00Z' },
        { price: 99, fetchedAt: '2026-05-07T10:00:00Z' },
      ];
      const result = scoreAlertOutcome(positionDangerClass, alertPrice, windowPrices, 3);
      expect(result.outcome).toBe('hit');
    });

    it('TEST-7: position-danger MISS when max price > alertPrice * 1.02', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 98, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 103, fetchedAt: '2026-05-06T15:00:00Z' },
      ];
      const result = scoreAlertOutcome(positionDangerClass, alertPrice, windowPrices, 3);
      expect(result.outcome).toBe('miss');
    });

    it('TEST-8: position-danger UNKNOWN in ±2% band', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 100.5, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 101.5, fetchedAt: '2026-05-06T15:00:00Z' },
      ];
      const result = scoreAlertOutcome(positionDangerClass, alertPrice, windowPrices, 3);
      expect(result.outcome).toBe('unknown');
    });
  });

  describe('scoreAlertOutcome - watchlist-opportunity', () => {
    const watchlistOpportunityClass = {
      alertClass: 'watchlist-opportunity' as const,
      evalWindowDays: 7,
      hitThresholdPct: 1.0,
      direction: 'up' as const,
    };

    it('TEST-9: watchlist-opportunity HIT when max price ≥ alertPrice * 1.01', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 100.5, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 101.2, fetchedAt: '2026-05-07T10:00:00Z' },
      ];
      const result = scoreAlertOutcome(watchlistOpportunityClass, alertPrice, windowPrices, 5);
      expect(result.outcome).toBe('hit');
    });

    it('TEST-10: watchlist-opportunity MISS when end-of-window price ≤ alertPrice * 0.99', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 100.5, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 98.5, fetchedAt: '2026-05-07T10:00:00Z' },
      ];
      const result = scoreAlertOutcome(watchlistOpportunityClass, alertPrice, windowPrices, 5);
      expect(result.outcome).toBe('miss');
    });
  });

  describe('scoreAlertOutcome - edge cases', () => {
    it('TEST-11: unscoreable always returns unknown', () => {
      const unscoreableClass = {
        alertClass: 'unscoreable' as const,
        evalWindowDays: 999,
        hitThresholdPct: 0,
        direction: 'neutral' as const,
      };
      const result = scoreAlertOutcome(unscoreableClass, 100, [], 10);
      expect(result.outcome).toBe('unknown');
    });

    it('TEST-12: no price data returns unknown', () => {
      const positionDangerClass = {
        alertClass: 'position-danger' as const,
        evalWindowDays: 5,
        hitThresholdPct: 0,
        direction: 'down' as const,
      };
      const result = scoreAlertOutcome(positionDangerClass, null, [], 2);
      expect(result.outcome).toBe('unknown');
      expect(result.detail).toContain('no price data');
    });

    it('TEST-13: calDays ≥ 14 with no data returns data timeout', () => {
      const positionDangerClass = {
        alertClass: 'position-danger' as const,
        evalWindowDays: 5,
        hitThresholdPct: 0,
        direction: 'down' as const,
      };
      const result = scoreAlertOutcome(positionDangerClass, null, [], 14);
      expect(result.outcome).toBe('unknown');
      expect(result.detail).toContain('data timeout');
    });

    it('TEST-14: price-signal reuses existing HIT/MISS logic', () => {
      const priceSignalClass = {
        alertClass: 'price-signal' as const,
        evalWindowDays: 3,
        hitThresholdPct: 0.1,
        direction: 'up' as const,
      };
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 100.15, fetchedAt: '2026-05-06T10:00:00Z' },
      ];
      const result = scoreAlertOutcome(priceSignalClass, alertPrice, windowPrices, 2);
      expect(result.outcome).toBe('hit');
    });
  });
});
```

---

## Acceptance Criteria

| ID | Criterion | Test |
|----|-----------|------|
| AC-1 | `classifyAlertType` returns 'position-danger' for signals_json containing position-danger | TEST-1 |
| AC-2 | `classifyAlertType` returns 'watchlist-opportunity' for signals_json containing watchlist-opportunity | TEST-2 |
| AC-3 | `classifyAlertType` returns 'price-signal' for price_drop/price_surge/volume_spike | TEST-3 |
| AC-4 | `classifyAlertType` returns 'unscoreable' when signals_json is null | TEST-4 |
| AC-5 | `classifyAlertType` returns 'composite' for multi-signal non-policy types | TEST-5 |
| AC-6 | `scoreAlertOutcome` position-danger HIT: all prices ≤ alertPrice | TEST-6 |
| AC-7 | `scoreAlertOutcome` position-danger MISS: max price > alertPrice * 1.02 | TEST-7 |
| AC-8 | `scoreAlertOutcome` position-danger UNKNOWN in ±2% band | TEST-8 |
| AC-9 | `scoreAlertOutcome` watchlist-opportunity HIT: max price ≥ alertPrice * 1.01 | TEST-9 |
| AC-10 | `scoreAlertOutcome` watchlist-opportunity MISS: end-window price ≤ alertPrice * 0.99 | TEST-10 |
| AC-11 | `scoreAlertOutcome` unscoreable → always 'unknown' | TEST-11 |
| AC-12 | `scoreAlertOutcome` no price data → 'unknown' + "no price data" | TEST-12 |
| AC-13 | `scoreAlertOutcome` calDays ≥ 14, no data → 'unknown' + "data timeout" | TEST-13 |
| AC-14 | `scoreAlertOutcome` price-signal uses existing HIT/MISS logic | TEST-14 |
| AC-15 | `bun test` passes all 14 tests (0 fail) | bun test 1847d-alert-outcome-scorer |

---

## Dependencies

**Blocked by:** 1847d-A (for AlertOutcome type or define locally)

**Blocks:** 1847d-C (job uses these functions)

---

## Notes

- **ZERO infrastructure imports** — this file must have NO imports from infrastructure/, db/, HTTP, or filesystem
- Import only from `domain/` (types, constants) and standard library
- `PricePoint[]` is passed in by caller — scorer does NOT fetch from DB
- All thresholds (1%, 2%, 0.1%, 5 calendar days, 7 calendar days) are hardcoded per design
