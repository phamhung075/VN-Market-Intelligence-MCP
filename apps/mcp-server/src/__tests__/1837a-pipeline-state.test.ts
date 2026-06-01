/**
 * Task 1837a — OSC-2 migration: orch-state.json schema (was pipeline-state.json)
 *
 * These tests verify docs/data/orch/orch-state.json .head has the correct v3 schema
 * and valid field values required for post-/compact pipeline resume.
 *
 * OSC-2: path re-pointed from docs/pipeline-state.json → docs/data/orch/orch-state.json.
 *        Interface updated from camelCase v2 → snake_case v3 head fields.
 *
 * AC-1: file exists with all required head fields (v3 schema)
 * AC-2: head.status is one of "in_progress" | "idle" | "blocked" | "stale"
 * AC-3: head.updated_at is a valid ISO date string
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const ORCH_STATE_PATH = resolve(
  import.meta.dir,
  "../../../../docs/data/orch/orch-state.json"
);

/** v3 orch-state.json head schema (snake_case) */
interface OrchStateHead {
  status: string;
  active_task_id: string | null;
  next_agent: string | null;
  next_action: string;
  wip: number;
  wip_max: number;
  updated_at: string;
  updated_by: string;
}

interface OrchState {
  _schema: string;
  head: OrchStateHead;
  task_board: Record<string, unknown>;
  signal_queue: Record<string, unknown>;
}

function loadOrchState(): OrchState {
  const raw = readFileSync(ORCH_STATE_PATH, "utf-8");
  return JSON.parse(raw) as OrchState;
}

describe("1837a — orch-state.json schema (v3)", () => {
  it("AC-1: file exists and head has all required v3 fields", () => {
    const state = loadOrchState();
    expect(state._schema).toBe("v3");

    const head = state.head;
    const requiredFields: (keyof OrchStateHead)[] = [
      "status",
      "active_task_id",
      "next_agent",
      "next_action",
      "wip",
      "wip_max",
      "updated_at",
      "updated_by",
    ];

    for (const field of requiredFields) {
      expect(
        Object.prototype.hasOwnProperty.call(head, field),
        `Missing required head field: ${field}`
      ).toBe(true);
    }
  });

  it("AC-2: head.status is one of the valid pipeline statuses", () => {
    const state = loadOrchState();
    const validStatuses = ["in_progress", "idle", "blocked", "stale"];
    expect(validStatuses).toContain(state.head.status);
  });

  it("AC-3: head.updated_at is a valid ISO date string", () => {
    const state = loadOrchState();
    const parsed = new Date(state.head.updated_at);
    expect(isNaN(parsed.getTime())).toBe(false);
    // Must look like ISO 8601 (contains T or be a compact UTC string)
    expect(state.head.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("AC-4: task_board section present with active_sprints array", () => {
    const state = loadOrchState();
    expect(state.task_board).toBeDefined();
    expect(Array.isArray((state.task_board as { active_sprints?: unknown[] }).active_sprints)).toBe(true);
  });

  it("AC-5: signal_queue section present with rows array", () => {
    const state = loadOrchState();
    expect(state.signal_queue).toBeDefined();
    expect(Array.isArray((state.signal_queue as { rows?: unknown[] }).rows)).toBe(true);
  });
});
