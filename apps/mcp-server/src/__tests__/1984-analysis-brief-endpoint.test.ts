/**
 * Task 1984 — GET /api/analysis-brief/:ticker endpoint (MAW-P0-3)
 *
 * AC-1:  parseAnalysisBriefSections correctly extracts all 4 canonical sections
 * AC-2:  parseAnalysisBriefSections returns empty string for absent section
 * AC-3:  parseAnalysisBriefSections ignores non-canonical H2 headings
 * AC-4:  readAnalysisBrief returns null for missing file (ENOENT → 404)
 * AC-5:  readAnalysisBrief returns AnalysisBriefDto with ticker, sections, raw, updatedAt
 * AC-6:  readAnalysisBrief normalises ticker to uppercase
 * AC-7:  readAnalysisBrief returns null for invalid ticker (path traversal guard)
 * AC-8:  handleGetAnalysisBrief returns 200 JSON for an existing brief
 * AC-9:  handleGetAnalysisBrief returns 404 JSON for a missing ticker
 * AC-10: handleGetAnalysisBrief returns 400 JSON for empty ticker
 * AC-11: updatedAt in the response is a valid ISO 8601 string
 */

import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseAnalysisBriefSections,
  readAnalysisBrief,
} from "../infrastructure/fileStore/analysisBriefReader.js";
import { handleGetAnalysisBrief } from "../interface/mcp/routes/analysisBriefHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_BRIEF = `# VCB — Analysis Ledger 2026
**Exchange**: HOSE

## [Report Analyzer] Fundamentals & Valuation

Revenue strong (+18.1%) but net profit flat.

Signal: fundamental_validation #3125 | Confidence: 0.65

## [News Scout] Headlines & Sentiment

No major headlines this week.

## [Market Watcher] Price, Volume, Technicals
2026-06-09 16:10 | Close: 61,500 VND | RSI: 52.8 | Vol: 2.56M

## [Unified Agent] Quarterly Syntheses
2026-05-14 16:00 | Close: 61,000 VND | RSI: N/A | YoY: N/A
`;

const BRIEF_ONLY_SOME_SECTIONS = `# HPG — Analysis Ledger

## [Market Watcher] Price, Volume, Technicals
2026-06-01 | Close: 26,500 VND

## [Insider Tracker] Management Activity
No activity.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a temporary project-root directory structure with a brief file. */
function makeTempProject(ticker: string, content: string): string {
  const projectRoot = mkdtempSync(join(tmpdir(), "maw-test-"));
  const briefsDir = join(projectRoot, "docs", "analysis-briefs");
  mkdirSync(briefsDir, { recursive: true });
  writeFileSync(join(briefsDir, `${ticker.toUpperCase()}.md`), content, "utf-8");
  return projectRoot;
}

/** Minimal mock ServerResponse. */
function makeMockRes() {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) { this.body = data; },
  };
  return mock;
}

const FAKE_REQ = {} as import("node:http").IncomingMessage;

// ─────────────────────────────────────────────────────────────────────────────
// parseAnalysisBriefSections tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1984 — parseAnalysisBriefSections", () => {
  it("AC-1: extracts all 4 canonical sections correctly", () => {
    const result = parseAnalysisBriefSections(SAMPLE_BRIEF);

    expect(result.fundamentals).toContain("Revenue strong");
    expect(result.news).toContain("No major headlines");
    expect(result.price).toContain("61,500 VND");
    expect(result.synthesis).toContain("61,000 VND");
  });

  it("AC-2: returns empty string for absent sections", () => {
    const result = parseAnalysisBriefSections(BRIEF_ONLY_SOME_SECTIONS);

    expect(result.price).toContain("26,500 VND");
    expect(result.fundamentals).toBe("");
    expect(result.news).toBe("");
    expect(result.synthesis).toBe("");
  });

  it("AC-3: ignores non-canonical H2 headings ([Insider Tracker])", () => {
    const result = parseAnalysisBriefSections(BRIEF_ONLY_SOME_SECTIONS);

    // [Insider Tracker] content should NOT bleed into any canonical section
    expect(result.fundamentals).not.toContain("No activity");
    expect(result.news).not.toContain("No activity");
    expect(result.price).not.toContain("No activity");
    expect(result.synthesis).not.toContain("No activity");
  });

  it("section content excludes the heading line itself", () => {
    const result = parseAnalysisBriefSections(SAMPLE_BRIEF);
    expect(result.fundamentals).not.toContain("[Report Analyzer]");
    expect(result.news).not.toContain("[News Scout]");
    expect(result.price).not.toContain("[Market Watcher]");
    expect(result.synthesis).not.toContain("[Unified Agent]");
  });

  it("handles empty markdown without throwing", () => {
    const result = parseAnalysisBriefSections("");
    expect(result.fundamentals).toBe("");
    expect(result.news).toBe("");
    expect(result.price).toBe("");
    expect(result.synthesis).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// readAnalysisBrief tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1984 — readAnalysisBrief", () => {
  it("AC-4: returns null for missing ticker file (ENOENT)", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "maw-empty-"));
    mkdirSync(join(projectRoot, "docs", "analysis-briefs"), { recursive: true });

    const result = readAnalysisBrief("NONEXISTENT", projectRoot);
    expect(result).toBeNull();
  });

  it("AC-5: returns AnalysisBriefDto with ticker, sections, raw, updatedAt", () => {
    const projectRoot = makeTempProject("VCB", SAMPLE_BRIEF);

    const dto = readAnalysisBrief("VCB", projectRoot);
    expect(dto).not.toBeNull();
    expect(dto!.ticker).toBe("VCB");
    expect(dto!.fundamentals).toContain("Revenue strong");
    expect(dto!.news).toContain("No major headlines");
    expect(dto!.price).toContain("61,500 VND");
    expect(dto!.synthesis).toContain("61,000 VND");
    expect(dto!.raw).toBe(SAMPLE_BRIEF);
    expect(typeof dto!.updatedAt).toBe("string");
  });

  it("AC-6: normalises ticker to uppercase", () => {
    const projectRoot = makeTempProject("VCB", SAMPLE_BRIEF);

    const dto = readAnalysisBrief("vcb", projectRoot);
    expect(dto).not.toBeNull();
    expect(dto!.ticker).toBe("VCB");
  });

  it("AC-7: returns null for invalid ticker (path traversal attempt)", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "maw-sec-"));
    mkdirSync(join(projectRoot, "docs", "analysis-briefs"), { recursive: true });

    const result1 = readAnalysisBrief("../etc/passwd", projectRoot);
    expect(result1).toBeNull();

    const result2 = readAnalysisBrief("", projectRoot);
    expect(result2).toBeNull();
  });

  it("AC-11: updatedAt is a valid ISO 8601 string", () => {
    const projectRoot = makeTempProject("FPT", "# FPT\n## [Market Watcher] Price, Volume, Technicals\ndata");

    const dto = readAnalysisBrief("FPT", projectRoot);
    expect(dto).not.toBeNull();
    const date = new Date(dto!.updatedAt);
    expect(isNaN(date.getTime())).toBe(false);
    expect(dto!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetAnalysisBrief HTTP handler tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1984 — handleGetAnalysisBrief HTTP handler", () => {
  it("AC-8: returns 200 JSON for existing brief", () => {
    const projectRoot = makeTempProject("VCB", SAMPLE_BRIEF);
    const res = makeMockRes();

    handleGetAnalysisBrief(FAKE_REQ, res as unknown as import("node:http").ServerResponse, "VCB", projectRoot);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body);
    expect(body.ticker).toBe("VCB");
    expect(typeof body.fundamentals).toBe("string");
    expect(typeof body.news).toBe("string");
    expect(typeof body.price).toBe("string");
    expect(typeof body.synthesis).toBe("string");
    expect(typeof body.raw).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
  });

  it("AC-9: returns 404 JSON for missing ticker", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "maw-empty2-"));
    mkdirSync(join(projectRoot, "docs", "analysis-briefs"), { recursive: true });
    const res = makeMockRes();

    handleGetAnalysisBrief(FAKE_REQ, res as unknown as import("node:http").ServerResponse, "NOPE", projectRoot);

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("not_found");
    expect(body.ticker).toBe("NOPE");
  });

  it("AC-10: returns 400 JSON for empty ticker", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "maw-empty3-"));
    const res = makeMockRes();

    handleGetAnalysisBrief(FAKE_REQ, res as unknown as import("node:http").ServerResponse, "", projectRoot);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("invalid_ticker");
  });

  it("handles lowercase ticker in URL (normalises to uppercase for file lookup)", () => {
    const projectRoot = makeTempProject("HPG", "# HPG\n## [Market Watcher] Price, Volume, Technicals\ndata");
    const res = makeMockRes();

    handleGetAnalysisBrief(FAKE_REQ, res as unknown as import("node:http").ServerResponse, "hpg", projectRoot);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ticker).toBe("HPG");
  });
});
