/**
 * macro/http-proxy — Sub-barrel (P1-D barrel wave 2)
 *
 * Tools that delegate to macro-indicators:5004 via HTTP.
 * All tools in this sub-barrel import from macroHttpClient.ts (MACRO_INDICATORS_URL).
 * Re-exports only — no logic.
 *
 * Routing helpers included:
 *   - macroHttpClient.ts: getMacroBaseUrl() — env-var-driven URL provider
 *   - macroSnapshotGuard.ts: isMacroSnapshotValidShape() — pure threshold guard
 *     (G1-PRIMITIVE-CANDIDATE: zero I/O, zero infra imports — Phase 2 promotion target)
 */
export { registerMacroTools } from "../macroTools.js";
export { registerCarryTools } from "../carryTools.js";
export { registerDinhGiaTools } from "../dinhGiaTools.js";
export { getMacroBaseUrl } from "../macroHttpClient.js";
export { isMacroSnapshotValidShape } from "../macroSnapshotGuard.js";
// VMT-7 Zone-B wave — 5 new VN macro data tools
export { registerTradeBalanceTools } from "../tradeBalanceTools.js";
export { registerBopTools } from "../bopTools.js";
export { registerMacroIndicatorsVnTools } from "../macroIndicatorsVnTools.js";
export { registerCpiComponentsTools } from "../cpiComponentsTools.js";
export { registerLiquidityStateTools } from "../liquidityStateTools.js";
