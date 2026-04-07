/**
 * User Request Tools — Task 305
 *
 * Exposes the `user_requests` SQLite table to Claude agents via two MCP tools:
 *
 *   1. `log_user_request`         — inserts a new pending request (command='ask')
 *   2. `get_pending_user_requests` — reads up to `limit` pending rows (FIFO)
 *
 * The underlying table and CRUD helpers already exist from Sprint 035b (Task 238)
 * in `src/infrastructure/db/userRequestStore.ts`. This file only adds the MCP
 * tool registration layer (interface layer), following DDD rules.
 *
 * @module interface/mcp/tools/userRequestTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";

import {
  ensureUserRequestsTable,
  insertUserRequest,
  getPendingRequests,
  type UserRequest,
} from "../../../infrastructure/db/userRequestStore.js";
import { getDb } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pure business logic helpers (testable without MCP server)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new pending user request.
 *
 * Always sets `command = 'ask'` regardless of the `source` label — source is
 * informational metadata captured in the log, not persisted separately.
 *
 * @param db       - SQLite database instance (injected for testability)
 * @param question - The question text to store as `payload`
 * @param source   - Informational label (e.g. "user", "telegram", "mcp")
 * @returns        - `{ id: number, status: 'pending' }`
 */
export function logUserRequest(
  db: Database,
  question: string,
  source: string,
): { id: number; status: "pending" } {
  ensureUserRequestsTable(db);
  const id = insertUserRequest(db, "ask", question);
  logger.debug(`[log_user_request] Inserted id=${id} source=${source} payload="${question.slice(0, 60)}"`);
  return { id, status: "pending" };
}

/**
 * Retrieve pending user requests ordered by creation time (FIFO).
 *
 * @param db    - SQLite database instance (injected for testability)
 * @param limit - Maximum rows to return (default 5)
 * @returns     - Array of pending `UserRequest` rows
 */
export function getPendingUserRequests(
  db: Database,
  limit: number = 5,
): UserRequest[] {
  ensureUserRequestsTable(db);
  return getPendingRequests(db, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `log_user_request` and `get_pending_user_requests` MCP tools.
 *
 * @param server - McpServer instance to register tools on
 */
export function registerUserRequestTools(server: McpServer): void {

  // ── 1. log_user_request ──────────────────────────────────────────────────
  server.tool(
    "log_user_request",
    "Insert a new pending user question into the user_requests store. " +
      "Use this when the user asks a question via any channel and you want the " +
      "intelligence cycle to answer it within the next 15-minute run. " +
      "Returns {id, status: 'pending'} so you can track the request.",
    {
      question: z.string().min(1).max(2000)
        .describe("The question or request text to store as payload (Vietnamese or English)"),
      source: z.string().min(1).max(50).default("mcp")
        .describe("Source label: 'user', 'telegram', 'mcp', 'agent', etc. Informational only."),
    },
    async ({ question, source }) => {
      try {
        const db = getDb();
        const result = logUserRequest(db, question, source);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error("[log_user_request] Failed to insert user request", {
          detail: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to log user request",
                detail: err instanceof Error ? err.message : String(err),
              }, null, 2),
            },
          ],
        };
      }
    },
  );

  // ── 2. get_pending_user_requests ─────────────────────────────────────────
  server.tool(
    "get_pending_user_requests",
    "Read pending user questions from the user_requests store (status='pending'), " +
      "ordered by creation time (oldest first). " +
      "Use this to find questions that the intelligence cycle has not yet answered. " +
      "Returns an array of rows with id, command, payload, status, created_at.",
    {
      limit: z.coerce.number().int().min(1).max(50).optional().default(5)
        .describe("Maximum number of pending requests to return (default 5, max 50)"),
    },
    async ({ limit }) => {
      try {
        const db = getDb();
        const rows = getPendingUserRequests(db, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error("[get_pending_user_requests] Failed to read pending requests", {
          detail: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to get pending user requests",
                detail: err instanceof Error ? err.message : String(err),
              }, null, 2),
            },
          ],
        };
      }
    },
  );
}
