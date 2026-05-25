/**
 * VN Market Intelligence MCP — Bun Entry Point
 * ─────────────────────────────────────────────────────────────────────────
 * Thin entry point: LanceDB env suppression, config/logger init, then
 * delegates all bootstrap orchestration to bootstrapMcpServer().
 *
 * Bootstraps:
 *   1. SQLite schema (task 002)
 *   2. Bun HTTP server + MCP SSE transport (task 081)
 *   3. Scheduled cron jobs (task 101-105)
 *
 * Start:
 *   bun run src/index.ts
 *   bun --watch src/index.ts    ← development with hot reload
 *
 * Claude Desktop config (~/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "vn-market": {
 *         "url": "http://localhost:3000/sse"
 *       }
 *     }
 *   }
 * ─────────────────────────────────────────────────────────────────────────
 */

// Suppress verbose LanceDB/Rust TRACE logs — only show errors
// Must be set before any LanceDB import (Bun reads .env at startup too)
if (!Bun.env.RUST_LOG) Bun.env.RUST_LOG = "error";
if (!Bun.env.LANCEDB_LOG_LEVEL) Bun.env.LANCEDB_LOG_LEVEL = "warn";

import { loadConfig } from "./infrastructure/config.js";
import { createLogger } from "./infrastructure/logger.js";
import { bootstrapMcpServer } from "./composition-root.js";

const cfg = loadConfig();
const log = createLogger(cfg.logLevel);

log.info("[bootstrap] Starting VN Market Intelligence MCP...");

await bootstrapMcpServer(cfg, log);
