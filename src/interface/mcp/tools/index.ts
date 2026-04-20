/**
 * MCP Tools — top-level barrel — Sprint 210
 *
 * Re-exports all tool register functions grouped by feature module.
 * Each sub-barrel declares the public contract for its module.
 *
 * Module groups:
 *   market-data      — prices, foreign flow, technical indicators, insider
 *   financial-reports — BCTC, earnings calendar, reports
 *   news-analysis    — cascade, sentiment, search, source health
 *   alerts           — alert firing, accuracy, digests, mutes, pipeline health
 *   portfolio        — positions, P&L, risk, rebalancing, allocation
 *   briefings        — summaries, market messages, Telegram, changelog
 *   macro            — macro indicators, policy, predictions, calibration
 *   sector           — sector comparison, rotation, thematic tools
 *   kinhdich         — hexagram readings
 *   system           — system tools, VPS proxy, ask queue, watchlist
 *
 * @module interface/mcp/tools
 */
export * from "./market-data/index.js";
export * from "./financial-reports/index.js";
export * from "./news-analysis/index.js";
export * from "./alerts/index.js";
export * from "./portfolio/index.js";
export * from "./briefings/index.js";
export * from "./macro/index.js";
export * from "./sector/index.js";
export * from "./kinhdich/index.js";
export * from "./system/index.js";
