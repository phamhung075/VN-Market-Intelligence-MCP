/**
 * Task 1300a — Agent Memory Metadata Lookup Tools
 *
 * Provides two MCP tools for agents to load only the precise memory files
 * they need for a given task, without loading the full INDEX.md routing table.
 *
 * Tools:
 *   1. get_memory_files(agent_name, task_type)
 *      - Reads docs/agent-memory/manifests/{agent_name}.md
 *      - Parses markdown table to match task_type
 *      - Returns list of files + front-matter metadata
 *
 *   2. search_memory_by_trigger(trigger)
 *      - Scans all .md files in docs/agent-memory/{issues,patterns,modules}
 *      - Filters by front-matter trigger: field
 *      - Returns matching files + metadata
 *
 * @module interface/mcp/tools/system/agentMemoryTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";
import { getProjectRoot } from "../../../../infrastructure/projectRoot.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FrontMatter {
  [key: string]: string[] | undefined;
  agents?: string[];
  trigger?: string[];
}

interface MemoryFile {
  path: string;
  agents?: string[] | undefined;
  trigger?: string[] | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse YAML front-matter from markdown file content.
 * Extracts the content between opening and closing --- markers.
 * Returns Record<string, string[]> mapping field names to values split by comma.
 *
 * Example:
 *   ---
 *   agents: ops, developer
 *   trigger: server-restart, health-check
 *   ---
 *
 * Returns: { agents: ["ops", "developer"], trigger: ["server-restart", "health-check"] }
 */
function parseFrontMatter(raw: string): FrontMatter {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match || !match[1]) return {};

  const result: FrontMatter = {};
  const lines = match[1].split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();

    if (key && value) {
      result[key] = value.split(",").map((s) => s.trim());
    }
  }

  return result;
}

/**
 * Parse markdown table from manifest file.
 * Assumes table format:
 *   | Task Type | Load |
 *   |-----------|------|
 *   | task1, task2 | file1.md, file2.md |
 *
 * Returns: Record<string, string[]> mapping task type to file list
 */
function parseManifestTable(raw: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const lines = raw.split("\n");

  // Skip header and separator lines, process data rows
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.includes("|") || line.trim().startsWith("---")) continue;

    const cells = line.split("|").map((c) => c.trim()).filter((c) => c);
    if (cells.length < 2) continue;

    const taskTypesRaw = cells[0];
    const filesRaw = cells[1];
    if (taskTypesRaw === undefined || filesRaw === undefined) continue;

    const taskTypes = taskTypesRaw.split(",").map((s) => s.trim());
    const files = filesRaw.split(",").map((s) => s.trim());

    // Map each task type to the file list
    for (const taskType of taskTypes) {
      if (taskType) {
        result[taskType] = files;
      }
    }
  }

  return result;
}

/**
 * Recursively scan directory for .md files.
 * Returns absolute paths to all markdown files.
 */
function scanMemoryDirectory(dirPath: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isFile() && entry.endsWith(".md")) {
        files.push(fullPath);
      } else if (stat.isDirectory() && !entry.startsWith(".")) {
        files.push(...scanMemoryDirectory(fullPath));
      }
    }
  } catch {
    // Directory doesn't exist or is inaccessible
  }

  return files;
}

/**
 * Read file and extract front-matter metadata.
 * Returns { path: relativePath, agents, trigger, ... }
 */
function readMemoryFileMetadata(
  absolutePath: string,
  basePath: string
): MemoryFile | null {
  try {
    const content = readFileSync(absolutePath, "utf-8");
    const frontMatter = parseFrontMatter(content);
    const relativePath = absolutePath.replace(basePath + "/", "").replace(/\\/g, "/");

    return {
      path: relativePath,
      agents: frontMatter.agents,
      trigger: frontMatter.trigger,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool Registration
// ─────────────────────────────────────────────────────────────────────────────

const GetMemoryFilesSchema = {
  agent_name: z.string().describe("Agent identifier (e.g. ops, developer, qa)"),
  task_type: z.string().describe("Task type to match (e.g. server-restart, writing-code)"),
};

const SearchMemoryByTriggerSchema = {
  trigger: z.string().describe("Trigger tag to search for (e.g. server-restart, signal-validation)"),
};

export function registerAgentMemoryTools(server: McpServer): void {
  const memoryDir = resolve(getProjectRoot(), "docs/agent-memory");

  // ─────────────────────────────────────────────────────────────────────────
  // Tool 1: get_memory_files
  // ─────────────────────────────────────────────────────────────────────────

  server.tool(
    "get_memory_files",
    "Get memory files to load for a given agent + task type. Reads agent-specific manifest.",
    GetMemoryFilesSchema,
    async (args) => {
      const { agent_name, task_type } = args;
      try {
        const manifestPath = resolve(memoryDir, "manifests", `${agent_name}.md`);
        const manifestContent = readFileSync(manifestPath, "utf-8");
        const taskMap = parseManifestTable(manifestContent);

        // Find matching task type (exact match or partial match in comma-separated list)
        let matchingFiles: string[] = [];
        for (const [key, files] of Object.entries(taskMap)) {
          const tasks = key.split(",").map((t) => t.trim());
          if (tasks.includes(task_type)) {
            matchingFiles = files;
            break;
          }
        }

        if (matchingFiles.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No files mapped for agent="${agent_name}" task_type="${task_type}"`,
              },
            ],
          };
        }

        // Read front-matter from each file
        const results: MemoryFile[] = [];
        for (const file of matchingFiles) {
          const filePath = resolve(memoryDir, file);
          const metadata = readMemoryFileMetadata(filePath, memoryDir);
          if (metadata) {
            results.push(metadata);
          }
        }

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Found task mapping but could not read files for agent="${agent_name}" task_type="${task_type}"`,
              },
            ],
          };
        }

        const text = results
          .map((f) => {
            let line = `${f.path}`;
            if (f.agents) line += ` [agents: ${f.agents.join(", ")}]`;
            if (f.trigger) line += ` [trigger: ${f.trigger.join(", ")}]`;
            return line;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} file(s) for ${agent_name}/${task_type}:\n${text}`,
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Unable to load manifest for agent="${agent_name}": ${message}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Tool 2: search_memory_by_trigger
  // ─────────────────────────────────────────────────────────────────────────

  server.tool(
    "search_memory_by_trigger",
    "Search memory files by trigger tag. Scans all memory files and filters by front-matter trigger field.",
    SearchMemoryByTriggerSchema,
    async (args) => {
      const { trigger } = args;
      try {
        // Scan subdirectories: issues/, patterns/, modules/ (not sessions — too dynamic)
        const scanDirs = ["issues", "patterns", "modules"];
        const allFiles: MemoryFile[] = [];

        for (const subdir of scanDirs) {
          const subdirPath = resolve(memoryDir, subdir);
          const filePaths = scanMemoryDirectory(subdirPath);

          for (const filePath of filePaths) {
            const metadata = readMemoryFileMetadata(filePath, memoryDir);
            if (
              metadata &&
              metadata.trigger &&
              metadata.trigger.includes(trigger)
            ) {
              allFiles.push(metadata);
            }
          }
        }

        if (allFiles.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No files found with trigger="${trigger}"`,
              },
            ],
          };
        }

        const text = allFiles
          .map((f) => {
            let line = `${f.path}`;
            if (f.agents) line += ` [agents: ${f.agents.join(", ")}]`;
            if (f.trigger) line += ` [trigger: ${f.trigger.join(", ")}]`;
            return line;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${allFiles.length} file(s) with trigger="${trigger}":\n${text}`,
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching memory files: ${message}`,
            },
          ],
        };
      }
    }
  );
}
