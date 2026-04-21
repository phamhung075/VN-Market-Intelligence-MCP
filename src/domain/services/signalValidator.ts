/**
 * Signal Validator Service — Task 230 (Sprint 227)
 *
 * Pure validation logic for agent signals. No async, no HTTP calls.
 * Validates signal prices against snapshot prices using ±5% divergence threshold.
 * Produces confidence scores (0–100) based on price alignment.
 *
 * DDD Constraint: domain layer, pure functions, no imports from infrastructure/application.
 */

/**
 * Request to validate a signal price against a snapshot price.
 */
export interface ValidationRequest {
  signal_price: number;
  snapshot_price: number;
  ticker: string;
}

/**
 * Result of signal price validation.
 * Includes divergence percentage, confidence score (0–100), and validation timestamp.
 */
export interface ValidationResult {
  valid: boolean;
  divergence_percent?: number;
  confidence_score: number; // 0–100
  issue?: string;
  validated_at: string; // ISO8601
}

/**
 * Validates a signal price against a snapshot price.
 *
 * Logic:
 * 1. Check snapshot validity (must be > 0)
 * 2. Calculate divergence = |signal_price - snapshot| / snapshot * 100
 * 3. Valid = divergence <= 5.0%
 * 4. Confidence = 100 - divergence, clamped [0, 100]
 *
 * @param req - ValidationRequest with signal_price, snapshot_price, ticker
 * @returns ValidationResult with valid flag, confidence score, and timestamp
 */
export function validateSignalPrice(req: ValidationRequest): ValidationResult {
  const validated_at = new Date().toISOString();

  // 1. Check snapshot validity
  if (req.snapshot_price <= 0) {
    const result: ValidationResult = {
      valid: false,
      confidence_score: 0,
      issue: "Invalid snapshot price",
      validated_at,
    };
    return result;
  }

  // 2. Calculate divergence as percentage
  const divergence =
    (Math.abs(req.signal_price - req.snapshot_price) / req.snapshot_price) *
    100;

  // 3. Valid if divergence <= 5%
  const valid = divergence <= 5.0;

  // 4. Confidence scoring:
  //    - If divergence > 5%, confidence = 0 (invalid)
  //    - If divergence <= 5%, confidence = 100 - divergence (clamped to [95, 100])
  let confidence_score: number;
  if (!valid) {
    confidence_score = 0;
  } else {
    confidence_score = Math.max(
      95, // Min 95 for valid signals within ±5%
      Math.min(100, 100 - divergence)
    );
  }

  const result: ValidationResult = {
    valid,
    divergence_percent: divergence,
    confidence_score,
    validated_at,
  };

  if (!valid) {
    result.issue = "Price divergence exceeds 5%";
  }

  return result;
}
