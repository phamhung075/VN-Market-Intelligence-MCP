/**
 * macro/local-computation — Sub-barrel (P1-D barrel wave 2)
 *
 * LOCAL-COMPUTATION: legitimately mcp-server-owned — not a G5 violation.
 * These tools call domain/services/macro/ functions or infrastructure/db/ stores.
 * They are NOT proxied to the macro-indicators:5004 microservice because they
 * implement computation owned by mcp-server domain logic (investment clock,
 * IMF signals, ISM subcomponents, fed liquidity, calibration, prediction, etc.).
 *
 * Re-exports only — no logic.
 */
export { registerPolicyTools } from "../policyTools.js";
export { registerCalibrationTools } from "../calibrationTools.js";
export { registerRateLimitTools } from "../rateLimitTools.js";
export { registerImfSignalsTool } from "../imfSignals.js";
export { registerInvestmentClockTools, registerPyramidTierTool } from "../investmentClockTools.js";
export { registerFedLiquiditySpreadTool } from "../getFedLiquiditySpreadTool.js";
export { registerGetIsmSubcomponentsTool } from "../getIsmSubcomponentsTool.js";
export { registerEvidenceTools } from "../evidenceTools.js";
export { registerPredictionTools } from "../predictionTools.js";
