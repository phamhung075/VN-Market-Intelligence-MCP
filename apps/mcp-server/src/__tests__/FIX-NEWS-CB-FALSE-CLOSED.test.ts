// apps/mcp-server/src/__tests__/FIX-NEWS-CB-FALSE-CLOSED.test.ts
// FIX-NEWS-CB-FALSE-CLOSED — Reuters RSS / Trading Economics permanently-disabled
// sources must stay "disabled" forever, and the SOURCE HEALTH table must not
// render two genuinely-distinct sources as an identical-looking duplicate row.
//
// Root cause A: intelligenceCycleJob.ts's defaultPollNews() re-injected no-op
// `reuters: async () => []` / `tradingeconomics: async () => []` stub fetchers
// on every scheduled 15-min tick. pollNews.ts's health loop treats a fulfilled-
// but-empty result from a source NOT in STUB_CAPABLE_KEYS as a real failure —
// so every tick silently overwrote the one-time recordDisabled("Reuters RSS") /
// recordDisabled("Trading Economics") seed (sourceHealthTools.ts) with an
// ever-incrementing recordFailure(), permanently masking the "disabled" status
// as "down" with zero successes ever recorded. Fix: stop injecting those two
// keys — pollNews.ts's own Sprint-1833g resolvedFetchers contract already
// excludes reuters/tradingeconomics from scheduled production runs UNLESS the
// caller explicitly provides a fetcher for them.
//
// Root cause B: formatSourceHealthTable() truncates the Nguồn column to a
// fixed 18 chars. "Trading Economics" (17 chars) and "Trading Economics News"
// (22 chars) both truncate to the identical 18-char string "Trading Economics ",
// so two genuinely-distinct tracked sources render as a byte-identical
// duplicate-looking row. Fix: widen the column so known source names are not
// visually collapsed into each other.
//
// Root cause A — SECOND call site (2026-07-08): pushNewsHandler.ts's
// handlePushNews() had its OWN independent `reuters: async () => []` /
// `tradingeconomics: async () => []` stub injection into pollNews(), fired
// on EVERY VPS POST /api/push-news event (far more frequent than the 15-min
// scheduled cycle) — a bug commit aa87cfe05 never touched because it only
// patched intelligenceCycleJob.ts's defaultPollNews (the scheduled-cron call
// site). Live-confirmed still reproducing post-rebuild+swap: Reuters RSS /
// Trading Economics showed climbing "Suy giảm" (degraded) counts within ~2
// minutes of a fresh restart. Fix: same pattern — omit the two keys entirely
// from pushNewsHandler.ts's fetchers object.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { SourceHealthTracker } from "../domain/services/sourceHealthTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Root cause A — defaultPollNews() must never re-touch permanently-disabled
// sources after the one-time recordDisabled() seed at module load.
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-NEWS-CB-FALSE-CLOSED — defaultPollNews stub set excludes disabled sources", () => {
  it("defaultPollNews() function body no longer stubs reuters/tradingeconomics", () => {
    // FACTORY-SCHEDULER-split-intelligenceCycleJob: defaultPollNews now lives
    // in its own module (extracted from intelligenceCycleJob.ts, verbatim
    // body — same source-text assertions still apply at the new location).
    const srcPath = resolve(
      import.meta.dir,
      "../scheduler/news-analysis/intelligenceCycle/defaults/defaultPollNews.ts",
    );
    const src = readFileSync(srcPath, "utf-8");

    const fnBodyStart = src.indexOf("async function defaultPollNews");
    expect(fnBodyStart).toBeGreaterThan(-1);
    const fnBodyEnd = src.indexOf("\n}\n", fnBodyStart) + 3;
    const fnBody = src.slice(fnBodyStart, fnBodyEnd);

    // Permanently-disabled legacy sources (Sprint 1833g / 1898b) must NOT be
    // re-injected as stub fetchers — that overwrites recordDisabled() with
    // recordFailure() on every scheduled tick (this task's root cause).
    expect(fnBody).not.toMatch(/\breuters\s*:/);
    expect(fnBody).not.toMatch(/\btradingeconomics\s*:/);

    // Still-active local sources remain stubbed (VPS push / Task 1843 CPU
    // protection reasons are unrelated to this fix and must not regress).
    expect(fnBody).toContain("cafef:");
    expect(fnBody).toContain("vnexpress:");
    expect(fnBody).toContain("vneconomy:");
    expect(fnBody).toContain("teChromiumNews:");
  });

  it("pollNews() with the fixed default stub set never touches Reuters RSS / Trading Economics health", async () => {
    Bun.env["DB_PATH"] = ":memory:";
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const { globalSourceTracker, _resetGlobalSourceTracker } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    _resetGlobalSourceTracker();
    globalSourceTracker.recordDisabled("Reuters RSS");
    globalSourceTracker.recordDisabled("Trading Economics");

    // This mirrors the FIXED defaultPollNews() fetcher set — no reuters/
    // tradingeconomics keys at all (matches pollNews.ts's own resolvedFetchers
    // contract: those two keys are only added when explicitly provided).
    await pollNews({
      fetchers: {
        cafef: async () => [],
        vnexpress: async () => [],
        vneconomy: async () => [],
        teChromiumNews: async () => [],
      },
      watchlist: [],
    });

    const reutersHealth = globalSourceTracker.getHealth("Reuters RSS");
    expect(reutersHealth.status).toBe("disabled");
    expect(reutersHealth.consecutiveFailures).toBe(0);

    const teHealth = globalSourceTracker.getHealth("Trading Economics");
    expect(teHealth.status).toBe("disabled");
    expect(teHealth.consecutiveFailures).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Root cause B — formatSourceHealthTable must not collapse two distinct
// sources into an identical-looking row.
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-NEWS-CB-FALSE-CLOSED — SOURCE HEALTH table no longer collides long names", () => {
  it("'Trading Economics' and 'Trading Economics News' render as two visually distinct rows", async () => {
    const { formatSourceHealthTable } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    const tracker = new SourceHealthTracker();
    tracker.recordDisabled("Trading Economics");
    for (let i = 0; i < 79; i++) {
      tracker.recordFailure("Trading Economics News", "empty result — no items returned");
    }

    const output = formatSourceHealthTable(tracker.getAllHealth());
    const lines = output.split("\n").filter((l) => l.includes("Trading Economics"));

    // Two rows are present (both sources tracked)...
    expect(lines.length).toBe(2);
    // ...but they must not be byte-identical — that was the duplicate-row bug.
    expect(lines[0]).not.toBe(lines[1]);
    // The longer name must be fully visible, not truncated away.
    expect(output).toContain("Trading Economics News");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Root cause A — SECOND call site: pushNewsHandler.ts's handlePushNews() must
// never re-touch permanently-disabled sources either (this fires on every
// VPS push, not just the 15-min scheduled cycle — the exact gap aa87cfe05
// left open).
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-NEWS-CB-FALSE-CLOSED — pushNewsHandler (2nd call site) stub set excludes disabled sources", () => {
  it("handlePushNews() fetchers object no longer stubs reuters/tradingeconomics", () => {
    const srcPath = resolve(
      import.meta.dir,
      "../interface/mcp/routes/pushNewsHandler.ts",
    );
    const src = readFileSync(srcPath, "utf-8");

    const fnBodyStart = src.indexOf("export async function handlePushNews");
    expect(fnBodyStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnBodyStart);

    // Permanently-disabled legacy sources must NOT be re-injected as stub
    // fetchers here either — this call site fires on EVERY VPS push event,
    // far more often than the 15-min scheduled cycle, so the overwrite bug
    // is even more severe than the first call site.
    expect(fnBody).not.toMatch(/\breuters\s*:\s*async/);
    expect(fnBody).not.toMatch(/\btradingeconomics\s*:\s*async/);

    // The dynamic bySource spread (forwarding VPS-pushed source keys) must
    // remain intact — this fix only removes the extra hardcoded stub keys.
    expect(fnBody).toContain("Object.keys(bySource)");
  });

  it("handlePushNews() never calls recordFailure on Reuters RSS / Trading Economics after a VPS push cycle", async () => {
    Bun.env["DB_PATH"] = ":memory:";
    Bun.env["VPS_PUSH_API_KEY"] = "test-key-fix-news-cb-2nd-site";
    // CI-NETWORK-SKIP-GUARDS: pollNews.ts's resolvedFetchers falls back to the
    // REAL production teChromiumNews/newsapi fetchers when the caller does not
    // provide those keys (only cafef/vnexpress/vneconomy are provided here, as
    // a real VPS push would). Force the existing CI no-op gate so this test
    // stays hermetic (no live network calls / no multi-second Puppeteer retry).
    const prevCi = Bun.env["CI"];
    Bun.env["CI"] = "true";

    const { initDatabase, getDb, closeDb } = await import("../infrastructure/db/schema.js");
    const { handlePushNews } = await import("../interface/mcp/routes/pushNewsHandler.js");
    const { globalSourceTracker, _resetGlobalSourceTracker } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    await initDatabase();
    _resetGlobalSourceTracker();
    globalSourceTracker.recordDisabled("Reuters RSS");
    globalSourceTracker.recordDisabled("Trading Economics");

    // Typical VPS push-news payload — no reuters/tradingeconomics items
    // (VPS never sends those two; the bug was that the handler stubbed them
    // unconditionally regardless of what the VPS actually pushed). Includes
    // vneconomy too, so that key also resolves to an explicit no-op instead
    // of falling back to the real defaultVnEconomyFetcher network call.
    const items = [
      {
        title: "CafeF article",
        url: "https://cafef.vn/fix-news-cb-2nd-site-a",
        publishedAt: new Date().toISOString(),
        content: "nội dung",
        source: "cafef",
      },
      {
        title: "VnExpress article",
        url: "https://vnexpress.net/fix-news-cb-2nd-site-b",
        publishedAt: new Date().toISOString(),
        content: "content",
        source: "vnexpress",
      },
      {
        title: "VnEconomy article",
        url: "https://vneconomy.vn/fix-news-cb-2nd-site-c",
        publishedAt: new Date().toISOString(),
        content: "nội dung",
        source: "vneconomy",
      },
    ];

    const req = makeReq(JSON.stringify(items), "test-key-fix-news-cb-2nd-site");
    const res = makeRes();
    const silentLog = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } as unknown as Parameters<typeof handlePushNews>[3];

    await handlePushNews(
      req,
      res as unknown as ServerResponse,
      getDb(),
      silentLog,
    );
    expect(res.statusCode).toBe(200);

    // The setImmediate fire-and-forget pollNews cycle records source health
    // (recordSuccess/recordFailure/recordDisabled) EARLY — well before its
    // slow per-item ragInsert/LanceDB-embed loop (which can take several real
    // seconds per item and is irrelevant to this test). Poll on CafeF RSS's
    // lastSuccessAt flipping from null instead of waiting for the whole
    // pipeline (fetched/inserted/embedded) to finish — fast and hermetic.
    const deadline = Date.now() + 10_000;
    while (
      globalSourceTracker.getHealth("CafeF RSS").lastSuccessAt === null &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(globalSourceTracker.getHealth("CafeF RSS").lastSuccessAt).not.toBeNull();

    const reutersHealth = globalSourceTracker.getHealth("Reuters RSS");
    expect(reutersHealth.status).toBe("disabled");
    expect(reutersHealth.consecutiveFailures).toBe(0);

    const teHealth = globalSourceTracker.getHealth("Trading Economics");
    expect(teHealth.status).toBe("disabled");
    expect(teHealth.consecutiveFailures).toBe(0);

    if (prevCi === undefined) delete Bun.env["CI"];
    else Bun.env["CI"] = prevCi;
    closeDb();
  }, 15_000);
});

// ─── Minimal HTTP mock helpers (mirrors 1892a/1892b pushNewsHandler tests) ──

function makeReq(body: string, apiKey?: string | null): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  const headers: Record<string, string | undefined> = {};
  if (apiKey !== null) {
    headers["x-api-key"] = apiKey ?? undefined;
  }
  const req = {
    headers,
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<{ value: string; done: boolean }> {
          if (idx < chunks.length) {
            return Promise.resolve({ value: chunks[idx++]!, done: false });
          }
          return Promise.resolve({ value: "", done: true });
        },
      };
    },
  } as unknown as IncomingMessage;
  return req;
}

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  writeHead(code: number, headers?: Record<string, string>): void;
  end(data?: string): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: "",
    headers: {},
    writeHead(code, headers = {}) {
      res.statusCode = code;
      Object.assign(res.headers, headers);
    },
    end(data = "") {
      res.body += data;
    },
  };
  return res;
}
