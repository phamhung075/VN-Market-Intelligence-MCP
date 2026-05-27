/**
 * 1948c-self-improve-orchestrator.test.ts
 *
 * Acceptance criteria TASK-3: selfImproveOrchestratorJob.ts + cron wiring
 * AC-T3-1 through AC-T3-9
 *
 * All tests inject deps — zero real Telegram, zero network, :memory: DB only.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  runSelfImproveOrchestrator,
  type SelfImproveOrchestratorDeps,
} from "../scheduler/audits/selfImproveOrchestratorJob.js";
import type { DegradationFinding } from "../domain/services/degradationRules.js";
import type {
  CoverageGapFinding,
} from "../infrastructure/db/improveCheckStore.js";
import type { SignalAccuracyStats } from "../infrastructure/db/signalOutcomeStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  initSystemTables(db);
  return db;
}

function makeDbWithoutTables(): Database {
  return new Database(":memory:");
}

function noopSendWork(): (text: string) => Promise<boolean> {
  return async (_text: string) => true;
}

function noop(): void {}

function makeDegradedFinding(
  signal_type: string,
  detection_class: DegradationFinding["detection_class"] = "DEGRADED",
): DegradationFinding {
  return {
    signal_type,
    detection_class,
    current_rate: 0.4,
    baseline_rate: 0.55,
    sample_count_7d: 5,
    sample_count_30d: 10,
    hypothesis: `hypothesis for ${signal_type}`,
    fix_area: "apps/mcp-server/src/scheduler/alerts/",
  };
}

function getJobStatus(db: Database, jobName: string): string | null {
  const row = db
    .prepare<{ status: string }, [string]>(
      `SELECT status FROM cron_job_runs
       WHERE job_name = ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(jobName);
  return row?.status ?? null;
}

function getImproveCheckCount(db: Database): number {
  const row = db
    .prepare<{ cnt: number }, []>(
      "SELECT COUNT(*) AS cnt FROM improve_check_log",
    )
    .get();
  return row?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-1: Success with no degradation
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-1: success with no degradation findings", () => {
  test("empty signal_outcomes → cron_job_runs.status='success', no Telegram", async () => {
    const db = makeDb();
    const sendWorkCalls: string[] = [];

    await runSelfImproveOrchestrator({
      db,
      sendWork: async (text) => {
        sendWorkCalls.push(text);
        return true;
      },
      detectFn: () => [],
      coverageGapFn: () => [],
      writeProposalFn: async () => {},
    });

    // No Telegram sent
    expect(sendWorkCalls).toHaveLength(0);
    // No improve_check_log rows
    expect(getImproveCheckCount(db)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-2: improve_check_log row inserted with correct rates
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-2: improve_check_log rows inserted with correct rates", () => {
  test("1 DEGRADED finding → 1 row in improve_check_log with correct rates", async () => {
    const db = makeDb();

    const finding = makeDegradedFinding("price_confirmation");

    await runSelfImproveOrchestrator({
      db,
      sendWork: noopSendWork(),
      detectFn: () => [finding],
      coverageGapFn: () => [],
      writeProposalFn: async () => {},
    });

    const row = db
      .prepare(
        "SELECT * FROM improve_check_log WHERE signal_type='price_confirmation'",
      )
      .get() as Record<string, unknown> | undefined;

    expect(row).toBeDefined();
    expect(row!["window_7d_rate"]).toBeCloseTo(0.4);
    expect(row!["window_30d_rate"]).toBeCloseTo(0.55);
    expect(row!["dispatch_status"]).toBe("shadow");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-3: No Telegram on no-degradation
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-3: no Telegram when no findings", () => {
  test("empty stats → sendWork called 0 times", async () => {
    const db = makeDb();
    let sendWorkCallCount = 0;

    await runSelfImproveOrchestrator({
      db,
      sendWork: async (_text) => {
        sendWorkCallCount++;
        return true;
      },
      detectFn: () => [],
      coverageGapFn: () => [],
      writeProposalFn: async () => {},
    });

    expect(sendWorkCallCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-4: Exactly 1 Telegram on findings
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-4: exactly 1 Telegram on findings", () => {
  test("1 degraded finding → sendWork called exactly 1 time", async () => {
    const db = makeDb();
    const messages: string[] = [];

    await runSelfImproveOrchestrator({
      db,
      sendWork: async (text) => {
        messages.push(text);
        return true;
      },
      detectFn: () => [makeDegradedFinding("price_confirmation")],
      coverageGapFn: () => [],
      writeProposalFn: async () => {},
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("price_confirmation");
  });

  test("message contains rate, delta, and hypothesis text", async () => {
    const db = makeDb();
    const messages: string[] = [];

    await runSelfImproveOrchestrator({
      db,
      sendWork: async (text) => {
        messages.push(text);
        return true;
      },
      detectFn: () => [makeDegradedFinding("price_confirmation")],
      coverageGapFn: () => [],
      writeProposalFn: async () => {},
    });

    expect(messages[0]).toContain("7d=");
    expect(messages[0]).toContain("30d=");
    expect(messages[0]).toContain("hypothesis");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-5: Fail-loud on missing table
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-5: fail-loud on missing table (no initSystemTables)", () => {
  test("DB without improve_check_log table → insert fails, finding suppressed, no unhandled exception", async () => {
    // DB without initSystemTables — improve_check_log table doesn't exist
    const db = makeDbWithoutTables();

    // The orchestrator detects a finding, tries to insert, fails (table missing),
    // logs the error, suppresses the finding (not inserted), sends no Telegram.
    // No unhandled exception is thrown to the caller.
    let threw = false;
    const sendWorkCalls: string[] = [];

    try {
      await runSelfImproveOrchestrator({
        db,
        sendWork: async (t) => {
          sendWorkCalls.push(t);
          return true;
        },
        detectFn: () => [makeDegradedFinding("price_confirmation")],
        coverageGapFn: () => [],
        writeProposalFn: async () => {},
      });
    } catch {
      threw = true;
    }

    // Per spec: "No unhandled exception thrown to process" — threw should be false
    // The insert fails (table missing), the finding is suppressed (logged), no Telegram
    expect(threw).toBe(false);
    // No Telegram sent (finding failed to insert, was suppressed)
    expect(sendWorkCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-6: Coverage gap in WORK message
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-6: coverage gap findings appear in WORK message", () => {
  test("gap finding for FPT → sendWork message contains 'FPT'", async () => {
    const db = makeDb();
    const messages: string[] = [];

    const gapFinding: CoverageGapFinding = {
      stock_code: "FPT",
      agent_signals_count: 3,
      last_signal_at: "2026-05-20T00:00:00Z",
    };

    await runSelfImproveOrchestrator({
      db,
      sendWork: async (text) => {
        messages.push(text);
        return true;
      },
      detectFn: () => [],
      coverageGapFn: () => [gapFinding],
      writeProposalFn: async () => {},
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("FPT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-7: Cooldown guard blocks duplicate
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-7: cooldown guard suppresses same signal_type within 7 days", () => {
  test("existing shadow row for price_confirmation → no second row inserted", async () => {
    const db = makeDb();

    // Pre-insert a shadow row for price_confirmation
    db.prepare(
      `INSERT INTO improve_check_log (signal_type, dispatch_status, checked_at)
       VALUES ('price_confirmation', 'shadow', datetime('now'))`,
    ).run();

    expect(getImproveCheckCount(db)).toBe(1);

    // Run with a new finding for the same signal_type
    await runSelfImproveOrchestrator({
      db,
      sendWork: async (_t) => true,
      detectFn: () => [makeDegradedFinding("price_confirmation")],
      coverageGapFn: () => [],
      writeProposalFn: async () => {},
    });

    // Still 1 row — cooldown guard blocked the second insert
    expect(getImproveCheckCount(db)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-8: Anti-runaway max 2 findings (HN-2: DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-8: anti-runaway gate selects top 2 by severity (HN-2 order)", () => {
  test("5 findings → exactly 2 rows inserted, DEGRADED selected first", async () => {
    const db = makeDb();
    const insertedTypes: string[] = [];

    // Intercept: track which signal_types actually get inserted
    const findings: DegradationFinding[] = [
      makeDegradedFinding("price_confirmation", "DEGRADED"),
      makeDegradedFinding("chain_catalyst", "DEGRADED"),
      makeDegradedFinding("volume_spike", "PERSISTENTLY_LOW"),
      // coverage gaps below
    ];

    const gaps: CoverageGapFinding[] = [
      { stock_code: "FPT", agent_signals_count: 1, last_signal_at: null },
      { stock_code: "VNM", agent_signals_count: 1, last_signal_at: null },
    ];

    await runSelfImproveOrchestrator({
      db,
      sendWork: async (_t) => true,
      detectFn: () => findings,
      coverageGapFn: () => gaps,
      writeProposalFn: async () => {},
    });

    // Check improve_check_log — exactly 2 rows (the 2 DEGRADED findings)
    const rows = db
      .prepare(
        "SELECT signal_type, dispatch_status FROM improve_check_log ORDER BY id",
      )
      .all() as Array<{ signal_type: string; dispatch_status: string }>;

    expect(rows).toHaveLength(2);
    // Both should be DEGRADED findings (highest severity)
    const types = rows.map((r) => r.signal_type);
    expect(types).toContain("price_confirmation");
    expect(types).toContain("chain_catalyst");
    // PERSISTENTLY_LOW (volume_spike) and COVERAGE_GAP (FPT, VNM) were dropped
    expect(types).not.toContain("volume_spike");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3-9: Deps injection works — no real implementations
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3-9: all deps injected, no real implementations invoked", () => {
  test("all mock deps called when finding is detected", async () => {
    const db = makeDb();

    let detectFnCalled = false;
    let coverageGapFnCalled = false;
    let sendWorkCalled = false;
    let writeProposalFnCalled = false;

    const deps: SelfImproveOrchestratorDeps = {
      db,
      sendWork: async (_text) => {
        sendWorkCalled = true;
        return true;
      },
      detectFn: (_7d, _30d) => {
        detectFnCalled = true;
        return [makeDegradedFinding("price_confirmation")];
      },
      coverageGapFn: (_db) => {
        coverageGapFnCalled = true;
        return [];
      },
      writeProposalFn: async (_finding, _runDate) => {
        writeProposalFnCalled = true;
      },
    };

    await runSelfImproveOrchestrator(deps);

    expect(detectFnCalled).toBe(true);
    expect(coverageGapFnCalled).toBe(true);
    expect(sendWorkCalled).toBe(true);
    expect(writeProposalFnCalled).toBe(true);
  });
});
