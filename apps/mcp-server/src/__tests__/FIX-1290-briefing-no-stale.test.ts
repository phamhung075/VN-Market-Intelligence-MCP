/**
 * FIX-1290 — morningBriefingJob: no stale briefing fallback on assembleBriefing failure
 *
 * Acceptance criteria:
 *   AC-1: assembleBriefing throws → WORK channel error notice sent ("morningBriefingJob failed — assembleBriefing error: {message}")
 *   AC-2: assembleBriefing throws → MARKET channel receives NO message (no stale briefing)
 *   AC-3: on success → MARKET channel still receives the briefing (regression guard)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
import { resetMorningBriefingGuard, runMorningBriefing } from "../scheduler/briefings/morningBriefingJob.js";
import type { DailyBriefing } from "../application/usecases/assembleBriefing.js";

// ─── Telegram capture mocks ───────────────────────────────────────────────────

const marketMessages: string[] = [];
const workMessages: string[] = [];

// C5-CURE: Load real telegram module via cache-bust BEFORE the stub is registered.
// This bypasses any prior mock.module entry in the process-global ESM registry.
// The afterAll at file bottom uses this reference to restore the real module.
const _realMod1290 = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1290"
);

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

// C5-CURE: restore real telegram module after this file's tests complete.
// _realMod1290 was loaded via cache-bust at file top (before the stub above),
// so it holds genuine implementations. Without this restore, the sendTelegramMarket
// capture-array stub registered above leaks into the process-global ESM registry
// and poisons ALL downstream CI files (arch-S17 confirmed fourth contaminator).
afterAll(() => {
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork:       _realMod1290.sendTelegramWork,
    sendTelegramMarket:     _realMod1290.sendTelegramMarket,
    sendTelegramBug:        _realMod1290.sendTelegramBug,
    sendTelegram:           _realMod1290.sendTelegram,
    notifyTelegramAlert:    _realMod1290.notifyTelegramAlert,
    notifyTelegramDocument: _realMod1290.notifyTelegramDocument,
    formatConvictionBlock:  _realMod1290.formatConvictionBlock,
    deleteTelegramBug:      _realMod1290.deleteTelegramBug,
  }));
});
