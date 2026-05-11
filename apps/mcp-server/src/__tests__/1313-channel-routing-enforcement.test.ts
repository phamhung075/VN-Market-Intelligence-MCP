Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const SCHEDULER_DIR = path.resolve(import.meta.dir, "../scheduler");

/**
 * TASK-1313: Channel routing enforcement — static-analysis guard tests.
 *
 * Purpose: prevent future commits from routing infrastructure/system
 * messages to the MARKET channel. Zero violations in current codebase
 * means these tests PASS immediately and serve as regression guards.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function readNoComments(absPath: string): string {
  const src = fs.readFileSync(absPath, "utf8");
  return src
    .split("\n")
    .filter(
      (line) =>
        !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")
    )
    .join("\n");
}

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getAllTsFiles(full));
    else if (entry.name.endsWith(".ts")) results.push(full);
  }
  return results;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("TASK-1313: channel routing enforcement", () => {
  // ── Test 1: watchdog jobs never invoke sendTelegramMarket ──────────────────

  describe("Test 1 — Watchdog jobs never invoke sendTelegramMarket", () => {
    // Verified paths from pre-write checks:
    //   vpsProxyWatchdogJob.ts        → root of scheduler/
    //   freshnessSlaMonitorJob.ts     → scheduler/system/
    //   pipelineWatchdogJob.ts        → root of scheduler/
    const WATCHDOG_FILES = [
      "vpsProxyWatchdogJob.ts",
      "system/freshnessSlaMonitorJob.ts",
      "pipelineWatchdogJob.ts",
    ];

    for (const relPath of WATCHDOG_FILES) {
      it(`${relPath} has no sendTelegramMarket invocation`, () => {
        const absPath = path.join(SCHEDULER_DIR, relPath);
        const noComments = readNoComments(absPath);

        // Strip import lines — dead imports are a cleanup issue, not a routing violation
        const noImports = noComments.replace(/^import\s+.+$/gm, "");

        // Match actual call: sendTelegramMarket( — parenthesis required
        const callPattern = /sendTelegramMarket\s*\(/g;
        const calls = noImports.match(callPattern) ?? [];

        expect(calls.length).toBe(0);
      });
    }
  });

  // ── Test 2: server.ts system alerts use work channel only ──────────────────

  describe("Test 2 — server.ts system alerts use work channel only", () => {
    const SERVER_PATH = path.resolve(
      import.meta.dir,
      "../interface/mcp/server.ts"
    );

    it("server.ts sendTelegramMarket calls are limited to user-reply paths (line >= 300)", () => {
      const src = fs.readFileSync(SERVER_PATH, "utf8");
      const lines = src.split("\n");

      // Find all actual sendTelegramMarket( calls (exclude comments and imports)
      const marketCallLines = lines
        .map((line, i) => ({ line, num: i + 1 }))
        .filter(
          ({ line }) =>
            /sendTelegramMarket\s*\(/.test(line) &&
            !line.trimStart().startsWith("//") &&
            !line.trimStart().startsWith("*") &&
            !line.includes("import ")
        );

      // System init / error handlers are before line 300.
      // Market calls before line 300 indicate a routing violation.
      const systemAreaCalls = marketCallLines.filter(({ num }) => num < 300);

      expect(systemAreaCalls).toHaveLength(0);
    });

    it("server.ts has no raw channel='market' string near error/system keywords", () => {
      const src = fs.readFileSync(SERVER_PATH, "utf8");

      // Detect pattern: error-handling keyword followed within 200 chars by channel:"market"
      const errorMarketPattern =
        /(?:catch|error|Error|throw|SIGTERM|process\.on)[^;]{0,200}channel\s*[:=]\s*["']market["']/s;

      expect(errorMarketPattern.test(src)).toBe(false);
    });
  });

  // ── Test 3: sendTelegramMarket callers are whitelisted ─────────────────────

  describe("Test 3 — sendTelegramMarket callers are whitelisted", () => {
    it("only whitelisted scheduler files may call sendTelegramMarket", () => {
      // Files verified as legitimate MARKET channel senders.
      // Update this list via policy review — do not expand silently.
      const ALLOWED_SENDERS = new Set([
        "briefings/morningBriefingJob.ts",
        "briefings/eveningSummaryJob.ts",
        "briefings/franceSummaryJob.ts",
        "macro/calibrationReportJob.ts",
        "portfolio/weeklyPortfolioReportJob.ts",
        // weatherCheckJob sends climate/energy HIGH/CRITICAL alerts to MARKET (user-facing, not dev-only)
        "weatherCheckJob.ts",
        // taAlertNotifierJob delivers user-facing TA alerts via default sendFn — correct MARKET routing per fix/1296
        "market-data/taAlertNotifierJob.ts",
        // Alert Commander pipeline jobs write to DB; Commander dispatches to market
        // intelligenceCycleJob sends market-wide cascade summary to MARKET channel (Task 1345d)
        "news-analysis/intelligenceCycleJob.ts",
        // bctcBatchSweepJob sends completion digest to MARKET channel after earnings season sweep (Task 1841b)
        "financial-reports/bctcBatchSweepJob.ts",
      ]);

      const allTs = getAllTsFiles(SCHEDULER_DIR);
      const violators: string[] = [];

      for (const absPath of allTs) {
        const rel = path.relative(SCHEDULER_DIR, absPath);
        if (ALLOWED_SENDERS.has(rel)) continue;

        const noComments = readNoComments(absPath);

        // Strip import lines — dead imports are not routing violations
        const noImports = noComments.replace(/^import\s+.+$/gm, "");

        if (/sendTelegramMarket\s*\(/.test(noImports)) {
          violators.push(rel);
        }
      }

      // On failure: a new file called sendTelegramMarket without policy review.
      // Fix: either add to ALLOWED_SENDERS (with justification) or change to sendTelegramWork.
      expect(violators).toEqual([]);
    });
  });
});
