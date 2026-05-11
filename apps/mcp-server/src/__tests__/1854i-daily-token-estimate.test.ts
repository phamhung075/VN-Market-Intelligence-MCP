/**
 * Task 1854i — TRACK: Token aggregate
 *
 * Tests for sumSessionTokens() and daily_token_estimate field in DailyDashboard.
 *
 * Session log format: cycle blocks contain "estimated_tokens: N" lines
 * (written by session log writer per Task 1854h, step_count x 500).
 */
import { describe, it, expect } from "bun:test";
import {
  sumSessionTokens,
  aggregateDailyDashboard,
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

/** Session log with two cycles each having estimated_tokens. */
const LOG_WITH_TOKENS = `
# Developer Session — 2026-05-07

### Cycle (09:00–09:05)

**STATUS:** SUCCESS
- step_count: 12
- estimated_tokens: 6000

### Cycle (14:00–14:10)

**STATUS:** SUCCESS
- step_count: 8
- estimated_tokens: 4000
`;

/** Session log with one cycle having estimated_tokens. */
const LOG_WITH_ONE_TOKEN = `
# Market Watcher — 2026-05-07

## Cycle 20:39 UTC

**STATUS:** SUCCESS
- estimated_tokens: 3500
`;

/** Session log with no estimated_tokens lines. */
const LOG_NO_TOKENS = `
# News Scout — 2026-05-07

## Cycle 12:00 UTC

**STATUS:** SUCCESS
- Anomalies: 0
`;

/** Session log with estimated_tokens: 0 (should count as 0, not skip). */
const LOG_ZERO_TOKENS = `
# Alert Commander — 2026-05-07

## Cycle 23:00 UTC

**STATUS:** SUCCESS
- estimated_tokens: 0
`;

// ─────────────────────────────────────────────────────────────────────────────
// sumSessionTokens — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854i — sumSessionTokens", () => {
  it("sums estimated_tokens from multiple cycles in one log", () => {
    const total = sumSessionTokens({ "2026-05-07-developer.md": LOG_WITH_TOKENS }, "2026-05-07");
    expect(total).toBe(10000);
  });

  it("sums estimated_tokens across multiple agent files", () => {
    const total = sumSessionTokens(
      {
        "2026-05-07-developer.md": LOG_WITH_TOKENS,
        "2026-05-07-market-watcher.md": LOG_WITH_ONE_TOKEN,
      },
      "2026-05-07",
    );
    expect(total).toBe(13500);
  });

  it("returns 0 when no estimated_tokens lines present", () => {
    const total = sumSessionTokens({ "2026-05-07-news-scout.md": LOG_NO_TOKENS }, "2026-05-07");
    expect(total).toBe(0);
  });

  it("counts estimated_tokens: 0 as zero (not skipped)", () => {
    const total = sumSessionTokens(
      { "2026-05-07-alert-commander.md": LOG_ZERO_TOKENS },
      "2026-05-07",
    );
    expect(total).toBe(0);
  });

  it("returns 0 for empty file map", () => {
    const total = sumSessionTokens({}, "2026-05-07");
    expect(total).toBe(0);
  });

  it("ignores files from a different date", () => {
    const total = sumSessionTokens(
      { "2026-05-06-developer.md": LOG_WITH_TOKENS },
      "2026-05-07",
    );
    expect(total).toBe(0);
  });

  it("handles multiple estimated_tokens lines in mixed logs", () => {
    const total = sumSessionTokens(
      {
        "2026-05-07-developer.md": LOG_WITH_TOKENS,     // 6000 + 4000
        "2026-05-07-market-watcher.md": LOG_WITH_ONE_TOKEN, // 3500
        "2026-05-07-news-scout.md": LOG_NO_TOKENS,         // 0
        "2026-05-07-alert-commander.md": LOG_ZERO_TOKENS,  // 0
      },
      "2026-05-07",
    );
    expect(total).toBe(13500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateDailyDashboard — daily_token_estimate field
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854i — aggregateDailyDashboard daily_token_estimate", () => {
  it("includes daily_token_estimate summed from all session logs", () => {
    const sessionFiles = {
      "2026-05-07-developer.md": LOG_WITH_TOKENS,
      "2026-05-07-market-watcher.md": LOG_WITH_ONE_TOKEN,
    };

    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles,
      tasksMd: "",
    });

    expect(dashboard.daily_token_estimate).toBe(13500);
  });

  it("sets daily_token_estimate to 0 when no session logs have tokens", () => {
    const sessionFiles = {
      "2026-05-07-news-scout.md": LOG_NO_TOKENS,
    };

    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles,
      tasksMd: "",
    });

    expect(dashboard.daily_token_estimate).toBe(0);
  });

  it("sets daily_token_estimate to 0 when no session files", () => {
    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles: {},
      tasksMd: "",
    });

    expect(dashboard.daily_token_estimate).toBe(0);
  });
});
