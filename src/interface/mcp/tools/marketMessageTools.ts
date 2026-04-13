/**
 * Interface — Market Message MCP Tools (Sprint 068 + 069)
 *
 * Registers four MCP tools for the MARKET message quality review workflow:
 *   - `get_unreviewed_market_messages`  — list unreviewed MARKET channel messages
 *   - `review_market_message`           — label a message as signal or noise
 *   - `get_market_message_digest`       — grouped digest of unreviewed messages by date/agent
 *   - `batch_review_market_messages`    — label a batch of messages in one call
 *
 * Implementation note: handler functions are exported separately
 * from `registerMarketMessageTools` so tests can call them directly without
 * needing a full McpServer instance.
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
  getMarketMessageDigest,
  batchReviewMarketMessages,
  type BatchReviewResult,
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

/**
 * Handles the `get_market_message_digest` tool invocation.
 *
 * Returns a human-readable digest of unreviewed MARKET channel messages,
 * grouped by calendar date then sending agent.
 *
 * @param args.limit_days - How many calendar days back to look (default 7)
 */
export async function handleGetMarketMessageDigest(args: {
  limit_days?: number | undefined;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const db = getDb();
  const days = args.limit_days ?? 7;
  const entries = getMarketMessageDigest(db, days);

  if (entries.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Khong co tin nhan chua review trong ${days} ngay qua.`,
        },
      ],
    };
  }

  const totalCount = entries.reduce((sum, e) => sum + e.count, 0);
  const lines: string[] = [
    `Digest chua review — ${days} ngay gan nhat`,
    "=========================================",
  ];
  let currentDate = "";
  for (const entry of entries) {
    if (entry.date !== currentDate) {
      if (currentDate !== "") lines.push("");
      lines.push(`[${entry.date}]`);
      currentDate = entry.date;
    }
    lines.push(`  ${entry.from_agent.padEnd(18)} ${entry.count} tin  ids: [${entry.ids.join(", ")}]`);
    lines.push(`    Preview: "${entry.preview}"`);
  }
  lines.push("");
  lines.push("-----------------------------------------");
  lines.push(`Tong: ${totalCount} tin chua review. Dung batch_review_market_messages de danh gia hang loat.`);

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

/**
 * Handles the `batch_review_market_messages` tool invocation.
 *
 * Applies a single verdict to a list of message IDs in one SQLite transaction.
 * Partial success is normal — ids not found are reported in the response text.
 *
 * @param args.ids     - Array of market_messages ids to review
 * @param args.verdict - "signal" or "noise"
 * @param args.note    - Optional free-text note applied to all rows in the batch
 */
export async function handleBatchReviewMarketMessages(args: {
  ids: number[];
  verdict: "signal" | "noise";
  note?: string | undefined;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const db = getDb();
  let result: BatchReviewResult;

  try {
    result = batchReviewMarketMessages(db, args.ids, args.verdict, args.note ?? null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `Error in batch review: ${msg}` }],
    };
  }

  const { updated, notFound } = result;
  const noteText = args.note ? " Note saved." : "";

  if (updated === 0 && notFound.length > 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Khong tim thay bat ky tin nhan nao. IDs: [${notFound.join(", ")}].`,
        },
      ],
    };
  }

  const notFoundText =
    notFound.length > 0
      ? ` ${notFound.length} ID khong tim thay: [${notFound.join(", ")}].`
      : "";

  return {
    content: [
      {
        type: "text" as const,
        text: `${updated} tin da duoc danh gia la '${args.verdict}'.${notFoundText}${noteText}`,
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

  server.tool(
    "get_market_message_digest",
    "Returns a grouped digest of unreviewed MARKET channel messages, grouped by date and sending agent. " +
    "Use this first thing in the morning to see what fired overnight. " +
    "Each entry shows a count and a preview. " +
    "Use the ids from each entry with batch_review_market_messages to label them all at once. " +
    "limit_days controls how many calendar days back to look (default 7).",
    {
      limit_days: z.coerce.number().int().min(1).max(30).default(7).optional()
        .describe("How many calendar days back to search (1-30, default 7)"),
    },
    async ({ limit_days }) => handleGetMarketMessageDigest({ limit_days }),
  );

  server.tool(
    "batch_review_market_messages",
    "Labels a list of MARKET channel messages with a single verdict in one call. " +
    "Pass the ids from get_market_message_digest. " +
    "Use verdict='noise' to clear low-value overnight messages, 'signal' for genuine alerts. " +
    "Returns a count of how many were updated and which ids were not found.",
    {
      ids: z.array(z.number().int().min(1)).min(1).max(200)
        .describe("Array of market_messages ids to review (from get_market_message_digest)"),
      verdict: z.enum(["signal", "noise"])
        .describe("'signal' = genuine useful alert. 'noise' = false positive or low-value."),
      note: z.string().optional()
        .describe("Optional free-text note applied to all messages in this batch"),
    },
    async ({ ids, verdict, note }) => handleBatchReviewMarketMessages({ ids, verdict, note }),
  );
}
