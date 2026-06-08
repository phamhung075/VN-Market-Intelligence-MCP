/**
 * 1979-orchestration-decisions.test.ts — Integration tests for
 * buildOrchestrationDto decisions extension.
 *
 * ORCH-DASH-DECISION-DRILLDOWN F2 — AC-F2-10
 *
 * Tests:
 *   T1 — buildOrchestrationDto with fixture orch-state + fixture journal
 *        → DTO includes decisions with correct by_task entries
 *   T2 — buildOrchestrationDto with no journal files
 *        → decisions = { by_task: {}, sprint_bucket: {} }
 *   T3 — Regression: existing fields (head, task_board, signal_queue,
 *        sprint_goal, narrative) byte-identical when decisions empty
 */

// Must be set before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildOrchestrationDto } from "../interface/mcp/routes/orchestrationHandler.js";
import { _clearCacheForTesting } from "../infrastructure/journalStore.js";
import type { OrchState } from "../infrastructure/orchStateStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal valid OrchState fixture — matches ORCH-DASH-DECISION-DRILLDOWN sprint */
const FIXTURE_STATE: OrchState = {
  _schema: "v3",
  _ssot: true,
  _updated_at: "2026-06-05T22:00Z",
  _updated_by: "dev-mcp-server",
  head: {
    status: "in_progress",
    active_task_id: "ARCH-ORCH-F2",
    next_agent: "dev-mcp-server",
    wip: 1,
    wip_max: 2,
    updated_at: "2026-06-05T21:00Z",
    updated_by: "pm",
  },
  task_board: {
    _updated_at: "2026-06-05T22:00Z",
    _updated_by: "pm",
    active_sprints: [
      {
        id: "ORCH-DASH-DECISION-DRILLDOWN",
        label: "Decision Drilldown",
        status: "active",
        opened_at: "2026-06-05",
        tasks: [
          {
            id: "ARCH-ORCH-F1",
            title: "decision-journal SKILL.md + flow injection",
            type: "sprint-task",
            owner: "agent-father",
            status: "DONE",
            zone: "docs/agents/",
          },
          {
            id: "ARCH-ORCH-F2",
            title: "Journal parse + DTO extension",
            type: "sprint-task",
            owner: "dev-mcp-server",
            depends: "ARCH-ORCH-F1",
            status: "IN_PROGRESS",
            zone: "apps/mcp-server/",
          },
          {
            id: "ARCH-ORCH-F3",
            title: "Remix accordion UI",
            type: "sprint-task",
            owner: "dev-frontend",
            depends: "ARCH-ORCH-F2",
            status: "TODO",
            zone: "apps/frontend/",
          },
        ],
      },
    ],
    backlog: [],
    archive: [],
  },
  signal_queue: {
    _updated_at: "2026-06-05T22:00Z",
    _updated_by: "pm",
    rows: [],
    archive: [],
  },
  sprint_goal: {
    _updated_at: "2026-06-05T22:00Z",
    _updated_by: "po",
    entries: [
      {
        sprint_id: "ORCH-DASH-DECISION-DRILLDOWN",
        vision: "Clickable DONE-task Decision-Journal drill-down.",
        scope_in: ["journal parse", "decisions DTO", "accordion UI"],
        scope_out: ["backfill", "auth"],
        success_metric: "GET /api/orchestration returns decisions field.",
        status: "OPEN",
      },
    ],
  } as unknown as Record<string, unknown>,
  narrative: {
    current_sprint: "ORCH-DASH-DECISION-DRILLDOWN — F2 in progress.",
    last_closed: "ORCH-STATE-CONSOLIDATE CLOSED.",
    watch_items: [],
    open_sprints: ["ORCH-DASH-DECISION-DRILLDOWN"],
  } as unknown as Record<string, unknown>,
};

/** Fixture journal content: one tagged step (→ by_task) + one untagged (→ sprint_bucket) */
const FIXTURE_JOURNAL = `### STEP agent-father-S1 · agent-father · 2026-06-05T00:00:00Z
**task-id:** ARCH-ORCH-F1
**what-done:** Added optional task-id field to SKILL.md.
**what-considered:**
- Placement option
- Omit vs empty string
**why-decision:** Blueprint contract is exact.
**why-change:** No change from blueprint.

### STEP po-S1 · po · 2026-06-05T21:06:28Z
**what-done:** Wrote sprint goal.
**what-considered:**
- Join-key design options
**why-decision:** Forwarded to architect.
**why-change:** N/A.
`;

function makeTmpDir(suffix: string): string {
  const dir = resolve(tmpdir(), `1979-orch-decisions-${suffix}-${Date.now()}`);
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
// T1 — buildOrchestrationDto with journal → DTO has correct by_task entries
// ─────────────────────────────────────────────────────────────────────────────

describe("T1 — buildOrchestrationDto includes decisions from journal file", () => {
  it("T1-a: decisions field is present and is an object", () => {
    const dir = makeTmpDir("t1a");
    try {
      writeFileSync(
        resolve(dir, "sprint-ORCH-DASH-DECISION-DRILLDOWN.md"),
        FIXTURE_JOURNAL,
        "utf8",
      );
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      expect(typeof dto.decisions).toBe("object");
      expect(dto.decisions).not.toBeNull();
    } finally {
      teardown(dir);
    }
  });

  it("T1-b: by_task[ARCH-ORCH-F1] has the agent-father-S1 step", () => {
    const dir = makeTmpDir("t1b");
    try {
      writeFileSync(
        resolve(dir, "sprint-ORCH-DASH-DECISION-DRILLDOWN.md"),
        FIXTURE_JOURNAL,
        "utf8",
      );
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      const f1Steps = dto.decisions.by_task["ARCH-ORCH-F1"];
      expect(f1Steps).toBeDefined();
      expect(f1Steps!.length).toBeGreaterThanOrEqual(1);
      const s = f1Steps!.find((x) => x.step_id === "agent-father-S1");
      expect(s).toBeDefined();
      expect(s!.agent_id).toBe("agent-father");
    } finally {
      teardown(dir);
    }
  });

  it("T1-c: sprint_bucket[ORCH-DASH-DECISION-DRILLDOWN] has the po-S1 untagged step", () => {
    const dir = makeTmpDir("t1c");
    try {
      writeFileSync(
        resolve(dir, "sprint-ORCH-DASH-DECISION-DRILLDOWN.md"),
        FIXTURE_JOURNAL,
        "utf8",
      );
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      const bucket = dto.decisions.sprint_bucket["ORCH-DASH-DECISION-DRILLDOWN"];
      expect(bucket).toBeDefined();
      expect(bucket!.some((s) => s.step_id === "po-S1")).toBe(true);
    } finally {
      teardown(dir);
    }
  });

  it("T1-d: decisions field is NOT a markdown string (regression guard)", () => {
    const dir = makeTmpDir("t1d");
    try {
      writeFileSync(
        resolve(dir, "sprint-ORCH-DASH-DECISION-DRILLDOWN.md"),
        FIXTURE_JOURNAL,
        "utf8",
      );
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      // Must be a structured object, not a raw markdown string
      expect(typeof dto.decisions).not.toBe("string");
      expect("by_task" in dto.decisions).toBe(true);
      expect("sprint_bucket" in dto.decisions).toBe(true);
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — buildOrchestrationDto with no journal files → zero-value decisions
// ─────────────────────────────────────────────────────────────────────────────

describe("T2 — buildOrchestrationDto: no journal files → zero-value decisions", () => {
  it("T2-a: empty dir → decisions = { by_task: {}, sprint_bucket: {} }", () => {
    const dir = makeTmpDir("t2a");
    try {
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      expect(dto.decisions).toEqual({ by_task: {}, sprint_bucket: {} });
    } finally {
      teardown(dir);
    }
  });

  it("T2-b: decisions field always present (never null/undefined)", () => {
    const dir = makeTmpDir("t2b");
    try {
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      expect(dto.decisions).not.toBeNull();
      expect(dto.decisions).not.toBeUndefined();
    } finally {
      teardown(dir);
    }
  });

  it("T2-c: orch-state with no sprint_goal → decisions is zero-value, no crash", () => {
    const dir = makeTmpDir("t2c");
    try {
      // Omit sprint_goal entirely rather than setting to undefined (exactOptionalPropertyTypes)
      const { sprint_goal: _omitted, ...restState } = FIXTURE_STATE;
      const stateNoGoal = restState as OrchState;
      const dto = buildOrchestrationDto(stateNoGoal, dir);
      expect(dto.decisions).toEqual({ by_task: {}, sprint_bucket: {} });
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — Regression: existing fields byte-identical when decisions = empty
// ─────────────────────────────────────────────────────────────────────────────

describe("T3 — Regression: existing fields preserved exactly", () => {
  it("T3-a: last_updated_iso unchanged by decisions extension", () => {
    const dir = makeTmpDir("t3a");
    try {
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      expect(dto.last_updated_iso).toBe("2026-06-05T22:00Z");
    } finally {
      teardown(dir);
    }
  });

  it("T3-b: head fields unchanged", () => {
    const dir = makeTmpDir("t3b");
    try {
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      expect(dto.head.status).toBe("in_progress");
      expect(dto.head.active_task_id).toBe("ARCH-ORCH-F2");
      expect(dto.head.next_agent).toBe("dev-mcp-server");
      expect(dto.head.wip).toBe(1);
      expect(dto.head.wip_max).toBe(2);
    } finally {
      teardown(dir);
    }
  });

  it("T3-c: task_board counts correct (done sourced from task_board.done[], not active_sprint DONE count)", () => {
    const dir = makeTmpDir("t3c");
    try {
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      // counts.done = task_board.done[].length; fixture has no done[] → 0
      expect(dto.task_board.counts.done).toBe(0);
      expect(dto.task_board.counts.in_progress).toBe(1);
      // TODO=1 → backlog; the DONE task in active_sprints is NOT in counts.done
      expect(dto.task_board.counts.backlog).toBe(1);
    } finally {
      teardown(dir);
    }
  });

  it("T3-d: sprint_goal preserved", () => {
    const dir = makeTmpDir("t3d");
    try {
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      expect(dto.sprint_goal?.sprint_id).toBe("ORCH-DASH-DECISION-DRILLDOWN");
    } finally {
      teardown(dir);
    }
  });

  it("T3-e: narrative preserved", () => {
    const dir = makeTmpDir("t3e");
    try {
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
      expect(dto.narrative.current_sprint).toContain("ORCH-DASH-DECISION-DRILLDOWN");
    } finally {
      teardown(dir);
    }
  });

  it("T3-f: OrchestrationDto top-level keys = expected safe set + decisions", () => {
    const dir = makeTmpDir("t3f");
    try {
      const dto = buildOrchestrationDto(FIXTURE_STATE, dir);
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
    } finally {
      teardown(dir);
    }
  });
});
