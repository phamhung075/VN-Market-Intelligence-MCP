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
 * Task 306 — buildEnrichedAnswer:
 *   Replaces the plain RAG formatter with an enriched Vietnamese answer that
 *   includes live price, most recent alert, and Kinh Dich hexagram state for
 *   any watchlist ticker mentioned in the payload. The `why:TICKER` prefix
 *   format is detected and handled specially.
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
// Ticker extraction helpers (Task 306)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regex to find uppercase 2–4 letter sequences in text.
 * Applied after converting payload to uppercase.
 */
const TICKER_RE = /\b([A-Z]{2,4})\b/g;

/**
 * Extract watchlist ticker codes from a payload string.
 *
 * Handles both plain-text asks ("VNM hom nay the nao?") and
 * why: prefix format ("why:VCB"). Filters against the watchlist table
 * to avoid false positives. Returns up to 3 codes.
 *
 * @param db      - SQLite database
 * @param payload - Raw user payload string
 * @returns       - Ordered unique ticker codes present in watchlist (up to 3)
 */
function extractWatchlistTickers(db: Database, payload: string): string[] {
  // Strip "why:" prefix (case-insensitive) before extraction
  const cleanPayload = payload.replace(/^why:/i, "");

  // Collect candidate uppercase codes from the uppercased payload
  const upperPayload = cleanPayload.toUpperCase();
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  TICKER_RE.lastIndex = 0;
  while ((m = TICKER_RE.exec(upperPayload)) !== null) {
    if (m[1]) candidates.push(m[1]);
  }

  if (candidates.length === 0) return [];

  // Filter against watchlist table (parameterized placeholders)
  try {
    const placeholders = candidates.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT code FROM watchlist WHERE code IN (${placeholders})`)
      .all(...candidates) as Array<{ code: string }>;
    // Preserve order of first appearance, limit to 3
    const found = new Set(rows.map((r) => r.code));
    return candidates.filter((c) => found.has(c)).slice(0, 3);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Market data helpers (Task 306)
// ─────────────────────────────────────────────────────────────────────────────

interface PriceRow {
  price: number | null;
  change_pct: number | null;
}

function getLatestPrice(db: Database, code: string): PriceRow | null {
  try {
    return db
      .prepare(
        `SELECT price, change_pct FROM market_prices
         WHERE code = ?
         ORDER BY fetched_at DESC LIMIT 1`,
      )
      .get(code) as PriceRow | null;
  } catch {
    return null;
  }
}

interface AlertRow {
  message: string | null;
  severity: string | null;
  triggered_at: string | null;
}

function getMostRecentAlert(db: Database, code: string): AlertRow | null {
  try {
    // alerts.affected_actions_json stores JSON like [{"code":"VNM"}]
    const rows = db
      .prepare(
        `SELECT message, severity, triggered_at, affected_actions_json
         FROM alerts
         WHERE affected_actions_json LIKE ?
         ORDER BY triggered_at DESC LIMIT 1`,
      )
      .all(`%"${code}"%`) as Array<{
        message: string | null;
        severity: string | null;
        triggered_at: string | null;
        affected_actions_json: string | null;
      }>;

    const row = rows[0];
    if (!row) return null;
    return { message: row.message, severity: row.severity, triggered_at: row.triggered_at };
  } catch {
    return null;
  }
}

interface HexagramRow {
  hexagramNumber: number;
  tradingSignal: string | null;
  confidence: number | null;
}

function getLatestHexagram(db: Database, code: string): HexagramRow | null {
  try {
    const row = db
      .prepare(
        `SELECT hexagram_number, trading_signal, confidence
         FROM kinhdich_readings
         WHERE stock_code = ?
         ORDER BY timestamp DESC LIMIT 1`,
      )
      .get(code) as {
        hexagram_number: number;
        trading_signal: string | null;
        confidence: number | null;
      } | null;

    if (!row) return null;
    return {
      hexagramNumber: row.hexagram_number,
      tradingSignal: row.trading_signal,
      confidence: row.confidence,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vietnamese answer composer (Task 306)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format price as Vietnamese number string (1234567 → "1.234.567").
 */
function formatVnPrice(price: number): string {
  return Math.round(price).toLocaleString("vi-VN");
}

/**
 * Build one ticker's enrichment block in Vietnamese.
 * Any missing sub-section is omitted gracefully (no null errors).
 */
function buildTickerBlock(db: Database, code: string): string {
  const lines: string[] = [];
  lines.push(`--- ${code} ---`);

  // Price section
  const price = getLatestPrice(db, code);
  if (price && price.price != null) {
    const changePct = price.change_pct ?? 0;
    const direction = changePct >= 0 ? "tang" : "giam";
    const pctAbs = Math.abs(changePct).toFixed(2);
    lines.push(`Gia hien tai: ${formatVnPrice(price.price)} VND (${direction} ${pctAbs}%)`);
  } else {
    lines.push(`Chua co du lieu gia cho ma ${code}.`);
  }

  // Hexagram section
  const hex = getLatestHexagram(db, code);
  if (hex) {
    const signal = hex.tradingSignal ?? "Chua ro";
    const conf = hex.confidence != null ? (hex.confidence * 100).toFixed(0) + "%" : "N/A";
    lines.push(`Kinh Dich — Que so ${hex.hexagramNumber}: ${signal} (do tin cay: ${conf})`);
  } else {
    lines.push(`Chua co du lieu Kinh Dich cho ma ${code}.`);
  }

  // Alert section
  const alert = getMostRecentAlert(db, code);
  if (alert && alert.message) {
    lines.push(`Canh bao gan nhat: ${alert.message}`);
  }

  return lines.join("\n");
}

/**
 * Build an enriched Vietnamese answer for a user request.
 *
 * For payloads that contain known watchlist tickers (either inline or via
 * the `why:TICKER` prefix), injects live price, hexagram, and alert data.
 * Falls back to pure RAG results when no watchlist ticker is found.
 *
 * @param db         - SQLite database
 * @param payload    - Raw user payload string
 * @param ragResults - RAG search results from searchContext
 * @returns          - Vietnamese answer string
 */
async function buildEnrichedAnswer(
  db: Database,
  payload: string,
  ragResults: SearchResult[],
): Promise<string> {
  const isWhyPrefix = /^why:/i.test(payload);

  // Determine the question text for the header
  let questionDisplay: string;
  if (isWhyPrefix) {
    const ticker = payload.replace(/^why:/i, "").trim().toUpperCase();
    questionDisplay = `Tai sao ${ticker} bien dong hom nay?`;
  } else {
    questionDisplay = payload;
  }

  // Extract watchlist tickers from the payload
  const tickers = extractWatchlistTickers(db, payload);

  const parts: string[] = [];
  parts.push(`Phan tich cho cau hoi: "${questionDisplay}"\n`);

  if (tickers.length > 0) {
    // Enriched path: one block per ticker
    for (const code of tickers) {
      parts.push(buildTickerBlock(db, code));
    }
  }

  // Append RAG context if available
  if (ragResults.length > 0) {
    parts.push("\nNguon tham khao:");
    for (const [i, r] of ragResults.entries()) {
      parts.push(`${i + 1}. [${r.level}] ${r.title} — ${r.summary.slice(0, 120)}`);
    }
  } else if (tickers.length === 0) {
    // No tickers and no RAG → generic fallback
    parts.push(
      "Khong tim thay du lieu lien quan cho cau hoi nay. " +
        "Vui long neu cu the ma co phieu ban muon phan tich.",
    );
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main job function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process pending user requests.
 *
 * Reads up to 3 pending requests from `user_requests`, claims each with a
 * CAS UPDATE (status='pending' → status='processing'), performs RAG search,
 * builds an enriched Vietnamese answer via buildEnrichedAnswer(), sends it
 * to Telegram Chat Channel, and marks the request done.
 *
 * Task 306: If the Telegram send throws, the row is reset to 'pending' so
 * the next cycle will retry. (Prior behaviour marked it 'done' even on error.)
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
      // Determine the RAG query — for why: payloads, use the ticker question
      const ragQuery = /^why:/i.test(req.payload)
        ? `Tai sao ${req.payload.replace(/^why:/i, "").trim().toUpperCase()} bien dong hom nay?`
        : req.payload;

      // RAG search for relevant context
      const ragResults = await searchContextFn(ragQuery);

      // Build enriched Vietnamese answer (Task 306)
      const answer = await buildEnrichedAnswer(database, req.payload, ragResults);

      // Send to Chat Channel — if this throws, leave row pending (AC-306)
      await sendTelegramFn(answer);

      // Mark done only after confirmed send
      database
        .prepare(
          `UPDATE user_requests
           SET status = 'done', response = ?, answered_at = datetime('now')
           WHERE id = ?`,
        )
        .run(answer, req.id);

      processed++;

      logger.debug("[user-request-check] answered request", {
        requestId: req.id,
        ragResults: ragResults.length,
      });
    } catch (reqErr) {
      // Per-request error: reset row to 'pending' so the next cycle retries.
      // AC-306: "If sendTelegramMessage throws, the row remains status='pending'."
      errors++;
      const errMsg = reqErr instanceof Error ? reqErr.message : String(reqErr);

      logger.warn("[user-request-check] failed to answer request — resetting to pending", {
        requestId: req.id,
        error: errMsg,
      });

      try {
        database
          .prepare(
            `UPDATE user_requests
             SET status = 'pending'
             WHERE id = ?`,
          )
          .run(req.id);
      } catch {
        // best-effort — if even the reset fails, log and move on
      }
    }
  }

  logger.info("[user-request-check] run complete", { processed, skipped, errors });

  return { processed, skipped, errors };
}
