/**
 * Sprint c220 — legal_risk alertSource round-trip integration test
 *
 * Regression for Telegram report 2954 (alert-commander 2026-05-20T04:39Z):
 * write_alert_verdict rejected payloads with alertSource='legal_risk'.
 * Sprint 1948e-A+B shipped the legal-risk signal type; the Zod enum was not updated.
 *
 * AC covered:
 *   (1) WRITE_ALERT_VERDICT_SCHEMA accepts alertSource='legal_risk'
 *   (2) writeAlertVerdict writes a row with alertSource='legal_risk' and verdict='pending'
 *   (3) written row can be read back with correct alertSource value
 *   (4) 'position_danger' still accepted (no regression)
 *   (5) unknown alertSource value is still rejected by Zod
 */

import { describe, it, expect } from "bun:test";

import {
  writeAlertVerdict,
  WRITE_ALERT_VERDICT_SCHEMA,
} from "../interface/mcp/tools/alerts/alertVerdictTools.js";
import type { AlertVerdict } from "../infrastructure/fileStore/alertVerdictStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fake store — simulates appendOne + readback without disk I/O
// ─────────────────────────────────────────────────────────────────────────────

function makeFakeStore() {
  const rows: AlertVerdict[] = [];
  return {
    rows,
    appendOne: async (v: AlertVerdict) => {
      rows.push(v);
    },
  };
}

const BASE_INPUT = {
  ticker: "VPB",
  direction: "bearish" as const,
  conviction: 0.75,
  firedAt: "2026-05-20T04:39:00.000Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("c220 — legal_risk alertSource round-trip", () => {
  // AC-1: Zod schema accepts 'legal_risk'
  it("(1) WRITE_ALERT_VERDICT_SCHEMA accepts alertSource='legal_risk'", () => {
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse({
      ...BASE_INPUT,
      alertSource: "legal_risk",
    });
    expect(result.success).toBe(true);
  });

  // AC-2: writeAlertVerdict writes a row with alertSource='legal_risk' and verdict='pending'
  it("(2) writeAlertVerdict writes legal_risk row with verdict=pending", async () => {
    const store = makeFakeStore();
    const input = {
      ...BASE_INPUT,
      alertSource: "legal_risk" as const,
    };
    const result = await writeAlertVerdict(input, { store });

    expect(result.success).toBe(true);
    expect(result.verdict).toBe("pending");
    expect(result.ticker).toBe("VPB");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.alertSource).toBe("legal_risk");
    expect(store.rows[0]!.verdict).toBe("pending");
  });

  // AC-3: written row can be read back with correct alertSource value
  it("(3) written row reads back with alertSource='legal_risk'", async () => {
    const store = makeFakeStore();
    const input = {
      ...BASE_INPUT,
      alertSource: "legal_risk" as const,
    };
    const result = await writeAlertVerdict(input, { store });

    // Simulate readback by querying the in-memory store
    const written = store.rows.find((r) => r.id === result.id);
    expect(written).toBeDefined();
    expect(written!.alertSource).toBe("legal_risk");
    expect(written!.verdict).toBe("pending");
    expect(written!.resolvedAt).toBeNull();
    expect(written!.ticker).toBe("VPB");
    expect(written!.firedAt).toBe("2026-05-20T04:39:00.000Z");
  });

  // AC-4: 'position_danger' still accepted (regression guard)
  it("(4) position_danger still accepted by schema (no regression)", () => {
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse({
      ...BASE_INPUT,
      alertSource: "position_danger",
    });
    expect(result.success).toBe(true);
  });

  // AC-5: unknown alertSource value is still rejected
  it("(5) unknown alertSource value rejected by Zod schema", () => {
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse({
      ...BASE_INPUT,
      alertSource: "totally_made_up",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain("alertSource");
  });
});
