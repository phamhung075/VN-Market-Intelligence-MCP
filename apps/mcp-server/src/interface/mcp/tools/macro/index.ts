/**
 * Macro module barrel — Phase 1 P1-D barrel wave 2
 * Decomposed into 2 sub-barrels: http-proxy, local-computation
 *
 * http-proxy: tools that delegate to macro-indicators:5004 via HTTP
 * local-computation: tools with legitimate local domain ownership (NOT G5 targets)
 *
 * Tool files themselves do NOT move — only index.ts files are created/modified.
 */
// HTTP-proxy: macro/carry/dinhGia tools + routing helpers (macroHttpClient, macroSnapshotGuard)
export * from "./http-proxy/index.js";
// Local-computation: policy, calibration, rateLimiter, IMF, investmentClock, fedLiquidity, ISM, evidence, prediction
export * from "./local-computation/index.js";
