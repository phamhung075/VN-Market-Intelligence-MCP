/**
 * 1978-journal-store.test.ts — Unit tests for journalStore.ts
 *
 * ORCH-DASH-DECISION-DRILLDOWN F2 — AC-F2-9
 *
 * Tests:
 *   T1 — STEP with task-id → by_task[task_id][]
 *   T2 — STEP without task-id → sprint_bucket[sprintId][]
 *   T3 — Missing journal file → empty maps, no exception
 *   T4 — Malformed STEP (missing fields) → empty string fallbacks, no throw
 *   T5 — CAP-REACHED sentinel → entries before returned, entries after discarded
 *   T6 — Multiple sprints → by_task merges entries from all files
 */

// Must be set before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  parseJournalFile,
  getDecisionsForSprints,
  buildDecisionsDto,
  _clearCacheForTesting,
} from "../infrastructure/journalStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — minimal valid STEP blocks in the F1-locked format
// ─────────────────────────────────────────────────────────────────────────────

const STEP_WITH_TASK_ID = `
### STEP agent-father-S1 · agent-father · 2026-06-05T00:00:00Z
**task-id:** ARCH-ORCH-F1
**what-done:** Added optional task-id field to decision-journal SKILL.md.
**what-considered:**
- Placement between STEP header and what-done
- Omit vs empty string
**why-decision:** Architect blueprint parse contract is exact.
**why-change:** No change from blueprint.
`.trim();

const STEP_WITHOUT_TASK_ID = `
### STEP po-S1 · po · 2026-06-05T21:06:28Z
**what-done:** Wrote sprint goal and first BA task.
**what-considered:**
- Join-key design option A
- Join-key design option B
**why-decision:** Forwarded to architect.
**why-change:** Did not pre-pick.
`.trim();

const STEP_BEFORE_AND_AFTER_CAP = `
### STEP po-S1 · po · 2026-06-05T10:00:00Z
**what-done:** Entry before sentinel.
**what-considered:**
- Option A
**why-decision:** Chose A.
**why-change:** N/A.

### CAP-REACHED

### STEP po-S2 · po · 2026-06-05T11:00:00Z
**what-done:** Entry after sentinel — must be discarded.
**what-considered:**
- Irrelevant
**why-decision:** Should not appear.
**why-change:** Should not appear.
`.trim();

const STEP_MALFORMED = `
### STEP bad-agent-S1 · bad-agent · 2026-06-05T00:00:00Z
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// Tmp directory management per test (R-2 cache bleed mitigation)
// ─────────────────────────────────────────────────────────────────────────────

function makeTmpDir(suffix: string): string {
  const dir = resolve(tmpdir(), `1978-journal-test-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function teardown(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// Clear cache before each test to prevent bleed between test cases
beforeEach(() => {
  _clearCacheForTesting();
});

// ─────────────────────────────────────────────────────────────────────────────
// T1 — STEP with task-id routes to by_task[task_id][]
// ─────────────────────────────────────────────────────────────────────────────

describe("T1 — parseJournalFile: STEP with task-id → by_task", () => {
  it("T1-a: parses step_id, agent_id, timestamp correctly", () => {
    const steps = parseJournalFile(STEP_WITH_TASK_ID, "ORCH-DASH-DECISION-DRILLDOWN");
    expect(steps).toHaveLength(1);
    const step = steps[0]!;
    expect(step.step_id).toBe("agent-father-S1");
    expect(step.agent_id).toBe("agent-father");
    expect(step.timestamp).toBe("2026-06-05T00:00:00Z");
  });

  it("T1-b: task_id is parsed correctly", () => {
    const steps = parseJournalFile(STEP_WITH_TASK_ID, "ORCH-DASH-DECISION-DRILLDOWN");
    expect(steps[0]!.task_id).toBe("ARCH-ORCH-F1");
  });

  it("T1-c: step with task-id routes to by_task (not sprint_bucket)", () => {
    const steps = parseJournalFile(STEP_WITH_TASK_ID, "ORCH-DASH-DECISION-DRILLDOWN");
    const dto = buildDecisionsDto(steps);
    expect(dto.by_task["ARCH-ORCH-F1"]).toBeDefined();
    expect(dto.by_task["ARCH-ORCH-F1"]).toHaveLength(1);
    // sprint_bucket must be empty for this sprint
    expect(dto.sprint_bucket["ORCH-DASH-DECISION-DRILLDOWN"]).toBeUndefined();
  });

  it("T1-d: what_done, what_considered, why_decision, why_change parsed", () => {
    const steps = parseJournalFile(STEP_WITH_TASK_ID, "ORCH-DASH-DECISION-DRILLDOWN");
    const step = steps[0]!;
    expect(step.what_done).toBe("Added optional task-id field to decision-journal SKILL.md.");
    expect(step.what_considered).toHaveLength(2);
    expect(step.what_considered[0]).toBe("Placement between STEP header and what-done");
    expect(step.what_considered[1]).toBe("Omit vs empty string");
    expect(step.why_decision).toBe("Architect blueprint parse contract is exact.");
    expect(step.why_change).toBe("No change from blueprint.");
  });

  it("T1-e: sprint_id set on step", () => {
    const steps = parseJournalFile(STEP_WITH_TASK_ID, "ORCH-DASH-DECISION-DRILLDOWN");
    expect(steps[0]!.sprint_id).toBe("ORCH-DASH-DECISION-DRILLDOWN");
  });

  it("T1-f: real fixture — agent-father-S1 → ARCH-ORCH-F1 bucket (end-to-end via file)", () => {
    const dir = makeTmpDir("t1f");
    try {
      writeFileSync(resolve(dir, "sprint-ORCH-DASH-DECISION-DRILLDOWN.md"), STEP_WITH_TASK_ID, "utf8");
      const decisions = getDecisionsForSprints(["ORCH-DASH-DECISION-DRILLDOWN"], dir);
      expect(decisions.by_task["ARCH-ORCH-F1"]).toBeDefined();
      expect(decisions.by_task["ARCH-ORCH-F1"]![0]!.step_id).toBe("agent-father-S1");
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — STEP without task-id routes to sprint_bucket[sprintId][]
// ─────────────────────────────────────────────────────────────────────────────

describe("T2 — parseJournalFile: STEP without task-id → sprint_bucket", () => {
  it("T2-a: task_id is null when task-id line absent", () => {
    const steps = parseJournalFile(STEP_WITHOUT_TASK_ID, "ORCH-DASH-DECISION-DRILLDOWN");
    expect(steps).toHaveLength(1);
    expect(steps[0]!.task_id).toBeNull();
  });

  it("T2-b: step routes to sprint_bucket not by_task", () => {
    const steps = parseJournalFile(STEP_WITHOUT_TASK_ID, "ORCH-DASH-DECISION-DRILLDOWN");
    const dto = buildDecisionsDto(steps);
    expect(Object.keys(dto.by_task)).toHaveLength(0);
    expect(dto.sprint_bucket["ORCH-DASH-DECISION-DRILLDOWN"]).toBeDefined();
    expect(dto.sprint_bucket["ORCH-DASH-DECISION-DRILLDOWN"]).toHaveLength(1);
  });

  it("T2-c: empty trim routes to sprint_bucket (task-id present but trims empty)", () => {
    const content = `### STEP x-S1 · x · 2026-06-05T00:00:00Z\n**task-id:**   \n**what-done:** test.\n**what-considered:**\n**why-decision:** test.\n**why-change:** test.`;
    const steps = parseJournalFile(content, "SPRINT-X");
    expect(steps[0]!.task_id).toBeNull();
    const dto = buildDecisionsDto(steps);
    expect(Object.keys(dto.by_task)).toHaveLength(0);
    expect(dto.sprint_bucket["SPRINT-X"]).toBeDefined();
  });

  it("T2-d: getDecisionsForSprints returns sprint_bucket from file (integration)", () => {
    const dir = makeTmpDir("t2d");
    try {
      writeFileSync(resolve(dir, "sprint-ORCH-DASH-DECISION-DRILLDOWN.md"), STEP_WITHOUT_TASK_ID, "utf8");
      const decisions = getDecisionsForSprints(["ORCH-DASH-DECISION-DRILLDOWN"], dir);
      expect(Object.keys(decisions.by_task)).toHaveLength(0);
      expect(decisions.sprint_bucket["ORCH-DASH-DECISION-DRILLDOWN"]).toHaveLength(1);
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — Missing journal file → empty maps, no exception
// ─────────────────────────────────────────────────────────────────────────────

describe("T3 — getDecisionsForSprints: missing file → empty, no exception", () => {
  it("T3-a: non-existent dir → empty DecisionsDto, no throw", () => {
    const decisions = getDecisionsForSprints(
      ["NONEXISTENT-SPRINT"],
      "/tmp/1978-no-such-dir-ever",
    );
    expect(decisions.by_task).toEqual({});
    expect(decisions.sprint_bucket).toEqual({});
  });

  it("T3-b: dir exists but file absent → empty, no throw", () => {
    const dir = makeTmpDir("t3b");
    try {
      const decisions = getDecisionsForSprints(["NONEXISTENT-SPRINT"], dir);
      expect(decisions.by_task).toEqual({});
      expect(decisions.sprint_bucket).toEqual({});
    } finally {
      teardown(dir);
    }
  });

  it("T3-c: empty sprintIds array → empty, no throw", () => {
    const decisions = getDecisionsForSprints([], "/tmp/1978-no-such-dir-ever");
    expect(decisions.by_task).toEqual({});
    expect(decisions.sprint_bucket).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — Malformed STEP → empty string fallbacks, no throw
// ─────────────────────────────────────────────────────────────────────────────

describe("T4 — parseJournalFile: malformed STEP → fallbacks, no throw", () => {
  it("T4-a: STEP header with no body fields → all fields empty/null, no throw", () => {
    let steps: ReturnType<typeof parseJournalFile> | null = null;
    expect(() => {
      steps = parseJournalFile(STEP_MALFORMED, "BAD-SPRINT");
    }).not.toThrow();
    expect(steps).not.toBeNull();
    expect(steps!).toHaveLength(1);
    const step = steps![0]!;
    expect(step.step_id).toBe("bad-agent-S1");
    expect(step.task_id).toBeNull();
    expect(step.what_done).toBe("");
    expect(step.what_considered).toEqual([]);
    expect(step.why_decision).toBe("");
    expect(step.why_change).toBe("");
  });

  it("T4-b: empty content → empty steps array, no throw", () => {
    const steps = parseJournalFile("", "EMPTY-SPRINT");
    expect(steps).toEqual([]);
  });

  it("T4-c: content with no STEP headers → empty steps array", () => {
    const steps = parseJournalFile(
      "## Some section\n\nSome prose without any STEP blocks.",
      "NO-STEPS",
    );
    expect(steps).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — CAP-REACHED sentinel → entries before returned, entries after discarded
// ─────────────────────────────────────────────────────────────────────────────

describe("T5 — parseJournalFile: CAP-REACHED sentinel", () => {
  it("T5-a: entry before sentinel is included", () => {
    const steps = parseJournalFile(STEP_BEFORE_AND_AFTER_CAP, "TEST-SPRINT");
    const stepIds = steps.map((s) => s.step_id);
    expect(stepIds).toContain("po-S1");
  });

  it("T5-b: entry after sentinel is discarded", () => {
    const steps = parseJournalFile(STEP_BEFORE_AND_AFTER_CAP, "TEST-SPRINT");
    const stepIds = steps.map((s) => s.step_id);
    expect(stepIds).not.toContain("po-S2");
  });

  it("T5-c: total step count is 1 (only before sentinel)", () => {
    const steps = parseJournalFile(STEP_BEFORE_AND_AFTER_CAP, "TEST-SPRINT");
    expect(steps).toHaveLength(1);
  });

  it("T5-d: content after CAP-REACHED via file (integration)", () => {
    const dir = makeTmpDir("t5d");
    try {
      writeFileSync(
        resolve(dir, "sprint-TEST-SPRINT.md"),
        STEP_BEFORE_AND_AFTER_CAP,
        "utf8",
      );
      const decisions = getDecisionsForSprints(["TEST-SPRINT"], dir);
      const allSteps = [
        ...Object.values(decisions.by_task).flat(),
        ...Object.values(decisions.sprint_bucket).flat(),
      ];
      expect(allSteps).toHaveLength(1);
      expect(allSteps[0]!.what_done).toBe("Entry before sentinel.");
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — Multiple sprints → by_task merges entries from all files
// ─────────────────────────────────────────────────────────────────────────────

describe("T6 — getDecisionsForSprints: multiple sprints merged", () => {
  it("T6-a: entries from both sprint files merged into by_task / sprint_bucket", () => {
    const dir = makeTmpDir("t6a");
    try {
      // Sprint A: one step with task-id
      const sprintA = `### STEP dev-S1 · dev-mcp-server · 2026-06-05T08:00:00Z
**task-id:** ARCH-ORCH-F2
**what-done:** Implemented journalStore.
**what-considered:**
- Option A
**why-decision:** Best design.
**why-change:** None.`;

      // Sprint B: one step without task-id
      const sprintB = `### STEP qa-S1 · qa · 2026-06-05T09:00:00Z
**what-done:** QA verification.
**what-considered:**
- Manual check
**why-decision:** Passed all tests.
**why-change:** None.`;

      writeFileSync(resolve(dir, "sprint-SPRINT-A.md"), sprintA, "utf8");
      writeFileSync(resolve(dir, "sprint-SPRINT-B.md"), sprintB, "utf8");

      const decisions = getDecisionsForSprints(["SPRINT-A", "SPRINT-B"], dir);

      // by_task should have ARCH-ORCH-F2 entry from sprint A
      expect(decisions.by_task["ARCH-ORCH-F2"]).toBeDefined();
      expect(decisions.by_task["ARCH-ORCH-F2"]![0]!.sprint_id).toBe("SPRINT-A");

      // sprint_bucket should have SPRINT-B entry
      expect(decisions.sprint_bucket["SPRINT-B"]).toBeDefined();
      expect(decisions.sprint_bucket["SPRINT-B"]![0]!.step_id).toBe("qa-S1");
    } finally {
      teardown(dir);
    }
  });

  it("T6-b: duplicate sprint IDs deduplicated (file parsed once)", () => {
    const dir = makeTmpDir("t6b");
    try {
      writeFileSync(
        resolve(dir, "sprint-SPRINT-X.md"),
        STEP_WITH_TASK_ID.replace("ARCH-ORCH-F1", "TASK-X"),
        "utf8",
      );
      // Pass same sprint ID twice
      const decisions = getDecisionsForSprints(["SPRINT-X", "SPRINT-X"], dir);
      // Only 1 step should appear (dedup prevents double-parse)
      const taskXSteps = decisions.by_task["TASK-X"] ?? [];
      expect(taskXSteps).toHaveLength(1);
    } finally {
      teardown(dir);
    }
  });

  it("T6-c: task with no decisions yields absent key (no crash — F3 empty-state)", () => {
    const dir = makeTmpDir("t6c");
    try {
      // Journal exists for SPRINT-A but NONEXISTENT-TASK never appears in it
      writeFileSync(
        resolve(dir, "sprint-SPRINT-A.md"),
        STEP_WITH_TASK_ID.replace("ARCH-ORCH-F1", "ARCH-ORCH-F2"),
        "utf8",
      );
      const decisions = getDecisionsForSprints(["SPRINT-A"], dir);
      // NONEXISTENT-TASK absent from by_task — returns undefined (not empty array)
      expect(decisions.by_task["NONEXISTENT-TASK"]).toBeUndefined();
      // Accessing it doesn't throw
      const safe = decisions.by_task["NONEXISTENT-TASK"] ?? [];
      expect(safe).toHaveLength(0);
    } finally {
      teardown(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Real fixture test — parse the actual sprint-ORCH-DASH-DECISION-DRILLDOWN.md
// ─────────────────────────────────────────────────────────────────────────────

describe("Real fixture — sprint-ORCH-DASH-DECISION-DRILLDOWN.md", () => {
  const FIXTURE_DIR = resolve(
    process.cwd(),
    "docs",
    "agent-memory",
    "decisions",
  );

  it("Real-1: agent-father-S1 (ARCH-ORCH-F1) routes to by_task[ARCH-ORCH-F1]", () => {
    const decisions = getDecisionsForSprints(
      ["ORCH-DASH-DECISION-DRILLDOWN"],
      FIXTURE_DIR,
    );
    const steps = decisions.by_task["ARCH-ORCH-F1"];
    expect(steps).toBeDefined();
    expect(steps!.length).toBeGreaterThanOrEqual(1);
    const s = steps!.find((x) => x.step_id === "agent-father-S1");
    expect(s).toBeDefined();
    expect(s!.agent_id).toBe("agent-father");
  });

  it("Real-2: untagged entries (po/ba/architect/pm steps) route to sprint_bucket", () => {
    const decisions = getDecisionsForSprints(
      ["ORCH-DASH-DECISION-DRILLDOWN"],
      FIXTURE_DIR,
    );
    const bucket = decisions.sprint_bucket["ORCH-DASH-DECISION-DRILLDOWN"];
    expect(bucket).toBeDefined();
    expect(bucket!.length).toBeGreaterThanOrEqual(1);
    // po-S1 should be in the sprint bucket (no task-id)
    const poS1 = bucket!.find((s) => s.step_id === "po-S1");
    expect(poS1).toBeDefined();
  });

  it("Real-3: CRLF handling — content round-trips without errors", () => {
    // Inject CRLF endings to verify R-5 mitigation
    const content = STEP_WITH_TASK_ID.replace(/\n/g, "\r\n");
    const steps = parseJournalFile(content, "ORCH-DASH-DECISION-DRILLDOWN");
    expect(steps).toHaveLength(1);
    expect(steps[0]!.task_id).toBe("ARCH-ORCH-F1");
  });
});
