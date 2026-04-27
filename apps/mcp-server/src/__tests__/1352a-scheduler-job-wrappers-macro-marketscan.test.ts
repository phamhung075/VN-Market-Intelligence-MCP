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
 * ISOLATION: schema.js is NOT mocked here — real in-memory DB (DB_PATH=:memory:)
 * is used instead. This prevents schema.js contamination of worker-sibling files.
 * All other mocked modules are restored in the teardown describe at the bottom.
 *
 * Layer: tests — no real HTTP, no Telegram sends, in-memory DB.
 */

import { describe, it, expect, mock, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Real-module captures — imported BEFORE any mock.module() call so they hold
// the genuine implementations. Used in teardown to repair the module registry
// for worker-sibling test files. Pattern: FIX-1290-briefing-no-stale.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import {
  sendTelegramWork as _realSendTelegramWork,
  sendTelegramMarket as _realSendTelegramMarket,
  sendTelegramBug as _realSendTelegramBug,
  notifyTelegramAlert as _realNotifyTelegramAlert,
  notifyTelegramDocument as _realNotifyTelegramDocument,
} from "../infrastructure/notifiers/telegram.js";
import { getMacroSnapshot as _realGetMacroSnapshot } from "../infrastructure/microservices/clients.js";
import {
  freshnessSlaChecker as _realFreshnessSlaChecker,
  detectStartupStaleData as _realDetectStartupStaleData,
} from "../domain/services/macroIndicatorSla.js";
import { recordJobMetrics as _realRecordJobMetrics } from "../infrastructure/observability/jobMetrics.js";
import { isTradingSession as _realIsTradingSession } from "../infrastructure/fetchers/hose.js";
import { scanMarket as _realScanMarket } from "../application/usecases/scanMarket.js";
import { recordJobRun as _realRecordJobRun } from "../infrastructure/db/cronJobRunStore.js";
import { logger as _realLogger } from "../infrastructure/logger.js";

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

  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  // Restore contaminating mocks immediately after each test completes.
  // mock.module() is worker-scoped+permanent; restoring here prevents sibling
  // files in the same worker from receiving stale mock implementations before
  // the outer teardown describe fires.
  afterEach(() => {
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramWork: _realSendTelegramWork,
      sendTelegramMarket: _realSendTelegramMarket,
      sendTelegramBug: _realSendTelegramBug,
      notifyTelegramAlert: _realNotifyTelegramAlert,
      notifyTelegramDocument: _realNotifyTelegramDocument,
    }));
    mock.module("../infrastructure/microservices/clients.js", () => ({
      getMacroSnapshot: _realGetMacroSnapshot,
    }));
    mock.module("../domain/services/macroIndicatorSla.js", () => ({
      freshnessSlaChecker: _realFreshnessSlaChecker,
      detectStartupStaleData: _realDetectStartupStaleData,
    }));
    mock.module("../infrastructure/observability/jobMetrics.js", () => ({
      recordJobMetrics: _realRecordJobMetrics,
    }));
  });

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
  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  // Restore contaminating mocks immediately after each test completes.
  afterEach(() => {
    mock.module("../application/usecases/scanMarket.js", () => ({
      scanMarket: _realScanMarket,
    }));
    mock.module("../infrastructure/fetchers/hose.js", () => ({
      isTradingSession: _realIsTradingSession,
    }));
  });

  it("B-1: Concurrency guard — second call while first is running is skipped", async () => {
    const warnMessages: string[] = [];

    // Spy on real logger.warn via object mutation — NO mock.module needed.
    // _realLogger is the same object reference that marketScanJob.ts holds,
    // so mutating .warn here affects what the job sees when it calls logger.warn().
    const origWarn = _realLogger.warn;
    _realLogger.warn = (msg: string, ...args: unknown[]) => { warnMessages.push(msg); };

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
    // Real cronJobRunStore + real DB — no mock needed, pass-through matches real behaviour.

    try {
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
    } finally {
      // Restore logger method immediately — no mock.module contamination to clean up.
      _realLogger.warn = origWarn;
    }
  });

  it("B-2: isTradingSession false → scan skipped, no scanMarket call", async () => {
    const debugMessages: string[] = [];
    let scanCallCount = 0;

    // Spy on real logger.debug via object mutation — NO mock.module needed.
    const origDebug = _realLogger.debug;
    _realLogger.debug = (msg: string, ...args: unknown[]) => { debugMessages.push(msg); };

    mock.module("../application/usecases/scanMarket.js", () => ({
      scanMarket: async () => {
        scanCallCount++;
        return { scanned: 0, signals: 0, alerts: 0 };
      },
    }));
    mock.module("../infrastructure/fetchers/hose.js", () => ({
      isTradingSession: () => false,
    }));
    // B-2: isTradingSession=false → returns before getDb()/recordJobRun — no DB needed.

    try {
      const { runMarketScan } = await import(
        "../scheduler/market-data/marketScanJob.js"
      );

      await runMarketScan("open");

      // scanMarket never called
      expect(scanCallCount).toBe(0);
      // Debug log about market being closed
      expect(debugMessages.some((m) => m.includes("market closed"))).toBe(true);
    } finally {
      // Restore logger method immediately — no mock.module contamination to clean up.
      _realLogger.debug = origDebug;
    }
  });

  it("B-3: isRunning flag resets to false after error — second call proceeds", async () => {
    let scanCallCount = 0;

    // Silence logger.error noise during this test via object mutation — NO mock.module needed.
    const origError = _realLogger.error;
    _realLogger.error = (_msg: string, ..._args: unknown[]) => {};

    mock.module("../application/usecases/scanMarket.js", () => ({
      scanMarket: async () => {
        scanCallCount++;
        throw new Error("DB error");
      },
    }));
    mock.module("../infrastructure/fetchers/hose.js", () => ({
      isTradingSession: () => true,
    }));
    // Real cronJobRunStore + real DB — recordJobRun swallows fn errors (same as prod).

    try {
      const { runMarketScan } = await import(
        "../scheduler/market-data/marketScanJob.js"
      );

      // First call — scanMarket throws, recordJobRun swallows, finally resets isRunning
      await runMarketScan("open");
      expect(scanCallCount).toBe(1);

      // Second call — must NOT be skipped (isRunning was reset to false)
      await runMarketScan("open");
      expect(scanCallCount).toBe(2);
    } finally {
      // Restore logger method immediately — no mock.module contamination to clean up.
      _realLogger.error = origError;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Teardown — restore mocked modules to real implementations
//
// mock.module() in Bun 1.x is worker-scoped and permanent for the process
// lifetime. Any file that runs in the same Bun worker after this one will
// inherit these mock registrations. We repair the registry here by
// re-registering the real implementations captured at file top-level,
// ensuring worker-siblings see genuine modules rather than our test stubs.
//
// Modules NOT listed here (never mocked via mock.module — no contamination risk):
//   - schema.js           (real DB used throughout via initDatabase)
//   - cronJobRunStore.js  (real recordJobRun used in Group B via real DB)
//   - logger.js           (real logger used in Group B; only .warn/.debug mutated
//                          per-test with immediate restore in finally blocks)
// ─────────────────────────────────────────────────────────────────────────────
describe("Task 1352a — teardown: restore module registry for worker-siblings", () => {
  afterAll(() => {
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramWork: _realSendTelegramWork,
      sendTelegramMarket: _realSendTelegramMarket,
      sendTelegramBug: _realSendTelegramBug,
      notifyTelegramAlert: _realNotifyTelegramAlert,
      notifyTelegramDocument: _realNotifyTelegramDocument,
    }));
    mock.module("../infrastructure/microservices/clients.js", () => ({
      getMacroSnapshot: _realGetMacroSnapshot,
    }));
    mock.module("../domain/services/macroIndicatorSla.js", () => ({
      freshnessSlaChecker: _realFreshnessSlaChecker,
      detectStartupStaleData: _realDetectStartupStaleData,
    }));
    mock.module("../infrastructure/observability/jobMetrics.js", () => ({
      recordJobMetrics: _realRecordJobMetrics,
    }));
    mock.module("../infrastructure/fetchers/hose.js", () => ({
      isTradingSession: _realIsTradingSession,
    }));
    mock.module("../application/usecases/scanMarket.js", () => ({
      scanMarket: _realScanMarket,
    }));
  });

  it("teardown guard: real implementations captured", () => {
    expect(typeof _realSendTelegramWork).toBe("function");
    expect(typeof _realGetMacroSnapshot).toBe("function");
    expect(typeof _realIsTradingSession).toBe("function");
  });
});
