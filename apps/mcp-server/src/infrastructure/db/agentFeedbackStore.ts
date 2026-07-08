/**
 * Agent Feedback Store — Telegram /report /fix write path (FACTORY-INFRA-split-telegramCommands)
 *
 * Extracted verbatim from telegramCommands.ts's handleReport (was lines
 * 316-320). agent_feedback DDL is canonical in infrastructure/db/schema.ts
 * (task 1022) — initDatabase() creates the table on server start; no inline
 * guard needed here.
 *
 * @module infrastructure/db/agentFeedbackStore
 */

import type { Database } from "bun:sqlite";

export interface AgentFeedbackInsert {
  agent: string;
  category: string;
  title: string;
  detail: string;
  priority: "medium" | "high";
}

/** Insert a new agent_feedback row with status='new' and created_at=now. */
export function insertAgentFeedback(db: Database, input: AgentFeedbackInsert): void {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO agent_feedback
       (agent, category, title, detail, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?)`,
  ).run(input.agent, input.category, input.title, input.detail, input.priority, now);
}
