/**
 * TASK_1981 — P1 Failure-Mode Matrix (8 scenarios from brief §7)
 *
 * Sprint: CROSS-SESSION-MULTI-TEAM-ORCH
 * Brief: docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §7 P1
 *
 * Covers all 8 failure-mode scenarios:
 *   S1. Double-claim race         — exactly one {claimed:true}, other {claimed:false, current_holder}
 *   S2. Self-held false-positive  — cowork double-fire: loser sees peer UUID → DEFER, no heartbeat probe
 *   S3. Stale reclaim after crash — Session B steals after TTL → {claimed:true, stolen:true}
 *   S4. Rebuild after mcp-server  — heartbeat matches on owner_client_session, NOT owner_session
 *   S5. Release by wrong session  — {ok:true, released:0} no-op; correct owner → released:1
 *   S6. Clock source              — expires_at is Unix epoch-seconds, NOT milliseconds or ISO string
 *   S7. DB unavailable (F3)       — {claimed:false, error:"db_unavailable"} → fail-closed
 *   S8. Read-before-fire cadence  — claim mutex is authoritative; no pre-read needed; second exits
 *
 * SECURITY: owner_client_session is a coordination key — never echo/log it.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  claimTask,
  heartbeatTask,
  releaseTask,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  ensureCoordinationTable(db);
  return db;
}

/** Force a lock's expires_at to a past epoch so it appears stale. */
function expireLock(db: Database, task_id: string): void {
  db.prepare("UPDATE task_locks SET expires_at = 1000, heartbeat_at = 1000 WHERE task_id = ?")
    .run(task_id);
}

/** Force a lock's heartbeat_at to a past time (simulating crash). */
function staleHeartbeat(db: Database, task_id: string, ageSeconds: number): void {
  const staleAt = Math.floor(Date.now() / 1000) - ageSeconds;
  db.prepare("UPDATE task_locks SET heartbeat_at = ? WHERE task_id = ?").run(staleAt, task_id);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let testDb: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  testDb = createTestDb();
  _injectCoordinationDb(testDb);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// S1: Double-claim race — exactly one {claimed:true}
// ---------------------------------------------------------------------------

describe("S1: Double-claim race (brief §7 P1 scenario 1)", () => {
  it("two sessions claim same task_id synchronously — exactly one wins, loser gets current_holder with session discriminator", () => {
    const TASK_ID = "sprint-task:s1-race";
    const SESSION_A = "session-s1-winner";
    const SESSION_B = "session-s1-loser";

    const r1 = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-pid-001",
      owner_agent: "dev-team",
      owner_client_session: SESSION_A,
      ttl_seconds: 3600,
    });
    expect(r1.claimed).toBe(true);

    // Session B tries to claim the same lock in the same tick
    const r2 = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-pid-002",
      owner_agent: "dev-team",     // same role — the bug scenario
      owner_client_session: SESSION_B,
      ttl_seconds: 3600,
    });
    expect(r2.claimed).toBe(false);

    // current_holder must expose the winner's owner_client_session
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder).toBeDefined();
    expect(holder!["owner_client_session"]).toBe(SESSION_A);
    // Loser's own UUID is NOT the holder — discriminator works
    expect(holder!["owner_client_session"]).not.toBe(SESSION_B);
  });
});

// ---------------------------------------------------------------------------
// S2: Self-held false-positive (cowork double-fire)
// ---------------------------------------------------------------------------

describe("S2: Self-held false-positive — cowork double-fire (brief §7 P1 scenario 2)", () => {
  it("loser session sees peer UUID in current_holder and must DEFER — heartbeat probe path is NOT a valid escape", () => {
    const LEADER_KEY = "cowork-leader";
    const SESSION_LEADER = "session-s2-first-dispatcher";
    const SESSION_FOLLOWER = "session-s2-second-dispatcher";

    // Session 1 (leader) claims the cowork-leader lock
    const r1 = claimTask({
      task_id: LEADER_KEY,
      task_kind: "cowork-slot",
      owner_session: "srv-A",
      owner_agent: "cowork-dispatcher",
      owner_client_session: SESSION_LEADER,
      ttl_seconds: 1800,
    });
    expect(r1.claimed).toBe(true);

    // Session 2 (same role) tries to claim — will see claimed:false
    const r2 = claimTask({
      task_id: LEADER_KEY,
      task_kind: "cowork-slot",
      owner_session: "srv-B",
      owner_agent: "cowork-dispatcher",   // same role — this is the cowork double-fire scenario
      owner_client_session: SESSION_FOLLOWER,
      ttl_seconds: 1800,
    });
    expect(r2.claimed).toBe(false);

    // Protocol check: current_holder.owner_client_session != $CLAUDE_CODE_SESSION_ID (SESSION_FOLLOWER)
    // → DEFER. Do NOT call task_heartbeat to check ownership — that path is deleted.
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder).toBeDefined();
    expect(holder!["owner_client_session"]).toBe(SESSION_LEADER);    // peer session UUID
    expect(holder!["owner_client_session"]).not.toBe(SESSION_FOLLOWER);  // not self

    // Verify: Session 2 heartbeat (using its own UUID) fails — confirming it CANNOT
    // masquerade as the leader via heartbeat (the deleted self-held-heartbeat anti-pattern).
    // Pre-P1 behavior: heartbeat(owner_agent="cowork-dispatcher") returned ok=true for BOTH.
    // Post-P1 (P1-FINAL): heartbeat(owner_client_session=SESSION_FOLLOWER) returns ok=false.
    const hbResult = heartbeatTask(LEADER_KEY, SESSION_FOLLOWER);
    expect(hbResult.ok).toBe(false);
    expect(hbResult.expires_at).toBe(0);

    // Leader's own heartbeat still works (ownership is exclusive)
    const hbLeader = heartbeatTask(LEADER_KEY, SESSION_LEADER);
    expect(hbLeader.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S3: Stale reclaim after crash
// ---------------------------------------------------------------------------

describe("S3: Stale reclaim after crash (brief §7 P1 scenario 3)", () => {
  it("Session A claims → simulated crash (heartbeat stops → TTL expires) → Session B steals → {claimed:true, stolen:true}", () => {
    const TASK_ID = "sprint-task:s3-crash-steal";
    const SESSION_A = "session-s3-crashed";
    const SESSION_B = "session-s3-adopter";

    // Session A claims
    const rA = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-pre-crash",
      owner_agent: "dev-team",
      owner_client_session: SESSION_A,
      ttl_seconds: 3600,
    });
    expect(rA.claimed).toBe(true);

    // Simulate crash: TTL expires (Session A stops heartbeating)
    expireLock(testDb, TASK_ID);

    // Session B claims after TTL expiry
    const rB = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-post-crash",
      owner_agent: "dev-team",
      owner_client_session: SESSION_B,
      ttl_seconds: 3600,
    });
    expect(rB.claimed).toBe(true);
    expect((rB as { stolen?: boolean }).stolen).toBe(true);  // stale-steal fired

    // DB row now carries Session B's owner_client_session
    const row = testDb.prepare("SELECT owner_client_session FROM task_locks WHERE task_id = ?")
      .get(TASK_ID) as { owner_client_session: string } | null;
    expect(row).not.toBeNull();
    expect(row!.owner_client_session).toBe(SESSION_B);
    expect(row!.owner_client_session).not.toBe(SESSION_A);
  });
});

// ---------------------------------------------------------------------------
// S4: Reclaim after mcp-server rebuild (owner_session rotates, owner_client_session survives)
// ---------------------------------------------------------------------------

describe("S4: Reclaim after mcp-server rebuild (brief §7 P1 scenario 4)", () => {
  it("Session A claims with owner_session=srv-before, container rebuilds (srv-after), heartbeat with same owner_client_session → ok=true (no zombie)", () => {
    const TASK_ID = "sprint-task:s4-rebuild";
    const SESSION_A = "session-s4-survives-rebuild";
    const SERVER_BEFORE = "pid-1000-ts-1700000000000";   // pre-rebuild server session
    const SERVER_AFTER  = "pid-2000-ts-1700000060000";   // post-rebuild (rotated)

    // Session A claims with pre-rebuild server session
    const rA = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: SERVER_BEFORE,
      owner_agent: "dev-team",
      owner_client_session: SESSION_A,
      ttl_seconds: 3600,
    });
    expect(rA.claimed).toBe(true);

    // Container rebuilds: SERVER_SESSION_ID rotates to SERVER_AFTER.
    // Session A's CLAUDE_CODE_SESSION_ID (SESSION_A) is unchanged.
    // Heartbeat now comes from a process that has SERVER_AFTER as its server session.
    // BUT the store matches on owner_client_session (not owner_session), so it succeeds.
    //
    // Simulate: heartbeat using SESSION_A (the client session that survived rebuild)
    const hbResult = heartbeatTask(TASK_ID, SESSION_A);
    expect(hbResult.ok).toBe(true);        // no zombie — client UUID matched
    expect(hbResult.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Verify the row: owner_session was set at claim time (SERVER_BEFORE) and hasn't changed,
    // but the lock is still alive and owned by SESSION_A (the durable client key).
    const row = testDb.prepare(
      "SELECT owner_session, owner_client_session FROM task_locks WHERE task_id = ?"
    ).get(TASK_ID) as { owner_session: string; owner_client_session: string } | null;
    expect(row!.owner_client_session).toBe(SESSION_A);
    // The pre-rebuild owner_session is still in the row (not updated by heartbeat)
    // — that's fine; it's diagnostic-only; the live key is owner_client_session.
    expect(row!.owner_session).toBe(SERVER_BEFORE);
  });
});

// ---------------------------------------------------------------------------
// S5: Release by wrong session
// ---------------------------------------------------------------------------

describe("S5: Release by wrong session (brief §7 P1 scenario 5)", () => {
  it("Session B release → {ok:true, released:0} (no-op, lock untouched); Session A release → {ok:true, released:1}", () => {
    const TASK_ID = "sprint-task:s5-wrong-release";
    const SESSION_A = "session-s5-owner";
    const SESSION_B = "session-s5-intruder";

    claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-s5",
      owner_agent: "dev-team",
      owner_client_session: SESSION_A,
      ttl_seconds: 3600,
    });

    // Session B (different UUID) tries to release Session A's live lock
    const relB = releaseTask(TASK_ID, SESSION_B);
    expect(relB.ok).toBe(true);
    expect((relB as { released?: number }).released).toBe(0);  // no-op, anti-theft

    // Lock is still alive and owned by Session A
    const rowAfterB = testDb.prepare("SELECT owner_client_session FROM task_locks WHERE task_id = ?")
      .get(TASK_ID) as { owner_client_session: string } | null;
    expect(rowAfterB).not.toBeNull();
    expect(rowAfterB!.owner_client_session).toBe(SESSION_A);

    // Session A (correct owner) releases its own lock
    const relA = releaseTask(TASK_ID, SESSION_A);
    expect(relA.ok).toBe(true);
    expect((relA as { released?: number }).released).toBe(1);

    // Lock is gone
    const rowAfterA = testDb.prepare("SELECT * FROM task_locks WHERE task_id = ?").get(TASK_ID);
    expect(rowAfterA).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S6: Clock source — expires_at is Unix epoch-seconds (not milliseconds, not ISO)
// ---------------------------------------------------------------------------

describe("S6: Clock source — server-side unixepoch('now') only (brief §7 P1 scenario 6)", () => {
  it("expires_at in DB is Unix epoch-seconds (not ms, not ISO string)", () => {
    const TASK_ID = "sprint-task:s6-clock";
    const SESSION = "session-s6-clock-check";
    const TTL = 3600;
    const BEFORE = Math.floor(Date.now() / 1000);

    claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-s6",
      owner_agent: "dev-team",
      owner_client_session: SESSION,
      ttl_seconds: TTL,
    });

    const AFTER = Math.floor(Date.now() / 1000);

    const row = testDb.prepare(
      "SELECT expires_at, claimed_at, heartbeat_at FROM task_locks WHERE task_id = ?"
    ).get(TASK_ID) as { expires_at: number; claimed_at: number; heartbeat_at: number } | null;
    expect(row).not.toBeNull();

    const { expires_at, claimed_at, heartbeat_at } = row!;

    // All timestamps must be in Unix epoch-seconds range (reasonable modern epoch: 2020-2035)
    const MIN_EPOCH_S = 1577836800;   // 2020-01-01T00:00:00Z in seconds
    const MAX_EPOCH_S = 2051222400;   // 2035-01-01T00:00:00Z in seconds

    expect(claimed_at).toBeGreaterThanOrEqual(MIN_EPOCH_S);
    expect(claimed_at).toBeLessThanOrEqual(MAX_EPOCH_S);

    expect(heartbeat_at).toBeGreaterThanOrEqual(MIN_EPOCH_S);
    expect(heartbeat_at).toBeLessThanOrEqual(MAX_EPOCH_S);

    // expires_at = claimed_at + TTL (approximately)
    expect(expires_at).toBeGreaterThanOrEqual(BEFORE + TTL);
    expect(expires_at).toBeLessThanOrEqual(AFTER + TTL + 2);  // +2 for test execution slack

    // NOT milliseconds: if it were ms, expires_at would be > 10^12 (well past MAX_EPOCH_S)
    expect(expires_at).toBeLessThan(1e12);  // millisecond timestamps exceed this by 1000x

    // NOT an ISO string (typeof number, not string)
    expect(typeof expires_at).toBe("number");
    expect(typeof claimed_at).toBe("number");
    expect(typeof heartbeat_at).toBe("number");
  });

  it("heartbeat renews expires_at using server-side unixepoch('now') — no client Date.now() crosses the wire", () => {
    const TASK_ID = "sprint-task:s6-hb-clock";
    const SESSION = "session-s6-hb";
    const TTL = 3600;

    claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-s6-hb",
      owner_agent: "dev-team",
      owner_client_session: SESSION,
      ttl_seconds: TTL,
    });

    const beforeHb = Math.floor(Date.now() / 1000);
    const hb = heartbeatTask(TASK_ID, SESSION);
    const afterHb = Math.floor(Date.now() / 1000);

    expect(hb.ok).toBe(true);
    // expires_at returned by heartbeat is in epoch-seconds range
    expect(hb.expires_at).toBeGreaterThanOrEqual(beforeHb + TTL);
    expect(hb.expires_at).toBeLessThanOrEqual(afterHb + TTL + 2);
    expect(hb.expires_at).toBeLessThan(1e12);  // not milliseconds
  });
});

// ---------------------------------------------------------------------------
// S7: DB unavailable (fail-closed) — {claimed:false, error:"db_unavailable"}
// ---------------------------------------------------------------------------

describe("S7: DB unavailable fail-closed (brief §7 P1 scenario 7)", () => {
  it("when DB cannot be opened, claimTask returns {claimed:false, error:'db_unavailable'} — dispatcher fails closed", () => {
    // Reset the DB state (clears both _coordDb and _coordDbUnavailable).
    // Then set a bad COORDINATION_DB_PATH so getCoordinationDb() fails on next call.
    _resetCoordinationDbState();
    // No _injectCoordinationDb — force the store to try opening the real path.
    // Override path to an unreadable location.
    const orig = Bun.env["COORDINATION_DB_PATH"];
    Bun.env["COORDINATION_DB_PATH"] = "/nonexistent/path/that/cannot/be/opened/coordination.db";

    try {
      const result = claimTask({
        task_id: "sprint-task:s7-db-unavailable",
        task_kind: "sprint-task",
        owner_session: "srv-s7",
        owner_agent: "dev-team",
        owner_client_session: "session-s7-fail-closed",
        ttl_seconds: 3600,
      });

      // Must fail closed — never spawn when DB is unreachable
      expect(result.claimed).toBe(false);
      expect((result as { error?: string }).error).toBe("db_unavailable");
    } finally {
      // Restore env and re-inject test DB for subsequent tests in afterEach
      if (orig !== undefined) {
        Bun.env["COORDINATION_DB_PATH"] = orig;
      } else {
        delete Bun.env["COORDINATION_DB_PATH"];
      }
      // Re-inject a clean DB (afterEach will call _resetCoordinationDbState but
      // the test teardown expects testDb to be injectable)
      _resetCoordinationDbState();
      _injectCoordinationDb(testDb);
    }
  });
});

// ---------------------------------------------------------------------------
// S8: Read-before-fire cadence race — claimed:true is authoritative
// ---------------------------------------------------------------------------

describe("S8: Read-before-fire cadence race (brief §7 P1 scenario 8)", () => {
  it("claim mutex is the sole authority — second session that loses gets claimed:false and must EXIT without doing work", () => {
    // Scenario: two sessions check the same cron tick simultaneously.
    // Pre-P1 anti-pattern: sessions read 'held' state BEFORE claiming, then race.
    // Post-P1 protocol: DO NOT pre-read; just call task_claim; claimed:true = authoritative.
    //
    // This test verifies the mutex outcome: exactly one winner, other gets clean DEFER signal.

    const TICK_KEY = "cron:cowork-main:2026-06-23/2026-06-29";  // period-keyed cron slot
    const SESSION_EARLY = "session-s8-early";
    const SESSION_LATE  = "session-s8-late";

    // Both sessions attempt to claim the same tick key (mid-tick race)
    const rEarly = claimTask({
      task_id: TICK_KEY,
      task_kind: "cowork-slot",
      owner_session: "srv-early",
      owner_agent: "cowork-dispatcher",
      owner_client_session: SESSION_EARLY,
      ttl_seconds: 1800,
    });

    const rLate = claimTask({
      task_id: TICK_KEY,
      task_kind: "cowork-slot",
      owner_session: "srv-late",
      owner_agent: "cowork-dispatcher",
      owner_client_session: SESSION_LATE,
      ttl_seconds: 1800,
    });

    // Exactly one must win
    const winCount = [rEarly.claimed, rLate.claimed].filter(Boolean).length;
    expect(winCount).toBe(1);

    // The loser gets claimed:false with current_holder (DEFER signal)
    const loser = rEarly.claimed ? rLate : rEarly;
    expect(loser.claimed).toBe(false);
    const holder = (loser as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder).toBeDefined();
    // Loser can now compare current_holder.owner_client_session to its own UUID
    // and DEFER (§3 protocol — trust the claim, never pre-read).
    const winner = rEarly.claimed ? SESSION_EARLY : SESSION_LATE;
    expect(holder!["owner_client_session"]).toBe(winner);
  });

  it("claimed:true is unconditionally trusted — no heartbeat probe needed to confirm ownership", () => {
    // Post-P1 invariant: if task_claim returns {claimed:true}, the session owns the lock.
    // No secondary heartbeat call is needed to "confirm" ownership.
    // This test verifies that claim + immediate work is safe (no TOCTOU gap on claimed:true).
    const TASK_ID = "sprint-task:s8-trust-claim";
    const SESSION = "session-s8-trust";

    const r = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-s8",
      owner_agent: "dev-team",
      owner_client_session: SESSION,
      ttl_seconds: 3600,
    });
    expect(r.claimed).toBe(true);

    // Verify ownership in DB without a heartbeat probe — the row is there
    const row = testDb.prepare(
      "SELECT owner_client_session, expires_at FROM task_locks WHERE task_id = ?"
    ).get(TASK_ID) as { owner_client_session: string; expires_at: number } | null;
    expect(row).not.toBeNull();
    expect(row!.owner_client_session).toBe(SESSION);
    // Lock is live (not expired)
    expect(row!.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
