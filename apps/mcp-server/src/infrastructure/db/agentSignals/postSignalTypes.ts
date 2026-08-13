/** Input type for postSignal() / postSignalWithCriticGate() — split out of postSignal.ts for size. */

import type { SignalPayload, SignalType } from "./types.js";

/** Input for posting a new signal (extended with enrichment chain fields). */
export interface PostSignalInput {
  fromAgent: string;
  toAgent: string;
  signalType: SignalType | string;
  stockCode?: string | null;
  payload: SignalPayload | Record<string, unknown>;
  /** Time-to-live in minutes from now. */
  ttlMinutes?: number;
  /** 15-min cycle window identifier, e.g. "20260404-0900". Auto-computed if omitted. */
  cycleId?: string;
  /** Structured finding metrics validated by the agent */
  findingData?: Record<string, unknown>;
  /** FK to parent signal ID (for chain traversal) */
  causalRef?: number;
  /** 0=catalyst, 1=validation, 2=confirmation, 3=synthesis */
  chainDepth?: number;
  /**
   * Task 1105 — Stable identifier for the shared macro root cause.
   * E.g. "FED_2026-04-10" for all signals triggered by a Fed rate decision.
   * NULL = standalone signal (backward compatible with pre-1105 rows).
   */
  causalRootId?: string | null;
  /**
   * Task 1105 — Human-readable label for the causal root.
   * E.g. "Fed rate cut 2026-04-10". Used by Alert Commander for grouping headers.
   * NULL when causalRootId is not set.
   */
  causalRootLabel?: string | null;
  /**
   * Task 1106 — Signal class for conviction score weighting (Fix B from REQ_056).
   * Valid values: 'structural_factor' | 'cyclical' | 'technical_signal' |
   *               'one_time_catalyst' | 'sentiment'
   * NULL / undefined = unclassified, treated as weight 1.0 (backward compatible).
   */
  signalClass?: "structural_factor" | "cyclical" | "technical_signal" | "one_time_catalyst" | "sentiment" | null;
  /**
   * FIX-SIGNAL-CONFIDENCE-DEFAULT-50 — Confidence score (0–100) from signalValidator.
   * null = genuinely absent (column DEFAULT applies for fresh DBs; live DBs unchanged).
   * undefined = omitted by caller (same effect as null for DB write).
   * Never substitute a constant default here — genuine absence must land as NULL.
   */
  confidence_score?: number | null | undefined;
  /**
   * Task 230 — ISO8601 timestamp of when signal was validated.
   * Default: created_at if omitted.
   */
  validated_at?: string;
  /** Task 1328c — From ChainCatalystFindingData.newsSentiment [-1.0, 1.0] */
  newsSentiment?: number;
  /** Task 1328c — From ChainCatalystFindingData.kinhDichConfidence [0, 100] */
  kinhDichConfidence?: number;
  /** Task 1328c — From ChainCatalystFindingData.agentSignalsMajority */
  agentSignalsMajority?: "BUY" | "SELL" | "NEUTRAL";
  /**
   * Task 1862g — Time-window dedup for same-ticker + same-signal-type + same-direction.
   * If a signal with the same (stock_code, signal_type, direction) was posted within
   * this many minutes, the call returns -1 (suppressed) and does NOT insert a row.
   *
   * Default behaviour:
   *   - urgent_news signals: 240 minutes (4 hours) when this field is omitted.
   *   - All other signal types: 0 (disabled) when this field is omitted.
   *
   * Set to 0 to disable dedup. Set to any positive value to enable for any signal type.
   * Direction is read from finding_data.direction (fallback: finding_data.catalyst_direction).
   * Dedup is only applied when BOTH stock_code AND direction are present.
   */
  dedupWindowMinutes?: number;
  /**
   * TNB critic gate — persisted score from CriticResult (0.0–1.0 or null for timeout).
   * Set by postSignalWithCriticGate(); not required when calling postSignal() directly.
   */
  critic_score?: number | null;
  /**
   * TNB critic gate — one-sentence verdict or critique text from CriticResult.notes.
   * Set by postSignalWithCriticGate(); not required when calling postSignal() directly.
   */
  critic_notes?: string | null;
  /**
   * TNB critic gate — 0 = no retry; 1 = one retry occurred (pass or fail-soft).
   * Set by postSignalWithCriticGate(); not required when calling postSignal() directly.
   */
  retry_count?: number;
}
