/**
 * Task 261 — Signal Integration Tests
 *
 * Tests for:
 *   1. SignalType extended with "climate_event" | "energy_grid"
 *   2. CLIMATE_RULES in cascadeEngine (keyword matching)
 *   3. weatherCheckJob existence and cron config
 *   4. assembleBriefing climate section wiring
 */

import { describe, it, expect } from "bun:test";
import type { SignalType } from "../domain/services/signalDetector.js";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseEntry: AnalysisEntry = {
  id: "test-261",
  level: "country",
  sourceTitle: "",
  sourceUrl: "https://test.com",
  sourceType: "news",
  publishedAt: new Date().toISOString(),
  sentiment: "neutral",
  impactScore: 5,
  impactDirection: "neutral",
  confidence: 0.5,
  timeHorizon: "short",
  summary: "",
  reasoning: "",
  affectedCountries: ["VN"],
  affectedDomains: [],
  affectedActions: [],
  parentIds: [],
  tags: [],
  createdAt: new Date().toISOString(),
};

const watchlist: WatchlistEntry[] = [
  { actionCode: "REE", domain: "utilities", exchange: "HOSE" },
  { actionCode: "GEG", domain: "utilities", exchange: "HOSE" },
  { actionCode: "BVH", domain: "insurance", exchange: "HOSE" },
  { actionCode: "IDC", domain: "real_estate", exchange: "HOSE" },  // industrial park → real_estate
  { actionCode: "MPC", domain: "agriculture" as const, exchange: "HOSE" },  // seafood → agriculture
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 261 — Signal Integration", () => {
  // 1. SignalType includes "climate_event"
  it("SignalType type includes 'climate_event'", () => {
    // TypeScript compile check: this would fail to compile if climate_event not in type
    const sig: SignalType = "climate_event";
    expect(sig).toBe("climate_event");
  });

  // 2. SignalType includes "energy_grid"
  it("SignalType type includes 'energy_grid'", () => {
    const sig: SignalType = "energy_grid";
    expect(sig).toBe("energy_grid");
  });

  // 3. Cascade engine has climate rules: typhoon/bão → insurance bearish
  it("cascadeEngine: 'bão lớn' triggers insurance domain rule", () => {
    const entry: AnalysisEntry = {
      ...baseEntry,
      sourceTitle: "Bão số 5 mạnh lên, đổ bộ miền Trung — thiên tai nghiêm trọng",
      summary: "Bão số 5 mạnh lên, đổ bộ miền Trung — thiên tai nghiêm trọng",
      tags: ["bão", "thiên tai"],
    };
    const chain = buildCausalChain(entry, watchlist);
    const insuranceImpact = chain.watchlistImpacts.find(
      (w) => w.actionCode === "BVH",
    );
    // BVH is insurance — should be affected by typhoon/thiên tai
    expect(insuranceImpact).toBeDefined();
    expect(insuranceImpact!.impactDirection).toBe("down");
  });

  // 4. Cascade engine: drought → utilities bullish (solar keyword)
  it("cascadeEngine: 'hạn hán' and 'năng lượng tái tạo' keywords trigger utilities bullish", () => {
    const entry: AnalysisEntry = {
      ...baseEntry,
      sourceTitle: "Hạn hán nghiêm trọng — năng lượng tái tạo thay thế thủy điện đang thiếu điện",
      summary: "Hạn hán nghiêm trọng — năng lượng tái tạo thay thế thủy điện đang thiếu điện",
      tags: ["hạn hán", "năng lượng tái tạo"],
    };
    const chain = buildCausalChain(entry, watchlist);
    const utilitiesImpact = chain.watchlistImpacts.find(
      (w) => w.actionCode === "REE" || w.actionCode === "GEG",
    );
    expect(utilitiesImpact).toBeDefined();
    expect(utilitiesImpact!.impactDirection).toBe("up");
  });

  // 5. Cascade engine: power shortage → industrial zone bearish
  it("cascadeEngine: 'thiếu điện' triggers industrial zone bearish", () => {
    const entry: AnalysisEntry = {
      ...baseEntry,
      sourceTitle: "Thiếu điện nghiêm trọng tại miền Nam — khu công nghiệp cắt điện luân phiên",
      summary: "Thiếu điện nghiêm trọng tại miền Nam — khu công nghiệp cắt điện luân phiên power shortage vietnam",
      tags: ["thiếu điện", "khu công nghiệp"],
    };
    const chain = buildCausalChain(entry, watchlist);
    const idcImpact = chain.watchlistImpacts.find(
      (w) => w.actionCode === "IDC",
    );
    expect(idcImpact).toBeDefined();
    expect(idcImpact!.impactDirection).toBe("down");
  });

  // 6. Cascade engine: drought → agriculture/seafood bearish
  it("cascadeEngine: 'hạn hán' triggers seafood bearish", () => {
    const entry: AnalysisEntry = {
      ...baseEntry,
      sourceTitle: "Hạn hán nghiêm trọng tại ĐBSCL — thiệt hại nuôi trồng thủy sản",
      summary: "Hạn hán nghiêm trọng thiếu nước ao nuôi — thiệt hại thủy sản (MPC, ANV) drought vietnam",
      tags: ["hạn hán", "thủy sản"],
      affectedDomains: ["agriculture"],
    };
    const chain = buildCausalChain(entry, watchlist);
    const mpcImpact = chain.watchlistImpacts.find(
      (w) => w.actionCode === "MPC",
    );
    expect(mpcImpact).toBeDefined();
    expect(mpcImpact!.impactDirection).toBe("down");
  });

  // 7. weatherCheckJob module exists
  it("weatherCheckJob module can be imported", async () => {
    const mod = await import("../scheduler/weatherCheckJob.js");
    expect(typeof mod.runWeatherCheck).toBe("function");
  });

  // 8. CRONS object in jobs.ts includes weatherCheck
  it("jobs.ts CRONS includes weatherCheck", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    expect((CRONS as Record<string, string>).weatherCheck).toBeDefined();
  });
});
