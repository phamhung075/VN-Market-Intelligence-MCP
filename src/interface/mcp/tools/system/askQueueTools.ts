/**
 * Task 1078 — askQueueTools MCP Tools
 *
 * Two MCP tools for the 07-qa-responder Cowork agent to process the /ask queue:
 *   1. get_pending_ask_questions — FIFO list of questions awaiting an answer
 *   2. answer_ask_question       — record answer and set final status
 *
 * Both tools delegate directly to askQueueStore helpers; no SQL is written here.
 *
 * @module interface/mcp/tools/askQueueTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";

import { getDb } from "../../../../infrastructure/db/schema.js";
import {
  getPendingAskQuestions,
  answerAskQuestion,
} from "../../../../infrastructure/db/askQueueStore.js";
import { spawnQaResponder } from "../../../../infrastructure/agents/qaResponderSpawner.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Terminal statuses that the 07-qa-responder may set. */
const AnswerStatusSchema = z.enum(["answered", "escalated", "failed"]);

const AnswerAskQuestionSchema = {
  id: z
    .number()
    .int()
    .positive()
    .describe("Row id of the ask_queue entry to answer"),
  answer_text: z
    .string()
    .min(1)
    .max(10000)
    .describe("The answer text, escalation note, or failure reason"),
  status: AnswerStatusSchema.describe(
    "Terminal status: 'answered' = fully resolved, 'escalated' = needs human, 'failed' = could not process",
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register both ask-queue MCP tools on the given server instance.
 *
 * @param server  - The McpServer instance to register tools on.
 * @param _testDb - Optional test DB (injected in tests). In production, uses getDb().
 */
export function registerAskQueueTools(server: McpServer, _testDb?: Database): void {

  // ── 1. get_pending_ask_questions ──────────────────────────────────────────

  server.tool(
    "get_pending_ask_questions",
    "Return up to 10 pending /ask questions from the ask_queue in FIFO order " +
      "(oldest first). Each item contains: id, message, received_at. " +
      "Used by the 07-qa-responder agent to fetch its work queue.",
    {},
    async () => {
      const db = _testDb ?? getDb();
      try {
        const rows = getPendingAskQuestions(db, 10);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      } catch (err) {
        console.error("[get_pending_ask_questions] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 2. run_qa_responder ───────────────────────────────────────────────────

  server.tool(
    "run_qa_responder",
    "Spawn the 07-qa-responder agent locally via claude CLI to process pending /ask questions. " +
      "No-op if queue is empty (0 tokens wasted) or agent is already running. " +
      "Returns spawn status: spawned, reason, pending count.",
    {},
    async () => {
      const result = spawnQaResponder();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── 3. answer_ask_question ────────────────────────────────────────────────

  server.tool(
    "answer_ask_question",
    "Record the answer to a pending /ask question and set its final status. " +
      "status must be one of: 'answered' (fully resolved), 'escalated' (needs human), " +
      "'failed' (could not process). Calls answerAskQuestion() in askQueueStore.",
    AnswerAskQuestionSchema,
    async (args) => {
      const db = _testDb ?? getDb();

      // Zod validation — status is constrained by AnswerStatusSchema in schema
      // but we also validate defensively here so unknown values get a clear error.
      const parseResult = AnswerStatusSchema.safeParse(args.status);
      if (!parseResult.success) {
        const message =
          `Error: invalid status '${args.status}'. ` +
          `Allowed values: 'answered', 'escalated', 'failed'. ` +
          `Details: ${parseResult.error.message}`;
        return {
          content: [{ type: "text" as const, text: message }],
        };
      }

      try {
        answerAskQuestion(db, args.id, args.answer_text, parseResult.data);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  id: args.id,
                  newStatus: parseResult.data,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        console.error("[answer_ask_question] Error for id", args.id, ":", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
