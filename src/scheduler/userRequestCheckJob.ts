/**
 * User Request Check Job — Task 246 (interface/scheduler layer)
 *
 * Standalone lightweight job that processes pending /ask and /why user
 * requests every 15 minutes, independent of the intelligence cycle.
 *
 * Problem solved:
 *   The intelligence cycle runs step F only when its own tick fires. Off-hours,
 *   the cycle is throttled to once every 60 minutes. A user sending /ask at
 *   14:00 CET could wait up to 60 minutes for a response. This job guarantees
 *   a maximum 15-minute wait regardless of market hours.
 *
 * Double-processing guard:
 *   Uses a CAS (compare-and-swap) UPDATE … WHERE status='pending' followed by
 *   changes() check before doing any work. If another process (e.g. the
 *   intelligence cycle step F) has already claimed the row, changes()=0 and
 *   we skip it safely.
 *
 * Layer: interface/scheduler — imports from infrastructure and domain only.
 * Must not import directly from domain/ business logic.
 */

import { logger } from "../infrastructure/logger.js";
import type { Database } from "bun:sqlite";
import type { SearchResult } from "../infrastructure/rag/retriever.js";

// ─────────────────────────────────────────────────────────────────────────────
// Injectable deps for testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injectable sub-functions for unit testing.
 *
 * @property searchContextFn  - Override for RAG semantic search
 * @property sendTelegramFn   - Override for Telegram message delivery
 */
export interface UserRequestCheckDeps {
  searchContextFn?: (query: string) => Promise<SearchResult[]>;
  sendTelegramFn?: (message: string) => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summary of one user request check run.
 *
 * @property processed - Number of requests successfully answered
 * @property skipped   - Number of requests skipped (race condition lost)
 * @property errors    - Number of per-request processing errors
 */
export interface UserRequestCheckResult {
  processed: number;
  skipped: number;
  errors: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default production implementations
// ─────────────────────────────────────────────────────────────────────────────

async function defaultSearchContext(query: string): Promise<SearchResult[]> {
  const { searchContext } = await import("../infrastructure/rag/retriever.js");
  return searchContext(query, { k: 5 });
}

async function defaultSendTelegram(message: string): Promise<boolean> {
  const { sendTelegramMessage } = await import("../infrastructure/notifiers/telegram.js");
  return sendTelegramMessage(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main job function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process pending user requests.
 *
 * Reads up to 3 pending requests from `user_requests`, claims each with a
 * CAS UPDATE (status='pending' → status='processing'), performs RAG search,
 * formats a response, sends it to Telegram, and marks the request done.
 *
 * If the CAS claim fails (changes()=0), the request is already being handled
 * by the intelligence cycle — skip it silently.
 *
 * @param db   - Optional SQLite database (production uses getDb(); tests inject :memory:)
 * @param deps - Optional injectable functions (for testing)
 * @returns    - Summary of processed / skipped / errored requests
 */
export async function runUserRequestCheck(
  db?: Database,
  deps: UserRequestCheckDeps = {},
): Promise<UserRequestCheckResult> {
  const searchContextFn = deps.searchContextFn ?? defaultSearchContext;
  const sendTelegramFn = deps.sendTelegramFn ?? defaultSendTelegram;

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Resolve database — in tests, callers pass an in-memory db directly
  let database: Database;
  if (db) {
    database = db;
  } else {
    const { getDb } = await import("../infrastructure/db/schema.js");
    database = getDb();
  }

  // Read candidate pending requests (status filter in SELECT for efficiency)
  const { getPendingRequests } = await import("../infrastructure/db/userRequestStore.js");
  const candidates = getPendingRequests(database, 3);

  if (candidates.length === 0) {
    logger.debug("[user-request-check] no pending requests — returning");
    return { processed, skipped, errors };
  }

  logger.debug("[user-request-check] processing requests", { count: candidates.length });

  for (const req of candidates) {
    // ── CAS claim: UPDATE … WHERE status='pending' ──────────────────────────
    // If another process already claimed this row, changes()=0 → skip.
    const claimResult = database
      .prepare(
        `UPDATE user_requests
         SET status = 'processing'
         WHERE id = ? AND status = 'pending'`,
      )
      .run(req.id);

    if (claimResult.changes === 0) {
      // Race condition: intelligence cycle or another invocation claimed it
      skipped++;
      logger.debug("[user-request-check] skipped — already claimed", {
        requestId: req.id,
      });
      continue;
    }

    // ── Process the claimed request ──────────────────────────────────────────
    try {
      // RAG search for relevant context
      const results = await searchContextFn(req.payload);

      // Build answer from RAG results
      const answer =
        results.length > 0
          ? results
              .map(
                (r, i) =>
                  `${i + 1}. [${r.level}] ${r.title} — ${r.summary.slice(0, 120)}`,
              )
              .join("\n")
          : "Khong tim thay du lieu lien quan. Thu lai voi cau hoi cu the hon.";

      const response = `Tra loi cho: "${req.payload}"\n\n${answer}`;

      // Send to Chat Channel
      await sendTelegramFn(response);

      // Mark done
      database
        .prepare(
          `UPDATE user_requests
           SET status = 'done', response = ?, answered_at = datetime('now')
           WHERE id = ?`,
        )
        .run(response, req.id);

      processed++;

      logger.debug("[user-request-check] answered request", {
        requestId: req.id,
        ragResults: results.length,
      });
    } catch (reqErr) {
      // Per-request error: reset to done with an error message so we don't
      // retry an unanswerable question indefinitely.
      errors++;
      const errMsg = reqErr instanceof Error ? reqErr.message : String(reqErr);
      const errResponse = `Loi khi xu ly cau hoi: ${errMsg}`;

      try {
        database
          .prepare(
            `UPDATE user_requests
             SET status = 'done', response = ?, answered_at = datetime('now')
             WHERE id = ?`,
          )
          .run(errResponse, req.id);
      } catch {
        // best-effort — if even the error update fails, log and move on
      }

      logger.warn("[user-request-check] failed to answer request", {
        requestId: req.id,
        error: errMsg,
      });
    }
  }

  logger.info("[user-request-check] run complete", { processed, skipped, errors });

  return { processed, skipped, errors };
}
