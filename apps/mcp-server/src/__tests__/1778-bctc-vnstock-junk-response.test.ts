/**
 * Task 1778 — BCTC URL resolution: handle vnstock box-drawing/junk response
 *
 * Tests:
 * 1. VPS Playwright endpoint returning box-drawing junk → extractVpsPlaywrightUrls returns []
 *    (was: uncaught parse error OR silent empty with no log; now: explicit junk detection)
 * 2. VPS Playwright endpoint returning ANSI-only response → returns []
 * 3. VPS Playwright endpoint returning valid JSON → returns PDF URLs normally
 * 4. discoverHosePdfUrls with injected junk VPS fetch → falls through to next strategy
 * 5. discoverHosePdfUrls with all-junk fetches → returns { urls: [], source: null }
 */

Bun.env["DB_PATH"] = ":memory:";
Bun.env["BCTC_DISCOVER_URL"] = "http://test-vps/bctc-discover";

import { describe, it, expect } from "bun:test";
import {
  discoverHosePdfUrls,
  stripAnsiJunk,
} from "../domain/services/bctcDiscovery.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test 1–3: stripAnsiJunk helper (exported from bctcDiscovery)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1778 — stripAnsiJunk (bctcDiscovery domain helper)", () => {
  it("1. Box-drawing character response → { junk: true }", () => {
    const raw =
      "╭─────────────────────────────────────╮\n" +
      "│  Fetching data from VCI, please wait │\n" +
      "╰─────────────────────────────────────╯";
    const result = stripAnsiJunk(raw);
    expect(result.junk).toBe(true);
    expect(result.cleaned).toBe("");
  });

  it("2. ANSI escape + box-drawing response → { junk: true }", () => {
    const raw =
      "\x1b[0m\x1b[32m╭──────────────────────────╮\x1b[0m\n" +
      "\x1b[32m│\x1b[0m  Loading...  \x1b[32m│\x1b[0m\n" +
      "\x1b[32m╰──────────────────────────╯\x1b[0m";
    const result = stripAnsiJunk(raw);
    expect(result.junk).toBe(true);
  });

  it("3. Valid JSON string → { junk: false, cleaned: <json> }", () => {
    const json = '{"results":[{"url":"https://example.com/FPT-Q4.pdf","source":"ssc","confidence":0.9}],"error":null}';
    const result = stripAnsiJunk(json);
    expect(result.junk).toBe(false);
    expect(result.cleaned).toBe(json);
  });

  it("3b. Empty string → { junk: false, isNull: true }", () => {
    const result = stripAnsiJunk("");
    expect(result.isNull).toBe(true);
    expect(result.junk).toBe(false);
  });

  it("3c. Non-JSON first char → { junk: true }", () => {
    const result = stripAnsiJunk("Error: rate limited by VCI server");
    expect(result.junk).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests 4–5: discoverHosePdfUrls integration with junk guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1778 — discoverHosePdfUrls junk guard integration", () => {
  const junkResponse = async (_url: string, _timeout: number): Promise<string> => {
    return (
      "╭─────────────────────────────────────────╮\n" +
      "│  Fetching VCI data, please wait...      │\n" +
      "╰─────────────────────────────────────────╯"
    );
  };

  const validSscResponse = async (_url: string, _timeout: number): Promise<string> => {
    return JSON.stringify([
      { fileUrl: "https://iboard-query.ssc.vn/docs/FPT-Q4-2025.pdf" },
    ]);
  };

  it("4. Junk VPS response returns empty result (SSC removed TASK_1944b)", async () => {
    // TASK_1944b: SSC strategy removed. Junk VPS → VPS extracts [] → no other live strategy.
    const result = await discoverHosePdfUrls("FPT", {
      _fetchVpsPlaywright: junkResponse,
      _fetchSsc: validSscResponse,  // deprecated no-op
      _fetchCafef: async () => "[]", // deprecated no-op
      _fetchVietstock: async () => "",// deprecated no-op
    });

    // Junk VPS + SSC removed → all strategies exhausted → null
    expect(result.source).toBeNull();
    expect(result.urls).toHaveLength(0);
  });

  it("5. All sources return junk → { urls: [], source: null }", async () => {
    const result = await discoverHosePdfUrls("FPT", {
      _fetchVpsPlaywright: junkResponse,
      _fetchSsc: junkResponse,
      _fetchCafef: junkResponse,
      _fetchVietstock: junkResponse,
    });

    expect(result.urls).toHaveLength(0);
    expect(result.source).toBeNull();
  });
});
