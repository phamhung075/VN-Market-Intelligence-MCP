/**
 * TASK-DASH-CRON-2-cron-recheck-table.test.ts
 *
 * Tests the pure data-layer logic behind the Cron Recheck Table section on
 * /dashboard/orchestration (dashboard.orchestration.tsx), against the ACTUAL
 * CronStatusDto contract shipped by Zone 1 (cronStatusHandler.ts /
 * cronStatusCompute.ts / layerBCronRegistry.ts, TASK-DASH-CRON-1 APPROVED).
 *
 * Coverage:
 *   - parseCronStatusDto: null → empty-shape struct (safeFetch<T> contract),
 *     valid DTO passthrough, malformed rows dropped/normalized, status enum
 *     defense (AC-5/AC-14 honesty).
 *   - cronStatusBadgeClasses / CRON_STATUS_LABELS: 6-entry lookup, Layer-B
 *     (SESSION_SCOPED) never red/amber (AC-19/NFR-7).
 *   - cronLayerLabel: Vietnamese layer copy (FR-5.2).
 *   - Never-fired display logic (AC-20).
 *
 * "Remix strips `loader` in jsdom" (see task17-alerts-loader.test.ts) — this
 * suite imports only the named pure helpers exported alongside `loader`,
 * which are NOT stripped (same pattern as fetchAlertsData/signalTypeLabel).
 */

import { describe, it, expect } from "vitest";
import {
  parseCronStatusDto,
  normalizeCronRowA,
  normalizeCronRowB,
  normalizeCronStatusA,
  normalizeCronStatusB,
  cronStatusBadgeClasses,
  cronLayerLabel,
  CRON_STATUS_LABELS,
  type CronStatus,
  type CronStatusDto,
} from "~/routes/dashboard.orchestration";

// ---------------------------------------------------------------------------
// Fixtures — mirror the ACTUAL CronStatusDto shape from cronStatusHandler.ts
// ---------------------------------------------------------------------------

const REAL_ROW_A_ON_TIME = {
  name: "morningBriefing",
  layer: "server",
  cron_expr: "0 8 * * 1-5",
  human_schedule: "weekdays 08:00 UTC",
  expected_last_fire: "2026-07-02T08:00:00.000Z",
  expected_next_fire: "2026-07-03T08:00:00.000Z",
  last_fire: "2026-07-02T08:00:03.000Z",
  last_status: "success",
  status: "ON_TIME",
  job_name_db: "morningBriefingJob",
};

const REAL_ROW_A_NEVER_FIRED = {
  name: "ohlcvDailyAggregator",
  layer: "server",
  cron_expr: "3 15 * * 1-5",
  human_schedule: "weekdays 15:03 UTC",
  expected_last_fire: "2026-07-02T15:03:00.000Z",
  expected_next_fire: "2026-07-03T15:03:00.000Z",
  last_fire: null,
  last_status: null,
  status: "NEVER_FIRED",
  job_name_db: "ohlcv-daily-aggregator",
};

const REAL_ROW_A_STALE_WITH_REASON = {
  name: "franceSummary",
  layer: "server",
  cron_expr: "0 6 * * *",
  human_schedule: "daily 06:00 UTC",
  expected_last_fire: "2026-07-02T06:00:00.000Z",
  expected_next_fire: "2026-07-03T06:00:00.000Z",
  last_fire: "2026-06-28T06:00:00.000Z",
  last_status: "success",
  status: "STALE",
  job_name_db: "franceSummaryJob",
  reason: "Lần chạy cuối: 2026-06-28T06:00:00.000Z — quá hạn 96.0h (ngưỡng: 1.5× = 36.0h).",
};

const REAL_ROW_B = {
  name: "cron-market-watcher#1",
  layer: "cli-session",
  cron_expr: "*/15 2-8 * * 1-5",
  human_schedule: "every 15 min (02:00-08:59 UTC weekdays)",
  expected_last_fire: null,
  expected_next_fire: null,
  last_fire: null,
  last_status: null,
  status: "SESSION_SCOPED",
  reason: "Session-scoped: fires only while a live CLI session is active",
};

const REAL_DTO: CronStatusDto = {
  fetched_at: "2026-07-02T09:15:00.000Z",
  layer_a_count: 3,
  layer_b_count: 1,
  layer_a: [REAL_ROW_A_ON_TIME, REAL_ROW_A_NEVER_FIRED, REAL_ROW_A_STALE_WITH_REASON] as CronStatusDto["layer_a"],
  layer_b: [REAL_ROW_B] as CronStatusDto["layer_b"],
};

// ---------------------------------------------------------------------------
// parseCronStatusDto
// ---------------------------------------------------------------------------

describe("parseCronStatusDto", () => {
  it("null (safeFetch<T> failure path) → empty-shape struct, not null (T contract)", () => {
    const result = parseCronStatusDto(null);
    expect(result).toEqual({
      fetched_at: "",
      layer_a_count: 0,
      layer_b_count: 0,
      layer_a: [],
      layer_b: [],
    });
  });

  it("throws on a non-object, non-null raw value (defends against a scalar upstream response)", () => {
    expect(() => parseCronStatusDto("not-an-object")).toThrow(/Unexpected response shape/);
  });

  it("valid DTO passes through with all rows intact", () => {
    const result = parseCronStatusDto(REAL_DTO);
    expect(result.fetched_at).toBe("2026-07-02T09:15:00.000Z");
    expect(result.layer_a).toHaveLength(3);
    expect(result.layer_b).toHaveLength(1);
  });

  it("layer_a_count / layer_b_count are derived from the actual array length, not trusted verbatim from upstream (NFR-3 spirit)", () => {
    const tampered = { ...REAL_DTO, layer_a_count: 999, layer_b_count: 999 };
    const result = parseCronStatusDto(tampered);
    expect(result.layer_a_count).toBe(3);
    expect(result.layer_b_count).toBe(1);
  });

  it("missing layer_a/layer_b arrays → empty arrays, no throw", () => {
    const result = parseCronStatusDto({ fetched_at: "2026-07-02T09:15:00.000Z" });
    expect(result.layer_a).toEqual([]);
    expect(result.layer_b).toEqual([]);
  });

  it("a malformed row without `name` is dropped, not fabricated", () => {
    const dto = {
      fetched_at: "2026-07-02T09:15:00.000Z",
      layer_a: [REAL_ROW_A_ON_TIME, { layer: "server", status: "ON_TIME" }],
      layer_b: [],
    };
    const result = parseCronStatusDto(dto);
    expect(result.layer_a).toHaveLength(1);
    expect(result.layer_a[0]!.name).toBe("morningBriefing");
  });

  it("AC-6 shape: NEVER_FIRED row has last_fire null", () => {
    const result = parseCronStatusDto(REAL_DTO);
    const neverFiredRow = result.layer_a.find((r) => r.status === "NEVER_FIRED");
    expect(neverFiredRow).toBeDefined();
    expect(neverFiredRow!.last_fire).toBeNull();
  });

  it("AC-29: reason is populated on the STALE row and absent on the ON_TIME row", () => {
    const result = parseCronStatusDto(REAL_DTO);
    const staleRow = result.layer_a.find((r) => r.status === "STALE");
    const onTimeRow = result.layer_a.find((r) => r.status === "ON_TIME");
    expect(staleRow!.reason).toContain("quá hạn");
    expect(onTimeRow!.reason).toBeUndefined();
  });

  it("AC-13/AC-15: layer_b rows carry layer=cli-session and null fire timestamps", () => {
    const result = parseCronStatusDto(REAL_DTO);
    expect(result.layer_b[0]!.layer).toBe("cli-session");
    expect(result.layer_b[0]!.last_fire).toBeNull();
    expect(result.layer_b[0]!.expected_last_fire).toBeNull();
    expect(result.layer_b[0]!.expected_next_fire).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeCronStatusA / normalizeCronStatusB — enum defense
// ---------------------------------------------------------------------------

describe("normalizeCronStatusA — AC-5 defense against malformed status", () => {
  const valid: CronStatus[] = ["ON_TIME", "LATE", "MISSED", "STALE", "NEVER_FIRED"];

  it.each(valid)("passes through a valid Layer-A status %s unchanged", (status) => {
    expect(normalizeCronStatusA(status)).toBe(status);
  });

  it("an unrecognized string status falls back to NEVER_FIRED (honest, non-red/amber)", () => {
    expect(normalizeCronStatusA("BOGUS_STATUS")).toBe("NEVER_FIRED");
  });

  it("SESSION_SCOPED is NOT a valid Layer-A status (that belongs to Layer-B only)", () => {
    expect(normalizeCronStatusA("SESSION_SCOPED")).toBe("NEVER_FIRED");
  });

  it("non-string / null status falls back to NEVER_FIRED, never throws", () => {
    expect(() => normalizeCronStatusA(null)).not.toThrow();
    expect(normalizeCronStatusA(null)).toBe("NEVER_FIRED");
    expect(normalizeCronStatusA(42)).toBe("NEVER_FIRED");
  });
});

describe("normalizeCronStatusB — AC-14/NFR-7: Layer-B NEVER red/amber, even under malformed upstream data", () => {
  it("SESSION_SCOPED passes through", () => {
    expect(normalizeCronStatusB("SESSION_SCOPED")).toBe("SESSION_SCOPED");
  });

  it("a red/amber-class value injected from a malformed upstream is forced to SESSION_SCOPED", () => {
    expect(normalizeCronStatusB("MISSED")).toBe("SESSION_SCOPED");
    expect(normalizeCronStatusB("STALE")).toBe("SESSION_SCOPED");
    expect(normalizeCronStatusB("LATE")).toBe("SESSION_SCOPED");
  });

  it("null/undefined/garbage all force SESSION_SCOPED", () => {
    expect(normalizeCronStatusB(null)).toBe("SESSION_SCOPED");
    expect(normalizeCronStatusB(undefined)).toBe("SESSION_SCOPED");
    expect(normalizeCronStatusB(123)).toBe("SESSION_SCOPED");
  });
});

// ---------------------------------------------------------------------------
// normalizeCronRowA / normalizeCronRowB
// ---------------------------------------------------------------------------

describe("normalizeCronRowA", () => {
  it("null/non-object → null (row dropped by caller)", () => {
    expect(normalizeCronRowA(null)).toBeNull();
    expect(normalizeCronRowA("string")).toBeNull();
  });

  it("row without a string `name` → null (row dropped)", () => {
    expect(normalizeCronRowA({ status: "ON_TIME" })).toBeNull();
  });

  it("job_name_db falls back to the CRONS key (`name`) when upstream omits it", () => {
    const row = normalizeCronRowA({ name: "someJob", status: "ON_TIME" });
    expect(row).not.toBeNull();
    expect(row!.job_name_db).toBe("someJob");
  });

  it("layer is always forced to \"server\" regardless of upstream input", () => {
    const row = normalizeCronRowA({ name: "x", layer: "cli-session", status: "ON_TIME" });
    expect(row!.layer).toBe("server");
  });
});

describe("normalizeCronRowB", () => {
  it("null/non-object → null (row dropped by caller)", () => {
    expect(normalizeCronRowB(null)).toBeNull();
  });

  it("row without a string `name` → null (row dropped)", () => {
    expect(normalizeCronRowB({ status: "SESSION_SCOPED" })).toBeNull();
  });

  it("layer is always forced to \"cli-session\"; fire timestamps always null", () => {
    const row = normalizeCronRowB({ name: "cron-x", layer: "server", last_fire: "2026-01-01T00:00:00Z" });
    expect(row!.layer).toBe("cli-session");
    expect(row!.last_fire).toBeNull();
    expect(row!.expected_last_fire).toBeNull();
    expect(row!.expected_next_fire).toBeNull();
  });

  it("missing reason falls back to the standard session-scoped copy", () => {
    const row = normalizeCronRowB({ name: "cron-x" });
    expect(row!.reason).toBe("Session-scoped: fires only while a live CLI session is active");
  });
});

// ---------------------------------------------------------------------------
// cronStatusBadgeClasses / CRON_STATUS_LABELS — FR-5.3
// ---------------------------------------------------------------------------

describe("CRON_STATUS_LABELS — FR-5.3 Vietnamese copy, 6-entry closed set", () => {
  it("has exactly the 6 documented status keys", () => {
    expect(Object.keys(CRON_STATUS_LABELS).sort()).toEqual(
      ["LATE", "MISSED", "NEVER_FIRED", "ON_TIME", "SESSION_SCOPED", "STALE"].sort(),
    );
  });

  it("maps each status to the exact BA-specified Vietnamese label", () => {
    expect(CRON_STATUS_LABELS.ON_TIME).toBe("Đúng giờ");
    expect(CRON_STATUS_LABELS.LATE).toBe("Trễ nhẹ");
    expect(CRON_STATUS_LABELS.MISSED).toBe("Bỏ lỡ");
    expect(CRON_STATUS_LABELS.STALE).toBe("Quá hạn");
    expect(CRON_STATUS_LABELS.NEVER_FIRED).toBe("Chưa từng chạy");
    expect(CRON_STATUS_LABELS.SESSION_SCOPED).toBe("Phiên làm việc");
  });

  it("no English jargon leaks into any label (AC-28 spot check — no raw enum tokens as display text)", () => {
    Object.values(CRON_STATUS_LABELS).forEach((label) => {
      expect(label).not.toMatch(/^[A-Z_]+$/); // would catch e.g. "ON_TIME" used verbatim as a label
    });
  });
});

describe("cronStatusBadgeClasses — AC-19/NFR-7: Layer-B (SESSION_SCOPED) is blue, never red/amber", () => {
  it("ON_TIME → green classes", () => {
    expect(cronStatusBadgeClasses("ON_TIME")).toContain("green");
  });

  it("LATE → amber classes", () => {
    expect(cronStatusBadgeClasses("LATE")).toContain("amber");
  });

  it("MISSED → red classes", () => {
    expect(cronStatusBadgeClasses("MISSED")).toContain("red");
  });

  it("STALE → red classes (darker variant)", () => {
    expect(cronStatusBadgeClasses("STALE")).toContain("red");
  });

  it("NEVER_FIRED → grey/slate classes (not red, not amber)", () => {
    const classes = cronStatusBadgeClasses("NEVER_FIRED");
    expect(classes).toContain("slate");
    expect(classes).not.toMatch(/red|amber/);
  });

  it("SESSION_SCOPED → blue classes, NEVER red/amber", () => {
    const classes = cronStatusBadgeClasses("SESSION_SCOPED");
    expect(classes).toContain("blue");
    expect(classes).not.toMatch(/red|amber/);
  });
});

// ---------------------------------------------------------------------------
// cronLayerLabel — FR-5.2
// ---------------------------------------------------------------------------

describe("cronLayerLabel — FR-5.2 Vietnamese layer copy", () => {
  it('"server" → "Server"', () => {
    expect(cronLayerLabel("server")).toBe("Server");
  });

  it('"cli-session" → "Phiên làm việc"', () => {
    expect(cronLayerLabel("cli-session")).toBe("Phiên làm việc");
  });
});

// ---------------------------------------------------------------------------
// Never-fired display logic (AC-20) — mirrors the component's ternary
// ---------------------------------------------------------------------------

describe("Never-fired display logic (AC-20) — mirrors CronLayerTable's ternary", () => {
  function lastFireDisplayIsNeverFiredText(lastFire: string | null): boolean {
    return lastFire == null;
  }

  it("last_fire null → renders the never-fired text branch", () => {
    expect(lastFireDisplayIsNeverFiredText(null)).toBe(true);
  });

  it("last_fire non-null → renders the timestamp branch, not the never-fired text", () => {
    expect(lastFireDisplayIsNeverFiredText("2026-07-02T08:00:00.000Z")).toBe(false);
  });
});
