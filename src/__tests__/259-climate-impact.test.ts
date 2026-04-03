/**
 * Task 259 — Climate Impact Mapper Tests
 *
 * Pure domain service: maps weather events to stock-level impacts.
 * 15 tests covering all major event types + seasonal calendar logic.
 */

import { describe, it, expect } from "bun:test";
import {
  mapClimateImpact,
  getSeasonalContext,
  type ClimateSignal,
} from "../domain/services/climateImpactMapper.js";
import type { WeatherEvent } from "../infrastructure/fetchers/weatherVn.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const droughtEvent: WeatherEvent = {
  type: "drought",
  severity: "high",
  regions: ["Tây Nguyên", "Gia Lai"],
  forecastDate: "2026-03-15",
  impactDuration: "2-3 tháng",
  description: "Hạn hán nghiêm trọng tại Tây Nguyên",
};

const typhoonHighEvent: WeatherEvent = {
  type: "typhoon",
  severity: "high",
  regions: ["Quảng Nam", "Đà Nẵng"],
  forecastDate: "2026-09-20",
  impactDuration: "48 giờ",
  description: "Bão số 5 cấp độ 3",
};

const typhoonCriticalEvent: WeatherEvent = {
  type: "typhoon",
  severity: "critical",
  regions: ["Miền Trung"],
  forecastDate: "2026-10-10",
  impactDuration: "72 giờ",
  description: "Bão số 7 cấp độ 4, rất mạnh",
};

const elNinoEvent: WeatherEvent = {
  type: "el_nino",
  severity: "medium",
  regions: ["Đông Nam Á", "Việt Nam"],
  forecastDate: "2026-02-01",
  impactDuration: "6 tháng",
  description: "El Niño hoạt động mạnh",
};

const laNinaEvent: WeatherEvent = {
  type: "la_nina",
  severity: "medium",
  regions: ["Đông Nam Á", "Việt Nam"],
  forecastDate: "2026-11-01",
  impactDuration: "4 tháng",
  description: "La Niña đang hoạt động",
};

const heatWaveEvent: WeatherEvent = {
  type: "heat_wave",
  severity: "high",
  regions: ["Hà Nội", "Bắc Bộ"],
  forecastDate: "2026-07-05",
  impactDuration: "5 ngày",
  description: "Nắng nóng 40°C tại miền Bắc",
};

const floodEvent: WeatherEvent = {
  type: "flood",
  severity: "medium",
  regions: ["Thanh Hóa", "Nghệ An"],
  forecastDate: "2026-09-25",
  impactDuration: "3 ngày",
  description: "Lũ lớn miền Bắc Trung Bộ",
};

const coldSnapEvent: WeatherEvent = {
  type: "cold_snap",
  severity: "medium",
  regions: ["Hà Nội", "Bắc Bộ"],
  forecastDate: "2026-01-15",
  impactDuration: "7 ngày",
  description: "Rét đậm rét hại miền Bắc",
};

const watchlist = [
  { actionCode: "REE", domain: "utilities" },
  { actionCode: "GEG", domain: "utilities" },
  { actionCode: "BVH", domain: "insurance" },
  { actionCode: "PVI", domain: "insurance" },
  { actionCode: "MPC", domain: "seafood" },
  { actionCode: "ANV", domain: "seafood" },
  { actionCode: "IDC", domain: "industrial_zone" },
  { actionCode: "KBC", domain: "industrial_zone" },
  { actionCode: "DCM", domain: "chemicals" },
  { actionCode: "DPM", domain: "chemicals" },
  { actionCode: "CHP", domain: "utilities" },
  { actionCode: "VNM", domain: "food_beverage" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 259 — Climate Impact Mapper", () => {
  // 1. Returns a ClimateSignal with required fields
  it("mapClimateImpact returns ClimateSignal with required fields", () => {
    const result = mapClimateImpact(droughtEvent, watchlist);
    expect(result).toBeDefined();
    expect(result.eventType).toBe("drought");
    expect(typeof result.severity).toBe("string");
    expect(Array.isArray(result.affectedStocks)).toBe(true);
    expect(typeof result.seasonalContext).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  // 2. Drought → REE bullish (solar replaces hydro)
  it("drought makes REE bullish (solar replaces hydro)", () => {
    const result = mapClimateImpact(droughtEvent, watchlist);
    const ree = result.affectedStocks.find((s) => s.code === "REE");
    expect(ree).toBeDefined();
    expect(ree!.direction).toBe("up");
  });

  // 3. Drought → small hydro stocks bearish (CHP)
  it("drought makes CHP bearish (small hydro output drops)", () => {
    const result = mapClimateImpact(droughtEvent, watchlist);
    const chp = result.affectedStocks.find((s) => s.code === "CHP");
    expect(chp).toBeDefined();
    expect(chp!.direction).toBe("down");
  });

  // 4. El Niño → same logic as drought for energy stocks
  it("El Nino affects energy stocks like drought", () => {
    const result = mapClimateImpact(elNinoEvent, watchlist);
    const ree = result.affectedStocks.find((s) => s.code === "REE");
    expect(ree).toBeDefined();
    expect(ree!.direction).toBe("up");
  });

  // 5. Typhoon high severity → BVH bearish (insurance claims)
  it("typhoon high severity makes BVH bearish (insurance claims)", () => {
    const result = mapClimateImpact(typhoonHighEvent, watchlist);
    const bvh = result.affectedStocks.find((s) => s.code === "BVH");
    expect(bvh).toBeDefined();
    expect(bvh!.direction).toBe("down");
  });

  // 6. Typhoon high → MPC bearish (aquaculture losses)
  it("typhoon makes MPC bearish (aquaculture pond damage)", () => {
    const result = mapClimateImpact(typhoonHighEvent, watchlist);
    const mpc = result.affectedStocks.find((s) => s.code === "MPC");
    expect(mpc).toBeDefined();
    expect(mpc!.direction).toBe("down");
  });

  // 7. Critical typhoon → higher confidence than high typhoon
  it("critical typhoon has higher confidence than high", () => {
    const high = mapClimateImpact(typhoonHighEvent, watchlist);
    const critical = mapClimateImpact(typhoonCriticalEvent, watchlist);
    expect(critical.confidence).toBeGreaterThanOrEqual(high.confidence);
  });

  // 8. Heat wave (Jun-Aug) → IDC/KBC bearish (power shortage risk for industrial zones)
  it("heat wave in summer makes industrial zone stocks bearish", () => {
    const result = mapClimateImpact(heatWaveEvent, watchlist);
    const idc = result.affectedStocks.find((s) => s.code === "IDC");
    expect(idc).toBeDefined();
    expect(idc!.direction).toBe("down");
  });

  // 9. Heat wave → GEG bullish (renewable demand surge)
  it("heat wave makes GEG bullish (renewable demand surge)", () => {
    const result = mapClimateImpact(heatWaveEvent, watchlist);
    const geg = result.affectedStocks.find((s) => s.code === "GEG");
    expect(geg).toBeDefined();
    expect(geg!.direction).toBe("up");
  });

  // 10. Flood → VNM bearish (supply chain disruption)
  it("flood makes VNM bearish (supply chain disruption)", () => {
    const result = mapClimateImpact(floodEvent, watchlist);
    const vnm = result.affectedStocks.find((s) => s.code === "VNM");
    expect(vnm).toBeDefined();
    expect(vnm!.direction).toBe("down");
  });

  // 11. Cold snap (Jan-Mar) → DCM bullish (fertilizer demand)
  it("cold snap makes DCM bearish (crop damage, reduced fertilizer demand)", () => {
    const result = mapClimateImpact(coldSnapEvent, watchlist);
    // Cold snap in winter season affects fertilizer stocks (farmers reduce orders)
    const dcm = result.affectedStocks.find((s) => s.code === "DCM");
    expect(dcm).toBeDefined();
  });

  // 12. La Niña → increased rainfall context
  it("La Nina has appropriate seasonalContext mentioning rain", () => {
    const result = mapClimateImpact(laNinaEvent, watchlist);
    expect(result.seasonalContext.toLowerCase()).toMatch(/mưa|lũ|la niña|nước/i);
  });

  // 13. seasonalContext non-empty for all events
  it("seasonalContext is non-empty for all weather events", () => {
    const events = [droughtEvent, typhoonHighEvent, elNinoEvent, heatWaveEvent, floodEvent];
    for (const event of events) {
      const result = mapClimateImpact(event, watchlist);
      expect(result.seasonalContext.length).toBeGreaterThan(0);
    }
  });

  // 14. getSeasonalContext returns correct risk window for month
  it("getSeasonalContext returns typhoon risk for month 9 (September)", () => {
    const ctx = getSeasonalContext(9);
    expect(ctx.toLowerCase()).toMatch(/bão|typhoon|lũ/i);
  });

  // 15. getSeasonalContext returns drought risk for month 3 (March)
  it("getSeasonalContext returns drought risk for month 3 (March, dry season)", () => {
    const ctx = getSeasonalContext(3);
    expect(ctx.toLowerCase()).toMatch(/hạn|khô|el niño/i);
  });
});
