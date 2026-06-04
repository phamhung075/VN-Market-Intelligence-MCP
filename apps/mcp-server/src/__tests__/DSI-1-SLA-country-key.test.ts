/**
 * DSI-S1-SLA — country key SSOT fix for macroIndicatorSla.ts
 *
 * Root cause: macroIndicatorSla.ts queried country='VN' while the active writer
 * (macroIndicatorRefreshJob.ts:242) writes country='vietnam'. Key mismatch made
 * the SLA guard permanently blind since 2026-05-17.
 *
 * AC-SLA-1 (primary key fix — non-silent guard):
 *   - country='vietnam' row with fetched_at > 24h ago → freshnessSlaChecker returns false
 *     AND Telegram WORK send is called.
 *   - country='vietnam' row with fetched_at < 24h ago → returns true, no Telegram call.
 *
 * AC-SLA-2 (startup guard):
 *   - detectStartupStaleData with a stale country='vietnam' row → non-empty alert message.
 *
 * AC-SLA-3 (zero VN queries):
 *   - No .get("VN") call remains in macroIndicatorSla.ts.
 *
 * RED-then-GREEN proof note:
 *   Before this fix, the SLA guard queried .get("VN"). AC-SLA-1-a would fail because
 *   the stale 'vietnam' row would not be found, the guard would return false silently
 *   without firing Telegram. Running the test against the pre-fix file demonstrates RED:
 *   telegramCalls.length === 0 when it must be === 1.
 *   After the fix, .get(MACRO_COUNTRY_KEY) finds the 'vietnam' row → GREEN.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  freshnessSlaChecker,
  detectStartupStaleData,
} from "../domain/services/macroIndicatorSla.js";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Opens a fresh in-memory DB with all schema migrations applied. */
async function openFreshDb(): Promise<Database> {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  return getDb();
}

/** Returns UTC ISO string N hours ago. */
function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Test state
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(async () => {
  db = await openFreshDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-SLA-1a: stale 'vietnam' row → freshnessSlaChecker returns false + Telegram fired
// ─────────────────────────────────────────────────────────────────────────────

describe("DSI-S1-SLA — AC-SLA-1a: stale country=vietnam fires Telegram + returns false", () => {
  it("inserts country=vietnam stale 25h ago, guard returns false and calls Telegram once", async () => {
    // Arrange: row is 25 hours old — exceeds 24h SLA
    const staleAt = hoursAgo(25);
    db.prepare(
      `INSERT INTO macro_indicators (country, fetched_at) VALUES (?, ?)`
    ).run("vietnam", staleAt);

    const telegramCalls: Array<{ channel: string; message: string }> = [];
    const mockSendTelegram = async (
      channel: string,
      message: string,
    ): Promise<void> => {
      telegramCalls.push({ channel, message });
    };

    // Act
    const result = await freshnessSlaChecker(db, mockSendTelegram);

    // Assert: guard fired (stale → returns false) AND Telegram was called
    expect(result).toBe(false);
    expect(telegramCalls.length).toBe(1);
    const call0 = telegramCalls[0]!;
    expect(call0.channel).toBe("work");
    expect(call0.message).toContain("stale");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-SLA-1b: fresh 'vietnam' row → returns true, no Telegram call
// ─────────────────────────────────────────────────────────────────────────────

describe("DSI-S1-SLA — AC-SLA-1b: fresh country=vietnam returns true, no Telegram call", () => {
  it("inserts country=vietnam fresh 1h ago, guard returns true and does NOT call Telegram", async () => {
    // Arrange: row is 1 hour old — within 24h SLA
    const freshAt = hoursAgo(1);
    db.prepare(
      `INSERT INTO macro_indicators (country, fetched_at) VALUES (?, ?)`
    ).run("vietnam", freshAt);

    const telegramCalls: Array<{ channel: string; message: string }> = [];
    const mockSendTelegram = async (
      channel: string,
      message: string,
    ): Promise<void> => {
      telegramCalls.push({ channel, message });
    };

    // Act
    const result = await freshnessSlaChecker(db, mockSendTelegram);

    // Assert: data is fresh → true, no Telegram call
    expect(result).toBe(true);
    expect(telegramCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-SLA-1c: old key 'VN' row is NOT found by the guard (verifies the key split is gone)
// ─────────────────────────────────────────────────────────────────────────────

describe("DSI-S1-SLA — AC-SLA-1c: country=VN row is NOT found by guard (key is SSOT 'vietnam')", () => {
  it("row with country=VN (old key) does not satisfy the guard — returns false silently", async () => {
    // Arrange: old-key row — should NOT be found by the updated query
    const freshAt = hoursAgo(1);
    db.prepare(
      `INSERT INTO macro_indicators (country, fetched_at) VALUES (?, ?)`
    ).run("VN", freshAt);

    const telegramCalls: Array<unknown> = [];
    const mockSendTelegram = async (): Promise<void> => {
      telegramCalls.push(true);
    };

    // Act: guard should not find the 'VN' row — returns false (no row for 'vietnam')
    const result = await freshnessSlaChecker(db, mockSendTelegram);

    // No 'vietnam' row → returns false without Telegram (no data path, not the breach path)
    expect(result).toBe(false);
    // No Telegram call because the code path is "no data at all" (early return false)
    expect(telegramCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-SLA-2: detectStartupStaleData with stale 'vietnam' row sends alert
// ─────────────────────────────────────────────────────────────────────────────

describe("DSI-S1-SLA — AC-SLA-2: detectStartupStaleData with stale vietnam row sends non-empty alert", () => {
  it("stale 30h row triggers startup alert with non-empty message on WORK channel", async () => {
    // Arrange
    const staleAt = hoursAgo(30);
    db.prepare(
      `INSERT INTO macro_indicators (country, fetched_at) VALUES (?, ?)`
    ).run("vietnam", staleAt);

    const alertCalls: Array<{ channel: string; message: string; options?: unknown }> = [];
    const mockSendTelegram = async (
      channel: string,
      message: string,
      options?: { tag?: string },
    ): Promise<void> => {
      alertCalls.push({ channel, message, options });
    };

    // Act
    await detectStartupStaleData(db, mockSendTelegram);

    // Assert: one alert on WORK channel with non-empty message
    expect(alertCalls.length).toBe(1);
    const alert0 = alertCalls[0]!;
    expect(alert0.channel).toBe("work");
    expect(alert0.message.length).toBeGreaterThan(0);
    expect(alert0.message).toContain("STALE");
  });

  it("fresh row does NOT trigger startup alert", async () => {
    // Arrange
    const freshAt = hoursAgo(2);
    db.prepare(
      `INSERT INTO macro_indicators (country, fetched_at) VALUES (?, ?)`
    ).run("vietnam", freshAt);

    const alertCalls: Array<unknown> = [];
    const mockSendTelegram = async (): Promise<void> => {
      alertCalls.push(true);
    };

    // Act
    await detectStartupStaleData(db, mockSendTelegram);

    // Assert: no alert for fresh data
    expect(alertCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-SLA-3: Zero .get("VN") calls remain in macroIndicatorSla.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('DSI-S1-SLA — AC-SLA-3: no .get("VN") in macroIndicatorSla.ts', () => {
  it('macroIndicatorSla.ts contains zero .get("VN") calls', () => {
    const slaFilePath = path.resolve(
      import.meta.dir,
      "../domain/services/macroIndicatorSla.ts",
    );
    const source = fs.readFileSync(slaFilePath, "utf8");

    // Must not contain any .get("VN") call
    const hasVnQuery = source.includes('.get("VN")');
    expect(hasVnQuery).toBe(false);

    // Must contain MACRO_COUNTRY_KEY constant declaration
    const hasSsotConstant = source.includes('MACRO_COUNTRY_KEY = "vietnam"');
    expect(hasSsotConstant).toBe(true);

    // Must use MACRO_COUNTRY_KEY at query sites (both occurrences)
    const countKeyUsage = (source.match(/\.get\(MACRO_COUNTRY_KEY\)/g) ?? []).length;
    expect(countKeyUsage).toBe(2);
  });
});
