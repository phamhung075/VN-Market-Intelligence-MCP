Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1352a — Scheduler Job Wrapper Tests: macroIndicatorRefreshJob + marketScanJob
 *
 * Group A (4 cases) — macroIndicatorRefreshJob():
 *   A-1: Telegram WORK message sent on getMacroSnapshot success
 *   A-2: recordJobMetrics called in finally block (success path)
 *   A-3: recordJobMetrics called in finally block (error path)
 *   A-4: validateMacroFreshnessOnStartup() never throws even when detectStartupStaleData rejects
 *
 * Group B (3 cases) — runMarketScan():
 *   B-1: Concurrency guard — second call while running is skipped
 *   B-2: isTradingSession false → scan skipped, no scanMarket call
 *   B-3: isRunning flag resets to false after error, second call proceeds
 *
 * Mock strategy: mock.module() before dynamic import of the job modules.
 * Both job modules use top-level module imports — mock.module replaces them
 * in Bun's module registry before the dynamic import resolves.
 *
 * Layer: tests — no real HTTP, no Telegram sends, in-memory DB.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Group A — macroIndicatorRefreshJob
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352a — Group A: macroIndicatorRefreshJob wrapper", () => {
  // Captured calls — reset before each test
  let sendWorkCalls: string[] = [];
  let recordMetricsCalls: Array<[string, number, number, number]> = [];
  let detectStartupCalls: number = 0;
  let detectStartupShouldReject = false;
  let getMacroSnapshotImpl: () => Promise<unknown>;

  beforeEach(() => {
    sendWorkCalls = [];
    recordMetricsCalls = [];
    detectStartupCalls = 0;
    detectStartupShouldReject = false;
    getMacroSnapshotImpl = async () => ({
      vnIndex: 1250,
      brentPrice: 85.5,
      goldPrice: 2300,
      usdVnd: 25000,
      sbvOvernightRate: 4.5,
      sbvRefinancingRate: 4.5,
      sbvOfficialRate: 4.5,
      scores: {
        energySector: 0.5,
        goldSector: 0.6,
        bankingSector: 0.7,
        realEstateSector: 0.4,
        aviationSector: 0.3,
      },
    });
  });

  it("A-1: Telegram WORK message sent on getMacroSnapshot success with correct values", async () => {
    mock.module("../infrastructure/microservices/clients.js", () => ({
      getMacroSnapshot: async () => getMacroSnapshotImpl(),
    }));
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramWork: async (msg: string) => {
        sendWorkCalls.push(msg);
        return true;
      },
      sendTelegramMarket: async () => true,
      sendTelegramBug: async () => true,
      notifyTelegramAlert: async () => true,
      notifyTelegramDocument: async () => true,
    }));
    mock.module("../infrastructure/observability/jobMetrics.js", () => ({
      recordJobMetrics: () => {},
    }));
    mock.module("../domain/services/macroIndicatorSla.js", () => ({
      freshnessSlaChecker: async () => true,
      detectStartupStaleData: async () => {},
    }));
    mock.module("../infrastructure/db/schema.js", () => ({
      getDb: () => ({}),
      initDatabase: async () => {},
      closeDb: () => {},
    }));

    const { macroIndicatorRefreshJob } = await import(
      "../scheduler/macro/macroIndicatorRefreshJob.js"
    );
    await macroIndicatorRefreshJob();

    expect(sendWorkCalls.length).toBe(1);
    const msg = sendWorkCalls[0];
    expect(msg).toContain("Macro refresh OK");
    expect(msg).toContain("1250");
    expect(msg).toContain("85.50");
    expect(msg).toContain("2300");
    // Duration pattern e.g. "[42ms]"
    expect(msg).toMatch(/\[\d+ms\]/);
  });

  it("A-2: recordJobMetrics called in finally block on success with correct args", async () => {
    mock.module("../infrastructure/microservices/clients.js", () => ({
      getMacroSnapshot: async () => getMacroSnapshotImpl(),
    }));
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramWork: async () => true,
      sendTelegramMarket: async () => true,
      sendTelegramBug: async () => true,
      notifyTelegramAlert: async () => true,
      notifyTelegramDocument: async () => true,
    }));
    mock.module("../infrastructure/observability/jobMetrics.js", () => ({
      recordJobMetrics: (
        job: string,
        durationMs: number,
        errorCount: number,
        successCount: number,
      ) => {
        recordMetricsCalls.push([job, durationMs, errorCount, successCount]);
      },
    }));
    mock.module("../domain/services/macroIndicatorSla.js", () => ({
      freshnessSlaChecker: async () => true,
      detectStartupStaleData: async () => {},
    }));
    mock.module("../infrastructure/db/schema.js", () => ({
      getDb: () => ({}),
      initDatabase: async () => {},
      closeDb: () => {},
    }));

    const { macroIndicatorRefreshJob } = await import(
      "../scheduler/macro/macroIndicatorRefreshJob.js"
    );
    await macroIndicatorRefreshJob();

    expect(recordMetricsCalls.length).toBe(1);
    const callArgs = recordMetricsCalls[0];
    expect(callArgs).toBeDefined();
    const [job, durationMs, errorCount, successCount] = callArgs!;
    expect(job).toBe("macroRefresh");
    expect(typeof durationMs).toBe("number");
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(errorCount).toBe(0);
    expect(successCount).toBe(1);
  });

  it("A-3: recordJobMetrics called with error counts when getMacroSnapshot throws", async () => {
    mock.module("../infrastructure/microservices/clients.js", () => ({
      getMacroSnapshot: async () => {
        throw new Error("microservice down");
      },
    }));
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramWork: async (msg: string) => {
        sendWorkCalls.push(msg);
        return true;
      },
      sendTelegramMarket: async () => true,
      sendTelegramBug: async () => true,
      notifyTelegramAlert: async () => true,
      notifyTelegramDocument: async () => true,
    }));
    mock.module("../infrastructure/observability/jobMetrics.js", () => ({
      recordJobMetrics: (
        job: string,
        durationMs: number,
        errorCount: number,
        successCount: number,
      ) => {
        recordMetricsCalls.push([job, durationMs, errorCount, successCount]);
      },
    }));
    mock.module("../domain/services/macroIndicatorSla.js", () => ({
      freshnessSlaChecker: async () => true,
      detectStartupStaleData: async () => {},
    }));
    mock.module("../infrastructure/db/schema.js", () => ({
      getDb: () => ({}),
      initDatabase: async () => {},
      closeDb: () => {},
    }));

    const { macroIndicatorRefreshJob } = await import(
      "../scheduler/macro/macroIndicatorRefreshJob.js"
    );

    // Must not throw
    await expect(macroIndicatorRefreshJob()).resolves.toBeUndefined();

    // WORK message contains failure text and error message
    expect(sendWorkCalls.length).toBe(1);
    expect(sendWorkCalls[0]).toContain("Macro refresh FAILED");
    expect(sendWorkCalls[0]).toContain("microservice down");

    // recordJobMetrics called with errorCount=1, successCount=0
    expect(recordMetricsCalls.length).toBe(1);
    const callArgs = recordMetricsCalls[0];
    expect(callArgs).toBeDefined();
    const [job, durationMs, errorCount, successCount] = callArgs!;
    expect(job).toBe("macroRefresh");
    expect(typeof durationMs).toBe("number");
    expect(errorCount).toBe(1);
    expect(successCount).toBe(0);
  });

  it("A-4: validateMacroFreshnessOnStartup never throws even when detectStartupStaleData rejects", async () => {
    const consoleErrorCalls: string[] = [];
    const origConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      consoleErrorCalls.push(args.map(String).join(" "));
    };

    mock.module("../infrastructure/microservices/clients.js", () => ({
      getMacroSnapshot: async () => getMacroSnapshotImpl(),
    }));
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramWork: async () => true,
      sendTelegramMarket: async () => true,
      sendTelegramBug: async () => true,
      notifyTelegramAlert: async () => true,
      notifyTelegramDocument: async () => true,
    }));
    mock.module("../infrastructure/observability/jobMetrics.js", () => ({
      recordJobMetrics: () => {},
    }));
    mock.module("../domain/services/macroIndicatorSla.js", () => ({
      freshnessSlaChecker: async () => true,
      detectStartupStaleData: async () => {
        detectStartupCalls++;
        if (detectStartupShouldReject) {
          throw new Error("stale detection failed");
        }
      },
    }));
    mock.module("../infrastructure/db/schema.js", () => ({
      getDb: () => ({}),
      initDatabase: async () => {},
      closeDb: () => {},
    }));

    try {
      const { validateMacroFreshnessOnStartup } = await import(
        "../scheduler/macro/macroIndicatorRefreshJob.js"
      );

      // Case 1: detectStartupStaleData resolves — must not throw
      detectStartupShouldReject = false;
      await expect(validateMacroFreshnessOnStartup()).resolves.toBeUndefined();
      expect(detectStartupCalls).toBe(1);

      // Case 2: detectStartupStaleData rejects — must not throw, must log error
      detectStartupShouldReject = true;
      await expect(validateMacroFreshnessOnStartup()).resolves.toBeUndefined();
      expect(detectStartupCalls).toBe(2);
      // Error logged to console.error, not re-thrown
      expect(consoleErrorCalls.some((msg) => msg.includes("stale detection failed"))).toBe(true);
    } finally {
      console.error = origConsoleError;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group B — runMarketScan() concurrency guard and session skip
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352a — Group B: runMarketScan concurrency guard and session skip", () => {
  it("B-1: Concurrency guard — second call while first is running is skipped", async () => {
    const warnMessages: string[] = [];

    // External resolve handle for the first scan to remain pending
    let resolveFirst!: (value: { scanned: number; signals: number; alerts: number }) => void;
    const firstDone = new Promise<{ scanned: number; signals: number; alerts: number }>(
      (res) => { resolveFirst = res; },
    );

    let scanCallCount = 0;

    mock.module("../application/usecases/scanMarket.js", () => ({
      scanMarket: async () => {
        scanCallCount++;
        return firstDone;
      },
    }));
    mock.module("../infrastructure/fetchers/hose.js", () => ({
      isTradingSession: () => true,
    }));
    mock.module("../infrastructure/db/schema.js", () => ({
      getDb: () => ({}),
      initDatabase: async () => {},
      closeDb: () => {},
    }));
    mock.module("../infrastructure/db/cronJobRunStore.js", () => ({
      recordJobRun: async (
        _db: unknown,
        _name: string,
        fn: () => Promise<unknown>,
      ) => {
        // Execute fn directly — mirrors prod behaviour but avoids DB
        try { await fn(); } catch { /* swallow */ }
      },
    }));
    mock.module("../infrastructure/logger.js", () => ({
      logger: {
        info: () => {},
        debug: () => {},
        warn: (msg: string) => { warnMessages.push(msg); },
        error: () => {},
      },
    }));

    const { runMarketScan } = await import(
      "../scheduler/market-data/marketScanJob.js"
    );

    // Start first scan — do NOT await yet (holds isRunning = true)
    const firstCall = runMarketScan("open");

    // Second call immediately — should be skipped
    await runMarketScan("open");

    // Assert second call was skipped with warn log
    expect(warnMessages.some((m) => m.includes("previous scan still running"))).toBe(true);
    // scanMarket called only once (second invocation never reached scanMarket)
    expect(scanCallCount).toBe(1);

    // Release the first call
    resolveFirst({ scanned: 5, signals: 2, alerts: 0 });
    await firstCall;
  });

  it("B-2: isTradingSession false → scan skipped, no scanMarket call", async () => {
    const debugMessages: string[] = [];
    let scanCallCount = 0;

    mock.module("../application/usecases/scanMarket.js", () => ({
      scanMarket: async () => {
        scanCallCount++;
        return { scanned: 0, signals: 0, alerts: 0 };
      },
    }));
    mock.module("../infrastructure/fetchers/hose.js", () => ({
      isTradingSession: () => false,
    }));
    mock.module("../infrastructure/db/schema.js", () => ({
      getDb: () => ({}),
      initDatabase: async () => {},
      closeDb: () => {},
    }));
    mock.module("../infrastructure/db/cronJobRunStore.js", () => ({
      recordJobRun: async (
        _db: unknown,
        _name: string,
        fn: () => Promise<unknown>,
      ) => { await fn(); },
    }));
    mock.module("../infrastructure/logger.js", () => ({
      logger: {
        info: () => {},
        debug: (msg: string) => { debugMessages.push(msg); },
        warn: () => {},
        error: () => {},
      },
    }));

    const { runMarketScan } = await import(
      "../scheduler/market-data/marketScanJob.js"
    );

    await runMarketScan("open");

    // scanMarket never called
    expect(scanCallCount).toBe(0);
    // Debug log about market being closed
    expect(debugMessages.some((m) => m.includes("market closed"))).toBe(true);
  });

  it("B-3: isRunning flag resets to false after error — second call proceeds", async () => {
    let scanCallCount = 0;

    mock.module("../application/usecases/scanMarket.js", () => ({
      scanMarket: async () => {
        scanCallCount++;
        throw new Error("DB error");
      },
    }));
    mock.module("../infrastructure/fetchers/hose.js", () => ({
      isTradingSession: () => true,
    }));
    mock.module("../infrastructure/db/schema.js", () => ({
      getDb: () => ({}),
      initDatabase: async () => {},
      closeDb: () => {},
    }));
    mock.module("../infrastructure/db/cronJobRunStore.js", () => ({
      // Transparent pass-through that does NOT swallow errors — lets isRunning reset path be tested
      recordJobRun: async (
        _db: unknown,
        _name: string,
        fn: () => Promise<unknown>,
      ) => {
        try { await fn(); } catch { /* swallow like prod */ }
      },
    }));
    mock.module("../infrastructure/logger.js", () => ({
      logger: {
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
      },
    }));

    const { runMarketScan } = await import(
      "../scheduler/market-data/marketScanJob.js"
    );

    // First call — scanMarket throws, recordJobRun swallows, finally resets isRunning
    await runMarketScan("open");
    expect(scanCallCount).toBe(1);

    // Second call — must NOT be skipped (isRunning was reset to false)
    await runMarketScan("open");
    expect(scanCallCount).toBe(2);
  });
});
