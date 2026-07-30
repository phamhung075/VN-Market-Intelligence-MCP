/**
 * Signal Quality Audit Store — Task 1920f
 *
 * Infrastructure layer: writes audit records to the signal_quality_audit table.
 * Called from the interface layer (post_agent_signal tool) after a successful
 * postSignal() call, for price_confirmation and urgent_news signal types only.
 *
 * DDD constraint: infrastructure layer — no domain imports. Pure DB access.
 *
 * @module infrastructure/db/signalQualityAuditStore
 */

import type { Database } from "bun:sqlite";

import { logger } from "../logger.js";

/**
 * Insert an audit record into signal_quality_audit using INSERT OR IGNORE.
 *
 * The UNIQUE(signal_id) constraint deduplicates retries silently.
 * Any DB error is swallowed with a logger.warn (persists to system_logs —
 * FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT AC-3) —
 * write failure is non-fatal.
 *
 * The `record` shape matches the object returned by prepareSignalAuditRecord()
 * in the domain layer (signalValidator.ts):
 *   - signal_id, signal_type, ticker, source_primary, source_fallback
 *   - fallback_tier, fallback_source, confidence_score, confidence_score_final
 *   - confidence_penalty, price, price_age_minutes, vps_breaker_state
 *   - coverage_gap, staleness_warning, created_at
 *
 * @param db - Database instance (injected, no global state)
 * @param record - Audit record from prepareSignalAuditRecord()
 */
export function insertSignalQualityAudit(
  db: Database,
  record: Record<string, unknown>,
): void {
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO signal_quality_audit (
        signal_id,
        signal_type,
        ticker,
        source_primary,
        source_fallback,
        fallback_tier,
        fallback_source,
        confidence_score,
        confidence_score_final,
        confidence_penalty,
        price,
        price_age_minutes,
        vps_breaker_state,
        coverage_gap,
        staleness_warning,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      String(record["signal_id"] ?? ""),
      String(record["signal_type"] ?? ""),
      record["ticker"] != null ? String(record["ticker"]) : null,
      record["source_primary"] != null ? Number(record["source_primary"]) : null,
      record["source_fallback"] != null ? Number(record["source_fallback"]) : null,
      record["fallback_tier"] != null ? Number(record["fallback_tier"]) : null,
      record["fallback_source"] != null ? String(record["fallback_source"]) : null,
      Number(record["confidence_score"] ?? 0),
      Number(record["confidence_score_final"] ?? 0),
      Number(record["confidence_penalty"] ?? 1.0),
      record["price"] != null ? Number(record["price"]) : null,
      record["price_age_minutes"] != null ? Number(record["price_age_minutes"]) : null,
      record["vps_breaker_state"] != null ? String(record["vps_breaker_state"]) : null,
      record["coverage_gap"] != null ? String(record["coverage_gap"]) : null,
      record["staleness_warning"] != null ? Number(record["staleness_warning"]) : null,
      String(record["created_at"] ?? new Date().toISOString()),
    );
  } catch (err) {
    // FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT AC-3:
    // logger.warn (not console.warn) persists warn-level entries to the
    // system_logs table (infrastructure/logger.ts persistLog) — queryable by
    // a future probe (source='signalQualityAuditStore') instead of vanishing
    // silently into stdout.
    logger.warn("[signalQualityAuditStore] insertSignalQualityAudit failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      signal_id: record["signal_id"],
    });
  }
}
