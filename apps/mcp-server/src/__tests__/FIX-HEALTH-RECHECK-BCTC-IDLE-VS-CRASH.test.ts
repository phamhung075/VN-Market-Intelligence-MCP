/**
 * FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH — Unit tests.
 *
 * Root cause: the BCTC freshness-SLA classifier (freshnessSlaChecker.ts +
 * freshnessSlaMonitorJob.ts) keyed the CRASH/UNHEALTHY verdict on
 * last-push-age alone. push-age is high whenever the bctc_vps_queue is
 * empty/idle (no filings currently due) — that is normal off-season
 * behavior, not a crash, but the pre-fix classifier escalated it as a P0
 * every ~2h (SSH RAW-verify report 3256, 2026-06-19T16:20Z: vn-bctc-fetch
 * active(running) 8+ days, queue legitimately empty, NOT a crash).
 *
 * Fix: gate the CRASH/UNHEALTHY verdict generically on
 *   service-state != active/running  OR  (queue-depth > 0 AND age > SLA)
 * via the new `PipelineRuntimeState` param threaded through
 * checkSignalSla / checkDataFreshnessSla (domain, pure) and the
 * `queryBctcPipelineRuntimeState` live reader (scheduler layer).
 *
 * DoD cases (verification_gate, MUST ALL PASS):
 *   Group A (domain, pure): idle-queue-0-running + push-age>360min => IDLE
 *     (not CRASH); service-down => CRASH; queue>0 & age>SLA => CRASH.
 *   Group B: checkDataFreshnessSla threading + non-gated signals unaffected.
 *   Group C (scheduler wiring, live-DB integration): runFreshnessSlaMonitor
 *     end-to-end — idle-queue-0-running does NOT escalate; service-down
 *     DOES escalate; queue-backlog+stale DOES escalate (true positive
 *     preserved); missing tables fail open (legacy behavior unchanged).
 *
 * @module __tests__/FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  checkSignalSla,
  checkDataFreshnessSla,
  type SignalType,
  type PipelineRuntimeState,
} from "../domain/services/freshnessSlaChecker.js";
import {
  runFreshnessSlaMonitor,
  queryBctcPipelineRuntimeState,
  type EscalationCallback,
} from "../scheduler/system/freshnessSlaMonitorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Group A — checkSignalSla: pure domain gate (the literal DoD cases)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH — Group A: checkSignalSla runtime gate", () => {
  // Off-hours weekday, outside earnings window (Jun 25) so the raw bctc
  // threshold is a large dynamic value — but push-age=400 (>360) still
  // exceeds even the FIX-BCTC-SLA-THRESHOLD-360 in-window 360-min threshold,
  // so without this fix's runtime gate the pre-fix code WOULD have crashed.
  const IN_WINDOW_OFF_HOURS = new Date("2026-04-06T00:30:00.000Z"); // April earnings window, off-hours -> raw threshold 360 min

  it("A-1: idle-queue-0-running + push-age=400min (>360 SLA) => IDLE, NOT crash", () => {
    const runtimeState: PipelineRuntimeState = { serviceActive: true, queueDepth: 0 };
    const result = checkSignalSla("bctc", 400, undefined, IN_WINDOW_OFF_HOURS, runtimeState);

    expect(result.status).toBe("ok");
    expect(result.verdict).toBe("idle");
    expect(result.severity).toBeUndefined();
  });

  it("A-1b: idle-queue-0-running + push-age=11982min (199.7h, off-season) => IDLE, NOT crash", () => {
    // Mirrors the live RAW-verify scenario (report 3256): 8+ day uptime, empty queue.
    const runtimeState: PipelineRuntimeState = { serviceActive: true, queueDepth: 0 };
    const result = checkSignalSla("bctc", 11982, undefined, new Date("2026-06-25T10:00:00Z"), runtimeState);

    expect(result.status).toBe("ok");
    expect(result.verdict).toBe("idle");
  });

  it("A-2: service-down (serviceActive=false) => CRASH, regardless of queue-depth", () => {
    const runtimeState: PipelineRuntimeState = { serviceActive: false, queueDepth: 0 };
    const result = checkSignalSla("bctc", 50, undefined, IN_WINDOW_OFF_HOURS, runtimeState);

    expect(result.status).toBe("breached");
    expect(result.verdict).toBe("crash");
    expect(result.severity).toBe("CRITICAL");
  });

  it("A-2b: service-down even with a non-empty queue => still CRASH", () => {
    const runtimeState: PipelineRuntimeState = { serviceActive: false, queueDepth: 5 };
    const result = checkSignalSla("bctc", 400, undefined, IN_WINDOW_OFF_HOURS, runtimeState);

    expect(result.status).toBe("breached");
    expect(result.verdict).toBe("crash");
    expect(result.severity).toBe("CRITICAL");
  });

  it("A-3: queue-depth>0 AND age>SLA => CRASH (true positive preserved)", () => {
    const runtimeState: PipelineRuntimeState = { serviceActive: true, queueDepth: 3 };
    const result = checkSignalSla("bctc", 400, undefined, IN_WINDOW_OFF_HOURS, runtimeState);

    expect(result.status).toBe("breached");
    expect(result.verdict).toBe("crash");
  });

  it("A-4: queue-depth>0 AND age<=SLA => ok, not a breach (regression guard)", () => {
    const runtimeState: PipelineRuntimeState = { serviceActive: true, queueDepth: 3 };
    const result = checkSignalSla("bctc", 100, undefined, IN_WINDOW_OFF_HOURS, runtimeState);

    expect(result.status).toBe("ok");
    expect(result.verdict).toBe("ok");
  });

  it("A-5: no runtimeState supplied => legacy age-only behavior unchanged, verdict undefined", () => {
    const result = checkSignalSla("bctc", 400, undefined, IN_WINDOW_OFF_HOURS);

    expect(result.status).toBe("breached"); // unchanged legacy behavior: 400 > 360
    expect(result.verdict).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group B — checkDataFreshnessSla: runtimeStates threading + isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH — Group B: checkDataFreshnessSla threading", () => {
  const BASE_AGES: Record<SignalType, number> = {
    price: 0,
    bctc: 400,
    news: 0,
    sbv_fx: 0,
    foreign_flow: 0,
    vnstock_fundamentals: -1,
    bond_maturity: -1,
    commodity_prices: -1,
    broker_sanctions: -1,
    backtest_runs: -1,
    signal_quality_audit: -1,
    prediction_claims: -1,
  };
  const IN_WINDOW_OFF_HOURS = new Date("2026-04-06T00:30:00.000Z");

  it("B-1: bctc idle-queue-0-running gated out of breaches[] entirely", () => {
    const result = checkDataFreshnessSla(
      BASE_AGES,
      undefined,
      [],
      IN_WINDOW_OFF_HOURS,
      { bctc: { serviceActive: true, queueDepth: 0 } },
    );

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeUndefined();
  });

  it("B-2: bctc service-down still lands in breaches[] with verdict=crash", () => {
    const result = checkDataFreshnessSla(
      BASE_AGES,
      undefined,
      [],
      IN_WINDOW_OFF_HOURS,
      { bctc: { serviceActive: false, queueDepth: 0 } },
    );

    const bctcBreach = result.breaches.find((b) => b.signalType === "bctc");
    expect(bctcBreach).toBeDefined();
    expect(bctcBreach!.verdict).toBe("crash");
  });

  it("B-3: gating bctc does not affect other ungated signal types (price unaffected)", () => {
    const agesWithStalePrice = { ...BASE_AGES, price: 20 }; // > 10-min market-hours threshold
    const marketHoursNow = new Date("2026-04-27T04:00:00.000Z");
    const result = checkDataFreshnessSla(
      agesWithStalePrice,
      undefined,
      [],
      marketHoursNow,
      { bctc: { serviceActive: true, queueDepth: 0 } },
    );

    const priceBreach = result.breaches.find((b) => b.signalType === "price");
    expect(priceBreach).toBeDefined();
    expect(priceBreach!.verdict).toBeUndefined(); // ungated signal — unaffected by bctc's runtimeStates entry
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group C — scheduler wiring: queryBctcPipelineRuntimeState + runFreshnessSlaMonitor
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal in-memory schema covering exactly what runFreshnessSlaMonitor + the
 * new gate need: sla_breach_audit (audit/cooldown), bctc_vps_queue (queue-depth),
 * vps_service_health (service-state). Mirrors the DDL used by
 * 1407b-sla-market-hours-gate.test.ts and FIX-BCTC-FRESHNESS-GATE.test.ts. */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS sla_breach_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL CHECK(
        signal_type IN ('price', 'bctc', 'news', 'sbv_fx', 'foreign_flow')
      ),
      breached_at TEXT NOT NULL DEFAULT (datetime('now')),
      age_minutes INTEGER NOT NULL,
      threshold_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'breach_open' CHECK(
        status IN ('breach_open', 'recovered')
      ),
      severity TEXT NOT NULL CHECK(
        severity IN ('HIGH', 'CRITICAL')
      ),
      escalation_callback_sent INTEGER DEFAULT 0,
      recovered_at TEXT,
      UNIQUE(signal_type, breached_at)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS vps_service_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL CHECK(
        service_name IN ('vn-price-fetch', 'vn-bctc-fetch', 'vn-news-fetch', 'vn-sbv-fetch', 'vn-foreign-flow')
      ),
      polled_at TEXT NOT NULL DEFAULT (datetime('now')),
      health_status TEXT NOT NULL CHECK(
        health_status IN ('healthy', 'unhealthy', 'unreachable', 'idle')
      ),
      response_time_ms INTEGER,
      last_successful_run TEXT,
      uptime_seconds INTEGER,
      error_message TEXT
    )
  `);
  return db;
}

function insertQueueRow(db: Database, code: string, status: string): void {
  db.exec(`
    INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status)
    VALUES ('${code}', 2026, 'Q1', '${status}')
  `);
}

function insertHealthRow(db: Database, healthStatus: string): void {
  db.exec(`
    INSERT INTO vps_service_health (service_name, health_status)
    VALUES ('vn-bctc-fetch', '${healthStatus}')
  `);
}

type SignalAges = Record<SignalType, number>;
function freshAges(): SignalAges {
  return {
    price: 0, bctc: 0, news: 0, sbv_fx: 0, foreign_flow: 0,
    vnstock_fundamentals: -1, bond_maturity: -1, commodity_prices: -1,
    broker_sanctions: -1, backtest_runs: -1, signal_quality_audit: -1, prediction_claims: -1,
  };
}
function staleAges(signalType: SignalType, ageMinutes: number): SignalAges {
  const ages = freshAges();
  ages[signalType] = ageMinutes;
  return ages;
}

function makeEscalateSpy(): {
  spy: EscalationCallback;
  calls: Array<{ signalType: SignalType; ageMinutes: number; severity: string }>;
} {
  const calls: Array<{ signalType: SignalType; ageMinutes: number; severity: string }> = [];
  const spy: EscalationCallback = async (signalType, ageMinutes, _thresholdMinutes, severity) => {
    calls.push({ signalType, ageMinutes, severity });
  };
  return { spy, calls };
}

const noopSendWork = async (_msg: string): Promise<void> => { /* no-op */ };

// April earnings window, off-hours -> fixed 360-min bctc threshold applies.
const IN_WINDOW_OFF_HOURS = new Date("2026-04-06T00:30:00.000Z");

describe("FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH — Group C: queryBctcPipelineRuntimeState (live reader)", () => {
  it("C-1: empty queue + healthy poll row => { serviceActive: true, queueDepth: 0 }", () => {
    const db = makeDb();
    insertHealthRow(db, "idle");

    const state = queryBctcPipelineRuntimeState(db);
    expect(state).toEqual({ serviceActive: true, queueDepth: 0 });
    db.close();
  });

  it("C-2: pending queue rows => queueDepth reflects actionable count", () => {
    const db = makeDb();
    insertQueueRow(db, "VCB", "pending");
    insertQueueRow(db, "VNM", "url_not_found");
    insertQueueRow(db, "HPG", "done"); // not actionable — excluded
    insertHealthRow(db, "healthy");

    const state = queryBctcPipelineRuntimeState(db);
    expect(state).toEqual({ serviceActive: true, queueDepth: 2 });
    db.close();
  });

  it("C-2b (FIX-BCTC-D3B): pek_triggered rows count toward queueDepth — async PEK work is active, not idle", () => {
    const db = makeDb();
    insertQueueRow(db, "VCB", "pending");
    insertQueueRow(db, "VNM", "pek_triggered");
    insertQueueRow(db, "HPG", "done"); // not actionable — excluded
    insertHealthRow(db, "healthy");

    const state = queryBctcPipelineRuntimeState(db);
    expect(state).toEqual({ serviceActive: true, queueDepth: 2 });
    db.close();
  });

  it("C-3: latest health row = unreachable => serviceActive: false", () => {
    const db = makeDb();
    insertHealthRow(db, "healthy"); // older
    insertHealthRow(db, "unreachable"); // most recent (insertion order = polled_at DESC via rowid tiebreak on equal timestamps)

    const state = queryBctcPipelineRuntimeState(db);
    expect(state!.serviceActive).toBe(false);
    db.close();
  });

  it("C-4: no vps_service_health row yet => serviceActive defaults true (fail-open, no false crash)", () => {
    const db = makeDb();
    const state = queryBctcPipelineRuntimeState(db);
    expect(state).toEqual({ serviceActive: true, queueDepth: 0 });
    db.close();
  });

  it("C-5: tables absent entirely => returns undefined (fail-open, legacy fallback)", () => {
    const bareDb = new Database(":memory:");
    bareDb.run(`CREATE TABLE IF NOT EXISTS placeholder (id INTEGER)`);

    const state = queryBctcPipelineRuntimeState(bareDb);
    expect(state).toBeUndefined();
    bareDb.close();
  });
});

describe("FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH — Group C: runFreshnessSlaMonitor end-to-end", () => {
  it("C-6: idle-queue-0-running + push-age=400min => NO escalation, NO breach (DoD: no false BCTC P0)", async () => {
    const db = makeDb();
    insertHealthRow(db, "idle"); // service confirmed alive, queue empty

    const { spy, calls } = makeEscalateSpy();
    const result = await runFreshnessSlaMonitor(
      db, spy, staleAges("bctc", 400), IN_WINDOW_OFF_HOURS, noopSendWork,
    );

    expect(result.breaches).toBe(0);
    expect(result.escalations).toBe(0);
    expect(calls.length).toBe(0);
    db.close();
  });

  it("C-7: service-down (unreachable) => escalation IS called, severity CRITICAL (real crash)", async () => {
    const db = makeDb();
    insertHealthRow(db, "unreachable");

    const { spy, calls } = makeEscalateSpy();
    const result = await runFreshnessSlaMonitor(
      db, spy, staleAges("bctc", 50), IN_WINDOW_OFF_HOURS, noopSendWork,
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.signalType).toBe("bctc");
    expect(calls[0]!.severity).toBe("CRITICAL");
    db.close();
  });

  it("C-8: queue backlog (pending>0) + push-age>SLA => escalation IS called (true positive preserved)", async () => {
    const db = makeDb();
    insertQueueRow(db, "VCB", "pending");
    insertHealthRow(db, "healthy");

    const { spy, calls } = makeEscalateSpy();
    const result = await runFreshnessSlaMonitor(
      db, spy, staleAges("bctc", 400), IN_WINDOW_OFF_HOURS, noopSendWork,
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(calls[0]!.signalType).toBe("bctc");
    db.close();
  });

  it("C-9: missing bctc_vps_queue/vps_service_health tables => legacy behavior unchanged (still escalates)", async () => {
    // Mirrors 1407b MH-3's bare schema (sla_breach_audit only) — proves the
    // fix is fail-open and does not regress environments without the new tables.
    const bareDb = new Database(":memory:");
    bareDb.run(`
      CREATE TABLE IF NOT EXISTS sla_breach_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_type TEXT NOT NULL CHECK(signal_type IN ('price', 'bctc', 'news', 'sbv_fx', 'foreign_flow')),
        breached_at TEXT NOT NULL DEFAULT (datetime('now')),
        age_minutes INTEGER NOT NULL,
        threshold_minutes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'breach_open' CHECK(status IN ('breach_open', 'recovered')),
        severity TEXT NOT NULL CHECK(severity IN ('HIGH', 'CRITICAL')),
        escalation_callback_sent INTEGER DEFAULT 0,
        recovered_at TEXT,
        UNIQUE(signal_type, breached_at)
      )
    `);

    const { spy, calls } = makeEscalateSpy();
    const result = await runFreshnessSlaMonitor(
      bareDb, spy, staleAges("bctc", 400), IN_WINDOW_OFF_HOURS, noopSendWork,
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(calls[0]!.signalType).toBe("bctc");
    bareDb.close();
  });
});
