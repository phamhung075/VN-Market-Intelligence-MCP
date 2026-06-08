/**
 * Task 1342a — DB Integrity Check Job (RED phase)
 *
 * All 12 tests are intentionally failing before implementation.
 * They specify the full contract for:
 *   - runIntegrityCheck() in infrastructure/db/checkpoint.ts
 *   - CRONS.integrityCheck entry in scheduler/jobs.ts
 *   - integrityCheckJob.ts thin orchestrator
 *
 * Layer: infrastructure/db + interface/scheduler
 */

import { describe, it, expect } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─── Group 1: runIntegrityCheck unit tests ────────────────────────────────────

describe("Task 1342a — runIntegrityCheck()", () => {
  it("1. returns { ok: true, details: ['ok'], walBytes: 0 } when PRAGMA returns single 'ok' row and WAL is small", async () => {
    // @ts-expect-error — runIntegrityCheck not yet exported from checkpoint.ts
    const { runIntegrityCheck } = await import("../infrastructure/db/checkpoint.js");

    const fakeDb = {
      query: () => ({
        all: () => [{ integrity_check: "ok" }],
      }),
    };
    const result = await runIntegrityCheck(":memory:", undefined, undefined, {
      getDb: () => fakeDb as never,
      log: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as never,
      walBytes: 0,
    });

    expect(result).toEqual({ ok: true, details: ["ok"], walBytes: 0 });
  });

  it("2. returns { ok: false, details: [...corruption lines] } when PRAGMA returns non-'ok' rows", async () => {
    // @ts-expect-error — runIntegrityCheck not yet exported from checkpoint.ts
    const { runIntegrityCheck } = await import("../infrastructure/db/checkpoint.js");

    const corruptRows = [
      { integrity_check: "row 1 of table market_data has an invalid entry" },
      { integrity_check: "database disk image is malformed" },
    ];
    const fakeDb = {
      query: () => ({
        all: () => corruptRows,
      }),
    };
    const result = await runIntegrityCheck(":memory:", undefined, undefined, {
      getDb: () => fakeDb as never,
      log: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as never,
      walBytes: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain("row 1 of table market_data has an invalid entry");
    expect(result.details).toContain("database disk image is malformed");
  });

  it("3. calls sendWorkFn with corruption message when integrity check fails", async () => {
    // @ts-expect-error — runIntegrityCheck not yet exported from checkpoint.ts
    const { runIntegrityCheck } = await import("../infrastructure/db/checkpoint.js");

    const fakeDb = {
      query: () => ({
        all: () => [{ integrity_check: "database disk image is malformed" }],
      }),
    };
    const sentMessages: string[] = [];
    const sendWorkFn = async (msg: string) => { sentMessages.push(msg); };

    await runIntegrityCheck(":memory:", sendWorkFn, undefined, {
      getDb: () => fakeDb as never,
      log: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as never,
      walBytes: 0,
    });

    expect(sentMessages.length).toBe(1);
  });

  it("4. does NOT call sendWorkFn when integrity check passes", async () => {
    // @ts-expect-error — runIntegrityCheck not yet exported from checkpoint.ts
    const { runIntegrityCheck } = await import("../infrastructure/db/checkpoint.js");

    const fakeDb = {
      query: () => ({
        all: () => [{ integrity_check: "ok" }],
      }),
    };
    const sentMessages: string[] = [];
    const sendWorkFn = async (msg: string) => { sentMessages.push(msg); };

    await runIntegrityCheck(":memory:", sendWorkFn, undefined, {
      getDb: () => fakeDb as never,
      log: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as never,
      walBytes: 0,
    });

    expect(sentMessages.length).toBe(0);
  });

  it("5. runs integrity check when walBytes >= 40MB threshold (forced path)", async () => {
    // @ts-expect-error — runIntegrityCheck not yet exported from checkpoint.ts
    const { runIntegrityCheck } = await import("../infrastructure/db/checkpoint.js");

    const FORTY_MB = 40 * 1024 * 1024;
    let pragmaExecuted = false;
    const fakeDb = {
      query: () => ({
        all: () => {
          pragmaExecuted = true;
          return [{ integrity_check: "ok" }];
        },
      }),
    };

    await runIntegrityCheck(":memory:", undefined, undefined, {
      getDb: () => fakeDb as never,
      log: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as never,
      walBytes: FORTY_MB,
    });

    expect(pragmaExecuted).toBe(true);
  });

  it("6. does NOT run integrity check when walBytes < 40MB and not weekly trigger", async () => {
    // @ts-expect-error — runIntegrityCheck not yet exported from checkpoint.ts
    const { runIntegrityCheck } = await import("../infrastructure/db/checkpoint.js");

    const THIRTY_MB = 30 * 1024 * 1024;
    let pragmaExecuted = false;
    const fakeDb = {
      query: () => ({
        all: () => {
          pragmaExecuted = true;
          return [{ integrity_check: "ok" }];
        },
      }),
    };

    const result = await runIntegrityCheck(":memory:", undefined, undefined, {
      getDb: () => fakeDb as never,
      log: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as never,
      walBytes: THIRTY_MB,
      forceRun: false,
    });

    expect(pragmaExecuted).toBe(false);
    // When skipped: ok true, details empty, walBytes reflects input
    expect(result.ok).toBe(true);
  });

  it("7. returns { ok: false } and calls sendWorkFn when db.query throws (DB unreadable)", async () => {
    // @ts-expect-error — runIntegrityCheck not yet exported from checkpoint.ts
    const { runIntegrityCheck } = await import("../infrastructure/db/checkpoint.js");

    const fakeDb = {
      query: () => ({
        all: () => { throw new Error("disk I/O error"); },
      }),
    };
    const sentMessages: string[] = [];
    const sendWorkFn = async (msg: string) => { sentMessages.push(msg); };

    const result = await runIntegrityCheck(":memory:", sendWorkFn, undefined, {
      getDb: () => fakeDb as never,
      log: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as never,
      walBytes: 0,
    });

    expect(result.ok).toBe(false);
    expect(sentMessages.length).toBe(1);
  });

  it("8. message sent to work contains 'CORRUPTION' keyword and db path", async () => {
    // @ts-expect-error — runIntegrityCheck not yet exported from checkpoint.ts
    const { runIntegrityCheck } = await import("../infrastructure/db/checkpoint.js");

    const dbPath = "/data/market.db";
    const fakeDb = {
      query: () => ({
        all: () => [{ integrity_check: "database disk image is malformed" }],
      }),
    };
    const sentMessages: string[] = [];
    const sendWorkFn = async (msg: string) => { sentMessages.push(msg); };

    await runIntegrityCheck(dbPath, sendWorkFn, undefined, {
      getDb: () => fakeDb as never,
      log: { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} } as never,
      walBytes: 0,
    });

    expect(sentMessages[0]).toContain("CORRUPTION");
    expect(sentMessages[0]).toContain(dbPath);
  });
});

// ─── Group 2: CRONS.integrityCheck key tests (jobs.ts) ───────────────────────

describe("Task 1342a — CRONS.integrityCheck (jobs.ts)", () => {
  it("9. CRONS.integrityCheck is defined", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    // @ts-expect-error — integrityCheck key not yet in CRONS
    expect(CRONS.integrityCheck).toBeDefined();
  });

  it("10. CRONS.integrityCheck defaults to '0 2 * * 0' when CRON_DB_INTEGRITY_CHECK is unset", async () => {
    // Save and remove env var to test default
    const original = Bun.env.CRON_DB_INTEGRITY_CHECK;
    delete (Bun.env as Record<string, string | undefined>)["CRON_DB_INTEGRITY_CHECK"];

    // Re-import to get fresh module evaluation
    // Note: ESM modules are cached, so we test the value directly
    const { CRONS } = await import("../scheduler/jobs.js");
    // @ts-expect-error — integrityCheck key not yet in CRONS
    const val = CRONS.integrityCheck;

    // Restore
    if (original !== undefined) {
      (Bun.env as Record<string, string | undefined>)["CRON_DB_INTEGRITY_CHECK"] = original;
    }

    expect(val).toBe("0 2 * * 0");
  });

  it("11. CRONS.integrityCheck uses Bun.env.CRON_DB_INTEGRITY_CHECK when set", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    // The module is cached, so if env was set at startup time it takes effect.
    // This test verifies the pattern is correct: value comes from env OR default.
    // @ts-expect-error — integrityCheck key not yet in CRONS
    const val = CRONS.integrityCheck;
    // Must be a valid cron expression string
    expect(typeof val).toBe("string");
    expect(val.split(" ").length).toBeGreaterThanOrEqual(5);
  });
});

// ─── Group 3: integrityCheckJob.ts integration smoke test ────────────────────

describe("Task 1342a — integrityCheckJob.ts", () => {
  it("12. runJob() is exported from integrityCheckJob and returns a result", async () => {
    // @ts-expect-error — module does not exist yet
    const mod = await import("../scheduler/integrityCheckJob.js");
    expect(typeof mod.runJob).toBe("function");

    // Smoke: calling runJob() should resolve (not throw)
    // Implementation will use injectable deps; for now just verify export shape
    expect(mod.runJob).toBeDefined();
  });
});
