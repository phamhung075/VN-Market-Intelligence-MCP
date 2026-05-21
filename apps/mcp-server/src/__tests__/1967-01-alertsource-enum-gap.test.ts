/**
 * Task 1967-01 — alertSource enum gap: legal_risk + crisis_velocity
 *
 * REQ: REQ-1967-1a — alertSource Zod enum must include all documented signal types.
 *
 * AC:
 *   1. WRITE_ALERT_VERDICT_SCHEMA accepts "legal_risk" as alertSource
 *   2. WRITE_ALERT_VERDICT_SCHEMA accepts "crisis_velocity" as alertSource
 *   3. writeAlertVerdict() succeeds with alertSource="legal_risk"
 *   4. writeAlertVerdict() succeeds with alertSource="crisis_velocity"
 *   5. Unknown alertSource is still rejected by Zod
 *
 * @module __tests__/1967-01-alertsource-enum-gap
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

const BASE_INPUT = {
  ticker: "VIC",
  direction: "bearish" as const,
  conviction: 0.75,
  firedAt: "2026-05-21T08:00:00.000Z",
};

function makeFakeStore() {
  const appended: AlertVerdict[] = [];
  return {
    appended,
    appendOne: mock(async (v: AlertVerdict) => {
      appended.push(v);
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("1967-01 — alertSource enum gap", () => {
  // AC-1: legal_risk accepted by Zod schema
  it("AC-1: Zod schema accepts legal_risk as alertSource", () => {
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse({
      ...BASE_INPUT,
      alertSource: "legal_risk",
    });
    expect(result.success).toBe(true);
  });

  // AC-2: crisis_velocity accepted by Zod schema
  it("AC-2: Zod schema accepts crisis_velocity as alertSource", () => {
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse({
      ...BASE_INPUT,
      alertSource: "crisis_velocity",
    });
    expect(result.success).toBe(true);
  });

  // AC-3: writeAlertVerdict succeeds with legal_risk
  it("AC-3: writeAlertVerdict() succeeds with alertSource=legal_risk", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(
      { ...BASE_INPUT, alertSource: "legal_risk" },
      { store },
    );
    expect(result.success).toBe(true);
    expect(result.ticker).toBe("VIC");
    expect(result.verdict).toBe("pending");
    expect(store.appended[0]?.alertSource).toBe("legal_risk");
  });

  // AC-4: writeAlertVerdict succeeds with crisis_velocity
  it("AC-4: writeAlertVerdict() succeeds with alertSource=crisis_velocity", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(
      { ...BASE_INPUT, alertSource: "crisis_velocity" },
      { store },
    );
    expect(result.success).toBe(true);
    expect(result.ticker).toBe("VIC");
    expect(result.verdict).toBe("pending");
    expect(store.appended[0]?.alertSource).toBe("crisis_velocity");
  });

  // AC-5: unknown alertSource still rejected
  it("AC-5: Zod schema rejects unknown alertSource value", () => {
    const result = WRITE_ALERT_VERDICT_SCHEMA.safeParse({
      ...BASE_INPUT,
      alertSource: "banana_signal",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain("alertSource");
  });
});
