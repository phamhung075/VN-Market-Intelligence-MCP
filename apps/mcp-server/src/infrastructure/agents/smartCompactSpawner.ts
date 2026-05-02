/**
 * smartCompactSpawner — spawn claude CLI to summarize a session JSONL
 * and write the result to a memory file.
 *
 * Uses Claude Max account (CLI) — no API cost.
 *
 * Flow:
 *   1. Read session JSONL from ~/.claude/projects/
 *   2. Spawn claude --print with summarization prompt
 *   3. Capture stdout summary
 *   4. Write to memory file (gets injected into next session)
 *
 * @module infrastructure/agents/smartCompactSpawner
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";

// ── Constants ─────────────────────────────────────────────────────────────────

const CLAUDE_BIN = "/Users/admin/.local/bin/claude";
const CLAUDE_PROJECTS = join(homedir(), ".claude", "projects");
const PROJECT_KEY = "-Users-admin-Documents-Hung---works-----PROJET---labo-VN-Market-Intelligence-MCP";
const MEMORY_DIR = join(homedir(), ".claude", "projects", PROJECT_KEY);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompactResult {
  success: boolean;
  sessionFile?: string;
  memoryFile?: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get the most recently modified session JSONL for this project */
function getLatestSession(): string | null {
  const dir = join(CLAUDE_PROJECTS, PROJECT_KEY);
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? join(dir, files[0].name) : null;
  } catch {
    return null;
  }
}

/** Parse JSONL and extract human/assistant turns only */
function extractTurns(jsonlPath: string): string {
  const lines = readFileSync(jsonlPath, "utf-8").trim().split("\n");
  const turns: string[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "user" && entry.message?.role === "user") {
        const text = entry.message.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(" ")
          .slice(0, 500); // truncate long messages
        if (text) turns.push(`USER: ${text}`);
      }
      if (entry.type === "assistant" && entry.message?.role === "assistant") {
        const text = entry.message.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(" ")
          .slice(0, 500);
        if (text) turns.push(`ASSISTANT: ${text}`);
      }
    } catch {
      // skip malformed lines
    }
  }

  return turns.slice(-60).join("\n"); // last 60 turns max
}

// ── spawnSmartCompact ─────────────────────────────────────────────────────────

/**
 * Summarize the latest session using claude CLI and save to memory file.
 * Fire-and-forget variant also available via spawnSmartCompactAsync.
 */
export async function spawnSmartCompact(sessionPath?: string): Promise<CompactResult> {
  const target = sessionPath ?? getLatestSession();
  if (!target) {
    return { success: false, error: "No session file found" };
  }

  let turns: string;
  try {
    turns = extractTurns(target);
  } catch (err) {
    return { success: false, error: `Failed to read session: ${err}` };
  }

  if (!turns) {
    return { success: false, error: "No turns found in session" };
  }

  const prompt = `You are a session compactor. Summarize the following conversation turns into a concise memory file.

Keep:
- Key decisions made
- Code changes and file paths modified
- Tasks completed and their status
- Important context for future sessions
- Any blockers or open issues

Format as markdown. Be concise. Max 500 words.

CONVERSATION:
${turns}`;

  try {
    const proc = Bun.spawn(
      [CLAUDE_BIN, "--dangerously-skip-permissions", "--print", "-p", prompt],
      {
        cwd: resolve(import.meta.dir, "../../.."),
        stdout: "pipe",
        stderr: "ignore",
        env: { ...process.env },
      }
    );

    await proc.exited;

    const output = await new Response(proc.stdout).text();
    if (!output.trim()) {
      return { success: false, error: "Empty output from claude CLI" };
    }

    // Write to memory file
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
    const memoryFile = join(MEMORY_DIR, `compact_${timestamp}.md`);
    writeFileSync(memoryFile, `---\nname: Session Compact ${timestamp}\ndescription: Auto-compacted session summary\ntype: project\n---\n\n${output.trim()}\n`);

    return { success: true, sessionFile: target, memoryFile };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
