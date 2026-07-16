/**
 * Task 1300b — Agent Memory Update Tools
 *
 * Provides MCP tools for agents to safely UPDATE memory files without using Write tool.
 * Two tools:
 *   1. append_session_record(agent_name, task_info)
 *      - Creates or appends to sessions/YYYY-MM-DD-{agent_name}.md
 *      - Validates agent name, formats as markdown
 *      - Returns file path written + confirmation
 *
 *   2. update_memory_file(record_type, action, data)
 *      - Creates or updates issues/BUGNAME.md, patterns/PATTERNNAME.md, modules/MODULENAME.md
 *      - Validates front-matter (agents, trigger fields)
 *      - Returns file path written + confirmation
 *
 * @module interface/mcp/tools/system/agentMemoryUpdateTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { getProjectRoot } from "../../../../infrastructure/projectRoot.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────

const VALID_AGENTS = [
  "developer",
  "qa",
  "ops",
  "architect",
  "ba",
  "po",
  "system-auditor",
  "news-scout",
  "financial-analyst",
  "market-watcher",
  "alert-commander",
  "digest-predict",
  "qa-responder",
  "unified-agent",
];

const RECORD_TYPES = ["issue", "pattern", "module"] as const satisfies readonly string[];
const ACTIONS = ["create", "append", "update"] as const;

interface SessionRecord {
  task_name: string;
  finding?: string | undefined;
  fix?: string | undefined;
  status?: string | undefined;
  duration?: string | undefined; // HH:MM–HH:MM format
}

interface MemoryFileUpdate {
  title: string;
  content: string;
  agents?: string[];
  trigger?: string[];
  status?: string;
  severity?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get today's date in YYYY-MM-DD format.
 */
function getTodayDateStr(): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  return dateStr || "";
}

/**
 * Format a session record as markdown.
 * Example output:
 * ```
 * ### Task: Task 1300a: Memory Tools (14:30–15:45 UTC)
 * - **Finding**: Agents need MCP tool to update memory
 * - **Fix**: Created append_session_record tool
 * - **Status**: Ready for QA
 * - **Updated memory**: docs/agent-memory/patterns/signal-validation.md
 * ```
 */
function formatSessionRecord(record: SessionRecord): string {
  let lines: string[] = [];

  const taskLine = record.duration
    ? `### Task: ${record.task_name} (${record.duration})`
    : `### Task: ${record.task_name}`;
  lines.push(taskLine);

  if (record.finding) {
    lines.push(`- **Finding**: ${record.finding}`);
  }
  if (record.fix) {
    lines.push(`- **Fix**: ${record.fix}`);
  }
  if (record.status) {
    lines.push(`- **Status**: ${record.status}`);
  }

  return lines.join("\n");
}

/**
 * Build front-matter YAML string.
 */
function buildFrontMatter(agents?: string[], trigger?: string[]): string {
  let lines: string[] = ["---"];

  if (agents && agents.length > 0) {
    lines.push(`agents: ${agents.join(", ")}`);
  }
  if (trigger && trigger.length > 0) {
    lines.push(`trigger: ${trigger.join(", ")}`);
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Validate input strings to prevent directory traversal.
 * Checks if input contains directory traversal attempts.
 */
function hasPathTraversalAttempt(input: string): boolean {
  return input.includes("..") || input.includes("/") || input.includes("\\");
}

/**
 * Sanitize filename: remove special chars, convert spaces to hyphens.
 */
function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool Registration
// ─────────────────────────────────────────────────────────────────────────────

const AppendSessionRecordSchema = {
  agent_name: z
    .enum(VALID_AGENTS as [string, ...string[]])
    .describe("Agent identifier (e.g. developer, news-scout, ops)"),
  task_name: z
    .string()
    .min(1)
    .describe("Task identifier and name (e.g. 'Task 1300a: Memory Tools')"),
  finding: z.string().optional().describe("What was discovered or learned"),
  fix: z.string().optional().describe("What was implemented or fixed"),
  status: z.string().optional().describe("Current status (Ready for QA, etc.)"),
  duration: z
    .string()
    .optional()
    .describe("Time spent (HH:MM–HH:MM UTC format)"),
};

const UpdateMemoryFileSchema = {
  record_type: z
    .enum(["issue", "pattern", "module"] as [string, ...string[]])
    .describe("Type of memory file: issue, pattern, or module"),
  action: z
    .enum(["create", "append", "update"] as [string, ...string[]])
    .describe("Action: create (new file), append (add to file), or update (replace content)"),
  filename: z.string().min(1).describe("Filename without .md extension"),
  title: z.string().min(1).describe("Heading/title for the content"),
  content: z.string().min(1).describe("Markdown content to write or append"),
  agents: z
    .array(z.string())
    .optional()
    .describe("List of agents who use this file (for front-matter)"),
  trigger: z
    .array(z.string())
    .optional()
    .describe("List of trigger tags (for front-matter)"),
};

export function registerAgentMemoryUpdateTools(server: McpServer): void {
  // Registration-time resolution (NOT module-level): allows test callers to
  // sandbox writes by setting AGENT_MEMORY_ROOT in beforeEach BEFORE calling
  // this function. A module-level `const` would bind the env value at ESM
  // import time — before any beforeEach hook runs — making the sandbox a
  // silent no-op (false-green: tests pass, real docs/agent-memory/ still
  // gets written). Unset in production, so prod behavior is unchanged.
  const memoryDir = process.env.AGENT_MEMORY_ROOT ?? resolve(getProjectRoot(), "docs/agent-memory");

  // ─────────────────────────────────────────────────────────────────────────
  // Tool 1: append_session_record
  // ─────────────────────────────────────────────────────────────────────────

  server.tool(
    "append_session_record",
    "Append a work session record to agent's session file (creates if missing). Agent must provide task_name; other fields (finding, fix, status, duration) are optional.",
    AppendSessionRecordSchema,
    async (args) => {
      try {
        const { agent_name, task_name, finding, fix, status, duration } = args as {
          agent_name: string;
          task_name: string;
          finding?: string;
          fix?: string;
          status?: string;
          duration?: string;
        };

        // Check for path traversal attempts in task_name
        if (hasPathTraversalAttempt(task_name)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Invalid task_name (possible directory traversal attempt)`,
              },
            ],
          };
        }

        // Build session filename
        const today = getTodayDateStr();
        const sessionFilePath = resolve(
          memoryDir,
          "sessions",
          `${today}-${agent_name}.md`
        );

        // Format the session record
        const record: SessionRecord = {
          task_name,
          ...(finding !== undefined && { finding }),
          ...(fix !== undefined && { fix }),
          ...(status !== undefined && { status }),
          ...(duration !== undefined && { duration }),
        };
        const recordMarkdown = formatSessionRecord(record);

        // Read existing content or create new
        let fileContent = "";
        if (existsSync(sessionFilePath)) {
          fileContent = readFileSync(sessionFilePath, "utf-8");
          // Deduplication: skip if this exact task_name heading already exists (report #SEC-2026-04-23)
          const taskHeading = `### Task: ${task_name}`;
          const taskHeadingAlt = `### Task ${task_name}`;
          if (fileContent.includes(taskHeading) || fileContent.includes(taskHeadingAlt)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Skipped: task_name '${task_name}' already recorded in ${today}-${agent_name}.md`,
                },
              ],
            };
          }
          // Append with newline separator
          fileContent += "\n\n" + recordMarkdown;
        } else {
          fileContent = recordMarkdown;
        }

        // Ensure parent directory exists before writing
        mkdirSync(dirname(sessionFilePath), { recursive: true });

        // Write to file
        writeFileSync(sessionFilePath, fileContent, "utf-8");

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Session record appended to ${today}-${agent_name}.md\nPath: sessions/${today}-${agent_name}.md\nTask: ${task_name}`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to append session record: ${message}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Tool 2: update_memory_file
  // ─────────────────────────────────────────────────────────────────────────

  server.tool(
    "update_memory_file",
    "Create or update an issue, pattern, or module memory file with YAML front-matter (agents, trigger tags).",
    UpdateMemoryFileSchema,
    async (args) => {
      try {
        const {
          record_type,
          action,
          filename,
          title,
          content,
          agents,
          trigger,
        } = args as {
          record_type: "issue" | "pattern" | "module";
          action: "create" | "append" | "update";
          filename: string;
          title: string;
          content: string;
          agents?: string[];
          trigger?: string[];
        };

        // Check for path traversal attempts in filename
        if (hasPathTraversalAttempt(filename)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Invalid filename (possible directory traversal attempt)`,
              },
            ],
          };
        }

        // Sanitize filename and pluralize record type
        const safeFilename = sanitizeFileName(filename);
        const pluralRecordType = record_type === "issue" ? "issues" : record_type === "pattern" ? "patterns" : "modules";
        const filePath = resolve(memoryDir, pluralRecordType, `${safeFilename}.md`);

        let fileContent = "";

        if (action === "create") {
          // Build new file with front-matter
          const frontMatter = buildFrontMatter(agents, trigger);
          fileContent = `${frontMatter}\n\n# ${title}\n\n${content}`;
        } else if (action === "update") {
          // Replace entire file (keep front-matter if exists)
          let existingFrontMatter = "";
          if (existsSync(filePath)) {
            const existing = readFileSync(filePath, "utf-8");
            const match = existing.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
              existingFrontMatter = `---\n${match[1]}\n---`;
            }
          }

          if (!existingFrontMatter) {
            existingFrontMatter = buildFrontMatter(agents, trigger);
          }

          fileContent = `${existingFrontMatter}\n\n# ${title}\n\n${content}`;
        } else if (action === "append") {
          // Append to existing file
          if (existsSync(filePath)) {
            fileContent = readFileSync(filePath, "utf-8");
            fileContent += "\n\n" + content;
          } else {
            // If file doesn't exist and action is append, treat as create
            const frontMatter = buildFrontMatter(agents, trigger);
            fileContent = `${frontMatter}\n\n# ${title}\n\n${content}`;
          }
        }

        // Ensure parent directory exists before writing
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, fileContent, "utf-8");

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Memory file ${action}d: ${pluralRecordType}/${safeFilename}.md\nPath: docs/agent-memory/${pluralRecordType}/${safeFilename}.md`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to update memory file: ${message}`,
            },
          ],
        };
      }
    }
  );
}
