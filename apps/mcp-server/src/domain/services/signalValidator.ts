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
// Audit Logging Helper — Task 233b
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context for signal quality audit logging.
 * Passed to logSignalQualityAudit() alongside ValidationResult.
 */
export interface SignalAuditContext {
  signal_id: string;
  signal_type: "price" | "news" | "bctc" | "fx" | "foreign_flow";
  fallback_tier?: number;           // 1 | 2 | 3
  vps_breaker_state?: string;       // circuit breaker state at time of validation
  coverage_gap?: string;            // "HNX-only" or null
  price?: number;                   // actual price value (for audit record)
}

/**
 * Prepares an audit record for insertion into signal_quality_audit table.
 * Called by application layer after validateSignalPrice() to populate all audit fields.
 *
 * Does NOT perform database insertion (DDD separation). Instead returns a
 * structured audit object ready for insertion by the infrastructure layer.
 *
 * @param result - ValidationResult from validateSignalPrice()
 * @param context - SignalAuditContext with signal metadata
 * @returns Object with all 16 columns ready for INSERT
 */
export function prepareSignalAuditRecord(
  result: ValidationResult,
  context: SignalAuditContext,
): Record<string, unknown> {
  return {
    signal_id: context.signal_id,
    signal_type: context.signal_type,
    ticker: context.signal_type === "price" ? undefined : undefined, // ticker comes from signal itself
    source_primary: result.source_fallback ? 0 : 1,
    source_fallback: result.source_fallback ? 1 : 0,
    fallback_tier: context.fallback_tier ?? null,
    fallback_source: result.fallback_source ?? null,
    confidence_score: result.confidence_score,
    confidence_score_final: result.confidence_score_final,
    confidence_penalty: result.confidence_penalty,
    price: context.price ?? null,
    price_age_minutes: result.staleness_warning ? 300 : null, // placeholder; actual age from signal
    vps_breaker_state: context.vps_breaker_state ?? null,
    coverage_gap: context.coverage_gap ?? null,
    staleness_warning: result.staleness_warning ? 1 : 0,
    created_at: result.validated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal Quality Audit — Confidence Derivation
// FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT (2026-07-30)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a [0,1] confidence proxy from a signal's finding_data for the
 * signal_quality_audit write gate in post_agent_signal.
 *
 * Root cause this fixes: `price_confirmation`'s schema REQUIRES `confidence`
 * (PriceConfirmationFindingDataSchema — domain/signals/signalTypes.ts) so it
 * always resolves directly whenever that signal type is posted. `urgent_news`'s
 * schema makes `confidence` OPTIONAL (UrgentNewsFindingDataSchema /
 * UrgentNewsLooseSchema) and the live, documented emitter (news-scout —
 * docs/agents/news-scout/flow/stage-signals.md's actual urgent_news template)
 * populates `regime_adjusted_score` (0-10 scale) instead, never `confidence`.
 * Live-DB-verified 2026-07-30: 9/9 urgent_news rows posted since 2026-06-05
 * (the exact epoch the signal_quality_audit SLA alarm anchors on) carried
 * zero numeric `confidence` — the prior strict `typeof confidence === 'number'`
 * gate made the write path structurally unreachable for the signal type that
 * actually flows in production (55d / 0 rows). Falling back to
 * `regime_adjusted_score / 10` (clamped to [0,1]) uses the real quality
 * signal news-scout already computes rather than fabricating a constant.
 *
 * Returns null (caller must skip the audit write — no fabricated data) when
 * NEITHER field is present, i.e. the signal genuinely carries no quality
 * signal to audit.
 *
 * @param findingData - the signal's finding_data record
 * @returns confidence in [0,1], or null when no usable field is present
 */
export function deriveAuditConfidence(
  findingData: Record<string, unknown>,
): number | null {
  if (typeof findingData["confidence"] === "number") {
    return findingData["confidence"] as number;
  }
  if (typeof findingData["regime_adjusted_score"] === "number") {
    const normalized = (findingData["regime_adjusted_score"] as number) / 10;
    return Math.min(1, Math.max(0, normalized));
  }
  return null;
}
