/**
 * Unit tests for writeOrchStateAtomic §2.3 sentinel guard.
 *
 * Covers:
 *  1. Valid full OrchState → file written, content equals input.
 *  2. Empty object {} → throws, pre-existing target file UNCHANGED.
 *  3. Object missing .signal_queue → throws, target UNCHANGED.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
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

const VALID_ORCH_STATE = {
  _schema: "orch-state@1",
  _ssot: true,
  _updated_at: "2026-06-02T00:00:00Z",
  _updated_by: "test",
  head: { cycle: 1, last_activity: "2026-06-02T00:00:00Z" },
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
    expect(onDisk._schema).toBe("orch-state@1");
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
});
