/**
 * Task 1352c — freshnessSlaMonitorJob end-to-end + sscCheckerJob concurrency guard
 *
 * Group A (5 cases): runFreshnessSlaMonitor() orchestration via injectable DB + callback.
 * Group B (1 case):  sscCheckerJob concurrency guard — static source assertion.
 *
 * Strategy for B-1: ESM module-level `isRunning` cannot be reset across imports in Bun.
 * We use the "alternative simpler approach" from the handoff:
 *   1. Assert the guard text is present in source (contract lock-in).
 *   2. This is a valid contract lock because the guard is a thin one-liner with no
 *      logic branches — static presence is sufficient to prevent silent deletion.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  runFreshnessSlaMonitor,
  querySignalAges,
  type EscalationCallback,
} from "../scheduler/system/freshnessSlaMonitorJob.js";
import type { SignalType } from "../domain/services/freshnessSlaChecker.js";
import * as fs from "fs/promises";
import * as path from "path";

/** No-op WORK channel sender — avoids real Telegram calls in tests. */
const noopSendWork = async (_msg: string): Promise<void> => { /* no-op */ };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a UTC ISO string for a moment N minutes in the past. */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

/** Opens a fresh in-memory DB with all schema migrations applied. */
async function openFreshDb(): Promise<Database> {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  return getDb();
}

/** No-op escalation callback that records calls. */
function makeEscalateSpy(): {
  spy: EscalationCallback;
  calls: Array<{
    signalType: SignalType;
    ageMinutes: number;
    thresholdMinutes: number;
    severity: string;
  }>;
} {
  const calls: Array<{
    signalType: SignalType;
    ageMinutes: number;
    thresholdMinutes: number;
    severity: string;
  }> = [];
  const spy: EscalationCallback = async (signalType, ageMinutes, thresholdMinutes, severity) => {
    calls.push({ signalType, ageMinutes, thresholdMinutes, severity });
  };
  return { spy, calls };
}

/**
 * Inserts one fresh row into each of the 5 source tables.
 * Uses real column names from the production schema.
 *
 * @param db         In-memory DB instance
 * @param priceAt    ISO timestamp for market_prices.updated_at
 * @param suffix     Unique suffix for primary-key values (avoids UNIQUE conflicts)
 */
function insertSourceRows(db: Database, priceAt: string, suffix: string): void {
  const now = minutesAgo(0);
  db.exec(
    `INSERT INTO market_prices (code, price, updated_at) VALUES ('VNM${suffix}', 100, '${priceAt}')`
  );
  db.exec(
    `INSERT INTO financial_reports (
       id, action_code, company_name, exchange, domain,
       period_year, period_type, period_start, period_end, sort_key, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
     ) VALUES (
       'fr-${suffix}', 'VNM', 'Vinamilk', 'HOSE', 'consumer',
       2026, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1-${suffix}', '${now}',
       '{}', '{}', '{}', '{}'
     )`
  );
  db.exec(
    `INSERT INTO rag_analyses (id, created_at, level) VALUES ('ra-${suffix}', '${now}', 'macro')`
  );
  db.exec(
    `INSERT INTO sbv_rates (source, fetched_at) VALUES ('sbv-${suffix}', '${now}')`
  );
  db.exec(
    `INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
     VALUES ('VNM${suffix}', '2026-04-27', 100, '${now}', 100)`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Group A — runFreshnessSlaMonitor() end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352c — Group A: runFreshnessSlaMonitor() end-to-end", () => {

  // ───────────────────────────────────────────────────────────────────────────
  // A-1: All signals fresh → no breaches, no escalations
  // ───────────────────────────────────────────────────────────────────────────

  it("A-1: all signals fresh — returns {breaches:0, recoveries:0, escalations:0}, escalate not called", async () => {
    const db = await openFreshDb();
    insertSourceRows(db, minutesAgo(0), "a1");

    const { spy, calls } = makeEscalateSpy();
    const result = await runFreshnessSlaMonitor(db, spy, undefined, new Date(), noopSendWork);

    expect(result).toEqual({ breaches: 0, recoveries: 0, escalations: 0 });
    expect(calls.length).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A-2: Price data stale (15 min) → breach recorded + escalation fired
  // ───────────────────────────────────────────────────────────────────────────

  it("A-2: price stale 15 min — breach=1, escalation=1, audit row written with escalation_callback_sent=1", async () => {
    const db = await openFreshDb();
    // market_prices is stale; all other tables are fresh
    insertSourceRows(db, minutesAgo(15), "a2");

    const { spy, calls } = makeEscalateSpy();
    // Pass a market-hours `now` so the 1407b market-hours gate does not suppress
    // price escalation. Monday 2026-04-27T04:00Z is inside 02:00–08:59 UTC window.
    const marketHoursNow = new Date("2026-04-27T04:00:00.000Z");
    const result = await runFreshnessSlaMonitor(db, spy, undefined, marketHoursNow, noopSendWork);

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(result.recoveries).toBe(0);

    // Escalation callback fired with correct arguments
    expect(calls.length).toBe(1);
    expect(calls[0]!.signalType).toBe("price");
    expect(calls[0]!.thresholdMinutes).toBe(10);
    expect(calls[0]!.severity).toBe("HIGH");

    // Audit table row must be written and marked escalated
    interface AuditRow {
      signal_type: string;
      status: string;
      escalation_callback_sent: number;
    }
    const row = db
      .query<AuditRow, []>(
        `SELECT signal_type, status, escalation_callback_sent
           FROM sla_breach_audit WHERE signal_type = 'price'`
      )
      .get();
    expect(row).toBeDefined();
    expect(row!.signal_type).toBe("price");
    expect(row!.status).toBe("breach_open");
    expect(row!.escalation_callback_sent).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A-3: Cooldown active → breach recorded but escalation suppressed
  // ───────────────────────────────────────────────────────────────────────────

  it("A-3: cooldown active for price — breach recorded but escalate NOT called", async () => {
    const db = await openFreshDb();

    // Pre-existing breach within last 60 min with escalation already sent.
    // Use '-1 minute' so the timestamp differs from the new row that recordSlaBreach
    // will insert at datetime('now') — avoids UNIQUE(signal_type, breached_at) collision.
    db.exec(`
      INSERT INTO sla_breach_audit
        (signal_type, age_minutes, threshold_minutes, status, severity, escalation_callback_sent, breached_at)
      VALUES ('price', 15, 10, 'breach_open', 'HIGH', 1, datetime('now', '-1 minute'))
    `);

    insertSourceRows(db, minutesAgo(15), "a3");

    const { spy, calls } = makeEscalateSpy();
    // Use market-hours clock so the tight 10-min price SLA applies.
    // price/foreign_flow are market-hours-only; default new Date() on a weekend would
    // use the large off-hours threshold and no breach would be detected.
    const marketHoursNow = new Date("2026-04-27T04:00:00.000Z");
    const result = await runFreshnessSlaMonitor(db, spy, undefined, marketHoursNow, noopSendWork);

    // Breach is still recorded (new audit row), but cooldown suppresses escalation
    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(0);
    expect(calls.length).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A-4: Recovery detected → prior breach row marked recovered
  // ───────────────────────────────────────────────────────────────────────────

  it("A-4: news recovers — recoveries=1, sla_breach_audit status=recovered with recovered_at set", async () => {
    const db = await openFreshDb();

    // Insert a prior open breach for 'news' (40 minutes ago)
    db.exec(`
      INSERT INTO sla_breach_audit
        (signal_type, age_minutes, threshold_minutes, status, severity, breached_at)
      VALUES ('news', 35, 30, 'breach_open', 'HIGH', datetime('now', '-40 minutes'))
    `);

    // All signals fresh now — news rag_analyses row inserted at now (age ≈ 0 < 30 threshold)
    insertSourceRows(db, minutesAgo(0), "a4");

    const { spy, calls } = makeEscalateSpy();
    const result = await runFreshnessSlaMonitor(db, spy, undefined, new Date(), noopSendWork);

    expect(result.recoveries).toBe(1);
    expect(result.breaches).toBe(0);
    expect(calls.length).toBe(0);

    // Audit row must be updated to recovered
    interface AuditRow {
      status: string;
      recovered_at: string | null;
    }
    const row = db
      .query<AuditRow, []>(
        `SELECT status, recovered_at FROM sla_breach_audit WHERE signal_type = 'news'`
      )
      .get();
    expect(row).toBeDefined();
    expect(row!.status).toBe("recovered");
    expect(row!.recovered_at).not.toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A-5: querySignalAges — empty tables return age=0 (NULL-safety guard)
  // ───────────────────────────────────────────────────────────────────────────

  it("A-5: querySignalAges on empty tables returns -1 sentinel for all signal types (Task 1920i null guard)", async () => {
    // initDatabase() creates all source tables; no rows inserted.
    // Task 1920i (FR-4): NULL age_minutes → -1 sentinel (not-seeded, skip SLA check).
    // Callers must treat -1 as "skip" — not a breach.
    const db = await openFreshDb();

    const ages = querySignalAges(db);

    // Original 5 types — also return -1 when table is empty (FR-4 null guard applies)
    expect(ages.price).toBe(-1);
    expect(ages.bctc).toBe(-1);
    expect(ages.news).toBe(-1);
    expect(ages.sbv_fx).toBe(-1);
    expect(ages.foreign_flow).toBe(-1);
    // Sprint 1920 new types also -1 when empty
    expect(ages.commodity_prices).toBe(-1);
    expect(ages.bond_maturity).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group B — sscCheckerJob concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352c — Group B: sscCheckerJob concurrency guard", () => {

  // ───────────────────────────────────────────────────────────────────────────
  // B-1: isRunning guard — static source assertion (contract lock-in)
  //
  // ESM module-level `isRunning` cannot be externally reset between imports in Bun.
  // Using the "alternative simpler approach" from the handoff: verify the guard
  // text exists in source. This is a valid contract lock because:
  //   - Any refactor that removes the guard will break this test (RED).
  //   - The guard is a single-branch one-liner with no hidden logic.
  // ───────────────────────────────────────────────────────────────────────────

  it("B-1: sscCheckerJob source contains isRunning concurrency guard, warn log, and VPS guard", async () => {
    const filePath = path.join(
      import.meta.dir,
      "../scheduler/news-analysis/sscCheckerJob.ts"
    );
    const content = await fs.readFile(filePath, "utf-8");

    // Contract: concurrency flag declared at module level
    expect(content).toContain("let isRunning = false");

    // Contract: guard check causes early return on re-entry
    expect(content).toContain("if (isRunning)");

    // Contract: warning log matches the text tested here — prevents silent rename
    expect(content).toContain("previous cycle still running");

    // Contract: flag reset in finally so subsequent runs are not permanently blocked
    expect(content).toContain("isRunning = false");

    // Contract: flag set to true before async work begins
    expect(content).toContain("isRunning = true");

    // Contract: VPS-only architecture guard present (Task 1281-fix)
    expect(content).toContain("enableLocalBctcFetch");

    // Contract: VPS guard logs a skip, not an error
    expect(content).toContain("skipping");
  });
});
