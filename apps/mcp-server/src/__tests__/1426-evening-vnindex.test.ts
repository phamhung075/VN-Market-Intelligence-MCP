/**
 * TASK 1426 — TDD RED: Evening Summary VN-Index close
 *
 * All assertions MUST FAIL before Task 1427 adds:
 *   - VnIndexSnapshot type to assembleEveningSummary.ts
 *   - fetchVnIndexFn option to AssembleEveningSummaryOptions
 *   - vnIndex field to EveningSummary
 *   - VN-Index formatter line to eveningSummaryJob.ts
 *
 * AC-1: VnIndexSnapshot type exported from assembleEveningSummary.ts
 * AC-2: assembleEveningSummary populates vnIndex on success
 * AC-3: vnIndex = undefined when fetchVnIndexFn returns null
 * AC-4: vnIndex = undefined when fetchVnIndexFn throws — no crash
 * AC-5: Telegram message contains VN-Index line at index 1 (after header)
 * AC-6: No VN-Index line when vnIndex = undefined
 * AC-7: Negative day: `(-15 / -1.18%)`
 * AC-8: Flat day: `(+0 / +0.00%)`
 */

import { describe, it, expect, beforeEach } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  assembleEveningSummary,
  type EveningSummary,
  // AC-1: VnIndexSnapshot must be exported — import will fail (type-level RED)
  type VnIndexSnapshot,
} from "../application/usecases/assembleEveningSummary.js";
import {
  runEveningSummary,
  resetEveningSummaryGuard,
} from "../scheduler/briefings/eveningSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock DB — returns empty arrays for all queries (no real DB needed)
// ─────────────────────────────────────────────────────────────────────────────

const mockDb = {
  prepare: () => ({ all: () => [], get: () => null }),
} as unknown as Database;

// ─────────────────────────────────────────────────────────────────────────────
// Mock MarketPrice returned by fetchVnIndexFn stub
// ─────────────────────────────────────────────────────────────────────────────

const mockMp = {
  code: "VNINDEX",
  exchange: "HOSE",
  price: 1285,
  previousPrice: 1273,
  changePct: 0.94,
  volume: 0,
  avgVolume: 0,
  fetchedAt: "2026-04-18T15:30:00.000Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: VnIndexSnapshot type is exported
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: VnIndexSnapshot type exported", () => {
  it("can assign a VnIndexSnapshot literal without TS error", () => {
    // This assertion is structural: if the import above compiles, the type exists.
    // At runtime we just verify the object is well-formed.
    const snap: VnIndexSnapshot = {
      close: 1285,
      change: 12,
      changePct: 0.94,
      fetchedAt: "2026-04-18T15:30:00.000Z",
    };
    expect(snap.close).toBe(1285);
    expect(snap.change).toBe(12);
    expect(snap.changePct).toBe(0.94);
    expect(snap.fetchedAt).toBe("2026-04-18T15:30:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 / AC-3 / AC-4: assembleEveningSummary with fetchVnIndexFn
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: assembleEveningSummary populates vnIndex on success", () => {
  it("summary.vnIndex.close equals MarketPrice.price", async () => {
    const fetchVnIndexFn = async () => mockMp;
    const summary = await assembleEveningSummary({
      db: mockDb,
      fetchVnIndexFn,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
    });
    expect(summary.vnIndex?.close).toBe(1285);
  });

  it("summary.vnIndex.change equals Math.round(price - previousPrice) = 12", async () => {
    const fetchVnIndexFn = async () => mockMp;
    const summary = await assembleEveningSummary({
      db: mockDb,
      fetchVnIndexFn,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
    });
    expect(summary.vnIndex?.change).toBe(12); // 1285 - 1273 = 12
  });

  it("summary.vnIndex.changePct equals rounded 0.94", async () => {
    const fetchVnIndexFn = async () => mockMp;
    const summary = await assembleEveningSummary({
      db: mockDb,
      fetchVnIndexFn,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
    });
    expect(summary.vnIndex?.changePct).toBe(0.94);
  });

  it("summary.vnIndex.fetchedAt matches MarketPrice.fetchedAt", async () => {
    const fetchVnIndexFn = async () => mockMp;
    const summary = await assembleEveningSummary({
      db: mockDb,
      fetchVnIndexFn,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
    });
    expect(summary.vnIndex?.fetchedAt).toBe("2026-04-18T15:30:00.000Z");
  });
});

describe("AC-3: vnIndex = undefined when fetchVnIndexFn returns null", () => {
  it("summary.vnIndex is undefined, no crash", async () => {
    const fetchVnIndexFn = async () => null;
    const summary = await assembleEveningSummary({
      db: mockDb,
      fetchVnIndexFn,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
    });
    expect(summary.vnIndex).toBeUndefined();
  });
});

describe("AC-4: vnIndex = undefined when fetchVnIndexFn throws", () => {
  it("summary.vnIndex is undefined, no crash", async () => {
    const fetchVnIndexFn = async (): Promise<typeof mockMp | null> => {
      throw new Error("network timeout");
    };
    const summary = await assembleEveningSummary({
      db: mockDb,
      fetchVnIndexFn,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
    });
    expect(summary.vnIndex).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5..AC-8: runEveningSummary — VN-Index line in Telegram message
// ─────────────────────────────────────────────────────────────────────────────

type SummaryOverrides = Omit<Partial<EveningSummary>, "vnIndex"> & { vnIndex?: VnIndexSnapshot | undefined };

/** Base summary with vnIndex present */
function makeSummary(overrides: SummaryOverrides = {}): EveningSummary {
  const base: EveningSummary = {
    date: "2026-04-18",
    topAlerts: [],
    topStories: [],
    watchlistMovers: [],
    predictionSignals: [],
    predictionDiag: { stored: 0 },
    taDiag: {
      tickersWithSignal: 0,
      tickersBelowThreshold: 0,
      ohlcvRowsMin: 0,
      ohlcvRowsMax: 0,
    },
    taSummary: [],
    newsCount: 0,
    generatedAt: "2026-04-18T15:30:00.000Z",
    vnIndex: {
      close: 1285,
      change: 12,
      changePct: 0.94,
      fetchedAt: "2026-04-18T15:30:00.000Z",
    },
  };
  // exactOptionalPropertyTypes: omit vnIndex key entirely when override sets it undefined
  const { vnIndex: overrideVnIndex, ...rest } = overrides;
  if ("vnIndex" in overrides) {
    const result = { ...base, ...rest };
    if (overrideVnIndex !== undefined) {
      result.vnIndex = overrideVnIndex;
    } else {
      delete result.vnIndex;
    }
    return result;
  }
  return { ...base, ...rest };
}

describe("AC-5: VN-Index line at index 1 (immediately after header)", () => {
  beforeEach(() => resetEveningSummaryGuard());

  it("message contains VN-Index line with dot-thousands and sign", async () => {
    let captured = "";
    const summaryFn = async () => makeSummary();
    const sendFn = async (msg: string) => {
      captured = msg;
    };

    // hasContent is false for an empty summary — inject a story to force send
    const summaryWithContent = async () =>
      makeSummary({
        topStories: [
          {
            title: "Test story",
            level: "global",
            sentiment: "neutral",
            impactScore: 1,
          },
        ],
      });

    await runEveningSummary(summaryWithContent, sendFn as Parameters<typeof runEveningSummary>[1], mockDb);

    expect(captured).toContain("VN-Index: 1.285 (+12 / +0.94%)");
  });

  it("VN-Index line is immediately after the TÓM TẮT header line", async () => {
    let captured = "";
    const sendFn = async (msg: string) => {
      captured = msg;
    };
    const summaryWithContent = async () =>
      makeSummary({
        topStories: [
          {
            title: "Test story",
            level: "global",
            sentiment: "neutral",
            impactScore: 1,
          },
        ],
      });

    await runEveningSummary(summaryWithContent, sendFn as Parameters<typeof runEveningSummary>[1], mockDb);

    const lines = captured.split("\n");
    const headerIdx = lines.findIndex((l) => l.includes("TÓM TẮT"));
    const vnIdx = lines.findIndex((l) => l.includes("VN-Index:"));
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(vnIdx).toBe(headerIdx + 1);
  });
});

describe("AC-6: No VN-Index line when vnIndex = undefined", () => {
  beforeEach(() => resetEveningSummaryGuard());

  it("message does NOT contain VN-Index: when vnIndex absent", async () => {
    let captured = "";
    const sendFn = async (msg: string) => {
      captured = msg;
    };
    const summaryNoVnIndex = async () =>
      makeSummary({
        vnIndex: undefined,
        topStories: [
          {
            title: "Test story",
            level: "global",
            sentiment: "neutral",
            impactScore: 1,
          },
        ],
      });

    await runEveningSummary(summaryNoVnIndex, sendFn as Parameters<typeof runEveningSummary>[1], mockDb);

    expect(captured).not.toContain("VN-Index:");
  });
});

describe("AC-7: Negative day format (-15 / -1.18%)", () => {
  beforeEach(() => resetEveningSummaryGuard());

  it("formats negative change correctly", async () => {
    let captured = "";
    const sendFn = async (msg: string) => {
      captured = msg;
    };
    const summaryNeg = async () =>
      makeSummary({
        vnIndex: {
          close: 1258,
          change: -15,
          changePct: -1.18,
          fetchedAt: "2026-04-18T15:30:00.000Z",
        },
        topStories: [
          {
            title: "Test story",
            level: "global",
            sentiment: "neutral",
            impactScore: 1,
          },
        ],
      });

    await runEveningSummary(summaryNeg, sendFn as Parameters<typeof runEveningSummary>[1], mockDb);

    expect(captured).toContain("VN-Index: 1.258 (-15 / -1.18%)");
  });
});

describe("AC-8: Flat day format (+0 / +0.00%)", () => {
  beforeEach(() => resetEveningSummaryGuard());

  it("formats zero change with + sign", async () => {
    let captured = "";
    const sendFn = async (msg: string) => {
      captured = msg;
    };
    const summaryFlat = async () =>
      makeSummary({
        vnIndex: {
          close: 1273,
          change: 0,
          changePct: 0,
          fetchedAt: "2026-04-18T15:30:00.000Z",
        },
        topStories: [
          {
            title: "Test story",
            level: "global",
            sentiment: "neutral",
            impactScore: 1,
          },
        ],
      });

    await runEveningSummary(summaryFlat, sendFn as Parameters<typeof runEveningSummary>[1], mockDb);

    expect(captured).toContain("VN-Index: 1.273 (+0 / +0.00%)");
  });
});
