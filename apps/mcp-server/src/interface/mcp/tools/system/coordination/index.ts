/**
 * system/coordination — Sub-barrel (P1-C barrel wave 1)
 * Agent coordination, task-lock, ask-queue, bootstrap, compact, and telemetry tools.
 * Re-exports only — no logic.
 */
export { registerCoordinationTools } from "../coordinationTools.js";
export { registerAskQueueTools } from "../askQueueTools.js";
export { registerCycleBootstrapTool } from "../cycleBootstrapTool.js";
export { registerSmartCompactTool } from "../smartCompactTool.js";
// EMIT-DARK-OPTION-C: dispatcher calls this instead of the (never-run) bash heredoc
export { registerEmitPressureStateTool } from "../emitPressureStateTool.js";
