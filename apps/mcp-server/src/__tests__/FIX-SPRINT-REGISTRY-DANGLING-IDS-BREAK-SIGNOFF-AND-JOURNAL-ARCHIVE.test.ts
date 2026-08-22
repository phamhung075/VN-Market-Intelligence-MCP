// apps/mcp-server/src/__tests__/FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE.test.ts
//
// Task: FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
//
// Board row `po_review_note` (2026-08-22, PO re-ratification) issued 3 BINDING
// corrections on top of the architect brief's §11 amendment
// (docs/architecture-briefs/2026-08-08-fix-sprint-registry-dangling-ids-reconciliation-design.md):
//   B1 — STEP 0 (task-id-collision RELABEL) must be GUARDED: never relabel an id
//        that carries its own `sprint_goal.entries[]` entry (authoritative evidence
//        it WAS minted as a sprint id); a self-referential row (row.id===row.sprint)
//        must STRIP, never relabel (a 1-hop RELABEL cycle).
//   B2 — branch order must check goal+row TERMINALITY *before* the non-backlog-lane
//        LIVE check (old order let a DONE_VERIFIED row register as active_sprints[],
//        making decision-journal-archive.sh permanently unable to ever archive it).
//   Q4 — sprint_goal liveness is a CLOSED liveness-asserting-token set (exactly
//        "active") + the CLOSED TERMINAL_SET; every other token (PLANNING, OPEN,
//        any future vocabulary) is non-asserting and falls through to the
//        task-lane signal, then to PRE_SPRINT_LABEL exempt — under-classify,
//        never fabricate a live sprint.
//   "BACKLOG" sentinel (lane-name-as-sentinel anti-pattern, PO ruling Q3 extension)
//        must never resolve LIVE via incidental non-backlog-lane refs — it is
//        NEVER_WAS/STRIP regardless of what the ordinary branch table would compute.
//
// This function is CLASSIFICATION ONLY — pure, read-only, makes no orch-state.json
// write. Fixtures ONLY — never touches the live file (scar:
// feedback_negative_path_test_corrupts_live_ssot).

import { describe, it, expect } from "bun:test";
import {
  OrchStateSchema,
  classifySprintRegistryDanglingIds,
  checkSprintRegistryReferentialIntegrity,
  type ColdArchiveDoneTaskRef,
} from "../infrastructure/orchStateSchema.js";

function baseState(overrides: {
  task_board?: Record<string, unknown>;
  sprint_goal?: Record<string, unknown>;
}) {
  return OrchStateSchema.parse({
    _meta: { schema: "v4" },
    head: { status: "idle", active_task_id: null, updated_by: "t", updated_at: "2026-01-01T00:00:00Z" },
    signal_queue: { _updated_at: "2026-01-01T00:00:00Z", _updated_by: "t", rows: [], archive: [] },
    task_board: {
      backlog: [],
      active_sprints: [],
      ...overrides.task_board,
    },
    ...(overrides.sprint_goal ? { sprint_goal: overrides.sprint_goal } : {}),
  });
}

const noCold = { coldClosedSprintIds: new Set<string>(), coldDoneTasks: [] as ColdArchiveDoneTaskRef[] };

describe("classifySprintRegistryDanglingIds — §15 reconciliation classification (B1/B2/Q4 corrected)", () => {
  it("B2 (terminality-before-lane): sprint_goal DONE + a DONE-only row set is FINISHED, not misrouted LIVE", () => {
    const state = baseState({
      task_board: {
        done: [{ id: "T-1", status: "DONE", sprint: "OLD-SPRINT" }],
      },
      sprint_goal: { entries: [{ sprint_id: "OLD-SPRINT", status: "DONE" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "OLD-SPRINT");
    expect(row?.classification).toBe("FINISHED");
    expect(row?.action).toBe("FINISHED_REGISTER_CLOSED");
  });

  it("B2: a DONE row referencing a sprint whose goal is still non-terminal does NOT resolve FINISHED (must stay LIVE-eligible, never silently registered closed)", () => {
    const state = baseState({
      task_board: {
        done: [{ id: "T-1", status: "DONE", sprint: "MIXED-SPRINT" }],
        ready: [{ id: "T-2", status: "READY", sprint: "MIXED-SPRINT" }],
      },
      sprint_goal: { entries: [{ sprint_id: "MIXED-SPRINT", status: "active" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "MIXED-SPRINT");
    expect(row?.classification).toBe("LIVE");
  });

  it("Q4: goal status 'PLANNING' with only backlog refs falls through to PRE_SPRINT_LABEL (non-asserting token)", () => {
    const state = baseState({
      task_board: { backlog: [{ id: "T-3", status: "BACKLOG", sprint: "PLANNED-SPRINT" }] },
      sprint_goal: { entries: [{ sprint_id: "PLANNED-SPRINT", status: "PLANNING" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "PLANNED-SPRINT");
    expect(row?.classification).toBe("PRE_SPRINT_LABEL");
    expect(row?.action).toBe("PRE_SPRINT_LABEL_EXEMPT");
  });

  it("Q4: goal status 'OPEN' (novel, never-seen vocabulary) with zero referencing rows falls through to PRE_SPRINT_LABEL — never fabricated LIVE (live case: PREDICTION-CLAIMS-DAILY-CADENCE)", () => {
    const state = baseState({
      sprint_goal: { entries: [{ sprint_id: "OPEN-TOKEN-SPRINT", status: "OPEN" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "OPEN-TOKEN-SPRINT");
    expect(row?.classification).toBe("PRE_SPRINT_LABEL");
  });

  it("Q4: goal status 'active' (exact literal) is the ONLY liveness-asserting token — LIVE even with zero referencing rows (live case: SYSTEMIC-REMAKE-P1)", () => {
    const state = baseState({
      sprint_goal: { entries: [{ sprint_id: "GOAL-ONLY-LIVE", status: "active" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "GOAL-ONLY-LIVE");
    expect(row?.classification).toBe("LIVE");
    expect(row?.action).toBe("LIVE_REGISTER_ACTIVE");
  });

  it('"BACKLOG" sentinel is NEVER_WAS/STRIP even when it happens to accumulate a non-backlog-lane ref (would otherwise misroute LIVE)', () => {
    const state = baseState({
      task_board: {
        ready: [{ id: "SOME-ROW", status: "READY", sprint: "BACKLOG" }],
      },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "BACKLOG");
    expect(row?.classification).toBe("NEVER_WAS");
    expect(row?.action).toBe("STRIP");
  });

  it("B1(a) guard: STEP 0 task-id collision is BLOCKED when the id carries its own sprint_goal entry — falls to branch table instead of RELABEL (live case: FIX-BCTC-BANK-SUMMARY-MAPPING)", () => {
    const state = baseState({
      task_board: {
        backlog: [{ id: "REAL-TASK-ID", status: "BACKLOG", sprint: "OWN-SPRINT" }],
        review: [{ id: "OTHER-ROW", status: "REVIEW", sprint: "REAL-TASK-ID" }],
      },
      sprint_goal: { entries: [{ sprint_id: "REAL-TASK-ID", status: "active" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "REAL-TASK-ID");
    expect(row?.classification).toBe("LIVE");
    expect(row?.action).toBe("LIVE_REGISTER_ACTIVE");
  });

  it("B1(b): self-referential row (row.id === row.sprint) STRIPs, never relabels (live case: FIX-BCTC-CTG-BALANCE-SHEET-REFINE — a 1-hop RELABEL cycle)", () => {
    const state = baseState({
      task_board: {
        backlog: [{ id: "SELF-REF-ID", status: "BACKLOG", sprint: "SELF-REF-ID" }],
      },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "SELF-REF-ID");
    expect(row?.classification).toBe("NEVER_WAS");
    expect(row?.action).toBe("STRIP");
    expect(row?.relabelTarget).toBeUndefined();
  });

  it("STEP 0 unguarded: id is itself a real task id with no sprint_goal entry — RELABEL to that task's own .sprint (live case: UC-RDL-P4)", () => {
    const state = baseState({
      task_board: {
        backlog: [{ id: "TASK-ID-SPRINT", status: "BLOCKED", sprint: "REAL-SPRINT-TARGET" }],
        ready: [{ id: "OTHER-ROW", status: "READY", sprint: "TASK-ID-SPRINT" }],
      },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "TASK-ID-SPRINT");
    expect(row?.classification).toBe("RELABEL");
    expect(row?.relabelTarget).toBe("REAL-SPRINT-TARGET");
  });

  it("STEP 0 resolves via COLD archive done_tasks (live case: BA-IND-P1-MOMENTUM-FRONTEND — task id only in cold archive)", () => {
    const state = baseState({
      task_board: {
        closed_sprints: [
          {
            id: "SOME-CLOSED-SPRINT",
            tasks: [{ id: "NESTED-ROW", status: "DONE", sprint: "COLD-TASK-ID" }],
          },
        ],
      },
    });
    const cold: ColdArchiveDoneTaskRef[] = [{ id: "COLD-TASK-ID", sprint: "COLD-RESOLVED-SPRINT" }];
    const result = classifySprintRegistryDanglingIds(state, {
      coldClosedSprintIds: new Set<string>(),
      coldDoneTasks: cold,
    });
    const row = result.rows.find((r) => r.id === "COLD-TASK-ID");
    expect(row?.classification).toBe("RELABEL");
    expect(row?.relabelTarget).toBe("COLD-RESOLVED-SPRINT");
  });

  it("§11.2 A1 — a cold done_tasks[].sprint tag alone must NOT resolve an id as known (dropped from the strict union)", () => {
    const state = baseState({
      task_board: {
        backlog: [{ id: "T-4", status: "BACKLOG", sprint: "WEAK-SIGNAL-ONLY" }],
      },
    });
    // WEAK-SIGNAL-ONLY appears only as a done_tasks[].sprint provenance tag in the
    // cold archive — never as a closed_sprints[].id / closed_sprint_goals record.
    // coldClosedSprintIds (the strict union) deliberately does NOT include it.
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "WEAK-SIGNAL-ONLY");
    expect(row).toBeDefined(); // still counted dangling — not silently resolved
  });

  it("a known id (present in hot active_sprints[].id) is NOT reported as dangling", () => {
    const state = baseState({
      task_board: {
        active_sprints: [{ id: "KNOWN-SPRINT", tasks: [] }],
        backlog: [{ id: "T-5", status: "BACKLOG", sprint: "KNOWN-SPRINT" }],
      },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    expect(result.rows.find((r) => r.id === "KNOWN-SPRINT")).toBeUndefined();
  });

  it("PRE_SPRINT_LABEL: no goal entry, referencing rows exist only in backlog[]", () => {
    const state = baseState({
      task_board: { backlog: [{ id: "T-6", status: "BACKLOG", sprint: "NOT-YET-KICKED-OFF" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "NOT-YET-KICKED-OFF");
    expect(row?.classification).toBe("PRE_SPRINT_LABEL");
  });

  it("LIVE via non-backlog lane alone (no goal entry) — goal status insufficient, task-lane confirms (live case: TEST-HYGIENE)", () => {
    const state = baseState({
      task_board: { ready: [{ id: "T-7", status: "READY", sprint: "LANE-ONLY-LIVE" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    const row = result.rows.find((r) => r.id === "LANE-ONLY-LIVE");
    expect(row?.classification).toBe("LIVE");
  });

  it("dual-plane coverage (AC-3): sprint_goal.entries[] alone (zero task-lane refs) still surfaces a dangling row", () => {
    const state = baseState({
      sprint_goal: { entries: [{ sprint_id: "GOAL-PLANE-ONLY", status: "PLANNING" }] },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    expect(result.rows.find((r) => r.id === "GOAL-PLANE-ONLY")).toBeDefined();
  });

  it("strictDanglingCount matches rows.length (sanity)", () => {
    const state = baseState({
      task_board: {
        backlog: [
          { id: "T-8", status: "BACKLOG", sprint: "D-1" },
          { id: "T-9", status: "BACKLOG", sprint: "D-2" },
        ],
      },
    });
    const result = classifySprintRegistryDanglingIds(state, noCold);
    expect(result.strictDanglingCount).toBe(result.rows.length);
    expect(result.strictDanglingCount).toBe(2);
  });
});

describe("checkSprintRegistryReferentialIntegrity — Stage 1h validator (delegates to § 15 classification, §11.8 step 5)", () => {
  it("known via hot active_sprints[].id — no violation", () => {
    const state = baseState({
      task_board: {
        active_sprints: [{ id: "KNOWN-ACTIVE", tasks: [] }],
        backlog: [{ id: "T-1", status: "BACKLOG", sprint: "KNOWN-ACTIVE" }],
      },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    expect(result.violations.find((v) => v.id === "KNOWN-ACTIVE")).toBeUndefined();
  });

  it("known via hot closed_sprints[].id — no violation", () => {
    const state = baseState({
      task_board: {
        closed_sprints: [{ id: "KNOWN-CLOSED" }],
        done: [{ id: "T-2", status: "DONE", sprint: "KNOWN-CLOSED" }],
      },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    expect(result.violations.find((v) => v.id === "KNOWN-CLOSED")).toBeUndefined();
  });

  it("known via caller-injected coldClosedSprintIds (cold closed_sprints/closed_sprint_goals) — no violation", () => {
    const state = baseState({
      task_board: { ready: [{ id: "T-3", status: "READY", sprint: "COLD-CLOSED" }] },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, {
      coldClosedSprintIds: new Set(["COLD-CLOSED"]),
      coldDoneTasks: [],
    });
    expect(result.violations.find((v) => v.id === "COLD-CLOSED")).toBeUndefined();
  });

  it("A1: a done_tasks[].sprint-only provenance tag (not in coldClosedSprintIds) does NOT resolve the id — still a violation (LIVE via non-backlog lane)", () => {
    const state = baseState({
      task_board: { ready: [{ id: "T-4", status: "READY", sprint: "WEAK-SIGNAL-ONLY" }] },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    const v = result.violations.find((x) => x.id === "WEAK-SIGNAL-ONLY");
    expect(v).toBeDefined();
    expect(v?.classification).toBe("LIVE");
    expect(v?.planes).toEqual(["task_board"]);
  });

  it("exemption parity: backlog[]-only ref with NO sprint_goal entry is NOT counted (PRE_SPRINT_LABEL)", () => {
    const state = baseState({
      task_board: { backlog: [{ id: "T-5", status: "BACKLOG", sprint: "PRE-SPRINT-ONLY" }] },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    expect(result.violations.find((v) => v.id === "PRE-SPRINT-ONLY")).toBeUndefined();
  });

  it("exemption parity (A2/A3-corrected branch table): backlog[]-only ref PLUS a non-asserting 'PLANNING' goal entry is STILL NOT counted — the pre-amendment '§3 literal: no goal entry at all' predicate would have wrongly flagged this forever (live case: CHORE-COMMIT-OVERHEAD)", () => {
    const state = baseState({
      task_board: { backlog: [{ id: "T-6", status: "BACKLOG", sprint: "PLANNING-BACKLOG-ONLY" }] },
      sprint_goal: { entries: [{ sprint_id: "PLANNING-BACKLOG-ONLY", status: "PLANNING" }] },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    expect(result.violations.find((v) => v.id === "PLANNING-BACKLOG-ONLY")).toBeUndefined();
  });

  it("a non-backlog-lane reference to an unknown id IS counted, even alone (LIVE)", () => {
    const state = baseState({
      task_board: { ready: [{ id: "T-7", status: "READY", sprint: "LANE-ONLY-UNKNOWN" }] },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    const v = result.violations.find((x) => x.id === "LANE-ONLY-UNKNOWN");
    expect(v).toBeDefined();
    expect(v?.classification).toBe("LIVE");
    expect(v?.planes).toEqual(["task_board"]);
  });

  it("sprint_goal status exactly 'active' alone (zero task refs) IS counted (AC-3 dual-plane, goal-plane-only; Q4 liveness token)", () => {
    const state = baseState({
      sprint_goal: { entries: [{ sprint_id: "GOAL-ONLY-LIVE", status: "active" }] },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    const v = result.violations.find((x) => x.id === "GOAL-ONLY-LIVE");
    expect(v).toBeDefined();
    expect(v?.classification).toBe("LIVE");
    expect(v?.planes).toEqual(["sprint_goal"]);
    expect(v?.goalStatus).toBe("active");
  });

  it("dual-plane: 'active' goal entry PLUS a backlog task ref for the same id IS counted on BOTH planes", () => {
    const state = baseState({
      task_board: { backlog: [{ id: "T-8", status: "BACKLOG", sprint: "BOTH-PLANES-LIVE" }] },
      sprint_goal: { entries: [{ sprint_id: "BOTH-PLANES-LIVE", status: "active" }] },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    const v = result.violations.find((x) => x.id === "BOTH-PLANES-LIVE");
    expect(v).toBeDefined();
    expect([...(v?.planes ?? [])].sort()).toEqual(["sprint_goal", "task_board"]);
  });

  it("RELABEL classification (STEP 0 task-id collision) IS counted — a genuine registry defect, not exempt (live case: UC-RDL-P4)", () => {
    const state = baseState({
      task_board: {
        backlog: [{ id: "TASK-ID-SPRINT", status: "BLOCKED", sprint: "REAL-SPRINT-TARGET" }],
        ready: [{ id: "OTHER-ROW", status: "READY", sprint: "TASK-ID-SPRINT" }],
      },
    });
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    const v = result.violations.find((x) => x.id === "TASK-ID-SPRINT");
    expect(v).toBeDefined();
    expect(v?.classification).toBe("RELABEL");
  });

  it("no referenced ids at all — empty violations array", () => {
    const state = baseState({});
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    expect(result.violations).toEqual([]);
  });

  it("parity guarantee: violations.length always equals classification.rows.filter(non-PRE_SPRINT_LABEL).length for a mixed fixture", () => {
    const state = baseState({
      task_board: {
        backlog: [
          { id: "T-9", status: "BACKLOG", sprint: "PLAN-ONLY" },
          { id: "T-10", status: "BACKLOG", sprint: "GOAL-LIVE-ID" },
        ],
        ready: [{ id: "T-11", status: "READY", sprint: "LANE-LIVE-ID" }],
      },
      sprint_goal: { entries: [{ sprint_id: "GOAL-LIVE-ID", status: "active" }] },
    });
    const classification = classifySprintRegistryDanglingIds(state, noCold);
    const expectedCount = classification.rows.filter((r) => r.classification !== "PRE_SPRINT_LABEL").length;
    const result = checkSprintRegistryReferentialIntegrity(state, noCold);
    expect(result.violations.length).toBe(expectedCount);
    expect(expectedCount).toBe(2); // GOAL-LIVE-ID + LANE-LIVE-ID counted; PLAN-ONLY exempt
  });
});
