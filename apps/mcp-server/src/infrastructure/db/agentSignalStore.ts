/**
 * Agent Signal Store — Task 242 + Enrichment Chain Extension
 *
 * SQLite CRUD helpers for the `agent_signals` table.
 *
 * The agent signal bus lets analysis agents communicate with each other
 * by posting typed, TTL-bound messages into a shared SQLite table.
 *
 * Provides:
 *   - postSignal()           — insert a new signal into agent_signals
 *   - getSignals()           — retrieve pending signals for an agent
 *   - recordOutcome()        — record processing outcome for a signal
 *   - getSignalEffectiveness() — aggregate effectiveness metrics
 *   - cleanExpired()         — delete expired signals
 *   - computeCycleId()       — generate a 15-min window cycle ID
 *   - getChainFindings()     — get all findings in a cycle window
 *   - getChainFromRoot()     — follow causal_ref links from a root finding
 *   - getOpenChainFindings() — get unsynthesized findings for agent enrichment
 *
 * Signal types include enrichment chain types:
 *   chain_catalyst, fundamental_validation, price_confirmation, verified_chain
 *
 * All times are stored as UTC ISO-8601 strings (SQLite datetime format).
 * Numbers are in plain integers — no million-VND convention needed here.
 */

import type { Database } from "bun:sqlite";
import { z } from "zod";
import { detectEarningsConflict } from "../../domain/services/earningsConflictDetector.js";
import { scoreWithTnbCritic, type CriticInput, type CriticResult } from "../../domain/services/tnbCriticScorer.js";
import { seedSignalOutcome } from "./signalOutcomeStore.js";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Zod schema for valid signal types (SSOT — imported by agentSignalTools).
 * Derived TypeScript union below keeps the rest of the file unchanged.
 */
export const SignalTypeSchema = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
  "chain_catalyst",
  "fundamental_validation",
  "price_confirmation",
  "verified_chain",
  "signal_feedback",
  "legal_risk",  // SPIKE-1948e-fix
]);

/** Valid signal types that agents can exchange (includes enrichment chain types). */
export type SignalType = z.infer<typeof SignalTypeSchema>;

/** Outcome values for a signal once it has been processed. */
export type SignalOutcome = "fired" | "suppressed" | "confirmed" | "false_positive";

/** Per-group effectiveness metrics returned by getSignalEffectiveness. */
export interface SignalEffectiveness {
  fromAgent: string;
  signalType: string;
  total: number;
  fired: number;
  confirmed: number;
  false_positive: number;
  /** confirmed / (confirmed + false_positive), or null when denominator is 0. */
  precision: number | null;
}

/** Payload carried by an agent signal. */
export interface SignalPayload {
  title?: string;
  detail?: string;
  impact_score?: number;
  [key: string]: unknown;
}

/** A fully hydrated agent signal row returned by getSignals. */
export interface AgentSignal {
  id: number;
  fromAgent: string;
  toAgent: string;
  signalType: SignalType;
  stockCode: string | null;
  payload: SignalPayload;
  status: "unread" | "read";
  createdAt: string;
  expiresAt: string;
  confidence_score?: number; // 0–100, default 50 (Task 230)
  validated_at?: string; // ISO8601, default created_at (Task 230)
}

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
   * Task 230 — Confidence score (0–100) from signalValidator.
   * Default: 50 (backward compatible if omitted).
   */
  confidence_score?: number;
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

/**
 * Task 1105 — One group in the Alert Commander consolidated view.
 *
 * Signals sharing the same causal_root_id are consolidated into a single
 * group (isConsolidated=true). Signals with NULL causal_root_id each appear
 * as their own individual group (isConsolidated=false, signalCount=1).
 */
export interface CausalRootGroup {
  causalRootId: string | null;
  causalRootLabel: string | null;
  signalCount: number;
  isConsolidated: boolean;
  signals: AgentSignal[];
}

/** Options for getSignalsGroupedByCausalRoot. */
export interface GetGroupedSignalsOptions {
  toAgent?: string;
  status?: "unread" | "all";
}

/** Deserialized chain finding row. */
export interface ChainFinding {
  id: number;
  fromAgent: string;
  signalType: SignalType | string;
  stockCode: string | null;
  payload: SignalPayload;
  findingData: Record<string, unknown>;
  causalRef: number | null;
  chainDepth: number;
  createdAt: string;
}

// ── computeCycleId ────────────────────────────────────────────────────────────

/**
 * Generates a 15-min cycle window identifier from a Date.
 *
 * Format: "YYYYMMDD-HHMM" where MM is rounded down to 0, 15, 30, or 45.
 *
 * @param date - Defaults to `new Date()` if omitted.
 * @example computeCycleId(new Date("2026-04-04T09:17:00Z")) // "20260404-0915"
 */
export function computeCycleId(date?: Date): string {
  const d = date ?? new Date();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const rawMin = d.getUTCMinutes();
  const min = Math.floor(rawMin / 15) * 15;
  const minStr = String(min).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${minStr}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute an ISO-8601 UTC datetime string for `now + ttlMinutes`.
 * SQLite stores datetimes without a timezone suffix — we strip the trailing Z.
 */
function expiresAt(ttlMinutes: number): string {
  const ms = Date.now() + ttlMinutes * 60 * 1000;
  // SQLite datetime() format: "YYYY-MM-DD HH:MM:SS" (no Z)
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

// ── Row deserialization helper ────────────────────────────────────────────────

interface RawChainRow {
  id: number;
  from_agent: string;
  signal_type: string;
  stock_code: string | null;
  payload_json?: string;
  payload?: string;
  finding_data: string | null;
  causal_ref: number | null;
  chain_depth: number;
  created_at: string;
}

function deserializeChainRow(row: RawChainRow): ChainFinding {
  let payload: SignalPayload = {};
  let findingData: Record<string, unknown> = {};

  const rawPayload = row.payload_json ?? row.payload ?? "{}";
  try { payload = JSON.parse(rawPayload) as SignalPayload; } catch {}
  try { findingData = JSON.parse(row.finding_data ?? "{}") as Record<string, unknown>; } catch {}

  return {
    id: row.id,
    fromAgent: row.from_agent,
    signalType: row.signal_type as SignalType,
    stockCode: row.stock_code,
    payload,
    findingData,
    causalRef: row.causal_ref,
    chainDepth: row.chain_depth ?? 0,
    createdAt: row.created_at,
  };
}

// ── postSignal ──────────────────────────────────────────────────────────────

/**
 * Insert a new agent signal and return its auto-increment ID.
 *
 * Supports both the original signal bus fields and the enrichment chain
 * extension fields (cycleId, findingData, causalRef, chainDepth).
 *
 * @param db    - Active bun:sqlite Database connection
 * @param input - Signal parameters including TTL
 * @returns     The newly created row ID (positive integer)
 */
export function postSignal(db: Database, input: PostSignalInput): number {
  const signalId = _postSignalInner(db, input);
  // Outcome feedback loop: seed a pending signal_outcomes row for directional signals.
  // Only when insert succeeded (signalId > 0) and a stock_code is present.
  if (signalId > 0) {
    const resolvedStockCodeForSeed =
      !input.stockCode || input.stockCode === "unknown" ? null : input.stockCode;
    if (resolvedStockCodeForSeed) {
      const fd = (input.findingData ?? {}) as Record<string, unknown>;
      const rawDirection =
        typeof fd["direction"] === "string" ? fd["direction"] :
        typeof fd["catalyst_direction"] === "string" ? fd["catalyst_direction"] :
        null;
      if (rawDirection) {
        const now = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
        try {
          seedSignalOutcome(db, signalId, {
            stockCode: resolvedStockCodeForSeed,
            signalType: input.signalType,
            fromAgent: input.fromAgent,
            predictedDirection: rawDirection,
            createdAt: now,
          });
        } catch {
          // seedSignalOutcome failure must never throw from postSignal
        }
      }
    }
  }
  return signalId;
}

/** Internal implementation — extracted so postSignal can wrap with outcome seeding. */
function _postSignalInner(db: Database, input: PostSignalInput): number {
  const {
    fromAgent,
    toAgent,
    signalType,
    stockCode = null,
    payload,
    ttlMinutes,
    cycleId,
    findingData = {},
    causalRef = null,
    chainDepth = 0,
    causalRootId = null,
    causalRootLabel = null,
    signalClass = null,
    confidence_score = 50, // Task 230: default 50
    validated_at, // Task 230: optional validated_at
    newsSentiment = null, // Task 1328c
    kinhDichConfidence = null, // Task 1328c
    agentSignalsMajority = null, // Task 1328c
    dedupWindowMinutes: rawDedupWindowMinutes, // Task 1862g: undefined = use type-aware default
    critic_score = undefined, // TNB critic gate
    critic_notes = undefined, // TNB critic gate
    retry_count = 0, // TNB critic gate
  } = input;

  // Task 1862g: resolve dedup window.
  // urgent_news default = 240 min (4h). All other types default = 0 (disabled).
  // Callers can override by passing dedupWindowMinutes explicitly.
  const dedupWindowMinutes =
    rawDedupWindowMinutes !== undefined
      ? rawDedupWindowMinutes
      : signalType === "urgent_news"
      ? 240
      : 0;

  // 1334: Normalize sentinel values — agents may post "unknown" for market-wide signals.
  // "unknown" / "" / undefined all mean "no specific stock" → NULL in agent_signals.
  // This prevents chain grouping by getChainFindings() from collecting all market-wide
  // signals into a fake "unknown" stock bucket.
  const resolvedStockCode: string | null =
    !stockCode || stockCode === "unknown" ? null : stockCode;

  // Task 1862g: 4-hour dedup for same (stock_code, signal_type, direction).
  // Suppresses alert spam when news-scout fires the same ticker + direction repeatedly.
  // Dedup only applies when BOTH stock_code AND direction are present in finding_data.
  // Returns -1 (suppressed) without inserting when a duplicate is found within the window.
  if (dedupWindowMinutes > 0 && resolvedStockCode !== null) {
    const fd = findingData as Record<string, unknown>;
    const direction =
      typeof fd["direction"] === "string"
        ? fd["direction"]
        : typeof fd["catalyst_direction"] === "string"
        ? fd["catalyst_direction"]
        : null;

    if (direction !== null) {
      // Check whether the created_at column exists (base schema guard)
      let hasCreatedAt = false;
      try {
        db.prepare("SELECT created_at FROM agent_signals LIMIT 0").all();
        hasCreatedAt = true;
      } catch {
        hasCreatedAt = false;
      }

      if (hasCreatedAt) {
        const cutoff = new Date(Date.now() - dedupWindowMinutes * 60_000)
          .toISOString()
          .replace("T", " ")
          .replace(/\.\d{3}Z$/, "");

        // Check for existing signal with same (stock_code, signal_type, direction).
        // Direction is stored inside finding_data JSON — use JSON_EXTRACT when available,
        // otherwise fall back to a LIKE search (SQLite < 3.38 may lack JSON functions).
        let existing: { id: number } | null = null;
        try {
          existing = db
            .prepare<{ id: number }, [string, string, string, string, string]>(
              `SELECT id FROM agent_signals
               WHERE stock_code  = ?
                 AND signal_type = ?
                 AND created_at >= ?
                 AND (
                   JSON_EXTRACT(finding_data, '$.direction') = ?
                   OR JSON_EXTRACT(finding_data, '$.catalyst_direction') = ?
                 )
               LIMIT 1`,
            )
            .get(resolvedStockCode, signalType, cutoff, direction, direction);
        } catch {
          // JSON_EXTRACT not supported — fall back to LIKE (less precise but safe)
          existing = db
            .prepare<{ id: number }, [string, string, string, string, string]>(
              `SELECT id FROM agent_signals
               WHERE stock_code  = ?
                 AND signal_type = ?
                 AND created_at >= ?
                 AND (
                   finding_data LIKE '%"direction":"' || ? || '"%'
                   OR finding_data LIKE '%"catalyst_direction":"' || ? || '"%'
                 )
               LIMIT 1`,
            )
            .get(resolvedStockCode, signalType, cutoff, direction, direction);
        }

        if (existing !== null) {
          console.info(
            `[agentSignalStore] Dedup suppressed: ${signalType} ${resolvedStockCode} ${direction} ` +
            `(duplicate of id=${existing.id}, window=${dedupWindowMinutes}m)`,
          );
          return -1;
        }
      }
    }
  }

  // Task 1786: Earnings conflict detection.
  // For chain_catalyst signals with event_type = "earnings", check whether a prior
  // signal for the same ticker already carries a different growth figure. If so,
  // append a conflict warning to payload.detail — does NOT block posting.
  if (signalType === "chain_catalyst" && resolvedStockCode) {
    const eventType = (findingData as Record<string, unknown>)["event_type"];
    if (eventType === "earnings") {
      const detail = (payload as Record<string, unknown>)["detail"];
      const warning = detectEarningsConflict(
        db,
        resolvedStockCode,
        typeof detail === "string" ? detail : undefined,
      );
      if (warning) {
        (payload as Record<string, unknown>)["detail"] =
          typeof detail === "string" ? `${detail} — ${warning}` : warning;
      }
    }
  }

  // Check which optional column groups exist. Fresh DBs (with all columns)
  // always hit the full path; legacy DBs with only the base schema still work.
  const hasChainColumns = (() => {
    try {
      db.prepare("SELECT cycle_id FROM agent_signals LIMIT 0").all();
      return true;
    } catch {
      return false;
    }
  })();

  const hasCausalRootColumns = (() => {
    try {
      db.prepare("SELECT causal_root_id FROM agent_signals LIMIT 0").all();
      return true;
    } catch {
      return false;
    }
  })();

  const hasSignalClassColumn = (() => {
    try {
      db.prepare("SELECT signal_class FROM agent_signals LIMIT 0").all();
      return true;
    } catch {
      return false;
    }
  })();

  const hasValidationColumns = (() => {
    try {
      db.prepare("SELECT confidence_score, validated_at FROM agent_signals LIMIT 0").all();
      return true;
    } catch {
      return false;
    }
  })();

  // Task 1328c — new signal context columns
  const hasContextColumns = (() => {
    try {
      db.prepare("SELECT news_sentiment, kinh_dich_confidence, agent_signals_majority FROM agent_signals LIMIT 0").all();
      return true;
    } catch {
      return false;
    }
  })();

  // TNB critic gate columns
  const hasCriticColumns = (() => {
    try {
      db.prepare("SELECT critic_score, critic_notes, retry_count FROM agent_signals LIMIT 0").all();
      return true;
    } catch {
      return false;
    }
  })();

  if (hasChainColumns) {
    const now = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
    const expires = ttlMinutes != null ? expiresAt(ttlMinutes) : null;
    const validatedAtValue = validated_at ?? now;

    if (hasCausalRootColumns) {
      if (hasSignalClassColumn) {
        if (hasValidationColumns) {
          if (hasContextColumns) {
            if (hasCriticColumns) {
              const stmt = db.prepare(`
                INSERT INTO agent_signals
                  (from_agent, to_agent, signal_type, stock_code, payload, status,
                   created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth,
                   causal_root_id, causal_root_label, signal_class, confidence_score, validated_at,
                   news_sentiment, kinh_dich_confidence, agent_signals_majority,
                   critic_score, critic_notes, retry_count)
                VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              const result = stmt.run(
                fromAgent,
                toAgent,
                signalType,
                resolvedStockCode,
                JSON.stringify(payload),
                now,
                expires ?? expiresAt(ttlMinutes ?? 120),
                cycleId ?? null,
                JSON.stringify(findingData),
                causalRef,
                chainDepth,
                causalRootId,
                causalRootLabel,
                signalClass,
                confidence_score,
                validatedAtValue,
                newsSentiment ?? null,
                kinhDichConfidence ?? null,
                agentSignalsMajority ?? null,
                critic_score !== undefined ? critic_score : null,
                critic_notes !== undefined ? critic_notes : null,
                retry_count,
              );
              return Number(result.lastInsertRowid);
            }
            const stmt = db.prepare(`
              INSERT INTO agent_signals
                (from_agent, to_agent, signal_type, stock_code, payload, status,
                 created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth,
                 causal_root_id, causal_root_label, signal_class, confidence_score, validated_at,
                 news_sentiment, kinh_dich_confidence, agent_signals_majority)
              VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
              fromAgent,
              toAgent,
              signalType,
              resolvedStockCode,
              JSON.stringify(payload),
              now,
              expires ?? expiresAt(ttlMinutes ?? 120),
              cycleId ?? null,
              JSON.stringify(findingData),
              causalRef,
              chainDepth,
              causalRootId,
              causalRootLabel,
              signalClass,
              confidence_score,
              validatedAtValue,
              newsSentiment ?? null,
              kinhDichConfidence ?? null,
              agentSignalsMajority ?? null,
            );
            return Number(result.lastInsertRowid);
          }
          const stmt = db.prepare(`
            INSERT INTO agent_signals
              (from_agent, to_agent, signal_type, stock_code, payload, status,
               created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth,
               causal_root_id, causal_root_label, signal_class, confidence_score, validated_at)
            VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const result = stmt.run(
            fromAgent,
            toAgent,
            signalType,
            resolvedStockCode,
            JSON.stringify(payload),
            now,
            expires ?? expiresAt(ttlMinutes ?? 120),
            cycleId ?? null,
            JSON.stringify(findingData),
            causalRef,
            chainDepth,
            causalRootId,
            causalRootLabel,
            signalClass,
            confidence_score,
            validatedAtValue,
          );
          return Number(result.lastInsertRowid);
        }
        const stmt = db.prepare(`
          INSERT INTO agent_signals
            (from_agent, to_agent, signal_type, stock_code, payload, status,
             created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth,
             causal_root_id, causal_root_label, signal_class)
          VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
          fromAgent,
          toAgent,
          signalType,
          resolvedStockCode,
          JSON.stringify(payload),
          now,
          expires ?? expiresAt(ttlMinutes ?? 120),
          cycleId ?? null,
          JSON.stringify(findingData),
          causalRef,
          chainDepth,
          causalRootId,
          causalRootLabel,
          signalClass,
        );
        return Number(result.lastInsertRowid);
      }

      if (hasValidationColumns) {
        const stmt = db.prepare(`
          INSERT INTO agent_signals
            (from_agent, to_agent, signal_type, stock_code, payload, status,
             created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth,
             causal_root_id, causal_root_label, confidence_score, validated_at)
          VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
          fromAgent,
          toAgent,
          signalType,
          resolvedStockCode,
          JSON.stringify(payload),
          now,
          expires ?? expiresAt(ttlMinutes ?? 120),
          cycleId ?? null,
          JSON.stringify(findingData),
          causalRef,
          chainDepth,
          causalRootId,
          causalRootLabel,
          confidence_score,
          validatedAtValue,
        );
        return Number(result.lastInsertRowid);
      }

      const stmt = db.prepare(`
        INSERT INTO agent_signals
          (from_agent, to_agent, signal_type, stock_code, payload, status,
           created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth,
           causal_root_id, causal_root_label)
        VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        fromAgent,
        toAgent,
        signalType,
        resolvedStockCode,
        JSON.stringify(payload),
        now,
        expires ?? expiresAt(ttlMinutes ?? 120),
        cycleId ?? null,
        JSON.stringify(findingData),
        causalRef,
        chainDepth,
        causalRootId,
        causalRootLabel,
      );
      return Number(result.lastInsertRowid);
    }

    // Chain columns present but causal_root columns not yet migrated
    if (hasValidationColumns) {
      const stmt = db.prepare(`
        INSERT INTO agent_signals
          (from_agent, to_agent, signal_type, stock_code, payload, status,
           created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth,
           confidence_score, validated_at)
        VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        fromAgent,
        toAgent,
        signalType,
        resolvedStockCode,
        JSON.stringify(payload),
        now,
        expires ?? expiresAt(ttlMinutes ?? 120),
        cycleId ?? null,
        JSON.stringify(findingData),
        causalRef,
        chainDepth,
        confidence_score,
        validatedAtValue,
      );
      return Number(result.lastInsertRowid);
    }

    const stmt = db.prepare(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, status,
         created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth)
      VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      fromAgent,
      toAgent,
      signalType,
      resolvedStockCode,
      JSON.stringify(payload),
      now,
      expires ?? expiresAt(ttlMinutes ?? 120),
      cycleId ?? null,
      JSON.stringify(findingData),
      causalRef,
      chainDepth,
    );
    return Number(result.lastInsertRowid);
  }

  // Fallback: base schema without chain columns
  if (hasValidationColumns) {
    const now = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
    const validatedAtValue = validated_at ?? now;
    const stmt = db.prepare(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, status, expires_at,
         confidence_score, validated_at)
      VALUES
        (?, ?, ?, ?, ?, 'unread', ?, ?, ?)
    `);
    const result = stmt.run(
      fromAgent,
      toAgent,
      signalType,
      resolvedStockCode,
      JSON.stringify(payload),
      expiresAt(ttlMinutes ?? 120),
      confidence_score,
      validatedAtValue,
    );
    return Number(result.lastInsertRowid);
  }

  const stmt = db.prepare(`
    INSERT INTO agent_signals
      (from_agent, to_agent, signal_type, stock_code, payload, status, expires_at)
    VALUES
      (?, ?, ?, ?, ?, 'unread', ?)
  `);
  const result = stmt.run(
    fromAgent,
    toAgent,
    signalType,
    resolvedStockCode,
    JSON.stringify(payload),
    expiresAt(ttlMinutes ?? 120),
  );
  return Number(result.lastInsertRowid);
}

// ── getSignals ──────────────────────────────────────────────────────────────

/** Options for filtering getSignals results. */
export interface GetSignalsOptions {
  /** "unread" (default) returns only unread; "all" returns all statuses. */
  status?: "unread" | "all";
  /**
   * When set, filters by sender (from_agent = ?) instead of the standard
   * recipient filter. Used for sender-history / dedup lookups. Read-mark
   * side-effect is suppressed when this is provided.
   */
  fromAgent?: string;
}

/**
 * Retrieve signals for a given agent, filtered by expiry and optionally by status.
 *
 * - Always filters out expired signals (expires_at <= now).
 * - Includes signals addressed directly to `agent` OR to the special value `"all"`.
 * - If status is "unread" (default), marks returned rows as "read" atomically.
 * - Includes confidence_score and validated_at if they exist in the schema (Task 230).
 *
 * @param db    - Active bun:sqlite Database connection
 * @param agent - The receiving agent name
 * @param opts  - Optional status filter
 * @returns     Array of hydrated AgentSignal objects (payload parsed from JSON)
 */
export function getSignals(
  db: Database,
  agent: string,
  opts: GetSignalsOptions = {},
): AgentSignal[] {
  const statusFilter = opts.status ?? "unread";

  const statusClause =
    statusFilter === "unread" ? "AND s.status = 'unread'" : "";

  // Check if validation columns exist
  let hasValidationColumns = false;
  try {
    db.prepare("SELECT confidence_score, validated_at FROM agent_signals LIMIT 0").all();
    hasValidationColumns = true;
  } catch {
    hasValidationColumns = false;
  }

  const validationColumns = hasValidationColumns
    ? ", confidence_score, validated_at"
    : "";

  type RawRow = {
    id: number;
    from_agent: string;
    to_agent: string;
    signal_type: string;
    stock_code: string | null;
    payload: string;
    status: string;
    created_at: string;
    expires_at: string;
    confidence_score?: number;
    validated_at?: string;
  };

  // When fromAgent is set, query sender history: filter by from_agent only (ignores to_agent axis).
  // When fromAgent is absent, query inbox: filter by to_agent (standard behaviour).
  const recipientClause = opts.fromAgent === undefined
    ? "(s.to_agent = ? OR s.to_agent = 'all')"
    : "s.from_agent = ?";
  const bindParam = opts.fromAgent !== undefined ? opts.fromAgent : agent;

  const rows = db
    .query<RawRow, [string]>(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload, status,
              created_at, expires_at${validationColumns}
       FROM agent_signals s
       WHERE ${recipientClause}
         AND s.expires_at > datetime('now')
         ${statusClause}
       ORDER BY s.id ASC`,
    )
    .all(bindParam) as RawRow[];

  // Mark unread rows as read (only when fetching as inbox — NOT when doing sender-history lookup)
  if (statusFilter === "unread" && opts.fromAgent === undefined && rows.length > 0) {
    const ids = rows.map((r) => r.id).join(",");
    db.exec(`UPDATE agent_signals SET status = 'read' WHERE id IN (${ids})`);
  }

  return rows.map((r) => {
    const signal: AgentSignal = {
      id: r.id,
      fromAgent: r.from_agent,
      toAgent: r.to_agent,
      signalType: r.signal_type as SignalType,
      stockCode: r.stock_code,
      payload: JSON.parse(r.payload) as SignalPayload,
      status: (statusFilter === "unread" ? "read" : r.status) as "unread" | "read",
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    };

    // Add optional Task 230 fields
    if (hasValidationColumns) {
      if (r.confidence_score !== undefined) {
        signal.confidence_score = r.confidence_score;
      }
      if (r.validated_at !== undefined) {
        signal.validated_at = r.validated_at;
      }
    }

    return signal;
  });
}

// ── recordOutcome ───────────────────────────────────────────────────────────

/**
 * Record the processing outcome for a signal row.
 *
 * Sets `outcome`, `outcome_at` (UTC now), and optionally `outcome_detail`
 * on the row identified by `signalId`.
 *
 * @param db       - Active bun:sqlite Database connection
 * @param signalId - Primary key of the target agent_signals row
 * @param outcome  - One of: fired | suppressed | confirmed | false_positive
 * @param detail   - Optional free-text explanation stored in outcome_detail
 */
export function recordOutcome(
  db: Database,
  signalId: number,
  outcome: SignalOutcome,
  detail?: string,
): void {
  db.prepare(
    `UPDATE agent_signals
        SET outcome        = ?,
            outcome_at     = datetime('now'),
            outcome_detail = ?
      WHERE id = ?`,
  ).run(outcome, detail ?? null, signalId);
}

// ── getSignalEffectiveness ──────────────────────────────────────────────────

/** Options for filtering getSignalEffectiveness results. */
export interface GetEffectivenessOptions {
  /** Only include signals from this agent. */
  fromAgent?: string;
  /** Only include signals of this type. */
  signalType?: string;
  /** Look-back window in days from now (default 7). */
  days?: number;
}

/**
 * Aggregate signal effectiveness metrics grouped by (from_agent, signal_type).
 *
 * Only rows with a non-null `outcome` within the look-back window are counted.
 *
 * @param db   - Active bun:sqlite Database connection
 * @param opts - Optional filters (fromAgent, signalType, days)
 * @returns    Array of SignalEffectiveness records, one per group
 */
export function getSignalEffectiveness(
  db: Database,
  opts: GetEffectivenessOptions = {},
): SignalEffectiveness[] {
  const days = opts.days ?? 7;

  const conditions: string[] = [
    "outcome IS NOT NULL",
    `created_at >= datetime('now', '-${days} days')`,
  ];

  if (opts.fromAgent) conditions.push(`from_agent = '${opts.fromAgent.replace(/'/g, "''")}'`);
  if (opts.signalType) conditions.push(`signal_type = '${opts.signalType.replace(/'/g, "''")}'`);

  const where = conditions.join(" AND ");

  type Row = {
    from_agent: string;
    signal_type: string;
    total: number;
    fired: number;
    confirmed: number;
    false_positive: number;
  };

  const rows = db
    .query<Row, []>(
      `SELECT
         from_agent,
         signal_type,
         COUNT(*)                                              AS total,
         SUM(CASE WHEN outcome = 'fired'         THEN 1 ELSE 0 END) AS fired,
         SUM(CASE WHEN outcome = 'confirmed'     THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN outcome = 'false_positive'THEN 1 ELSE 0 END) AS false_positive
       FROM agent_signals
       WHERE ${where}
       GROUP BY from_agent, signal_type
       ORDER BY from_agent, signal_type`,
    )
    .all();

  return rows.map((r) => {
    const denom = r.confirmed + r.false_positive;
    const precision = denom > 0 ? r.confirmed / denom : null;
    return {
      fromAgent: r.from_agent,
      signalType: r.signal_type,
      total: r.total,
      fired: r.fired,
      confirmed: r.confirmed,
      false_positive: r.false_positive,
      precision,
    };
  });
}

// ── cleanExpired ────────────────────────────────────────────────────────────

/**
 * Delete all expired agent signals and return the number of rows removed.
 *
 * Should be called periodically (e.g. from the data audit job) to prevent
 * unbounded table growth.
 *
 * @param db - Active bun:sqlite Database connection
 * @returns  Number of rows deleted
 */
export function cleanExpired(db: Database): number {
  const result = db
    .prepare("DELETE FROM agent_signals WHERE expires_at < datetime('now')")
    .run();
  return result.changes;
}

// ── getChainFindings ──────────────────────────────────────────────────────────

/**
 * Get all findings in a specific cycle window.
 *
 * Use this to collect all agent findings within a 15-min cycle so the
 * chain synthesizer can group them by stock_code.
 *
 * @param db      - Active bun:sqlite Database connection
 * @param cycleId - 15-min window identifier, e.g. "20260404-0900"
 */
export function getChainFindings(
  db: Database,
  cycleId: string,
): ChainFinding[] {
  const stmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE cycle_id = ?
      AND stock_code IS NOT NULL
      AND stock_code != 'unknown'
    ORDER BY chain_depth ASC, id ASC
  `);
  const rows = stmt.all(cycleId) as RawChainRow[];
  return rows.map(deserializeChainRow);
}

// ── getChainFromRoot ──────────────────────────────────────────────────────────

/**
 * Get a complete chain by following causal_ref links from a root finding.
 *
 * Returns the root signal first, then all signals that directly reference it
 * via causal_ref. Note: only follows one level of the chain (direct children)
 * because the depth structure provides ordering.
 *
 * @param db     - Active bun:sqlite Database connection
 * @param rootId - ID of the root (depth=0) signal
 */
export function getChainFromRoot(
  db: Database,
  rootId: number,
): ChainFinding[] {
  // Get root
  const rootStmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE id = ?
  `);
  const root = rootStmt.get(rootId) as RawChainRow | null;
  if (!root) return [];

  // Get all children (direct references to root)
  const childStmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE causal_ref = ?
    ORDER BY chain_depth ASC, id ASC
  `);
  const children = childStmt.all(rootId) as RawChainRow[];

  return [root, ...children].map(deserializeChainRow);
}

// ── getSignalsGroupedByCausalRoot ─────────────────────────────────────────────

/**
 * Task 1105 — Retrieve signals grouped by causal_root_id for Alert Commander.
 *
 * Grouping rules:
 *   - Signals sharing the same non-NULL causal_root_id → 1 consolidated group
 *     (isConsolidated=true, signalCount >= 2).
 *   - Signals with NULL causal_root_id → each appears as its own individual group
 *     (isConsolidated=false, signalCount=1).
 *
 * This lets Alert Commander send 1 Telegram message per macro event instead of
 * one per signal.
 *
 * @param db   - Active bun:sqlite Database connection
 * @param opts - Optional filters (toAgent, status)
 * @returns    Array of CausalRootGroup
 */
export function getSignalsGroupedByCausalRoot(
  db: Database,
  opts: GetGroupedSignalsOptions = {},
): CausalRootGroup[] {
  const { toAgent, status = "unread" } = opts;

  const agentClause = toAgent ? "AND (s.to_agent = ? OR s.to_agent = 'all')" : "";
  const statusClause = status === "unread" ? "AND s.status = 'unread'" : "";

  const params: (string | number)[] = [];
  if (toAgent) params.push(toAgent);

  type RawRow = {
    id: number;
    from_agent: string;
    to_agent: string;
    signal_type: string;
    stock_code: string | null;
    payload: string;
    status: string;
    created_at: string;
    expires_at: string;
    causal_root_id: string | null;
    causal_root_label: string | null;
  };

  const rows = db
    .prepare<RawRow, (string | number)[]>(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload,
              status, created_at, expires_at, causal_root_id, causal_root_label
       FROM agent_signals s
       WHERE s.expires_at > datetime('now')
         ${agentClause}
         ${statusClause}
       ORDER BY causal_root_id ASC NULLS LAST, s.id ASC`,
    )
    .all(...params) as RawRow[];

  if (rows.length === 0) return [];

  const consolidatedMap = new Map<string, CausalRootGroup>();
  const individualGroups: CausalRootGroup[] = [];

  for (const row of rows) {
    let payloadParsed: SignalPayload = {};
    try { payloadParsed = JSON.parse(row.payload) as SignalPayload; } catch {}

    const signal: AgentSignal = {
      id: row.id,
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      signalType: row.signal_type as SignalType,
      stockCode: row.stock_code,
      payload: payloadParsed,
      status: row.status as "unread" | "read",
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };

    if (row.causal_root_id !== null) {
      const key = row.causal_root_id;
      const existing = consolidatedMap.get(key);
      if (existing) {
        existing.signals.push(signal);
        existing.signalCount = existing.signals.length;
        existing.isConsolidated = existing.signalCount >= 2;
      } else {
        consolidatedMap.set(key, {
          causalRootId: row.causal_root_id,
          causalRootLabel: row.causal_root_label,
          signalCount: 1,
          isConsolidated: false,
          signals: [signal],
        });
      }
    } else {
      individualGroups.push({
        causalRootId: null,
        causalRootLabel: null,
        signalCount: 1,
        isConsolidated: false,
        signals: [signal],
      });
    }
  }

  for (const group of consolidatedMap.values()) {
    group.isConsolidated = group.signalCount >= 2;
  }

  return [...individualGroups, ...consolidatedMap.values()];
}

// ── getOpenChainFindings ──────────────────────────────────────────────────────

/**
 * Get open chain findings (not yet synthesized) for agents to enrich.
 *
 * Returns signals with enrichment chain columns (cycle_id IS NOT NULL)
 * created within the last `minutesBack` minutes and not yet marked as
 * processed (i.e., not yet synthesized into a verified_chain).
 *
 * @param db          - Active bun:sqlite Database connection
 * @param minutesBack - Lookback window in minutes (default 30)
 */
export function getOpenChainFindings(
  db: Database,
  minutesBack: number = 30,
): ChainFinding[] {
  // Use SQLite-compatible format to match datetime('now') DEFAULT in schema
  const cutoff = new Date(Date.now() - minutesBack * 60_000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  // Check if 'processed' column exists; fall back to status-based filter
  let useProcessed = true;
  try {
    db.prepare("SELECT processed FROM agent_signals LIMIT 0").all();
  } catch {
    useProcessed = false;
  }

  const processedClause = useProcessed
    ? "AND processed = 0"
    : "AND status = 'unread'";

  const stmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE cycle_id IS NOT NULL
      AND created_at >= ?
      ${processedClause}
      AND signal_type != 'verified_chain'
    ORDER BY chain_depth ASC, id ASC
  `);
  const rows = stmt.all(cutoff) as RawChainRow[];
  return rows.map(deserializeChainRow);
}

// ── getPriceAnomalySignals ────────────────────────────────────────────────────

/**
 * Task 1804d-C — Retrieve unexpired price_anomaly signals for a given ticker
 * within a time window.
 *
 * Use this to check whether the price-watcher agent has already flagged a
 * ticker before escalating or deduplicate alerts from the alert pipeline.
 *
 * Filters:
 *   - signal_type = 'price_anomaly'
 *   - stock_code  = ticker (exact match, case-sensitive)
 *   - expires_at  > now                (not yet expired)
 *   - created_at >= now - withinMinutes (inside the look-back window)
 *
 * Does NOT mark signals as read — callers inspect without side effects.
 *
 * @param db            - Active bun:sqlite Database connection
 * @param ticker        - Stock code to filter by (e.g. "VCB")
 * @param withinMinutes - Look-back window in minutes (default 120)
 * @returns             Array of hydrated AgentSignal objects, oldest-first
 */
export function getPriceAnomalySignals(
  db: Database,
  ticker: string,
  withinMinutes: number = 120,
): AgentSignal[] {
  // Build the cutoff in SQLite datetime() format: "YYYY-MM-DD HH:MM:SS"
  const cutoff = new Date(Date.now() - withinMinutes * 60_000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  // Detect optional validation columns (same guard used by getSignals)
  let hasValidationColumns = false;
  try {
    db.prepare("SELECT confidence_score, validated_at FROM agent_signals LIMIT 0").all();
    hasValidationColumns = true;
  } catch {
    hasValidationColumns = false;
  }

  const validationColumns = hasValidationColumns
    ? ", confidence_score, validated_at"
    : "";

  type RawRow = {
    id: number;
    from_agent: string;
    to_agent: string;
    signal_type: string;
    stock_code: string | null;
    payload: string;
    status: string;
    created_at: string;
    expires_at: string;
    confidence_score?: number;
    validated_at?: string;
  };

  const rows = db
    .prepare<RawRow, [string, string]>(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload, status,
              created_at, expires_at${validationColumns}
       FROM agent_signals
       WHERE signal_type  = 'price_anomaly'
         AND stock_code   = ?
         AND expires_at   > datetime('now')
         AND created_at  >= ?
       ORDER BY id ASC`,
    )
    .all(ticker, cutoff) as RawRow[];

  return rows.map((r) => {
    const signal: AgentSignal = {
      id: r.id,
      fromAgent: r.from_agent,
      toAgent: r.to_agent,
      signalType: r.signal_type as SignalType,
      stockCode: r.stock_code,
      payload: (() => {
        try { return JSON.parse(r.payload) as SignalPayload; } catch { return {}; }
      })(),
      status: r.status as "unread" | "read",
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    };

    if (hasValidationColumns) {
      if (r.confidence_score !== undefined) signal.confidence_score = r.confidence_score;
      if (r.validated_at   !== undefined) signal.validated_at   = r.validated_at;
    }

    return signal;
  });
}

// ── migrateUnknownStockCodes ──────────────────────────────────────────────────

/**
 * Bug 1313: One-time migration helper — converts pre-1334 sentinel rows.
 *
 * Before task 1334, agents posted `stockCode: "unknown"` for market-wide signals.
 * Task 1334 added application-level normalization in postSignal(), but existing DB
 * rows still carry the literal string "unknown".
 *
 * This function NULLs those rows so getChainFindings() (which now filters
 * `AND stock_code IS NOT NULL`) correctly excludes them from chain grouping.
 *
 * Safe to run multiple times (idempotent). Call once at job startup or via a
 * dedicated migration script before intelligence-cycle-job begins.
 *
 * @param db - Active bun:sqlite Database connection
 */
export function migrateUnknownStockCodes(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      db.prepare(
        `UPDATE agent_signals SET stock_code = NULL WHERE stock_code = 'unknown'`,
      ).run();
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

// ── postSignalWithCriticGate ──────────────────────────────────────────────────

/** Default timeout for the TNB critic gate in milliseconds. */
export const CRITIC_TIMEOUT_MS = 20_000;

/**
 * Options for postSignalWithCriticGate.
 * Primarily used for testing — allows injecting a custom scorer and timeout.
 */
export interface PostSignalWithGateOptions {
  /**
   * Number of retries already attempted. Pass 1 to force write-through regardless
   * of score (max 1 retry enforced by the gate).
   * Default: 0
   */
  retryCount?: number;
  /**
   * Injectable scorer function (for testing). Defaults to scoreWithTnbCritic.
   * Must return a Promise<CriticResult>.
   */
  _scoreFn?: (input: CriticInput) => Promise<CriticResult> | CriticResult;
  /**
   * Timeout in milliseconds before gate fails-soft. Defaults to CRITIC_TIMEOUT_MS (20s).
   */
  _timeoutMs?: number;
}

/** Return type for postSignalWithCriticGate. */
export interface PostSignalGateResult {
  /**
   * The newly inserted signal ID (positive integer).
   * Returns -1 when the gate rejected the signal on first attempt (retry pending).
   */
  signalId: number;
  /**
   * The CriticResult produced by the gate.
   * null when the gate was bypassed (timeout/error) — signal passes through unscored.
   */
  criticResult: CriticResult | null;
}

/**
 * TNB Critic Gate wrapper for postSignal().
 *
 * Runs the TNB critic scorer before DB write. Implements retry protocol and
 * fail-soft timeout as specified in the architecture brief.
 *
 * Protocol:
 *   - score >= 0.6 → write, retry_count=0
 *   - score < 0.6 AND retryCount=0 → return signalId=-1 with critique (do NOT write)
 *   - score < 0.6 AND retryCount=1 → write regardless (fail-soft), retry_count=1
 *   - timeout (20s) or error → write with critic_score=null, retry_count=0
 *
 * @param db      - Active bun:sqlite Database connection
 * @param input   - Signal parameters (same as PostSignalInput)
 * @param opts    - Optional: retryCount, _scoreFn (testing), _timeoutMs (testing)
 * @returns       PostSignalGateResult with signalId and criticResult
 */
export async function postSignalWithCriticGate(
  db: Database,
  input: PostSignalInput,
  opts: PostSignalWithGateOptions = {},
): Promise<PostSignalGateResult> {
  const retryCount = opts.retryCount ?? 0;
  const timeoutMs = opts._timeoutMs ?? CRITIC_TIMEOUT_MS;
  const scoreFn = opts._scoreFn ?? ((ci: CriticInput) => scoreWithTnbCritic(ci));

  // Build CriticInput from PostSignalInput
  const criticInput: CriticInput = {
    fromAgent: input.fromAgent,
    signalType: input.signalType,
    stockCode: input.stockCode ?? null,
    payload: input.payload as CriticInput["payload"],
    findingData: (input.findingData ?? {}) as Record<string, unknown>,
  };

  // Run critic gate with timeout — fail-soft on timeout or error
  let criticResult: CriticResult;
  let timedOut = false;
  try {
    const timeoutPromise = new Promise<CriticResult>((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          pass: true, // fail-soft: let signal through
          score: -1, // sentinel: -1 = timeout, never persisted as-is
          notes: "critic gate timeout — signal passed through unscored",
          timedOut: true,
        });
      }, timeoutMs);
      // Prevent timer from blocking process exit in tests
      if (typeof timer === "object" && "unref" in timer) {
        (timer as NodeJS.Timeout).unref();
      }
    });

    criticResult = await Promise.race([
      Promise.resolve(scoreFn(criticInput)),
      timeoutPromise,
    ]);

    if (criticResult.timedOut) {
      timedOut = true;
    }
  } catch (err) {
    // Any unexpected error in critic = fail-soft
    criticResult = {
      pass: true,
      score: -1,
      notes: `critic gate error: ${err instanceof Error ? err.message : String(err)}`,
      timedOut: true,
    };
    timedOut = true;
  }

  // Timeout path: write signal with critic_score=null
  if (timedOut) {
    const signalId = postSignal(db, {
      ...input,
      critic_score: null,
      critic_notes: criticResult.notes,
      retry_count: retryCount,
    });
    return { signalId, criticResult: null };
  }

  // Pass path: score >= threshold → write immediately
  if (criticResult.pass) {
    const signalId = postSignal(db, {
      ...input,
      critic_score: criticResult.score,
      critic_notes: criticResult.notes,
      retry_count: retryCount,
    });
    return { signalId, criticResult };
  }

  // Fail path, first attempt (retryCount=0): return critique, do NOT write
  if (retryCount === 0) {
    return { signalId: -1, criticResult };
  }

  // Fail path, after retry (retryCount=1): write regardless — fail-soft
  const signalId = postSignal(db, {
    ...input,
    critic_score: criticResult.score,
    critic_notes: criticResult.notes,
    retry_count: 1,
  });
  return { signalId, criticResult };
}

// Re-export scorer types for callers that import from this module
export type { CriticInput, CriticResult };
