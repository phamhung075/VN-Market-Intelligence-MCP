/**
 * BCT-OBS-02-FIX — sscCheck (20:00 VN nightly BCTC check) → WORK Telegram alert
 *
 * Root cause (RAW-verified from source, not a self-report): neither
 * `sscCheckerJob.ts` (`runSscCheck`) nor the application use case it wraps
 * (`checkSscReports.ts`) ever called a telegram sender — zero
 * `sendTelegram*`/`telegram` references across the entire git history of
 * both files (commits f3eeb9b7d..791b0e4dc). The nightly result was
 * therefore silently invisible to the WORK channel regardless of outcome
 * (VPS-only no-op skip, a full run, or an unhandled error).
 *
 * This fix makes `runSscCheck()` send exactly one summary message to WORK
 * per executed cycle, via an injectable `sendWorkAlertFn` (mirrors the
 * `bctcOverdueCheckJob.ts` FR-OBS-01-FIX precedent) — defaulting to
 * `sendTelegramWork` in production.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Temporarily override Bun.env for the duration of an async fn. */
async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const originals: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    originals[k] = Bun.env[k];
    if (v === undefined) delete Bun.env[k];
    else Bun.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(originals)) {
      if (v === undefined) delete Bun.env[k];
      else Bun.env[k] = v;
    }
  }
}

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  // Clear any seeded cron_job_runs rows so the T4 dedup guard starts fresh
  // for every test (each test seeds only what it needs).
  getDb().exec(`DELETE FROM cron_job_runs WHERE job_name = 'sscCheckerJob'`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BCT-OBS-02-FIX — runSscCheck() → WORK channel", () => {
  // ── AC-1: VPS-only no-op skip still posts a WORK summary ──────────────────
  it("AC-1: sends one WORK alert when ENABLE_LOCAL_BCTC_FETCH=false (VPS-only skip)", async () => {
    await withEnv({ ENABLE_LOCAL_BCTC_FETCH: "false" }, async () => {
      const { runSscCheck } = await import("../scheduler/news-analysis/sscCheckerJob.js");

      const sent: string[] = [];
      await runSscCheck({
        sendWorkAlertFn: async (msg) => {
          sent.push(msg);
          return true;
        },
      });

      expect(sent.length).toBe(1);
      expect(sent[0]).toContain("[ssc-check]");
      expect(sent[0]).toContain("skipped");
      expect(sent[0]).toContain("VPS-only");
    });
  });

  // ── AC-2: full run posts a WORK summary with the real result numbers ──────
  it("AC-2: sends one WORK alert with checked/newReports/alerts/errors when enableLocalBctcFetch=true", async () => {
    const { runSscCheck } = await import("../scheduler/news-analysis/sscCheckerJob.js");

    const sent: string[] = [];
    await runSscCheck({
      // mcpConfig is a module-level singleton loaded once at import time —
      // an env-var change mid-run cannot flip it (same limitation FIX-1281's
      // own suite documents). enableLocalBctcFetchOverride is the test-only
      // DI seam that lets this branch be exercised deterministically.
      enableLocalBctcFetchOverride: true,
      sendWorkAlertFn: async (msg) => {
        sent.push(msg);
        return true;
      },
      // Injected — no real DB/network hit, mirrors checkSscReports' own DI pattern.
      checkSscReportsFn: async () => ({
        checked: 3,
        newReports: 1,
        alerts: 1,
        errors: 0,
      }),
    });

    expect(sent.length).toBe(1);
    expect(sent[0]).toContain("[ssc-check]");
    expect(sent[0]).toContain("complete");
    expect(sent[0]).toContain("checked: 3");
    expect(sent[0]).toContain("newReports: 1");
    expect(sent[0]).toContain("alerts: 1");
    expect(sent[0]).toContain("errors: 0");
  });

  // ── AC-3: concurrency guard — overlapping invocation sends NO WORK alert ──
  it("AC-3: a second concurrent call is skipped (isRunning guard) and sends no WORK alert", async () => {
    const { runSscCheck } = await import("../scheduler/news-analysis/sscCheckerJob.js");

    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const sentFirst: string[] = [];
    const sentSecond: string[] = [];

    const firstCall = runSscCheck({
      enableLocalBctcFetchOverride: true,
      sendWorkAlertFn: async (msg) => { sentFirst.push(msg); return true; },
      checkSscReportsFn: async () => {
        await gate; // hold the first call "in flight"
        return { checked: 0, newReports: 0, alerts: 0, errors: 0 };
      },
    });

    // Give the first call a tick to set isRunning = true before firing the second.
    await new Promise((r) => setTimeout(r, 10));

    await runSscCheck({
      sendWorkAlertFn: async (msg) => { sentSecond.push(msg); return true; },
    });

    expect(sentSecond.length).toBe(0);

    releaseFirst();
    await firstCall;
    expect(sentFirst.length).toBe(1);
  });

  // ── AC-4: WORK send failure is non-fatal — runSscCheck() still resolves ───
  it("AC-4: does not throw when sendWorkAlertFn rejects", async () => {
    await withEnv({ ENABLE_LOCAL_BCTC_FETCH: "false" }, async () => {
      const { runSscCheck } = await import("../scheduler/news-analysis/sscCheckerJob.js");

      let called = false;
      await expect(
        runSscCheck({
          sendWorkAlertFn: async () => {
            called = true;
            throw new Error("telegram API down (mock)");
          },
        }),
      ).resolves.toBeUndefined();

      expect(called).toBe(true);
    });
  });

  // ── AC-5: T4 recovery-dedup skip sends NO WORK alert (already covered today) ──
  it("AC-5: sends no WORK alert when the T4 dedup guard already fired within cadence", async () => {
    await withEnv({ ENABLE_LOCAL_BCTC_FETCH: "false" }, async () => {
      const db = getDb();
      db.prepare(
        `INSERT INTO cron_job_runs (job_name, started_at, finished_at, status, rows_written, duration_ms)
         VALUES ('sscCheckerJob', datetime('now'), datetime('now'), 'success', 0, 5)`,
      ).run();

      const { runSscCheck } = await import("../scheduler/news-analysis/sscCheckerJob.js");

      const sent: string[] = [];
      await runSscCheck({ sendWorkAlertFn: async (msg) => { sent.push(msg); return true; } });

      expect(sent.length).toBe(0);
    });
  });
});
