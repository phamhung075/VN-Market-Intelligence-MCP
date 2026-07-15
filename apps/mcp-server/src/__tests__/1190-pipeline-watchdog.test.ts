/**
 * Tests for pipelineWatchdogJob — task 1190, Sprint 076
 *
 * No real DB, no real Telegram. All dependencies injected.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import {
  runPipelineWatchdog,
  _resetWatchdogCooldown,
  STALE_THRESHOLD_MINS,
  COOLDOWN_MS,
} from "../scheduler/pipelineWatchdogJob.js";
import type { PipelineHealthResult } from "../application/usecases/getPipelineHealth.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHealth(
  staleMins: number | null,
  overrides?: Partial<PipelineHealthResult>,
): PipelineHealthResult {
  return {
    generatedAt: new Date().toISOString(),
    ragRows: {
      today: 3,
      yesterday: 10,
      lastInsertedAt:
        staleMins !== null ? "2026-04-13T08:00:00.000Z" : null,
      staleMins,
    },
    sources: [],
    vpsPushLast24h: 5,
    eveningReportLastRun: null,
    ...overrides,
  };
}

// ── Staleness gate ────────────────────────────────────────────────────────────

describe("runPipelineWatchdog — staleness gate", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });

  it("staleMins = 45 (healthy) → 'ok', notify not called", async () => {
    let notifyCallCount = 0;
    const notify = async (_msg: string): Promise<boolean> => {
      notifyCallCount++;
      return true;
    };
    const result = await runPipelineWatchdog({
      getPipelineHealthFn: async () => makeHealth(45),
      notify,
    });
    expect(result).toBe("ok");
    expect(notifyCallCount).toBe(0);
  });

  it("staleMins = 90 (boundary) → 'ok', notify not called", async () => {
    let notifyCallCount = 0;
    const notify = async (_msg: string): Promise<boolean> => {
      notifyCallCount++;
      return true;
    };
    const result = await runPipelineWatchdog({
      getPipelineHealthFn: async () => makeHealth(90),
      notify,
    });
    expect(result).toBe("ok");
    expect(notifyCallCount).toBe(0);
  });

  it("staleMins = null (empty table, total outage) → 'alert-sent', notify called once", async () => {
    let notifyCallCount = 0;
    const notify = async (_msg: string): Promise<boolean> => {
      notifyCallCount++;
      return true;
    };
    const result = await runPipelineWatchdog({
      getPipelineHealthFn: async () => makeHealth(null),
      notify,
    });
    expect(result).toBe("alert-sent");
    expect(notifyCallCount).toBe(1);
  });

  it("staleMins = 120, lastAlertAt = 0 → 'alert-sent', notify called once", async () => {
    let notifyCallCount = 0;
    const notify = async (_msg: string): Promise<boolean> => {
      notifyCallCount++;
      return true;
    };
    const result = await runPipelineWatchdog({
      getPipelineHealthFn: async () => makeHealth(120),
      notify,
    });
    expect(result).toBe("alert-sent");
    expect(notifyCallCount).toBe(1);
  });

  it("alert message contains staleMins, today count, lastInsertedAt, vpsPushLast24h", async () => {
    let capturedMessage = "";
    const notify = async (msg: string): Promise<boolean> => {
      capturedMessage = msg;
      return true;
    };
    const health = makeHealth(120, {
      ragRows: {
        today: 3,
        yesterday: 10,
        lastInsertedAt: "2026-04-13T08:00:00.000Z",
        staleMins: 120,
      },
      vpsPushLast24h: 0,
    });
    await runPipelineWatchdog({
      getPipelineHealthFn: async () => health,
      notify,
    });
    expect(capturedMessage).toContain("120 min");
    expect(capturedMessage).toContain("3");
    expect(capturedMessage).toContain("2026-04-13T08:00:00.000Z");
    expect(capturedMessage).toContain("0");
  });

  it("lastInsertedAt null renders 'never' in message", async () => {
    let capturedMessage = "";
    const notify = async (msg: string): Promise<boolean> => {
      capturedMessage = msg;
      return true;
    };
    // staleMins=120 with lastInsertedAt=null — unusual but must not crash
    const health: PipelineHealthResult = {
      generatedAt: new Date().toISOString(),
      ragRows: {
        today: 0,
        yesterday: 0,
        lastInsertedAt: null,
        staleMins: 120,
      },
      sources: [],
      vpsPushLast24h: 5,
      eveningReportLastRun: null,
    };
    await runPipelineWatchdog({
      getPipelineHealthFn: async () => health,
      notify,
    });
    expect(capturedMessage).toContain("never");
  });

  it("vpsPushLast24h null renders 'unknown' in message", async () => {
    let capturedMessage = "";
    const notify = async (msg: string): Promise<boolean> => {
      capturedMessage = msg;
      return true;
    };
    const health = makeHealth(120, { vpsPushLast24h: null });
    await runPipelineWatchdog({
      getPipelineHealthFn: async () => health,
      notify,
    });
    expect(capturedMessage).toContain("unknown");
  });
});

// ── Cooldown logic ────────────────────────────────────────────────────────────

describe("runPipelineWatchdog — cooldown logic", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });

  it("staleMins = 200, within 3h cooldown → 'cooldown', notify not called a second time", async () => {
    let notifyCallCount = 0;
    const notify = async (_msg: string): Promise<boolean> => {
      notifyCallCount++;
      return true;
    };
    const getPipelineHealthFn = async () => makeHealth(200);

    const now1 = new Date("2026-04-13T10:00:00.000Z");
    await runPipelineWatchdog({ now: now1, getPipelineHealthFn, notify, notifyUser: async () => {} });
    // 90 min later — still within 3-hour cooldown
    const now2 = new Date("2026-04-13T11:30:00.000Z");
    const result = await runPipelineWatchdog({ now: now2, getPipelineHealthFn, notify, notifyUser: async () => {} });

    expect(result).toBe("cooldown");
    expect(notifyCallCount).toBe(1);
  });

  it("staleMins = 200, cooldown expired (> 3h) → 'alert-sent', notify called again", async () => {
    let notifyCallCount = 0;
    const notify = async (_msg: string): Promise<boolean> => {
      notifyCallCount++;
      return true;
    };
    const getPipelineHealthFn = async () => makeHealth(200);

    const now1 = new Date("2026-04-13T10:00:00.000Z");
    await runPipelineWatchdog({ now: now1, getPipelineHealthFn, notify, notifyUser: async () => {} });

    // 4h01m later — cooldown expired
    const now2 = new Date("2026-04-13T14:01:00.000Z");
    const result = await runPipelineWatchdog({ now: now2, getPipelineHealthFn, notify, notifyUser: async () => {} });

    expect(result).toBe("alert-sent");
    expect(notifyCallCount).toBe(2);
  });

  it("notify returns false → 'notify-failed', lastAlertAt not advanced", async () => {
    let notifyCallCount = 0;
    const notify = async (_msg: string): Promise<boolean> => {
      notifyCallCount++;
      return false;
    };
    const now = new Date("2026-04-13T10:00:00.000Z");
    const getPipelineHealthFn = async () => makeHealth(200);

    const result1 = await runPipelineWatchdog({ now, getPipelineHealthFn, notify, notifyUser: async () => {} });
    expect(result1).toBe("notify-failed");

    // Immediately retry — cooldown not advanced, should try again
    const result2 = await runPipelineWatchdog({ now, getPipelineHealthFn, notify, notifyUser: async () => {} });
    expect(result2).toBe("notify-failed");
    expect(notifyCallCount).toBe(2);
  });

  it("notify throws → 'notify-failed', lastAlertAt not advanced", async () => {
    const notify = async (_msg: string): Promise<boolean> => {
      throw new Error("Telegram timeout");
    };
    const now = new Date("2026-04-13T10:00:00.000Z");
    const result = await runPipelineWatchdog({
      now,
      getPipelineHealthFn: async () => makeHealth(200),
      notify,
    });
    expect(result).toBe("notify-failed");
  });

  it("getPipelineHealthFn throws → 'notify-failed', no crash", async () => {
    const result = await runPipelineWatchdog({
      getPipelineHealthFn: async () => {
        throw new Error("DB offline");
      },
      notify: async () => true,
    });
    expect(result).toBe("notify-failed");
  });

  it("_resetWatchdogCooldown resets state between tests", async () => {
    let notifyCallCount = 0;
    const notify = async (_msg: string): Promise<boolean> => {
      notifyCallCount++;
      return true;
    };
    const getPipelineHealthFn = async () => makeHealth(200);
    const now1 = new Date("2026-04-13T10:00:00.000Z");

    await runPipelineWatchdog({ now: now1, getPipelineHealthFn, notify, notifyUser: async () => {} });
    _resetWatchdogCooldown();

    const now2 = new Date("2026-04-13T10:01:00.000Z");
    const result = await runPipelineWatchdog({ now: now2, getPipelineHealthFn, notify, notifyUser: async () => {} });
    expect(result).toBe("alert-sent"); // not "cooldown" — reset worked
    expect(notifyCallCount).toBe(2);
  });
});

// ── cron-registry.json integrity ──────────────────────────────────────────────

describe("cron-registry.json integrity", () => {
  const registryPath = join(process.cwd(), "docs/data/cron-registry.json");
  const json = JSON.parse(readFileSync(registryPath, "utf8"));

  it("schedulerFileCount === 67", () => {
    // REWRITE 2026-06-09 (BATCH4-CI-C-CD-CONFIG-DRIFT-ASSERTS): count grew from 43 → 44 → 64
    // as new scheduler files were added to apps/mcp-server/src/scheduler/.
    // BUMP 2026-07-10 (CI-RED-1a8c1bff-FIX): 64 → 65 — commit 43f4c8a22 (D3C)
    // added bctcExtractReconcileJob.ts (src/scheduler/financial-reports/) +
    // its cron-registry.json entry, resolving 'pek_triggered' bctc_vps_queue
    // rows left behind by bctcPdfPullJob.ts's fire-and-forget /pek-extract call.
    // BUMP 2026-07-15 (ALPHA-S2-SUB2-JOB-CRON): 65 → 66 — added intraday5mCompactorJob.ts
    // (src/scheduler/market-data/) + its cron-registry.json entry (intraday 5-min OHLCV compactor).
    // BUMP 2026-07-15 (ALPHA-S2-FF-SUB4-DOCS-SYNC): 66 → 67 — added
    // intradayForeignFlow5mCompactorJob.ts (src/scheduler/market-data/) + its
    // cron-registry.json entry (intraday 5-min foreign-flow compactor, LAST-value-in-bucket).
    // BUMP 2026-07-15 (ALPHA-S2-OMO-LIQUIDITY-CRON): 67 → 68 — added
    // sbvOmoLiquidityCronJob.ts (src/scheduler/macro/) + its cron-registry.json entry
    // (daily trigger of macro-indicators POST /liquidity-state so sbv_omo_daily accrues —
    // pure trigger+observe, zero local DB writes).
    expect(json.schedulerFileCount).toBe(68);
  });

  it("jobs array contains entry with name 'pipelineWatchdog'", () => {
    const entry = (json.jobs as Array<{ name: string; schedule: string }>).find(
      (j) => j.name === "pipelineWatchdog",
    );
    expect(entry).toBeDefined();
    expect(entry!.schedule).toBe("*/30 min");
  });
});

// ── CRONS map — jobs.ts export ────────────────────────────────────────────────

describe("CRONS map — jobs.ts export", () => {
  it("CRONS.pipelineWatchdog exists and matches default pattern", async () => {
    delete process.env["CRON_PIPELINE_WATCHDOG"];
    const { CRONS } = await import("../scheduler/jobs.js");
    expect(Object.keys(CRONS)).toContain("pipelineWatchdog");
    expect((CRONS as Record<string, string>).pipelineWatchdog).toBe("*/30 * * * *");
  });
});
