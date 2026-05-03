/**
 * Task 1829b — TDD: te-chromium CB state persisted across restarts
 *
 * Covers:
 *   AC-CB-persist-1  Cold start: when state file does not exist, counter is 0.
 *   AC-CB-persist-2  After N failures, state file contains { consecutiveErrors: N, alertSent: false }.
 *   AC-CB-persist-3  After success following failures, state file is reset to
 *                    { consecutiveErrors: 0, alertSent: false }.
 *   AC-CB-persist-4  When state file has a pre-existing count, the counter loads
 *                    from file and continues accumulating.
 *
 * All tests inject cbStatePath (and cachePath) pointing at a temp directory
 * so they never touch /app/data/ and remain fully isolated from each other.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  fetchTradingEconomicsNews,
  resetTeChromiumFailureCounter,
  type TeNewsDeps,
  type TeCbState,
} from "../infrastructure/fetchers/tradingEconomicsChromium.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "te-1829b-test-"));
}

function readCbState(statePath: string): TeCbState {
  const raw = fs.readFileSync(statePath, "utf-8");
  return JSON.parse(raw) as TeCbState;
}

function makeHtml(): string {
  return `<html><body><ul id="stream">
    <li class="te-stream-item">
      <div class="te-stream-title-div"><a href="/v/1">Vietnam GDP rises</a></div>
      <span class="te-stream-item-description">Economy expands in Q1.</span>
      <small class="te-stream-date">2 hours ago</small>
      <a class="badge te-stream-category">GDP</a>
    </li>
  </ul></body></html>`;
}

const targetClosedScrape: TeNewsDeps["scrape"] = async () => {
  throw new Error("Protocol error (Runtime.callFunctionOn): Target closed");
};

/** No-op sleep injected in tests to bypass real exponential backoff waits (Sprint 1833g). */
const noopSleep: TeNewsDeps["sleepMs"] = async (_ms: number): Promise<void> => { /* instant */ };

// ─────────────────────────────────────────────────────────────────────────────
// Reset shared state before each test
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;
let cachePath: string;
let cbStatePath: string;

beforeEach(() => {
  tmpDir = makeTmpDir();
  cachePath = path.join(tmpDir, "te-news-cache.json");
  cbStatePath = path.join(tmpDir, "te-chromium-cb-state.json");
  // Ensure the state file does NOT exist at the start of each test
  if (fs.existsSync(cbStatePath)) fs.unlinkSync(cbStatePath);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-CB-persist-1: Cold start — counter starts at 0 when no file exists
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-CB-persist-1: cold start — no state file → counter starts at 0", () => {
  it("state file does not exist before first call; first failure creates file with consecutiveErrors=1", async () => {
    expect(fs.existsSync(cbStatePath)).toBe(false);

    // One Target-closed failure
    await fetchTradingEconomicsNews(20, {
      scrape: targetClosedScrape,
      cachePath,
      cbStatePath,
      sleepMs: noopSleep,
    });

    // File should now exist with consecutiveErrors = 1 (started from 0)
    expect(fs.existsSync(cbStatePath)).toBe(true);
    const state = readCbState(cbStatePath);
    expect(state.consecutiveErrors).toBe(1);
    expect(state.alertSent).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-CB-persist-2: After N failures, file has consecutiveErrors = N
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-CB-persist-2: after N failures, state file reflects count", () => {
  it("state file shows consecutiveErrors=2 after 2 Target-closed failures", async () => {
    for (let i = 0; i < 2; i++) {
      await fetchTradingEconomicsNews(20, {
        scrape: targetClosedScrape,
        cachePath,
        cbStatePath,
        sleepMs: noopSleep,
      });
    }

    const state = readCbState(cbStatePath);
    expect(state.consecutiveErrors).toBe(2);
    expect(state.alertSent).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-CB-persist-3: Success resets file to { consecutiveErrors: 0, alertSent: false }
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-CB-persist-3: success resets state file", () => {
  it("after 2 failures then a success, file is reset to zero", async () => {
    // 2 failures first
    for (let i = 0; i < 2; i++) {
      await fetchTradingEconomicsNews(20, {
        scrape: targetClosedScrape,
        cachePath,
        cbStatePath,
        sleepMs: noopSleep,
      });
    }

    // One success (use a fresh cache path so we don't get a cached response)
    const freshCachePath = path.join(tmpDir, "te-news-fresh.json");
    let callCount = 0;
    const successScrape: TeNewsDeps["scrape"] = async () => {
      callCount++;
      return makeHtml();
    };

    await fetchTradingEconomicsNews(20, {
      scrape: successScrape,
      cachePath: freshCachePath,
      cbStatePath,
    });

    expect(callCount).toBeGreaterThan(0); // scrape was actually called

    const state = readCbState(cbStatePath);
    expect(state.consecutiveErrors).toBe(0);
    expect(state.alertSent).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-CB-persist-4: Pre-existing file count is loaded and accumulated
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-CB-persist-4: pre-existing state file is loaded and accumulated", () => {
  it("starts from pre-existing count of 2 and increments to 3 after one more failure", async () => {
    // Simulate the state left by a previous container instance.
    // Omit lastFailureWindowStartMs to test backward-compat loading (old file format).
    const preExisting: Omit<TeCbState, "lastFailureWindowStartMs"> = { consecutiveErrors: 2, alertSent: false };
    fs.mkdirSync(path.dirname(cbStatePath), { recursive: true });
    fs.writeFileSync(cbStatePath, JSON.stringify(preExisting), "utf-8");

    // One more failure — should go from 2 → 3 (tripping the circuit)
    let scrapeCallCount = 0;
    const alwaysFail: TeNewsDeps["scrape"] = async () => {
      scrapeCallCount++;
      throw new Error("Target closed");
    };
    const workAlerts: string[] = [];
    const mockAlert = async (msg: string): Promise<void> => { workAlerts.push(msg); };

    await fetchTradingEconomicsNews(20, {
      scrape: alwaysFail,
      cachePath,
      cbStatePath,
      onCircuitOpen: mockAlert,
      sleepMs: noopSleep,
    });

    const state = readCbState(cbStatePath);
    expect(state.consecutiveErrors).toBe(3);

    // Circuit should now be locked — next call skips scrape
    const countBeforeLock = scrapeCallCount;
    await fetchTradingEconomicsNews(20, {
      scrape: alwaysFail,
      cachePath,
      cbStatePath,
      onCircuitOpen: mockAlert,
      sleepMs: noopSleep,
    });
    expect(scrapeCallCount).toBe(countBeforeLock); // no additional scrape

    // Alert should have fired exactly once (on the threshold-crossing call)
    expect(workAlerts.length).toBe(1);
  });
});
