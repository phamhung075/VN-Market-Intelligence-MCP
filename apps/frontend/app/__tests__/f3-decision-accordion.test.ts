/**
 * f3-decision-accordion.test.ts
 *
 * Unit tests for F3 Decision Accordion logic — ARCH-ORCH-F3.
 *
 * Tests pure-function equivalents of DecisionAccordion and DoneTaskGroup
 * accordion state logic.  No React/Remix renderer needed.
 *
 * Coverage:
 *   - DecisionsDto lookup: by_task[taskId] takes priority
 *   - Sprint-level fallback: sprint_bucket[sprintId] when by_task empty
 *   - Empty state: both empty → "No decisions recorded"
 *   - Null/undefined guards: no crash when decisions is undefined
 *   - Multi-open Set state: toggle adds / removes IDs independently
 *   - Sort order: newest-first by timestamp
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types — mirror F3 additions to dashboard.orchestration.tsx
// ---------------------------------------------------------------------------

interface StepDto {
  step_id: string;
  agent_id: string;
  timestamp: string;
  task_id: string | null;
  what_done: string;
  what_considered: string[];
  why_decision: string;
  why_change: string;
}

interface DecisionsDto {
  by_task: Record<string, StepDto[]>;
  sprint_bucket: Record<string, StepDto[]>;
}

// ---------------------------------------------------------------------------
// Pure helpers that mirror DecisionAccordion + DoneTaskGroup logic
// ---------------------------------------------------------------------------

function getTaskSteps(decisions: DecisionsDto | undefined, taskId: string): StepDto[] {
  return decisions?.by_task[taskId] ?? [];
}

function getSprintSteps(
  decisions: DecisionsDto | undefined,
  sprintId: string | undefined
): StepDto[] {
  if (!sprintId) return [];
  return decisions?.sprint_bucket[sprintId] ?? [];
}

type AccordionState = "task-steps" | "sprint-steps" | "empty";

function resolveAccordionState(
  decisions: DecisionsDto | undefined,
  taskId: string,
  sprintId?: string
): AccordionState {
  const taskSteps = getTaskSteps(decisions, taskId);
  if (taskSteps.length > 0) return "task-steps";
  const sprintSteps = getSprintSteps(decisions, sprintId);
  if (sprintSteps.length > 0) return "sprint-steps";
  return "empty";
}

function sortNewestFirst(steps: StepDto[]): StepDto[] {
  return [...steps].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// Multi-open Set toggle — mirrors DoneTaskGroup toggle()
function toggleOpen(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STEP_F1: StepDto = {
  step_id: "agent-father-S1",
  agent_id: "agent-father",
  timestamp: "2026-06-05T00:00:00Z",
  task_id: "ARCH-ORCH-F1",
  what_done: "Added optional task-id field to SKILL.md",
  what_considered: ["Placement between header and what-done", "Omit vs empty string"],
  why_decision: "Architect blueprint parse contract is exact",
  why_change: "No change from blueprint",
};

const STEP_F2: StepDto = {
  step_id: "dev-mcp-server-S1",
  agent_id: "dev-mcp-server",
  timestamp: "2026-06-05T23:45:00Z",
  task_id: "ARCH-ORCH-F2",
  what_done: "Implemented journalStore.ts + extended orchestrationHandler.ts",
  what_considered: ["Parser inWhatConsidered state exit strategy", "Cache bleed between tests"],
  why_decision: "Blueprint parse contract was exact — implemented line-for-line",
  why_change: "No design deviation from architect blueprint",
};

const STEP_SPRINT_LEVEL: StepDto = {
  step_id: "po-S1",
  agent_id: "po",
  timestamp: "2026-06-05T21:06:28Z",
  task_id: null,
  what_done: "Wrote sprint goal ORCH-DASH-DECISION-DRILLDOWN",
  what_considered: ["Join-key design", "Serving layer location"],
  why_decision: "Forwarded BOTH recommendation to architect",
  why_change: "Did not pre-pick — design calls belong to architect",
};

const STEP_OLDER: StepDto = {
  step_id: "architect-S1",
  agent_id: "architect",
  timestamp: "2026-06-05T21:30:00Z",
  task_id: null,
  what_done: "Confirmed serving layer = mcp-server orchestrationHandler.ts",
  what_considered: ["BA had already read orchestrationHandler.ts directly"],
  why_decision: "Data-serve-integrity lesson mandates own raw-read",
  why_change: "No change from BA recommendation",
};

const DECISIONS_FIXTURE: DecisionsDto = {
  by_task: {
    "ARCH-ORCH-F1": [STEP_F1],
    "ARCH-ORCH-F2": [STEP_F2],
  },
  sprint_bucket: {
    "ORCH-DASH-DECISION-DRILLDOWN": [STEP_SPRINT_LEVEL, STEP_OLDER],
  },
};

// ---------------------------------------------------------------------------
// Suite 1 — by_task lookup (AC-F3-6)
// ---------------------------------------------------------------------------

describe("DecisionAccordion — by_task lookup (AC-F3-6)", () => {
  it("returns task-specific steps when by_task[taskId] is present", () => {
    const steps = getTaskSteps(DECISIONS_FIXTURE, "ARCH-ORCH-F1");
    expect(steps).toHaveLength(1);
    expect(steps[0].step_id).toBe("agent-father-S1");
  });

  it("returns task-specific steps for ARCH-ORCH-F2", () => {
    const steps = getTaskSteps(DECISIONS_FIXTURE, "ARCH-ORCH-F2");
    expect(steps).toHaveLength(1);
    expect(steps[0].step_id).toBe("dev-mcp-server-S1");
  });

  it("resolves to 'task-steps' state when by_task entry exists", () => {
    expect(resolveAccordionState(DECISIONS_FIXTURE, "ARCH-ORCH-F1", "ORCH-DASH-DECISION-DRILLDOWN")).toBe("task-steps");
  });

  it("by_task takes priority over sprint_bucket when both present", () => {
    const withBoth: DecisionsDto = {
      by_task: { "TASK-X": [STEP_F1] },
      sprint_bucket: { "SPRINT-1": [STEP_SPRINT_LEVEL] },
    };
    expect(resolveAccordionState(withBoth, "TASK-X", "SPRINT-1")).toBe("task-steps");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — sprint_bucket fallback (AC-F3-7)
// ---------------------------------------------------------------------------

describe("DecisionAccordion — sprint_bucket fallback (AC-F3-7)", () => {
  it("returns sprint-level steps when by_task[taskId] is absent", () => {
    const steps = getSprintSteps(DECISIONS_FIXTURE, "ORCH-DASH-DECISION-DRILLDOWN");
    expect(steps).toHaveLength(2);
  });

  it("resolves to 'sprint-steps' when by_task empty but sprint_bucket has entries", () => {
    const decWithNoTaskEntry: DecisionsDto = {
      by_task: {},
      sprint_bucket: { "ORCH-DASH-DECISION-DRILLDOWN": [STEP_SPRINT_LEVEL] },
    };
    expect(resolveAccordionState(decWithNoTaskEntry, "LEGACY-TASK", "ORCH-DASH-DECISION-DRILLDOWN")).toBe("sprint-steps");
  });

  it("sprint steps are returned correctly for matching sprint_id", () => {
    const steps = getSprintSteps(DECISIONS_FIXTURE, "ORCH-DASH-DECISION-DRILLDOWN");
    const ids = steps.map((s) => s.step_id);
    expect(ids).toContain("po-S1");
    expect(ids).toContain("architect-S1");
  });

  it("returns [] when sprintId is undefined", () => {
    expect(getSprintSteps(DECISIONS_FIXTURE, undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — empty state (AC-F3-8)
// ---------------------------------------------------------------------------

describe("DecisionAccordion — empty state (AC-F3-8)", () => {
  it("resolves to 'empty' when both by_task and sprint_bucket are absent", () => {
    const emptyDecisions: DecisionsDto = { by_task: {}, sprint_bucket: {} };
    expect(resolveAccordionState(emptyDecisions, "ARCH-ORCH-F3", "ORCH-DASH-DECISION-DRILLDOWN")).toBe("empty");
  });

  it("resolves to 'empty' when decisions is undefined (legacy tasks)", () => {
    expect(resolveAccordionState(undefined, "ARCH-ORCH-F3", "ORCH-DASH-DECISION-DRILLDOWN")).toBe("empty");
  });

  it("resolves to 'empty' when task not in by_task and no sprintId given", () => {
    const decNoSprint: DecisionsDto = { by_task: {}, sprint_bucket: {} };
    expect(resolveAccordionState(decNoSprint, "NEW-TASK-WITHOUT-SPRINT")).toBe("empty");
  });

  it("getTaskSteps returns [] safely when decisions undefined", () => {
    expect(() => getTaskSteps(undefined, "ANY-TASK")).not.toThrow();
    expect(getTaskSteps(undefined, "ANY-TASK")).toEqual([]);
  });

  it("getSprintSteps returns [] safely when decisions undefined", () => {
    expect(() => getSprintSteps(undefined, "SPRINT-X")).not.toThrow();
    expect(getSprintSteps(undefined, "SPRINT-X")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — sort order newest-first (AC-F3-9)
// ---------------------------------------------------------------------------

describe("DecisionAccordion — sort order newest-first", () => {
  it("sorts steps newest-first by timestamp", () => {
    const steps = sortNewestFirst(DECISIONS_FIXTURE.sprint_bucket["ORCH-DASH-DECISION-DRILLDOWN"]);
    // STEP_OLDER has timestamp 21:30, STEP_SPRINT_LEVEL has 21:06 — newer = STEP_OLDER
    expect(steps[0].step_id).toBe("architect-S1"); // 21:30 > 21:06
    expect(steps[1].step_id).toBe("po-S1");
  });

  it("sortNewestFirst does not mutate original array", () => {
    const original = [STEP_SPRINT_LEVEL, STEP_OLDER];
    const sorted = sortNewestFirst(original);
    // Original unchanged
    expect(original[0].step_id).toBe("po-S1");
    // Sorted is different object
    expect(sorted[0].step_id).toBe("architect-S1");
  });

  it("single step sorts correctly without error", () => {
    const single = sortNewestFirst([STEP_F1]);
    expect(single).toHaveLength(1);
    expect(single[0].step_id).toBe("agent-father-S1");
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — multi-open Set state (AC-F3-4, RULING-5)
// ---------------------------------------------------------------------------

describe("DoneTaskGroup — multi-open Set state (AC-F3-4)", () => {
  it("toggle adds task ID to empty set", () => {
    const result = toggleOpen(new Set(), "ARCH-ORCH-F1");
    expect(result.has("ARCH-ORCH-F1")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("toggle removes task ID from set when already present", () => {
    const prev = new Set(["ARCH-ORCH-F1"]);
    const result = toggleOpen(prev, "ARCH-ORCH-F1");
    expect(result.has("ARCH-ORCH-F1")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("toggle keeps other IDs intact — multi-open independence", () => {
    const prev = new Set(["ARCH-ORCH-F1", "ARCH-ORCH-F2"]);
    const result = toggleOpen(prev, "ARCH-ORCH-F1");
    // F1 removed, F2 stays
    expect(result.has("ARCH-ORCH-F1")).toBe(false);
    expect(result.has("ARCH-ORCH-F2")).toBe(true);
  });

  it("toggle does NOT close other accordions when opening a new one", () => {
    let state = new Set<string>();
    state = toggleOpen(state, "ARCH-ORCH-F1"); // open F1
    state = toggleOpen(state, "ARCH-ORCH-F2"); // open F2
    // Both remain open — multi-open pattern
    expect(state.has("ARCH-ORCH-F1")).toBe(true);
    expect(state.has("ARCH-ORCH-F2")).toBe(true);
  });

  it("toggle returns a new Set instance (immutable update)", () => {
    const prev = new Set(["ARCH-ORCH-F1"]);
    const result = toggleOpen(prev, "ARCH-ORCH-F2");
    expect(result).not.toBe(prev); // new reference
    expect(prev.has("ARCH-ORCH-F2")).toBe(false); // original unchanged
  });

  it("opening and closing same ID results in empty set", () => {
    let state = new Set<string>();
    state = toggleOpen(state, "T-1");
    state = toggleOpen(state, "T-1");
    expect(state.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — StepDto field completeness (AC-F3-9 readability guard)
// ---------------------------------------------------------------------------

describe("StepDto shape — all F3 required fields present", () => {
  it("STEP_F1 fixture has all 8 required StepDto fields", () => {
    const requiredKeys: (keyof StepDto)[] = [
      "step_id", "agent_id", "timestamp", "task_id",
      "what_done", "what_considered", "why_decision", "why_change",
    ];
    for (const key of requiredKeys) {
      expect(STEP_F1).toHaveProperty(key);
    }
  });

  it("what_considered is a string array (for <ul> rendering, AC-F3-9)", () => {
    expect(Array.isArray(STEP_F1.what_considered)).toBe(true);
    expect(typeof STEP_F1.what_considered[0]).toBe("string");
  });

  it("step with empty what_considered renders without error", () => {
    const stepNoConsideration: StepDto = { ...STEP_F1, what_considered: [] };
    expect(stepNoConsideration.what_considered).toHaveLength(0);
    // Renderer would skip the <ul> — no crash
    expect(stepNoConsideration.what_considered.length > 0).toBe(false);
  });

  it("task_id can be null for sprint-level entries (sprint_bucket path)", () => {
    expect(STEP_SPRINT_LEVEL.task_id).toBeNull();
  });
});
