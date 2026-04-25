/**
 * FIX-1290 — morningBriefingJob: no stale briefing fallback on assembleBriefing failure
 *
 * Acceptance criteria:
 *   AC-1: assembleBriefing throws → WORK channel error notice sent ("morningBriefingJob failed — assembleBriefing error: {message}")
 *   AC-2: assembleBriefing throws → MARKET channel receives NO message (no stale briefing)
 *   AC-3: on success → MARKET channel still receives the briefing (regression guard)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { resetMorningBriefingGuard, runMorningBriefing } from "../scheduler/briefings/morningBriefingJob.js";
import type { DailyBriefing } from "../application/usecases/assembleBriefing.js";

// ─── Telegram capture mocks ───────────────────────────────────────────────────

const marketMessages: string[] = [];
const workMessages: string[] = [];

mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramMarket: async (text: string) => {
    marketMessages.push(text);
    return true;
  },
  sendTelegramWork: async (text: string) => {
    workMessages.push(text);
    return true;
  },
}));

// DB imports needed to satisfy dynamic imports inside runMorningBriefing
mock.module("../infrastructure/db/schema.js", () => ({
  getDb: () => ({
    query: () => ({ get: () => null }),
    prepare: () => ({ run: () => {} }),
  }),
}));

mock.module("../infrastructure/db/marketMessageStore.js", () => ({
  insertMarketMessage: () => 1,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMinimalBriefing(date: string): DailyBriefing {
  return {
    date,
    vnIndex: { price: 1200, changePct: 0.5, fetchedAt: new Date().toISOString() },
    watchlistSummary: [],
    topStories: [{ title: "test story", sentiment: "neutral", level: "stock", impactScore: 1 }],
    alerts: [],
    newReports: [],
    unresolvedAlerts: [],
    topConviction: null,
    sensitiveWarnings: [],
    macroSnapshot: [],
    trackedCommodities: [],
    insiderRecent: [],
    foreignFlowSummary: [],
    evidenceTopScores: [],
    taSummary: [],
    upcomingDeadlines: [],
    portfolioPnl: null,
    predictionSignals: [],
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: assembleBriefing throws → WORK error notice sent
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1290 — AC-1: assembleBriefing failure → WORK error notice sent", () => {
  beforeEach(() => {
    resetMorningBriefingGuard();
    marketMessages.length = 0;
    workMessages.length = 0;
  });

  it("sends error notice to WORK channel when assembleBriefing throws", async () => {
    const failingBriefingFn = async (): Promise<DailyBriefing> => {
      throw new Error("DB connection lost");
    };

    await runMorningBriefing(failingBriefingFn);

    expect(workMessages.length).toBeGreaterThanOrEqual(1);
    const notice = workMessages.find((m) =>
      m.includes("morningBriefingJob failed") && m.includes("DB connection lost"),
    );
    expect(notice).toBeDefined();
  });

  it("error notice text contains the error message", async () => {
    const failingBriefingFn = async (): Promise<DailyBriefing> => {
      throw new Error("assembleBriefing: timeout after 30000ms");
    };

    await runMorningBriefing(failingBriefingFn);

    const notice = workMessages.find((m) => m.includes("assembleBriefing: timeout after 30000ms"));
    expect(notice).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: assembleBriefing throws → NO market message sent
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1290 — AC-2: assembleBriefing failure → no stale briefing to MARKET", () => {
  beforeEach(() => {
    resetMorningBriefingGuard();
    marketMessages.length = 0;
    workMessages.length = 0;
  });

  it("sends nothing to MARKET channel when assembleBriefing throws", async () => {
    const failingBriefingFn = async (): Promise<DailyBriefing> => {
      throw new Error("network error");
    };

    await runMorningBriefing(failingBriefingFn);

    expect(marketMessages.length).toBe(0);
  });

  it("does not throw when assembleBriefing fails", async () => {
    const failingBriefingFn = async (): Promise<DailyBriefing> => {
      throw new Error("some error");
    };

    await expect(runMorningBriefing(failingBriefingFn)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: success path — MARKET still receives briefing (regression guard)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1290 — AC-3: success path regression — briefing still sent to MARKET", () => {
  beforeEach(() => {
    resetMorningBriefingGuard();
    marketMessages.length = 0;
    workMessages.length = 0;
  });

  it("sends briefing to MARKET channel when assembleBriefing succeeds", async () => {
    const successBriefingFn = async (): Promise<DailyBriefing> =>
      makeMinimalBriefing("2026-04-25");

    await runMorningBriefing(successBriefingFn);

    expect(marketMessages.length).toBeGreaterThanOrEqual(1);
    expect(marketMessages[0]).toContain("BẢN TIN SÁNG 2026-04-25");
  });
});
