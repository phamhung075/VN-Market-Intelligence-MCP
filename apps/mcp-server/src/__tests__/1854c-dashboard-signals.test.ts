/**
 * Task 1854c — Daily Dashboard: signals{} block
 *
 * Tests for:
 *   - computeSignalMetrics() — pure aggregation of signal effectiveness rows
 *   - aggregateDailyDashboard() — signals block present in output
 *
 * No real DB access. All data injected via DashboardAggregateInput.signalData.
 */
import { describe, it, expect } from "bun:test";
import {
  computeSignalMetrics,
  aggregateDailyDashboard,
  type SignalMetrics,
  type DashboardSignalData,
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
};

/** Two groups: news-scout (precision 0.75) and market-watcher (precision 0.5) */
const SAMPLE_EFFECTIVENESS = [
  {
    fromAgent: "news-scout",
    signalType: "urgent_news",
    total: 8,
    fired: 6,
    confirmed: 6,
    false_positive: 2,
    precision: 0.75,
  },
  {
    fromAgent: "market-watcher",
    signalType: "price_anomaly",
    total: 4,
    fired: 4,
    confirmed: 2,
    false_positive: 2,
    precision: 0.5,
  },
];

/** Alert accuracy: 10 total, 7 hits, 2 misses, 1 unknown */
const SAMPLE_ALERT_ACCURACY = {
  total: 10,
  hits: 7,
  misses: 2,
  unknowns: 1,
  text: "Độ chính xác tín hiệu (7 ngày)",
  summary_by_type: {},
  scored_pct: 80,
};

// ─────────────────────────────────────────────────────────────────────────────
// computeSignalMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854c — computeSignalMetrics", () => {
  it("computes hit_rate_7d from alert accuracy data", () => {
    const metrics = computeSignalMetrics({
      effectiveness: SAMPLE_EFFECTIVENESS,
      alertAccuracy: SAMPLE_ALERT_ACCURACY,
    });
    // hit_rate_7d = hits / (hits + misses) = 7 / 9 ≈ 0.778 → rounded to 2dp
    expect(metrics.hit_rate_7d).toBeCloseTo(0.78, 1);
  });

  it("computes false_positive_7d as ratio of false positives to total scored", () => {
    const metrics = computeSignalMetrics({
      effectiveness: SAMPLE_EFFECTIVENESS,
      alertAccuracy: SAMPLE_ALERT_ACCURACY,
    });
    // total false_positive = 2 + 2 = 4; total confirmed+fp = 6+2 + 2+2 = 12
    // false_positive_7d = 4 / 12 ≈ 0.333
    expect(metrics.false_positive_7d).toBeCloseTo(0.33, 1);
  });

  it("computes cascade_accuracy as mean precision across all groups", () => {
    const metrics = computeSignalMetrics({
      effectiveness: SAMPLE_EFFECTIVENESS,
      alertAccuracy: SAMPLE_ALERT_ACCURACY,
    });
    // mean of [0.75, 0.5] = 0.625
    expect(metrics.cascade_accuracy).toBeCloseTo(0.63, 1);
  });

  it("returns null for cascade_accuracy when no effectiveness rows present", () => {
    const metrics = computeSignalMetrics({
      effectiveness: [],
      alertAccuracy: SAMPLE_ALERT_ACCURACY,
    });
    expect(metrics.cascade_accuracy).toBeNull();
  });

  it("returns null for hit_rate_7d when no scoreable alerts", () => {
    const metrics = computeSignalMetrics({
      effectiveness: [],
      alertAccuracy: { ...SAMPLE_ALERT_ACCURACY, hits: 0, misses: 0, unknowns: 0, total: 0 },
    });
    expect(metrics.hit_rate_7d).toBeNull();
  });

  it("excludes groups with null precision from cascade_accuracy average", () => {
    const withNull = [
      ...SAMPLE_EFFECTIVENESS,
      { fromAgent: "x", signalType: "y", total: 1, fired: 1, confirmed: 0, false_positive: 0, precision: null },
    ];
    const metrics = computeSignalMetrics({
      effectiveness: withNull,
      alertAccuracy: SAMPLE_ALERT_ACCURACY,
    });
    // still 0.625 — null precision row excluded
    expect(metrics.cascade_accuracy).toBeCloseTo(0.63, 1);
  });

  it("includes total_signals_7d as sum of all effectiveness totals", () => {
    const metrics = computeSignalMetrics({
      effectiveness: SAMPLE_EFFECTIVENESS,
      alertAccuracy: SAMPLE_ALERT_ACCURACY,
    });
    expect(metrics.total_signals_7d).toBe(12); // 8 + 4
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateDailyDashboard — signals block
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1854c — aggregateDailyDashboard signals block", () => {
  it("includes signals block in output when signalData provided", () => {
    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles: {},
      tasksMd: "",
      signalData: {
        effectiveness: SAMPLE_EFFECTIVENESS,
        alertAccuracy: SAMPLE_ALERT_ACCURACY,
      },
    });

    expect(dashboard.signals).toBeDefined();
    expect(typeof dashboard.signals!.hit_rate_7d).toBe("number");
    expect(typeof dashboard.signals!.false_positive_7d).toBe("number");
    expect(dashboard.signals!.total_signals_7d).toBe(12);
  });

  it("sets signals to null when signalData not provided", () => {
    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles: {},
      tasksMd: "",
    });

    expect(dashboard.signals).toBeNull();
  });

  it("sets signals to null when signalData has empty arrays and zero counts", () => {
    const dashboard = aggregateDailyDashboard({
      date: "2026-05-07",
      stats: SAMPLE_STATS,
      sessionFiles: {},
      tasksMd: "",
      signalData: {
        effectiveness: [],
        alertAccuracy: { total: 0, hits: 0, misses: 0, unknowns: 0, text: "", summary_by_type: {}, scored_pct: 0 },
      },
    });

    expect(dashboard.signals).toBeDefined();
    expect(dashboard.signals!.hit_rate_7d).toBeNull();
    expect(dashboard.signals!.cascade_accuracy).toBeNull();
  });
});
