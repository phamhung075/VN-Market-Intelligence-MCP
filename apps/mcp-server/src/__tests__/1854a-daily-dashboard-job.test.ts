/**
 * Task 1854a — Daily Dashboard Aggregation Job
 *
 * Tests for aggregateDailyDashboard() which reads:
 *   - docs/agent-memory/sessions/YYYY-MM-DD-*.md  (session log files)
 *   - docs/data/project-stats.json                (project stats)
 * and produces a structured DailyDashboard object.
 *
 * All I/O is injected — no real filesystem access in unit tests.
 */
import { describe, it, expect } from "bun:test";
import {
  aggregateDailyDashboard,
  parseSessionLogs,
  parseTaskCounts,
  type DailyDashboard,
  type ProjectStats,
  type SessionLogEntry,
} from "../scheduler/system/dailyDashboardJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_STATS: ProjectStats = {
  lastUpdated: "2026-05-07",
  currentSprint: 1854,
  totalTasksDone: 520,
  toolCount: 128,
  schedulerFileCount: 50,
  testBaseline: 8804,
  testBaselinePass: 8804,
  testBaselineFail: 1,
  infrastructureStatus: {
    mcpServerHealth: "UP",
    lastUpdated: "2026-05-07T10:00:00Z",
    connectionStatus: "OK",
  },
};

const SAMPLE_SESSION_FILES: Record<string, string> = {
  "2026-05-07-market-watcher.md": `# Market Watcher Session\n## Cycle 20:39 UTC\n**STATUS:** SUCCESS\n`,
  "2026-05-07-news-scout.md": `# News Scout\n**STATUS:** BLOCKED\n`,
  "2026-05-07-developer.md": `# Developer Session\n**STATUS:** SUCCESS\n`,
};

const TASKS_MD = `
# TASKS

## Done
- [x] 1854a SPRINT-M: daily dashboard job
- [x] 1853b: fix TA scan

## In Progress
- [ ] 1855a: MCP gateway health check

## Backlog
- [ ] 1856a: some future task
- [ ] 1857a: another future task
`;

// ─────────────────────────────────────────────────────────────────────────────
// parseSessionLogs
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854a — parseSessionLogs", () => {
  it("extracts agent id and success/blocked status from session file names and content", () => {
    const entries = parseSessionLogs(SAMPLE_SESSION_FILES, "2026-05-07");
    expect(entries).toHaveLength(3);

    const watcher = entries.find((e) => e.agent === "market-watcher");
    expect(watcher).toBeDefined();
    expect(watcher?.status).toBe("success");

    const scout = entries.find((e) => e.agent === "news-scout");
    expect(scout?.status).toBe("blocked");

    const dev = entries.find((e) => e.agent === "developer");
    expect(dev?.status).toBe("success");
  });

  it("returns empty array when no session files match the date", () => {
    const entries = parseSessionLogs(SAMPLE_SESSION_FILES, "2026-05-06");
    expect(entries).toHaveLength(0);
  });

  it("handles empty file map", () => {
    const entries = parseSessionLogs({}, "2026-05-07");
    expect(entries).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTaskCounts
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854a — parseTaskCounts", () => {
  it("counts done, inProgress, backlog tasks from TASKS.md content", () => {
    const counts = parseTaskCounts(TASKS_MD);
    expect(counts.done).toBe(2);
    expect(counts.inProgress).toBe(1);
    expect(counts.backlog).toBe(2);
  });

  it("returns zeros when content is empty", () => {
    const counts = parseTaskCounts("");
    expect(counts.done).toBe(0);
    expect(counts.inProgress).toBe(0);
    expect(counts.backlog).toBe(0);
  });

  it("does not double-count checked items as backlog", () => {
    const counts = parseTaskCounts("- [x] done\n- [ ] open\n");
    expect(counts.done).toBe(1);
    expect(counts.inProgress).toBe(0);
    expect(counts.backlog).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateDailyDashboard
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854a — aggregateDailyDashboard", () => {
  it("produces a DailyDashboard with all required fields", () => {
    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles: SAMPLE_SESSION_FILES,
      tasksMd: TASKS_MD,
    });

    expect(dashboard.date).toBe("2026-05-07");
    expect(dashboard.sprint).toBe(1854);
    expect(dashboard.tasks.done).toBe(2);
    expect(dashboard.tasks.inProgress).toBe(1);
    expect(dashboard.tasks.backlog).toBe(2);
    expect(dashboard.system.toolCount).toBe(128);
    expect(dashboard.system.testPass).toBe(8804);
    expect(dashboard.system.testFail).toBe(1);
    expect(dashboard.system.mcpServerHealth).toBe("UP");
    expect(dashboard.sessions).toHaveLength(3);
    expect(dashboard.sessions.filter((s: SessionLogEntry) => s.status === "success")).toHaveLength(2);
    expect(dashboard.sessions.filter((s: SessionLogEntry) => s.status === "blocked")).toHaveLength(1);
    expect(typeof dashboard.generatedAt).toBe("string");
  });

  it("handles missing optional fields in stats gracefully", () => {
    const sparseStats: ProjectStats = {
      lastUpdated: "2026-05-07",
      currentSprint: 1854,
      totalTasksDone: 0,
      toolCount: 0,
      schedulerFileCount: 0,
      testBaseline: 0,
      testBaselinePass: 0,
      testBaselineFail: 0,
    };

    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: sparseStats,
      sessionFiles: {},
      tasksMd: "",
    });

    expect(dashboard.system.mcpServerHealth).toBe("UNKNOWN");
    expect(dashboard.sessions).toHaveLength(0);
  });

  it("sets generatedAt to an ISO timestamp string", () => {
    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles: {},
      tasksMd: "",
    });

    expect(dashboard.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
