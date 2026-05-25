/**
 * system/coordination — Sub-barrel (P1-C barrel wave 1)
 * Agent coordination, task-lock, ask-queue, bootstrap, and compact tools.
 * Re-exports only — no logic.
 */
export { registerCoordinationTools } from "../coordinationTools.js";
export { registerAskQueueTools } from "../askQueueTools.js";
export { registerCycleBootstrapTool } from "../cycleBootstrapTool.js";
export { registerSmartCompactTool } from "../smartCompactTool.js";
