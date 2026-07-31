/**
 * Signal Validator Service — Task 230 (Sprint 227) + Task 233b (Sprint 233)
 *
 * Pure validation logic for agent signals. No async, no HTTP calls.
 * Validates signal prices against snapshot prices using ±5% divergence threshold.
 * Produces confidence scores (0–100) based on price alignment.
 *
 * Extended in Task 233b (Sprint 233) with:
 *   - Confidence penalty (0.8075 for fallback sources)
 *   - Temporal decay (max(0.5, 1 - age_hours/24))
 *   - Staleness warning (>4h old)
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
  // ─── NEW for TECH-233 (Task 233b) ───
  source_fallback?: boolean;           // true if signal from cache/fallback
  fallback_source?: "cache" | "yahoo" | "domestic_rss" | "congbao";
  price_age_minutes?: number;          // staleness of cached price (minutes)
}

/**
 * Result of signal price validation.
 * Includes divergence percentage, confidence score (0–100), and validation timestamp.
 * Extended in Task 233b with confidence penalty + temporal decay fields.
 */
export interface ValidationResult {
  valid: boolean;
  divergence_percent?: number;
  confidence_score: number;            // 0–100, BEFORE penalty & decay
  // ─── NEW for TECH-233 (Task 233b) ───
  confidence_score_final: number;      // AFTER penalty & temporal decay
  confidence_penalty: number;          // 1.0 (primary) | 0.8075 (fallback)
  staleness_warning?: boolean;         // true if price >4h old
  source_fallback: boolean;            // ECHOED back for audit
  fallback_source?: string;            // ECHOED back for audit
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
 * 5. Apply confidence penalty (0.8075 for fallback sources) — NEW in Task 233b
 * 6. Apply temporal decay (max(0.5, 1 - age_hours/24)) — NEW in Task 233b
 * 7. Calculate final confidence = base × penalty × temporal_decay
 *
 * @param req - ValidationRequest with signal_price, snapshot_price, ticker + NEW fields
 * @returns ValidationResult with valid flag, confidence scores, penalty, and timestamp
 */
export function validateSignalPrice(req: ValidationRequest): ValidationResult {
  const validated_at = new Date().toISOString();

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Validate snapshot price
  // ─────────────────────────────────────────────────────────────────────────
  if (req.snapshot_price <= 0) {
    const result: ValidationResult = {
      valid: false,
      confidence_score: 0,
      confidence_score_final: 0,
      confidence_penalty: 1.0,
      source_fallback: req.source_fallback ?? false,
      issue: "Invalid snapshot price",
      validated_at,
    };
    if (req.fallback_source) {
      result.fallback_source = req.fallback_source;
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Calculate divergence percentage
  // ─────────────────────────────────────────────────────────────────────────
  const divergence =
    (Math.abs(req.signal_price - req.snapshot_price) / req.snapshot_price) *
    100;

  const valid = divergence <= 5.0;

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Base confidence score (existing logic)
  // ─────────────────────────────────────────────────────────────────────────
  let confidence_score: number;
  if (!valid) {
    confidence_score = 0;
  } else {
    confidence_score = Math.max(
      95, // Min 95 for valid signals within ±5%
      Math.min(100, 100 - divergence)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. CONFIDENCE PENALTY (NEW for TECH-233, Task 233b)
  // ─────────────────────────────────────────────────────────────────────────
  // Fallback penalty: 0.8075 ≈ 1/√1.54 (accounts for source + age uncertainty)
  let confidence_penalty = 1.0;
  if (req.source_fallback) {
    confidence_penalty = 0.8075;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. TEMPORAL DECAY (NEW for TECH-233, Task 233b)
  // ─────────────────────────────────────────────────────────────────────────
  let temporal_decay_factor = 1.0;
  let staleness_warning = false;

  if (req.source_fallback && req.price_age_minutes !== undefined) {
    const age_hours = req.price_age_minutes / 60;

    // 5a. Check if >4 hours old (240 minutes)
    if (req.price_age_minutes > 240) {
      staleness_warning = true;
    }

    // 5b. Apply temporal decay: linear decay, capped at 0.5 minimum
    // Formula: 1 - (age_hours / 24), floored at 0.5
    // Rationale: price older than 12h decays to 50% confidence floor
    temporal_decay_factor = Math.max(0.5, 1 - age_hours / 24);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Final confidence = base × penalty × temporal_decay
  // ─────────────────────────────────────────────────────────────────────────
  const confidence_score_final = Math.round(
    confidence_score * confidence_penalty * temporal_decay_factor
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Return extended result
  // ─────────────────────────────────────────────────────────────────────────
  const result: ValidationResult = {
    valid,
    divergence_percent: divergence,
    confidence_score,
    confidence_score_final,
    confidence_penalty,
    staleness_warning,
    source_fallback: req.source_fallback ?? false,
    validated_at,
  };
  if (req.fallback_source) {
    result.fallback_source = req.fallback_source;
  }
  if (!valid) {
    result.issue = "Price divergence exceeds 5%";
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Logging Helper + Confidence Derivation — Task 233b /
// FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT
//
// Moved to ./signalQualityAudit.ts (task FIX-CI-SIZELINT-MCPSERVER-SIX-
// UNCOVERED-OFFENDERS AC-4 — kept this file under its size-lint baseline
// tolerance); re-exported here so existing imports of SignalAuditContext /
// prepareSignalAuditRecord / deriveAuditConfidence from this path are
// unaffected.
// ─────────────────────────────────────────────────────────────────────────────

export type { SignalAuditContext } from "./signalQualityAudit.js";
export { prepareSignalAuditRecord, deriveAuditConfidence } from "./signalQualityAudit.js";
