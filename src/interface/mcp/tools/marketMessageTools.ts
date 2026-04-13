/**
 * Interface — Market Message MCP Tools (Sprint 068)
 *
 * Registers two MCP tools for the MARKET message quality review workflow:
 *   - `get_unreviewed_market_messages` — list unreviewed MARKET channel messages
 *   - `review_market_message`          — label a message as signal or noise
 *
 * Implementation note (Task 1166): handler functions are exported separately
 * from `registerMarketMessageTools` so tests can call them directly without
 * needing a full McpServer instance.
 *
 * This file is created in Task 1164 as a stub (handlers return placeholder text).
 * Full implementation is delivered in Task 1166.
 *
 * DDD layer: interface — imports only from infrastructure/db, never from domain/.
 *
 * @module interface/mcp/tools/marketMessageTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getUnreviewedMarketMessages,
  reviewMarketMessage,
} from "../../../infrastructure/db/marketMessageStore.js";
import { getDb } from "../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Handler functions (exported for direct test use)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles the `get_unreviewed_market_messages` tool invocation.
 *
 * Returns unreviewed MARKET channel rows as a JSON array, newest first.
 * If no rows are found, returns a bilingual empty-state message.
 *
 * @param args.limit  - Max rows to return (default 20)
 * @param args.ticker - Optional ticker filter
 */
export async function handleGetUnreviewedMarketMessages(args: {
  limit?: number | undefined;
  ticker?: string | undefined;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const db = getDb();
  const rows = getUnreviewedMarketMessages(db, args.limit, args.ticker ?? null);

  if (rows.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Khong co tin nhan chua review. Tat ca da duoc danh gia.",
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(rows, null, 2),
      },
    ],
  };
}

/**
 * Handles the `review_market_message` tool invocation.
 *
 * Sets the verdict and optional note on a market message row.
 *
 * @param args.id      - Row id to review
 * @param args.verdict - "signal" or "noise"
 * @param args.note    - Optional free-text note
 */
export async function handleReviewMarketMessage(args: {
  id: number;
  verdict: "signal" | "noise";
  note?: string | undefined;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const db = getDb();

  let updated: boolean;
  try {
    updated = reviewMarketMessage(db, args.id, args.verdict, args.note ?? null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `Error reviewing message ${args.id}: ${msg}` }],
    };
  }

  if (!updated) {
    return {
      content: [{ type: "text" as const, text: `Message ${args.id} not found.` }],
    };
  }

  const noteText = args.note ? ` Note saved.` : "";
  return {
    content: [
      {
        type: "text" as const,
        text: `Message ${args.id} labelled as '${args.verdict}'.${noteText}`,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the market message review MCP tools on the given server.
 *
 * @param server - MCP server instance
 */
export function registerMarketMessageTools(server: McpServer): void {
  server.tool(
    "get_unreviewed_market_messages",
    "List unreviewed MARKET channel messages for quality review. Returns newest first. Optional ticker filter.",
    {
      limit: z.coerce.number().int().min(1).max(50).default(20).optional(),
      ticker: z.string().optional(),
    },
    async (args) => {
      return handleGetUnreviewedMarketMessages(args);
    },
  );

  server.tool(
    "review_market_message",
    "Label a MARKET channel message as 'signal' (actionable intelligence) or 'noise' (low-value). Idempotent — calling twice overwrites the previous verdict.",
    {
      id: z.number().int().min(1),
      verdict: z.enum(["signal", "noise"]),
      note: z.string().optional(),
    },
    async (args) => {
      return handleReviewMarketMessage(args);
    },
  );
}
