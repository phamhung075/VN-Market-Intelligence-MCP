/**
 * Task 014 — Embedding Text Builder
 *
 * Builds a deterministic text string from an analysis entry's fields
 * for use as input to the embedding model.
 */
import { describe, expect, it } from "bun:test";
import { buildEmbeddingText } from "../domain/services/embeddingTextBuilder";

describe("buildEmbeddingText", () => {
  // --- Basic concatenation ---

  it("concatenates title, summary, and tags", () => {
    const result = buildEmbeddingText({
      title: "Fed raises rates",
      summary: "The Federal Reserve increased interest rates by 25bps.",
      tags: ["macro", "interest-rates", "USD"],
    });
    expect(result).toBe(
      "Fed raises rates\nThe Federal Reserve increased interest rates by 25bps.\nmacro interest-rates USD"
    );
  });

  it("includes level when provided", () => {
    const result = buildEmbeddingText({
      title: "VN-Index drops",
      summary: "Market fell 2% on global sell-off.",
      tags: ["market"],
      level: "country",
    });
    expect(result).toBe(
      "[country] VN-Index drops\nMarket fell 2% on global sell-off.\nmarket"
    );
  });

  it("includes actionCode when provided", () => {
    const result = buildEmbeddingText({
      title: "HPG earnings beat",
      summary: "Hoa Phat reported strong Q3 results.",
      tags: ["earnings", "steel"],
      actionCode: "HPG",
    });
    expect(result).toBe(
      "HPG earnings beat\nHoa Phat reported strong Q3 results.\nearnings steel\nstock:HPG"
    );
  });

  it("includes both level and actionCode when provided", () => {
    const result = buildEmbeddingText({
      title: "Steel sector outlook",
      summary: "Positive demand forecast for Vietnamese steel.",
      tags: ["steel", "sector"],
      level: "domain",
      actionCode: "HPG",
    });
    expect(result).toBe(
      "[domain] Steel sector outlook\nPositive demand forecast for Vietnamese steel.\nsteel sector\nstock:HPG"
    );
  });

  // --- Determinism ---

  it("produces identical output for identical input", () => {
    const entry = {
      title: "Test title",
      summary: "Test summary content.",
      tags: ["a", "b", "c"],
      level: "global",
    };
    const result1 = buildEmbeddingText(entry);
    const result2 = buildEmbeddingText(entry);
    expect(result1).toBe(result2);
  });

  // --- Empty / missing fields ---

  it("handles empty title gracefully", () => {
    const result = buildEmbeddingText({
      title: "",
      summary: "Some summary.",
      tags: ["tag1"],
    });
    expect(result).toBe("Some summary.\ntag1");
  });

  it("handles empty summary gracefully", () => {
    const result = buildEmbeddingText({
      title: "A title",
      summary: "",
      tags: ["tag1"],
    });
    expect(result).toBe("A title\ntag1");
  });

  it("handles empty tags array gracefully", () => {
    const result = buildEmbeddingText({
      title: "A title",
      summary: "A summary.",
      tags: [],
    });
    expect(result).toBe("A title\nA summary.");
  });

  it("handles all empty fields", () => {
    const result = buildEmbeddingText({
      title: "",
      summary: "",
      tags: [],
    });
    expect(result).toBe("");
  });

  it("handles empty level string (treated as absent)", () => {
    const result = buildEmbeddingText({
      title: "Title",
      summary: "Summary.",
      tags: [],
      level: "",
    });
    expect(result).toBe("Title\nSummary.");
  });

  it("handles empty actionCode string (treated as absent)", () => {
    const result = buildEmbeddingText({
      title: "Title",
      summary: "Summary.",
      tags: [],
      actionCode: "",
    });
    expect(result).toBe("Title\nSummary.");
  });

  // --- Whitespace trimming ---

  it("trims whitespace from title and summary", () => {
    const result = buildEmbeddingText({
      title: "  Padded title  ",
      summary: "  Padded summary.  ",
      tags: ["x"],
    });
    expect(result).toBe("Padded title\nPadded summary.\nx");
  });

  it("trims whitespace from tags", () => {
    const result = buildEmbeddingText({
      title: "Title",
      summary: "Summary.",
      tags: ["  tag1 ", " tag2  "],
    });
    expect(result).toBe("Title\nSummary.\ntag1 tag2");
  });

  it("filters out empty/whitespace-only tags", () => {
    const result = buildEmbeddingText({
      title: "Title",
      summary: "Summary.",
      tags: ["valid", "", "  ", "also-valid"],
    });
    expect(result).toBe("Title\nSummary.\nvalid also-valid");
  });
});
