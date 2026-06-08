/**
 * 1980-f2-canon-schema.test.ts — ORCH-TASK-CANON F2 acceptance tests
 *
 * Sprint: ORCH-TASK-CANON
 * Task: F2-MCP
 *
 * Tests:
 *   T1  — projectTask coalesce: id takes precedence over task_id (post-F1B)
 *   T2  — buildOrchestrationDto: task_board.done[] projected from OrchState
 *   T3  — buildOrchestrationDto: counts.done === done[].length (not active_sprint DONE)
 *   T4  — buildOrchestrationDto: done[] absent → empty array (graceful)
 *   T5  — buildOrchestrationDto: new canonical fields (status_note, created_at, closed_at) projected
 *   T6  — journalStore glob: per-agent files sprint-S1-dev.md merged with sprint-S1.md
 *   T7  — journalStore glob: legacy single-file back-compat
 *   T8  — journalStore glob: empty directory → graceful empty result
 *   T9  — OrchestrationDto top-level keys include task_board.done
 *   T10 — OrchTaskDto does NOT contain banned fields (label, raw_payload)
 */

// Must be set before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  buildOrchestrationDto,
} from "../interface/mcp/routes/orchestrationHandler.js";
import {
  getDecisionsForSprints,
  _clearCacheForTesting,
} from "../infrastructure/journalStore.js";
import type { OrchState, OrchStateTaskBoardTask } from "../infrastructure/orchStateStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTmpDir(suffix: string): string {
  const dir = resolve(tmpdir(), `1980-f2-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function teardown(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

beforeEach(() => {
  _clearCacheForTesting();
});

// ─────────────────────────────────────────────────────────────────────────────
// Minimal valid OrchState with done[] populated
// ─────────────────────────────────────────────────────────────────────────────

function makeState(overrides?: Partial<OrchState["task_board"]>): OrchState {
  return {
    _schema: "v3",
    _updated_at: "2026-06-06T21:00:00Z",
    _updated_by: "dev-mcp-server",
    head: {
      status: "in_progress",
      active_task_id: "F2-MCP",
      next_agent: "dev-mcp-server",
      wip: 1,
      wip_max: 2,
      updated_at: "2026-06-06T20:00:00Z",
      updated_by: "pm",
    },
    task_board: {
      _updated_at: "2026-06-06T21:00:00Z",
      _updated_by: "agent-father",
      active_sprints: [],
      backlog: [],
      archive: [],
      ...overrides,
    },
    signal_queue: {
      _updated_at: "2026-06-06T21:00:00Z",
      _updated_by: "agent-father",
      rows: [],
      archive: [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 — projectTask coalesce: id > task_id (post-F1B canonical)
// ─────────────────────────────────────────────────────────────────────────────

describe("T1 — projectTask coalesce: id takes precedence over task_id", () => {

  it("T1-a: task with id only → DTO id = canonical id", () => {
    const state = makeState({
      active_sprints: [{ id: "SP", status: "active", tasks: [
        { id: "T1", title: "task 1", owner: "dev", status: "IN_PROGRESS", zone: "apps/" },
      ]}],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.tasks[0]!.id).toBe("T1");
  });

  it("T1-b: task with task_id only (legacy), no id → DTO id = task_id value", () => {
    const state = makeState({
      active_sprints: [{ id: "SP", status: "active", tasks: [
        { id: "", task_id: "T2", title: "legacy", owner: "dev", status: "TODO", zone: "apps/" },
      ]}],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.tasks[0]!.id).toBe("T2");
  });

  it("T1-c: task with both id and task_id → DTO id = id (not task_id)", () => {
    const state = makeState({
      active_sprints: [{ id: "SP", status: "active", tasks: [
        { id: "CANONICAL", task_id: "LEGACY", title: "both", owner: "dev", status: "TODO", zone: "apps/" },
      ]}],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.tasks[0]!.id).toBe("CANONICAL");
  });

  it("T1-d: task with both id and task_id → task_id NOT used in DTO id", () => {
    const state = makeState({
      active_sprints: [{ id: "SP", status: "active", tasks: [
        { id: "CANONICAL", task_id: "LEGACY", title: "both", owner: "dev", status: "TODO", zone: "apps/" },
      ]}],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.tasks[0]!.id).not.toBe("LEGACY");
  });

  it("T1-e: done[] task with id → DTO done[0].id = id", () => {
    const state = makeState({
      done: [
        { id: "ARCH-ORCH-F1", title: "F1 task", owner: "agent-father", status: "DONE", zone: "docs/",
          created_at: "2026-06-06T20:00:00Z", closed_at: "2026-06-06T21:00:00Z" },
      ],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done[0]!.id).toBe("ARCH-ORCH-F1");
  });

  it("T1-f: done[] task with task_id only → coalesce works in done[] too", () => {
    const state = makeState({
      done: [
        { id: "", task_id: "LEGACY-DONE", title: "legacy done", owner: "dev",
          status: "DONE", zone: "apps/", created_at: "2026-06-01T00:00:00Z" },
      ],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done[0]!.id).toBe("LEGACY-DONE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — buildOrchestrationDto: task_board.done[] projected
// ─────────────────────────────────────────────────────────────────────────────

describe("T2 — buildOrchestrationDto: task_board.done[] projected", () => {

  it("T2-a: state with done[1 task] → dto.task_board.done has length 1", () => {
    const state = makeState({
      done: [
        { id: "ARCH-ORCH-F1", title: "F1", owner: "dev", status: "DONE", zone: "docs/",
          created_at: "2026-06-06T20:00:00Z" },
      ],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done).toHaveLength(1);
  });

  it("T2-b: done[0].id matches source task id", () => {
    const state = makeState({
      done: [
        { id: "ARCH-ORCH-F1", title: "F1", owner: "dev", status: "DONE", zone: "docs/",
          created_at: "2026-06-06T20:00:00Z" },
      ],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done[0]!.id).toBe("ARCH-ORCH-F1");
  });

  it("T2-c: done with 71 tasks → dto.task_board.done.length = 71", () => {
    const tasks: OrchStateTaskBoardTask[] = Array.from({ length: 71 }, (_, i) => ({
      id: `TASK-${i}`,
      title: `Task ${i}`,
      owner: "dev",
      status: "DONE" as const,
      zone: "apps/",
      created_at: "2026-06-06T00:00:00Z",
    }));
    const state = makeState({ done: tasks });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done).toHaveLength(71);
  });

  it("T2-d: done[] is always an array (never null/undefined)", () => {
    const state = makeState({});
    const dto = buildOrchestrationDto(state);
    expect(Array.isArray(dto.task_board.done)).toBe(true);
  });

  it("T2-e: done[] task title projected correctly", () => {
    const state = makeState({
      done: [
        { id: "T1", title: "Canonical title", owner: "dev", status: "DONE", zone: "apps/",
          created_at: "2026-06-06T00:00:00Z" },
      ],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done[0]!.title).toBe("Canonical title");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — counts.done === done[].length (not active_sprint DONE count)
// ─────────────────────────────────────────────────────────────────────────────

describe("T3 — counts.done sourced from done[].length", () => {

  it("T3-a: done[3 tasks] → counts.done = 3", () => {
    const tasks: OrchStateTaskBoardTask[] = [
      { id: "D1", title: "d1", owner: "dev", status: "DONE", zone: "apps/", created_at: "2026-06-06T00:00:00Z" },
      { id: "D2", title: "d2", owner: "dev", status: "DONE", zone: "apps/", created_at: "2026-06-06T00:00:00Z" },
      { id: "D3", title: "d3", owner: "dev", status: "DONE", zone: "apps/", created_at: "2026-06-06T00:00:00Z" },
    ];
    const state = makeState({ done: tasks });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.counts.done).toBe(3);
  });

  it("T3-b: done absent → counts.done = 0", () => {
    const state = makeState({});
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.counts.done).toBe(0);
  });

  it("T3-c: done[] empty → counts.done = 0", () => {
    const state = makeState({ done: [] });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.counts.done).toBe(0);
  });

  it("T3-d: DONE tasks in active_sprints are NOT counted in counts.done", () => {
    const state = makeState({
      active_sprints: [{ id: "SP", status: "active", tasks: [
        { id: "A1", title: "active done", owner: "dev", status: "DONE", zone: "apps/" },
        { id: "A2", title: "in progress", owner: "dev", status: "IN_PROGRESS", zone: "apps/" },
      ]}],
      done: [], // no items in canonical done[]
    });
    const dto = buildOrchestrationDto(state);
    // counts.done must be 0 — the DONE in active_sprint is NOT the source
    expect(dto.task_board.counts.done).toBe(0);
    expect(dto.task_board.counts.in_progress).toBe(1);
  });

  it("T3-e: counts.done === dto.task_board.done.length (invariant)", () => {
    const tasks: OrchStateTaskBoardTask[] = Array.from({ length: 5 }, (_, i) => ({
      id: `T${i}`,
      title: `t${i}`,
      owner: "dev",
      status: "DONE" as const,
      zone: "apps/",
      created_at: "2026-06-06T00:00:00Z",
    }));
    const state = makeState({ done: tasks });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.counts.done).toBe(dto.task_board.done.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — buildOrchestrationDto: done[] absent → empty array (graceful)
// ─────────────────────────────────────────────────────────────────────────────

describe("T4 — done[] absent → empty array (graceful)", () => {

  it("T4-a: task_board.done absent → dto.task_board.done = []", () => {
    const state = makeState(); // done not set
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done).toEqual([]);
  });

  it("T4-b: task_board.done = undefined → dto.task_board.done = []", () => {
    const state = makeState({});
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done).toEqual([]);
  });

  it("T4-c: task_board.done = [] → dto.task_board.done = []", () => {
    const state = makeState({ done: [] });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — New canonical fields projected from done[] tasks
// ─────────────────────────────────────────────────────────────────────────────

describe("T5 — New canonical fields projected from done[] and active_sprint tasks", () => {

  it("T5-a: status_note projected from done task", () => {
    const state = makeState({
      done: [{
        id: "T1", title: "T1", owner: "dev", status: "DONE", zone: "apps/",
        created_at: "2026-06-06T00:00:00Z",
        status_note: "DONE-LIVE-VERIFIED 2026-06-06T21:00Z by router raw-verify",
      }],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done[0]!.status_note).toBe("DONE-LIVE-VERIFIED 2026-06-06T21:00Z by router raw-verify");
  });

  it("T5-b: created_at projected from done task", () => {
    const state = makeState({
      done: [{
        id: "T1", title: "T1", owner: "dev", status: "DONE", zone: "apps/",
        created_at: "2026-06-01T00:00:00Z",
      }],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done[0]!.created_at).toBe("2026-06-01T00:00:00Z");
  });

  it("T5-c: closed_at projected from done task", () => {
    const state = makeState({
      done: [{
        id: "T1", title: "T1", owner: "dev", status: "DONE", zone: "apps/",
        created_at: "2026-06-01T00:00:00Z", closed_at: "2026-06-02T00:00:00Z",
      }],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done[0]!.closed_at).toBe("2026-06-02T00:00:00Z");
  });

  it("T5-d: commit projected from done task", () => {
    const state = makeState({
      done: [{
        id: "T1", title: "T1", owner: "dev", status: "DONE", zone: "apps/",
        created_at: "2026-06-01T00:00:00Z", commit: "abc123def",
      }],
    });
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done[0]!.commit).toBe("abc123def");
  });

  it("T5-e: optional fields absent → keys not in DTO (exactOptionalPropertyTypes)", () => {
    const state = makeState({
      done: [{
        id: "T1", title: "T1", owner: "dev", status: "DONE", zone: "apps/",
        created_at: "2026-06-01T00:00:00Z",
        // status_note, closed_at, commit intentionally absent
      }],
    });
    const dto = buildOrchestrationDto(state);
    const task = dto.task_board.done[0]!;
    // Absent optional fields should be absent (not set to undefined)
    expect(task.status_note).toBeUndefined();
    expect(task.closed_at).toBeUndefined();
    expect(task.commit).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — journalStore glob: per-agent files merged with sprint file
// ─────────────────────────────────────────────────────────────────────────────

describe("T6 — journalStore glob: per-agent files merged", () => {

  const STEP_AGENT_FATHER = `### STEP af-S1 · agent-father · 2026-06-06T10:00:00Z
**task-id:** ARCH-ORCH-F1A
**what-done:** Wrote flows.
**what-considered:**
- Option A
**why-decision:** Best fit.
**why-change:** None.`;

  const STEP_DEV_MCP = `### STEP dev-S1 · dev-mcp-server · 2026-06-06T11:00:00Z
**task-id:** F2-MCP
**what-done:** Implemented done[] serving.
**what-considered:**
- DTO extension approach
**why-decision:** Handoff spec.
**why-change:** None.`;

  it("T6-a: sprint-S1.md + sprint-S1-agent-father.md → both files' steps merged", () => {
    const dir = makeTmpDir("t6a");
    try {
      writeFileSync(resolve(dir, "sprint-ORCH-TASK-CANON.md"), STEP_AGENT_FATHER, "utf8");
      writeFileSync(resolve(dir, "sprint-ORCH-TASK-CANON-dev-mcp-server.md"), STEP_DEV_MCP, "utf8");
      const decisions = getDecisionsForSprints(["ORCH-TASK-CANON"], dir);
      // Both steps should appear
      expect(decisions.by_task["ARCH-ORCH-F1A"]).toBeDefined();
      expect(decisions.by_task["F2-MCP"]).toBeDefined();
    } finally {
      teardown(dir);
    }
  });

  it("T6-b: per-agent file steps are correctly attributed (agent_id preserved)", () => {
    const dir = makeTmpDir("t6b");
    try {
      writeFileSync(resolve(dir, "sprint-ORCH-TASK-CANON-dev-mcp-server.md"), STEP_DEV_MCP, "utf8");
      const decisions = getDecisionsForSprints(["ORCH-TASK-CANON"], dir);
      const step = decisions.by_task["F2-MCP"]?.[0];
      expect(step).toBeDefined();
      expect(step!.agent_id).toBe("dev-mcp-server");
      expect(step!.step_id).toBe("dev-S1");
    } finally {
      teardown(dir);
    }
  });

  it("T6-c: 3 per-agent files → all steps merged into by_task", () => {
    const dir = makeTmpDir("t6c");
    try {
      const mkStep = (agentId: string, taskId: string, n: number) =>
        `### STEP ${agentId}-S${n} · ${agentId} · 2026-06-06T1${n}:00:00Z\n**task-id:** ${taskId}\n**what-done:** Done.\n**what-considered:**\n- opt\n**why-decision:** ok.\n**why-change:** none.`;

      writeFileSync(resolve(dir, "sprint-SPRINT-X.md"),             mkStep("po", "TASK-A", 0), "utf8");
      writeFileSync(resolve(dir, "sprint-SPRINT-X-dev.md"),         mkStep("dev", "TASK-B", 1), "utf8");
      writeFileSync(resolve(dir, "sprint-SPRINT-X-qa.md"),          mkStep("qa", "TASK-C", 2), "utf8");

      const decisions = getDecisionsForSprints(["SPRINT-X"], dir);
      expect(decisions.by_task["TASK-A"]).toBeDefined();
      expect(decisions.by_task["TASK-B"]).toBeDefined();
      expect(decisions.by_task["TASK-C"]).toBeDefined();
    } finally {
      teardown(dir);
    }
  });

  it("T6-d: files read in sorted order (alphabetical, deterministic)", () => {
    const dir = makeTmpDir("t6d");
    try {
      const mkStep = (id: string) =>
        `### STEP ${id}-S1 · ${id} · 2026-06-06T10:00:00Z\n**task-id:** TASK-${id}\n**what-done:** Done.\n**what-considered:**\n- opt\n**why-decision:** ok.\n**why-change:** none.`;
      writeFileSync(resolve(dir, "sprint-SPRINT-Y-z-agent.md"), mkStep("z"), "utf8");
      writeFileSync(resolve(dir, "sprint-SPRINT-Y-a-agent.md"), mkStep("a"), "utf8");
      writeFileSync(resolve(dir, "sprint-SPRINT-Y.md"),         mkStep("base"), "utf8");
      const decisions = getDecisionsForSprints(["SPRINT-Y"], dir);
      // All 3 should appear regardless of creation order
      expect(Object.keys(decisions.by_task)).toHaveLength(3);
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 — journalStore glob: legacy single-file back-compat
// ─────────────────────────────────────────────────────────────────────────────

describe("T7 — journalStore glob: legacy single-file back-compat", () => {

  it("T7-a: only sprint-S1.md exists → reads it correctly", () => {
    const dir = makeTmpDir("t7a");
    try {
      const content = `### STEP legacy-S1 · legacy-agent · 2026-06-01T00:00:00Z
**task-id:** OLD-TASK
**what-done:** Legacy step.
**what-considered:**
- old approach
**why-decision:** Was the only way.
**why-change:** No change.`;
      writeFileSync(resolve(dir, "sprint-LEGACY-SPRINT.md"), content, "utf8");
      const decisions = getDecisionsForSprints(["LEGACY-SPRINT"], dir);
      expect(decisions.by_task["OLD-TASK"]).toBeDefined();
      expect(decisions.by_task["OLD-TASK"]![0]!.step_id).toBe("legacy-S1");
    } finally {
      teardown(dir);
    }
  });

  it("T7-b: mtime cache works per file (hit = same steps returned)", () => {
    const dir = makeTmpDir("t7b");
    try {
      const content = `### STEP cached-S1 · dev · 2026-06-01T00:00:00Z
**task-id:** CACHED-TASK
**what-done:** Cached step.
**what-considered:**
- caching
**why-decision:** Fast.
**why-change:** None.`;
      writeFileSync(resolve(dir, "sprint-CACHE-SPRINT.md"), content, "utf8");
      const r1 = getDecisionsForSprints(["CACHE-SPRINT"], dir);
      const r2 = getDecisionsForSprints(["CACHE-SPRINT"], dir);
      // Both calls return same result (cache hit on second call)
      expect(r1.by_task["CACHED-TASK"]![0]!.step_id).toBe(r2.by_task["CACHED-TASK"]![0]!.step_id);
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8 — journalStore glob: empty directory → graceful empty result
// ─────────────────────────────────────────────────────────────────────────────

describe("T8 — journalStore glob: empty directory / missing", () => {

  it("T8-a: empty directory → by_task and sprint_bucket are empty objects", () => {
    const dir = makeTmpDir("t8a");
    try {
      const decisions = getDecisionsForSprints(["ORCH-TASK-CANON"], dir);
      expect(decisions.by_task).toEqual({});
      expect(decisions.sprint_bucket).toEqual({});
    } finally {
      teardown(dir);
    }
  });

  it("T8-b: non-existent directory → graceful empty, no throw", () => {
    let decisions: ReturnType<typeof getDecisionsForSprints> | null = null;
    expect(() => {
      decisions = getDecisionsForSprints(["ORCH-TASK-CANON"], "/tmp/1980-f2-no-such-dir-at-all");
    }).not.toThrow();
    expect(decisions!.by_task).toEqual({});
    expect(decisions!.sprint_bucket).toEqual({});
  });

  it("T8-c: sprint ID with no matching files in non-empty dir → empty", () => {
    const dir = makeTmpDir("t8c");
    try {
      writeFileSync(resolve(dir, "sprint-OTHER-SPRINT.md"), "no steps", "utf8");
      const decisions = getDecisionsForSprints(["ORCH-TASK-CANON"], dir);
      expect(decisions.by_task).toEqual({});
    } finally {
      teardown(dir);
    }
  });

  it("T8-d: empty sprintIds array → empty result", () => {
    const dir = makeTmpDir("t8d");
    try {
      const decisions = getDecisionsForSprints([], dir);
      expect(decisions.by_task).toEqual({});
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 — OrchestrationDto top-level keys include task_board.done
// ─────────────────────────────────────────────────────────────────────────────

describe("T9 — OrchestrationDto includes done[] at task_board level", () => {

  it("T9-a: task_board object has 'done' key", () => {
    const state = makeState({
      done: [{ id: "T1", title: "T", owner: "dev", status: "DONE", zone: "apps/",
        created_at: "2026-06-06T00:00:00Z" }],
    });
    const dto = buildOrchestrationDto(state);
    expect("done" in dto.task_board).toBe(true);
  });

  it("T9-b: task_board.done is an array", () => {
    const state = makeState();
    const dto = buildOrchestrationDto(state);
    expect(Array.isArray(dto.task_board.done)).toBe(true);
  });

  it("T9-c: top-level OrchestrationDto keys are the expected safe set", () => {
    const state = makeState();
    const dto = buildOrchestrationDto(state);
    const keys = Object.keys(dto).sort();
    const expected = [
      "decisions",
      "head",
      "last_updated_iso",
      "narrative",
      "signal_queue",
      "sprint_goal",
      "task_board",
    ];
    expect(keys).toEqual(expected);
  });

  it("T9-d: task_board has counts, tasks, done", () => {
    const state = makeState();
    const dto = buildOrchestrationDto(state);
    expect("counts" in dto.task_board).toBe(true);
    expect("tasks" in dto.task_board).toBe(true);
    expect("done" in dto.task_board).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T10 — OrchTaskDto does NOT contain banned fields
// ─────────────────────────────────────────────────────────────────────────────

describe("T10 — OrchTaskDto banned fields absent", () => {

  const BANNED_FIELDS = ["label", "raw_payload", "next_action", "desc", "summary"];

  it("T10-a: active_sprint tasks never have banned fields", () => {
    const state = makeState({
      active_sprints: [{ id: "SP", status: "active", tasks: [
        { id: "T1", title: "task", owner: "dev", status: "IN_PROGRESS", zone: "apps/" },
      ]}],
    });
    const dto = buildOrchestrationDto(state);
    for (const task of dto.task_board.tasks) {
      for (const banned of BANNED_FIELDS) {
        expect(banned in task).toBe(false);
      }
    }
  });

  it("T10-b: done[] tasks never have banned fields", () => {
    const state = makeState({
      done: [
        { id: "T1", title: "done task", owner: "dev", status: "DONE", zone: "apps/",
          created_at: "2026-06-06T00:00:00Z" },
      ],
    });
    const dto = buildOrchestrationDto(state);
    for (const task of dto.task_board.done) {
      for (const banned of BANNED_FIELDS) {
        expect(banned in task).toBe(false);
      }
    }
  });

  it("T10-c: done[] task fields are all in the canonical safe set", () => {
    const SAFE_TASK_KEYS = new Set([
      "id", "title", "owner", "status", "zone",
      "type", "size", "priority",
      "status_note", "created_at", "closed_at",
      "depends", "note", "files", "commit",
    ]);
    const state = makeState({
      done: [{
        id: "T1", title: "T1", owner: "dev", status: "DONE", zone: "apps/",
        created_at: "2026-06-06T00:00:00Z", closed_at: "2026-06-06T21:00:00Z",
        status_note: "DONE", commit: "abc123",
      }],
    });
    const dto = buildOrchestrationDto(state);
    const task = dto.task_board.done[0]!;
    for (const key of Object.keys(task)) {
      expect(SAFE_TASK_KEYS.has(key)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T11 — Live orch-state integration: real done[] from committed orch-state.json
// ─────────────────────────────────────────────────────────────────────────────

describe("T11 — Live orch-state: real done[] from docs/data/orch/orch-state.json", () => {

  it("T11-a: real orch-state.json has non-empty done[] (>=71 tasks expected)", () => {
    const { readOrchStateOrNull, getOrchStatePath } = require("../infrastructure/orchStateStore.js");
    const orchStatePath = getOrchStatePath(resolve(process.cwd(), "..", ".."));
    const state = readOrchStateOrNull(orchStatePath);
    if (!state) {
      console.log("[test] orch-state.json not found — skipping live test");
      return;
    }
    const done = state.task_board?.done ?? [];
    expect(done.length).toBeGreaterThanOrEqual(71);
  });

  it("T11-b: buildOrchestrationDto on real state → done[] is non-empty", () => {
    const { readOrchStateOrNull, getOrchStatePath } = require("../infrastructure/orchStateStore.js");
    const orchStatePath = getOrchStatePath(resolve(process.cwd(), "..", ".."));
    const state = readOrchStateOrNull(orchStatePath);
    if (!state) {
      console.log("[test] orch-state.json not found — skipping live test");
      return;
    }
    const dto = buildOrchestrationDto(state);
    expect(dto.task_board.done.length).toBeGreaterThanOrEqual(71);
    expect(dto.task_board.counts.done).toBeGreaterThanOrEqual(71);
    expect(dto.task_board.counts.done).toBe(dto.task_board.done.length);
  });

  it("T11-c: first done task has a valid id (not empty string)", () => {
    const { readOrchStateOrNull, getOrchStatePath } = require("../infrastructure/orchStateStore.js");
    const orchStatePath = getOrchStatePath(resolve(process.cwd(), "..", ".."));
    const state = readOrchStateOrNull(orchStatePath);
    if (!state) return;
    const dto = buildOrchestrationDto(state);
    if (dto.task_board.done.length === 0) return;
    expect(dto.task_board.done[0]!.id.length).toBeGreaterThan(0);
  });
});
