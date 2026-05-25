/**
 * sector/cross-cutting — Sub-barrel (P1-E barrel wave 3)
 * Thematic cross-cutting sector topics: credit, crisis, supply chain, climate, energy,
 * broker credibility, bond maturity, and severity label mapping.
 *
 * G1-PRIMITIVE-CANDIDATE: pure data mapping — no I/O, zero infra imports
 *   severityLabels.ts: SEVERITY_VI constant (string → display label mapping)
 *   Phase 2 promotion target for packages/primitives/.
 *
 * Re-exports only — no logic.
 */
export { registerCreditFlowTools } from "../creditFlowTools.js";
export { registerCrisisTools } from "../crisisTools.js";
export { registerSupplyChainTools } from "../supplyChainTools.js";
export { registerClimateTools } from "../climateTools.js";
export { registerEnergyTools } from "../energyTools.js";
export { registerBrokerCredibilityTools } from "../brokerCredibilityTools.js";
export { registerBondMaturityTools } from "../bondMaturityTools.js";
// G1-PRIMITIVE-CANDIDATE: pure data mapping — no I/O, zero infra imports
export { SEVERITY_VI } from "../severityLabels.js";
