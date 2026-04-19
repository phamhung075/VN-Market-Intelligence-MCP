/**
 * qaResponderSpawner — spawn 07-qa-responder via local claude CLI
 *
 * Called by:
 *   - telegramCommands.ts handleAsk()  → immediate fire on /ask insert
 *   - askQueueCheckJob.ts              → 12-min fallback if instant spawn missed
 *   - run_qa_responder MCP tool        → callable by Claude agents
 *
 * Contract:
 *   - Checks ask_queue first. If empty → returns immediately (0 Claude tokens).
 *   - Simple boolean mutex prevents concurrent spawns.
 *   - Fire-and-forget: spawned process runs independently, caller does not await.
 *
 * @module infrastructure/agents/qaResponderSpawner
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { getPendingAskQuestions } from "../db/askQueueStore.js";
import { getDb } from "../db/schema.js";
import type { Database } from "bun:sqlite";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dir, "../../..");
const AGENT_FILE = resolve(PROJECT_ROOT, "cowork-analysis-vnmarket-team/07-qa-responder.md");
const CLAUDE_BIN = "/Users/admin/.local/bin/claude";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpawnReason = "ok" | "no_pending" | "already_running" | "error";

export interface SpawnResult {
  spawned: boolean;
  reason: SpawnReason;
  pending?: number;
  error?: string;
}

// ── Mutex ─────────────────────────────────────────────────────────────────────

let _running = false;

/** Returns true if the QA Responder process is currently running. */
export function isQaResponderRunning(): boolean {
  return _running;
}

// ── spawnQaResponder ──────────────────────────────────────────────────────────

/**
 * Check ask_queue for pending questions. If found and not already running,
 * spawn claude CLI with the 07-qa-responder prompt (fire-and-forget).
 *
 * @returns SpawnResult describing what happened.
 */
export function spawnQaResponder(db?: Database): SpawnResult {
  // Gate 1: pending questions?
  const resolvedDb = db ?? getDb();
  const pending = getPendingAskQuestions(resolvedDb, 1);
  if (pending.length === 0) {
    return { spawned: false, reason: "no_pending" };
  }

  // Gate 2: already running?
  if (_running) {
    return { spawned: false, reason: "already_running", pending: pending.length };
  }

  // Spawn
  try {
    const agentPrompt = readFileSync(AGENT_FILE, "utf-8");

    _running = true;
    const proc = Bun.spawn([CLAUDE_BIN, "--dangerously-skip-permissions", "--print", "-p", agentPrompt], {
      cwd: PROJECT_ROOT,
      stdout: "ignore",
      stderr: "ignore",
      env: { ...process.env },
    });

    proc.exited
      .then(() => { _running = false; })
      .catch(() => { _running = false; });

    return { spawned: true, reason: "ok", pending: pending.length };
  } catch (err) {
    _running = false;
    return { spawned: false, reason: "error", error: String(err) };
  }
}
