/**
 * Task 258 — Hydrological Data Fetcher Tests
 *
 * Tests for fetchReservoirLevels() and extractReservoirLevelsFromText().
 * Infrastructure layer — uses injected content for determinism.
 */

import { describe, it, expect } from "bun:test";
import {
  fetchReservoirLevels,
  extractReservoirLevelsFromText,
  type ReservoirLevel,
} from "../infrastructure/fetchers/hydrologicalData.js";

// ---------------------------------------------------------------------------
// Mock HTTP client
// ---------------------------------------------------------------------------

function makeHtmlClient(html: string) {
  return {
    async get(_url: string): Promise<string> {
      return html;
    },
  };
}

function makeFailingClient() {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network error");
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 258 — Hydrological Data Fetcher", () => {
  // 1. Returns empty array on failure (never throws)
  it("returns empty array on network failure", async () => {
    const result = await fetchReservoirLevels(makeFailingClient());
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  // 2. Extracts "mực nước hồ X đạt Y%" pattern
  it("extracts reservoir from 'muc nuoc ho X dat Y%' pattern", () => {
    const text = "Mực nước hồ Hòa Bình đạt 78% dung tích thiết kế, xu hướng đang tăng dần.";
    const result = extractReservoirLevelsFromText(text);
    expect(result.length).toBeGreaterThan(0);
    const hoaBinh = result.find((r) => r.name === "Hòa Bình");
    expect(hoaBinh).toBeDefined();
    expect(hoaBinh!.capacityPct).toBe(78);
  });

  // 3. Extracts "hồ thủy điện X ... Y%" pattern
  it("extracts reservoir from 'ho thuy dien X Y%' pattern", () => {
    const text = "Hồ thủy điện Sơn La hiện đang ở mức 65% công suất thiết kế.";
    const result = extractReservoirLevelsFromText(text);
    const sonLa = result.find((r) => r.name === "Sơn La");
    expect(sonLa).toBeDefined();
    expect(sonLa!.capacityPct).toBe(65);
  });

  // 4. Extracts multiple reservoirs from one text
  it("extracts multiple reservoirs from one text block", () => {
    const text = `
      Tình hình hồ chứa thủy điện:
      - Hồ Hòa Bình đạt 82% dung tích
      - Hồ Sơn La đạt 71% dung tích
      - Hồ Trị An đạt 55% dung tích
    `;
    const result = extractReservoirLevelsFromText(text);
    expect(result.length).toBeGreaterThanOrEqual(3);
    const codes = result.map((r) => r.name);
    expect(codes).toContain("Hòa Bình");
    expect(codes).toContain("Sơn La");
    expect(codes).toContain("Trị An");
  });

  // 5. Detects "falling" trend from keywords
  it("detects falling trend from 'giam' keywords", () => {
    const text = "Mực nước hồ Ialy đạt 45%, đang giảm do không có mưa trong tuần qua.";
    const result = extractReservoirLevelsFromText(text);
    const ialy = result.find((r) => r.name === "Ialy");
    expect(ialy).toBeDefined();
    expect(ialy!.trend).toBe("falling");
  });

  // 6. Detects "rising" trend from keywords
  it("detects rising trend from 'tang/dang tang' keywords", () => {
    const text = "Mực nước hồ Lai Châu đạt 90%, mực nước đang tăng do mưa thượng nguồn.";
    const result = extractReservoirLevelsFromText(text);
    const laiChau = result.find((r) => r.name === "Lai Châu");
    expect(laiChau).toBeDefined();
    expect(laiChau!.trend).toBe("rising");
  });

  // 7. ReservoirLevel has all required fields
  it("all returned ReservoirLevels have required fields", () => {
    const text = "Mực nước hồ Hòa Bình đạt 70%.";
    const result = extractReservoirLevelsFromText(text);
    for (const r of result) {
      expect(typeof r.name).toBe("string");
      expect(typeof r.currentLevel).toBe("number");
      expect(typeof r.capacityPct).toBe("number");
      expect(["rising", "falling", "stable"]).toContain(r.trend);
      expect(typeof r.date).toBe("string");
    }
  });

  // 8. fetchReservoirLevels integrates with HTML client
  it("fetchReservoirLevels returns array from mock HTML", async () => {
    const html = `
      <html><body>
        <p>Hồ thủy điện Hòa Bình đạt 76% dung tích, mực nước đang tăng.</p>
        <p>Hồ thủy điện Sơn La đạt 68%, đang giảm.</p>
      </body></html>
    `;
    const result = await fetchReservoirLevels(makeHtmlClient(html));
    expect(Array.isArray(result)).toBe(true);
    // Should detect at least one reservoir
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
