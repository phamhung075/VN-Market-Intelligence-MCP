/**
 * Domain Service — Data Freshness SLA Configuration (FACTORY-DOMAIN-extract-sla-config)
 *
 * size-justification: ~180L — pure config-table extraction from
 * freshnessSlaChecker.ts: the SignalType union, SignalSlaConfig shape, and
 * DEFAULT_SLA_CONFIG per-signal threshold table, each carrying substantial
 * historical rationale doc-comments (SSOT pointers, root-cause corrections —
 * FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H,
 * FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT) that are
 * load-bearing context for future threshold tuning, not padding — trimming
 * them would destroy the audit trail this table exists to preserve. Verbatim,
 * behavior-preserving extraction: no entry added, removed, reordered, or
 * reworded. The breach-classification ALGORITHM that reads this table stays
 * in `freshnessSlaChecker.ts`, which re-exports these three names unchanged
 * so every existing import path keeps working with zero call-site changes.
 *
 * Pure data: no I/O or infrastructure imports — mirrors freshnessSlaChecker.ts's
 * own module contract.
 *
 * Layer: domain/services — must not import from application/ or infrastructure/.
 *
 * @module domain/services/freshnessSlaConfig
 */

/**
 * Signal source type names.
 *
 * Original 5 types (Task 234):
 *   price, bctc, news, sbv_fx, foreign_flow
 *
 * Sprint 1920 additions (Task 1920i):
 *   vnstock_fundamentals — monitors vnstock_financials.fetched_at (weekly; 72h SLA)
 *   bond_maturity        — monitors bond_maturity.updated_at (weekly; 168h SLA)
 *   commodity_prices     — monitors commodity_prices.fetched_at (daily; 36h SLA)
 *   broker_sanctions     — monitors broker_sanctions.created_at (quarterly; 2160h SLA)
 *   backtest_runs        — monitors backtest_runs.run_at (daily; 36h SLA)
 *   signal_quality_audit — monitors signal_quality_audit.created_at (event-driven,
 *     sparse cadence; 30d/43200min SLA — see FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-
 *     CADENCE-MISCLASSIFIED-48H doc block below on DEFAULT_SLA_CONFIG for the
 *     corrected root-cause: this table's writer is NOT the same-named
 *     `monthlySignalQualityAuditJob` cron)
 *   prediction_claims    — monitors prediction_claims.created_at (event-driven; 168h SLA)
 */
export type SignalType =
  | "price"
  | "bctc"
  | "news"
  | "sbv_fx"
  | "foreign_flow"
  | "vnstock_fundamentals"
  | "bond_maturity"
  | "commodity_prices"
  | "broker_sanctions"
  | "backtest_runs"
  | "signal_quality_audit"
  | "prediction_claims";

/**
 * Per-signal-type SLA configuration.
 */
export interface SignalSlaConfig {
  signalType: SignalType;
  defaultThresholdMinutes: number;
  /**
   * FIXED threshold (minutes) used only while an earnings-filing window is
   * active (see `isBctcEarningsWindowActive`). Currently consumed by the
   * "bctc" signal type only — SSOT: system-map.json
   * .project.data_sources["bctc-discover"].sla.earnings_window.stale_threshold_hours.
   * When absent, `defaultThresholdMinutes` is used for both states.
   */
  earningsWindowThresholdMinutes?: number;
}

/**
 * Default SLA thresholds (in minutes).
 *
 * Original 5 types (Task 234):
 * - price: 10 min during market hours; off-hours uses dynamic window threshold (see getSlaThreshold)
 * - bctc: FIXED two-tier threshold (FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT,
 *   2026-07-30) — 1440 min (24h) while an earnings-filing window is active,
 *   10080 min (168h/7d) otherwise. SSOT: system-map.json
 *   .project.data_sources["bctc-discover"].sla. No wall-clock-growing term.
 * - news: 30 min
 * - sbv_fx: 30 min
 * - foreign_flow: 10 min during market hours; off-hours uses dynamic window threshold
 *
 * Sprint 1920 additions (Task 1920i):
 * - vnstock_fundamentals: 4320 min = 72h (quarterly data; SLA = 3 days after dispatch)
 * - bond_maturity: 10080 min = 168h (weekly poll; SLA = 7 days)
 * - commodity_prices: 2160 min = 36h (daily cadence + 1.5× window)
 * - broker_sanctions: 129600 min = 2160h = 90 days (quarterly; observability only)
 * - backtest_runs: 2160 min = 36h (daily job + 1.5× window)
 * - signal_quality_audit: 43200 min = 30d (event-driven, sparse cadence — see
 *   FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H below)
 * - prediction_claims: 10080 min = 168h (weekly minimum cadence)
 */
export const DEFAULT_SLA_CONFIG: SignalSlaConfig[] = [
  {
    signalType: "price",
    defaultThresholdMinutes: 10,
    // off-hours: dynamically computed via getSlaThreshold (window-aware)
  },
  {
    signalType: "bctc",
    // SSOT: system-map.json .project.data_sources["bctc-discover"].sla
    // (mirrored on "bctc-push"). Both values are FIXED durations selected only
    // by the isBctcEarningsWindowActive(now) boolean gate — see getSlaThreshold.
    defaultThresholdMinutes: 168 * 60, // 10080 min = 7d — out-of-window (inter-quarter quiet period)
    earningsWindowThresholdMinutes: 24 * 60, // 1440 min = 24h — earnings-window active (tight filing-season SLA)
  },
  {
    signalType: "news",
    defaultThresholdMinutes: 30,
  },
  {
    signalType: "sbv_fx",
    defaultThresholdMinutes: 30,
  },
  {
    signalType: "foreign_flow",
    defaultThresholdMinutes: 10,
    // off-hours: dynamically computed via getSlaThreshold (window-aware)
  },
  // ── Sprint 1920 additions ─────────────────────────────────────────────────
  {
    signalType: "vnstock_fundamentals",
    defaultThresholdMinutes: 72 * 60, // 4320 min = 72h
  },
  {
    signalType: "bond_maturity",
    defaultThresholdMinutes: 168 * 60, // 10080 min = 7 days
  },
  {
    signalType: "commodity_prices",
    defaultThresholdMinutes: 36 * 60, // 2160 min = 36h (daily + 1.5× window)
  },
  {
    signalType: "broker_sanctions",
    defaultThresholdMinutes: 2160 * 60, // 129600 min = 90 days (quarterly)
  },
  {
    signalType: "backtest_runs",
    defaultThresholdMinutes: 36 * 60, // 2160 min = 36h (daily + 1.5× window)
  },
  {
    signalType: "signal_quality_audit",
    // FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H (2026-07-30) —
    // root-cause correction. This row's own title/hypothesis (and the prior
    // 48h value) assumed signal_quality_audit.created_at tracks the
    // same-named `monthlySignalQualityAuditJob` cron (`0 0 1 * *`, see
    // schedulerJobTable.ts:227 / cronConfig.ts:129). Read at source, that is
    // FALSE: monthlySignalQualityAuditJob only queries signal_rejections and
    // sends a Telegram WORK report — it never writes signal_quality_audit.
    // The table's ONLY writer is insertSignalQualityAudit() (infrastructure/
    // db/signalQualityAuditStore.ts), called from ONE call site:
    // interface/mcp/tools/news-analysis/agentSignalTools.ts's post_agent_signal
    // handler, and only when signal_type is 'price_confirmation' or
    // 'urgent_news' AND finding_data.confidence is a number. That really is
    // event-driven, exactly as the pre-fix comment said — but production
    // history shows the event is naturally SPARSE (6 rows total, real gaps of
    // >2 weeks between them even in a healthy period; last row observed
    // 2026-06-05T20:12Z), so the 48h constant was simply too tight for how
    // rarely qualifying agents actually post these two signal types with a
    // confidence field — it fired CRITICAL almost permanently regardless of
    // whether anything was actually wrong. 30d/43200min tolerates that
    // observed real-world quiet-period length while still catching genuine
    // multi-week dead spots (a >45d CRITICAL escalation, e.g. the confirmed
    // ~52.8d gap this fix was filed against, still fires under the new value).
    //
    // FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT
    // (2026-07-30) — root-cause correction #2, WIRE decision. The "AND
    // finding_data.confidence is a number" precondition above was itself the
    // actual blocker for urgent_news, the ONE signal type that flows in
    // production (live-DB-verified: price_confirmation has 0 rows ALL TIME;
    // urgent_news's live emitter — news-scout, docs/agents/news-scout/flow/
    // stage-signals.md — populates `regime_adjusted_score`, never
    // `confidence`; 0/9 urgent_news rows since 2026-06-05 carried it). The
    // write gate (agentSignalTools.ts) now derives a confidence proxy from
    // `regime_adjusted_score` when `confidence` is absent (see
    // domain/services/signalValidator.ts#deriveAuditConfidence), so the prior
    // "6 rows total, real gaps of >2 weeks" history is NOT a representative
    // steady-state cadence for this row going forward — it was measuring an
    // almost-entirely-unreachable write path, not genuine event sparsity.
    // Per explicit scope of that fix: do NOT re-tune this threshold again off
    // the same stale 6-row sample. Once the wired path has accumulated a real
    // multi-week history of urgent_news-driven writes, re-derive this
    // threshold from THAT data.
    defaultThresholdMinutes: 30 * 24 * 60, // 43200 min = 30d
  },
  {
    signalType: "prediction_claims",
    defaultThresholdMinutes: 168 * 60, // 10080 min = 7 days (weekly minimum)
  },
];
