/**
 * DS-OBS-01-FIX — freshnessSlaMonitor must send a direct WORK/BUG telegram
 * alert when a source breaches its stale_threshold.
 *
 * Root cause (RAW-verified at source, see docs/agent-memory/decisions/
 * sprint-ds-obs-01-fix-dev-mcp-server.md): escalateToCommander() (the default
 * escalation callback) only writes an agent_signals row (urgent_news,
 * toAgent="alert-commander") — it never calls a telegram sender. Per
 * docs/agents/alert-commander/flow/stage-signals.md's documented 2026-07-12
 * finding, alert-commander correctly SUPPRESSES these synthetic
 * freshness-sla-monitor urgent_news signals every cycle as infra noise (they
 * never satisfy the position-danger / watchlist-opportunity firing gate) — so
 * the signal-bus escalation path never reaches a human-visible channel.
 *
 * Fix: runFreshnessSlaMonitor() now sends a direct alert at the same
 * cooldown-gated escalation site: CRITICAL breach -> BUG (sendBugFn,
 * default sendTelegramBug), HIGH breach -> WORK (sendWorkFn, default
 * sendTelegramWork). Both are injectable for testing.
 *
 * Covered cases:
 *   TC-1: HIGH breach   -> sendWorkFn called with a "[sla-monitor] HIGH breach" message; sendBugFn NOT called
 *   TC-2: CRITICAL breach -> sendBugFn called with a "[sla-monitor] CRITICAL breach" message; no breach-scoped WORK call
 *   TC-3: off-hours market-hours-only skip -> neither sender gets a breach-scoped call
 *   TC-4: cooldown-active -> neither sender gets a breach-scoped call (already alerted within 60min)
 *   TC-5: no breach (all fresh) -> neither sender gets a breach-scoped call
 *   TC-6: sendBugFn throws -> non-fatal; escalation bookkeeping (escalations count, markEscalationSent) unaffected
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runFreshnessSlaMonitor,
  resetSummaryGate,
  type EscalationCallback,
} from "../scheduler/system/freshnessSlaMonitorJob.js";
import type { SignalType } from "../domain/services/freshnessSlaChecker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema helper — mirrors sla_breach_audit DDL from schema-system.ts
// (same minimal shape used by 1407b-sla-market-hours-gate.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS sla_breach_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL,
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
  return db;
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

function noopEscalate(): EscalationCallback {
  return async () => { /* no-op — this test targets the direct WORK/BUG send, not the signal-bus path */ };
}

/** Records every (msg) call made to an injected sender fn. Optionally throws. */
function makeSenderSpy(opts: { throws?: boolean } = {}): {
  fn: (msg: string) => Promise<unknown>;
  calls: string[];
} {
  const calls: string[] = [];
  const fn = async (msg: string): Promise<unknown> => {
    calls.push(msg);
    if (opts.throws) throw new Error("send failed (simulated)");
    return true;
  };
  return { fn, calls };
}

/** Filters out the unconditional once-daily coverage snapshot, isolating breach-scoped alerts. */
function breachScoped(calls: string[]): string[] {
  return calls.filter((m) => m.startsWith("[sla-monitor]") && m.includes("breach:"));
}

// Monday 2026-04-27 04:00 UTC = VN market hours (02:00-08:59 UTC)
const MARKET_HOURS_NOW = new Date("2026-04-27T04:00:00.000Z");
// Monday 2026-04-27 00:30 UTC = off-hours
const OFF_HOURS_NOW = new Date("2026-04-27T00:30:00.000Z");

let db: Database;

beforeEach(() => {
  db = makeDb();
  resetSummaryGate();
});

describe("DS-OBS-01-FIX — direct WORK/BUG alert on SLA breach", () => {
  it("TC-1: HIGH breach (news 40min > 30min threshold, <=45min 1.5x) sends WORK, not BUG", async () => {
    const work = makeSenderSpy();
    const bug = makeSenderSpy();

    const result = await runFreshnessSlaMonitor(
      db,
      noopEscalate(),
      staleAges("news", 40),
      MARKET_HOURS_NOW,
      work.fn,
      [], // injectedCoverageMapRows — skip disk read, isolate to the 12-signal pass
      undefined,
      bug.fn,
    );

    expect(result.breaches).toBe(1);
    const workBreachCalls = breachScoped(work.calls);
    expect(workBreachCalls.length).toBe(1);
    expect(workBreachCalls[0]).toContain("HIGH breach: news");
    expect(workBreachCalls[0]).toContain("40min");
    expect(workBreachCalls[0]).toContain("threshold 30min");
    expect(breachScoped(bug.calls).length).toBe(0);
  });

  it("TC-2: CRITICAL breach (news 50min > 45min = 1.5x threshold) sends BUG, not a breach-scoped WORK message", async () => {
    const work = makeSenderSpy();
    const bug = makeSenderSpy();

    const result = await runFreshnessSlaMonitor(
      db,
      noopEscalate(),
      staleAges("news", 50),
      MARKET_HOURS_NOW,
      work.fn,
      [],
      undefined,
      bug.fn,
    );

    expect(result.breaches).toBe(1);
    expect(bug.calls.length).toBe(1);
    expect(bug.calls[0]).toContain("CRITICAL breach: news");
    expect(bug.calls[0]).toContain("50min");
    expect(breachScoped(work.calls).length).toBe(0);
  });

  it("TC-3: off-hours market-hours-only signal (price) skips both senders (breach-scoped)", async () => {
    const work = makeSenderSpy();
    const bug = makeSenderSpy();

    // price threshold off-hours is dynamic; use a very large age to guarantee breach.
    const result = await runFreshnessSlaMonitor(
      db,
      noopEscalate(),
      staleAges("price", 100000),
      OFF_HOURS_NOW,
      work.fn,
      [],
      undefined,
      bug.fn,
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(0);
    expect(breachScoped(work.calls).length).toBe(0);
    expect(bug.calls.length).toBe(0);
  });

  it("TC-4: escalation cooldown active (already alerted <60min ago) skips both senders (breach-scoped)", async () => {
    const work = makeSenderSpy();
    const bug = makeSenderSpy();

    // Simulate a prior escalation already sent for 'news' within the last 60 minutes.
    // breached_at is offset -5min (not "now") so it does not collide with the
    // UNIQUE(signal_type, breached_at) constraint against this run's own recordSlaBreach() insert.
    db.run(
      `INSERT INTO sla_breach_audit (signal_type, breached_at, age_minutes, threshold_minutes, status, severity, escalation_callback_sent)
       VALUES ('news', datetime('now', '-5 minutes'), 50, 30, 'breach_open', 'CRITICAL', 1)`
    );

    const result = await runFreshnessSlaMonitor(
      db,
      noopEscalate(),
      staleAges("news", 50),
      MARKET_HOURS_NOW,
      work.fn,
      [],
      undefined,
      bug.fn,
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(0);
    expect(breachScoped(work.calls).length).toBe(0);
    expect(bug.calls.length).toBe(0);
  });

  it("TC-5: no breach (all sources fresh) sends neither sender (breach-scoped)", async () => {
    const work = makeSenderSpy();
    const bug = makeSenderSpy();

    const result = await runFreshnessSlaMonitor(
      db,
      noopEscalate(),
      freshAges(),
      MARKET_HOURS_NOW,
      work.fn,
      [],
      undefined,
      bug.fn,
    );

    expect(result.breaches).toBe(0);
    expect(breachScoped(work.calls).length).toBe(0);
    expect(bug.calls.length).toBe(0);
  });

  it("TC-6: sendBugFn throwing is non-fatal — escalation bookkeeping still completes", async () => {
    const work = makeSenderSpy();
    const bug = makeSenderSpy({ throws: true });

    const result = await runFreshnessSlaMonitor(
      db,
      noopEscalate(),
      staleAges("news", 50),
      MARKET_HOURS_NOW,
      work.fn,
      [],
      undefined,
      bug.fn,
    );

    // Did not throw out of runFreshnessSlaMonitor (awaited above without try/catch).
    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(bug.calls.length).toBe(1); // attempted, then failed — non-fatal

    const row = db
      .query<{ escalation_callback_sent: number }, [string]>(
        `SELECT escalation_callback_sent FROM sla_breach_audit WHERE signal_type = ?`
      )
      .get("news");
    expect(row?.escalation_callback_sent).toBe(1);
  });
});
