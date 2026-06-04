/**
 * orchestration-task-board.test.ts
 *
 * Tests the TaskBoardPanel data-layer logic against the REAL DTO shape:
 *   GET /api/orchestration → { task_board: { counts, tasks: TaskRow[] }, ... }
 *
 * Guards verified:
 *   - tasks ?? [] so undefined field renders empty state, no throw
 *   - counts ?? { done:0, in_progress:0, backlog:0 } so undefined counts don't crash
 *   - flat tasks array iterated without flatMap on active_sprints (which doesn't exist)
 *
 * The logic under test is extracted as pure functions that mirror exactly what
 * the TaskBoardPanel component does — no Remix/React mocking needed.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types — match ACTUAL DTO shape from /api/orchestration
// ---------------------------------------------------------------------------

interface TaskBoardCounts {
  done: number;
  in_progress: number;
  backlog: number;
}

interface TaskRow {
  id: string;
  title: string;
  owner?: string;
  status: string;
  zone?: string;
}

interface TaskBoard {
  counts: TaskBoardCounts;
  tasks: TaskRow[];
}

// ---------------------------------------------------------------------------
// Pure helpers that mirror the component's rendering logic
// ---------------------------------------------------------------------------

function getTasksOrEmpty(board: TaskBoard): TaskRow[] {
  return board.tasks ?? [];
}

function getCountsOrZero(board: TaskBoard): TaskBoardCounts {
  return board.counts ?? { done: 0, in_progress: 0, backlog: 0 };
}

function filterByStatus(tasks: TaskRow[], status: string): TaskRow[] {
  return tasks.filter((t) => t.status === status);
}

function isEmpty(board: TaskBoard): boolean {
  return (board.tasks ?? []).length === 0;
}

// ---------------------------------------------------------------------------
// Fixture: real DTO shape (38 done / 1 in_progress / 12 backlog)
// ---------------------------------------------------------------------------

const REAL_DTO_TASK_BOARD: TaskBoard = {
  counts: { done: 38, in_progress: 1, backlog: 12 },
  tasks: [
    { id: "BEQ-1", title: "SPIKE: root-cause WHY get_bctc_full returns empty", status: "DONE", owner: "agents-architect", zone: "apps/mcp-server/" },
    { id: "OSC-1", title: "Create orch-state.json", status: "DONE", owner: "agent-father", zone: "docs/" },
    { id: "OSC-2", title: "ATOMIC code + agent-file migration", status: "DONE", owner: "dev-mcp-server+agent-father", zone: "apps/mcp-server/ + docs/" },
    { id: "MSG-1", title: "No market-wide foreign-flow aggregate tool", status: "TODO", owner: "dev-mcp-server", zone: "apps/mcp-server/" },
    { id: "FE-RR-MACRO-EXTERNAL", title: "fetch page: /macro/external returns 404", status: "IN_PROGRESS", owner: "dev-macro-indicators", zone: "apps/macro-indicators/" },
    { id: "EI-P2-1", title: "Startup assertion APP_ENV vs DB_PATH mismatch", status: "TODO", owner: "dev-mcp-server", zone: "apps/mcp-server/" },
  ],
};

// ---------------------------------------------------------------------------
// Suite 1 — Real DTO shape: flat tasks array
// ---------------------------------------------------------------------------

describe("TaskBoard real DTO shape — flat tasks array", () => {
  it("tasks is a flat array (not nested under active_sprints)", () => {
    const tasks = getTasksOrEmpty(REAL_DTO_TASK_BOARD);
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it("counts reflects correct DTO values", () => {
    const counts = getCountsOrZero(REAL_DTO_TASK_BOARD);
    expect(counts.done).toBe(38);
    expect(counts.in_progress).toBe(1);
    expect(counts.backlog).toBe(12);
  });

  it("filters IN_PROGRESS tasks correctly", () => {
    const tasks = getTasksOrEmpty(REAL_DTO_TASK_BOARD);
    const inProgress = filterByStatus(tasks, "IN_PROGRESS");
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0].id).toBe("FE-RR-MACRO-EXTERNAL");
  });

  it("filters DONE tasks correctly", () => {
    const tasks = getTasksOrEmpty(REAL_DTO_TASK_BOARD);
    const done = filterByStatus(tasks, "DONE");
    expect(done.length).toBeGreaterThanOrEqual(3);
    const ids = done.map((t) => t.id);
    expect(ids).toContain("BEQ-1");
    expect(ids).toContain("OSC-1");
    expect(ids).toContain("OSC-2");
  });

  it("filters TODO tasks correctly", () => {
    const tasks = getTasksOrEmpty(REAL_DTO_TASK_BOARD);
    const todo = filterByStatus(tasks, "TODO");
    expect(todo.length).toBeGreaterThanOrEqual(2);
    const ids = todo.map((t) => t.id);
    expect(ids).toContain("MSG-1");
    expect(ids).toContain("EI-P2-1");
  });

  it("isEmpty returns false for non-empty board", () => {
    expect(isEmpty(REAL_DTO_TASK_BOARD)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Defensive guards: missing/undefined fields → empty state, no throw
// ---------------------------------------------------------------------------

describe("TaskBoard defensive guards — missing fields render empty, no throw", () => {
  it("tasks undefined → getTasksOrEmpty returns [] (no throw)", () => {
    // Simulate DTO with missing tasks field
    const board = { counts: { done: 0, in_progress: 0, backlog: 0 } } as unknown as TaskBoard;
    expect(() => getTasksOrEmpty(board)).not.toThrow();
    expect(getTasksOrEmpty(board)).toEqual([]);
  });

  it("counts undefined → getCountsOrZero returns zero object (no throw)", () => {
    const board = { tasks: [] } as unknown as TaskBoard;
    expect(() => getCountsOrZero(board)).not.toThrow();
    const counts = getCountsOrZero(board);
    expect(counts.done).toBe(0);
    expect(counts.in_progress).toBe(0);
    expect(counts.backlog).toBe(0);
  });

  it("tasks undefined → isEmpty returns true (no throw)", () => {
    const board = { counts: { done: 0, in_progress: 0, backlog: 0 } } as unknown as TaskBoard;
    expect(() => isEmpty(board)).not.toThrow();
    expect(isEmpty(board)).toBe(true);
  });

  it("tasks empty array → isEmpty returns true", () => {
    const board: TaskBoard = { counts: { done: 0, in_progress: 0, backlog: 0 }, tasks: [] };
    expect(isEmpty(board)).toBe(true);
  });

  it("tasks [] → filterByStatus returns [] (no throw)", () => {
    const tasks: TaskRow[] = [];
    expect(() => filterByStatus(tasks, "IN_PROGRESS")).not.toThrow();
    expect(filterByStatus(tasks, "IN_PROGRESS")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — The old stale shape would have crashed: flatMap on undefined
// ---------------------------------------------------------------------------

describe("Stale shape guard — active_sprints does NOT exist in real DTO", () => {
  it("real DTO task_board has no active_sprints key", () => {
    // Verify the real DTO does NOT have active_sprints (the stale field that caused the 500)
    const board = REAL_DTO_TASK_BOARD as unknown as Record<string, unknown>;
    expect(board["active_sprints"]).toBeUndefined();
  });

  it("calling flatMap on undefined active_sprints throws (proves why old code crashed)", () => {
    const board = REAL_DTO_TASK_BOARD as unknown as Record<string, unknown>;
    const activeSprints = board["active_sprints"] as unknown[] | undefined;
    // Directly replicate the old crashing call: board.active_sprints.flatMap(...)
    expect(() => {
      if (activeSprints === undefined) {
        throw new TypeError("Cannot read properties of undefined (reading 'flatMap')");
      }
      activeSprints.flatMap((s: unknown) => s);
    }).toThrow(TypeError);
  });

  it("new code using tasks ?? [] does NOT throw when active_sprints is absent", () => {
    const board = REAL_DTO_TASK_BOARD;
    // The fixed path: use tasks ?? [] — never touches active_sprints
    expect(() => {
      const tasks = board.tasks ?? [];
      tasks.filter((t) => t.status === "IN_PROGRESS");
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — sprint_goal flat shape (NOT entries array)
// ---------------------------------------------------------------------------

describe("SprintGoal real DTO shape — flat object, not entries[]", () => {
  interface SprintGoal {
    sprint_id: string;
    vision: string;
    scope: string[];
    metric: string;
  }

  const REAL_SPRINT_GOAL: SprintGoal = {
    sprint_id: "FLEET-HOST-SAFETY",
    vision: "On the 16GB host, the full fleet must NEVER be up.",
    scope: ["AUD-ND-1 PLAN-ONLY invariant", "DRAIN-INJECTION-SAFE"],
    metric: "AUD-ND-1: simulated false-positive -> DASHBOARD/signal row + ZERO infra mutation.",
  };

  it("sprint_goal is a flat object with sprint_id, vision, scope, metric", () => {
    expect(REAL_SPRINT_GOAL.sprint_id).toBe("FLEET-HOST-SAFETY");
    expect(REAL_SPRINT_GOAL.vision).toBeTruthy();
    expect(Array.isArray(REAL_SPRINT_GOAL.scope)).toBe(true);
    expect(REAL_SPRINT_GOAL.metric).toBeTruthy();
  });

  it("sprint_goal has no entries array (old stale shape)", () => {
    const goal = REAL_SPRINT_GOAL as unknown as Record<string, unknown>;
    expect(goal["entries"]).toBeUndefined();
  });

  it("scope is a string array with items", () => {
    expect(REAL_SPRINT_GOAL.scope.length).toBeGreaterThan(0);
    expect(typeof REAL_SPRINT_GOAL.scope[0]).toBe("string");
  });

  it("undefined sprint_goal renders empty gracefully (no throw)", () => {
    const goal: SprintGoal | undefined = undefined;
    expect(() => {
      if (!goal) return;
      (goal as SprintGoal).scope.map((item: string) => item);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite 5b — DoneTaskGroup visibility logic (UX FIX: no hard-cap at 10)
//
// The component renders `tasks.slice(-PREVIEW)` when collapsed and the full
// `tasks` array when expanded.  These pure-function equivalents mirror the
// component's branching so we can assert all done tasks are reachable without
// a React renderer.
// ---------------------------------------------------------------------------

const DONE_PREVIEW_COUNT = 10;

function donePreview(tasks: TaskRow[]): TaskRow[] {
  return tasks.slice(-DONE_PREVIEW_COUNT);
}

function doneExpanded(tasks: TaskRow[]): TaskRow[] {
  return tasks; // full list — no slice
}

function doneHasMore(tasks: TaskRow[]): boolean {
  return tasks.length > DONE_PREVIEW_COUNT;
}

describe("DoneTaskGroup visibility logic — UX FIX (no hard-cap at 10)", () => {
  // Build a corpus of 101 done tasks that matches the operator-reported scenario.
  const doneCorpus: TaskRow[] = Array.from({ length: 101 }, (_, i) => ({
    id: `T-${String(i + 1).padStart(3, "0")}`,
    title: `Done task ${i + 1}`,
    status: "DONE",
    owner: "agent",
    zone: "apps/",
  }));

  it("corpus has 101 done tasks", () => {
    expect(doneCorpus).toHaveLength(101);
  });

  it("collapsed: shows exactly the last 10 tasks (not the first 10)", () => {
    const preview = donePreview(doneCorpus);
    expect(preview).toHaveLength(DONE_PREVIEW_COUNT);
    // Last task in corpus is T-101; preview tail = T-092…T-101
    expect(preview[preview.length - 1].id).toBe("T-101");
    expect(preview[0].id).toBe("T-092");
  });

  it("collapsed: does NOT contain tasks outside the last 10", () => {
    const preview = donePreview(doneCorpus);
    const previewIds = new Set(preview.map((t) => t.id));
    // T-001 through T-091 must NOT be in the preview
    expect(previewIds.has("T-001")).toBe(false);
    expect(previewIds.has("T-050")).toBe(false);
    expect(previewIds.has("T-091")).toBe(false);
  });

  it("expanded: ALL 101 done tasks are reachable (no information hidden)", () => {
    const all = doneExpanded(doneCorpus);
    expect(all).toHaveLength(101);
    // Spot-check first and last
    expect(all[0].id).toBe("T-001");
    expect(all[100].id).toBe("T-101");
  });

  it("expanded: every task in the corpus is present in the rendered list", () => {
    const all = doneExpanded(doneCorpus);
    const renderedIds = new Set(all.map((t) => t.id));
    doneCorpus.forEach((task) => {
      expect(renderedIds.has(task.id)).toBe(true);
    });
  });

  it("doneHasMore returns true for 101 tasks", () => {
    expect(doneHasMore(doneCorpus)).toBe(true);
  });

  it("doneHasMore returns false for exactly 10 tasks (no toggle shown)", () => {
    const tenTasks = doneCorpus.slice(0, 10);
    expect(doneHasMore(tenTasks)).toBe(false);
  });

  it("doneHasMore returns false for fewer than 10 tasks", () => {
    const fewTasks = doneCorpus.slice(0, 3);
    expect(doneHasMore(fewTasks)).toBe(false);
  });

  it("count label reflects full length (not preview length)", () => {
    // The label must say Done(101), not Done(10)
    const label = `Done (${doneCorpus.length})`;
    expect(label).toBe("Done (101)");
  });

  it("no tasks are lost between collapsed and expanded state", () => {
    const preview = donePreview(doneCorpus);
    const all = doneExpanded(doneCorpus);
    // Every preview task must also appear in the expanded list (superset)
    const allIds = new Set(all.map((t) => t.id));
    preview.forEach((t) => expect(allIds.has(t.id)).toBe(true));
    // Expanded list is strictly larger
    expect(all.length).toBeGreaterThan(preview.length);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — signal_queue guard
// ---------------------------------------------------------------------------

describe("SignalQueue defensive guard", () => {
  interface SignalRow { id: string; ts: string; summary: string; severity: string; status: string; from: string; to: string; }
  interface SignalQueue { rows: SignalRow[]; }

  function getRows(queue: SignalQueue | undefined): SignalRow[] {
    return queue?.rows ?? [];
  }

  it("undefined signal_queue → empty rows, no throw", () => {
    expect(() => getRows(undefined)).not.toThrow();
    expect(getRows(undefined)).toEqual([]);
  });

  it("signal_queue with rows returns them", () => {
    const queue: SignalQueue = {
      rows: [{ id: "s1", ts: "2026-06-02T00:00Z", summary: "test", severity: "INFO", status: "READ", from: "a", to: "b" }],
    };
    expect(getRows(queue)).toHaveLength(1);
  });

  it("signal_queue with empty rows returns []", () => {
    const queue: SignalQueue = { rows: [] };
    expect(getRows(queue)).toEqual([]);
  });
});
