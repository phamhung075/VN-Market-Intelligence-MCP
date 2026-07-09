/**
 * cascade/rules — barrel export
 *
 * Re-exports the 9 cascade rule-data constants + their interfaces, extracted
 * from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Steps 1-2).
 * cascadeEngine.ts imports from this barrel (Step 2 — pure re-export wiring,
 * no behavior change).
 *
 * Layer: domain/services
 */

export * from "./sectorRules.js";
export * from "./cascadeKeywordRule.js";
export * from "./legalRiskRules.js";
export * from "./policyRules.js";
export * from "./insiderDumpRules.js";
export * from "./msciInclusionRules.js";
export * from "./msciWatchlistRules.js";
export * from "./msciExclusionRules.js";
export * from "./agricultureWeatherRules.js";
export * from "./imfCascadeRules.js";
