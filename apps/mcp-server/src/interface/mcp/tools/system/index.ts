/**
 * System module barrel — Phase 1 P1-C barrel wave 1
 * Decomposed into 5 sub-barrels: memory, coordination, ops-debug, observability, vps
 *
 * Tool files themselves do NOT move — only index.ts files are created/modified.
 * This thin re-exporter delegates to bounded sub-barrels.
 */
// memory: agent memory, work-log, feedback, watchlist
export * from "./memory/index.js";
// coordination: task-lock, ask-queue, bootstrap, compact
export * from "./coordination/index.js";
// ops-debug: BCTC/news/price/SBV/foreign-flow trigger tools
export * from "./ops-debug/index.js";
// observability: SLA status, signal diagnostics, system health, data freshness
export * from "./observability/index.js";
// vps: VPS health, proxy, service restart
export * from "./vps/index.js";
