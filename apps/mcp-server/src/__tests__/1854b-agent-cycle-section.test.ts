/**
 * Task 1854b — DASH: Agent cycle section
 *
 * Tests for parseAgentCycles() and aggregateDailyDashboard() agents{} block.
 *
 * Session log format handled:
 *   - "### Cycle (HH:MM–HH:MM)" blocks (strict cycle format)
 *   - "## Cycle HH:MM UTC" section headers (loose cycle format)
 *   - STATUS lines: "**STATUS:** SUCCESS", "**STATUS:** BLOCKED", etc.
 *   - Anomaly lines: "Anomalies Detected: N", "anomalies: N"
 *   - Duration lines: "Duration: ~N min", "Execution time: ~Nms"
 */
import { describe, it, expect } from "bun:test";
import {
  parseAgentCycles,
  aggregateDailyDashboard,
  type AgentCycleSummary,
  type ProjectStats,
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

/** Simulates a market-watcher log with mixed cycles (some BLOCKED, some SUCCESS). */
const MARKET_WATCHER_LOG = `
# Market Watcher Session — 2026-05-07

## Cycle 15:38 UTC

**STATUS:** BLOCKED

**Error:** MCP gateway unavailable

---

## Cycle 20:39 UTC — Off-Hours Run ✅ COMPLETED

**STATUS:** SUCCESS

- Anomalies: 2 | Volume spikes: 1 | Chain confirms: 0
- Execution time: ~250ms

---

## Cycle 23:38 UTC — Off-Hours Run ✅ COMPLETED

**STATUS:** SUCCESS

- Anomalies: 0
- Execution time: ~500ms
`;

/** Simulates a news-scout log with named cycle headers + duration metadata. */
const NEWS_SCOUT_LOG = `
# News Scout Session Log — 2026-05-07

## Cycle Bootstrap (11:20 UTC)

**Status**: Blocked at Step 0
Exit Code: BLOCKED

---

## Cycle 2: 12:15 UTC ✅ SUCCESS

**STATUS:** SUCCESS

- **Signals Fired**: 4
- **Duration**: ~2 min

---

## Cycle 3: 13:20 UTC ✅ SUCCESS

**STATUS:** SUCCESS

- **Duration**: ~1 min
- Anomalies Detected: 1
`;

/** Agent with all cycles successful and no anomaly lines. */
const CLEAN_AGENT_LOG = `
# Developer Session — 2026-05-07

### Cycle (09:00–09:05)

**STATUS:** SUCCESS

### Cycle (14:00–14:10)

**STATUS:** SUCCESS
`;

/** Agent with no recognisable cycle headers. */
const NO_CYCLE_LOG = `
# Alert Commander — 2026-05-07

Some text with no cycle blocks.
`;

// ─────────────────────────────────────────────────────────────────────────────
// parseAgentCycles — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854b — parseAgentCycles", () => {
  it("counts total cycles, blocked cycles, success cycles", () => {
    const summary = parseAgentCycles(MARKET_WATCHER_LOG);
    expect(summary.cycleCount).toBe(3);
    expect(summary.blockedCount).toBe(1);
  });

  it("sums anomaly counts across cycles", () => {
    const summary = parseAgentCycles(MARKET_WATCHER_LOG);
    // Cycle 20:39 has "Anomalies: 2", cycle 23:38 has "Anomalies: 0"
    expect(summary.anomalyCount).toBe(2);
  });

  it("extracts anomaly counts from news-scout format", () => {
    const summary = parseAgentCycles(NEWS_SCOUT_LOG);
    // Cycle 3 has "Anomalies Detected: 1"
    expect(summary.anomalyCount).toBe(1);
  });

  it("counts blocked cycles in news-scout format", () => {
    const summary = parseAgentCycles(NEWS_SCOUT_LOG);
    expect(summary.cycleCount).toBe(3);
    expect(summary.blockedCount).toBe(1);
  });

  it("handles agent with all success cycles and no anomalies", () => {
    const summary = parseAgentCycles(CLEAN_AGENT_LOG);
    expect(summary.cycleCount).toBe(2);
    expect(summary.blockedCount).toBe(0);
    expect(summary.anomalyCount).toBe(0);
  });

  it("returns zeroed summary for log with no cycle headers", () => {
    const summary = parseAgentCycles(NO_CYCLE_LOG);
    expect(summary.cycleCount).toBe(0);
    expect(summary.blockedCount).toBe(0);
    expect(summary.anomalyCount).toBe(0);
  });

  it("returns zeroed summary for empty string", () => {
    const summary = parseAgentCycles("");
    expect(summary.cycleCount).toBe(0);
    expect(summary.blockedCount).toBe(0);
    expect(summary.anomalyCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateDailyDashboard — agents{} block
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854b — aggregateDailyDashboard agents block", () => {
  it("includes agents block keyed by agent id", () => {
    const sessionFiles = {
      "2026-05-07-market-watcher.md": MARKET_WATCHER_LOG,
      "2026-05-07-news-scout.md": NEWS_SCOUT_LOG,
    };

    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles,
      tasksMd: "",
    });

    expect(dashboard.agents).toBeDefined();
    expect(typeof dashboard.agents).toBe("object");
    expect(dashboard.agents["market-watcher"]).toBeDefined();
    expect(dashboard.agents["news-scout"]).toBeDefined();
  });

  it("populates cycle metrics correctly per agent", () => {
    const sessionFiles = {
      "2026-05-07-market-watcher.md": MARKET_WATCHER_LOG,
    };

    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles,
      tasksMd: "",
    });

    const watcher = dashboard.agents["market-watcher"];
    expect(watcher).toBeDefined();
    expect(watcher!.cycleCount).toBe(3);
    expect(watcher!.blockedCount).toBe(1);
    expect(watcher!.anomalyCount).toBe(2);
  });

  it("produces empty agents object when no session files match", () => {
    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles: {},
      tasksMd: "",
    });

    expect(dashboard.agents).toBeDefined();
    expect(Object.keys(dashboard.agents)).toHaveLength(0);
  });

  it("does not include files from a different date in agents block", () => {
    const sessionFiles = {
      "2026-05-06-market-watcher.md": MARKET_WATCHER_LOG,
    };

    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles,
      tasksMd: "",
    });

    expect(Object.keys(dashboard.agents)).toHaveLength(0);
  });
});
