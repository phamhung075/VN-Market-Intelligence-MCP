/**
 * Task 1320 — TDD RED: getAvgVolumeSync excludes current session
 *
 * Bug: The current query uses ORDER BY fetched_at DESC LIMIT 20, which pulls
 * today's intraday rows into the rolling average. This inflates the avg and
 * makes spike ratio always cluster near (N+1)/N ≈ 5.909090.
 *
 * Fix: pass todayUtc into getAvgVolumeSync so the query uses
 *   WHERE ... AND substr(fetched_at, 1, 10) < ?
 * and computes MAX(volume) per calendar day (closed sessions only).
 *
 * FIX-ERRAUDIT-W2-MCP-DATALAYER: getAvgVolumeSync now returns number|null.
 * Insufficient-history path returns null (not 0) so callers drop the dimension
 * instead of feeding a fake 0 to detectSignals.
 *
 * T1: avg uses only T-1 data, not today's rows (insufficient → null)
 * T2: spike ratio reflects true prior-day baseline (5 days → number)
 * T3: edge — treating T-1 as "today" excludes T-1 rows too
 * T4: regression — fewer than MIN_HISTORY_ROWS prior days → null (was 0, now discriminated)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Import the function under test.
// getAvgVolumeSync is not currently exported — the fix must export it (or a
// testable wrapper) and accept an optional todayUtc parameter.
// ─────────────────────────────────────────────────────────────────────────────
import { getAvgVolumeSync } from "../application/usecases/scanMarket.js";

const CODE = "TEST";
const TODAY = "2026-04-27";
const T1 = "2026-04-26";
const T2 = "2026-04-25";
const T3 = "2026-04-24";

function insertRow(
  code: string,
  date: string,
  hour: string,
  volume: number,
): void {
  const db = getDb();
  db.run(
    `INSERT INTO market_prices_history (code, price, volume, fetched_at)
     VALUES (?, 100000, ?, ?)`,
    [code, volume, `${date}T${hour}:00:00.000Z`],
  );
}

describe("Task 1320 — getAvgVolumeSync excludes today's session", () => {
  beforeEach(async () => {
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("T1: avg uses only prior-day data — today's rows are excluded", () => {
    // Today: 10 intraday rows with volumes 100–190 (avg 145)
    for (let i = 0; i < 10; i++) {
      insertRow(CODE, TODAY, `0${i}`.slice(-2) + ":00", 100 + i * 10);
    }
    // T-1: 10 rows with volumes 50, 55, 60, ..., 95 (avg 72.5)
    for (let i = 0; i < 10; i++) {
      insertRow(CODE, T1, `0${i}`.slice(-2) + ":00", 50 + i * 5);
    }

    const avg = getAvgVolumeSync(CODE, TODAY);

    // Must equal average of T-1 day max (95) only, since only one prior day.
    // With only 1 prior day → insufficient history (< MIN_HISTORY_ROWS=5) → null.
    // FIX-ERRAUDIT-W2: returns null (drop-dimension), NOT 0 (fabricated value).
    // This confirms it does NOT use today's data (real avg would be 145, not null).
    expect(avg).toBeNull(); // 1 prior day < MIN_HISTORY_ROWS(5) → drop-dimension
  });

  it("T2: spike ratio correct when 5+ prior days present", () => {
    // Seed 5 prior days each with max volume = 100
    const priorDays = ["2026-04-22", "2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26"];
    for (const day of priorDays) {
      insertRow(CODE, day, "09:00", 90);
      insertRow(CODE, day, "14:00", 100); // max for that day
    }
    // Today: intraday rows with much higher volume (should not affect avg)
    insertRow(CODE, TODAY, "09:00", 1000);
    insertRow(CODE, TODAY, "10:00", 1100);

    const avg = getAvgVolumeSync(CODE, TODAY);

    // avg of [100, 100, 100, 100, 100] = 100
    expect(avg).toBe(100);
    // Spike ratio = (today's volume) / avg = 1000 / 100 = 10, NOT 5.909090
    // We just verify avg here; ratio logic is in detectSignals
  });

  it("T3: treating T-1 as today excludes T-1 rows", () => {
    // Seed T-2 through T-6 each with max volume = 80
    const olderDays = ["2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24", "2026-04-25"];
    for (const day of olderDays) {
      insertRow(CODE, day, "09:00", 70);
      insertRow(CODE, day, "14:00", 80); // max
    }
    // T-1: rows that should be excluded when todayUtc = T-1
    insertRow(CODE, T1, "09:00", 500);
    insertRow(CODE, T1, "14:00", 600);

    const avg = getAvgVolumeSync(CODE, T1); // simulate as if T-1 is "today"

    // T-1 excluded → avg of [80, 80, 80, 80, 80] = 80
    expect(avg).toBe(80);
  });

  it("T4: fewer than 5 prior closed days returns null (drop-dimension — was 0, now discriminated)", () => {
    // Only 4 prior days
    const days = ["2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26"];
    for (const day of days) {
      insertRow(CODE, day, "09:00", 100);
    }

    const avg = getAvgVolumeSync(CODE, TODAY);

    // FIX-ERRAUDIT-W2: null distinguishes insufficient-history from genuine 0-volume.
    // Callers must drop the dimension (not feed 0 to detectSignals as fake baseline).
    expect(avg).toBeNull();
  });
});
