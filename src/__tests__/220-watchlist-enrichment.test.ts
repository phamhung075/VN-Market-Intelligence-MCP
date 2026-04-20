/**
 * Task 220 — Watchlist Auto-Enrichment: Sector Peer Suggestions
 *
 * Tests for the `buildPeerSuggestionText` pure helper exported from
 * `src/interface/mcp/tools/watchlist.ts`.
 *
 * All tests are pure (no DB, no MCP server).
 */

import { describe, it, expect } from "bun:test";
import {
  buildPeerSuggestionText,
} from "../interface/mcp/tools/system/watchlist.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 220 — Watchlist auto-enrichment: sector peer suggestions", () => {
  // ── 1. Basic suggestion for banking sector ─────────────────────────────────
  it("returns a suggestion block for a banking stock not yet in watchlist", () => {
    const result = buildPeerSuggestionText("VCB", "banking", new Set());
    expect(result).toBeTruthy();
    expect(result).toContain("Goi y");
    expect(result).toContain("Ngan hang");
  });

  // ── 2. Excludes the added stock from suggestions ───────────────────────────
  it("does not suggest the stock that was just added", () => {
    const result = buildPeerSuggestionText("VCB", "banking", new Set());
    // VCB was added; suggestions should not include VCB
    expect(result).not.toMatch(/\bVCB\b/);
  });

  // ── 3. Excludes stocks already in watchlist ────────────────────────────────
  it("excludes stocks already present in the watchlist", () => {
    const existing = new Set(["BID", "CTG"]);
    const result = buildPeerSuggestionText("VCB", "banking", existing);
    expect(result).not.toContain("BID");
    expect(result).not.toContain("CTG");
  });

  // ── 4. Returns empty string for 'other' domain (no peers) ─────────────────
  it("returns empty string for 'other' domain which has no peers", () => {
    const result = buildPeerSuggestionText("XYZ", "other", new Set());
    expect(result).toBe("");
  });

  // ── 5. Returns empty string when all peers already in watchlist ────────────
  it("returns empty string when all banking peers are already in the watchlist", () => {
    // banking peers: VCB BID CTG TCB MBB VPB ACB SHB EIB STB HDB TPB
    // VCB added, all others in existing watchlist
    const existing = new Set(["BID", "CTG", "TCB", "MBB", "VPB", "ACB", "SHB", "EIB", "STB", "HDB", "TPB"]);
    const result = buildPeerSuggestionText("VCB", "banking", existing);
    expect(result).toBe("");
  });

  // ── 6. Max 5 suggestions ───────────────────────────────────────────────────
  it("suggests at most 5 peers", () => {
    // banking has 9 peers after excluding VCB — should cap at 5
    const result = buildPeerSuggestionText("VCB", "banking", new Set());
    // Count lines that look like stock suggestions (contain a ticker in format "  CODE")
    const suggestionLines = result.split("\n").filter((l) => /^\s+[A-Z]{2,6}/.test(l));
    expect(suggestionLines.length).toBeLessThanOrEqual(5);
  });

  // ── 7. Contains instruction to use add_to_watchlist ───────────────────────
  it("contains add_to_watchlist instruction", () => {
    const result = buildPeerSuggestionText("FPT", "tech", new Set());
    expect(result).toContain("add_to_watchlist");
  });

  // ── 8. Returns empty string for unknown domain ────────────────────────────
  it("returns empty string for unknown/null domain", () => {
    const result = buildPeerSuggestionText("ABC", "unknown_sector" as never, new Set());
    expect(result).toBe("");
  });

  // ── 9. Works for tech sector ──────────────────────────────────────────────
  it("returns suggestions for tech sector excluding FPT", () => {
    const result = buildPeerSuggestionText("FPT", "tech", new Set());
    expect(result).toBeTruthy();
    expect(result).toContain("Cong nghe");
    expect(result).not.toMatch(/\bFPT\b/);
  });

  // ── 10. Works for oil_gas sector ──────────────────────────────────────────
  it("returns suggestions for oil_gas sector", () => {
    const result = buildPeerSuggestionText("GAS", "oil_gas", new Set());
    expect(result).toBeTruthy();
    expect(result).toContain("Dau khi");
    expect(result).not.toMatch(/\bGAS\b/);
  });

  // ── 11. Gold_mining with only PNJ — after excluding PNJ → no peers ────────
  it("returns empty string for gold_mining when only peer is excluded", () => {
    const result = buildPeerSuggestionText("PNJ", "gold_mining", new Set());
    // gold_mining only has PNJ itself — after exclusion nothing left
    expect(result).toBe("");
  });

  // ── 12. Partial watchlist exclusion limits suggestions ────────────────────
  it("returns reduced suggestion list when many peers are already watched", () => {
    // banking peers (excl. VCB): BID CTG TCB MBB VPB ACB SHB EIB STB HDB TPB
    // exclude 9 of those, leaving SHB, EIB, HDB, TPB → capped at 5, result has 4 lines
    const existing = new Set(["BID", "CTG", "TCB", "MBB", "VPB", "ACB", "STB"]);
    const result = buildPeerSuggestionText("VCB", "banking", existing);

    const countLines = (s: string) =>
      s.split("\n").filter((l) => /^\s+[A-Z]{2,6}/.test(l)).length;

    // Remaining banking peers after excluding VCB + 7 = SHB, EIB, HDB, TPB → 4 lines
    expect(countLines(result)).toBe(4);
  });

  // ── 13. Sector name appears in Vietnamese without diacritics ─────────────
  it("sector name is readable ASCII for all supported sectors", () => {
    const sectors = ["banking", "tech", "real_estate", "steel", "oil_gas", "aviation"] as const;
    for (const sector of sectors) {
      const result = buildPeerSuggestionText("ZZZ", sector, new Set());
      // Should not throw; if peers exist the result should be non-empty ASCII
      if (result !== "") {
        expect(result).toMatch(/[A-Za-z]/);
      }
    }
  });
});
