Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1797 — NewsAPI Daily Rate-Limit Guard
 *
 * Tests for:
 *   - Daily counter persists across calls via JSON file
 *   - Cap at 90 requests (10-req safety buffer below 100-req free tier)
 *   - Date rollover resets counter to 0
 *   - Minimum 30-min interval between calls
 *   - Successful request increments counter
 *   - Returns [] when limit reached (no network call)
 *   - Returns [] when interval not elapsed
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// We import the guard module functions; the file path is injected via env.
// This keeps the test hermetic (no /app/data writes).
import {
  checkNewsApiLimit,
  incrementNewsApiCount,
  resetNewsApiUsageForTest,
  type NewsApiUsage,
} from "../infrastructure/fetchers/newsapiRateLimit.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "newsapi-test-"));
const USAGE_FILE = path.join(TMP_DIR, "newsapi-usage.json");

function writeUsage(usage: NewsApiUsage): void {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage), "utf-8");
}

function readUsage(): NewsApiUsage {
  return JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8")) as NewsApiUsage;
}

const TODAY = "2026-04-30";
const YESTERDAY = "2026-04-29";

beforeEach(() => {
  // Clean slate for each test
  if (fs.existsSync(USAGE_FILE)) fs.unlinkSync(USAGE_FILE);
  resetNewsApiUsageForTest(USAGE_FILE);
});

afterEach(() => {
  if (fs.existsSync(USAGE_FILE)) fs.unlinkSync(USAGE_FILE);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1797 — NewsAPI daily rate-limit guard", () => {

  // ── NA-01: Fresh state — no file — should allow ──────────────────────────
  describe("NA-01: no usage file → allowed", () => {
    it("returns { allowed: true } when no usage file exists", () => {
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(true);
    });

    it("reports count 0 when no file exists", () => {
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.count).toBe(0);
    });
  });

  // ── NA-02: Below cap → allowed ────────────────────────────────────────────
  describe("NA-02: count < 90 → allowed", () => {
    it("returns allowed=true when count is 89", () => {
      writeUsage({ date: TODAY, count: 89, lastCallAt: null });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(true);
    });

    it("returns allowed=true when count is 0", () => {
      writeUsage({ date: TODAY, count: 0, lastCallAt: null });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(true);
    });
  });

  // ── NA-03: At or above cap → blocked ─────────────────────────────────────
  describe("NA-03: count >= 90 → blocked", () => {
    it("returns allowed=false when count is exactly 90", () => {
      writeUsage({ date: TODAY, count: 90, lastCallAt: null });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(false);
    });

    it("returns allowed=false when count is 99", () => {
      writeUsage({ date: TODAY, count: 99, lastCallAt: null });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(false);
    });
  });

  // ── NA-04: Date rollover → resets count ──────────────────────────────────
  describe("NA-04: date changed → counter resets to 0 → allowed", () => {
    it("returns allowed=true even when yesterday count was 99", () => {
      writeUsage({ date: YESTERDAY, count: 99, lastCallAt: null });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(0);
    });
  });

  // ── NA-05: Minimum interval — 30 min ─────────────────────────────────────
  describe("NA-05: minimum 30-min interval between calls", () => {
    it("returns allowed=false when last call was 10 minutes ago", () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      writeUsage({ date: TODAY, count: 5, lastCallAt: tenMinAgo });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("interval");
    });

    it("returns allowed=true when last call was exactly 30 minutes ago", () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      writeUsage({ date: TODAY, count: 5, lastCallAt: thirtyMinAgo });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(true);
    });

    it("returns allowed=true when lastCallAt is null (never called)", () => {
      writeUsage({ date: TODAY, count: 0, lastCallAt: null });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(true);
    });

    it("returns allowed=true when last call was 31 minutes ago", () => {
      const thirtyOneMinAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      writeUsage({ date: TODAY, count: 5, lastCallAt: thirtyOneMinAgo });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(true);
    });
  });

  // ── NA-06: incrementNewsApiCount persists the file ────────────────────────
  describe("NA-06: incrementNewsApiCount writes updated usage to disk", () => {
    it("creates the file with count=1 when no file existed", () => {
      incrementNewsApiCount(TODAY, USAGE_FILE);
      const usage = readUsage();
      expect(usage.date).toBe(TODAY);
      expect(usage.count).toBe(1);
      expect(usage.lastCallAt).not.toBeNull();
    });

    it("increments from 5 to 6 on existing file", () => {
      writeUsage({ date: TODAY, count: 5, lastCallAt: null });
      incrementNewsApiCount(TODAY, USAGE_FILE);
      const usage = readUsage();
      expect(usage.count).toBe(6);
    });

    it("resets count to 1 when date differs from file date", () => {
      writeUsage({ date: YESTERDAY, count: 88, lastCallAt: null });
      incrementNewsApiCount(TODAY, USAGE_FILE);
      const usage = readUsage();
      expect(usage.date).toBe(TODAY);
      expect(usage.count).toBe(1);
    });

    it("updates lastCallAt to approximately now", () => {
      const before = Date.now();
      incrementNewsApiCount(TODAY, USAGE_FILE);
      const after = Date.now();
      const usage = readUsage();
      const ts = new Date(usage.lastCallAt!).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  // ── NA-07: Both checks together — cap and interval ────────────────────────
  describe("NA-07: cap check takes precedence over interval check", () => {
    it("returns allowed=false with reason containing 'limit' when both cap and interval would block", () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      writeUsage({ date: TODAY, count: 90, lastCallAt: tenMinAgo });
      const result = checkNewsApiLimit(TODAY, USAGE_FILE);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("limit");
    });
  });
});
