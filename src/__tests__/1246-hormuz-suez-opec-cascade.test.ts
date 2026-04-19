/**
 * Task 1246 — Hormuz/Suez/OPEC cascade rules
 *
 * oil_supply_shock events (Hormuz blockade, Suez closure, OPEC cut) must cascade:
 *   - BULLISH for oil_gas (PVD, PVS, GAS — price shock benefit)
 *   - BEARISH for aviation (fuel cost spike)
 *   - BEARISH for logistics (route disruption, cost surge)
 *   - BEARISH for securities (market-wide risk-off)
 *
 * Layer: domain/services
 */
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

const BASE_ENTRY: AnalysisEntry = {
  id: "test-1246",
  level: "global",
  sourceTitle: "",
  sourceUrl: "",
  sourceType: "news",
  publishedAt: new Date().toISOString(),
  sentiment: "bearish",
  impactScore: 8,
  impactDirection: "down",
  confidence: 0.85,
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

function makeEntry(sourceTitle: string, summary: string): AnalysisEntry {
  return { ...BASE_ENTRY, sourceTitle, summary };
}

const WATCHLIST = [
  { actionCode: "PVD", domain: "oil_gas" as const, exchange: "HOSE" },
  { actionCode: "PVS", domain: "oil_gas" as const, exchange: "HOSE" },
  { actionCode: "GAS", domain: "oil_gas" as const, exchange: "HOSE" },
  { actionCode: "VJC", domain: "aviation" as const, exchange: "HOSE" },
  { actionCode: "GMD", domain: "logistics" as const, exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities" as const, exchange: "HOSE" },
];

describe("Task 1246 — Hormuz/Suez/OPEC cascade rules", () => {

  it("phong tỏa eo biển Hormuz → oil_gas BULLISH (supply shock = price spike)", () => {
    const entry = makeEntry(
      "Iran phong tỏa eo biển Hormuz, xuất khẩu dầu bị gián đoạn",
      "Tàu tanker không thể đi qua eo biển Hormuz, phong tỏa eo biển hormuz khiến giá dầu tăng vọt.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);
    const oilGasEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("oil_gas") && e.sentiment === "bullish"
    );
    expect(oilGasEntry).toBeDefined();
  });

  it("phong tỏa eo biển Hormuz → aviation BEARISH (fuel cost spike)", () => {
    const entry = makeEntry(
      "Iran phong tỏa eo biển Hormuz, xuất khẩu dầu bị gián đoạn",
      "Phong tỏa eo biển hormuz gây gián đoạn nguồn cung dầu toàn cầu, giá dầu tăng vọt.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);
    const aviationEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("aviation") && e.sentiment === "bearish"
    );
    expect(aviationEntry).toBeDefined();
  });

  it("phong tỏa eo biển Hormuz → securities BEARISH (risk-off market)", () => {
    const entry = makeEntry(
      "Iran phong tỏa eo biển Hormuz gây rủi ro địa chính trị toàn cầu",
      "Phong tỏa eo biển hormuz đe dọa oil supply shock, thị trường lo ngại rủi ro.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);
    const secEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("securities") && e.sentiment === "bearish"
    );
    expect(secEntry).toBeDefined();
  });

  it("Suez Canal closure → logistics BEARISH (route disruption)", () => {
    const entry = makeEntry(
      "Suez Canal closure disrupts global shipping",
      "The suez canal closure has been announced, disrupting oil supply and global shipping routes.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);
    const logEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("logistics") && e.sentiment === "bearish"
    );
    expect(logEntry).toBeDefined();
  });

  it("OPEC cắt giảm sản lượng → oil_gas BULLISH (price support)", () => {
    const entry = makeEntry(
      "OPEC cắt giảm sản lượng thêm 1 triệu thùng/ngày từ tháng tới",
      "OPEC+ đồng thuận opec cắt giảm mạnh sản lượng, gián đoạn nguồn cung dầu toàn cầu.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);
    const oilEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("oil_gas") && e.sentiment === "bullish"
    );
    expect(oilEntry).toBeDefined();
  });

  it("gián đoạn nguồn cung dầu → oil_gas BULLISH (supply disruption keyword)", () => {
    const entry = makeEntry(
      "Gián đoạn nguồn cung dầu nghiêm trọng từ Trung Đông",
      "Xung đột leo thang gây gián đoạn nguồn cung dầu, giá dầu tăng mạnh.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);
    const oilEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("oil_gas") && e.sentiment === "bullish"
    );
    expect(oilEntry).toBeDefined();
  });

  it("Strait of Hormuz blockade → matchedRules includes oil_gas sector", () => {
    const entry = makeEntry(
      "Strait of Hormuz blockade threatens oil supply",
      "hormuz strait blockade causes oil supply shock, disrupting global crude markets.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);
    const hasOilRule = chain.matchedRules.some((r) => r.sector === "oil_gas");
    expect(hasOilRule).toBe(true);
  });

  it("Hormuz blockade → VJC direction down in watchlistImpacts", () => {
    const entry = makeEntry(
      "Strait of Hormuz blockade oil supply shock crude oil spike",
      "hormuz strait blockade causes oil supply shock, aviation fuel costs surge.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);
    const vjcImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VJC");
    expect(vjcImpact?.impactDirection).toBe("down");
  });
});
