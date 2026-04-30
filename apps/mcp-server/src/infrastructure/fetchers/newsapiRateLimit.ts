/**
 * Infrastructure — NewsAPI Daily Rate-Limit Guard
 *
 * Persists a daily usage counter to a JSON file so the 100 req/day free-tier
 * limit survives container restarts.
 *
 * Rules:
 *   - Cap at 90 requests/day (10-req safety buffer below the 100-req free tier)
 *   - Enforce a 30-minute minimum interval between calls (max 48 calls/day)
 *   - Date rollover (new calendar day) resets the counter to 0
 *
 * The default file path is /app/data/newsapi-usage.json; it can be overridden
 * for tests via the `usageFilePath` argument.
 *
 * Layer: infrastructure/fetchers — may use fs; must not import domain/.
 *
 * @module infrastructure/fetchers/newsapiRateLimit
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Hard cap — stop calls at 90 to leave a 10-request safety buffer. */
const DAILY_CAP = 90;

/** Minimum milliseconds between any two NewsAPI calls (30 minutes). */
const MIN_INTERVAL_MS = 30 * 60 * 1000;

/** Default on-disk path inside the Docker container data volume. */
const DEFAULT_USAGE_FILE = "/app/data/newsapi-usage.json";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Persisted usage record. */
export interface NewsApiUsage {
  /** Calendar date as "YYYY-MM-DD" (UTC). */
  date: string;
  /** Number of API calls made on `date`. */
  count: number;
  /** ISO timestamp of the last successful API call, or null if never called today. */
  lastCallAt: string | null;
}

/** Result returned by checkNewsApiLimit(). */
export interface NewsApiLimitCheck {
  /** True if a call is permitted; false if capped or too soon. */
  allowed: boolean;
  /** Current call count for today (after any date-rollover reset). */
  count: number;
  /** Human-readable reason when allowed=false. */
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level state (test-reset via resetNewsApiUsageForTest)
// ─────────────────────────────────────────────────────────────────────────────

/** Active usage file path — overridden per test run via resetNewsApiUsageForTest(). */
let _activeUsageFile: string = DEFAULT_USAGE_FILE;

/**
 * Test-only helper: resets the active file path to the given tmp path so
 * each test gets a clean slate without touching /app/data.
 *
 * @internal Do not call from production code.
 */
export function resetNewsApiUsageForTest(filePath: string): void {
  _activeUsageFile = filePath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the usage JSON file. Returns a zeroed record for today when the file
 * is missing, unreadable, or has an unexpected shape.
 */
function readUsage(today: string, filePath: string): NewsApiUsage {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NewsApiUsage>;
    if (
      typeof parsed.date === "string" &&
      typeof parsed.count === "number"
    ) {
      // Date rollover: treat a stale file as a fresh day
      if (parsed.date !== today) {
        return { date: today, count: 0, lastCallAt: null };
      }
      return {
        date: parsed.date,
        count: parsed.count,
        lastCallAt: parsed.lastCallAt ?? null,
      };
    }
  } catch {
    // File missing or corrupt — start fresh
  }
  return { date: today, count: 0, lastCallAt: null };
}

/**
 * Writes the usage record to disk atomically (write to a .tmp file then rename).
 * Fails silently — a write failure must never abort a news fetch.
 */
function writeUsage(usage: NewsApiUsage, filePath: string): void {
  try {
    // Ensure parent directory exists (relevant on first run / new containers)
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(usage), "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    logger.warn("[newsapiRateLimit] failed to persist usage file", {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether a NewsAPI call is permitted right now.
 *
 * Enforces two independent gates:
 *   1. Daily cap: count >= DAILY_CAP (90) → blocked
 *   2. Minimum interval: last call was < 30 min ago → blocked
 *
 * The daily-cap check takes precedence (checked first).
 *
 * @param today    - Current date as "YYYY-MM-DD" (UTC).
 * @param filePath - Override for the usage JSON path (defaults to module active file).
 * @returns        - { allowed, count, reason? }
 */
export function checkNewsApiLimit(
  today: string,
  filePath: string = _activeUsageFile,
): NewsApiLimitCheck {
  const usage = readUsage(today, filePath);

  // Gate 1: Daily cap
  if (usage.count >= DAILY_CAP) {
    logger.warn("[newsapiRateLimit] daily limit reached", {
      count: usage.count,
      cap: DAILY_CAP,
      date: today,
    });
    return {
      allowed: false,
      count: usage.count,
      reason: `NewsAPI daily limit reached (${usage.count}/${DAILY_CAP}), skipping until tomorrow`,
    };
  }

  // Gate 2: Minimum interval
  if (usage.lastCallAt !== null) {
    const elapsedMs = Date.now() - new Date(usage.lastCallAt).getTime();
    if (elapsedMs < MIN_INTERVAL_MS) {
      const waitMinutes = Math.ceil((MIN_INTERVAL_MS - elapsedMs) / 60_000);
      logger.debug("[newsapiRateLimit] interval not elapsed", {
        elapsedMs,
        minIntervalMs: MIN_INTERVAL_MS,
        waitMinutes,
      });
      return {
        allowed: false,
        count: usage.count,
        reason: `NewsAPI interval not elapsed — wait ${waitMinutes} more minute(s)`,
      };
    }
  }

  return { allowed: true, count: usage.count };
}

/**
 * Records that a NewsAPI call was made right now.
 *
 * - If the stored date differs from `today`, resets count to 1 (new day).
 * - Otherwise increments the existing count.
 * - Updates `lastCallAt` to the current ISO timestamp.
 * - Persists to disk.
 *
 * @param today    - Current date as "YYYY-MM-DD" (UTC).
 * @param filePath - Override for the usage JSON path.
 */
export function incrementNewsApiCount(
  today: string,
  filePath: string = _activeUsageFile,
): void {
  const existing = readUsage(today, filePath);

  const updated: NewsApiUsage = {
    date: today,
    // readUsage() already handles rollover (returns count=0 for new day),
    // so we just increment what readUsage returned.
    count: existing.count + 1,
    lastCallAt: new Date().toISOString(),
  };

  writeUsage(updated, filePath);

  logger.debug("[newsapiRateLimit] incremented daily count", {
    date: today,
    count: updated.count,
    cap: DAILY_CAP,
  });
}
