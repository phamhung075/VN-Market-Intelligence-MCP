/**
 * Signal Quality Audit — record prep + confidence derivation (Task 233b)
 *
 * Pure domain helpers that turn a `ValidationResult` (see signalValidator.ts)
 * plus signal-specific context into the shape needed for the
 * signal_quality_audit table, and derive an audit confidence proxy directly
 * from a signal's finding_data. No async, no HTTP/DB calls — DDD domain
 * layer, pure functions only.
 *
 * Split out of signalValidator.ts (task FIX-CI-SIZELINT-MCPSERVER-SIX-
 * UNCOVERED-OFFENDERS AC-4) to bring that file back under its size-lint
 * baseline tolerance — re-exported from signalValidator.ts so existing
 * imports from that path are unaffected.
 */

import type { ValidationResult } from "./signalValidator.js";

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
