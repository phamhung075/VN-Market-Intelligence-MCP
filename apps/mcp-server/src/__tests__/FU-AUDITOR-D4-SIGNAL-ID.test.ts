/**
 * FU-AUDITOR-D4-SIGNAL-ID
 *
 * Bug: system-auditor's D4 checks emitted a BATCH id `sau-d4-{YYYYMMDDHHMM}`
 * keyed only on minute-truncated timestamp. When R-5 (tasksMdJanitorJob)
 * emits more than one divergence in the same job run (same minute), every
 * row collides onto the SAME signal_queue id — 8 distinct per-task findings
 * land on ONE row id instead of 8.
 *
 * Fix: id is now a per-finding discriminator:
 *   sau-d4-{entityId}-{checkId}-{YYYYMMDD}
 * where entityId is the divergence subject (DivergenceRow.taskId — the
 * "ticker" slot) and checkId is the divergence kind (the "check_id" slot).
 *
 * Covers:
 *   1. Unit-level: appendOrchStateSignalRow() called 8x with 8 distinct
 *      (taskId, kind) pairs in one tick (same nowIso) → 8 distinct ids.
 *   2. Integration-level: runTasksMdJanitor() synthetic run (4 held locks,
 *      each diverging on BOTH owner + status vs task_board) → 8 distinct
 *      divergences → 8 distinct signal_queue rows, each id traceable back
 *      to its (taskId, kind) pair.
 *   3. sanitizeSignalIdSegment() unit coverage (id-safe encoding).
 *
 * FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE (2026-07-08): R-2/R-3 candidates are
 * now gated by the Step R-4b 2-consecutive-cycle debounce — a candidate only
 * emits once it persisted across >=2 daily passes. The integration test below
 * runs the janitor TWICE (pass 1 seeds the ledger, no emissions; pass 2 sees
 * the SAME candidates persisted from pass 1 → emits) to keep asserting the
 * original per-finding signal-id-uniqueness bug fix unaffected by the new gate.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runTasksMdJanitor,
  appendOrchStateSignalRow,
  sanitizeSignalIdSegment,
  _resetDedupStore,
  type JanitorDeps,
  type DivergenceRow,
} from "../scheduler/system/tasksMdJanitorJob.js";
import type { LockRow } from "../infrastructure/db/coordinationStore.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

const NOW_ISO = "2026-07-04T04:37:22.123Z";

function makeTmpProjectRoot(label: string): string {
  const root = join(
    tmpdir(),
    "fu-auditor-d4-signal-id",
    `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(root, "docs", "data", "orch"), { recursive: true });
  // R-4b debounce ledger lives at docs/agent-memory/notebooks/system-auditor.md
  mkdirSync(join(root, "docs", "agent-memory", "notebooks"), { recursive: true });
  return root;
}

/** Minimal valid OrchState fixture (satisfies OrchStateSchema.strict()). */
function baseOrchState() {
  return {
    _meta: { schema: "v4", ssot: true, updated_at: NOW_ISO, updated_by: "test" },
    head: { status: "IDLE", active_task_id: null },
    task_board: {
      backlog: [],
      active_sprints: [
        {
          id: "sprint-fu-auditor-d4",
          status: "ACTIVE",
          tasks: [
            { id: "task-alpha", status: "TODO", owner: "agent-b" },
            { id: "task-bravo", status: "TODO", owner: "agent-b" },
            { id: "task-charlie", status: "TODO", owner: "agent-b" },
            { id: "task-delta", status: "TODO", owner: "agent-b" },
          ],
        },
      ],
      _updated_at: NOW_ISO,
      _updated_by: "test",
    },
    signal_queue: {
      _updated_at: NOW_ISO,
      _updated_by: "test",
      rows: [],
      archive: [],
    },
  };
}

function makeLock(taskId: string): LockRow {
  return {
    task_id: `task:${taskId}`,
    task_kind: "sprint-task",
    owner_session: "session-x",
    owner_agent: "agent-a", // mismatches task_board owner "agent-b" → owner divergence
    owner_client_session: null,
    claimed_at: Date.now(),
    expires_at: Date.now() + 600_000,
    heartbeat_at: Date.now(),
    ttl_seconds: 600,
    payload: null,
    redispatch_count: 0,
  };
}

function idGroups(ids: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1);
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("FU-AUDITOR-D4-SIGNAL-ID — per-finding signal id discriminator", () => {
  const dirsToClean: string[] = [];

  beforeEach(() => {
    _resetDedupStore();
  });

  afterEach(() => {
    for (const d of dirsToClean) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
    dirsToClean.length = 0;
  });

  it("unit: 8 distinct (taskId, kind) pairs in one tick → 8 distinct ids (AC1/AC2/AC3)", () => {
    const projectRoot = makeTmpProjectRoot("unit");
    dirsToClean.push(projectRoot);
    const orchStatePath = join(projectRoot, "docs", "data", "orch", "orch-state.json");
    writeFileSync(orchStatePath, JSON.stringify(baseOrchState(), null, 2), "utf8");

    const readFile = (p: string) => readFileSync(p, "utf8");
    const writeFile = (p: string, s: string) => writeFileSync(p, s, "utf8");
    const fileExists = (p: string) => existsSync(p);

    const pairs: Array<{ taskId: string; kind: DivergenceRow["kind"] }> = [
      { taskId: "task-alpha", kind: "owner" },
      { taskId: "task-alpha", kind: "status" },
      { taskId: "task-bravo", kind: "owner" },
      { taskId: "task-bravo", kind: "status" },
      { taskId: "task-charlie", kind: "owner" },
      { taskId: "task-charlie", kind: "status" },
      { taskId: "task-delta", kind: "owner" },
      { taskId: "task-delta", kind: "status" },
    ];

    for (const { taskId, kind } of pairs) {
      appendOrchStateSignalRow(
        orchStatePath,
        `synthetic ${kind} divergence for ${taskId}`,
        NOW_ISO, // SAME tick for every call — this is exactly what collided before the fix
        kind,
        taskId,
        readFile,
        writeFile,
        fileExists,
      );
    }

    const finalDoc = JSON.parse(readFileSync(orchStatePath, "utf8"));
    const rows: Array<{ id: string; summary: string }> = finalDoc.signal_queue.rows;

    // AC1: 8 distinct pairs in one tick → 8 distinct signal ids (not 1)
    expect(rows.length).toBe(8);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(8);

    // AC2: no duplicate ids — group_by(.id) | map(select(length>1)) == []
    expect(idGroups(ids)).toEqual([]);

    // AC3: each row carries the correct ticker(taskId) + check_id(kind) discriminator
    for (const { taskId, kind } of pairs) {
      const expectedId = `sau-d4-${sanitizeSignalIdSegment(taskId)}-${kind}-20260704`;
      const match = rows.find((r) => r.id === expectedId);
      expect(match).toBeDefined();
      expect(match!.summary).toContain(taskId);
    }
  });

  it("integration: runTasksMdJanitor synthetic tick — 4 locks x 2 divergence kinds → 8 distinct signal_queue rows", async () => {
    const projectRoot = makeTmpProjectRoot("integration");
    dirsToClean.push(projectRoot);
    const orchStatePath = join(projectRoot, "docs", "data", "orch", "orch-state.json");
    writeFileSync(orchStatePath, JSON.stringify(baseOrchState(), null, 2), "utf8");

    const taskIds = ["task-alpha", "task-bravo", "task-charlie", "task-delta"];
    const locks: LockRow[] = taskIds.map(makeLock);

    const deps: JanitorDeps = {
      listHeld: () => locks,
      readFile: (p) => readFileSync(p, "utf8"),
      writeFile: (p, s) => writeFileSync(p, s, "utf8"),
      fileExists: (p) => existsSync(p),
      runShell: () => "", // no concurrent-commit noise
      sendBug: async () => {},
      nowIso: () => NOW_ISO, // fixed — every divergence in this run shares one timestamp
      projectRoot,
    };

    // Pass 1 (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE R-4b): cold-start ledger —
    // all 8 owner/status candidates are first-occurrence, so none emit yet; the
    // ledger is seeded with all 8 keys for the next cycle to read back.
    const seedResult = await runTasksMdJanitor(deps);
    expect(seedResult.errors).toEqual([]);
    expect(seedResult.divergences.length).toBe(0);

    // Pass 2: same lock/task_board state → same 8 candidates → now PERSISTED
    // across 2 consecutive cycles per the ledger written by pass 1 → emitted.
    const result = await runTasksMdJanitor(deps);

    expect(result.errors).toEqual([]);
    // 4 locks x (owner + status) = 8 distinct findings, persisted across 2 cycles
    expect(result.divergences.length).toBe(8);

    const finalDoc = JSON.parse(readFileSync(orchStatePath, "utf8"));
    const rows: Array<{ id: string; summary: string }> = finalDoc.signal_queue.rows;
    expect(rows.length).toBe(8);

    const ids = rows.map((r) => r.id);

    // AC1: 8 distinct findings → 8 distinct ids (not 1, as the pre-fix batch id produced)
    expect(new Set(ids).size).toBe(8);

    // AC2: no duplicate ids
    expect(idGroups(ids)).toEqual([]);

    // AC3: every (taskId, kind) combo is present exactly once, embedded in its id
    for (const taskId of taskIds) {
      for (const kind of ["owner", "status"] as const) {
        const expectedId = `sau-d4-${taskId}-${kind}-20260704`;
        const matches = rows.filter((r) => r.id === expectedId);
        expect(matches.length).toBe(1);
        expect(matches[0]!.summary).toContain(taskId);
      }
    }
  });

  it("regression: pre-fix batch id shape collided across findings in the same tick", () => {
    // Pre-fix bug: `sau-d4-${YYYYMMDDHHMM}` — every divergence in the same
    // minute produced the IDENTICAL id, regardless of which task/kind fired.
    const oldStyleIds = ["sau-d4-202607040437", "sau-d4-202607040437"];
    expect(new Set(oldStyleIds).size).toBe(1); // documents the bug: 2 findings -> 1 id

    // Post-fix: same tick, different (taskId, kind) -> distinct ids.
    const newStyleIds = [
      `sau-d4-${sanitizeSignalIdSegment("task-alpha")}-owner-20260704`,
      `sau-d4-${sanitizeSignalIdSegment("task-bravo")}-status-20260704`,
    ];
    expect(new Set(newStyleIds).size).toBe(2);
  });

  it("sanitizeSignalIdSegment — collapses unsafe chars, never emits an empty segment", () => {
    expect(sanitizeSignalIdSegment("orch-state.json")).toBe("orch-state-json");
    expect(sanitizeSignalIdSegment("Task:ABC/123")).toBe("task-abc-123");
    expect(sanitizeSignalIdSegment("already-safe")).toBe("already-safe");
    expect(sanitizeSignalIdSegment("")).toBe("unknown");
    expect(sanitizeSignalIdSegment("---")).toBe("unknown");
  });
});
