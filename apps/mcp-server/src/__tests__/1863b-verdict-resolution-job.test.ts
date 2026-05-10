/**
 * 1863b-verdict-resolution-job.test.ts
 *
 * Unit tests for verdictResolutionJob (Task 1863b-RECONCILE).
 * Covers all 10 AC scenarios from deleted 1863f — adapted for the
 * file-store-backed implementation that imports from
 * infrastructure/fileStore/alertVerdictStore.ts.
 *
 * All deps injected — no filesystem, no network, no Telegram.
 * Tests run in isolation; no SQLite, no HTTP calls.
 */

import { describe, it, expect } from "bun:test";
import type { AlertVerdict } from "../infrastructure/fileStore/alertVerdictStore.js";
import {
  runVerdictResolutionJobCron,
  type VerdictResolutionJobDeps,
} from "../scheduler/alerts/verdictResolutionJob.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-10T12:00:00Z");

/** firedAt 25h ago — past 24h guard, eligible for resolution */
const FIRED_25H = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
/** firedAt 23h ago — inside 24h guard, must be skipped */
const FIRED_23H = new Date(NOW.getTime() - 23 * 60 * 60 * 1000).toISOString();
/** firedAt exactly 24h ago — at the boundary; >=24h → eligible */
const FIRED_EXACT_24H = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
/** firedAt 31 days ago — eligible for TTL prune */
const FIRED_31D = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();

function makeVerdict(
  overrides: Partial<AlertVerdict> & Pick<AlertVerdict, "id" | "ticker" | "direction">
): AlertVerdict {
  return {
    alertSource: "verified_chain",
    conviction: 0.8,
    verdict: "pending",
    resolvedAt: null,
    firedAt: FIRED_25H,
    ...overrides,
  };
}

// ── Test-double builder ────────────────────────────────────────────────────

interface TestDeps extends VerdictResolutionJobDeps {
  /** Updated rows captured by the injected store.updateVerdict */
  updated: AlertVerdict[];
  /** Bug messages captured by injected telegramSender */
  bugs: string[];
  /** Number of times pruneVerdicts was called */
  pruneCallCount: number;
}

function buildDeps(
  rows: AlertVerdict[],
  priceNow: number | null,
  priceHistory: number | null,
  pruneReturn: number = 0
): TestDeps {
  const store: AlertVerdict[] = [...rows];
  const updated: AlertVerdict[] = [];
  const bugs: string[] = [];
  let pruneCallCount = 0;

  const deps: TestDeps = {
    updated,
    bugs,
    pruneCallCount: 0,
    store: {
      readVerdicts: async () => [...store],
      updateVerdict: async (id: string, patch: Partial<AlertVerdict>) => {
        const idx = store.findIndex((r) => r.id === id);
        if (idx !== -1) {
          store[idx] = { ...store[idx]!, ...patch };
          updated.push({ ...store[idx]! });
        }
      },
      pruneVerdicts: async (_days: number) => {
        pruneCallCount++;
        deps.pruneCallCount = pruneCallCount;
        return pruneReturn;
      },
    },
    fetchPrice: async (_ticker: string) => priceNow,
    fetchHistory: async (_ticker: string, _days: number) => priceHistory,
    telegramSender: async (_channel: string, msg: string) => {
      bugs.push(msg);
    },
    nowFn: () => NOW,
  };
  return deps;
}

// ── AC Tests ───────────────────────────────────────────────────────────────

describe("Task 1863b — verdictResolutionJob (file-store backed)", () => {

  // ── AC-1 / 1863f-AC-3: bullish + price up ≥1% → confirmed ───────────────
  it("bullish + price up ≥1% → confirmed", async () => {
    const row = makeVerdict({ id: "r1", ticker: "VIC", direction: "bullish" });
    const deps = buildDeps([row], 102, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsEvaluated).toBe(1);
    expect(result.rowsResolved).toBe(1);
    expect(result.errors).toBe(0);

    const updated = deps.updated[0];
    expect(updated?.verdict).toBe("confirmed");
    expect(updated?.pctMove).toBeCloseTo(2.0, 4);
  });

  // ── AC-2 / 1863f-AC-4: bullish + price down ≥1% → false_positive ─────────
  it("bullish + price down ≥1% → false_positive", async () => {
    const row = makeVerdict({ id: "r2", ticker: "VHM", direction: "bullish" });
    const deps = buildDeps([row], 98, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsResolved).toBe(1);
    const updated = deps.updated[0];
    expect(updated?.verdict).toBe("false_positive");
    expect(updated?.pctMove).toBeCloseTo(-2.0, 4);
  });

  // ── AC-3 / 1863f-AC-5: bearish + price down ≥1% → confirmed ──────────────
  it("bearish + price down ≥1% → confirmed", async () => {
    const row = makeVerdict({ id: "r3", ticker: "SSI", direction: "bearish" });
    const deps = buildDeps([row], 98, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsResolved).toBe(1);
    const updated = deps.updated[0];
    expect(updated?.verdict).toBe("confirmed");
  });

  // ── AC-4 / 1863f-AC-6: bearish + price up ≥1% → false_positive ───────────
  it("bearish + price up ≥1% → false_positive (bearish+up gap)", async () => {
    const row = makeVerdict({ id: "r4", ticker: "MWG", direction: "bearish" });
    const deps = buildDeps([row], 102, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsResolved).toBe(1);
    const updated = deps.updated[0];
    expect(updated?.verdict).toBe("false_positive");
  });

  // ── AC-5 / 1863f-AC-1+AC-2: |pct| < 1% → confirmed (regardless of direction)
  it("flat move |pct|<1% bullish → confirmed", async () => {
    const row = makeVerdict({ id: "r5a", ticker: "HPG", direction: "bullish" });
    const deps = buildDeps([row], 100.5, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsResolved).toBe(1);
    const updated = deps.updated[0];
    expect(updated?.verdict).toBe("confirmed");
  });

  it("flat move |pct|<1% bearish → confirmed", async () => {
    const row = makeVerdict({ id: "r5b", ticker: "HPG", direction: "bearish" });
    const deps = buildDeps([row], 100.5, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsResolved).toBe(1);
    const updated = deps.updated[0];
    expect(updated?.verdict).toBe("confirmed");
  });

  // ── AC-6 / 1863f-AC-7: 24h guard — row just under 24h is skipped ─────────
  it("row < 24h old (23h) is skipped — stays pending", async () => {
    const row = makeVerdict({
      id: "r6",
      ticker: "MBB",
      direction: "bullish",
      firedAt: FIRED_23H,
    });
    const deps = buildDeps([row], 105, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsEvaluated).toBe(0);
    expect(result.rowsResolved).toBe(0);
    expect(deps.updated.length).toBe(0);
  });

  // ── AC-6b / 1863f-AC-8: 24h guard — row exactly at ≥24h IS processed ─────
  it("row at exactly 24h old IS resolved (boundary: ≥24h)", async () => {
    const row = makeVerdict({
      id: "r6b",
      ticker: "CTG",
      direction: "bullish",
      firedAt: FIRED_EXACT_24H,
    });
    const deps = buildDeps([row], 102, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsEvaluated).toBeGreaterThanOrEqual(1);
    const updated = deps.updated[0];
    expect(updated?.verdict).toBe("confirmed");
  });

  // ── AC-7 / 1863f-AC-9: 30d TTL pruning is called on every run ────────────
  it("pruneVerdicts is called once per run", async () => {
    const row = makeVerdict({ id: "r7", ticker: "VIC", direction: "bullish" });
    const deps = buildDeps([row], 102, 100);

    await runVerdictResolutionJobCron(deps);

    expect(deps.pruneCallCount).toBe(1);
  });

  it("rowsPruned reflects value returned by store.pruneVerdicts", async () => {
    const deps = buildDeps([], 100, 100, 3);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsPruned).toBe(3);
  });

  // ── AC-8 / 1863f-AC-10: fail-loud on fetchPrice returning null ───────────
  it("fetchPrice null → BUG telegram sent, row stays pending, errors++", async () => {
    const row = makeVerdict({ id: "r8", ticker: "TCB", direction: "bullish" });
    const deps = buildDeps([row], null, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsEvaluated).toBe(1);
    expect(result.rowsResolved).toBe(0);
    expect(result.errors).toBe(1);
    expect(deps.updated.length).toBe(0);
    expect(deps.bugs.length).toBeGreaterThan(0);
    expect(deps.bugs[0]).toContain("TCB");
  });

  it("fetchHistory null → BUG telegram sent, row stays pending", async () => {
    const row = makeVerdict({ id: "r9", ticker: "VCB", direction: "bearish" });
    const deps = buildDeps([row], 100, null);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsResolved).toBe(0);
    expect(result.errors).toBe(1);
    expect(deps.bugs.length).toBeGreaterThan(0);
    expect(deps.bugs[0]).toContain("VCB");
  });

  // ── AC-9: multiple signals in one batch ───────────────────────────────────
  it("batch: multiple signals resolved in one run", async () => {
    const rows = [
      makeVerdict({ id: "b1", ticker: "VIC", direction: "bullish" }),
      makeVerdict({ id: "b2", ticker: "SSI", direction: "bearish" }),
      makeVerdict({ id: "b3", ticker: "HPG", direction: "bullish" }),
    ];
    // VIC: +2% → confirmed; SSI: -2% → confirmed; HPG: -2% → false_positive
    const deps = buildDeps(rows, 98, 100); // priceNow=98 (down 2%)

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsEvaluated).toBe(3);
    expect(result.rowsResolved).toBe(3);
    expect(result.errors).toBe(0);

    // SSI bearish+down → confirmed; VIC bullish+down → false_positive; HPG bullish+down → false_positive
    const verdicts = deps.updated.map((u) => u.verdict).sort();
    // 1 confirmed (SSI bearish+down), 2 false_positive (VIC+HPG bullish+down)
    expect(verdicts.filter((v) => v === "confirmed").length).toBe(1);
    expect(verdicts.filter((v) => v === "false_positive").length).toBe(2);
  });

  // ── AC-10: idempotency — already resolved row is skipped ─────────────────
  it("idempotency: already resolved row is not re-processed", async () => {
    const row = makeVerdict({
      id: "i1",
      ticker: "VIC",
      direction: "bullish",
      verdict: "confirmed",
      resolvedAt: FIRED_25H,
    });
    const deps = buildDeps([row], 102, 100);

    const result = await runVerdictResolutionJobCron(deps);

    expect(result.rowsEvaluated).toBe(0);
    expect(result.rowsResolved).toBe(0);
    expect(deps.updated.length).toBe(0);
  });
});
