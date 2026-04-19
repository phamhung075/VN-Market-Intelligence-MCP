// src/__tests__/1247-vn-relevance-prefilter.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { isVnRelevant, VN_SOURCE_IDS } from "../domain/services/vnRelevanceFilter.js";

describe("Task 1247 — VN Relevance Pre-filter", () => {
  // ── VN sources always pass ────────────────────────────────────────────────
  it("passes all VN-source articles regardless of content", () => {
    expect(isVnRelevant({ title: "Personal finance tips for Americans", content: "", source: "cafef" })).toBe(true);
    expect(isVnRelevant({ title: "NBA scores tonight", content: "", source: "vnexpress" })).toBe(true);
    expect(isVnRelevant({ title: "Sports update", content: "", source: "vneconomy" })).toBe(true);
  });

  // ── Non-VN sources with VN keywords pass ──────────────────────────────────
  it("passes non-VN articles that mention Vietnam", () => {
    expect(isVnRelevant({ title: "Vietnam GDP hits 7% growth", content: "", source: "reuters" })).toBe(true);
    expect(isVnRelevant({ title: "Market update", content: "Việt Nam tăng trưởng mạnh", source: "reuters" })).toBe(true);
  });

  it("passes non-VN articles mentioning VN-Index", () => {
    expect(isVnRelevant({ title: "VN-Index falls 2% on selling pressure", content: "", source: "tradingeconomics" })).toBe(true);
  });

  it("passes non-VN articles mentioning HOSE or HNX", () => {
    expect(isVnRelevant({ title: "HOSE suspends trading session", content: "", source: "reuters" })).toBe(true);
    expect(isVnRelevant({ title: "HNX bond issuance update", content: "", source: "reuters" })).toBe(true);
  });

  it("passes non-VN articles mentioning a VN ticker", () => {
    expect(isVnRelevant({ title: "VCB reports strong Q1 profits", content: "", source: "reuters" })).toBe(true);
    expect(isVnRelevant({ title: "Update on HPG steel earnings", content: "", source: "tradingeconomics" })).toBe(true);
  });

  it("passes non-VN articles mentioning UPCOM", () => {
    expect(isVnRelevant({ title: "UPCOM listings surge", content: "", source: "reuters" })).toBe(true);
  });

  // ── Non-VN sources with NO VN relevance → discard ────────────────────────
  it("discards US personal finance articles from non-VN sources", () => {
    expect(isVnRelevant({ title: "How to refinance your mortgage in 2024", content: "Personal finance guide for US homeowners", source: "tradingeconomics" })).toBe(false);
  });

  it("discards sports articles from non-VN sources", () => {
    expect(isVnRelevant({ title: "Super Bowl predictions for 2025", content: "NFL season highlights", source: "reuters" })).toBe(false);
  });

  it("discards entertainment articles from non-VN sources", () => {
    expect(isVnRelevant({ title: "Oscar nominees announced", content: "Hollywood awards season", source: "tradingeconomics" })).toBe(false);
  });

  it("discards US-domestic economic articles with no VN link", () => {
    expect(isVnRelevant({ title: "US housing starts fall 3% in October", content: "US domestic real estate market report", source: "tradingeconomics" })).toBe(false);
  });

  it("discards US retail news with no VN link", () => {
    expect(isVnRelevant({ title: "US retail sales miss expectations", content: "Consumer spending in America slows", source: "tradingeconomics" })).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  it("passes when VN keyword is in content (not title)", () => {
    expect(isVnRelevant({ title: "Global markets round-up", content: "Vietnam stock market closed higher", source: "reuters" })).toBe(true);
  });

  it("discards empty-content non-VN articles with no VN signal", () => {
    expect(isVnRelevant({ title: "5 tips for better sleep", content: "", source: "tradingeconomics" })).toBe(false);
  });

  it("treats unknown source as non-VN (conservative)", () => {
    expect(isVnRelevant({ title: "Random lifestyle content", content: "", source: "unknown_source" })).toBe(false);
  });

  // ── VN_SOURCE_IDS list is exported correctly ──────────────────────────────
  it("exports VN_SOURCE_IDS containing cafef, vnexpress, vneconomy", () => {
    expect(VN_SOURCE_IDS).toContain("cafef");
    expect(VN_SOURCE_IDS).toContain("vnexpress");
    expect(VN_SOURCE_IDS).toContain("vneconomy");
  });

  // ── Case-insensitive matching ─────────────────────────────────────────────
  it("matches 'vietnam' case-insensitively", () => {
    expect(isVnRelevant({ title: "VIETNAM trade surplus widens", content: "", source: "reuters" })).toBe(true);
  });
});
