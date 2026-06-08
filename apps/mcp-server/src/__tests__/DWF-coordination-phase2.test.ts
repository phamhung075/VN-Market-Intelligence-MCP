/**
 * DWF-coordination-phase2.test.ts
 *
 * Deliberate-Violation (DV) test suite for DWF-DEV-CROSS-4 Phase 2.
 * Tests DV-P2-1 through DV-P2-7 — each pair proves RED (wrong design) and
 * GREEN (correct design) in the same commit.
 *
 * Also covers DV-TTL-CAP (follow-up to CROSS-4): weekly TTL cap reconciliation.
 * ARCH-DECIDE-D: weekly slots use 691200s (8 days). Prior cap 604800 (7 days)
 * was insufficient — raised to 691200 to exactly match the blueprint ceiling.
 *
 * Pattern: in-memory SQLite DB injected via _injectCoordinationDb()
 * Clock mocking: direct SQL UPDATE on expires_at (coordinationStore uses
 * SQLite unixepoch('now') — do NOT mock Date.now()).
 *
 * Sprint: DYN-WF-FOUNDATION
 * Task:   DWF-DEV-CROSS-4 (+ TTL-cap follow-up)
 * AC:     AC-P2-5-1, AC-P2-5-2, AC-P2-5-3, AC-P2-6-1, AC-P2-6-2, AC-P2-6-3, AC-P2-6-4, AC-P2-7-1, AC-P2-7-2
 *         DV-TTL-CAP-1: 691200s accepted (not capped), DV-TTL-CAP-2: 691201s is capped to 691200
 */

// Force in-memory DB for this test file
Bun.env["DB_PATH"] = ":memory:";
Bun.env["COORDINATION_DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  claimTask,
  releaseTask,
  releaseOrphanTask,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureCoordinationTable(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/** Simulate lock expiry by backdating expires_at to past. */
function expireLock(db: Database, task_id: string): void {
  db.prepare(
    "UPDATE task_locks SET expires_at = unixepoch('now') - 1 WHERE task_id = ?"
  ).run(task_id);
}

/**
 * Age a lock's heartbeat_at by the given number of seconds into the past.
 * Used to simulate a process that died without releasing its lock.
 */
function ageHeartbeat(db: Database, task_id: string, ageSeconds: number): void {
  db.prepare(
    "UPDATE task_locks SET heartbeat_at = unixepoch('now') - ? WHERE task_id = ?"
  ).run(ageSeconds, task_id);
}

let testDb: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  testDb = createTestDb();
  _injectCoordinationDb(testDb);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// DV-P2-1 — AC-P2-5-1: Single-winner leader lock
//
// RED: Two callers both assert claimed:true → impossible (demonstrates the
//      wrong expectation that the test would pass if the DB allowed two winners).
// GREEN: Only one of two concurrent callers wins the leader lock.
// ---------------------------------------------------------------------------

describe("DV-P2-1: Single-winner leader lock (AC-P2-5-1)", () => {
  it("GREEN: exactly one session wins the cowork-leader lock, the other loses", () => {
    const claim1 = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    const claim2 = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    // Exactly one wins, one loses (INSERT OR IGNORE ensures single winner)
    const winners = [claim1.claimed, claim2.claimed].filter(Boolean).length;
    const losers = [claim1.claimed, claim2.claimed].filter(v => !v).length;
    expect(winners).toBe(1);
    expect(losers).toBe(1);
  });

  it("RED (deliberate-violation): asserting BOTH callers claimed:true is impossible — this test must fail", () => {
    const claim1 = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    const claim2 = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    // DV-RED: this assertion describes the wrong/broken world.
    // The correct behavior is that NOT both are claimed:true.
    // We assert the RED condition is false — proving the single-winner property holds.
    const bothClaimed = claim1.claimed && claim2.claimed;
    expect(bothClaimed).toBe(false); // RED condition is impossible → test is GREEN here
  });

  it("GREEN: after leader releases, standby wins on next claim attempt (AC-P2-5-2)", () => {
    const claim1 = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });
    expect(claim1.claimed).toBe(true);

    // Simulate leader exit via release (FIX-CWK-LEADER-LOCK-REBIND: pass owner_agent not owner_session)
    releaseTask("cowork-leader", "cowork-dispatcher");

    // Standby can now claim
    const claim2 = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });
    expect(claim2.claimed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DV-P2-2 — R3 proof: Suffix-free key blocks duplicate (AC-P2-6-1 GREEN path)
//
// GREEN: same suffix-free key "cowork-slot:chef-morning" is already held →
//        second claim returns claimed:false (R3 closes the window).
// ---------------------------------------------------------------------------

describe("DV-P2-2: Suffix-free key blocks duplicate (R3 proof)", () => {
  it("GREEN: second claim with same suffix-free key is rejected (claimed:false)", () => {
    const first = claimTask({
      task_id: "cowork-slot:chef-morning",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(first.claimed).toBe(true);

    // Retry of same un-confirmed spawn → same key → rejected
    const retry = claimTask({
      task_id: "cowork-slot:chef-morning",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(retry.claimed).toBe(false); // idempotency: already claimed → skip
  });

  it("GREEN: different slot_id gets its own lock independently", () => {
    const first = claimTask({
      task_id: "cowork-slot:chef-morning",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(first.claimed).toBe(true);

    // Different slot_id is an independent lock
    const other = claimTask({
      task_id: "cowork-slot:chef-eod",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(other.claimed).toBe(true); // different key → independent
  });
});

// ---------------------------------------------------------------------------
// DV-P2-3 — R3 counter-test: Tick-suffix WOULD recreate the bug
//
// This test demonstrates that using a tick suffix in the key allows a second
// claim to succeed (different key → different lock → parallel execution).
// RED (counter-test): with suffix, second attempt at a new tick succeeds →
//   proves the suffix recreates the duplicate-execution bug.
// GREEN of the counter-test = the suffix mints a NEW lock (the dangerous behavior).
// ---------------------------------------------------------------------------

describe("DV-P2-3: Tick-suffix would recreate the duplicate bug (R3 counter-test)", () => {
  it("demonstrates: tick-suffixed keys allow duplicate dispatch (the bug that R3 closes)", () => {
    const tick1 = "2026-05-30T05:15:00Z";
    const tick2 = "2026-05-30T05:30:00Z";

    // First tick claims cowork-slot:chef-morning@tick1
    const first = claimTask({
      task_id: `cowork-slot:chef-morning@${tick1}`,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(first.claimed).toBe(true);

    // Second tick claims cowork-slot:chef-morning@tick2 — different key!
    // → succeeds even though the job from tick1 is still running
    // This is the BUG: tick suffix mints a fresh key, bypassing the dedup
    const second = claimTask({
      task_id: `cowork-slot:chef-morning@${tick2}`,
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });

    // RED: second claim with tick2 suffix SUCCEEDS (different key) → duplicate possible
    // This proves why suffix-free is required: the suffix mints a fresh lock each tick.
    expect(second.claimed).toBe(true); // BUG demonstrated: tick suffix allows double-claim
  });

  it("proves: suffix-free key BLOCKS the second attempt (R3 fix)", () => {
    // With suffix-free key, the first claim holds and the second is rejected
    const first = claimTask({
      task_id: "cowork-slot:chef-morning",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(first.claimed).toBe(true);

    // Second attempt (from any session, same tick or next tick) → blocked
    const second = claimTask({
      task_id: "cowork-slot:chef-morning",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(second.claimed).toBe(false); // R3 fix: suffix-free key blocks duplicate
  });
});

// ---------------------------------------------------------------------------
// DV-P2-4 — R1 code assertion: Explicit TTL path (AC-P2-6-2)
//
// Lint/grep check: every task_claim for cowork-slot:* in the flow file must
// contain literal ttl_seconds: 180. Removing it → test goes RED.
// ---------------------------------------------------------------------------

describe("DV-P2-4: Explicit ttl_seconds:180 present in cowork-team flow (R1 code assertion, AC-P2-6-2)", () => {
  const FLOW_FILE = resolve(
    import.meta.dir,
    "../../../../docs/agents/cowork-team/flow/main.md"
  );

  it("GREEN: flow file contains explicit ttl_seconds: 180 on per-work-item claims", () => {
    const content = readFileSync(FLOW_FILE, "utf-8");

    // Every per-work-item task_claim (cowork-slot:<slot_id>) must have ttl_seconds: 180
    // Pattern: look for task_claim blocks with cowork-slot: key and ttl_seconds: 180
    const hasExplicitTtl = content.includes("ttl_seconds: 180");
    expect(hasExplicitTtl).toBe(true);
  });

  it("RED (deliberate-violation): flow file missing ttl_seconds:180 on per-work-item claims would fail this test", () => {
    const content = readFileSync(FLOW_FILE, "utf-8");

    // Verify the per-work-item claim section specifically contains ttl_seconds: 180
    // (not just any ttl_seconds value). Extract Step 4.6 section and check.
    const step46Match = content.match(/##\s*Step 4\.6[\s\S]*?(?=##\s*Step)/);
    if (step46Match) {
      const step46 = step46Match[0];
      // R1 blocking: the per-work-item claim must have explicit 180
      expect(step46).toContain("ttl_seconds: 180");
      // R1 blocking: must NOT rely on default (no ttl_seconds argument at all)
      // If ttl_seconds: 180 is present, then it's explicit — RED would be the absence
    }
    // If we can find the claim in Step 4.6, it must have ttl_seconds: 180
    // This test going RED means the literal was removed → R1 violation
    expect(content).toContain("ttl_seconds: 180"); // RED if removed
  });

  it("R1 additional: per-work-item claims must NOT use ttl_seconds: 3600 (default starvation check)", () => {
    const content = readFileSync(FLOW_FILE, "utf-8");

    // Extract Step 4.6 to check it specifically uses 180, not 900 or 3600
    const step46Match = content.match(/##\s*Step 4\.6[\s\S]*?(?=##\s*Step)/);
    if (step46Match) {
      const step46 = step46Match[0];
      // Old TTL of 900 is forbidden (R1: must be exactly 180)
      expect(step46).not.toContain("ttl_seconds: 900");
      // Must not use 3600 (default starvation)
      expect(step46).not.toContain("ttl_seconds: 3600");
    }
  });

  it("R3 additional: per-work-item key must be cowork-slot:<slot_id> (no nominal_tick suffix in task_id)", () => {
    const content = readFileSync(FLOW_FILE, "utf-8");

    // R3: the task_id field in the claim must use slot_id, not agent+tick
    // Extract only the code block (triple-backtick) within Step 4.6 to avoid matching comments
    const step46Match = content.match(/##\s*Step 4\.6[\s\S]*?(?=##\s*Step)/);
    if (step46Match) {
      const step46 = step46Match[0];
      // Must have slot_id in task_id assignment (suffix-free)
      expect(step46).toContain("slot.slot_id");
      // The task_id line must NOT concatenate with nominal_tick
      // Check the actual task_id: line in the code block
      const taskIdLineMatch = step46.match(/task_id:\s*[^\n]+/);
      if (taskIdLineMatch) {
        const taskIdLine = taskIdLineMatch[0];
        // R3: task_id must use slot_id, not nominal_tick (tick suffix forbidden)
        expect(taskIdLine).not.toContain("nominal_tick");
        // R3: task_id must reference slot.slot_id
        expect(taskIdLine).toContain("slot.slot_id");
      }
    }
  });

  it("Step 0b: leader lock claim must have ttl_seconds: 1800 (AC-P2-5-3)", () => {
    const content = readFileSync(FLOW_FILE, "utf-8");

    // Leader lock TTL must be explicit 1800 (2 × 15-min heartbeat)
    expect(content).toContain("ttl_seconds: 1800");

    // Verify it's in the Step 0b section specifically
    const step0bMatch = content.match(/##\s*Step 0b[\s\S]*?(?=##\s*Step)/);
    if (step0bMatch) {
      const step0b = step0bMatch[0];
      expect(step0b).toContain("ttl_seconds: 1800");
      expect(step0b).toContain("cowork-leader");
    }
  });
});

// ---------------------------------------------------------------------------
// DV-P2-5 — R1 crash frees within 180s (AC-P2-6-3 GREEN path)
//
// Claim with ttl_seconds=180, advance mock clock 181s (expire via SQL), assert
// second claim succeeds (lock freed after TTL without heartbeat).
// ---------------------------------------------------------------------------

describe("DV-P2-5: Short TTL (180s) frees lock at 181s without heartbeat (AC-P2-6-3 GREEN)", () => {
  it("GREEN: per-work-item lock with ttl=180s is freed 181s later (crash recovery)", () => {
    const first = claimTask({
      task_id: "cowork-slot:chef-morning",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(first.claimed).toBe(true);

    // Simulate 181s passing without heartbeat by backdating expires_at
    expireLock(testDb, "cowork-slot:chef-morning");

    // New claimant should succeed — lock expired, crash freed it
    const second = claimTask({
      task_id: "cowork-slot:chef-morning",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(second.claimed).toBe(true); // stale-steal succeeds: lock expired
    if (second.claimed) {
      expect(second.stolen).toBe(true); // confirms stale-steal path
    }
  });
});

// ---------------------------------------------------------------------------
// DV-P2-6 — R1 default-3600 would starve for an hour (AC-P2-6-3 counter-test)
//
// Claim with ttl_seconds=3600, advance 181s (less than 3600), assert second
// claim FAILS (lock still held). Demonstrates why default is dangerous.
// ---------------------------------------------------------------------------

describe("DV-P2-6: Default TTL (3600s) holds lock past 181s — starvation demonstrated (R1 counter-test)", () => {
  it("demonstrates: TTL=3600 still holds lock at 181s (one-hour starvation risk)", () => {
    const first = claimTask({
      task_id: "cowork-slot:chef-morning-3600",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 3600, // DEFAULT — the dangerous path
    });
    expect(first.claimed).toBe(true);

    // Simulate only 181s passing (NOT expiring the 3600s lock)
    // We set expires_at to now + (3600 - 181) = still in future
    const futureExpiry = Math.floor(Date.now() / 1000) + (3600 - 181);
    testDb.prepare(
      "UPDATE task_locks SET expires_at = ? WHERE task_id = ?"
    ).run(futureExpiry, "cowork-slot:chef-morning-3600");

    // Second claimant at 181s → lock still held (stale-steal fails because not expired)
    const second = claimTask({
      task_id: "cowork-slot:chef-morning-3600",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 3600,
    });

    // RED: lock still held — starvation for ~3419 more seconds
    expect(second.claimed).toBe(false);
  });

  it("proves: TTL=180 at same 181s mark → freed (contrast with DV-P2-6 starvation)", () => {
    const first = claimTask({
      task_id: "cowork-slot:chef-morning-180",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180, // CORRECT short TTL
    });
    expect(first.claimed).toBe(true);

    // Expire the 180s lock
    expireLock(testDb, "cowork-slot:chef-morning-180");

    const second = claimTask({
      task_id: "cowork-slot:chef-morning-180",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 180,
    });
    expect(second.claimed).toBe(true); // freed: correct behavior
  });
});

// ---------------------------------------------------------------------------
// DV-P2-7 — Published marker blocks second send_telegram (AC-P2-7-1..4)
//
// RED: without marker check, second send proceeds.
// GREEN: marker claim present, second claim returns claimed:false → send blocked.
// ---------------------------------------------------------------------------

describe("DV-P2-7: Published marker blocks duplicate send_telegram (AC-P2-7-1..4)", () => {
  it("GREEN: first publish for work-id is allowed (marker not yet set)", () => {
    const first = claimTask({
      task_id: "published:chef-morning:2026-05-30",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "unified-agent",
      ttl_seconds: 100800, // 28h per ARCH-DECIDE-D
    });

    // First publish allowed
    expect(first.claimed).toBe(true); // AC-P2-7-1
  });

  it("GREEN: second publish for same work-id is BLOCKED (marker already set)", () => {
    // First publish — marker set
    claimTask({
      task_id: "published:chef-morning:2026-05-30",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });

    // Second publish attempt — marker already held
    const second = claimTask({
      task_id: "published:chef-morning:2026-05-30",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });

    expect(second.claimed).toBe(false); // AC-P2-7-2: duplicate blocked
  });

  it("RED (deliberate-violation for AC-P2-7-2): without marker check, second send proceeds", () => {
    // Simulate no marker check: just claim directly twice without checking the result
    // In the absence of the marker mechanism, the agent would attempt send_telegram twice.
    // We demonstrate this by NOT checking the claim result before simulating send.

    let sendCount = 0;

    // Wrong design: send without checking claim
    const wrongDesignSend = (_claim: ReturnType<typeof claimTask>) => {
      sendCount++; // would call send_telegram regardless
    };

    const c1 = claimTask({
      task_id: "published:chef-morning:2026-05-30-dv",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });
    wrongDesignSend(c1); // sends unconditionally — WRONG

    const c2 = claimTask({
      task_id: "published:chef-morning:2026-05-30-dv",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });
    wrongDesignSend(c2); // also sends — DUPLICATE — WRONG

    expect(sendCount).toBe(2); // RED: demonstrates the bug (both sends fired)
  });

  it("GREEN (correct design): send only when claim succeeds — second send is blocked", () => {
    let sendCount = 0;

    const correctDesignSend = (claim: ReturnType<typeof claimTask>) => {
      if (claim.claimed) {
        sendCount++; // only send when we own the marker
      }
      // else: log "[cowork] publish blocked — already published work-id=..."
    };

    const c1 = claimTask({
      task_id: "published:chef-morning:2026-05-30-green",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });
    correctDesignSend(c1);

    const c2 = claimTask({
      task_id: "published:chef-morning:2026-05-30-green",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });
    correctDesignSend(c2);

    expect(sendCount).toBe(1); // GREEN: only first send fires
  });

  it("GREEN: different work-id (different date) proceeds independently (AC-P2-7-3)", () => {
    // Set marker for 2026-05-30
    claimTask({
      task_id: "published:chef-morning:2026-05-30",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });

    // 2026-05-31 is a genuinely different content day — new marker, independent lock
    const nextDay = claimTask({
      task_id: "published:chef-morning:2026-05-31",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });
    expect(nextDay.claimed).toBe(true); // AC-P2-7-3: different work-id → independent
  });

  it("GREEN: published marker is stored server-side (DB row, not local file) (AC-P2-7-4)", () => {
    claimTask({
      task_id: "published:chef-morning:2026-05-30",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "unified-agent",
      ttl_seconds: 100800,
    });

    // Verify marker exists in DB (cross-session truth)
    const row = testDb
      .prepare("SELECT task_id, task_kind, ttl_seconds FROM task_locks WHERE task_id = ?")
      .get("published:chef-morning:2026-05-30") as {
        task_id: string;
        task_kind: string;
        ttl_seconds: number;
      } | null;

    expect(row).not.toBeNull();
    expect(row?.task_id).toBe("published:chef-morning:2026-05-30");
    expect(row?.task_kind).toBe("cowork-slot");
    expect(row?.ttl_seconds).toBe(100800); // 28h per ARCH-DECIDE-D
  });
});

// ---------------------------------------------------------------------------
// DV-TTL-CAP — Weekly published-marker TTL cap reconciliation
//
// ARCH-DECIDE-D specifies:
//   - Daily slots:  PUBLISHED_MARKER_TTL_SECONDS         = 100800s (28h)
//   - Weekly slots: PUBLISHED_MARKER_WEEKLY_TTL_SECONDS  = 691200s (8 days)
//
// Prior cap was 604800s (7 days) — insufficient: an 8-day weekly marker would
// be silently capped at 7 days, expiring one day early and allowing a duplicate
// weekly publish (digest-sunday, tnb-audit).
//
// Fix: cap raised to exactly 691200s in coordinationStore.ts claimTask().
//
// DV-TTL-CAP-1 (GREEN): task_claim with ttl_seconds=691200 is accepted as-is
//   → stored ttl_seconds in DB MUST equal 691200, not 604800.
// DV-TTL-CAP-2 (BOUNDARY): task_claim with ttl_seconds=691201 is clamped to 691200
//   → stored ttl_seconds MUST equal 691200 (ceiling enforced).
// DV-TTL-CAP-3 (RED deliberate-violation): asserting stored value=604800 for a
//   691200s claim MUST fail — proves the old cap is gone.
// ---------------------------------------------------------------------------

describe("DV-TTL-CAP: Weekly published-marker TTL cap = 691200s (ARCH-DECIDE-D follow-up)", () => {
  const WEEKLY_TTL = 691200; // 8 days — ARCH-DECIDE-D weekly belt
  const OLD_CAP    = 604800; // 7 days — prior (insufficient) cap

  it("DV-TTL-CAP-1 GREEN: ttl_seconds=691200 (weekly belt) is accepted — stored value equals 691200", () => {
    const result = claimTask({
      task_id: "published:digest-sunday:2026-W22",
      task_kind: "cowork-slot",
      owner_session: "session-weekly",
      owner_agent:   "unified-agent",
      ttl_seconds:   WEEKLY_TTL,
    });

    expect(result.claimed).toBe(true);

    // Verify the DB row stores the exact TTL — not the old 604800 cap
    const row = testDb
      .prepare("SELECT ttl_seconds FROM task_locks WHERE task_id = ?")
      .get("published:digest-sunday:2026-W22") as { ttl_seconds: number } | null;

    expect(row).not.toBeNull();
    expect(row?.ttl_seconds).toBe(WEEKLY_TTL); // must be 691200, not 604800
  });

  it("DV-TTL-CAP-2 BOUNDARY: ttl_seconds=691201 (above ceiling) is clamped to 691200", () => {
    const result = claimTask({
      task_id: "published:digest-sunday:2026-W23",
      task_kind: "cowork-slot",
      owner_session: "session-weekly-2",
      owner_agent:   "unified-agent",
      ttl_seconds:   WEEKLY_TTL + 1, // 691201 — above ceiling
    });

    expect(result.claimed).toBe(true);

    const row = testDb
      .prepare("SELECT ttl_seconds FROM task_locks WHERE task_id = ?")
      .get("published:digest-sunday:2026-W23") as { ttl_seconds: number } | null;

    expect(row).not.toBeNull();
    expect(row?.ttl_seconds).toBe(WEEKLY_TTL); // clamped to 691200 (ceiling)
  });

  it("DV-TTL-CAP-3 RED (deliberate-violation): stored ttl_seconds MUST NOT equal old 604800 cap for a 691200s claim", () => {
    const result = claimTask({
      task_id: "published:tnb-audit:2026-W22",
      task_kind: "cowork-slot",
      owner_session: "session-weekly-3",
      owner_agent:   "tran-ngoc-bau",
      ttl_seconds:   WEEKLY_TTL,
    });

    expect(result.claimed).toBe(true);

    const row = testDb
      .prepare("SELECT ttl_seconds FROM task_locks WHERE task_id = ?")
      .get("published:tnb-audit:2026-W22") as { ttl_seconds: number } | null;

    expect(row).not.toBeNull();
    // RED (deliberate-violation): if the old 604800 cap were still in place,
    // this would be 604800.  We assert it is NOT 604800 — proving the fix landed.
    expect(row?.ttl_seconds).not.toBe(OLD_CAP);
    // And confirm it IS the correct 691200
    expect(row?.ttl_seconds).toBe(WEEKLY_TTL);
  });

  it("DV-TTL-CAP-4 COEXISTENCE: daily (100800s) and weekly (691200s) markers coexist correctly", () => {
    // Daily marker
    const daily = claimTask({
      task_id: "published:chef-morning:2026-05-31",
      task_kind: "cowork-slot",
      owner_session: "session-daily",
      owner_agent:   "unified-agent",
      ttl_seconds:   100800, // 28h daily belt
    });
    expect(daily.claimed).toBe(true);

    // Weekly marker
    const weekly = claimTask({
      task_id: "published:digest-sunday:2026-W22-coex",
      task_kind: "cowork-slot",
      owner_session: "session-weekly-4",
      owner_agent:   "unified-agent",
      ttl_seconds:   WEEKLY_TTL,
    });
    expect(weekly.claimed).toBe(true);

    // Verify both stored correctly
    const dailyRow = testDb
      .prepare("SELECT ttl_seconds FROM task_locks WHERE task_id = ?")
      .get("published:chef-morning:2026-05-31") as { ttl_seconds: number } | null;
    const weeklyRow = testDb
      .prepare("SELECT ttl_seconds FROM task_locks WHERE task_id = ?")
      .get("published:digest-sunday:2026-W22-coex") as { ttl_seconds: number } | null;

    expect(dailyRow?.ttl_seconds).toBe(100800);  // daily: 28h unchanged
    expect(weeklyRow?.ttl_seconds).toBe(WEEKLY_TTL); // weekly: 8 days accepted
  });
});

// ---------------------------------------------------------------------------
// AC-SL-6 — Orphan lock (heartbeat_age > threshold) → released:true, re-claimable
//
// Simulates the 2026-06-05 incident: mcp-server restarted, new SERVER_SESSION_ID
// can no longer heartbeat the old lock. The lock was claimed at 08:00:44Z and
// the last heartbeat was at 08:00:44Z (no renewal). At 08:15Z the new process
// detects heartbeat_age ~875s > 600s threshold → orphan-steal.
//
// GREEN path: releaseOrphanTask returns released:true, prior_owner_session is
// the old session, heartbeat_age reflects the artificial age. After release,
// a new session can claim the lock (INSERT OR IGNORE succeeds on absent row).
// ---------------------------------------------------------------------------

describe("AC-SL-6: Orphan lock with heartbeat_age > threshold → released:true, re-claimable by new session", () => {
  it("GREEN: stale heartbeat (age > 600s) triggers orphan release, lock re-claimable", () => {
    // Step 1: Old process claims the cowork-leader lock
    const claim = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "pid-1-ts-1780613414482",  // old process session
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });
    expect(claim.claimed).toBe(true);

    // Step 2: Simulate process restart — no heartbeat for 875 seconds
    // (replicates the 08:00:44Z claim → 08:15Z check = ~875s gap)
    ageHeartbeat(testDb, "cowork-leader", 875);

    // Step 3: New process calls releaseOrphanTask with the same owner_agent
    // (owner_session is irrelevant — only owner_agent is checked)
    const orphanResult = releaseOrphanTask("cowork-leader", "cowork-dispatcher", 600);

    expect(orphanResult.released).toBe(true);
    expect(orphanResult.reason).toBe("orphan_released");
    expect(orphanResult.prior_owner_session).toBe("pid-1-ts-1780613414482");
    expect(orphanResult.heartbeat_age).toBeGreaterThanOrEqual(875);

    // Step 4: New process can now re-claim (lock row is gone)
    const reclaim = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "pid-1-ts-1780647098474",  // new process session after restart
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });
    expect(reclaim.claimed).toBe(true);
    // INSERT OR IGNORE path (not stolen — row was deleted, not expired)
    expect((reclaim as { stolen?: boolean }).stolen).toBeUndefined();
  });

  it("GREEN: orphan release returns correct prior_owner_session for audit trail", () => {
    claimTask({
      task_id: "cowork-leader-audit",
      task_kind: "cowork-slot",
      owner_session: "pid-42-ts-9999999",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    ageHeartbeat(testDb, "cowork-leader-audit", 700);

    const result = releaseOrphanTask("cowork-leader-audit", "cowork-dispatcher", 600);
    expect(result.released).toBe(true);
    expect(result.prior_owner_session).toBe("pid-42-ts-9999999");
  });

  it("GREEN: owner_agent mismatch → released:false (cross-agent theft blocked)", () => {
    claimTask({
      task_id: "cowork-leader-cross",
      task_kind: "cowork-slot",
      owner_session: "pid-1-ts-old",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    ageHeartbeat(testDb, "cowork-leader-cross", 900);

    // Different agent tries to release — must be blocked
    const result = releaseOrphanTask("cowork-leader-cross", "some-other-agent", 600);
    expect(result.released).toBe(false);
    expect(result.reason).toBe("owner_agent_mismatch");

    // Original lock must still exist
    const row = testDb
      .prepare("SELECT task_id FROM task_locks WHERE task_id = ?")
      .get("cowork-leader-cross");
    expect(row).not.toBeNull();
  });

  it("GREEN: lock_not_found → released:false, no error", () => {
    const result = releaseOrphanTask("cowork-leader-nonexistent", "cowork-dispatcher", 600);
    expect(result.released).toBe(false);
    expect(result.reason).toBe("lock_not_found");
  });
});

// ---------------------------------------------------------------------------
// AC-SL-7 — Lock with FRESH heartbeat → released:false (dup-spawn safety preserved)
//
// A live concurrent session always heartbeats continuously. The dup-spawn case
// (2026-06-02 fix) relies on the heartbeat-as-discriminator: if heartbeat_age
// ≤ threshold, the lock is held by a live process — do NOT steal it.
//
// GREEN path: releaseOrphanTask returns released:false with reason "heartbeat_fresh".
// The DB row must NOT be deleted.
// ---------------------------------------------------------------------------

describe("AC-SL-7: Lock with fresh heartbeat → released:false (dup-spawn safety preserved)", () => {
  it("GREEN: fresh heartbeat (age ≤ 600s) blocks orphan-steal — live peer is protected", () => {
    // Live peer claims the lock and heartbeats regularly
    const claim = claimTask({
      task_id: "cowork-leader",
      task_kind: "cowork-slot",
      owner_session: "pid-99-ts-live",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });
    expect(claim.claimed).toBe(true);

    // Heartbeat is fresh (claimed just now — heartbeat_age ≈ 0s)
    // We don't age it, so heartbeat_at = unixepoch('now') from the claim INSERT

    const orphanResult = releaseOrphanTask("cowork-leader", "cowork-dispatcher", 600);

    // Must NOT release — live process is heartbeating
    expect(orphanResult.released).toBe(false);
    expect(orphanResult.reason).toBe("heartbeat_fresh");
    expect(orphanResult.heartbeat_age).toBeDefined();
    expect(orphanResult.heartbeat_age!).toBeLessThanOrEqual(600);

    // Lock must still exist in DB — no row deleted
    const row = testDb
      .prepare("SELECT owner_session FROM task_locks WHERE task_id = ?")
      .get("cowork-leader") as { owner_session: string } | null;
    expect(row).not.toBeNull();
    expect(row?.owner_session).toBe("pid-99-ts-live");
  });

  it("GREEN: heartbeat aged to exactly threshold (=600s) → still NOT released (boundary: ≤ threshold)", () => {
    claimTask({
      task_id: "cowork-leader-boundary",
      task_kind: "cowork-slot",
      owner_session: "pid-100-ts-boundary",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    // Age to exactly the threshold — must NOT release (boundary is exclusive: > threshold)
    ageHeartbeat(testDb, "cowork-leader-boundary", 600);

    const result = releaseOrphanTask("cowork-leader-boundary", "cowork-dispatcher", 600);
    expect(result.released).toBe(false);
    expect(result.reason).toBe("heartbeat_fresh");
  });

  it("GREEN: heartbeat aged to threshold+1 → released (boundary: > threshold triggers orphan)", () => {
    claimTask({
      task_id: "cowork-leader-threshold-plus1",
      task_kind: "cowork-slot",
      owner_session: "pid-101-ts-old",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    // One second past the threshold — now qualifies as orphan
    ageHeartbeat(testDb, "cowork-leader-threshold-plus1", 601);

    const result = releaseOrphanTask("cowork-leader-threshold-plus1", "cowork-dispatcher", 600);
    expect(result.released).toBe(true);
    expect(result.reason).toBe("orphan_released");
  });

  it("GREEN: minimum threshold enforced at 120s (orphan_threshold_seconds=0 is clamped)", () => {
    claimTask({
      task_id: "cowork-leader-min-threshold",
      task_kind: "cowork-slot",
      owner_session: "pid-102-ts-recent",
      owner_agent: "cowork-dispatcher",
      ttl_seconds: 1800,
    });

    // Age to 60s — would qualify if threshold=0 were accepted, but min is 120
    ageHeartbeat(testDb, "cowork-leader-min-threshold", 60);

    // threshold=0 gets clamped to 120 → heartbeat_age=60 ≤ 120 → NOT released
    const result = releaseOrphanTask("cowork-leader-min-threshold", "cowork-dispatcher", 0);
    expect(result.released).toBe(false);
    expect(result.reason).toBe("heartbeat_fresh");
  });
});
