/**
 * system/vps — Sub-barrel (P1-C barrel wave 1)
 * VPS health monitoring, proxy management, and service restart tools.
 * Re-exports only — no logic.
 */
export { registerVpsHealthTools } from "../vpsHealthTools.js";
export { registerVpsProxyTools } from "../vpsProxyTools.js";
export { registerVpsServiceRestartTool } from "../vpsServiceRestartTool.js";
