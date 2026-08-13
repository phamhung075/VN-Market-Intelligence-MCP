/**
 * TNB Critic Gate wrapper for postSignal().
 *
 * Runs the TNB critic scorer before DB write. Protocol:
 *   - score >= 0.6 → write, retry_count=0
 *   - score < 0.6 AND retryCount=0 → return signalId=-1 with critique (do NOT write)
 *   - score < 0.6 AND retryCount=1 → write regardless (fail-soft), retry_count=1
 *   - timeout (20s) or error → write with critic_score=null, retry_count=0
 */

import type { Database } from "bun:sqlite";
import { scoreWithTnbCritic, type CriticInput, type CriticResult } from "../../../domain/services/tnbCriticScorer.js";
import { postSignal } from "./postSignal.js";
import type { PostSignalInput } from "./postSignalTypes.js";
import type { PostSignalGateResult, PostSignalWithGateOptions } from "./criticGateTypes.js";

/** Default timeout for the TNB critic gate in milliseconds. */
export const CRITIC_TIMEOUT_MS = 20_000;

export async function postSignalWithCriticGate(
  db: Database,
  input: PostSignalInput,
  opts: PostSignalWithGateOptions = {},
): Promise<PostSignalGateResult> {
  const retryCount = opts.retryCount ?? 0;
  const timeoutMs = opts._timeoutMs ?? CRITIC_TIMEOUT_MS;
  const scoreFn = opts._scoreFn ?? ((ci: CriticInput) => scoreWithTnbCritic(ci));

  const criticInput: CriticInput = {
    fromAgent: input.fromAgent,
    signalType: input.signalType,
    stockCode: input.stockCode ?? null,
    payload: input.payload as CriticInput["payload"],
    findingData: (input.findingData ?? {}) as Record<string, unknown>,
  };

  let criticResult: CriticResult;
  let timedOut = false;
  try {
    const timeoutPromise = new Promise<CriticResult>((resolve) => {
      const timer = setTimeout(() => {
        resolve({ pass: true, score: -1, notes: "critic gate timeout — signal passed through unscored", timedOut: true });
      }, timeoutMs);
      if (typeof timer === "object" && "unref" in timer) (timer as NodeJS.Timeout).unref();
    });

    criticResult = await Promise.race([Promise.resolve(scoreFn(criticInput)), timeoutPromise]);
    if (criticResult.timedOut) timedOut = true;
  } catch (err) {
    criticResult = {
      pass: true, score: -1,
      notes: `critic gate error: ${err instanceof Error ? err.message : String(err)}`,
      timedOut: true,
    };
    timedOut = true;
  }

  if (timedOut) {
    const signalId = postSignal(db, { ...input, critic_score: null, critic_notes: criticResult.notes, retry_count: retryCount });
    return { signalId, criticResult: null };
  }

  if (criticResult.pass) {
    const signalId = postSignal(db, { ...input, critic_score: criticResult.score, critic_notes: criticResult.notes, retry_count: retryCount });
    return { signalId, criticResult };
  }

  if (retryCount === 0) return { signalId: -1, criticResult };

  const signalId = postSignal(db, { ...input, critic_score: criticResult.score, critic_notes: criticResult.notes, retry_count: 1 });
  return { signalId, criticResult };
}

// Re-export scorer types for callers that import from this module
export type { CriticInput, CriticResult };
