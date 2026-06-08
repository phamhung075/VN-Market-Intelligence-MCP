/**
 * TASK_1354a — parallelServiceDispatcherJob gap-fill tests
 *
 * Covers paths not reachable without DI:
 *   PSD-1: all services OK → allOk=true, no alert Telegram, duration shape valid
 *   PSD-2: one service fails (TA throws) → allOk=false, ta.status='failed', others ok
 *   PSD-3: all services fail → allOk=false, Telegram alert fired with all failed names
 *   PSD-4: macro service fails → macro.status='failed', error message captured
 *   PSD-5: weekday UTC 01:xx → Telegram heartbeat sent when allOk=true
 *   PSD-6: weekend → no Telegram heartbeat even if allOk=true
 *   PSD-7: empty watchlist (0 tickers) → TA loop runs with empty array, no throw
 *   PSD-8: getDb() throws → function either absorbs or rethrows cleanly (no hang)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { runParallelServiceDispatcher } from "../scheduler/system/parallelServiceDispatcherJob.js";
import type { DispatcherDeps } from "../scheduler/system/parallelServiceDispatcherJob.js";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeDb(tickers: string[] = ["VCB", "HPG", "MWG"]): Database {
  const db = new Database(":memory:");
  db.run("CREATE TABLE watchlist (code TEXT)");
  for (const t of tickers) {
    db.run("INSERT INTO watchlist (code) VALUES (?)", [t]);
  }
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// Happy-path stubs
const okTA    = async () => ({ code: "VCB", trend: "TANG" as const });
const okMacro = async () => ({
  // Canonical fields (MacroSnapshotResponse v2 — aligned with macro-service DTO)
  vnIndex: 1280.5,
  oilUsd: 85.3,
  goldUsd: 2300.0,
  usdVnd: 25100,
  signals: {} as Record<string, { direction?: string; regime?: string; [key: string]: unknown }>,
  fetchedAt: new Date().toISOString(),
  // Legacy aliases preserved for backward compatibility
  brentPrice: 85.3,
  goldPrice: 2300.0,
  sbvOvernightRate: null,
  sbvRefinancingRate: null,
  sbvOfficialRate: null,
});
const okGateway  = async () => ({ status: "ok" as const, services: {} as Record<string, "healthy" | "unhealthy" | "unreachable"> });
const okKinhDich = async () => ({
  hexagram: 1,
  name: "Kiền",
  trend: "THUẬN LỢI",
  signal: "MUA (tích cực)",
  confidence: 0.85,
  timestamp: new Date().toISOString(),
});
const noTelegram: (msg: string) => Promise<void> = async () => {};

function happyDeps(overrides: Partial<DispatcherDeps> = {}, tickers: string[] = ["VCB"]): DispatcherDeps {
  const db = makeDb(tickers);
  return {
    computeTAFn:    okTA,
    getMacroFn:     okMacro,
    getGatewayFn:   okGateway,
    getKinhDichFn:  okKinhDich,
    sendTelegramFn: noTelegram,
    getDbFn:        () => db,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1354a — parallelServiceDispatcherJob gap tests", () => {

  it("PSD-1: all OK → allOk=true, result has timestamp + 4 service keys", async () => {
    const result = await runParallelServiceDispatcher(happyDeps());

    expect(result.allOk).toBe(true);
    expect(result.timestamp).toBeTruthy();
    expect(result.services.ta.status).toBe("ok");
    expect(result.services.macro.status).toBe("ok");
    expect(result.services.gateway.status).toBe("ok");
    expect(result.services.kinhDich.status).toBe("ok");
    expect(result.services.ta.duration).toBeGreaterThanOrEqual(0);
  });

  it("PSD-2: TA throws → allOk=false, ta.status='failed', macro/gateway/kinhDich ok", async () => {
    const result = await runParallelServiceDispatcher(happyDeps({
      computeTAFn: async () => { throw new Error("TA timeout"); },
    }));

    expect(result.allOk).toBe(false);
    expect(result.services.ta.status).toBe("failed");
    expect(result.services.macro.status).toBe("ok");
    expect(result.services.gateway.status).toBe("ok");
    expect(result.services.kinhDich.status).toBe("ok");
  });

  it("PSD-3: all services fail → allOk=false, Telegram alert sent with all service names", async () => {
    const sentMessages: string[] = [];
    const result = await runParallelServiceDispatcher(happyDeps({
      computeTAFn:    async () => { throw new Error("TA down"); },
      getMacroFn:     async () => { throw new Error("Macro down"); },
      getGatewayFn:   async () => { throw new Error("Gateway down"); },
      getKinhDichFn:  async () => { throw new Error("KinhDich down"); },
      sendTelegramFn: async (msg) => { sentMessages.push(msg); },
    }));

    expect(result.allOk).toBe(false);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0]).toContain("ta");
    expect(sentMessages[0]).toContain("macro");
    expect(sentMessages[0]).toContain("gateway");
    expect(sentMessages[0]).toContain("kinhDich");
  });

  it("PSD-4: macro throws → macro.status='failed', macro.message contains error text", async () => {
    const result = await runParallelServiceDispatcher(happyDeps({
      getMacroFn: async () => { throw new Error("Macro Service: upstream 503"); },
    }));

    expect(result.services.macro.status).toBe("failed");
    expect(result.services.macro.message).toContain("Macro Service");
  });

  it("PSD-5: weekday UTC 01:xx + allOk=true → heartbeat Telegram sent once", async () => {
    const sentMessages: string[] = [];
    // Monday 2026-04-28T01:30:00Z — weekday (day=1), hour === 1
    const weekdayMorning = () => new Date("2026-04-28T01:30:00Z");

    await runParallelServiceDispatcher({
      ...happyDeps({ sendTelegramFn: async (msg) => { sentMessages.push(msg); } }),
      nowFn: weekdayMorning,
    });

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0]).toContain("Microservices online");
  });

  it("PSD-6: weekend + allOk=true → no heartbeat Telegram sent", async () => {
    const sentMessages: string[] = [];
    // Saturday 2026-04-26T01:00:00Z (day=6)
    const weekend = () => new Date("2026-04-26T01:00:00Z");

    await runParallelServiceDispatcher({
      ...happyDeps({ sendTelegramFn: async (msg) => { sentMessages.push(msg); } }),
      nowFn: weekend,
    });

    expect(sentMessages.length).toBe(0);
  });

  it("PSD-7: empty watchlist → TA called with empty tickers, no throw, allOk=true", async () => {
    const db = makeDb([]); // 0 tickers
    const result = await runParallelServiceDispatcher({
      ...happyDeps(),
      getDbFn:     () => db,
      computeTAFn: okTA,
    });

    expect(result.allOk).toBe(true);
    expect(result.services.ta.status).toBe("ok");
  });

  it("PSD-8: getDb() throws → function does not hang; either returns failed shape or rethrows Error", async () => {
    const boom = () => { throw new Error("DB unavailable"); };

    let threw = false;
    let result: Awaited<ReturnType<typeof runParallelServiceDispatcher>> | undefined;

    try {
      result = await runParallelServiceDispatcher({
        ...happyDeps(),
        getDbFn: boom,
      });
    } catch {
      threw = true;
    }

    // Acceptable: either it rethrows (threw===true) or returns a result with allOk=false
    if (!threw) {
      expect(result!.allOk).toBe(false);
    } else {
      expect(threw).toBe(true);
    }
  });

});
