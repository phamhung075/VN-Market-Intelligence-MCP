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
import { getDb, initDatabase } from "../../infrastructure/db/schema.js";
import {
  getSignalEffectiveness,
  type SignalEffectiveness,
} from "../../infrastructure/db/agentSignalStore.js";
import {
  formatAccuracyReport,
  type AccuracyReport,
} from "../../interface/mcp/tools/alerts/alertAccuracy.js";
import { getProjectRoot } from "../../infrastructure/projectRoot.js";

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

/** Per-agent cycle metrics parsed from a session log file. */
export interface AgentCycleSummary {
  /** Total number of cycles found in the log. */
  cycleCount: number;
  /** Number of BLOCKED cycles. */
  blockedCount: number;
  /** Sum of anomaly counts across all cycles. */
  anomalyCount: number;
}

/** Task counts parsed from TASKS.md. */
export interface TaskCounts {
  done: number;
  inProgress: number;
  backlog: number;
}

/**
 * Pre-loaded signal data injected into DashboardAggregateInput.
 * Both fields come from DB queries in the production entry point.
 */
export interface DashboardSignalData {
  /** Rows from getSignalEffectiveness({ days: 7 }) */
  effectiveness: SignalEffectiveness[];
  /** Report from formatAccuracyReport for the last 7 days */
  alertAccuracy: Pick<AccuracyReport, "total" | "hits" | "misses" | "unknowns" | "text" | "summary_by_type" | "scored_pct">;
}

/** Aggregated signal quality metrics written to the signals{} block. */
export interface SignalMetrics {
  /** Hit rate over the last 7 days: hits / (hits + misses). Null when no scored alerts. */
  hit_rate_7d: number | null;
  /** False positive ratio: fp / (confirmed + fp) across all signal groups. Null when no data. */
  false_positive_7d: number | null;
  /** Mean precision across signal groups that have confirmed+fp > 0. Null when no data. */
  cascade_accuracy: number | null;
  /** Total signal count summed across all effectiveness groups. */
  total_signals_7d: number;
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
  /** Per-agent cycle metrics, keyed by agent id. Added by Task 1854b. */
  agents: Record<string, AgentCycleSummary>;
  /** Signal quality metrics block, or null when signal data unavailable. Added by Task 1854c. */
  signals: SignalMetrics | null;
  /**
   * Sum of estimated_tokens values from all cycle blocks across today's session logs.
   * Each cycle entry is written by the session log writer as step_count x 500.
   * Added by Task 1854i.
   */
  daily_token_estimate: number;
}

/** Input bag for aggregateDailyDashboard (all injectable for tests). */
export interface DashboardAggregateInput {
  date: string;
  stats: ProjectStats;
  /** Map of filename → file content for session log files. */
  sessionFiles: Record<string, string>;
  tasksMd: string;
  /** Optional pre-loaded signal data. Omit to skip signals block (signals → null). */
  signalData?: DashboardSignalData;
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

/**
 * Parses a single agent session log file for cycle metrics.
 *
 * Handles two cycle header formats found in production logs:
 *   1. Strict:  `### Cycle (HH:MM–HH:MM)` (developer-style)
 *   2. Loose :  `## Cycle HH:MM UTC` / `## Cycle N: HH:MM UTC` / `## Cycle Bootstrap (...)`
 *
 * Within each cycle block the function looks for:
 *   - STATUS lines to determine blocked vs success
 *   - Anomaly count patterns: "Anomalies: N", "Anomalies Detected: N"
 *
 * @param content - Full text of a session log file
 * @returns AgentCycleSummary
 */
export function parseAgentCycles(content: string): AgentCycleSummary {
  if (!content) return { cycleCount: 0, blockedCount: 0, anomalyCount: 0 };

  // Matches cycle header lines (both strict ### and loose ## forms).
  const cycleHeaderRe = /^#{2,3}\s+Cycle\b/im;

  // Split content into per-cycle blocks by locating all cycle header positions.
  const lines = content.split("\n");
  const cycleStartIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (cycleHeaderRe.test(lines[i]!)) {
      cycleStartIndices.push(i);
    }
  }

  if (cycleStartIndices.length === 0) {
    return { cycleCount: 0, blockedCount: 0, anomalyCount: 0 };
  }

  let blockedCount = 0;
  let anomalyCount = 0;

  for (let ci = 0; ci < cycleStartIndices.length; ci++) {
    const startLine = cycleStartIndices[ci];
    const endLine =
      ci + 1 < cycleStartIndices.length ? cycleStartIndices[ci + 1] : lines.length;

    const block = lines.slice(startLine, endLine).join("\n");

    // Determine blocked status for this cycle block.
    if (
      /STATUS:\*\*\s*BLOCKED/i.test(block) ||
      /STATUS:\s*BLOCKED/i.test(block) ||
      /EXIT\s+CODE:\s*BLOCKED/i.test(block)
    ) {
      blockedCount++;
    }

    // Extract anomaly count: "Anomalies: N", "Anomalies Detected: N", "anomalies: N |"
    const anomalyMatch = block.match(/[Aa]nomal(?:ies|y)(?:\s+[Dd]etected)?:\s*(\d+)/);
    if (anomalyMatch) {
      anomalyCount += parseInt(anomalyMatch[1]!, 10);
    }
  }

  return {
    cycleCount: cycleStartIndices.length,
    blockedCount,
    anomalyCount,
  };
}

/**
 * Sums all `estimated_tokens: N` values found in today's session log files.
 *
 * Each cycle block written by the session log writer includes a line of the form:
 *   `- estimated_tokens: 6000`
 * (step_count x 500, per Task 1854h).
 *
 * Pure function — no I/O.
 *
 * @param files - Map of filename → content (same shape as sessionFiles in DashboardAggregateInput)
 * @param date  - ISO date string "YYYY-MM-DD" — only files prefixed with this date are scanned
 * @returns Total estimated tokens across all matching session log files
 */
export function sumSessionTokens(
  files: Record<string, string>,
  date: string,
): number {
  let total = 0;
  const tokenRe = /estimated_tokens:\s*(\d+)/g;

  for (const [filename, content] of Object.entries(files)) {
    if (!filename.startsWith(date + "-") || !filename.endsWith(".md")) continue;

    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(content)) !== null) {
      total += parseInt(match[1]!, 10);
    }
    // Reset lastIndex for reuse across loop iterations
    tokenRe.lastIndex = 0;
  }

  return total;
}

/**
 * Compute signal quality metrics from pre-loaded effectiveness rows and
 * alert accuracy report.
 *
 * Pure function — no I/O. Designed for injection in tests.
 *
 * Metrics produced:
 *   hit_rate_7d       — alert hit rate: hits / (hits + misses). Null when no scored alerts.
 *   false_positive_7d — FP ratio: total_fp / (total_confirmed + total_fp). Null when no data.
 *   cascade_accuracy  — mean precision across groups with confirmed+fp > 0. Null when no data.
 *   total_signals_7d  — sum of all signal counts across effectiveness groups.
 *
 * @param data - DashboardSignalData with effectiveness rows and alert accuracy report
 * @returns SignalMetrics
 */
export function computeSignalMetrics(data: DashboardSignalData): SignalMetrics {
  const { effectiveness, alertAccuracy } = data;

  // ── hit_rate_7d ─────────────────────────────────────────────────────────────
  const scoreable = alertAccuracy.hits + alertAccuracy.misses;
  const hit_rate_7d =
    scoreable > 0
      ? Math.round((alertAccuracy.hits / scoreable) * 100) / 100
      : null;

  // ── false_positive_7d ───────────────────────────────────────────────────────
  let totalConfirmed = 0;
  let totalFp = 0;
  let totalSignals = 0;

  for (const row of effectiveness) {
    totalConfirmed += row.confirmed;
    totalFp += row.false_positive;
    totalSignals += row.total;
  }

  const fpDenom = totalConfirmed + totalFp;
  const false_positive_7d =
    fpDenom > 0
      ? Math.round((totalFp / fpDenom) * 100) / 100
      : null;

  // ── cascade_accuracy ────────────────────────────────────────────────────────
  // Mean precision across groups that have a non-null precision value.
  const precisionValues = effectiveness
    .filter((r) => r.precision !== null)
    .map((r) => r.precision as number);

  const cascade_accuracy =
    precisionValues.length > 0
      ? Math.round(
          (precisionValues.reduce((sum, p) => sum + p, 0) / precisionValues.length) * 100,
        ) / 100
      : null;

  return {
    hit_rate_7d,
    false_positive_7d,
    cascade_accuracy,
    total_signals_7d: totalSignals,
  };
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
  const { date, stats, sessionFiles, tasksMd, signalData } = input;

  const sessions = parseSessionLogs(sessionFiles, date);
  const tasks = parseTaskCounts(tasksMd);

  const infra = stats.infrastructureStatus;

  // Build agents{} block: parse cycle metrics for each session file matching today.
  const agents: Record<string, AgentCycleSummary> = {};
  for (const [filename, content] of Object.entries(sessionFiles)) {
    if (!filename.startsWith(date + "-") || !filename.endsWith(".md")) continue;
    const agentId = filename.slice(date.length + 1, -".md".length);
    agents[agentId] = parseAgentCycles(content);
  }

  // Build signals{} block when signal data is provided.
  const signals: SignalMetrics | null = signalData
    ? computeSignalMetrics(signalData)
    : null;

  // Sum estimated_tokens from all cycle blocks in today's session logs (Task 1854i).
  const daily_token_estimate = sumSessionTokens(sessionFiles, date);

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
    agents,
    signals,
    daily_token_estimate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// File I/O helpers (production only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads session log files for a given date from the filesystem.
 *
 * @param date - "YYYY-MM-DD"
 * @returns Map of filename → content
 */
function loadSessionFiles(date: string): Record<string, string> {
  const sessionsDir = path.join(getProjectRoot(), "docs/agent-memory/sessions");
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
  const statsPath = path.join(getProjectRoot(), "docs/data/project-stats.json");
  const raw = fs.readFileSync(statsPath, "utf8");
  return JSON.parse(raw) as ProjectStats;
}

/**
 * Loads docs/TASKS.md from the filesystem.
 */
function loadTasksMd(): string {
  const tasksPath = path.join(getProjectRoot(), "docs/TASKS.md");
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
  const outPath = path.join(getProjectRoot(), "docs/data/daily-dashboard.json");
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
 * Loads signal metrics from the live database.
 *
 * Calls getSignalEffectiveness and formatAccuracyReport directly —
 * no MCP round-trip. Returns null on any DB error (non-fatal for the job).
 *
 * @param days - Lookback window in days (default 7)
 * @returns DashboardSignalData or null on failure
 */
async function loadSignalData(days = 7): Promise<DashboardSignalData | null> {
  try {
    await initDatabase();
    const db = getDb();

    const effectiveness = getSignalEffectiveness(db, { days });

    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    type AlertRow = {
      id: string;
      triggered_at: string;
      severity: string;
      signals_json: string | null;
      affected_actions_json: string | null;
      outcome: string | null;
      outcome_at: string | null;
      outcome_detail: string | null;
    };
    const alertRows = db
      .prepare<AlertRow, [string]>(
        `SELECT id, triggered_at, severity, signals_json, affected_actions_json,
                outcome, outcome_at, outcome_detail
         FROM alerts
         WHERE triggered_at >= ?
         ORDER BY triggered_at DESC`,
      )
      .all(since) as AlertRow[];

    const alertAccuracy = formatAccuracyReport(alertRows, days);

    return { effectiveness, alertAccuracy };
  } catch (err) {
    console.warn("[dailyDashboardJob] loadSignalData failed (non-fatal):", err);
    return null;
  }
}

/**
 * Runs the daily dashboard aggregation job.
 *
 * Reads project-stats.json, session logs, TASKS.md, and signal metrics
 * then writes docs/data/daily-dashboard.json.
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
  const signalData = await loadSignalData(7);

  const dashboard = aggregateDailyDashboard({
    date,
    stats,
    sessionFiles,
    tasksMd,
    ...(signalData != null ? { signalData } : {}),
  });

  writeDashboard(dashboard);

  return {
    date,
    sessionCount: dashboard.sessions.length,
    tasksDone: dashboard.tasks.done,
    written: true,
  };
}
