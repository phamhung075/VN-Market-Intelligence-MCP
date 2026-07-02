// apps/mcp-server/src/__tests__/TASK-FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT.test.ts
//
// Task: FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT — AC-2 (durable write-time guard)
//
// ROOT CAUSE (recurring 8x): sprint sign-off paths write non-canonical
// terminal-status synonyms/case-variants into .sprint_goal.entries[].status
// (CLOSED, COMPLETE, done, done_verified, ...) instead of the canonical
// TERMINAL_SET tokens. scripts/orch-cold-evict.sh's TERMINAL_SPRINT_STATUSES
// predicate never matches the drifted spelling, so the sprint is stranded
// forever and .sprint_goal.entries grows unbounded (26 seen, cap 15).
//
// checkSprintGoalStatusCanonical() closes this write-time: any entry whose
// status uppercases to a known terminal alias but is not byte-identical to
// the canonical TERMINAL_SET token is flagged — hard-rejected by
// scripts/orch-validate.mjs Stage 1d (see orch-validate.mjs changes).
//
// Fixtures ONLY — this test never touches docs/data/orch/orch-state.json.
// (scar: feedback_negative_path_test_corrupts_live_ssot)

import { describe, it, expect } from "bun:test";
import { checkSprintGoalStatusCanonical } from "../infrastructure/orchStateSchema.js";

describe("checkSprintGoalStatusCanonical — sprint_goal terminal-status drift guard", () => {
  it("flags all 8 known drift shapes from the recurring incident (CLOSED/COMPLETE/done/done_verified)", () => {
    const doc = {
      sprint_goal: {
        entries: [
          { sprint_id: "BCTC-PROSE-EXTRACT", status: "CLOSED" },
          { sprint_id: "GO-FLEET-DEPLOY", status: "COMPLETE" },
          { sprint_id: "QUE-TOOLTIP-DRY", status: "done" },
          { sprint_id: "SSOT-INTEGRITY-PERIMETER", status: "done" },
          { sprint_id: "FRONTEND-ANALYSIS-HUB-CONSOLIDATION", status: "done" },
          { sprint_id: "DEFERRED-TASK-SCHEDULER-MVP", status: "done" },
          { sprint_id: "FB-COWORK-FOLD", status: "done_verified" },
          { sprint_id: "PREDICTION-EVIDENCE-REVIVAL", status: "done_verified" },
        ],
      },
    };

    const issues = checkSprintGoalStatusCanonical(doc);
    expect(issues.length).toBe(8);
    const bySprint = Object.fromEntries(issues.map((i) => [i.sprintId, i.canonical]));
    expect(bySprint["BCTC-PROSE-EXTRACT"]).toBe("DONE");
    expect(bySprint["GO-FLEET-DEPLOY"]).toBe("DONE");
    expect(bySprint["QUE-TOOLTIP-DRY"]).toBe("DONE");
    expect(bySprint["FB-COWORK-FOLD"]).toBe("DONE_VERIFIED");
    expect(bySprint["PREDICTION-EVIDENCE-REVIVAL"]).toBe("DONE_VERIFIED");
  });

  it("passes already-canonical terminal tokens (DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED)", () => {
    const doc = {
      sprint_goal: {
        entries: [
          { sprint_id: "A", status: "DONE" },
          { sprint_id: "B", status: "DONE_VERIFIED" },
          { sprint_id: "C", status: "CANCELLED" },
          { sprint_id: "D", status: "DEFERRED" },
          { sprint_id: "E", status: "SKIPPED" },
        ],
      },
    };
    expect(checkSprintGoalStatusCanonical(doc)).toEqual([]);
  });

  it("ignores non-terminal statuses (OPEN, active, PLANNING, ACTIVE) — out of scope per task", () => {
    const doc = {
      sprint_goal: {
        entries: [
          { sprint_id: "F", status: "OPEN" },
          { sprint_id: "G", status: "active" },
          { sprint_id: "H", status: "PLANNING" },
          { sprint_id: "I", status: "ACTIVE" },
        ],
      },
    };
    expect(checkSprintGoalStatusCanonical(doc)).toEqual([]);
  });

  it("is a no-op on a doc with no sprint_goal / no entries / malformed entries", () => {
    expect(checkSprintGoalStatusCanonical({})).toEqual([]);
    expect(checkSprintGoalStatusCanonical({ sprint_goal: {} })).toEqual([]);
    expect(checkSprintGoalStatusCanonical({ sprint_goal: { entries: "not-an-array" } })).toEqual([]);
    expect(
      checkSprintGoalStatusCanonical({ sprint_goal: { entries: [null, { sprint_id: "J" }] } }),
    ).toEqual([]);
  });

  it("recognizes CANCELED (single-l) and COMPLETED as additional synonym drift", () => {
    const doc = {
      sprint_goal: {
        entries: [
          { sprint_id: "K", status: "CANCELED" },
          { sprint_id: "L", status: "COMPLETED" },
        ],
      },
    };
    const issues = checkSprintGoalStatusCanonical(doc);
    expect(issues.length).toBe(2);
    expect(issues.find((i) => i.sprintId === "K")?.canonical).toBe("CANCELLED");
    expect(issues.find((i) => i.sprintId === "L")?.canonical).toBe("DONE");
  });
});
