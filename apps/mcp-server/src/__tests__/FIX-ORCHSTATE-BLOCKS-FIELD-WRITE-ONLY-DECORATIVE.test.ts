// apps/mcp-server/src/__tests__/FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE.test.ts
//
// Task: FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE
//
// ROOT CAUSE: orch-state.json's `blocks` and `co_edit` task fields read as
// sequencing/atomic-ship constraints but are write-only — grep-confirmed zero
// consumers anywhere in the repo. scripts/lib/devteam-eligibility.jq's
// effective_depends_on() only ever reads a candidate row's own
// depends_on/depends/blocked_by — never a reverse `blocks` edge from another
// row, and `co_edit` has no forward-field equivalent at all. PO's own guard
// on FU-BACKFILL-REAL-FILENAMES (written the same day) was silently
// non-binding — proof this was a live trap, not theoretical.
//
// checkDecorativeSequencingFields() closes this write-time: a `blocks` value
// must be either empty, or every named target must carry the source id back
// in its own depends_on/depends/blocked_by (the fields the real gate reads);
// `co_edit` has no forward equivalent so any non-empty value is rejected
// outright. Hard-rejected by scripts/orch-validate.mjs Stage 1e.
//
// AC-3 NEGATIVE CONTROL (the criterion that separates a real fix from
// cleanup — see the "author a NEW reverse-only blocks guard, demonstrate it
// is caught" scenarios below): a freshly-authored reverse-only `blocks` edge
// with no matching forward field, and a freshly-authored `co_edit`, must both
// be caught by this guard — never silently accepted.
//
// Fixtures ONLY — this test never touches docs/data/orch/orch-state.json.
// (scar: feedback_negative_path_test_corrupts_live_ssot)

import { describe, it, expect } from "bun:test";
import {
  OrchStateSchema,
  checkDecorativeSequencingFields,
} from "../infrastructure/orchStateSchema.js";

function baseState(overrides: { backlog?: unknown[]; review?: unknown[] } = {}) {
  return OrchStateSchema.parse({
    _meta: { schema: "v4" },
    head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
    signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
    task_board: {
      backlog: overrides.backlog ?? [],
      review: overrides.review ?? [],
      active_sprints: [],
    },
  });
}

describe("checkDecorativeSequencingFields — blocks/co_edit write-time guard", () => {
  it("AC-3 NEGATIVE CONTROL: a NEW reverse-only `blocks` edge (target has no matching depends_on/blocked_by) is CAUGHT", () => {
    const state = baseState({
      backlog: [
        { id: "PO-NEW-GUARD-A", status: "BACKLOG", blocks: ["PO-NEW-GUARD-B"] },
        { id: "PO-NEW-GUARD-B", status: "BACKLOG" }, // no depends_on/depends/blocked_by naming A
      ],
    });
    const issues = checkDecorativeSequencingFields(state);
    const found = issues.find((i) => i.taskId === "PO-NEW-GUARD-A" && i.field === "blocks");
    expect(found).toBeDefined();
    expect(found?.message).toContain("REVERSE-ONLY");
    expect(found?.fix).toContain("depends_on");
  });

  it("AC-3 NEGATIVE CONTROL: a NEW `co_edit` value is CAUGHT unconditionally (no forward-field equivalent exists)", () => {
    const state = baseState({
      review: [
        { id: "PO-NEW-COEDIT-A", status: "REVIEW", co_edit: ["PO-NEW-COEDIT-B"] },
        { id: "PO-NEW-COEDIT-B", status: "REVIEW", co_edit: ["PO-NEW-COEDIT-A"] },
      ],
    });
    const issues = checkDecorativeSequencingFields(state);
    expect(issues.filter((i) => i.field === "co_edit")).toHaveLength(2);
    const found = issues.find((i) => i.taskId === "PO-NEW-COEDIT-A");
    expect(found?.message).toContain("read by nothing");
    expect(found?.fix).toContain("depends_on");
  });

  it("BINDS: a `blocks` edge backed by a matching depends_on on the target passes clean", () => {
    const state = baseState({
      backlog: [
        { id: "BOUND-A", status: "BACKLOG", blocks: ["BOUND-B"] },
        { id: "BOUND-B", status: "BACKLOG", depends_on: ["BOUND-A"] },
      ],
    });
    expect(checkDecorativeSequencingFields(state)).toEqual([]);
  });

  it("BINDS: a `blocks` edge backed by a matching blocked_by (array) on the target passes clean", () => {
    const state = baseState({
      backlog: [
        { id: "BOUND-C", status: "BACKLOG", blocks: ["BOUND-D"] },
        { id: "BOUND-D", status: "BACKLOG", blocked_by: ["BOUND-C", "SOME-OTHER-ID"] },
      ],
    });
    expect(checkDecorativeSequencingFields(state)).toEqual([]);
  });

  it("PASSES: empty `blocks: []` is harmless documentation, no edge asserted", () => {
    const state = baseState({ backlog: [{ id: "T-EMPTY", status: "BACKLOG", blocks: [] }] });
    expect(checkDecorativeSequencingFields(state)).toEqual([]);
  });

  it("PASSES: empty `co_edit: []` is harmless", () => {
    const state = baseState({ backlog: [{ id: "T-EMPTY-CE", status: "BACKLOG", co_edit: [] }] });
    expect(checkDecorativeSequencingFields(state)).toEqual([]);
  });

  it("PASSES: absent blocks/co_edit is a no-op", () => {
    const state = baseState({ backlog: [{ id: "T-NONE", status: "BACKLOG" }] });
    expect(checkDecorativeSequencingFields(state)).toEqual([]);
  });

  it("MALFORMED: a prose-string `blocks` value is rejected, never crashed on or silently swallowed (FIX-MCP-SUITE-HEALTH-BASELINE shape)", () => {
    const state = baseState({
      backlog: [
        { id: "PROSE-ROW", status: "BACKLOG", blocks: "PUSH-AUTONOMY-1. This is prose, not a task id." },
      ],
    });
    const issues = checkDecorativeSequencingFields(state);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.taskId).toBe("PROSE-ROW");
    expect(issues[0]?.field).toBe("blocks");
    expect(issues[0]?.message).toContain("not an array of non-empty task-id strings");
  });

  it("DANGLING: a `blocks` entry naming a nonexistent id is rejected (never crashes)", () => {
    const state = baseState({
      backlog: [{ id: "DANGLING-ROW", status: "BACKLOG", blocks: ["DOES-NOT-EXIST"] }],
    });
    const issues = checkDecorativeSequencingFields(state);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("does not resolve to any task_board row");
  });

  it("MULTI-TARGET: one bound + one unbound target in the same blocks array reports only the unbound one", () => {
    const state = baseState({
      backlog: [
        { id: "MULTI-SRC", status: "BACKLOG", blocks: ["MULTI-BOUND", "MULTI-UNBOUND"] },
        { id: "MULTI-BOUND", status: "BACKLOG", depends_on: ["MULTI-SRC"] },
        { id: "MULTI-UNBOUND", status: "BACKLOG" },
      ],
    });
    const issues = checkDecorativeSequencingFields(state);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("MULTI-UNBOUND");
  });

  it("live-shape regression: FU-BACKFILL-REAL-FILENAMES pattern (blocker's blocks backed by target's depends_on) passes", () => {
    const state = baseState({
      review: [
        { id: "BLOCKER-ROW", status: "REVIEW", blocks: ["TARGET-ROW"] },
      ],
      backlog: [
        { id: "TARGET-ROW", status: "BACKLOG", depends_on: ["BLOCKER-ROW"] },
      ],
    });
    expect(checkDecorativeSequencingFields(state)).toEqual([]);
  });
});
