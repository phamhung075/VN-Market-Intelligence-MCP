/**
 * coordinationStore.test.ts — Unit tests for heartbeatTask()/releaseTask() FR-1/FR-2
 *
 * Sprint: FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (fix_spec(a)+(c)/AC1+AC3)
 * Task: FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER (PM decomposition Task 1)
 *
 * Scope: this task's own acceptance criteria only —
 *   - FR-1: heartbeatTask optional ttl_seconds (60-691200) + payload_patch shallow-merge,
 *     two-statement UPDATE pattern, backward compatible (NFR-2).
 *   - FR-2: null-session ladder for orphan-signal rows (owner_client_session IS NULL) on
 *     both heartbeatTask + releaseTask, matched via (owner_agent + original_owner_client_session).
 *   - NFR-1: the ladder must NEVER match a row whose owner_client_session IS NOT NULL.
 * Comprehensive edge-case + regression + live-integration-round-trip coverage is the separate,
 * dependent task FIX-ORPHAN-FR8-TEST-COORDINATION-STORE (Task 5) — not duplicated here.
 *
 * Tests:
 *   H1 — heartbeatTask + ttl_seconds: persists new TTL, unpatched fields survive
 *   H2 — heartbeatTask omitting ttl_seconds: byte-identical pre-FR-1 behavior (NFR-2)
 *   H3 — heartbeatTask + payload_patch: shallow-merges into existing payload JSON
 *   H4 — heartbeatTask + payload_patch on malformed existing payload (EC-6): non-fatal, fresh object from patch
 *   H5 — heartbeatTask + payload_patch on absent (null) existing payload (EC-6): non-fatal, fresh object from patch
 *   L1 — null-session ladder (heartbeat): orphan-signal row w/ owner_client_session=NULL matches on (owner_agent + echo)
 *   L2 — null-session ladder (heartbeat): wrong owner_agent fails
 *   L3 — null-session ladder (heartbeat): wrong original_owner_client_session echo fails
 *   N1 — NFR-1 regression (heartbeat): ladder NEVER matches a live-session row even if owner_agent/echo happen to match
 *   H6 — heartbeatTask + ttl_seconds below floor (EC): clamps to 60 (same bounds as task_claim)
 *   H7 — heartbeatTask + ttl_seconds above ceiling (EC): clamps to 691200 (same bounds as task_claim)
 *   R1 — null-session ladder (release): succeeds on correct params
 *   R2 — null-session ladder (release): wrong echo fails (clean no-op, not an error)
 *   R3 — null-session ladder (release): wrong owner_agent fails (clean no-op, not an error)
 *   N2 — NFR-1 regression (release): ladder NEVER matches a live-session row even if owner_agent/echo happen to match
 *
 * FIX-ORPHAN-FR8-TEST-COORDINATION-STORE (Task 5, this task) subtasks 1-4 close-out:
 * H6/H7/R3 above fill the two residual gaps left after Task 1's own TDD-driven suite (H1-H5,
 * L1-L3, N1, R1-R2, N2, combined) — release-side "wrong owner_agent" (subtask 3 called for
 * BOTH heartbeat AND release failure branches; only the echo-mismatch branch had a release-side
 * test) and ttl_seconds clamp-boundary behavior (subtask 1's own "ttl_seconds" behavior, clamped
 * in coordinationStore.ts itself — see heartbeatTask()'s `Math.min(Math.max(...))` — not just
 * Zod-layer validation in the separate Task 2 interface file).
 *
 * Subtask 5 (test-before-ship gate: live integration round-trip against a running container) is
 * NOT executed by this file or this task cycle — see the [Developer] Implementation Record under
 * Task 5 in docs/handoffs/FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD-PM-decomposition-20260722.md for
 * the full, evidence-based reason (Task 2's Zod-schema exposure is still REVIEW/unmerged-to-image,
 * the live mcp-server container predates that commit, and this session carries no gateway/MCP
 * tool grant to place live task_heartbeat/task_release calls even against an up-to-date image).
 * FR-3/FR-4/FR-6 prose MUST NOT be described as "available" until that round-trip is later run and
 * passes — this file does not claim otherwise.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  _injectCoordinationDb,
  _resetCoordinationDbState,
  heartbeatTask,
  releaseTask,
  releaseOrphanTask,
} from "../db/coordinationStore.js";

let db: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  db = new Database(":memory:");
  ensureCoordinationTable(db);
  _injectCoordinationDb(db);
});

/** Insert a live-session sprint-task row directly (bypasses claimTask for full column control). */
function insertLiveRow(opts: {
  task_id: string;
  owner_client_session: string;
  owner_agent?: string;
  ttl_seconds?: number;
  payload?: string | null;
}): void {
  db.prepare(`
    INSERT INTO task_locks
      (task_id, task_kind, owner_session, owner_agent, owner_client_session,
       claimed_at, expires_at, heartbeat_at, ttl_seconds, payload, redispatch_count)
    VALUES
      (?, 'sprint-task', 'pid-test', ?, ?, unixepoch('now'), unixepoch('now') + ?, unixepoch('now'), ?, ?, 0)
  `).run(
    opts.task_id,
    opts.owner_agent ?? "developer",
    opts.owner_client_session,
    opts.ttl_seconds ?? 3600,
    opts.ttl_seconds ?? 3600,
    opts.payload ?? null,
  );
}

/** Insert a reaper-minted orphan-signal row (owner_client_session=NULL) directly. */
function insertOrphanSignalRow(opts: {
  task_id: string;
  owner_agent: string;
  original_owner_client_session: string | null;
  ttl_seconds?: number;
  extraPayload?: Record<string, unknown>;
}): void {
  const ttl = opts.ttl_seconds ?? 7200;
  const payload = JSON.stringify({
    original_task_id: opts.task_id,
    original_task_kind: "sprint-task",
    original_owner_client_session: opts.original_owner_client_session,
    owner_agent: opts.owner_agent,
    ...opts.extraPayload,
  });
  db.prepare(`
    INSERT INTO task_locks
      (task_id, task_kind, owner_session, owner_agent, owner_client_session,
       claimed_at, expires_at, heartbeat_at, ttl_seconds, payload, redispatch_count)
    VALUES
      (?, 'orphan-signal', 'server-reaper', ?, NULL, unixepoch('now'), unixepoch('now') + ?, unixepoch('now'), ?, ?, 1)
  `).run(opts.task_id, opts.owner_agent, ttl, ttl, payload);
}

/** Age a lock's heartbeat_at by the given number of seconds into the past (same idiom as DWF-coordination-phase2.test.ts). */
function ageHeartbeat(task_id: string, ageSeconds: number): void {
  db.prepare(
    "UPDATE task_locks SET heartbeat_at = unixepoch('now') - ? WHERE task_id = ?",
  ).run(ageSeconds, task_id);
}

function readRow(task_id: string): {
  ttl_seconds: number;
  payload: string | null;
  owner_client_session: string | null;
} | null {
  return db
    .prepare(`SELECT ttl_seconds, payload, owner_client_session FROM task_locks WHERE task_id = ?`)
    .get(task_id) as { ttl_seconds: number; payload: string | null; owner_client_session: string | null } | null;
}

describe("heartbeatTask — FR-1 ttl_seconds/payload_patch", () => {
  it("H1: ttl_seconds supplied — persists new TTL, unpatched fields survive", () => {
    insertLiveRow({ task_id: "task:H1", owner_client_session: "sess-1", ttl_seconds: 3600, payload: '{"x":1}' });

    const result = heartbeatTask("task:H1", "sess-1", { ttl_seconds: 7200 });

    expect(result.ok).toBe(true);
    const row = readRow("task:H1");
    expect(row?.ttl_seconds).toBe(7200);
    expect(row?.payload).toBe('{"x":1}'); // unpatched — survives byte-identical
  });

  it("H2: ttl_seconds omitted — byte-identical to pre-FR-1 behavior (NFR-2)", () => {
    insertLiveRow({ task_id: "task:H2", owner_client_session: "sess-1", ttl_seconds: 3600 });

    const result = heartbeatTask("task:H2", "sess-1");

    expect(result.ok).toBe(true);
    const row = readRow("task:H2");
    expect(row?.ttl_seconds).toBe(3600); // unchanged — existing column reused
  });

  it("H3: payload_patch supplied — shallow-merges into existing payload JSON", () => {
    insertLiveRow({ task_id: "task:H3", owner_client_session: "sess-1", payload: '{"a":1,"b":2}' });

    const result = heartbeatTask("task:H3", "sess-1", { payload_patch: '{"b":99,"c":3}' });

    expect(result.ok).toBe(true);
    const row = readRow("task:H3");
    expect(JSON.parse(row!.payload as string)).toEqual({ a: 1, b: 99, c: 3 });
  });

  it("H4: payload_patch on malformed existing payload — non-fatal, fresh object from patch (EC-6)", () => {
    insertLiveRow({ task_id: "task:H4", owner_client_session: "sess-1", payload: "{not valid json" });

    const result = heartbeatTask("task:H4", "sess-1", { payload_patch: '{"status":"ESCALATED"}' });

    expect(result.ok).toBe(true);
    const row = readRow("task:H4");
    expect(JSON.parse(row!.payload as string)).toEqual({ status: "ESCALATED" });
  });

  it("H5: payload_patch on absent (null) existing payload — non-fatal, fresh object from patch (EC-6)", () => {
    insertLiveRow({ task_id: "task:H5", owner_client_session: "sess-1", payload: null });

    const result = heartbeatTask("task:H5", "sess-1", { payload_patch: '{"status":"ESCALATED"}' });

    expect(result.ok).toBe(true);
    const row = readRow("task:H5");
    expect(JSON.parse(row!.payload as string)).toEqual({ status: "ESCALATED" });
  });

  it("combined: ttl_seconds + payload_patch together in one call (escalation call-site shape)", () => {
    insertOrphanSignalRow({ task_id: "orphan-signal:task:COMBO", owner_agent: "router", original_owner_client_session: "dead-sess" });

    const result = heartbeatTask("orphan-signal:task:COMBO", "caller-sess", {
      ttl_seconds: 86400,
      payload_patch: '{"status":"ESCALATED"}',
      owner_agent: "router",
      original_owner_client_session: "dead-sess",
    });

    expect(result.ok).toBe(true);
    const row = readRow("orphan-signal:task:COMBO");
    expect(row?.ttl_seconds).toBe(86400);
    const parsed = JSON.parse(row!.payload as string);
    expect(parsed.status).toBe("ESCALATED");
    expect(parsed.original_owner_client_session).toBe("dead-sess"); // unpatched field survives merge
  });

  it("H6: ttl_seconds below floor (10) — clamps to 60 (same bounds as task_claim)", () => {
    insertLiveRow({ task_id: "task:H6", owner_client_session: "sess-1", ttl_seconds: 3600 });

    const result = heartbeatTask("task:H6", "sess-1", { ttl_seconds: 10 });

    expect(result.ok).toBe(true);
    const row = readRow("task:H6");
    expect(row?.ttl_seconds).toBe(60);
  });

  it("H7: ttl_seconds above ceiling (999999) — clamps to 691200 (same bounds as task_claim)", () => {
    insertLiveRow({ task_id: "task:H7", owner_client_session: "sess-1", ttl_seconds: 3600 });

    const result = heartbeatTask("task:H7", "sess-1", { ttl_seconds: 999999 });

    expect(result.ok).toBe(true);
    const row = readRow("task:H7");
    expect(row?.ttl_seconds).toBe(691200);
  });
});

describe("heartbeatTask — FR-2 null-session ladder (orphan-signal only)", () => {
  it("L1: matches on (owner_agent + original_owner_client_session echo)", () => {
    insertOrphanSignalRow({ task_id: "orphan-signal:task:L1", owner_agent: "dev-team", original_owner_client_session: "dead-sess-1" });

    const result = heartbeatTask("orphan-signal:task:L1", "caller-sess", {
      owner_agent: "dev-team",
      original_owner_client_session: "dead-sess-1",
    });

    expect(result.ok).toBe(true);
    expect(result.expires_at).toBeGreaterThan(0);
  });

  it("L2: wrong owner_agent fails", () => {
    insertOrphanSignalRow({ task_id: "orphan-signal:task:L2", owner_agent: "dev-team", original_owner_client_session: "dead-sess-1" });

    const result = heartbeatTask("orphan-signal:task:L2", "caller-sess", {
      owner_agent: "wrong-agent",
      original_owner_client_session: "dead-sess-1",
    });

    expect(result).toEqual({ ok: false, expires_at: 0 });
  });

  it("L3: wrong original_owner_client_session echo fails", () => {
    insertOrphanSignalRow({ task_id: "orphan-signal:task:L3", owner_agent: "dev-team", original_owner_client_session: "dead-sess-1" });

    const result = heartbeatTask("orphan-signal:task:L3", "caller-sess", {
      owner_agent: "dev-team",
      original_owner_client_session: "wrong-echo",
    });

    expect(result).toEqual({ ok: false, expires_at: 0 });
  });

  it("N1 (NFR-1 regression): ladder NEVER matches a live-session row, even with matching owner_agent/echo", () => {
    // Row is a LIVE-SESSION lock (owner_client_session NOT NULL) — the ladder must not touch it,
    // even if a caller (by coincidence or malice) supplies owner_agent/echo that would "match"
    // if the row happened to be an orphan-signal.
    insertLiveRow({ task_id: "task:N1", owner_client_session: "real-live-sess", owner_agent: "dev-team" });

    const result = heartbeatTask("task:N1", "wrong-caller-sess", {
      owner_agent: "dev-team",
      original_owner_client_session: "real-live-sess",
    });

    expect(result).toEqual({ ok: false, expires_at: 0 });
    // Confirm the row was NOT mutated (ownership still intact).
    const row = readRow("task:N1");
    expect(row?.owner_client_session).toBe("real-live-sess");
  });
});

describe("releaseTask — FR-2 null-session ladder (orphan-signal only)", () => {
  it("R1: matches on (owner_agent + original_owner_client_session echo) — releases the row", () => {
    insertOrphanSignalRow({ task_id: "orphan-signal:task:R1", owner_agent: "dev-team", original_owner_client_session: "dead-sess-1" });

    const result = releaseTask("orphan-signal:task:R1", "caller-sess", {
      owner_agent: "dev-team",
      original_owner_client_session: "dead-sess-1",
    });

    expect(result).toEqual({ ok: true, released: 1 });
    expect(readRow("orphan-signal:task:R1")).toBeNull();
  });

  it("R2: wrong echo — clean no-op, not an error", () => {
    insertOrphanSignalRow({ task_id: "orphan-signal:task:R2", owner_agent: "dev-team", original_owner_client_session: "dead-sess-1" });

    const result = releaseTask("orphan-signal:task:R2", "caller-sess", {
      owner_agent: "dev-team",
      original_owner_client_session: "wrong-echo",
    });

    expect(result).toEqual({ ok: true, released: 0 });
    expect(readRow("orphan-signal:task:R2")).not.toBeNull(); // row survives
  });

  it("R3: wrong owner_agent — clean no-op, not an error", () => {
    insertOrphanSignalRow({ task_id: "orphan-signal:task:R3", owner_agent: "dev-team", original_owner_client_session: "dead-sess-1" });

    const result = releaseTask("orphan-signal:task:R3", "caller-sess", {
      owner_agent: "wrong-agent",
      original_owner_client_session: "dead-sess-1",
    });

    expect(result).toEqual({ ok: true, released: 0 });
    expect(readRow("orphan-signal:task:R3")).not.toBeNull(); // row survives
  });

  it("N2 (NFR-1 regression): ladder NEVER releases a live-session row, even with matching owner_agent/echo", () => {
    insertLiveRow({ task_id: "task:N2", owner_client_session: "real-live-sess", owner_agent: "dev-team" });

    const result = releaseTask("task:N2", "wrong-caller-sess", {
      owner_agent: "dev-team",
      original_owner_client_session: "real-live-sess",
    });

    expect(result).toEqual({ ok: true, released: 0 });
    expect(readRow("task:N2")).not.toBeNull(); // row survives — never released via the ladder
  });
});

// ---------------------------------------------------------------------------
// UC-CCA-P3 FR-5 (AC-CODE-GATE) — published:* release-refusal, per architecture
// brief §6: (a) releaseTask refuses, (b) releaseOrphanTask refuses even on a
// genuinely stale lock (proves the guard fires BEFORE the staleness check),
// (c) negative control — a cron:*/sprint-task-shaped task_id with identical
// staleness characteristics still releases normally (guard is prefix-scoped
// only, not a general regression).
// ---------------------------------------------------------------------------

describe("releaseTask — UC-CCA-P3 FR-5 published-marker immunity guard", () => {
  it("(a) published:* task_id — {ok:true, released:0, reason:'published_marker_immune'}, NOT released:1", () => {
    insertLiveRow({ task_id: "published:chef:2026-08-12", owner_client_session: "sess-pub-1" });

    const result = releaseTask("published:chef:2026-08-12", "sess-pub-1");

    expect(result).toEqual({ ok: true, released: 0, reason: "published_marker_immune" });
    expect(readRow("published:chef:2026-08-12")).not.toBeNull(); // never deleted
  });

  it("(c) negative control — a cron:* task_id with identical shape still releases normally (released:1)", () => {
    insertLiveRow({ task_id: "cron:foreign-flow-sweep", owner_client_session: "sess-cron-1" });

    const result = releaseTask("cron:foreign-flow-sweep", "sess-cron-1");

    expect(result).toEqual({ ok: true, released: 1 });
    expect(readRow("cron:foreign-flow-sweep")).toBeNull(); // actually deleted
  });
});

describe("releaseOrphanTask — UC-CCA-P3 FR-5 published-marker immunity guard", () => {
  it("(b) genuinely stale published:* lock — still refused (guard fires BEFORE the staleness check)", () => {
    insertLiveRow({ task_id: "published:digest-sunday:2026-W33", owner_client_session: "sess-pub-orphan" });
    ageHeartbeat("published:digest-sunday:2026-W33", 900); // well past the 600s default threshold

    const result = releaseOrphanTask("published:digest-sunday:2026-W33", "sess-pub-orphan", 600);

    expect(result).toEqual({ released: false, reason: "published_marker_immune" });
    expect(readRow("published:digest-sunday:2026-W33")).not.toBeNull(); // never deleted despite staleness
  });

  it("(c) negative control — sprint-task-kind lock with identical staleness still releases normally (released:true)", () => {
    insertLiveRow({ task_id: "task:orphan-sweep-control", owner_client_session: "sess-orphan-ctrl" });
    ageHeartbeat("task:orphan-sweep-control", 900);

    const result = releaseOrphanTask("task:orphan-sweep-control", "sess-orphan-ctrl", 600);

    expect(result.released).toBe(true);
    expect(result.reason).toBe("orphan_released");
    expect(readRow("task:orphan-sweep-control")).toBeNull(); // actually deleted
  });
});
