/**
 * Task 1952g — get_cycle_bootstrap returns agent_signals=[] despite signals existing
 *
 * Root cause: freshnessSlaMonitorJob.escalateToCommander() used toAgent="05-alert-commander"
 * (typo) instead of "alert-commander". Bootstrap queries to_agent='alert-commander' and
 * therefore missed every SLA-breach signal.
 *
 * RED: escalateToCommander writes to_agent='alert-commander' (not '05-alert-commander').
 * GREEN: fix the typo in freshnessSlaMonitorJob.ts line 463.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";
import { getSignals } from "../infrastructure/db/agentSignalStore.js";
import { escalateToCommander } from "../scheduler/system/freshnessSlaMonitorJob.js";
import type { Database } from "bun:sqlite";

describe("Task 1952g — escalateToCommander to_agent recipient correctness", () => {
  let db: Database;

  beforeAll(async () => {
    Bun.env.DB_PATH = ":memory:";
    await initDatabase();
    db = getDb();
  });

  it("TC1 — escalateToCommander writes to_agent='alert-commander' (not '05-alert-commander')", async () => {
    // RED: this will fail before the fix because toAgent='05-alert-commander'
    await escalateToCommander("price", 20, 10, "HIGH");

    // Read signals addressed to 'alert-commander' (same query bootstrap uses)
    const signals = getSignals(db, "alert-commander", { status: "all" });

    const slaSignals = signals.filter(
      (s) => s.fromAgent === "freshness-sla-monitor"
    );

    expect(slaSignals.length).toBeGreaterThan(0);
    expect(slaSignals[0]!.toAgent).toBe("alert-commander");
  });

  it("TC2 — bootstrap for alert-commander sees SLA breach signal (end-to-end)", async () => {
    // Seed a second breach to ensure getCycleBootstrap returns it
    await escalateToCommander("news", 45, 30, "CRITICAL");

    const { getCycleBootstrap } = await import(
      "../application/usecases/getCycleBootstrap.js"
    );
    const result = await getCycleBootstrap(db, "alert-commander");

    // Bootstrap must see at least one signal (the SLA breach we just escalated)
    const slaSignals = (result.agent_signals as Array<{ fromAgent: string }>).filter(
      (s) => s.fromAgent === "freshness-sla-monitor"
    );

    expect(slaSignals.length).toBeGreaterThan(0);
  });

  it("TC3 — no signal is addressd to '05-alert-commander' after fix", async () => {
    await escalateToCommander("bctc", 130, 120, "HIGH");

    const rows = db
      .query<{ to_agent: string }, []>(
        "SELECT to_agent FROM agent_signals WHERE from_agent = 'freshness-sla-monitor'"
      )
      .all();

    const malformed = rows.filter((r) => r.to_agent === "05-alert-commander");
    expect(malformed.length).toBe(0);
  });
});
