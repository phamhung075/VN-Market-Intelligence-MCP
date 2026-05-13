/**
 * alertOutcomeScorer.ts — Domain: Alert Outcome Scorer
 *
 * Pure functions for alert classification and outcome scoring.
 * ZERO imports from infrastructure/, db/, HTTP, or filesystem.
 * All inputs are pre-fetched by the caller (scheduler layer).
 *
 * evalWindowDays uses calendar days with weekend buffer:
 *   - position-danger: 5 calendar days = ~3 trading days worst case (Mon alert)
 *   - watchlist-opportunity: 7 calendar days = ~5 trading days worst case
 *
 * @module domain/services/alertOutcomeScorer
 * Task: 1847d-B
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertOutcome = 'hit' | 'miss' | 'unknown';

export type AlertClass =
  | 'position-danger'
  | 'watchlist-opportunity'
  | 'price-signal'
  | 'composite'
  | 'unscoreable';

export interface AlertClassification {
  alertClass: AlertClass;
  /** Calendar days (5 cal ≈ 3 trading days; 7 cal ≈ 5 trading days) */
  evalWindowDays: number;
  /** Signed: negative means HIT requires downward move */
  hitThresholdPct: number;
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

// ---------------------------------------------------------------------------
// classifyAlertType
// ---------------------------------------------------------------------------

/**
 * Maps alert fields to an AlertClassification.
 *
 * Detection priority:
 *  1. signals_json → position-danger
 *  2. signals_json → watchlist-opportunity
 *  3. signals_json → price_drop | price_surge | volume_spike → price-signal
 *  4. signals_json non-null, multiple types → composite
 *  5. signals_json null + message non-null → unscoreable (legacy Commander narrative)
 *  6. Fallback → unscoreable
 */
export function classifyAlertType(
  signalsJson: string | null,
  message: string | null,
): AlertClassification {
  if (signalsJson) {
    try {
      const signals = JSON.parse(signalsJson);

      // 1. position-danger — object or array
      const hasPositionDanger =
        (signals && typeof signals === 'object' && !Array.isArray(signals) && signals.type === 'position-danger') ||
        (Array.isArray(signals) && signals.some((s: unknown) => (s as { type?: string }).type === 'position-danger'));

      if (hasPositionDanger) {
        return {
          alertClass: 'position-danger',
          evalWindowDays: 5,
          hitThresholdPct: 0,
          direction: 'down',
        };
      }

      // 2. watchlist-opportunity
      const hasWatchlistOpp =
        (signals && typeof signals === 'object' && !Array.isArray(signals) && signals.type === 'watchlist-opportunity') ||
        (Array.isArray(signals) && signals.some((s: unknown) => (s as { type?: string }).type === 'watchlist-opportunity'));

      if (hasWatchlistOpp) {
        return {
          alertClass: 'watchlist-opportunity',
          evalWindowDays: 7,
          hitThresholdPct: 1.0,
          direction: 'up',
        };
      }

      // 3 & 4. price_drop / price_surge / volume_spike — single signal → price-signal
      //         multiple signals (any combo) → composite
      if (Array.isArray(signals)) {
        const hasDrop = signals.some((s: unknown) => (s as { type?: string }).type === 'price_drop');
        const hasSurge = signals.some((s: unknown) => (s as { type?: string }).type === 'price_surge');
        const hasVolume = signals.some((s: unknown) => (s as { type?: string }).type === 'volume_spike');

        if (hasDrop || hasSurge || hasVolume) {
          const direction = hasDrop ? 'down' : 'up';

          // Multiple signals (any combination) → composite
          if (signals.length > 1) {
            return {
              alertClass: 'composite',
              evalWindowDays: 3,
              hitThresholdPct: direction === 'up' ? 0.1 : -0.1,
              direction,
            };
          }

          // Single price signal — threshold 1.0% (raised from 0.1% for noise floor, AC-3)
          return {
            alertClass: 'price-signal',
            evalWindowDays: 3,
            hitThresholdPct: direction === 'up' ? 1.0 : -1.0,
            direction,
          };
        }

        // Multiple non-price-signal types → composite
        if (signals.length > 1) {
          const primaryType = (signals[0] as { type?: string })?.type ?? 'neutral';
          const direction: 'up' | 'down' | 'neutral' = primaryType === 'price_drop' ? 'down' : 'up';
          return {
            alertClass: 'composite',
            evalWindowDays: 3,
            hitThresholdPct: direction === 'up' ? 0.1 : -0.1,
            direction,
          };
        }
      }
    } catch {
      // parse failure → unscoreable
    }
  }

  // 5. No signals_json but has message → legacy Commander narrative
  if (!signalsJson && message) {
    return {
      alertClass: 'unscoreable',
      evalWindowDays: 999,
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

// ---------------------------------------------------------------------------
// scoreAlertOutcome
// ---------------------------------------------------------------------------

/**
 * Score an alert outcome given pre-fetched price data.
 *
 * @param classification — from classifyAlertType
 * @param alertPrice — first price at/after triggered_at (null if unavailable)
 * @param windowPrices — PricePoint[] within eval window (caller fetches from DB)
 * @param calendarDaysElapsed — calendar days since triggered_at
 * @returns OutcomeResult — never null; caller skips writing if not yet in eval window
 */
export function scoreAlertOutcome(
  classification: AlertClassification,
  alertPrice: number | null,
  windowPrices: PricePoint[],
  calendarDaysElapsed: number,
): OutcomeResult {
  // unscoreable → always unknown
  if (classification.alertClass === 'unscoreable') {
    return {
      outcome: 'unknown',
      detail: 'unscoreable alert type',
    };
  }

  // No price data guard
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

  // --- POSITION-DANGER (direction=down, HIT = price stayed low) ---
  if (classification.alertClass === 'position-danger') {
    const maxPrice = Math.max(...windowPrices.map(p => p.price));
    const recoveryPct = ((maxPrice - alertPrice) / alertPrice) * 100;

    // Recovered +2% or more → MISS
    if (maxPrice >= alertPrice * 1.02) {
      return {
        outcome: 'miss',
        detail: `price recovered +${recoveryPct.toFixed(1)}% (threshold +2%)`,
      };
    }

    // All prices ≤ alert price → HIT
    if (maxPrice <= alertPrice) {
      return {
        outcome: 'hit',
        detail: `price stayed ≤0% over ${calendarDaysElapsed}d`,
      };
    }

    // ±2% band → ambiguous UNKNOWN
    return {
      outcome: 'unknown',
      detail: `ambiguous: ${recoveryPct.toFixed(1)}% (±2% band)`,
    };
  }

  // --- WATCHLIST-OPPORTUNITY (direction=up, HIT = price rises ≥1%) ---
  if (classification.alertClass === 'watchlist-opportunity') {
    const maxPrice = Math.max(...windowPrices.map(p => p.price));
    const gainPct = ((maxPrice - alertPrice) / alertPrice) * 100;
    // windowPrices.length > 0 is guaranteed by the guard above
    const endPrice = windowPrices[windowPrices.length - 1]!.price;

    // Hit +1% threshold → HIT
    if (maxPrice >= alertPrice * 1.01) {
      return {
        outcome: 'hit',
        detail: `price +${gainPct.toFixed(1)}% in ${calendarDaysElapsed}d (threshold ≥1%)`,
      };
    }

    // End-of-window price at -1% or worse → MISS
    if (endPrice <= alertPrice * 0.99) {
      const lossPct = ((endPrice - alertPrice) / alertPrice) * 100;
      return {
        outcome: 'miss',
        detail: `price ${lossPct.toFixed(1)}% at window close (threshold -1%)`,
      };
    }

    // < ±1% → ambiguous UNKNOWN
    return {
      outcome: 'unknown',
      detail: `ambiguous: ${gainPct.toFixed(1)}% (±1% band)`,
    };
  }

  // --- PRICE-SIGNAL / COMPOSITE (direction-based logic) ---
  if (
    classification.alertClass === 'price-signal' ||
    classification.alertClass === 'composite'
  ) {
    const maxPrice = Math.max(...windowPrices.map(p => p.price));
    const minPrice = Math.min(...windowPrices.map(p => p.price));
    const changePct =
      classification.direction === 'up'
        ? ((maxPrice - alertPrice) / alertPrice) * 100
        : ((minPrice - alertPrice) / alertPrice) * 100;

    const noiseThreshold = 0.1;
    const hitThreshold = Math.abs(classification.hitThresholdPct);

    // Below noise floor → unknown
    if (Math.abs(changePct) < noiseThreshold) {
      return {
        outcome: 'unknown',
        detail: `noise <0.1% (noise threshold)`,
      };
    }

    // HIT: moved in predicted direction ≥ hitThreshold
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

    // MISS: moved opposite direction beyond threshold
    if (
      (classification.direction === 'up' && changePct < -hitThreshold) ||
      (classification.direction === 'down' && changePct > hitThreshold)
    ) {
      return {
        outcome: 'miss',
        detail: `price ${changePct.toFixed(2)}% opposite expected direction`,
      };
    }

    // Between noise and threshold → ambiguous
    return {
      outcome: 'unknown',
      detail: `ambiguous: ${changePct.toFixed(2)}%`,
    };
  }

  // Fallback (should never reach with exhaustive AlertClass union)
  return {
    outcome: 'unknown',
    detail: 'internal error: unknown alert class',
  };
}
