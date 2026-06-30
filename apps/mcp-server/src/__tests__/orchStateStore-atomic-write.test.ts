/**
 * Unit tests for writeOrchStateAtomic §2.3 sentinel guard.
 *
 * Covers:
 *  1. Valid full OrchState → file written, content equals input.
 *  2. Empty object {} → throws, pre-existing target file UNCHANGED.
 *  3. Object missing .signal_queue → throws, target UNCHANGED.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeOrchStateAtomic } from "../infrastructure/orchStateStore";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTmpPath(label: string): string {
  const dir = join(tmpdir(), "orch-atomic-test");
  mkdirSync(dir, { recursive: true });
  return join(dir, `orch-state-${label}-${Date.now()}.json`);
}

const SENTINEL_CONTENT = JSON.stringify({ _sentinel: "pre-existing" }, null, 2);

// VALID_ORCH_STATE must match OrchStateSchema (SSOT-W1-SERVER-ENFORCE):
//   - root keys restricted to OrchStateSchema (.strict()) — no legacy _schema/_ssot/_updated_at/_updated_by
//   - _meta.schema replaces old root _schema field
//   - head.status is required by HeadSchema
const VALID_ORCH_STATE = {
  _meta: { schema: "v4", ssot: true, updated_at: "2026-06-02T00:00:00Z", updated_by: "test" },
  head: { status: "IDLE" },
  task_board: {
    _updated_at: "2026-06-02T00:00:00Z",
    _updated_by: "test",
    active_sprints: [],
    backlog: [],
    archive: [],
  },
  signal_queue: {
    _updated_at: "2026-06-02T00:00:00Z",
    _updated_by: "test",
    rows: [],
    archive: [],
  },
  sprint_goal: {},
};

// ─── tests ───────────────────────────────────────────────────────────────────

describe("writeOrchStateAtomic — §2.3 validate-before-rename sentinel", () => {
  const writtenPaths: string[] = [];

  afterEach(() => {
    for (const p of writtenPaths) {
      try { if (existsSync(p)) unlinkSync(p); } catch { /* best-effort */ }
    }
    writtenPaths.length = 0;
  });

  it("valid full OrchState object → writes file, content round-trips", () => {
    const target = makeTmpPath("valid");
    writtenPaths.push(target);

    writeOrchStateAtomic(target, VALID_ORCH_STATE);

    expect(existsSync(target)).toBe(true);
    const onDisk = JSON.parse(readFileSync(target, "utf8"));
    expect(onDisk._meta?.schema).toBe("v4");
    expect(onDisk.head).toBeDefined();
    expect(onDisk.task_board).toBeDefined();
    expect(onDisk.signal_queue).toBeDefined();
    // Deep equality: what we wrote equals what we read back
    expect(onDisk).toEqual(VALID_ORCH_STATE);
  });

  it("empty object {} → throws, pre-existing target file UNCHANGED", () => {
    const target = makeTmpPath("empty");
    writtenPaths.push(target);
    // Plant a sentinel file at the target path
    writeFileSync(target, SENTINEL_CONTENT, "utf8");

    expect(() => writeOrchStateAtomic(target, {})).toThrow(
      "[atomic-write] missing required top-level section — refusing to write",
    );

    // Target must still contain the sentinel — not clobbered
    const after = readFileSync(target, "utf8");
    expect(after).toBe(SENTINEL_CONTENT);
  });

  it("object missing .signal_queue → throws, target UNCHANGED", () => {
    const target = makeTmpPath("missing-sq");
    writtenPaths.push(target);
    writeFileSync(target, SENTINEL_CONTENT, "utf8");

    const partial = {
      _schema: "orch-state@1",
      head: { cycle: 1 },
      task_board: {
        _updated_at: "2026-06-02T00:00:00Z",
        _updated_by: "test",
        active_sprints: [],
        backlog: [],
        archive: [],
      },
      // signal_queue deliberately omitted
    };

    expect(() => writeOrchStateAtomic(target, partial)).toThrow(
      "[atomic-write] missing required top-level section — refusing to write",
    );

    const after = readFileSync(target, "utf8");
    expect(after).toBe(SENTINEL_CONTENT);
  });

  it("object missing .task_board → throws, target UNCHANGED", () => {
    const target = makeTmpPath("missing-tb");
    writtenPaths.push(target);
    writeFileSync(target, SENTINEL_CONTENT, "utf8");

    const partial = {
      _schema: "orch-state@1",
      head: { cycle: 1 },
      // task_board deliberately omitted
      signal_queue: { _updated_at: "", _updated_by: "", rows: [], archive: [] },
    };

    expect(() => writeOrchStateAtomic(target, partial)).toThrow(
      "[atomic-write] missing required top-level section — refusing to write",
    );

    const after = readFileSync(target, "utf8");
    expect(after).toBe(SENTINEL_CONTENT);
  });

  it("object missing .head → throws, target UNCHANGED", () => {
    const target = makeTmpPath("missing-head");
    writtenPaths.push(target);
    writeFileSync(target, SENTINEL_CONTENT, "utf8");

    const partial = {
      _schema: "orch-state@1",
      // head deliberately omitted
      task_board: {
        _updated_at: "",
        _updated_by: "",
        active_sprints: [],
        backlog: [],
        archive: [],
      },
      signal_queue: { _updated_at: "", _updated_by: "", rows: [], archive: [] },
    };

    expect(() => writeOrchStateAtomic(target, partial)).toThrow(
      "[atomic-write] missing required top-level section — refusing to write",
    );

    const after = readFileSync(target, "utf8");
    expect(after).toBe(SENTINEL_CONTENT);
  });

  it("writes to new (non-existent) path — creates parent dir and file", () => {
    const target = makeTmpPath("new-dir/nested/orch-state");
    writtenPaths.push(target);

    writeOrchStateAtomic(target, VALID_ORCH_STATE);
    expect(existsSync(target)).toBe(true);
    const onDisk = JSON.parse(readFileSync(target, "utf8"));
    expect(onDisk.signal_queue).toBeDefined();
  });

  // ── QA-6 (SSOT-W1-SERVER-ENFORCE) ─────────────────────────────────────────
  // task with status="PARKED" (non-canonical enum value) must:
  //   1. cause writeOrchStateAtomic to throw via safeParse BEFORE any rename
  //   2. leave the live orch-state.json file completely untouched (content + mtime)
  //
  // This proves the BINDING WEDGE-GUARD (project_mcp_server_write_wedge):
  //   - Silent write-wedge avoided: throws loudly with a clear validation error
  //   - Over-rejection guard: safeParse rejects only bad data, not valid writes
  // ──────────────────────────────────────────────────────────────────────────
  it("QA-6: task with status='PARKED' → throws pre-rename, live file content+mtime untouched", () => {
    const target = makeTmpPath("qa6-parked-status");
    writtenPaths.push(target);
    // Plant a sentinel file so we can verify it is never clobbered
    writeFileSync(target, SENTINEL_CONTENT, "utf8");
    const mtimeBefore = statSync(target).mtimeMs;

    // Build a full orch-state with one invalid task (status="PARKED" is not in StatusEnum)
    const invalidState = {
      ...VALID_ORCH_STATE,
      task_board: {
        ...VALID_ORCH_STATE.task_board,
        backlog: [{ id: "TASK-QA6", status: "PARKED", title: "bad task — PARKED not in StatusEnum" }],
      },
    };

    // ASSERT: writeOrchStateAtomic throws with schema validation error BEFORE any rename
    expect(() => writeOrchStateAtomic(target, invalidState)).toThrow(
      "[atomic-write] ORCH-STATE SCHEMA VALIDATION FAILED",
    );

    // ASSERT: the error message mentions the path or enum validation
    let caughtError: Error | null = null;
    try { writeOrchStateAtomic(target, invalidState); } catch (e) { caughtError = e as Error; }
    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain("[atomic-write] ORCH-STATE SCHEMA VALIDATION FAILED");

    // ASSERT: live file content is the original sentinel — NOT clobbered
    const afterContent = readFileSync(target, "utf8");
    expect(afterContent).toBe(SENTINEL_CONTENT);

    // ASSERT: mtime unchanged — no rename occurred (rename changes mtime on POSIX)
    const mtimeAfter = statSync(target).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  // ── Valid-write roundtrip (over-rejection guard) ───────────────────────────
  // Confirms safeParse does NOT over-reject legitimate data: a real orch-state
  // shape with all 12 canonical StatusEnum values passes end-to-end.
  // ──────────────────────────────────────────────────────────────────────────
  it("valid-write roundtrip: legitimate orch-state writes successfully (over-rejection guard)", () => {
    const target = makeTmpPath("qa6-valid-roundtrip");
    writtenPaths.push(target);

    // State with one task per canonical status lane (proves all 12 are accepted)
    const fullValidState = {
      _meta: { schema: "v4", ssot: true, updated_at: "2026-06-30T00:00:00Z", updated_by: "test" },
      head: { status: "in_progress", active_task_id: null },
      task_board: {
        active_sprints: [{ id: "SP-1", status: "ACTIVE", tasks: [
          { id: "A1", status: "IN_PROGRESS" },
          { id: "A2", status: "TODO" },
          { id: "A3", status: "REVIEW" },
          { id: "A4", status: "QA" },
          { id: "A5", status: "BLOCKED" },
          { id: "A6", status: "DONE" },
          { id: "A7", status: "DONE_VERIFIED" },
          { id: "A8", status: "CANCELLED" },
          { id: "A9", status: "DEFERRED" },
          { id: "A10", status: "SKIPPED" },
        ]}],
        backlog:       [{ id: "B1", status: "BACKLOG" }],
        ready:         [{ id: "R1", status: "READY" }],
        done:          [],
        done_verified: [],
        in_progress:   [],
        qa:            [],
        review:        [],
        archive:       [],
      },
      signal_queue: {
        _updated_at: "2026-06-30T00:00:00Z",
        _updated_by: "test",
        rows: [],
        archive: [],
      },
    };

    // Must succeed without throwing
    expect(() => writeOrchStateAtomic(target, fullValidState)).not.toThrow();
    expect(existsSync(target)).toBe(true);
    const onDisk = JSON.parse(readFileSync(target, "utf8"));
    expect(onDisk.task_board.backlog[0].status).toBe("BACKLOG");
    expect(onDisk.task_board.ready[0].status).toBe("READY");
    expect(onDisk.task_board.active_sprints[0].tasks[0].status).toBe("IN_PROGRESS");
  });
});
