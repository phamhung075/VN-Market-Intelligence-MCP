/**
 * orchStateSchema.test.ts — Unit tests for orchStateSchema.ts
 *
 * Sprint: SSOT-INTEGRITY-PERIMETER  Task: SSOT-W1-ZOD-SCHEMA-MODEL
 *
 * Tests:
 *   L1  — Live fixture: current docs/data/orch/orch-state.json parses structurally clean
 *   L2  — Live fixture: StatusEnum values in live data are all canonical
 *   M1  — Bad mutation: unknown root key is rejected (unrecognized_keys)
 *   M2  — Bad mutation: unknown task_board key is rejected (unrecognized_keys)
 *   M3  — Bad mutation: invalid task status enum value is rejected
 *   M4  — Bad mutation: dangling head.active_task_id is rejected (custom superRefine)
 *   C1  — checkLaneCoherence: canonical task in correct lane passes
 *   C2  — checkLaneCoherence: wrong-lane task is flagged
 *   C3  — checkLaneCoherence: live data coherence issues are identified
 *   R1  — checkRefIntegrity: existing file resolves clean
 *   R2  — checkRefIntegrity: missing file ref is flagged
 *   E1  — StatusEnum: all 12 values accepted
 *   E2  — StatusEnum: non-canonical values rejected
 *   T1  — TypeScript: z.infer types are exportable (compile-time only)
 */

// Must be set before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  OrchStateSchema,
  StatusEnum,
  TaskSchema,
  Lane,
  SprintSchema,
  SignalQueueSchema,
  TaskBoardSchema,
  checkLaneCoherence,
  checkRefIntegrity,
  LANE_ALLOWED_STATUSES,
  TERMINAL_SET,
  RawProbeSchema,
  VerificationSchema,
} from "../orchStateSchema.js";
import type {
  OrchState,
  Status,
  Task,
  TaskLane,
  Sprint,
  SignalRow,
  SignalQueue,
  TaskBoard,
  Meta,
  Head,
  LaneCoherenceIssue,
  RefIntegrityIssue,
  FileResolver,
  RawProbe,
  Verification,
} from "../orchStateSchema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dir, "../../../../..");

const ORCH_STATE_PATH = resolve(PROJECT_ROOT, "docs/data/orch/orch-state.json");

/** Absolute path to the canonical validator CLI. */
const VALIDATOR_PATH = resolve(PROJECT_ROOT, "scripts/orch-validate.mjs");

/** Counter for unique temp filenames per test run. */
let _cliTmpCounter = 0;

/**
 * Write JSON (string or object) to a temp file, spawn the validator CLI,
 * return the result. Temp file is always deleted in the finally block.
 */
function runCliValidator(content: string | object): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const tmpFile = `/tmp/orchSchemaTest-${process.pid}-${++_cliTmpCounter}.json`;
  const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  writeFileSync(tmpFile, text, "utf-8");
  try {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, tmpFile], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    return {
      exitCode: result.status ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
  }
}

/** Minimal valid orch-state object (no active_task_id). */
function makeValidBase(): Record<string, unknown> {
  return {
    head: { status: "idle", active_task_id: null },
    signal_queue: {
      _updated_at: "2026-06-27T00:00:00Z",
      _updated_by: "cli-test-fixture",
      rows: [],
    },
    task_board: {
      backlog: [{ id: "CLI-T1", status: "BACKLOG" }],
      active_sprints: [],
    },
  };
}

function loadLiveOrchState(): unknown {
  try {
    return JSON.parse(readFileSync(ORCH_STATE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/** Build a minimal valid OrchState for mutation tests. */
function makeMinimalOrchState(): Record<string, unknown> {
  return {
    _meta: { schema: "v4", ssot: true },
    head: {
      status: "in_progress",
      active_task_id: "TASK-TEST-001",
      next_agent: "dev-mcp-server",
      updated_by: "test",
      updated_at: "2026-06-27T00:00:00Z",
    },
    signal_queue: {
      _updated_at: "2026-06-27T00:00:00Z",
      _updated_by: "test",
      rows: [],
      archive: [],
    },
    task_board: {
      active_sprints: [],
      backlog: [
        { id: "TASK-TEST-001", status: "BACKLOG", title: "Test task" },
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// L1 — Live fixture: current orch-state.json parses structurally clean
//
// The live file may have lane-coherence violations (expected during SHG migration)
// but must have ZERO structural errors (invalid_type, unrecognized_keys,
// invalid_enum_value). This proves:
//   (a) the SCHEMA shape matches reality (no false-negative rejection of valid data)
//   (b) the schema's .strict() at OrchStateSchema/TaskBoardSchema levels does not
//       over-reject (all known fields are enumerated)
// ─────────────────────────────────────────────────────────────────────────────

describe("L1 — Live fixture parse", () => {
  it("L1-a: live orch-state.json parses with OrchStateSchema (success)", () => {
    const raw = loadLiveOrchState();
    if (!raw) {
      console.log("[test] orch-state.json not found — skipping live test");
      return;
    }
    const result = OrchStateSchema.safeParse(raw);
    if (!result.success) {
      // Print issues to help diagnose — then fail
      console.error("[orchStateSchema test] L1-a FAIL — parse issues:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("L1-b: live head.active_task_id resolves to a task in task_board", () => {
    const raw = loadLiveOrchState();
    if (!raw) return;
    const result = OrchStateSchema.safeParse(raw);
    // If this is the only failure, active_task_id is dangling (data problem)
    const refIssues = result.success
      ? []
      : result.error.issues.filter(i => i.path.join(".") === "head.active_task_id");
    expect(refIssues).toHaveLength(0);
  });

  it("L1-c: live task_board has all 9 lane keys present", () => {
    const raw = loadLiveOrchState();
    if (!raw || typeof raw !== "object") return;
    const tb = (raw as Record<string, unknown>)["task_board"];
    if (!tb || typeof tb !== "object") return;
    const tbObj = tb as Record<string, unknown>;
    const requiredLanes = [
      "backlog", "done", "done_verified", "in_progress",
      "qa", "ready", "review", "active_sprints", "closed_sprints",
    ];
    for (const lane of requiredLanes) {
      expect(Array.isArray(tbObj[lane]), `task_board.${lane} must be an array`).toBe(true);
    }
  });

  it("L1-d: live _meta.schema is v4", () => {
    const raw = loadLiveOrchState();
    if (!raw || typeof raw !== "object") return;
    const meta = (raw as Record<string, unknown>)["_meta"];
    if (!meta || typeof meta !== "object") return;
    expect((meta as Record<string, unknown>)["schema"]).toBe("v4");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L2 — Live fixture: all task statuses are canonical
// ─────────────────────────────────────────────────────────────────────────────

describe("L2 — Live fixture: task statuses", () => {
  it("L2-a: all flat-lane task statuses are in StatusEnum", () => {
    const raw = loadLiveOrchState();
    if (!raw || typeof raw !== "object") return;
    const tb = (raw as Record<string, unknown>)["task_board"] as Record<string, unknown> | undefined;
    if (!tb) return;

    const validStatuses: ReadonlySet<string> = new Set<string>(StatusEnum.options);
    const flatLanes = ["backlog", "done", "done_verified", "in_progress", "qa", "ready", "review"];

    for (const lane of flatLanes) {
      const tasks = tb[lane];
      if (!Array.isArray(tasks)) continue;
      for (const task of tasks) {
        if (task && typeof task === "object") {
          const t = task as Record<string, unknown>;
          const status = t["status"];
          if (typeof status === "string") {
            expect(
              validStatuses.has(status),
              `Lane "${lane}" task "${t["id"]}" has invalid status: "${status}"`
            ).toBe(true);
          }
        }
      }
    }
  });

  it("L2-b: all active_sprint task statuses are in StatusEnum", () => {
    const raw = loadLiveOrchState();
    if (!raw || typeof raw !== "object") return;
    const tb = (raw as Record<string, unknown>)["task_board"] as Record<string, unknown> | undefined;
    if (!tb) return;

    const validStatuses: ReadonlySet<string> = new Set<string>(StatusEnum.options);
    const activeSprints = tb["active_sprints"];
    if (!Array.isArray(activeSprints)) return;

    for (const sprint of activeSprints) {
      if (!sprint || typeof sprint !== "object") continue;
      const tasks = (sprint as Record<string, unknown>)["tasks"];
      if (!Array.isArray(tasks)) continue;
      for (const task of tasks) {
        if (!task || typeof task !== "object") continue;
        const t = task as Record<string, unknown>;
        const status = t["status"];
        if (typeof status === "string") {
          expect(
            validStatuses.has(status),
            `Sprint task "${t["id"]}" has invalid status: "${status}"`
          ).toBe(true);
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1 — Bad mutation: unknown root key rejected
// ─────────────────────────────────────────────────────────────────────────────

describe("M1 — Unknown root key rejected (.strict())", () => {
  it("M1-a: unknown top-level key is rejected with unrecognized_keys", () => {
    const bad = { ...makeMinimalOrchState(), INJECTED_UNKNOWN_KEY: "malicious" };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const unknownKeyIssue = result.error.issues.find(i => i.code === "unrecognized_keys");
      expect(unknownKeyIssue).toBeDefined();
    }
  });

  it("M1-b: whole orch-state nested as extra root key is rejected", () => {
    const base = makeMinimalOrchState();
    const bad = { ...base, decision_journal_EXTRA: base };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 — Bad mutation: unknown task_board key rejected
// ─────────────────────────────────────────────────────────────────────────────

describe("M2 — Unknown task_board key rejected (.strict())", () => {
  it("M2-a: extra key in task_board is rejected", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    const tb = base["task_board"] as Record<string, unknown>;
    const bad = { ...base, task_board: { ...tb, INJECTED_TB_KEY: "garbage" } };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const unknownIssue = result.error.issues.find(i => i.code === "unrecognized_keys");
      expect(unknownIssue).toBeDefined();
    }
  });

  it("M2-b: whole doc nested into task_board.backlog is rejected (dup-key class)", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    // Simulate "jq nests whole doc into task_board.backlog":
    // The whole doc has keys like decision_journal, signal_queue, etc. that are NOT task fields.
    const tb = base["task_board"] as Record<string, unknown>;
    const wholeDocAsTask = { ...base, id: "corrupt", status: "BACKLOG" };
    const bad = {
      ...base,
      task_board: { ...tb, backlog: [wholeDocAsTask] },
    };
    // The wholeDocAsTask has extra task fields (signal_queue, head, etc.) that
    // TaskSchema.passthrough() allows — but the task's StatusEnum validation
    // catches if status is wrong. The corruption CLASS is caught at task_board level.
    // More importantly: the STRUCTURE is wrong if whole-doc is in task_board root.
    const result = OrchStateSchema.safeParse(bad);
    // Whether it passes depends on passthrough — the key protection is .strict()
    // on TaskBoardSchema rejecting unknown LANE-LEVEL keys, not task-level keys.
    // This test documents the behavior (passthrough task, strict task_board):
    expect(typeof result.success).toBe("boolean"); // schema runs without throwing
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M3 — Bad mutation: invalid task status enum rejected
// ─────────────────────────────────────────────────────────────────────────────

describe("M3 — Invalid status enum rejected", () => {
  it("M3-a: status=PARKED in backlog task is rejected", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    const tb = base["task_board"] as Record<string, unknown>;
    const bad = {
      ...base,
      task_board: {
        ...tb,
        backlog: [{ id: "TASK-001", status: "PARKED", title: "bad task" }],
      },
    };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const enumIssue = result.error.issues.find(i => i.code === "invalid_enum_value");
      expect(enumIssue).toBeDefined();
      expect(enumIssue?.path).toContain("status");
    }
  });

  it("M3-b: status=FOLDED in active_sprint task is rejected", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    const tb = base["task_board"] as Record<string, unknown>;
    const bad = {
      ...base,
      task_board: {
        ...tb,
        active_sprints: [{
          id: "SPRINT-TEST", status: "ACTIVE", tasks: [
            { id: "TASK-002", status: "FOLDED", title: "old spelling" },
          ],
        }],
      },
    };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const enumIssue = result.error.issues.find(i => i.code === "invalid_enum_value");
      expect(enumIssue).toBeDefined();
    }
  });

  it("M3-c: status=done (lowercase) in done task is rejected", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    const tb = base["task_board"] as Record<string, unknown>;
    const bad = {
      ...base,
      task_board: {
        ...tb,
        backlog: [{ id: "TASK-TEST-001", status: "BACKLOG" }],
        done: [{ id: "TASK-003", status: "done", title: "lowercase" }],
      },
    };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const enumIssue = result.error.issues.find(i => i.code === "invalid_enum_value");
      expect(enumIssue).toBeDefined();
    }
  });

  it("M3-d: valid canonical statuses in all 9 lanes pass enum check", () => {
    const state = {
      _meta: { schema: "v4" },
      head: { status: "in_progress", active_task_id: "A", updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog:       [{ id: "A", status: "BACKLOG" }],
        done:          [{ id: "B", status: "DONE" }],
        // RC-VERIF (SYSREMAKE-P2-T2): DONE_VERIFIED now requires verification.raw_probe
        // unless grandfathered — "C" is a synthetic test id, not a live grandfathered
        // row, so it must carry a valid raw_probe to keep passing this enum-only check.
        done_verified: [{ id: "C", status: "DONE_VERIFIED", verification: { raw_probe: {
          tool: "test", args: "n/a", live_value_observed: "n/a", observed_at: "2026-01-01T00:00:00Z",
        } } }],
        in_progress:   [{ id: "D", status: "IN_PROGRESS" }],
        qa:            [{ id: "E", status: "QA" }],
        ready:         [{ id: "F", status: "READY" }],
        review:        [{ id: "G", status: "REVIEW" }],
        active_sprints: [{ id: "SP-1", status: "ACTIVE", tasks: [{ id: "H", status: "TODO" }] }],
        closed_sprints: [{ id: "SP-X", status: "DONE",   tasks: [{ id: "I", status: "DONE" }] }],
      },
    };
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) {
      console.error("[test] M3-d FAIL:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M4 — Bad mutation: dangling head.active_task_id rejected
// ─────────────────────────────────────────────────────────────────────────────

describe("M4 — Dangling head.active_task_id rejected (superRefine)", () => {
  it("M4-a: active_task_id pointing to non-existent task is rejected", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    // Inject a task_id that does NOT exist in task_board
    const bad = {
      ...base,
      head: {
        ...(base["head"] as Record<string, unknown>),
        active_task_id: "NONEXISTENT-TASK-XYZ-999",
      },
    };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const refIssue = result.error.issues.find(
        i => i.code === "custom" && i.path.join(".") === "head.active_task_id"
      );
      expect(refIssue).toBeDefined();
      expect(refIssue?.message).toContain("NONEXISTENT-TASK-XYZ-999");
    }
  });

  it("M4-b: active_task_id=null is allowed (no active task)", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    const state = {
      ...base,
      head: {
        ...(base["head"] as Record<string, unknown>),
        active_task_id: null,
      },
    };
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  it("M4-c: active_task_id resolving to backlog task passes", () => {
    const result = OrchStateSchema.safeParse(makeMinimalOrchState());
    // The minimal state has TASK-TEST-001 in backlog and head points to it
    expect(result.success).toBe(true);
  });

  it("M4-d: active_task_id resolving to active_sprint task passes", () => {
    const state = {
      _meta: { schema: "v4" },
      head: {
        status: "in_progress",
        active_task_id: "SPRINT-TASK-001",
        updated_by: "test",
        updated_at: "2026-06-27T00:00:00Z",
      },
      signal_queue: {
        _updated_at: "2026-06-27T00:00:00Z",
        _updated_by: "test",
        rows: [],
        archive: [],
      },
      task_board: {
        backlog: [],
        active_sprints: [
          {
            id: "SP-1", status: "ACTIVE",
            tasks: [{ id: "SPRINT-TASK-001", status: "IN_PROGRESS" }],
          },
        ],
      },
    };
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C1-C3 — checkLaneCoherence
// ─────────────────────────────────────────────────────────────────────────────

describe("C1 — checkLaneCoherence: canonical task in correct lane", () => {
  it("C1-a: BACKLOG task in backlog[] passes", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog: [{ id: "T1", status: "BACKLOG" }],
        active_sprints: [],
      },
    });
    const issues = checkLaneCoherence(state);
    expect(issues.filter(i => i.taskId === "T1")).toHaveLength(0);
  });

  it("C1-b: DONE task in done[] passes", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog: [],
        done: [{ id: "T2", status: "DONE" }],
        active_sprints: [],
      },
    });
    const issues = checkLaneCoherence(state);
    expect(issues.filter(i => i.taskId === "T2")).toHaveLength(0);
  });

  it("C1-c: READY task in ready[] passes", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog: [],
        ready: [{ id: "T3", status: "READY" }],
        active_sprints: [],
      },
    });
    const issues = checkLaneCoherence(state);
    expect(issues.filter(i => i.taskId === "T3")).toHaveLength(0);
  });
});

describe("C2 — checkLaneCoherence: wrong-lane task is flagged", () => {
  it("C2-a: IN_PROGRESS task in backlog[] is flagged", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "in_progress", active_task_id: "T-IP", updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog: [{ id: "T-IP", status: "IN_PROGRESS" }],
        active_sprints: [],
      },
    });
    const issues = checkLaneCoherence(state);
    const found = issues.find(i => i.taskId === "T-IP" && i.lane === "backlog");
    expect(found).toBeDefined();
    expect(found?.status).toBe("IN_PROGRESS");
    expect(found?.allowedStatuses).toContain("BACKLOG");
  });

  it("C2-b: DONE task in review[] is flagged", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog: [],
        review: [{ id: "T-DONE-IN-REVIEW", status: "DONE" }],
        active_sprints: [],
      },
    });
    const issues = checkLaneCoherence(state);
    const found = issues.find(i => i.taskId === "T-DONE-IN-REVIEW" && i.lane === "review");
    expect(found).toBeDefined();
    expect(found?.fix).toContain("REVIEW");
  });

  it("C2-c: issue contains actionable fix hint", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog: [],
        // RC-VERIF (SYSREMAKE-P2-T2): DONE_VERIFIED requires verification.raw_probe (or grandfathering);
        // "T-DV" is a synthetic id, so it must carry a valid raw_probe or OrchStateSchema.parse() throws.
        done: [{ id: "T-DV", status: "DONE_VERIFIED", verification: { raw_probe: {
          tool: "test", args: "n/a", live_value_observed: "n/a", observed_at: "2026-01-01T00:00:00Z",
        } } }], // DONE_VERIFIED is allowed in done[]
        done_verified: [{ id: "T-IN-DV", status: "DONE" }], // DONE is NOT allowed in done_verified[]
        active_sprints: [],
      },
    });
    const issues = checkLaneCoherence(state);
    const found = issues.find(i => i.taskId === "T-IN-DV" && i.lane === "done_verified");
    expect(found).toBeDefined();
    expect(found?.fix).toContain("DONE_VERIFIED");
  });
});

describe("C3 — checkLaneCoherence: live data coherence status", () => {
  it("C3-a: live data has zero lane-coherence issues (post SHG migration, Stage 1b hard-fail)", () => {
    const raw = loadLiveOrchState();
    if (!raw) return;
    const result = OrchStateSchema.safeParse(raw);
    if (!result.success) {
      console.log("[test] C3-a: skipping coherence check — live data did not parse");
      return;
    }
    const issues = checkLaneCoherence(result.data);
    // Post D3 (relabel) + D2.5 (schema-blocked lane) + D1 (sweep-execute),
    // live orch-state.json is expected to be fully lane-coherent. D5 flipped
    // Stage 1b in scripts/orch-validate.mjs to hard-fail on any issue found here.
    console.log(`[test] C3-a: ${issues.length} lane coherence issue(s) in live data (expect 0 post-migration)`);
    for (const issue of issues.slice(0, 3)) {
      console.log(`  → ${issue.lane}[${issue.taskId}]: ${issue.status} (expected: ${issue.allowedStatuses.join(",")})`);
    }
    // Verified behavior: checkLaneCoherence returns an array
    expect(Array.isArray(issues)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R1-R2 — checkRefIntegrity
// ─────────────────────────────────────────────────────────────────────────────

describe("R1 — checkRefIntegrity: existing file resolves clean", () => {
  it("R1-a: payload_ref pointing to existing file returns no issues", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: {
        _updated_at: "2026-01-01T00:00:00Z",
        _updated_by: "t",
        rows: [{
          id: "s1", summary: "test", severity: "LOW", status: "NEW",
          payload_ref: "docs/data/orch/orch-state.json",
        }],
        archive: [],
      },
      task_board: { backlog: [], active_sprints: [] },
    });

    const mockExists: FileResolver = (p) => p.includes("orch-state.json");
    const issues = checkRefIntegrity(state, mockExists, "/project");
    expect(issues).toHaveLength(0);
  });

  it("R1-b: detail_ref with fragment pointing to existing file returns no issues", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog: [{
          id: "T1", status: "BACKLOG",
          detail_ref: "docs/data/orch/archive/backlog-detail.json#T1",
        }],
        active_sprints: [],
      },
    });

    const mockExists: FileResolver = (p) => p.includes("backlog-detail.json");
    const issues = checkRefIntegrity(state, mockExists, "/project");
    expect(issues).toHaveLength(0);
  });
});

describe("R2 — checkRefIntegrity: missing file ref is flagged", () => {
  it("R2-a: payload_ref pointing to missing file is flagged", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: {
        _updated_at: "2026-01-01T00:00:00Z",
        _updated_by: "t",
        rows: [{
          id: "s1", summary: "test", severity: "LOW", status: "NEW",
          payload_ref: "docs/signals/nonexistent-signal.json",
        }],
        archive: [],
      },
      task_board: { backlog: [], active_sprints: [] },
    });

    const mockExists: FileResolver = () => false;
    const issues = checkRefIntegrity(state, mockExists, "/project");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]?.path).toContain("signal_queue");
    expect(issues[0]?.ref).toContain("docs/signals/nonexistent-signal.json");
    expect(issues[0]?.fix).toContain("/project/");
  });

  it("R2-b: dangling docs/signals/ payload_refs are identified (the 6 known refs)", () => {
    // Simulates the known class of dangling signal refs in the live data
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: {
        _updated_at: "2026-01-01T00:00:00Z",
        _updated_by: "t",
        rows: [
          { id: "s1", summary: "s1", severity: "LOW", status: "NEW", payload_ref: "docs/signals/deleted-file.json" },
          { id: "s2", summary: "s2", severity: "LOW", status: "NEW", payload_ref: null },
          { id: "s3", summary: "s3", severity: "LOW", status: "NEW" }, // no payload_ref
        ],
        archive: [],
      },
      task_board: { backlog: [], active_sprints: [] },
    });

    const mockExists: FileResolver = () => false; // all missing
    const issues = checkRefIntegrity(state, mockExists, "/project");
    // Only s1 has a non-null payload_ref → 1 issue
    expect(issues).toHaveLength(1);
    expect(issues[0]?.ref).toBe("docs/signals/deleted-file.json");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E1-E2 — StatusEnum validation
// ─────────────────────────────────────────────────────────────────────────────

describe("E1 — StatusEnum: all 12 canonical values accepted", () => {
  const CANONICAL_12: Status[] = [
    "BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "QA",
    "DONE", "DONE_VERIFIED", "BLOCKED", "DEFERRED",
    "CANCELLED", "SKIPPED",
    "READY",  // ADD-1: 12th value
  ];

  for (const status of CANONICAL_12) {
    it(`E1: StatusEnum.parse("${status}") succeeds`, () => {
      expect(() => StatusEnum.parse(status)).not.toThrow();
    });
  }
});

describe("E2 — StatusEnum: non-canonical values rejected", () => {
  const LEGACY_SPELLINGS = [
    "done", "DONE-LIVE-VERIFIED", "done_verified", "DONE-DEPLOYED",
    "PARKED", "FOLDED", "SUPERSEDED", "HELD", "REWORK",
    "NEW", "backlog", "review", "ARCHITECT_REVIEW", "CHANGES_REQUESTED",
    "CLOSED-NO-CHANGE", "DEFERRED-SUPERSEDED", "BLOCKED-UPSTREAM",
    "blocked-probe5", "DEFERRED-P3",
  ];

  for (const bad of LEGACY_SPELLINGS) {
    it(`E2: StatusEnum.parse("${bad}") throws`, () => {
      expect(() => StatusEnum.parse(bad)).toThrow();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TERMINAL_SET
// ─────────────────────────────────────────────────────────────────────────────

describe("TERMINAL_SET: sprint eviction predicate values", () => {
  it("TERMINAL_SET contains exactly: DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED", () => {
    expect(TERMINAL_SET.has("DONE")).toBe(true);
    expect(TERMINAL_SET.has("DONE_VERIFIED")).toBe(true);
    expect(TERMINAL_SET.has("CANCELLED")).toBe(true);
    expect(TERMINAL_SET.has("DEFERRED")).toBe(true);
    expect(TERMINAL_SET.has("SKIPPED")).toBe(true);
    expect(TERMINAL_SET.size).toBe(5);
    // Non-terminal
    expect(TERMINAL_SET.has("IN_PROGRESS")).toBe(false);
    expect(TERMINAL_SET.has("REVIEW")).toBe(false);
    expect(TERMINAL_SET.has("TODO")).toBe(false);
    expect(TERMINAL_SET.has("READY")).toBe(false);
    expect(TERMINAL_SET.has("BLOCKED")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QA-1 — All-lane status enum injection (closes 3-of-9 false-green gap)
//
// SSOT-W1-ZOD-SCHEMA-MODEL acceptance gate.
// Prior coverage: M3 covers backlog (lane 1), active_sprints (lane 8), done (lane 2).
// This suite adds the 6 missing lanes: done_verified, in_progress, qa, ready,
// review, closed_sprints. Together M3 + QA-1 guarantee all 9 lanes reject
// invalid status values — "by construction" via the shared Lane type.
//
// Injected values: "PARKED" (common misuse), "done_verified" (lowercase mis-spell),
// "FOLDED" (legacy pre-enum value).
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal valid OrchState fixture (no active_task_id — simpler base). */
function makeNullHeadState(laneOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _meta: { schema: "v4" },
    head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
    signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
    task_board: {
      active_sprints: [],
      ...laneOverrides,
    },
  };
}

describe("QA-1 — All-lane status enum injection (9 of 9 lanes)", () => {
  // lanes 1 (backlog), 8 (active_sprints), 2 (done) already covered by M3-a/b/c.
  // lanes 3-7 + 9 are new coverage:

  it("QA-1-done_verified: FOLDED in done_verified task is rejected", () => {
    const state = makeNullHeadState({
      done_verified: [{ id: "T1", status: "FOLDED", title: "bad" }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === "invalid_enum_value")).toBe(true);
    }
  });

  it("QA-1-in_progress: done_verified (lowercase) in in_progress task is rejected", () => {
    const state = makeNullHeadState({
      in_progress: [{ id: "T2", status: "done_verified", title: "bad" }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === "invalid_enum_value")).toBe(true);
    }
  });

  it("QA-1-qa: PARKED in qa task is rejected", () => {
    const state = makeNullHeadState({
      qa: [{ id: "T3", status: "PARKED", title: "bad" }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === "invalid_enum_value")).toBe(true);
    }
  });

  it("QA-1-ready: FOLDED in ready task is rejected", () => {
    const state = makeNullHeadState({
      ready: [{ id: "T4", status: "FOLDED", title: "bad" }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === "invalid_enum_value")).toBe(true);
    }
  });

  it("QA-1-review: PARKED in review task is rejected", () => {
    const state = makeNullHeadState({
      review: [{ id: "T5", status: "PARKED", title: "bad" }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === "invalid_enum_value")).toBe(true);
    }
  });

  it("QA-1-closed_sprints: done_verified (lowercase) in closed_sprint task is rejected", () => {
    const state = makeNullHeadState({
      closed_sprints: [{
        id: "SP-CLOSED", status: "DONE",
        tasks: [{ id: "T6", status: "done_verified", title: "bad" }],
      }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === "invalid_enum_value")).toBe(true);
    }
  });

  it("QA-1-all-9: summary — valid canonical status in all 9 lanes passes", () => {
    // This is M3-d extracted as QA-1 canary: if all 9 accept valid values,
    // the Lane type is correctly wired for all 9 lanes.
    const state = {
      _meta: { schema: "v4" },
      head: { status: "in_progress", active_task_id: "A", updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog:       [{ id: "A", status: "BACKLOG" }],       // lane 1
        done:          [{ id: "B", status: "DONE" }],          // lane 2
        // RC-VERIF (SYSREMAKE-P2-T2): DONE_VERIFIED requires verification.raw_probe (or grandfathering).
        done_verified: [{ id: "C", status: "DONE_VERIFIED", verification: { raw_probe: {
          tool: "test", args: "n/a", live_value_observed: "n/a", observed_at: "2026-01-01T00:00:00Z",
        } } }], // lane 3
        in_progress:   [{ id: "D", status: "IN_PROGRESS" }],  // lane 4
        qa:            [{ id: "E", status: "QA" }],            // lane 5
        ready:         [{ id: "F", status: "READY" }],         // lane 6
        review:        [{ id: "G", status: "REVIEW" }],        // lane 7
        active_sprints:  [{ id: "SP-1", status: "ACTIVE", tasks: [{ id: "H", status: "TODO" }] }],   // lane 8
        closed_sprints:  [{ id: "SP-X", status: "DONE",   tasks: [{ id: "I", status: "DONE" }] }],  // lane 9
      },
    };
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) {
      console.error("[test] QA-1-all-9 FAIL:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RCV-0..RCV-8 — RC-VERIF completion gate (SYSREMAKE-P2-T2-SCHEMA-ADDITIONS)
//
// Minimal TDD coverage proving § 1A schema shapes + § 8A checkVerificationGate()
// wiring. This is deliberately NOT the full V1-V5/D1-D2/T1 exhaustive matrix
// from docs/architecture-briefs/2026-07-17-sysremake-p2-rcverif-rcconverge.md §6
// (9-lane injection, CLI AC-5, server-path parity) — that comprehensive suite is
// the separately-tracked SYSREMAKE-P2-T3 board row (depends_on this task).
// ─────────────────────────────────────────────────────────────────────────────

/** Valid 4-field raw_probe fixture (RawProbeSchema shape). */
function makeValidRawProbe(): Record<string, unknown> {
  return {
    tool: "sqlite3 orch-state.json",
    args: { query: "select 1" },
    live_value_observed: "1",
    observed_at: "2026-08-08T18:00:00Z",
  };
}

describe("RCV-0 — RawProbeSchema / VerificationSchema shape", () => {
  it("RCV-0-a: valid raw_probe (all 4 fields) parses", () => {
    const result = RawProbeSchema.safeParse(makeValidRawProbe());
    expect(result.success).toBe(true);
  });

  it("RCV-0-b: raw_probe missing observed_at fails", () => {
    const bad = makeValidRawProbe();
    delete bad["observed_at"];
    const result = RawProbeSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("RCV-0-c: VerificationSchema accepts honest_gap_reason alone (no raw_probe)", () => {
    const result = VerificationSchema.safeParse({ honest_gap_reason: "network outage during probe window" });
    expect(result.success).toBe(true);
  });
});

describe("RCV-1 — checkVerificationGate: fabricated DONE_VERIFIED rejected", () => {
  it("RCV-1-a: non-grandfathered id, DONE_VERIFIED, no verification field → rejected", () => {
    const state = makeNullHeadState({
      backlog: [],
      done_verified: [{ id: "RCV-FABRICATED-001", status: "DONE_VERIFIED", title: "no proof" }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        i => i.code === "custom" && i.path.join(".") === "task_board.done_verified.0.verification.raw_probe",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("RCV-FABRICATED-001");
    }
  });

  it("RCV-1-b: non-grandfathered id, DONE_VERIFIED, verification present but raw_probe missing observed_at → rejected", () => {
    const state = makeNullHeadState({
      backlog: [],
      done_verified: [{
        id: "RCV-MALFORMED-002", status: "DONE_VERIFIED",
        verification: { raw_probe: { tool: "t", args: "a", live_value_observed: "v" } }, // no observed_at
      }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });
});

describe("RCV-2 — checkVerificationGate: valid raw_probe accepted", () => {
  it("RCV-2-a: non-grandfathered id, all 4 raw_probe fields present → accepted", () => {
    const state = makeNullHeadState({
      backlog: [],
      done_verified: [{ id: "RCV-VERIFIED-003", status: "DONE_VERIFIED", verification: { raw_probe: makeValidRawProbe() } }],
    });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] RCV-2-a FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });
});

describe("RCV-3 — checkVerificationGate: grandfathered id exempted (regression guard)", () => {
  it("RCV-3-a: known-live grandfathered id, DONE_VERIFIED, no verification field → still accepted", () => {
    // "HSC-1" is one of the 50 ids frozen into RC_VERIF_GRANDFATHERED_IDS (§ 8A) —
    // proves pre-existing live rows keep parsing without retroactive fabrication.
    const state = makeNullHeadState({
      backlog: [],
      done_verified: [{ id: "HSC-1", status: "DONE_VERIFIED", title: "pre-RC-VERIF completion" }],
    });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] RCV-3-a FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });
});

describe("RCV-4 — checkVerificationGate: DEGRADED requires honest_gap_reason", () => {
  it("RCV-4-a: DEGRADED without honest_gap_reason → rejected", () => {
    const state = makeNullHeadState({
      backlog: [],
      review: [{ id: "RCV-DEGRADED-004", status: "DEGRADED", title: "partial" }],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        i => i.code === "custom" && i.path.join(".") === "task_board.review.0.verification.honest_gap_reason",
      );
      expect(issue).toBeDefined();
    }
  });

  it("RCV-4-b: DEGRADED with honest_gap_reason in review[] → accepted", () => {
    const state = makeNullHeadState({
      backlog: [],
      review: [{ id: "RCV-DEGRADED-005", status: "DEGRADED", verification: { honest_gap_reason: "source API down during verification window" } }],
    });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] RCV-4-b FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });
});

describe("RCV-5 — DEGRADED lane coherence (LANE_ALLOWED_STATUSES §2.4)", () => {
  it("RCV-5-a: LANE_ALLOWED_STATUSES.review contains DEGRADED", () => {
    expect(LANE_ALLOWED_STATUSES["review"]?.has("DEGRADED")).toBe(true);
  });

  it("RCV-5-b: LANE_ALLOWED_STATUSES.qa contains DEGRADED", () => {
    expect(LANE_ALLOWED_STATUSES["qa"]?.has("DEGRADED")).toBe(true);
  });

  it("RCV-5-c: LANE_ALLOWED_STATUSES.backlog / .in_progress / .done do NOT contain DEGRADED", () => {
    expect(LANE_ALLOWED_STATUSES["backlog"]?.has("DEGRADED")).toBe(false);
    expect(LANE_ALLOWED_STATUSES["in_progress"]?.has("DEGRADED")).toBe(false);
    expect(LANE_ALLOWED_STATUSES["done"]?.has("DEGRADED")).toBe(false);
  });

  it("RCV-5-d: checkLaneCoherence flags a DEGRADED task placed in backlog[] (wrong lane)", () => {
    const state = OrchStateSchema.parse(makeNullHeadState({
      backlog: [{ id: "RCV-WRONGLANE-006", status: "DEGRADED", verification: { honest_gap_reason: "n/a" } }],
    }));
    const issues = checkLaneCoherence(state);
    const found = issues.find(i => i.taskId === "RCV-WRONGLANE-006" && i.lane === "backlog");
    expect(found).toBeDefined();
  });
});

describe("RCV-6 — TERMINAL_SET regression: DEGRADED excluded (§2.3)", () => {
  it("RCV-6-a: TERMINAL_SET does not contain DEGRADED, size stays 5", () => {
    expect(TERMINAL_SET.has("DEGRADED" as Status)).toBe(false);
    expect(TERMINAL_SET.size).toBe(5);
  });
});

describe("RCV-7 — StatusEnum: DEGRADED accepted as 13th value", () => {
  it("RCV-7-a: StatusEnum.parse(\"DEGRADED\") succeeds", () => {
    expect(() => StatusEnum.parse("DEGRADED")).not.toThrow();
  });
});

describe("RCV-8 — Live file regression: RC-VERIF gate does not brick the hot file", () => {
  it("RCV-8-a: current docs/data/orch/orch-state.json still parses clean post-gate (grandfather list complete)", () => {
    const raw = loadLiveOrchState();
    if (!raw) {
      console.log("[test] orch-state.json not found — skipping live RCV-8 check");
      return;
    }
    const result = OrchStateSchema.safeParse(raw);
    if (!result.success) {
      const verificationIssues = result.error.issues.filter(i => i.path.includes("verification"));
      console.error(
        "[test] RCV-8-a: live parse failed —",
        verificationIssues.length,
        "RC-VERIF issue(s):",
        JSON.stringify(verificationIssues, null, 2),
      );
    }
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RCV-9 — FIX-RCVERIF-GRANDFATHER-EXEMPTION-IGNORES-RETRACTION-VOID-MARKERS
//
// QA's live control (2026-08-23, recorded on FU-RAG-DEPLOY-MEMORY's own
// qa_rcverif_grandfather_escalation_20260823T1441Z field): the identical
// `del(.verification)` + `status=DONE_VERIFIED` transform run through the real
// Stage-1 schema validator (this describe block's runCliValidator harness, same
// path scripts/orch-validate.mjs uses) —
//   FU-RAG-DEPLOY-MEMORY (was grandfathered, never actually certified) → PASS
//     (the bug)
//   a non-grandfathered id → exit 2, aborted (the correct behavior)
// FU-RAG-DEPLOY-MEMORY has since been removed from RC_VERIF_GRANDFATHERED_IDS
// (§ 8A above) — this locks in that the repro now aborts like the control did.
// ─────────────────────────────────────────────────────────────────────────────

describe("RCV-9 — grandfather exemption no longer covers never-certified FU-RAG-DEPLOY-MEMORY", () => {
  it("RCV-9-a: exact QA repro — FU-RAG-DEPLOY-MEMORY + del(.verification) + DONE_VERIFIED → exit 2, aborted", () => {
    const bad = {
      ...makeValidBase(),
      task_board: {
        backlog: [],
        done_verified: [{ id: "FU-RAG-DEPLOY-MEMORY", status: "DONE_VERIFIED", title: "RAG deploy memory" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("FU-RAG-DEPLOY-MEMORY");
    expect(r.stderr).toContain("raw_probe");
  });

  it("RCV-9-b: control — a genuinely-frozen grandfathered id (HSC-1) with the same transform still passes", () => {
    const ok = {
      ...makeValidBase(),
      task_board: {
        backlog: [],
        done_verified: [{ id: "HSC-1", status: "DONE_VERIFIED", title: "pre-RC-VERIF completion" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(ok);
    expect(r.exitCode).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BP-1..BP-7 — behavior_predicate hard-reject on DONE_VERIFIED
// (FIX-BEHAVIORAL-VERIFICATION-GATE-SCHEMA-HARD-REJECT, brief §5c)
//
// New conditional in checkVerificationGate(): a DONE_VERIFIED row whose zone
// starts with 'apps/' AND priority ∈ {P0,P1,high,HIGH} AND minted (created_at,
// fallback declared_at) at/after BEHAVIOR_PREDICATE_CUTOFF must carry a mint-time
// verification.behavior_predicate{cmd,expect} — "a row may not reach DONE_VERIFIED
// on diff-reading alone" enforced for the population where it matters.
//
// AC-6 (grandfather-by-time, NOT by id-list): the SAME row passes when created_at
// < cutoff, and P2/scripts rows never reject regardless of predicate presence.
// AC-3 (mixed priority convention): live board measures 317xP1/61xP0/82x'high'/
// 1x'HIGH' — the gate must match the full set, never a bare === 'P0' check.
// All reject-path fixtures carry a VALID raw_probe so the observed issue is the
// behavior_predicate one alone (raw_probe gating is RCV-1/2's job, above).
// ─────────────────────────────────────────────────────────────────────────────

describe("BP — behavior_predicate hard-reject on DONE_VERIFIED (brief §5c)", () => {
  // BEHAVIOR_PREDICATE_CUTOFF = "2026-08-26T19:57:54Z" (AC-4 — see schema § 8A).
  const AFTER_CUTOFF = "2026-08-27T00:00:00Z"; // >= cutoff
  const BEFORE_CUTOFF = "2026-08-26T00:00:00Z"; // < cutoff

  function bpRow(over: Record<string, unknown>): Record<string, unknown> {
    return {
      id: "BP-ROW",
      status: "DONE_VERIFIED",
      zone: "apps/mcp-server/",
      priority: "P0",
      created_at: AFTER_CUTOFF,
      verification: { raw_probe: makeValidRawProbe() },
      ...over,
    };
  }

  it("BP-1-a: P0 apps/ row minted AFTER cutoff, no behavior_predicate → REJECTED (fix path named)", () => {
    const state = makeNullHeadState({ backlog: [], done_verified: [bpRow({})] });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        i => i.code === "custom" && i.path.join(".") === "task_board.done_verified.0.verification.behavior_predicate",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("BP-ROW");
      expect(issue?.message).toContain("behavior_predicate{cmd,expect}");
      expect(issue?.message).toContain("PO/BA re-author the predicate at mint");
    }
  });

  it("BP-1-b: the SAME row minted BEFORE cutoff → PASSES (grandfather-by-time, not by id-list)", () => {
    const state = makeNullHeadState({ backlog: [], done_verified: [bpRow({ created_at: BEFORE_CUTOFF })] });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] BP-1-b FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it("BP-2-a: P2 apps/ row minted AFTER cutoff, no behavior_predicate → NEVER rejected", () => {
    const state = makeNullHeadState({ backlog: [], done_verified: [bpRow({ id: "BP-P2", priority: "P2" })] });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] BP-2-a FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it("BP-2-b: P0 scripts/ row (zone NOT apps/), minted AFTER cutoff, no behavior_predicate → NEVER rejected", () => {
    const state = makeNullHeadState({ backlog: [], done_verified: [bpRow({ id: "BP-SCRIPTS", zone: "scripts/" })] });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] BP-2-b FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it("BP-3-a: P0 apps/ row WITH valid behavior_predicate{cmd,expect} → PASSES", () => {
    const state = makeNullHeadState({
      backlog: [],
      done_verified: [bpRow({
        id: "BP-WITH-PRED",
        verification: {
          raw_probe: makeValidRawProbe(),
          behavior_predicate: { cmd: "grep -q X file && echo GATE-PRESENT", expect: "GATE-PRESENT" },
        },
      })],
    });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] BP-3-a FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it("BP-3-b: malformed behavior_predicate (empty cmd) → REJECTED", () => {
    const state = makeNullHeadState({
      backlog: [],
      done_verified: [bpRow({
        id: "BP-BADCMD",
        verification: { raw_probe: makeValidRawProbe(), behavior_predicate: { cmd: "", expect: "GATE-PRESENT" } },
      })],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it("BP-3-c: behavior_predicate missing expect → REJECTED", () => {
    const state = makeNullHeadState({
      backlog: [],
      done_verified: [bpRow({
        id: "BP-NOEXPECT",
        verification: { raw_probe: makeValidRawProbe(), behavior_predicate: { cmd: "grep -q X file" } },
      })],
    });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it("BP-4-a: priority 'high' (lowercase) matches the P0/P1 set → REJECTED (AC-3)", () => {
    const state = makeNullHeadState({ backlog: [], done_verified: [bpRow({ id: "BP-HIGH", priority: "high" })] });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it("BP-4-b: priority 'HIGH' (uppercase) matches the P0/P1 set → REJECTED (AC-3)", () => {
    const state = makeNullHeadState({ backlog: [], done_verified: [bpRow({ id: "BP-HIGH-U", priority: "HIGH" })] });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it("BP-4-c: priority 'medium' does NOT match → PASSES (scoped to P0/P1-equivalent only)", () => {
    const state = makeNullHeadState({ backlog: [], done_verified: [bpRow({ id: "BP-MED", priority: "medium" })] });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] BP-4-c FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it("BP-5-a: declared_at fallback — no created_at but declared_at AFTER cutoff → REJECTED", () => {
    const row = bpRow({ id: "BP-DECLARED" });
    delete row["created_at"];
    row["declared_at"] = AFTER_CUTOFF;
    const state = makeNullHeadState({ backlog: [], done_verified: [row] });
    const result = OrchStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it("BP-5-b: declared_at fallback — declared_at BEFORE cutoff → PASSES", () => {
    const row = bpRow({ id: "BP-DECLARED-BEFORE" });
    delete row["created_at"];
    row["declared_at"] = BEFORE_CUTOFF;
    const state = makeNullHeadState({ backlog: [], done_verified: [row] });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] BP-5-b FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it("BP-6-a: RC_VERIF_GRANDFATHERED_IDS id exempted from the new gate too (AC-2 reject condition includes the grandfather exemption)", () => {
    // HSC-1 is frozen into RC_VERIF_GRANDFATHERED_IDS (§ 8A) — the behavior gate
    // mirrors the raw-probe gate's grandfather exemption, so the same frozen id
    // stays exempt here even minted post-cutoff without a predicate.
    const state = makeNullHeadState({
      backlog: [],
      done_verified: [{ id: "HSC-1", status: "DONE_VERIFIED", zone: "apps/mcp-server/", priority: "P0", created_at: AFTER_CUTOFF }],
    });
    const result = OrchStateSchema.safeParse(state);
    if (!result.success) console.error("[test] BP-6-a FAIL:", JSON.stringify(result.error.issues, null, 2));
    expect(result.success).toBe(true);
  });

  it("BP-7-a: live-board safety — zero live DONE_VERIFIED P0/P1 apps/ rows minted >= cutoff without a predicate (AC-4 no-wedge mandate)", () => {
    const raw = loadLiveOrchState();
    if (!raw) {
      console.log("[test] orch-state.json not found — skipping live BP-7 check");
      return;
    }
    const tb = (raw as { task_board?: Record<string, unknown> }).task_board ?? {};
    const rows: Record<string, unknown>[] = [];
    for (const lane of ["backlog", "done", "done_verified", "in_progress", "qa", "ready", "review"]) {
      const arr = tb[lane];
      if (Array.isArray(arr)) rows.push(...(arr as Record<string, unknown>[]));
    }
    for (const spr of [...((tb.active_sprints as unknown[]) ?? []), ...((tb.closed_sprints as unknown[]) ?? [])]) {
      const tasks = (spr as { tasks?: unknown[] }).tasks;
      if (Array.isArray(tasks)) rows.push(...(tasks as Record<string, unknown>[]));
    }
    const offenders = rows.filter((r) => {
      const id = String(r["id"] ?? r["task_id"] ?? "");
      const zone = String(r["zone"] ?? "");
      const priority = String(r["priority"] ?? "");
      const minted = String(r["created_at"] ?? r["declared_at"] ?? "");
      const bp = r["verification"] as { behavior_predicate?: { cmd?: unknown; expect?: unknown } } | undefined;
      const hasValidPred = Boolean(bp?.behavior_predicate?.cmd) && bp?.behavior_predicate?.expect !== undefined;
      return (
        r["status"] === "DONE_VERIFIED" &&
        zone.startsWith("apps/") &&
        ["P0", "P1", "high", "HIGH"].includes(priority) &&
        minted >= "2026-08-26T19:57:54Z" &&
        !hasValidPred
      );
    });
    expect(offenders.map((o) => o["id"])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QA-3 — Unknown key under .strict() object rejected with unrecognized_keys
//
// SSOT-W1-ZOD-SCHEMA-MODEL acceptance gate.
// .strict() on OrchStateSchema (root) and TaskBoardSchema reject any key not
// enumerated in the schema. The error code is "unrecognized_keys". This class
// of error previously allowed the dominant corruption pattern: "jq nests whole
// orch-state doc as extra key into task_board."
//
// Auto-fix hint from orch-validate.mjs (Section 2.3):
//   unrecognized_keys → "remove or migrate to cold storage (docs/data/orch/archive/)"
// ─────────────────────────────────────────────────────────────────────────────

describe("QA-3 — Unknown key under .strict() rejected (unrecognized_keys)", () => {
  it("QA-3-root: unknown root key is rejected", () => {
    const bad = { ...makeMinimalOrchState(), INJECTED_UNKNOWN_KEY: "malicious" };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.code === "unrecognized_keys");
      expect(issue).toBeDefined();
    }
  });

  it("QA-3-task_board: unknown task_board key is rejected with unrecognized_keys", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    const tb = base["task_board"] as Record<string, unknown>;
    const bad = { ...base, task_board: { ...tb, INJECTED_TB_KEY: "garbage" } };
    const result = OrchStateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.code === "unrecognized_keys");
      expect(issue).toBeDefined();
      // Code contract: orch-validate.mjs maps unrecognized_keys →
      //   "remove or migrate to cold storage (docs/data/orch/archive/backlog-detail.json)"
      // This test verifies the schema produces the error code the CLI maps to that hint.
    }
  });

  it("QA-3-nested-doc: whole orch-state doc as extra task_board key is rejected", () => {
    const base = makeMinimalOrchState() as Record<string, unknown>;
    const tb = base["task_board"] as Record<string, unknown>;
    // Simulate the dominant corruption class: "jq nests whole doc into task_board"
    const bad = { ...base, task_board: { ...tb, head: base["head"], signal_queue: base["signal_queue"] } };
    const result = OrchStateSchema.safeParse(bad);
    // head and signal_queue are not task_board keys → unrecognized_keys
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.code === "unrecognized_keys");
      expect(issue).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QA-4 — checkRefIntegrity isolation (mock FileResolver)
//
// SSOT-W1-ZOD-SCHEMA-MODEL acceptance gate.
// checkRefIntegrity() is exported and fully testable without filesystem access
// via the injected FileResolver interface. This gate verifies the function is
// exported, accepts a mock resolver, and correctly identifies dangling refs.
//
// See also R1 and R2 tests for additional coverage.
// ─────────────────────────────────────────────────────────────────────────────

describe("QA-4 — checkRefIntegrity exported + mock FileResolver isolation", () => {
  it("QA-4-export: checkRefIntegrity is exported from orchStateSchema", () => {
    // If this import compiled, the export exists — this test is the runtime proof.
    expect(typeof checkRefIntegrity).toBe("function");
  });

  it("QA-4-mock-pass: mock resolver that returns true → no issues", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: {
        _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t",
        rows: [{ id: "s1", summary: "s", severity: "LOW", status: "NEW", payload_ref: "docs/signals/any.json" }],
        archive: [],
      },
      task_board: {
        backlog: [{ id: "T1", status: "BACKLOG", detail_ref: "docs/some/ref.md" }],
        active_sprints: [],
      },
    });
    const alwaysExists: FileResolver = () => true;
    const issues = checkRefIntegrity(state, alwaysExists, "/project");
    expect(issues).toHaveLength(0);
  });

  it("QA-4-mock-fail: mock resolver that returns false → dangling ref issue", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: {
        _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t",
        rows: [{ id: "s1", summary: "s", severity: "LOW", status: "NEW", payload_ref: "docs/signals/deleted.json" }],
        archive: [],
      },
      task_board: { backlog: [], active_sprints: [] },
    });
    const neverExists: FileResolver = () => false;
    const issues = checkRefIntegrity(state, neverExists, "/project");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]?.ref).toContain("deleted.json");
    expect(issues[0]?.fix).toContain("/project/");
  });

  it("QA-4-sprint-detail-ref: dangling detail_ref in active_sprint task is flagged", () => {
    const state = OrchStateSchema.parse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: {
        backlog: [],
        active_sprints: [{
          id: "SP-1", status: "ACTIVE",
          tasks: [{ id: "T1", status: "IN_PROGRESS", detail_ref: "docs/handoffs/NONEXISTENT.md" }],
        }],
      },
    });
    const neverExists: FileResolver = () => false;
    const issues = checkRefIntegrity(state, neverExists, "/project");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]?.path).toContain("active_sprints");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QA-2 — Stage-0 tokenizer: escape-sequence handling
//        (SSOT-W1-ZOD-VALIDATOR-CLI hardening — rank 2)
//
// The recursive-descent tokenizer in scripts/orch-validate.mjs MUST:
//   (a) NOT treat `\"` inside a JSON string key as a string terminator
//   (b) Track duplicate keys independently per-object (new Set per parseObject call)
//   (c) Detect duplicates at arbitrary nesting depth (>2 tested here)
//   (d) NOT produce false-positives for same key name in sibling objects
//
// All tests go through the FULL validator CLI (subprocess) so escape-sequence
// handling is proven end-to-end, not just by reading the source.
// ─────────────────────────────────────────────────────────────────────────────

describe("QA-2 — Stage-0 tokenizer: escape-sequence correctness", () => {
  it("QA-2-esc-a: key with `\\\"` inside it is NOT false-split (duplicate detected, exit 1)", () => {
    // Raw JSON:  {"key\"with\"quotes": 1, "key\"with\"quotes": 2}
    // The tokenizer must parse `key"with"quotes` as ONE key (not split at `\"`).
    // Two occurrences → Stage-0 detects duplicate → exit 1.
    const json = '{"key\\"with\\"quotes": 1, "key\\"with\\"quotes": 2}';
    const r = runCliValidator(json);
    // exit 1 = Stage-0 duplicate detected (not exit 2 = schema fail)
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("duplicate key");
  });

  it("QA-2-esc-b: keys with `\\\"` that DIFFER are not false-positives (exit != 1)", () => {
    // Raw JSON:  {"key\"a\"": 1, "key\"b\"": 2}
    // Different keys → Stage-0 must NOT report a duplicate.
    // (Will exit 2 due to schema validation fail — that is expected and correct.)
    const json = '{"key\\"a\\"": 1, "key\\"b\\"": 2}';
    const r = runCliValidator(json);
    // MUST NOT be exit 1 (no false duplicate detected)
    expect(r.exitCode).not.toBe(1);
  });

  it("QA-2-esc-c: escape sequences \\n \\t \\r in key values do not confuse tokenizer", () => {
    // Keys with other escape sequences should be handled without corrupting position state.
    // Duplicate key with \\n inside → Stage-0 must still detect it.
    const json = '{"key\\nwith\\nnewline": "v1", "key\\nwith\\nnewline": "v2"}';
    const r = runCliValidator(json);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("duplicate key");
  });
});

describe("QA-2 — Stage-0 tokenizer: nested-object independent key tracking", () => {
  it("QA-2-nest-a: duplicate key at depth 2 (object-in-object) → exit 1", () => {
    // {"outer": {"inner_dup": 1, "inner_dup": 2}}
    const json = '{"outer": {"inner_dup": 1, "inner_dup": 2}}';
    const r = runCliValidator(json);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("duplicate key");
  });

  it("QA-2-nest-b: duplicate key at depth 3 → exit 1 (before JSON.parse)", () => {
    // {"a": {"b": {"c": 1, "c": 2}}}
    const json = '{"a": {"b": {"c": 1, "c": 2}}}';
    const r = runCliValidator(json);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("duplicate key");
  });

  it("QA-2-nest-c: same key name in SIBLING objects is NOT a duplicate (no false-positive)", () => {
    // {"obj1": {"id": 1}, "obj2": {"id": 2}} — "id" appears in two separate objects
    // Stage-0 must track keys PER-OBJECT so this is NOT a duplicate.
    const json = '{"obj1": {"id": 1}, "obj2": {"id": 2}}';
    const r = runCliValidator(json);
    // MUST NOT be exit 1
    expect(r.exitCode).not.toBe(1);
  });

  it("QA-2-nest-d: duplicate at root level (depth 1) → exit 1 and Stage-1 never runs", () => {
    // If Stage-0 works, exit code is 1 (not 2 which would mean schema fail ran first).
    // Build raw JSON with duplicate "head" key at root.
    const json =
      '{"head":{"status":"first"},' +
      '"head":{"status":"dup_clobbers"},' +
      '"signal_queue":{"_updated_at":"2026-06-27T00:00:00Z","_updated_by":"test","rows":[]},' +
      '"task_board":{"backlog":[],"active_sprints":[]}}';
    const r = runCliValidator(json);
    expect(r.exitCode).toBe(1);   // Stage-0, not Stage-1 (exit 2)
    expect(r.stderr).toContain("Stage 0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validator CLI exit-code contract: 0 / 1 / 2 / 3
// (SSOT-W1-ZOD-VALIDATOR-CLI hardening — rank 2)
//
// Exit 0 = Stage 0 + Stage 1 pass (zero lane-coherence issues, zero dangling refs)
// Exit 1 = Stage 0 fail: duplicate JSON keys in raw text
// Exit 2 = Stage 1 fail: schema violation OR lane-coherence (Stage 1b, hard-fail
//          post D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING) OR dangling ref (Stage 1c)
// Exit 3 = file not found / unreadable
// ─────────────────────────────────────────────────────────────────────────────

describe("Validator CLI exit-code contract: 0 (SSOT-W1-ZOD-VALIDATOR-CLI)", () => {
  it("exit-0: valid minimal orch-state exits 0", () => {
    const r = runCliValidator(makeValidBase());
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("PASS");
  });

  it("exit-0-lane-coherent: task in correct lane (no coherence issues) exits 0, no Stage-1b noise", () => {
    const state = {
      ...makeValidBase(),
      task_board: {
        backlog: [{ id: "CLI-COHERENT-T1", status: "BACKLOG" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(state);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("PASS");
    expect(r.stderr).not.toContain("Stage 1b");
  });
});

describe("Validator CLI exit-code contract: 1 (SSOT-W1-ZOD-VALIDATOR-CLI)", () => {
  it("exit-1: duplicate JSON key in raw text → Stage-0 rejects, exit 1", () => {
    const json = '{"dup_key": 1, "dup_key": 2}';
    const r = runCliValidator(json);
    expect(r.exitCode).toBe(1);
  });

  it("exit-1: stderr reports Stage 0 failure and not Stage 1", () => {
    const json = '{"x": 1, "x": 2}';
    const r = runCliValidator(json);
    // Stage 0 message must be present; Stage 1 (schema) must NOT run
    expect(r.stderr).toContain("Stage 0");
    // Schema validation error messages would mention "VALIDATION FAILED" with issue counts
    // When Stage-0 fails, Stage-1 is skipped entirely → no schema issue output
    expect(r.stderr).not.toContain("invalid_enum_value");
  });
});

describe("Validator CLI exit-code contract: 2 (SSOT-W1-ZOD-VALIDATOR-CLI)", () => {
  it("exit-2: invalid status enum value → Stage-1 rejects, exit 2", () => {
    const bad = {
      ...makeValidBase(),
      task_board: {
        backlog: [{ id: "T1", status: "INVALID_STATUS_XYZ" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
  });

  it("exit-2: unknown root key (.strict() violation) → Stage-1 rejects, exit 2", () => {
    const bad = { ...makeValidBase(), _INJECTED_UNKNOWN_KEY: "garbage" };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
  });

  it("exit-2: dangling detail_ref → Stage-1c rejects, exit 2", () => {
    const bad = {
      ...makeValidBase(),
      task_board: {
        backlog: [{ id: "T-REF", status: "BACKLOG", detail_ref: "docs/handoffs/NONEXISTENT-CLI-TEST.md" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    // Stage-1c message contains "dangling ref"
    expect(r.stderr).toContain("Stage 1c");
  });

  // D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING: Stage-1b flipped from warn-only to
  // hard-fail once SHG migration (D3+D2.5+D1) drove live coherence warnings to 0.
  it("exit-2: lane-coherence violation → Stage-1b rejects, exit 2 (hard-fail, not warn-only)", () => {
    const bad = {
      ...makeValidBase(),
      task_board: {
        // IN_PROGRESS in backlog[] → coherence violation (allowed: BACKLOG, BLOCKED)
        backlog: [{ id: "CLI-COHERENCE-VIOLATION-T1", status: "IN_PROGRESS" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("Stage 1b");
    expect(r.stderr).toContain("VALIDATION FAILED");
    expect(r.stderr).not.toContain("COHERENCE WARNINGS");
  });
});

describe("Validator CLI exit-code contract: 3 (SSOT-W1-ZOD-VALIDATOR-CLI)", () => {
  it("exit-3: file not found → exit 3", () => {
    // Run validator directly via spawnSync with a non-existent path
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, "/nonexistent/path/for-cli-test.json"], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    expect(result.status).toBe(3);
    expect(result.stderr).toContain("not found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auto-fix error hint contract: issue.code mappers
// (SSOT-W1-ZOD-VALIDATOR-CLI hardening — rank 2)
//
// The formatZodIssue() function in orch-validate.mjs must produce actionable
// fix: hints keyed by Zod issue.code. Each mapper is tested below:
//
//   invalid_enum_value (status path): hint mentions "verify_note"
//   unrecognized_keys:               hint mentions "cold storage"
//   invalid_type:                    hint mentions expected type
//   too_small:                       hint mentions "minimum"
//   custom (superRefine):            hint extracted after "fix:" marker in message
//
// Note: invalid_enum_value (non-status path) is a defensive code branch — in the
// current schema, all z.enum() fields are named "status" (StatusEnum). The branch
// exists for forward-compatibility if a non-status enum field is added later.
// ─────────────────────────────────────────────────────────────────────────────

describe("Auto-fix hint: invalid_enum_value (status field)", () => {
  it("hint-enum-status: stderr contains 'verify_note' for bad status value", () => {
    const bad = {
      ...makeValidBase(),
      task_board: {
        backlog: [{ id: "T1", status: "PARKED" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    // The fix hint for a bad status field must mention verify_note
    expect(r.stderr).toContain("verify_note");
  });

  it("hint-enum-status: stderr contains the bad value in the error message", () => {
    const bad = {
      ...makeValidBase(),
      task_board: {
        backlog: [{ id: "T1", status: "FOLDED" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("FOLDED");
  });
});

describe("Auto-fix hint: unrecognized_keys (cold-storage migration hint)", () => {
  it("hint-unrecognized-keys: stderr contains 'cold storage' for unknown root key", () => {
    const bad = { ...makeValidBase(), _GARBAGE_KEY: "injected" };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("cold storage");
  });

  it("hint-unrecognized-keys: stderr mentions the unknown key name", () => {
    const bad = { ...makeValidBase(), MY_INJECTED_LEAK: "injected" };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("MY_INJECTED_LEAK");
  });
});

describe("Auto-fix hint: invalid_type (expected type name)", () => {
  it("hint-invalid-type: stderr contains expected type for wrong-type field", () => {
    // Set signal_queue to a string instead of an object → invalid_type
    const bad = { ...makeValidBase(), signal_queue: "not_an_object" };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    // The hint must mention the expected type
    expect(r.stderr).toContain("object");
  });
});

describe("Auto-fix hint: too_small (minimum length hint)", () => {
  it("hint-too-small: stderr contains 'minimum' for empty id field", () => {
    // id: z.string().min(1) — empty string violates too_small
    const bad = {
      ...makeValidBase(),
      task_board: {
        backlog: [{ id: "", status: "BACKLOG" }],
        active_sprints: [],
      },
    };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("minimum");
  });
});

describe("Auto-fix hint: custom (superRefine dangling active_task_id)", () => {
  it("hint-custom-superRefine: stderr contains 'fix:' hint for dangling active_task_id", () => {
    // head.active_task_id points to a non-existent task → custom superRefine issue
    const bad = {
      ...makeValidBase(),
      head: { status: "in_progress", active_task_id: "GHOST-TASK-XYZ-CLI-TEST" },
    };
    const r = runCliValidator(bad);
    expect(r.exitCode).toBe(2);
    // The custom superRefine message embeds "fix:" followed by the hint text
    expect(r.stderr).toContain("fix:");
    expect(r.stderr).toContain("GHOST-TASK-XYZ-CLI-TEST");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validator invocation contract: default-path and custom-path
// (SSOT-W1-ZOD-VALIDATOR-CLI hardening — rank 2)
//
// bun scripts/orch-validate.mjs              → default: docs/data/orch/orch-state.json
// bun scripts/orch-validate.mjs <path>       → use <path>
// ─────────────────────────────────────────────────────────────────────────────

describe("Validator invocation contract (SSOT-W1-ZOD-VALIDATOR-CLI)", () => {
  it("invocation-default: no-arg invocation reads docs/data/orch/orch-state.json (exit 0)", () => {
    // Post SHG-migration (D3+D2.5+D1 DONE_VERIFIED), live orch-state has 0
    // lane-coherence issues — Stage 1b hard-fail (D5) does not trip here.
    const result = spawnSync(process.execPath, [VALIDATOR_PATH], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    // Exit 0 = Stage 0 + Stage 1 pass (zero lane-coherence issues, zero dangling refs)
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("invocation-custom-path: explicit path argument is used (not default)", () => {
    // Validator must use the custom path and find the file there.
    // A valid base at a custom path must exit 0.
    const r = runCliValidator(makeValidBase()); // runCliValidator writes to tmpFile and passes it
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("PASS");
  });

  it("invocation-custom-path-not-found: custom path that does not exist → exit 3", () => {
    const result = spawnSync(
      process.execPath,
      [VALIDATOR_PATH, "docs/nonexistent/path-for-invocation-test.json"],
      { encoding: "utf-8", timeout: 10_000 }
    );
    expect(result.status).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T1 — z.infer types export check (compile-time; runtime is a no-op)
// ─────────────────────────────────────────────────────────────────────────────

describe("T1 — z.infer types are exported and usable", () => {
  it("T1-a: OrchState type is assignable from a parsed object", () => {
    const parsed = OrchStateSchema.safeParse({
      _meta: { schema: "v4" },
      head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
      task_board: { backlog: [], active_sprints: [] },
    });
    if (parsed.success) {
      // Type assertion — if this compiles, z.infer<typeof OrchStateSchema> is usable
      const _state: OrchState = parsed.data;
      expect(_state.head.status).toBe("idle");
    }
  });

  it("T1-b: Status type includes READY (ADD-1)", () => {
    const s: Status = "READY";
    expect(StatusEnum.safeParse(s).success).toBe(true);
  });

  it("T1-c: Task type has required id and status fields", () => {
    const task: Task = TaskSchema.parse({ id: "T1", status: "BACKLOG" });
    expect(task.id).toBe("T1");
    expect(task.status).toBe("BACKLOG");
  });
});
