/**
 * Daily Dashboard Aggregation Job — Task 1854a (Interface / Scheduler Layer)
 *
 * Aggregates daily operational data into docs/data/daily-dashboard.json:
 *   - Session logs from docs/agent-memory/sessions/YYYY-MM-DD-*.md
 *   - Task counts from docs/TASKS.md
 *   - System metrics from docs/data/project-stats.json
 *
 * Cron: daily 23:30 GMT+7 (after evening summary and periodic summary).
 *
 * DDD Layer: interface/scheduler — no domain/ imports.
 *
 * @module scheduler/system/dailyDashboardJob
 */

import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal shape read from docs/data/project-stats.json */
export interface ProjectStats {
  lastUpdated: string;
  currentSprint: number;
  totalTasksDone: number;
  toolCount: number;
  schedulerFileCount: number;
  testBaseline: number;
  testBaselinePass: number;
  testBaselineFail: number;
  infrastructureStatus?: {
    mcpServerHealth: string;
    lastUpdated: string;
    connectionStatus: string;
  };
}

/** Status of a single agent session on a given date. */
export interface SessionLogEntry {
  agent: string;
  /** "success" | "blocked" | "unknown" */
  status: "success" | "blocked" | "unknown";
}

/** Task counts parsed from TASKS.md. */
export interface TaskCounts {
  done: number;
  inProgress: number;
  backlog: number;
}

/** Full daily dashboard output written to daily-dashboard.json. */
export interface DailyDashboard {
  date: string;
  sprint: number;
  generatedAt: string;
  tasks: TaskCounts;
  system: {
    toolCount: number;
    schedulerFileCount: number;
    testPass: number;
    testFail: number;
    totalTasksDone: number;
    mcpServerHealth: string;
    infrastructureLastUpdated: string;
  };
  sessions: SessionLogEntry[];
}

/** Input bag for aggregateDailyDashboard (all injectable for tests). */
export interface DashboardAggregateInput {
  date: string;
  stats: ProjectStats;
  /** Map of filename → file content for session log files. */
  sessionFiles: Record<string, string>;
  tasksMd: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses session log files for a given date.
 *
 * @param files  - Map of filename to content
 * @param date   - ISO date string "YYYY-MM-DD" to filter on
 * @returns Array of SessionLogEntry, one per matching file
 */
export function parseSessionLogs(
  files: Record<string, string>,
  date: string,
): SessionLogEntry[] {
  const entries: SessionLogEntry[] = [];

  for (const [filename, content] of Object.entries(files)) {
    // File must be named YYYY-MM-DD-<agent>.md and match the requested date
    if (!filename.startsWith(date + "-") || !filename.endsWith(".md")) {
      continue;
    }

    // Extract agent id: strip date prefix and .md suffix
    const agent = filename.slice(date.length + 1, -".md".length);

    // Determine status from content keywords
    const upper = content.toUpperCase();
    let status: SessionLogEntry["status"] = "unknown";
    if (upper.includes("STATUS:** SUCCESS") || upper.includes("STATUS: SUCCESS")) {
      status = "success";
    } else if (
      upper.includes("STATUS:** BLOCKED") ||
      upper.includes("STATUS: BLOCKED") ||
      upper.includes("STATUS:** ❌ BLOCKED")
    ) {
      status = "blocked";
    }

    entries.push({ agent, status });
  }

  return entries;
}

/**
 * Parses task counts from TASKS.md markdown content.
 *
 * Counts lines matching:
 *   - `- [x] ...`  → done
 *   - `- [ ] ...`  → open (inProgress if under "## In Progress", else backlog)
 *
 * Simple heuristic: tracks current section header to classify open items.
 *
 * @param content - Full text of TASKS.md
 * @returns TaskCounts
 */
export function parseTaskCounts(content: string): TaskCounts {
  let done = 0;
  let inProgress = 0;
  let backlog = 0;
  let currentSection = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Track section headers
    if (trimmed.startsWith("##")) {
      currentSection = trimmed.toLowerCase();
      continue;
    }

    // Checked item → done
    if (/^-\s+\[x\]/i.test(trimmed)) {
      done++;
      continue;
    }

    // Unchecked item → classify by section
    if (/^-\s+\[\s\]/.test(trimmed)) {
      if (currentSection.includes("in progress")) {
        inProgress++;
      } else {
        backlog++;
      }
    }
  }

  return { done, inProgress, backlog };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core aggregation (pure, injectable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregates all inputs into a DailyDashboard object.
 *
 * No I/O — callers pass pre-loaded data. Makes unit testing trivial.
 *
 * @param input - DashboardAggregateInput
 * @returns DailyDashboard
 */
export function aggregateDailyDashboard(input: DashboardAggregateInput): DailyDashboard {
  const { date, stats, sessionFiles, tasksMd } = input;

  const sessions = parseSessionLogs(sessionFiles, date);
  const tasks = parseTaskCounts(tasksMd);

  const infra = stats.infrastructureStatus;

  return {
    date,
    sprint: stats.currentSprint,
    generatedAt: new Date().toISOString(),
    tasks,
    system: {
      toolCount: stats.toolCount,
      schedulerFileCount: stats.schedulerFileCount,
      testPass: stats.testBaselinePass,
      testFail: stats.testBaselineFail,
      totalTasksDone: stats.totalTasksDone,
      mcpServerHealth: infra?.mcpServerHealth ?? "UNKNOWN",
      infrastructureLastUpdated: infra?.lastUpdated ?? "",
    },
    sessions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// File I/O helpers (production only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the project root relative to this file's location.
 * apps/mcp-server/src/scheduler/system/ → ../../../../.. → project root
 */
function projectRoot(): string {
  return path.resolve(import.meta.dir, "../../../../../..");
}

/**
 * Loads session log files for a given date from the filesystem.
 *
 * @param date - "YYYY-MM-DD"
 * @returns Map of filename → content
 */
function loadSessionFiles(date: string): Record<string, string> {
  const sessionsDir = path.join(projectRoot(), "docs/agent-memory/sessions");
  const result: Record<string, string> = {};

  let entries: string[];
  try {
    entries = fs.readdirSync(sessionsDir);
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (entry.startsWith(date + "-") && entry.endsWith(".md")) {
      try {
        result[entry] = fs.readFileSync(path.join(sessionsDir, entry), "utf8");
      } catch {
        // skip unreadable files
      }
    }
  }

  return result;
}

/**
 * Loads docs/data/project-stats.json from the filesystem.
 */
function loadProjectStats(): ProjectStats {
  const statsPath = path.join(projectRoot(), "docs/data/project-stats.json");
  const raw = fs.readFileSync(statsPath, "utf8");
  return JSON.parse(raw) as ProjectStats;
}

/**
 * Loads docs/TASKS.md from the filesystem.
 */
function loadTasksMd(): string {
  const tasksPath = path.join(projectRoot(), "docs/TASKS.md");
  try {
    return fs.readFileSync(tasksPath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Writes the dashboard JSON to docs/data/daily-dashboard.json.
 *
 * @param dashboard - DailyDashboard to write
 */
function writeDashboard(dashboard: DailyDashboard): void {
  const outPath = path.join(projectRoot(), "docs/data/daily-dashboard.json");
  fs.writeFileSync(outPath, JSON.stringify(dashboard, null, 2) + "\n", "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point (production)
// ─────────────────────────────────────────────────────────────────────────────

/** Result returned by runDailyDashboardJob for logging / job-run tracking. */
export interface DailyDashboardJobResult {
  date: string;
  sessionCount: number;
  tasksDone: number;
  written: boolean;
}

/**
 * Runs the daily dashboard aggregation job.
 *
 * Reads project-stats.json, session logs, and TASKS.md then writes
 * docs/data/daily-dashboard.json.
 *
 * @param dateOverride - Optional ISO date override (defaults to today in GMT+7)
 * @returns DailyDashboardJobResult
 */
export async function runDailyDashboardJob(
  dateOverride?: string,
): Promise<DailyDashboardJobResult> {
  // Determine today's date in GMT+7 (VN time)
  const date =
    dateOverride ??
    new Date(Date.now() + 7 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

  const stats = loadProjectStats();
  const sessionFiles = loadSessionFiles(date);
  const tasksMd = loadTasksMd();

  const dashboard = aggregateDailyDashboard({ date, stats, sessionFiles, tasksMd });

  writeDashboard(dashboard);

  return {
    date,
    sessionCount: dashboard.sessions.length,
    tasksDone: dashboard.tasks.done,
    written: true,
  };
}
