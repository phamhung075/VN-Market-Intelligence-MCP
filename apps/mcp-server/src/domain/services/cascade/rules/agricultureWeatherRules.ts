/**
 * AGRICULTURE_WEATHER_RULES — agriculture weather-event cascade rule table
 *
 * Extracted from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 1).
 * Pure data move, no behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

import type { CascadeKeywordRule } from "./cascadeKeywordRule.js";

/**
 * Agriculture weather cascade rules: Rainfall, drought, storm, cold snap events
 * trigger alerts to agriculture-domain stocks.
 *
 * Business logic:
 *   - Rainfall events: positive for aquaculture (QNT, ANV, MPC), neutral/negative for land crops
 *   - Drought events: negative for all agriculture (lower yields, higher input costs)
 *   - Storm events: negative for agriculture (structural damage, lost harvests)
 *   - Cold snap: negative for tropical crops, risk of animal loss
 *
 * Keywords are detected by agricultureDetector.ts; rules define severity + sector mapping.
 * Application layer (cascadeExecutor) filters watchlist to agriculture-domain stocks only.
 *
 * Task 1281: Agriculture weather cascade detection + application integration
 */
export const AGRICULTURE_WEATHER_RULES: CascadeKeywordRule[] = [
  // Rainfall rules (3 keywords → positive for aquaculture, neutral/negative for land crops)
  { key: "rainfall_heavy_vn", keyword: "mưa lớn", sector: "agriculture", impactType: "rainfall" },
  { key: "rainfall_continuous_vn", keyword: "mưa kiên kéo", sector: "agriculture", impactType: "rainfall" },
  { key: "flooding_vn", keyword: "lũ lụt", sector: "agriculture", impactType: "rainfall" },
  { key: "flooding_submersion_vn", keyword: "ngập lụt", sector: "agriculture", impactType: "rainfall" },

  // Drought rules (3 keywords → negative for all agriculture)
  { key: "drought_long_term_vn", keyword: "hạn hán", sector: "agriculture", impactType: "drought" },
  { key: "drought_water_shortage_vn", keyword: "thiếu nước", sector: "agriculture", impactType: "drought" },
  { key: "drought_dry_impact_vn", keyword: "khô hạn", sector: "agriculture", impactType: "drought" },

  // Storm rules (2 keywords → negative for agriculture)
  { key: "storm_typhoon_vn", keyword: "bão", sector: "agriculture", impactType: "storm" },
  { key: "storm_wind_damage_vn", keyword: "thiệt hại bão", sector: "agriculture", impactType: "storm" },

  // Cold snap rules (2 keywords → negative for tropical crops)
  { key: "cold_snap_strong_vn", keyword: "rét đậm", sector: "agriculture", impactType: "cold_snap" },
  { key: "cold_snap_siberia_vn", keyword: "gió lạnh siberia", sector: "agriculture", impactType: "cold_snap" },
];
