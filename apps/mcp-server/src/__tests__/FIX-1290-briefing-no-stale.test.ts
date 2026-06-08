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

// DB: use the real schema module functions so that downstream test files in the
// same Bun worker are not poisoned by a stub getDb() that returns a plain object
// instead of a Database instance. mock.module() is worker-scoped in Bun 1.x —
// once set it is never cleared. Delegating to the real implementations ensures
// that any subsequent test file calling initDatabase() still gets a proper DB.
import {
  getDb as _realGetDb,
  initDatabase as _realInitDatabase,
  closeDb as _realCloseDb,
  ensureCustomAlertRulesTable as _realEnsureCustomAlertRulesTable,
  migrateForeignFlowColumns as _realMigrateForeignFlowColumns,
} from "../infrastructure/db/schema.js";
mock.module("../infrastructure/db/schema.js", () => ({
  getDb: _realGetDb,
  initDatabase: _realInitDatabase,
  closeDb: _realCloseDb,
  ensureCustomAlertRulesTable: _realEnsureCustomAlertRulesTable,
  migrateForeignFlowColumns: _realMigrateForeignFlowColumns,
}));

// marketMessageStore: use real implementation for same reason as schema.js above.
// A stub `insertMarketMessage: () => 1` breaks test 1265 which calls the real
// batchReviewMarketMessages on a returned integer ID instead of a UUID string.
import { insertMarketMessage as _realInsertMarketMessage } from "../infrastructure/db/marketMessageStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
mock.module("../infrastructure/db/marketMessageStore.js", () => ({
  insertMarketMessage: _realInsertMarketMessage,
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
