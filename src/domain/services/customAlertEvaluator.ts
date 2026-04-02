/**
 * Task 219 — Custom Alert Evaluator (Domain Service)
 *
 * Evaluates a list of user-defined alert rules against current market data.
 * Returns only the rules whose conditions are currently met.
 *
 * Supported predicates:
 *   price_above  — current price > threshold
 *   price_below  — current price < threshold
 *   volume_above — current volume > threshold
 *   pe_above     — current P/E ratio > threshold
 *   pe_below     — current P/E ratio < threshold
 *   roe_above    — current ROE (%) > threshold
 *
 * This is a pure function: no I/O, no database access.
 *
 * @module domain/services/customAlertEvaluator
 */

/** Valid predicate identifiers for custom alert rules */
export type AlertPredicate =
  | "price_above"
  | "price_below"
  | "volume_above"
  | "pe_above"
  | "pe_below"
  | "roe_above";

/** All 6 valid predicate strings as a const array (useful for Zod enum) */
export const ALERT_PREDICATES: AlertPredicate[] = [
  "price_above",
  "price_below",
  "volume_above",
  "pe_above",
  "pe_below",
  "roe_above",
];

/**
 * A custom alert rule (minimal shape for domain evaluation).
 * The full DB row type lives in the infrastructure store.
 */
export interface CustomAlertRule {
  /** Rule database ID */
  id: number;
  /** Vietnamese stock ticker code (e.g. "VCB") */
  code: string;
  /** Condition type */
  predicate: string;
  /** Numeric threshold to compare against */
  threshold: number;
}

/**
 * A rule that has been triggered — returned by evaluateCustomRules.
 */
export interface TriggeredRule {
  /** ID of the original rule */
  ruleId: number;
  /** Stock code */
  code: string;
  /** Predicate type */
  predicate: string;
  /** Threshold from the rule */
  threshold: number;
  /** The actual current value that crossed the threshold */
  currentValue: number;
}

/**
 * Evaluate custom alert rules against current market snapshot.
 *
 * Rules for codes not present in any of the maps are silently skipped.
 * Rules requiring financial data (pe, roe) are skipped when that data
 * is absent.
 *
 * @param rules      - Active rules to check
 * @param prices     - Map of stock code → latest price (VND)
 * @param volumes    - Map of stock code → today's traded volume
 * @param financials - Map of stock code → { pe?, roe? }
 * @returns Array of triggered rules (subset of input rules)
 */
export function evaluateCustomRules(
  rules: CustomAlertRule[],
  prices: Map<string, number>,
  volumes: Map<string, number>,
  financials: Map<string, { pe?: number; roe?: number }>,
): TriggeredRule[] {
  const triggered: TriggeredRule[] = [];

  for (const rule of rules) {
    const result = checkRule(rule, prices, volumes, financials);
    if (result !== null) {
      triggered.push(result);
    }
  }

  return triggered;
}

/**
 * Check a single rule. Returns a TriggeredRule if the condition is met,
 * or null if not triggered or data is unavailable.
 */
function checkRule(
  rule: CustomAlertRule,
  prices: Map<string, number>,
  volumes: Map<string, number>,
  financials: Map<string, { pe?: number; roe?: number }>,
): TriggeredRule | null {
  const { id, code, predicate, threshold } = rule;

  switch (predicate as AlertPredicate) {
    case "price_above": {
      const price = prices.get(code);
      if (price === undefined) return null;
      if (price > threshold) {
        return { ruleId: id, code, predicate, threshold, currentValue: price };
      }
      return null;
    }

    case "price_below": {
      const price = prices.get(code);
      if (price === undefined) return null;
      if (price < threshold) {
        return { ruleId: id, code, predicate, threshold, currentValue: price };
      }
      return null;
    }

    case "volume_above": {
      const volume = volumes.get(code);
      if (volume === undefined) return null;
      if (volume > threshold) {
        return { ruleId: id, code, predicate, threshold, currentValue: volume };
      }
      return null;
    }

    case "pe_above": {
      const fin = financials.get(code);
      if (!fin || fin.pe === undefined) return null;
      if (fin.pe > threshold) {
        return { ruleId: id, code, predicate, threshold, currentValue: fin.pe };
      }
      return null;
    }

    case "pe_below": {
      const fin = financials.get(code);
      if (!fin || fin.pe === undefined) return null;
      if (fin.pe < threshold) {
        return { ruleId: id, code, predicate, threshold, currentValue: fin.pe };
      }
      return null;
    }

    case "roe_above": {
      const fin = financials.get(code);
      if (!fin || fin.roe === undefined) return null;
      if (fin.roe > threshold) {
        return { ruleId: id, code, predicate, threshold, currentValue: fin.roe };
      }
      return null;
    }

    default:
      // Unknown predicate: skip silently
      return null;
  }
}
