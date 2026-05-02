/**
 * Task 1823d — TDD: te-chromium-news crash loop circuit breaker
 *
 * Covers:
 *   AC-1  After MAX_CONSECUTIVE_FAILURES consecutive "Target closed" failures,
 *         the next call returns [] immediately without invoking scrape.
 *   AC-2  A success resets the consecutive-failure counter so scraping resumes.
 *   AC-3  The Telegram WORK alert fires exactly once when the threshold is crossed
 *         (not on every subsequent call while locked).
 *   AC-4  Non-"Target closed" errors do NOT increment the consecutive-failure counter
 *         (they are handled by the existing try/catch path, not the crash-loop guard).
 *   AC-5  resetTeChromiumFailureCounter() resets the module-level counter (test helper).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  fetchTradingEconomicsNews,
  resetTeChromiumFailureCounter,
  type TeNewsDeps,
} from "../infrastructure/fetchers/tradingEconomicsChromium.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "te-1823d-test-"));
}

function makeHtml(): string {
  return `<html><body><ul id="stream">
    <li class="te-stream-item">
      <div class="te-stream-title-div"><a href="/v/1">Title 1</a></div>
      <span class="te-stream-item-description">Summary 1</span>
      <small class="te-stream-date">1 hour ago</small>
      <a class="badge te-stream-category">GDP</a>
    </li>
  </ul></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset module counter before each test
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetTeChromiumFailureCounter();
});

afterEach(() => {
  resetTeChromiumFailureCounter();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: After MAX failures, scrape is bypassed (circuit locked)
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-1: te-chromium crash loop — scrape bypassed after max failures", () => {
  it("does not call scrape once consecutive Target-closed failures reach threshold", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news.json");

    let scrapeCallCount = 0;
    // Every call throws Target closed
    const alwaysFail: TeNewsDeps["scrape"] = async () => {
      scrapeCallCount++;
      throw new Error("Protocol error (Runtime.callFunctionOn): Target closed");
    };

    const workAlerts: string[] = [];
    const mockAlert = async (msg: string): Promise<void> => { workAlerts.push(msg); };

    // Exhaust the threshold (4 consecutive failures with 2-attempt inner retry = 4 scrape calls each pair)
    // fetchTradingEconomicsNews retries once internally on Target closed, so each call = 2 scrape attempts.
    // We need ceil(MAX_CONSECUTIVE_FAILURES / 1) top-level calls to trip the counter.
    // MAX_CONSECUTIVE_FAILURES = 3 top-level failures → circuit locks
    for (let i = 0; i < 3; i++) {
      await fetchTradingEconomicsNews(20, { scrape: alwaysFail, cachePath, onCircuitOpen: mockAlert });
    }

    const countBeforeLock = scrapeCallCount;
    // Next call should be blocked — scrape should NOT be called again
    await fetchTradingEconomicsNews(20, { scrape: alwaysFail, cachePath, onCircuitOpen: mockAlert });

    expect(scrapeCallCount).toBe(countBeforeLock); // no additional scrape call
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: Success resets counter — scraping resumes
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-2: te-chromium crash loop — success resets counter", () => {
  it("resumes scraping after a successful call resets the failure counter", async () => {
    // Use separate cache paths to avoid a fresh successful cache being served
    // by the "check after reset" call (which would bypass the scrape).
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news.json");
    const freshCachePath = path.join(tmpDir, "te-news-fresh.json");

    // Drive 2 Target-closed failures (below threshold of 3)
    let failCount = 0;
    const mixedScrape: TeNewsDeps["scrape"] = async () => {
      if (failCount < 2) {
        failCount++;
        throw new Error("Target closed");
      }
      return makeHtml();
    };

    for (let i = 0; i < 2; i++) {
      await fetchTradingEconomicsNews(20, { scrape: mixedScrape, cachePath });
    }
    // 1 success — resets counter
    await fetchTradingEconomicsNews(20, { scrape: mixedScrape, cachePath });

    // After the success counter is reset to 0.
    // A fresh failure on a separate (empty) cache path should invoke scrape.
    let extraCalls = 0;
    const oneMoreFail: TeNewsDeps["scrape"] = async () => {
      extraCalls++;
      throw new Error("Target closed");
    };
    await fetchTradingEconomicsNews(20, { scrape: oneMoreFail, cachePath: freshCachePath });

    expect(extraCalls).toBeGreaterThan(0); // scrape was invoked — circuit not locked
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: WORK alert fires exactly once at threshold crossing
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-3: te-chromium crash loop — WORK alert fires once at threshold", () => {
  it("onCircuitOpen callback is called exactly once when threshold is crossed", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news.json");

    const alwaysFail: TeNewsDeps["scrape"] = async () => {
      throw new Error("Target closed");
    };

    const workAlerts: string[] = [];
    const mockAlert = async (msg: string): Promise<void> => { workAlerts.push(msg); };

    // 3 top-level failures to trip + 2 extra calls while locked
    for (let i = 0; i < 5; i++) {
      await fetchTradingEconomicsNews(20, { scrape: alwaysFail, cachePath, onCircuitOpen: mockAlert });
    }

    expect(workAlerts.length).toBe(1); // fired exactly once
    expect(workAlerts[0]).toContain("te-chromium-news"); // message identifies the source
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: Non-Target-closed errors do not increment crash-loop counter
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-4: non-Target-closed errors do not count toward crash-loop threshold", () => {
  it("scrape is still invoked after 5 generic network errors", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news.json");

    let scrapeCallCount = 0;
    const networkFail: TeNewsDeps["scrape"] = async () => {
      scrapeCallCount++;
      throw new Error("ECONNREFUSED");
    };

    // 5 generic failures
    for (let i = 0; i < 5; i++) {
      await fetchTradingEconomicsNews(20, { scrape: networkFail, cachePath });
    }

    const countAt5 = scrapeCallCount;
    // Should still invoke scrape on 6th call
    await fetchTradingEconomicsNews(20, { scrape: networkFail, cachePath });
    expect(scrapeCallCount).toBeGreaterThan(countAt5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: resetTeChromiumFailureCounter exported correctly
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-5: resetTeChromiumFailureCounter resets the module-level counter", () => {
  it("after reset, circuit is no longer locked even if it was", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news.json");

    let scrapeCallCount = 0;
    const alwaysFail: TeNewsDeps["scrape"] = async () => {
      scrapeCallCount++;
      throw new Error("Target closed");
    };

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await fetchTradingEconomicsNews(20, { scrape: alwaysFail, cachePath });
    }

    resetTeChromiumFailureCounter();

    const countBeforeReset = scrapeCallCount;
    await fetchTradingEconomicsNews(20, { scrape: alwaysFail, cachePath });
    expect(scrapeCallCount).toBeGreaterThan(countBeforeReset); // scrape was called again
  });
});
