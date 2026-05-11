/**
 * Task 1863d — Unit tests for write_alert_verdict MCP tool
 *
 * 5 scenarios per AC 1863e:
 *   (a) happy path with valid payload
 *   (b) missing ticker rejected by Zod
 *   (c) bad direction enum value rejected
 *   (d) conviction > 1 rejected
 *   (e) underlying store throws → tool propagates error gracefully
 */

import { describe, it, expect, mock } from "bun:test";

import {
  writeAlertVerdict,
  WRITE_ALERT_VERDICT_SCHEMA,
} from "../interface/mcp/tools/alerts/alertVerdictTools.js";
import type { AlertVerdict } from "../infrastructure/fileStore/alertVerdictStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_INPUT = {
  ticker: "VCB",
  direction: "bullish" as const,
  conviction: 0.85,
  alertSource: "verified_chain" as const,
  firedAt: "2026-05-10T08:00:00.000Z",
};

function makeFakeStore(failWith?: Error) {
  const appended: AlertVerdict[] = [];
  return {
    appended,
    appendOne: mock(async (v: AlertVerdict) => {
      if (failWith) throw failWith;
      appended.push(v);
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — exactly 5 scenarios per AC
// ─────────────────────────────────────────────────────────────────────────────

describe("write_alert_verdict — 1863d unit tests", () => {
  // (a) Happy path with valid payload
  it("(a) happy path: writes row + returns correct shape", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(VALID_INPUT, { store });

    expect(result.success).toBe(true);
    expect(typeof result.id).toBe("string");
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.ticker).toBe("VCB");
    expect(result.verdict).toBe("pending");

    expect(store.appended).toHaveLength(1);
    const row = store.appended[0]!;
    expect(row.id).toBe(result.id);
    expect(row.ticker).toBe("VCB");
    expect(row.direction).toBe("bullish");
    expect(row.conviction).toBe(0.85);
    expect(row.alertSource).toBe("verified_chain");
    expect(row.firedAt).toBe("2026-05-10T08:00:00.000Z");
    expect(row.verdict).toBe("pending");
    expect(row.resolvedAt).toBeNull();
    expect(row.priceAtFire).toBeNull();
    expect(row.priceAtResolution).toBeNull();
    expect(row.pctMove).toBeNull();
    expect(row.detail).toBeNull();
  });

  // (b) Missing ticker rejected by Zod
  it("(b) missing ticker rejected by Zod", () => {
    const { ticker: _t, ...noTicker } = VALID_INPUT;
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse(noTicker);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain("ticker");
  });

  // (c) Bad direction enum value rejected
  it("(c) bad direction enum value rejected", () => {
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse({
      ...VALID_INPUT,
      direction: "sideways",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain("direction");
  });

  // (d) Conviction > 1 rejected
  it("(d) conviction > 1 rejected by Zod", () => {
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse({
      ...VALID_INPUT,
      conviction: 1.5,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain("conviction");
  });

  // (e) Underlying store throws → tool propagates error gracefully
  it("(e) store append throws → error propagates", async () => {
    const boom = new Error("disk full");
    const store = makeFakeStore(boom);
    await expect(writeAlertVerdict(VALID_INPUT, { store })).rejects.toThrow("disk full");
  });
});
