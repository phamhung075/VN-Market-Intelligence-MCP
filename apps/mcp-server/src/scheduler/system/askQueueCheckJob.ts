/**
 * askQueueCheckJob — Task 1074
 *
 * Cron: every 12 minutes (cron expression: star-slash-12 star star star star)
 * Purpose: detect pending /ask questions and signal the QA Responder agent
 *          (07-qa-responder) to process them.
 *
 * Contract:
 *   - The server does NOT answer the question itself.
 *   - A single `agent_signals` row is posted when pending questions are found.
 *   - No MCP tool calls, no HTTP fetch — pure SQLite read + write.
 *   - Deduplication of repeated signals is the responsibility of the consumer
 *     (agentSignalStore), not this cron.
 *
 * @module scheduler/askQueueCheckJob
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { getPendingAskQuestions } from "../../infrastructure/db/askQueueStore.js";
import { postSignal } from "../../infrastructure/db/agentSignalStore.js";
import { spawnQaResponder } from "../../infrastructure/agents/qaResponderSpawner.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AskQueueCheckResult {
  /** Whether a signal was posted to 07-qa-responder. */
  signaled: boolean;
  /** Number of pending questions found. */
  count: number;
}

// ── runAskQueueCheck ─────────────────────────────────────────────────────────

/**
 * Check the ask_queue for pending questions and signal the QA Responder agent.
 *
 * - If no pending questions: returns `{ signaled: false, count: 0 }` immediately.
 * - If pending questions exist: posts one `agent_signals` row to '07-qa-responder'
 *   with signal_type='pending_questions' and payload `{ count }`, then returns
 *   `{ signaled: true, count }`.
 *
 * Observability: fires a `recordJobRun` write as a detached promise so this
 * function stays synchronous (backward compatible with the jobs.ts call site).
 *
 * @param db - Optional Database connection (defaults to singleton). Inject in tests.
 */
export function runAskQueueCheck(db?: Database): AskQueueCheckResult {
  const conn = db ?? getDb();

  // Core logic — synchronous, result captured for both return value and observability
  let result: AskQueueCheckResult;

  try {
    const pending = getPendingAskQuestions(conn);

    if (pending.length === 0) {
      result = { signaled: false, count: 0 };
    } else {
      const count = pending.length;
      // Post signal to agent_signals so 07-qa-responder can pick it up.
      // FIX-SIGNAL-CONFIDENCE-DEFAULT-50: derive confidence from queue depth.
      // 1 pending = 10%, 5 = 50%, 10+ = 100% — honest signal: more pending questions
      // means higher confidence this job needs attention. Capped at 100.
      const pendingConfidenceScore = Math.min(100, count * 10);
      postSignal(conn, {
        fromAgent: "askQueueCheckJob",
        toAgent: "07-qa-responder",
        signalType: "pending_questions",
        payload: { count },
        ttlMinutes: 15,
        confidence_score: pendingConfidenceScore,
      });
      // Also attempt local spawn — fire-and-forget, 0 tokens if already running.
      spawnQaResponder(conn);
      result = { signaled: true, count };
    }

    // Observability: fire-and-forget — does not block the sync return.
    // recordJobRun never re-throws so this detached promise is safe to ignore.
    void recordJobRun(conn, "askQueueCheckJob", async () => {
      return { rowsWritten: result.count };
    });

    return result;
  } catch (err) {
    // Observability: record error row detached, then re-throw so jobs.ts can log it.
    void Promise.resolve().then(() =>
      recordJobRun(conn, "askQueueCheckJob", async () => {
        throw err;
      })
    );
    throw err;
  }
}
