/**
 * CCATO-MCP-T2-CLAIM-MAP-LOADER — unit tests
 *
 * Covers:
 *   1. Real SSOT load — docs/data/claim-tool-map.json parses to the shape
 *      the domain layer (claimCandidateScanner.ts) expects, and the
 *      returned candidates are usable end-to-end with zero transformation.
 *   2. Fail-loud: missing file, unreadable JSON, missing/mistyped required
 *      fields (negation_lexicon, non_ticker_tokens, dimensions[].*).
 *   3. Additive SSOT extensions (tool_null_markers, _meta, version) are
 *      tolerated, never rejected.
 *   4. Default path constant resolves to the real repo-root file.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 */

import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadClaimToolMap,
  ClaimToolMapLoadError,
  CLAIM_TOOL_MAP_PATH,
} from "../infrastructure/fileStore/claimToolMapLoader.js";
import { scanClaimCandidates } from "../domain/services/narrativeTruthGate/claimCandidateScanner.js";

// __dirname = apps/mcp-server/src/__tests__ → up 4 levels to reach monorepo root
const REPO_ROOT = resolve(__dirname, "../../../..");
const REAL_CLAIM_MAP_PATH = resolve(REPO_ROOT, "docs/data/claim-tool-map.json");

let tmpDir: string | undefined;

function makeTmpFile(filename: string, content: string): string {
  tmpDir = mkdtempSync(join(tmpdir(), "claim-tool-map-loader-test-"));
  const p = join(tmpDir, filename);
  writeFileSync(p, content, "utf8");
  return p;
}

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Real SSOT load
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T2 — loadClaimToolMap against the real SSOT", () => {
  it("loads docs/data/claim-tool-map.json and returns the shape the domain layer expects", () => {
    const map = loadClaimToolMap(REAL_CLAIM_MAP_PATH);

    expect(Array.isArray(map.negation_lexicon)).toBe(true);
    expect(map.negation_lexicon.length).toBeGreaterThan(0);
    expect(Array.isArray(map.non_ticker_tokens)).toBe(true);
    expect(map.non_ticker_tokens.length).toBeGreaterThan(0);
    expect(Array.isArray(map.dimensions)).toBe(true);

    const dimIds = map.dimensions.map((d) => d.id).sort();
    expect(dimIds).toEqual([
      "financials",
      "foreign_flow",
      "macro",
      "market_snapshot",
      "technical_indicators",
    ]);

    const ta = map.dimensions.find((d) => d.id === "technical_indicators");
    expect(ta).toMatchObject({
      tool: "get_technical_indicators",
      requires_ticker: true,
      arg_style: "ticker_code",
    });
  });

  it("CLAIM_TOOL_MAP_PATH default constant resolves to the real repo-root SSOT file", () => {
    expect(CLAIM_TOOL_MAP_PATH).toBe(REAL_CLAIM_MAP_PATH);
  });

  it("output is directly usable by the domain scanner with zero transformation", () => {
    const map = loadClaimToolMap(REAL_CLAIM_MAP_PATH);
    const body = "VNM không có dữ liệu kỹ thuật phiên này. Giá đóng cửa ổn định.";
    const candidates = scanClaimCandidates(body, map);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.dimension.id).toBe("technical_indicators");
    expect(candidates[0]?.ticker).toBe("VNM");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Fail-loud
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T2 — fail-loud on missing/malformed SSOT", () => {
  it("throws ClaimToolMapLoadError when the file does not exist", () => {
    const missingPath = join(tmpdir(), "claim-tool-map-loader-test-does-not-exist", "claim-tool-map.json");
    expect(() => loadClaimToolMap(missingPath)).toThrow(ClaimToolMapLoadError);
    expect(() => loadClaimToolMap(missingPath)).toThrow(/not found/);
  });

  it("throws ClaimToolMapLoadError on unparsable JSON", () => {
    const p = makeTmpFile("bad.json", "{ this is not json ");
    expect(() => loadClaimToolMap(p)).toThrow(ClaimToolMapLoadError);
    expect(() => loadClaimToolMap(p)).toThrow(/not valid JSON/);
  });

  it("throws ClaimToolMapLoadError when the JSON body is not an object (e.g. an array)", () => {
    const p = makeTmpFile("array.json", "[1, 2, 3]");
    expect(() => loadClaimToolMap(p)).toThrow(/did not parse to a JSON object/);
  });

  it("throws ClaimToolMapLoadError when negation_lexicon is missing", () => {
    const p = makeTmpFile(
      "missing-negation.json",
      JSON.stringify({ non_ticker_tokens: ["USD"], dimensions: [] }),
    );
    expect(() => loadClaimToolMap(p)).toThrow(/negation_lexicon/);
  });

  it("throws ClaimToolMapLoadError when negation_lexicon is the wrong type", () => {
    const p = makeTmpFile(
      "wrong-type-negation.json",
      JSON.stringify({ negation_lexicon: "not-an-array", non_ticker_tokens: [], dimensions: [] }),
    );
    expect(() => loadClaimToolMap(p)).toThrow(/negation_lexicon/);
  });

  it("throws ClaimToolMapLoadError when non_ticker_tokens is missing", () => {
    const p = makeTmpFile(
      "missing-nontoken.json",
      JSON.stringify({ negation_lexicon: ["không có dữ liệu"], dimensions: [] }),
    );
    expect(() => loadClaimToolMap(p)).toThrow(/non_ticker_tokens/);
  });

  it("throws ClaimToolMapLoadError when dimensions is missing", () => {
    const p = makeTmpFile(
      "missing-dimensions.json",
      JSON.stringify({ negation_lexicon: ["không có dữ liệu"], non_ticker_tokens: ["USD"] }),
    );
    expect(() => loadClaimToolMap(p)).toThrow(/dimensions/);
  });

  it("throws ClaimToolMapLoadError when dimensions is an empty array", () => {
    const p = makeTmpFile(
      "empty-dimensions.json",
      JSON.stringify({ negation_lexicon: ["không có dữ liệu"], non_ticker_tokens: ["USD"], dimensions: [] }),
    );
    expect(() => loadClaimToolMap(p)).toThrow(/dimensions/);
  });

  it("throws ClaimToolMapLoadError when a dimension entry is missing arg_style", () => {
    const p = makeTmpFile(
      "bad-dimension.json",
      JSON.stringify({
        negation_lexicon: ["không có dữ liệu"],
        non_ticker_tokens: ["USD"],
        dimensions: [
          { id: "technical_indicators", keywords: ["kỹ thuật"], tool: "get_technical_indicators", requires_ticker: true },
        ],
      }),
    );
    expect(() => loadClaimToolMap(p)).toThrow(/dimensions/);
  });

  it("throws ClaimToolMapLoadError when a dimension entry's requires_ticker is the wrong type", () => {
    const p = makeTmpFile(
      "bad-dimension-type.json",
      JSON.stringify({
        negation_lexicon: ["không có dữ liệu"],
        non_ticker_tokens: ["USD"],
        dimensions: [
          {
            id: "technical_indicators",
            keywords: ["kỹ thuật"],
            tool: "get_technical_indicators",
            requires_ticker: "yes",
            arg_style: "ticker_code",
          },
        ],
      }),
    );
    expect(() => loadClaimToolMap(p)).toThrow(/dimensions/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Additive SSOT extensions tolerated
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T2 — tolerates additive SSOT fields", () => {
  it("does not reject extra top-level fields (tool_null_markers, _meta, version)", () => {
    const p = makeTmpFile(
      "additive.json",
      JSON.stringify({
        version: "1",
        _meta: { purpose: "test" },
        negation_lexicon: ["không có dữ liệu"],
        non_ticker_tokens: ["USD"],
        tool_null_markers: ["not found in database"],
        dimensions: [
          {
            id: "technical_indicators",
            keywords: ["kỹ thuật"],
            tool: "get_technical_indicators",
            requires_ticker: true,
            arg_style: "ticker_code",
          },
        ],
      }),
    );
    const map = loadClaimToolMap(p);
    expect(map.negation_lexicon).toEqual(["không có dữ liệu"]);
    expect(map.dimensions).toHaveLength(1);
  });
});
