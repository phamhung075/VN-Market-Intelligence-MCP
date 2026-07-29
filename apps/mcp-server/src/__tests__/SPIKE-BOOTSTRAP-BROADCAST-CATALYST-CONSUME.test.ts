/**
 * SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME
 *
 * get_cycle_bootstrap under-returned shared/broadcast chain_catalyst signals
 * vs get_agent_signals (recurring 2+: 2026-07-21 08:20Z, 2026-07-22 04:29Z).
 * Live probe found catalyst id 8779 on the bus and in alert-commander's
 * inbox, but status='read' — something had already consumed it before
 * bootstrap could return it as unread.
 *
 * ROOT CAUSE (confirmed): getCycleBootstrap and get_agent_signals inbox-mode
 * both call getSignals(db, agent, {status:'unread'}), which UPDATEs the row's
 * SINGLE GLOBAL `status` column unread->read on read. agent_signals has no
 * per-recipient read-state table. For a to_agent='all' broadcast row, the
 * FIRST recipient to bootstrap flips status globally, so every OTHER
 * recipient's later bootstrap (unread-only) silently misses it — this is a
 * structural single-reader-consumed defect, not a pure creation-order timing
 * artifact (each test below constructs the broadcast BEFORE both bootstrap
 * calls, ruling out "signal created after the call ran").
 *
 * FIX: getBroadcastSignals() (agentSignalStore.ts) — a non-consuming query
 * bounded only by expires_at (never status) for to_agent='all' rows.
 * getCycleBootstrap merges this with the normal getSignals() result, deduped
 * by id, so every recipient sees every unexpired broadcast regardless of
 * read order.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  postSignal,
  getSignals,
  getBroadcastSignals,
} from "../infrastructure/db/agentSignalStore.js";
import { getCycleBootstrap } from "../application/usecases/getCycleBootstrap.js";
import type { Database } from "bun:sqlite";

describe("SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME", () => {
  let db: Database;

  beforeEach(async () => {
    Bun.env["DB_PATH"] = ":memory:";
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("AC-1: a to_agent='all' broadcast catalyst is visible to a SECOND recipient's bootstrap after a FIRST recipient already bootstrapped (the exact 8779 recurrence shape)", async () => {
    const catalystId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "VNM",
      payload: { title: "-2.67% selloff catalyst" },
      findingData: { event_type: "macro" },
    });
    expect(catalystId).toBeGreaterThan(0);

    // FIRST recipient bootstraps — this is the call whose own getSignals()
    // unread->read UPDATE used to silently orphan every other recipient.
    const first = await getCycleBootstrap(db, "alert-commander");
    const firstIds = (first.agent_signals as Array<{ id: number }>).map((s) => s.id);
    expect(firstIds).toContain(catalystId);

    // The row's global status column IS now 'read' — confirms the mark-read
    // side effect still fires exactly as before (the fix does not disable it).
    const raw = db
      .query<{ status: string }, [number]>("SELECT status FROM agent_signals WHERE id = ?")
      .get(catalystId);
    expect(raw?.status).toBe("read");

    // SECOND, DIFFERENT recipient bootstraps AFTER the first — pre-fix this
    // returned agent_signals=[] for the catalyst because status was already
    // 'read'. Post-fix it must still see it via the non-consuming broadcast union.
    const second = await getCycleBootstrap(db, "digest-predict");
    const secondIds = (second.agent_signals as Array<{ id: number }>).map((s) => s.id);
    expect(secondIds).toContain(catalystId);
  });

  it("AC-2: the broadcast row is not double-counted in the FIRST recipient's own bootstrap result (dedup guard)", async () => {
    const catalystId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "VIC",
      payload: { title: "dedup guard catalyst" },
    });

    const result = await getCycleBootstrap(db, "alert-commander");
    const matches = (result.agent_signals as Array<{ id: number }>).filter(
      (s) => s.id === catalystId,
    );
    expect(matches.length).toBe(1);
  });

  it("AC-3: a THIRD recipient's bootstrap also sees the same broadcast (not just a 2-reader special case)", async () => {
    const catalystId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "HPG",
      payload: { title: "third-reader catalyst" },
    });

    await getCycleBootstrap(db, "alert-commander");
    await getCycleBootstrap(db, "digest-predict");
    const third = await getCycleBootstrap(db, "market-watcher");
    const thirdIds = (third.agent_signals as Array<{ id: number }>).map((s) => s.id);
    expect(thirdIds).toContain(catalystId);
  });

  it("AC-4: regression guard — a genuinely 1:1 addressed (non-broadcast) signal is NOT leaked to an unintended recipient's bootstrap", async () => {
    const directId = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      stockCode: "VCB",
      payload: { title: "not a broadcast" },
    });

    const intended = await getCycleBootstrap(db, "alert-commander");
    expect((intended.agent_signals as Array<{ id: number }>).map((s) => s.id)).toContain(directId);

    const unintended = await getCycleBootstrap(db, "digest-predict");
    expect((unintended.agent_signals as Array<{ id: number }>).map((s) => s.id)).not.toContain(
      directId,
    );
  });

  it("AC-5: getBroadcastSignals() unit — returns to_agent='all' rows regardless of status, excludes direct-addressed and expired rows, does NOT mark-read", () => {
    const broadcastId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      payload: { title: "unit-level broadcast" },
    });
    const directId = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      payload: { title: "unit-level direct" },
    });
    const expiredId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      payload: { title: "already expired broadcast" },
      ttlMinutes: 1,
    });
    // Force-expire it directly (no future-dated writes needed — moves expires_at into the past).
    db.prepare("UPDATE agent_signals SET expires_at = datetime('now', '-1 minutes') WHERE id = ?").run(
      expiredId,
    );

    // Pre-mark the broadcast row 'read' the way a first reader would, via getSignals().
    getSignals(db, "alert-commander");
    const preCheck = db
      .query<{ status: string }, [number]>("SELECT status FROM agent_signals WHERE id = ?")
      .get(broadcastId);
    expect(preCheck?.status).toBe("read");

    const broadcast = getBroadcastSignals(db);
    const ids = broadcast.map((s) => s.id);
    expect(ids).toContain(broadcastId); // still returned despite status='read'
    expect(ids).not.toContain(directId); // direct-addressed row excluded
    expect(ids).not.toContain(expiredId); // expired row excluded

    // Non-consuming: calling it again does not change any row's status.
    const statusAfter = db
      .query<{ status: string }, [number]>("SELECT status FROM agent_signals WHERE id = ?")
      .get(broadcastId);
    expect(statusAfter?.status).toBe("read"); // unchanged, still whatever it was before this call
  });
});
