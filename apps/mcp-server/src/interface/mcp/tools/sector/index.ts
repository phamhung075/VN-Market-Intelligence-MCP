/**
 * Sector module barrel — Phase 1 P1-E barrel wave 3
 * Decomposed into 3 sub-barrels: domestic, market, cross-cutting
 *
 * domestic: Vietnam-domestic sector topics (pharma, legal, leadership, public-investment)
 * market: market-structure topics (rotation, comparison, correlation)
 * cross-cutting: thematic topics (credit, crisis, supply-chain, climate, energy, broker, bond, severity)
 *
 * Tool files themselves do NOT move — only index.ts files are created/modified.
 */
// domestic: pharma, legal, leadership, public-investment
export * from "./domestic/index.js";
// market: sector rotation, comparison, correlation
export * from "./market/index.js";
// cross-cutting: credit, crisis, supply-chain, climate, energy, broker, bond, severity labels
export * from "./cross-cutting/index.js";
