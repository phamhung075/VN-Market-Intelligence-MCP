// apps/mcp-server/src/__tests__/1328g-suppression-log.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import {
  logPolicySuppression,
  logSignalRejection,
} from "../infrastructure/db/signalRejectionStore.js";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  initNewsTables(db);
});

afterEach(() => {
  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — record written with correct signal_type
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1328g — logPolicySuppression: record written with correct signal_type", () => {
  it("inserts a row with signal_type='policy_suppressed'", () => {
    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "VNM",
      rule: "position_danger_3and",
      failed_conditions: ["stopLossHit=false"],
    });

    const row = db
      .query("SELECT * FROM signal_rejections WHERE signal_type = 'policy_suppressed'")
      .get() as { signal_type: string; from_agent: string; stock_code: string | null; reason: string } | null;

    expect(row).not.toBeNull();
    expect(row!.signal_type).toBe("policy_suppressed");
  });

  it("stores from_agent correctly", () => {
    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "HPG",
      rule: "watchlist_opportunity_4and",
      failed_conditions: ["kinhDichSignal=NEUTRAL (expected=BUY)"],
    });

    const row = db
      .query("SELECT from_agent FROM signal_rejections WHERE signal_type = 'policy_suppressed'")
      .get() as { from_agent: string } | null;

    expect(row!.from_agent).toBe("alert-commander");
  });

  it("stores stock_code correctly when provided", () => {
    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "TCB",
      rule: "position_danger_3and",
      failed_conditions: ["singleDayDropPct=3.2 (threshold=5)"],
    });

    const row = db
      .query("SELECT stock_code FROM signal_rejections WHERE signal_type = 'policy_suppressed'")
      .get() as { stock_code: string | null } | null;

    expect(row!.stock_code).toBe("TCB");
  });

  it("stores stock_code as NULL when not provided", () => {
    logPolicySuppression(db, {
      from_agent: "alert-commander",
      rule: "position_danger_3and",
      failed_conditions: ["stopLossHit=false"],
    });

    const row = db
      .query("SELECT stock_code FROM signal_rejections WHERE signal_type = 'policy_suppressed'")
      .get() as { stock_code: string | null } | null;

    expect(row!.stock_code).toBeNull();
  });

  it("reason column is valid JSON array matching failed_conditions", () => {
    const failedConditions = [
      "stopLossHit=false",
      "singleDayDropPct=2.0 (threshold=5)",
      "newsSentiment=0.10 (threshold=-0.5)",
    ];

    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "VNM",
      rule: "position_danger_3and",
      failed_conditions: failedConditions,
    });

    const row = db
      .query("SELECT reason FROM signal_rejections WHERE signal_type = 'policy_suppressed'")
      .get() as { reason: string } | null;

    expect(row).not.toBeNull();
    const parsed = JSON.parse(row!.reason);
    expect(parsed).toEqual(failedConditions);
  });

  it("stores payload_preview when provided", () => {
    const preview = JSON.stringify({ stopLossHit: false }).slice(0, 200);

    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "VNM",
      rule: "position_danger_3and",
      failed_conditions: ["stopLossHit=false"],
      payload_preview: preview,
    });

    const row = db
      .query("SELECT payload_preview FROM signal_rejections WHERE signal_type = 'policy_suppressed'")
      .get() as { payload_preview: string | null } | null;

    expect(row!.payload_preview).toBe(preview);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — query by signal_type="policy_suppressed" returns only policy records
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1328g — query by signal_type='policy_suppressed' returns only policy records", () => {
  it("returns only policy_suppressed rows, not validation rejections", () => {
    // Insert a regular validation rejection
    logSignalRejection(db, {
      from_agent: "news-scout",
      signal_type: "chain_catalyst",
      stock_code: "VNM",
      reason: "missing required field: title",
      payload_preview: "{}",
    });

    // Insert two policy suppressions
    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "HPG",
      rule: "position_danger_3and",
      failed_conditions: ["stopLossHit=false"],
    });

    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "TCB",
      rule: "watchlist_opportunity_4and",
      failed_conditions: ["kinhDichSignal=NEUTRAL (expected=BUY)", "agentSignalsMajority=SELL (expected=BUY)"],
    });

    const policyRows = db
      .query("SELECT * FROM signal_rejections WHERE signal_type = 'policy_suppressed'")
      .all() as { signal_type: string; stock_code: string | null }[];

    expect(policyRows).toHaveLength(2);
    expect(policyRows.every((r) => r.signal_type === "policy_suppressed")).toBe(true);
  });

  it("multiple calls produce multiple rows — no dedup (audit log semantics)", () => {
    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "VNM",
      rule: "position_danger_3and",
      failed_conditions: ["stopLossHit=false"],
    });

    logPolicySuppression(db, {
      from_agent: "alert-commander",
      stock_code: "VNM",
      rule: "position_danger_3and",
      failed_conditions: ["stopLossHit=false"],
    });

    const rows = db
      .query("SELECT * FROM signal_rejections WHERE signal_type = 'policy_suppressed'")
      .all();

    expect(rows).toHaveLength(2);
  });

  it("total signal_rejections count includes both validation and policy rows", () => {
    logSignalRejection(db, {
      from_agent: "news-scout",
      signal_type: "chain_catalyst",
      reason: "validation error",
      payload_preview: "{}",
    });

    logPolicySuppression(db, {
      from_agent: "alert-commander",
      rule: "position_danger_3and",
      failed_conditions: ["stopLossHit=false"],
    });

    const total = (db.query("SELECT COUNT(*) as n FROM signal_rejections").get() as { n: number }).n;
    expect(total).toBe(2);
  });
});
