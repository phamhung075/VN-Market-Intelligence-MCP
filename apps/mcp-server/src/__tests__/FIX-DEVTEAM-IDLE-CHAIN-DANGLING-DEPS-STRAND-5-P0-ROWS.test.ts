// apps/mcp-server/src/__tests__/FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-P0-ROWS.test.ts
//
// Task: FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-P0-ROWS AC-3
//
// ROOT CAUSE this closes: scripts/lib/devteam-eligibility.jq's
// effective_depends_on() UNIONS `.depends_on` + `.depends` + `.blocked_by` —
// editing only one of those fields can only GROW the effective dependency
// set, never shrink it. Commit 2833b71bf (2026-07-29) deleted duplicate rows
// S1-SCHEMA-SELECTION / P1B-STAMP and wrote the corrected refs into
// `.depends_on` on 3 rows, but left the deleted ids resident in the legacy
// `.depends` field — the union kept resurrecting them and deps_satisfied()
// (fail-CLOSED on an unresolvable "MISSING" id) starved 5 P0 rows for 3 days.
//
// checkDependsDivergence() (§13) closes this at write time: a row carrying
// BOTH `.depends` and `.depends_on` where `.depends` names an id absent from
// `.depends_on` is rejected. Hard-rejected by scripts/orch-validate.mjs
// Stage 1f.
//
// checkMissingDependencyReport() (§14) is the companion NON-FATAL report:
// rows whose effective dep set resolves to MISSING in both the hot board's
// 7 flat lanes and the cold archive — AC-4's guardrail against the sibling
// FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING class, which
// explicitly wants MISSING treated as unsatisfied-but-NOT-fatal. Wired as
// scripts/orch-validate.mjs Stage 1g (report only, never exit(2)).
//
// Fixtures ONLY — this test never touches docs/data/orch/orch-state.json.
// (scar: feedback_negative_path_test_corrupts_live_ssot)

import { describe, it, expect } from "bun:test";
import {
  OrchStateSchema,
  checkDependsDivergence,
  checkMissingDependencyReport,
  collectHotDepStatusLaneIds,
} from "../infrastructure/orchStateSchema.js";

function baseState(
  overrides: {
    backlog?: unknown[];
    review?: unknown[];
    closedSprintTasks?: unknown[];
    activeSprintTasks?: unknown[];
  } = {},
) {
  return OrchStateSchema.parse({
    _meta: { schema: "v4" },
    head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
    signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
    task_board: {
      backlog: overrides.backlog ?? [],
      review: overrides.review ?? [],
      active_sprints: overrides.activeSprintTasks
        ? [{ id: "SPRINT-ACTIVE", tasks: overrides.activeSprintTasks }]
        : [],
      closed_sprints: overrides.closedSprintTasks
        ? [{ id: "SPRINT-CLOSED", tasks: overrides.closedSprintTasks }]
        : [],
    },
  });
}

describe("checkDependsDivergence — .depends/.depends_on write-time guard (§13, Stage 1f)", () => {
  it("INCIDENT SHAPE: .depends names a deleted id absent from .depends_on — CAUGHT (the exact FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS shape)", () => {
    const state = baseState({
      backlog: [
        {
          id: "P1A-MAIN-ROTATION",
          status: "BACKLOG",
          depends: ["S1-SCHEMA-SELECTION", "P1B-STAMP"],
          depends_on: ["TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES"],
        },
      ],
    });
    const issues = checkDependsDivergence(state);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.taskId).toBe("P1A-MAIN-ROTATION");
    expect(issues[0]?.extraIds).toEqual(["S1-SCHEMA-SELECTION", "P1B-STAMP"]);
    expect(issues[0]?.message).toContain("effective_depends_on");
    expect(issues[0]?.fix).toContain("depends_on");
  });

  it("PASSES: .depends is a subset of .depends_on (fully reconciled, AC-1 post-fix shape)", () => {
    const state = baseState({
      backlog: [
        { id: "RECONCILED-A", status: "BACKLOG", depends: ["X"], depends_on: ["X", "Y"] },
      ],
    });
    expect(checkDependsDivergence(state)).toEqual([]);
  });

  it("PASSES: only .depends_on present, no legacy .depends field at all", () => {
    const state = baseState({
      backlog: [{ id: "MODERN-ROW", status: "BACKLOG", depends_on: ["SOME-DEP"] }],
    });
    expect(checkDependsDivergence(state)).toEqual([]);
  });

  it("PASSES: only .depends present, no .depends_on written yet (nothing to reconcile against)", () => {
    const state = baseState({
      backlog: [{ id: "LEGACY-ONLY-ROW", status: "BACKLOG", depends: ["SOME-DEP"] }],
    });
    expect(checkDependsDivergence(state)).toEqual([]);
  });

  it("PASSES: absent .depends and .depends_on is a no-op", () => {
    const state = baseState({ backlog: [{ id: "T-NONE", status: "BACKLOG" }] });
    expect(checkDependsDivergence(state)).toEqual([]);
  });

  it("CAUGHT inside a sprint-nested task (active_sprints[].tasks[]) — guard is lane-agnostic", () => {
    const state = baseState({
      activeSprintTasks: [
        { id: "SPRINT-ROW", status: "IN_PROGRESS", depends: ["STALE-ID"], depends_on: ["REAL-ID"] },
      ],
    });
    const issues = checkDependsDivergence(state);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toContain("active_sprints[0].tasks");
  });

  it("bare-string .depends (real-data drift shape) is normalized to a 1-element array before comparison", () => {
    const state = baseState({
      backlog: [{ id: "BARE-STRING-ROW", status: "BACKLOG", depends: "STALE-ID", depends_on: ["OTHER"] }],
    });
    const issues = checkDependsDivergence(state);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.extraIds).toEqual(["STALE-ID"]);
  });
});

describe("checkMissingDependencyReport — cold-archive/hot-board MISSING dep report (§14, Stage 1g, NON-FATAL)", () => {
  it("NEGATIVE CONTROL (AC-4): a dep-id resolving nowhere is reported, NEVER treated as satisfied", () => {
    const state = baseState({
      backlog: [{ id: "UNRESOLVED-ROW", status: "BACKLOG", depends_on: ["NOWHERE-ID"] }],
    });
    const resolvedIds = new Set<string>(); // empty — nothing resolves, hot or cold
    const issues = checkMissingDependencyReport(state, resolvedIds);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.taskId).toBe("UNRESOLVED-ROW");
    expect(issues[0]?.missingIds).toEqual(["NOWHERE-ID"]);
  });

  it("PASSES clean: a dep-id present in the injected resolvedIds set (hot or cold) is NOT reported", () => {
    const state = baseState({
      backlog: [{ id: "RESOLVED-ROW", status: "BACKLOG", depends_on: ["KNOWN-ID"] }],
    });
    const resolvedIds = new Set<string>(["KNOWN-ID"]);
    expect(checkMissingDependencyReport(state, resolvedIds)).toEqual([]);
  });

  it("SCOPE: closed_sprints[].tasks[] IS included in the report", () => {
    const state = baseState({
      closedSprintTasks: [{ id: "CLOSED-ROW", status: "DONE", depends_on: ["NOWHERE-ID"] }],
    });
    const issues = checkMissingDependencyReport(state, new Set());
    expect(issues.find((i) => i.taskId === "CLOSED-ROW")).toBeDefined();
  });

  it("SCOPE: active_sprints[].tasks[] is deliberately EXCLUDED (in-flight WIP intra-sprint noise, not this task's root-cause class)", () => {
    const state = baseState({
      activeSprintTasks: [{ id: "ACTIVE-ROW", status: "IN_PROGRESS", depends_on: ["SIBLING-NOT-YET-DONE"] }],
    });
    const issues = checkMissingDependencyReport(state, new Set());
    expect(issues.find((i) => i.taskId === "ACTIVE-ROW")).toBeUndefined();
  });

  it("PASSES: a row with no effective deps at all is never reported", () => {
    const state = baseState({ backlog: [{ id: "NO-DEPS-ROW", status: "BACKLOG" }] });
    expect(checkMissingDependencyReport(state, new Set())).toEqual([]);
  });
});

describe("collectHotDepStatusLaneIds — mirrors dep_status_map()'s own 7-lane scan (scripts/lib/devteam-eligibility.jq)", () => {
  it("collects ids from all 7 flat lanes dep_status_map() reads (backlog/ready/in_progress/qa/review/done/done_verified)", () => {
    const state = OrchStateSchema.parse({
      head: { status: "idle", active_task_id: null },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [] },
      task_board: {
        backlog: [{ id: "B1", status: "BACKLOG" }],
        ready: [{ id: "R1", status: "READY" }],
        in_progress: [{ id: "IP1", status: "IN_PROGRESS" }],
        qa: [{ id: "Q1", status: "QA" }],
        review: [{ id: "RV1", status: "REVIEW" }],
        done: [{ id: "D1", status: "DONE" }],
        // RC-VERIF (SYSREMAKE-P2-T2): DONE_VERIFIED requires verification.raw_probe (or
        // grandfathering) — "DV1" is a synthetic test id, not a live grandfathered row.
        done_verified: [{ id: "DV1", status: "DONE_VERIFIED", verification: { raw_probe: {
          tool: "test", args: "n/a", live_value_observed: "n/a", observed_at: "2026-01-01T00:00:00Z",
        } } }],
        active_sprints: [],
      },
    });
    const ids = collectHotDepStatusLaneIds(state.task_board);
    expect([...ids].sort()).toEqual(["B1", "D1", "DV1", "IP1", "Q1", "R1", "RV1"]);
  });

  it("does NOT collect ids from active_sprints/closed_sprints (dep_status_map() never scans those either)", () => {
    const state = OrchStateSchema.parse({
      head: { status: "idle", active_task_id: null },
      signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [] },
      task_board: {
        backlog: [],
        active_sprints: [{ id: "SP1", tasks: [{ id: "SPRINT-TASK-1", status: "IN_PROGRESS" }] }],
        closed_sprints: [{ id: "SP2", tasks: [{ id: "SPRINT-TASK-2", status: "DONE" }] }],
      },
    });
    const ids = collectHotDepStatusLaneIds(state.task_board);
    expect(ids.has("SPRINT-TASK-1")).toBe(false);
    expect(ids.has("SPRINT-TASK-2")).toBe(false);
  });
});
