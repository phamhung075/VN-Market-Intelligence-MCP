/**
 * postSignal() — insert a new agent signal into agent_signals and return its ID.
 *
 * Supports both the original signal bus fields and the enrichment chain
 * extension fields (cycleId, findingData, causalRef, chainDepth).
 *
 * FACTORY-INFRA-split-agentSignalStore: the 6-deep nested column-existence
 * cascade (~270L, 10 hand-written near-identical INSERTs) that used to live
 * here now delegates to `detectSignalColumns()` (memoized probes) +
 * `buildSignalInsert()` (single dynamic builder) — see agentSignals/columnDetect.ts
 * and agentSignals/insertBuilder.ts.
 */

import type { Database } from "bun:sqlite";
import { detectSignalColumns } from "./columnDetect.js";
import { buildSignalInsert, type SignalInsertValues } from "./insertBuilder.js";
import { expiresAt, resolveInsertId } from "./helpers.js";
import { isDuplicateWithinWindow } from "./dedupGuard.js";
import { applyEarningsConflictWarning } from "./earningsConflictGuard.js";
import type { PostSignalInput } from "./postSignalTypes.js";
import { seedSignalOutcome } from "../signalOutcomeStore.js";

/**
 * @param db    - Active bun:sqlite Database connection
 * @param input - Signal parameters including TTL
 * @returns     The newly created row ID (positive integer), or -1 if suppressed by a dedup guard
 */
export function postSignal(db: Database, input: PostSignalInput): number {
  const signalId = postSignalInner(db, input);
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
function postSignalInner(db: Database, input: PostSignalInput): number {
  const {
    fromAgent, toAgent, signalType, stockCode = null, payload, ttlMinutes, cycleId,
    findingData = {}, causalRef = null, chainDepth = 0, causalRootId = null, causalRootLabel = null,
    signalClass = null, confidence_score = null, validated_at, newsSentiment = null,
    kinhDichConfidence = null, agentSignalsMajority = null, dedupWindowMinutes: rawDedupWindowMinutes,
    critic_score = undefined, critic_notes = undefined, retry_count = 0,
  } = input;

  // Task 1862g: urgent_news defaults to 240min (4h); all other types default to 0 (disabled).
  const dedupWindowMinutes =
    rawDedupWindowMinutes !== undefined ? rawDedupWindowMinutes : signalType === "urgent_news" ? 240 : 0;

  // 1334: "unknown" / "" / undefined all mean "no specific stock" → NULL in agent_signals.
  const resolvedStockCode: string | null = !stockCode || stockCode === "unknown" ? null : stockCode;

  const flags = detectSignalColumns(db);
  const findingDataObj = findingData as Record<string, unknown>;

  if (
    isDuplicateWithinWindow({
      db, dedupWindowMinutes, resolvedStockCode, signalType,
      findingData: findingDataObj,
      hasCreatedAtColumn: flags.hasCreatedAtColumn,
    })
  ) {
    return -1;
  }

  applyEarningsConflictWarning(db, signalType, resolvedStockCode, findingDataObj, payload as Record<string, unknown>);

  const now = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const values: SignalInsertValues = {
    fromAgent, toAgent, signalType, stockCode: resolvedStockCode,
    payloadJson: JSON.stringify(payload),
    createdAt: now,
    expiresAt: expiresAt(ttlMinutes ?? 120),
    cycleId: cycleId ?? null,
    findingDataJson: JSON.stringify(findingData),
    causalRef, chainDepth, causalRootId, causalRootLabel, signalClass,
    confidenceScore: confidence_score,
    validatedAt: validated_at ?? now,
    newsSentiment: newsSentiment ?? null,
    kinhDichConfidence: kinhDichConfidence ?? null,
    agentSignalsMajority: agentSignalsMajority ?? null,
    criticScore: critic_score !== undefined ? critic_score : null,
    criticNotes: critic_notes !== undefined ? critic_notes : null,
    retryCount: retry_count,
  };

  const { sql, binds } = buildSignalInsert(flags, values);
  const result = db.prepare(sql).run(...binds);
  return resolveInsertId(result);
}
