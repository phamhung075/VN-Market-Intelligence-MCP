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
import type { MarketScanResult, ScanMarketDeps } from "../application/usecases/scanMarket.js";

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot real implementations BEFORE any mock.module() call.
//
// Bun's ESM live bindings: import { fn as alias } creates a live binding.
// When mock.module() updates the export, the alias reflects the new value.
// By immediately copying into a const snapshot, we freeze the real value
// before any mock can change the live binding.
// ─────────────────────────────────────────────────────────────────────────────
const _frozenRealScanMarket = _realScanMarket;
const _frozenRealIsTradingSession = _realIsTradingSession;
const _frozenRealGetMacroSnapshot = _realGetMacroSnapshot;
const _frozenRealRecordJobRun = _realRecordJobRun;
const _frozenRealFreshnessSlaChecker = _realFreshnessSlaChecker;
const _frozenRealDetectStartupStaleData = _realDetectStartupStaleData;
const _frozenRealRecordJobMetrics = _realRecordJobMetrics;
const _frozenRealSendTelegramWork = _realSendTelegramWork;
const _frozenRealSendTelegramMarket = _realSendTelegramMarket;
const _frozenRealSendTelegramBug = _realSendTelegramBug;
const _frozenRealNotifyTelegramAlert = _realNotifyTelegramAlert;
const _frozenRealNotifyTelegramDocument = _realNotifyTelegramDocument;

// ─────────────────────────────────────────────────────────────────────────────
// Top-level mutable mock factories
//
// mock.module() is worker-scoped and permanent. Calling it inside it() blocks
// is safe for isolation within the file, but when Bun runs files in parallel
// (shared ESM registry), the mock set in one test can race with another file's
// imports. The fix: call mock.module() ONCE at the top level with a mutable
// factory variable. Per-test behaviour is controlled by updating the variable,
// not by re-calling mock.module(). This ensures a stable mock is in place from
// the start and avoids the mid-test re-registration race.
// ─────────────────────────────────────────────────────────────────────────────

// Group A mutable factories
let _getMacroSnapshotImpl: () => Promise<unknown> = _frozenRealGetMacroSnapshot;
let _sendTelegramWorkCapture: ((msg: string) => void) | null = null;
let _recordJobMetricsCapture: ((job: string, d: number, e: number, s: number) => void) | null = null;
let _detectStartupStaleDataImpl: () => Promise<void> = async () => {};
let _freshnessSlaCheckerImpl: () => Promise<boolean> = async () => true;

mock.module("../infrastructure/microservices/clients.js", () => ({
  getMacroSnapshot: async () => _getMacroSnapshotImpl(),
  // getMacroExternal also mocked to prevent real HTTP calls to localhost:5004
  getMacroExternal: async () => null,
}));
mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: async (msg: string) => {
    _sendTelegramWorkCapture?.(msg);
    return true;
  },
  sendTelegramMarket: async () => true,
  sendTelegramBug: async () => true,
  notifyTelegramAlert: async () => true,
  notifyTelegramDocument: async () => true,
}));
mock.module("../infrastructure/observability/jobMetrics.js", () => ({
  recordJobMetrics: (job: string, d: number, e: number, s: number) => {
    _recordJobMetricsCapture?.(job, d, e, s);
  },
}));
mock.module("../domain/services/macroIndicatorSla.js", () => ({
  freshnessSlaChecker: async (...args: unknown[]) => _freshnessSlaCheckerImpl(),
  detectStartupStaleData: async (...args: unknown[]) => _detectStartupStaleDataImpl(),
}));

// Group B mutable factories
let _isTradingSessionImpl: () => boolean = _frozenRealIsTradingSession;
let _scanMarketImpl: (deps: ScanMarketDeps) => Promise<MarketScanResult> = _frozenRealScanMarket;

mock.module("../infrastructure/fetchers/hose.js", () => ({
  isTradingSession: () => _isTradingSessionImpl(),
}));
mock.module("../application/usecases/scanMarket.js", () => ({
  scanMarket: async (deps: ScanMarketDeps) => _scanMarketImpl(deps),
}));

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

  // globalThis.fetch mock — intercepts FRED / external HTTP calls so tests
  // complete instantly without real network I/O. Restored in afterEach.
  let _originalFetch: typeof globalThis.fetch;

  // Reset mutable mock factories to safe defaults before each test.
  // No mock.module() calls inside tests — all behaviour is controlled via the
  // top-level mutable variables set up at file evaluation time.
  beforeEach(() => {
    sendWorkCalls = [];
    recordMetricsCalls = [];
    detectStartupCalls = 0;
    detectStartupShouldReject = false;

    // Mock globalThis.fetch to prevent real HTTP calls to FRED / VCB / Yahoo.
    // fredApi / fredEffrIorb / fredIsmSubcomponents all call fetch() directly.
    _originalFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      // FRED CSV endpoint (fred.stlouisfed.org/graph/fredgraph.csv)
      // Use today's date so checkAndAlertEffrStaleness does NOT fire an extra WORK alert.
      if (url.includes("fredgraph.csv") || url.includes("fred.stlouisfed.org")) {
        const today = new Date().toISOString().slice(0, 10);
        const csvBody = `DATE,DFF\n${today},5.33\n`;
        return new Response(csvBody, { status: 200, headers: { "Content-Type": "text/csv" } });
      }
      // FRED REST API (api.stlouisfed.org/fred/series/observations)
      if (url.includes("api.stlouisfed.org")) {
        const today = new Date().toISOString().slice(0, 10);
        const jsonBody = JSON.stringify({ observations: [{ date: today, value: "5.33" }] });
        return new Response(jsonBody, { status: 200, headers: { "Content-Type": "application/json" } });
      }
      // VCB XML (vietcombank)
      if (url.includes("vietcombank.com.vn") || url.includes("portal.vietcombank")) {
        const xml = `<?xml version="1.0" encoding="utf-8"?><ExrateList DateTime="6/5/2026"><Exrate CurrencyCode="USD" Buy="25900" Transfer="25950" Sell="26200"/></ExrateList>`;
        return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
      }
      // Yahoo Finance
      if (url.includes("finance.yahoo.com")) {
        const chart = { chart: { result: [{ meta: { regularMarketPrice: 82.5 }, timestamp: [1748908800], indicators: { quote: [{ close: [82.5] }] } }], error: null } };
        return new Response(JSON.stringify(chart), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      // Macro snapshot / microservice endpoints (localhost:5004)
      if (url.includes("/snapshot") || url.includes("/macro") || url.includes("localhost:5004")) {
        const snap = { status: "ok", fetchedAt: new Date().toISOString(), brentCrudeUSD: 82.5, goldUSDPerOz: 2300, cpi: 3.5, gdp: 6.8 };
        return new Response(JSON.stringify(snap), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      // Fallback: reject to make unhandled URL failures visible
      throw new Error(`[1352a fetch mock] No mock configured for URL: ${url}`);
    };

    // Reset mutable factory vars to default (success path)
    _getMacroSnapshotImpl = async () => ({
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
    _sendTelegramWorkCapture = (msg) => { sendWorkCalls.push(msg); };
    _recordJobMetricsCapture = (job, d, e, s) => {
      recordMetricsCalls.push([job, d, e, s]);
    };
    _freshnessSlaCheckerImpl = async () => true;
    _detectStartupStaleDataImpl = async () => {};
  });

  afterEach(() => {
    // Restore globalThis.fetch after each test.
    if (_originalFetch !== undefined) {
      globalThis.fetch = _originalFetch;
    }
    // Reset mutable factory vars to real implementations after each test.
    _getMacroSnapshotImpl = _frozenRealGetMacroSnapshot;
    _sendTelegramWorkCapture = null;
    _recordJobMetricsCapture = null;
    _freshnessSlaCheckerImpl = async () => true;
    _detectStartupStaleDataImpl = async () => {};
  });

  it("A-1: Telegram WORK message sent on getMacroSnapshot success with correct values", async () => {
    // _getMacroSnapshotImpl and _sendTelegramWorkCapture set in beforeEach

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
    // _getMacroSnapshotImpl and _recordJobMetricsCapture set in beforeEach

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
    // Override getMacroSnapshot to throw
    _getMacroSnapshotImpl = async () => { throw new Error("microservice down"); };

    const { macroIndicatorRefreshJob } = await import(
      "../scheduler/macro/macroIndicatorRefreshJob.js"
    );

    // Job re-throws after recording metrics (FIX-MACRO-REFRESH-DEAD: re-throw
    // so recordJobRun records status='error' instead of silent 'success').
    await expect(macroIndicatorRefreshJob()).rejects.toThrow("microservice down");

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

    // Override detectStartupStaleData to count calls and optionally throw
    _detectStartupStaleDataImpl = async () => {
      detectStartupCalls++;
      if (detectStartupShouldReject) {
        throw new Error("stale detection failed");
      }
    };

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

  // Reset mutable mock factories to safe defaults before/after each test.
  // NO mock.module() calls inside tests — all behaviour controlled via top-level
  // mutable variables, preventing parallel-worker contamination.
  beforeEach(() => {
    _isTradingSessionImpl = _frozenRealIsTradingSession;
    _scanMarketImpl = _frozenRealScanMarket;
  });

  afterEach(() => {
    _isTradingSessionImpl = _frozenRealIsTradingSession;
    _scanMarketImpl = _frozenRealScanMarket;
  });

  it("B-1: Concurrency guard — second call while first is running is skipped", async () => {
    const warnMessages: string[] = [];

    // Spy on real logger.warn via object mutation — NO mock.module needed.
    const origWarn = _realLogger.warn;
    _realLogger.warn = (msg: string, ...args: unknown[]) => { warnMessages.push(msg); };

    // External resolve handle for the first scan to remain pending
    let resolveFirst!: (value: MarketScanResult) => void;
    const firstDone = new Promise<MarketScanResult>((res) => { resolveFirst = res; });

    let scanCallCount = 0;

    // Configure mutable factory: increment count and wait for firstDone
    _scanMarketImpl = async (_deps: ScanMarketDeps) => {
      scanCallCount++;
      return firstDone;
    };
    _isTradingSessionImpl = () => true;

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
      _realLogger.warn = origWarn;
    }
  });

  it("B-2: isTradingSession false → scan skipped, no scanMarket call", async () => {
    const debugMessages: string[] = [];
    let scanCallCount = 0;

    // Spy on real logger.debug via object mutation — NO mock.module needed.
    const origDebug = _realLogger.debug;
    _realLogger.debug = (msg: string, ...args: unknown[]) => { debugMessages.push(msg); };

    _isTradingSessionImpl = () => false; // closed market
    _scanMarketImpl = async (_deps: ScanMarketDeps) => {
      scanCallCount++;
      return { scanned: 0, signals: 0, alerts: 0 };
    };
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
      _realLogger.debug = origDebug;
    }
  });

  it("B-3: isRunning flag resets to false after error — second call proceeds", async () => {
    let scanCallCount = 0;

    // Silence logger.error noise — object mutation, NO mock.module needed.
    const origError = _realLogger.error;
    _realLogger.error = (_msg: string, ..._args: unknown[]) => {};

    _isTradingSessionImpl = () => true;
    _scanMarketImpl = async (_deps: ScanMarketDeps) => {
      scanCallCount++;
      throw new Error("DB error");
    };
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
      sendTelegramWork: _frozenRealSendTelegramWork,
      sendTelegramMarket: _frozenRealSendTelegramMarket,
      sendTelegramBug: _frozenRealSendTelegramBug,
      notifyTelegramAlert: _frozenRealNotifyTelegramAlert,
      notifyTelegramDocument: _frozenRealNotifyTelegramDocument,
    }));
    mock.module("../infrastructure/microservices/clients.js", () => ({
      getMacroSnapshot: _frozenRealGetMacroSnapshot,
    }));
    mock.module("../domain/services/macroIndicatorSla.js", () => ({
      freshnessSlaChecker: _frozenRealFreshnessSlaChecker,
      detectStartupStaleData: _frozenRealDetectStartupStaleData,
    }));
    mock.module("../infrastructure/observability/jobMetrics.js", () => ({
      recordJobMetrics: _frozenRealRecordJobMetrics,
    }));
    mock.module("../infrastructure/fetchers/hose.js", () => ({
      isTradingSession: _frozenRealIsTradingSession,
    }));
    mock.module("../application/usecases/scanMarket.js", () => ({
      scanMarket: _frozenRealScanMarket,
    }));
  });

  it("teardown guard: real implementations captured", () => {
    expect(typeof _frozenRealSendTelegramWork).toBe("function");
    expect(typeof _frozenRealGetMacroSnapshot).toBe("function");
    expect(typeof _frozenRealIsTradingSession).toBe("function");
  });
});
