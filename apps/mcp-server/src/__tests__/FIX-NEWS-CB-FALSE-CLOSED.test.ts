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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "bun:test";
import { SourceHealthTracker } from "../domain/services/sourceHealthTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Root cause A — defaultPollNews() must never re-touch permanently-disabled
// sources after the one-time recordDisabled() seed at module load.
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-NEWS-CB-FALSE-CLOSED — defaultPollNews stub set excludes disabled sources", () => {
  it("defaultPollNews() function body no longer stubs reuters/tradingeconomics", () => {
    const srcPath = resolve(
      import.meta.dir,
      "../scheduler/news-analysis/intelligenceCycleJob.ts",
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
