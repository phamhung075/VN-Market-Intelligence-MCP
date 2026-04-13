/**
 * Infrastructure — Structured Logger (Two-Tier)
 *
 * Tier 1: Global log (data/logs/global.log) — one-line summaries for quick AI scan
 * Tier 2: Per-tool logs (data/logs/tool-{name}.log) — detailed context for debugging
 *
 * Both tiers also persist warn/error to SQLite system_logs table for MCP tool queries.
 * Console output (JSON) is kept for real-time monitoring.
 */

import { mkdirSync, appendFile, existsSync, statSync, renameSync, unlinkSync, appendFileSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import type { LogLevel } from "./config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LogSink = (line: string) => void;

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** Extended logger with tool-specific logging */
export interface ToolLogger extends Logger {
  /** Log to tool-specific file with full detail */
  toolDebug(tool: string, message: string, context?: Record<string, unknown>): void;
  toolInfo(tool: string, message: string, context?: Record<string, unknown>): void;
  toolWarn(tool: string, message: string, context?: Record<string, unknown>): void;
  toolError(tool: string, message: string, context?: Record<string, unknown>): void;
}

/** Options for the rotating file sink. */
export interface RotatingSinkOptions {
  /** Maximum file size in megabytes before rotation is triggered. Default: 5. */
  maxFileSizeMb?: number;
  /** How often (ms) to check the file size. Default: 60_000. Pass 0 to disable. */
  checkIntervalMs?: number;
}

/** A LogSink with a manual rotation check for tests. */
export interface RotatingFileSink extends LogSink {
  __checkRotation(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Rotation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synchronous rolling rotation: app.3.log deleted, 2→3, 1→2, app.log→1.
 * Does nothing if logFilePath does not exist.
 */
export function rotateLogs(logFilePath: string): void {
  if (!existsSync(logFilePath)) return;

  const dir = dirname(logFilePath);
  const base = basename(logFilePath, ".log");
  const slot = (n: number): string => join(dir, `${base}.${n}.log`);

  if (existsSync(slot(3))) unlinkSync(slot(3));
  if (existsSync(slot(2))) renameSync(slot(2), slot(3));
  if (existsSync(slot(1))) renameSync(slot(1), slot(2));
  renameSync(logFilePath, slot(1));
}

/**
 * Creates a LogSink that appends to a file and rotates when it exceeds maxFileSizeMb.
 * Rotation check runs every checkIntervalMs (default 60s). Timer is unref-ed.
 */
export function createRotatingFileSink(
  logFilePath: string,
  opts: RotatingSinkOptions = {},
): RotatingFileSink {
  const maxBytes = (opts.maxFileSizeMb ?? 5) * 1024 * 1024;
  const intervalMs = opts.checkIntervalMs ?? 60_000;

  const dir = dirname(logFilePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  function checkRotation(): void {
    if (!existsSync(logFilePath)) return;
    try {
      const { size } = statSync(logFilePath);
      if (size > maxBytes) {
        rotateLogs(logFilePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      }
    } catch { /* never crash on rotation */ }
  }

  if (intervalMs > 0) {
    const timer = setInterval(checkRotation, intervalMs);
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as NodeJS.Timeout).unref();
    }
  }

  const sink = function rotatingFileSink(line: string): void {
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      appendFileSync(logFilePath, line + "\n", { encoding: "utf8" });
    } catch {
      process.stderr.write(`[logger] failed to write to ${logFilePath}\n`);
    }
  } as RotatingFileSink;

  sink.__checkRotation = checkRotation;
  return sink;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_DIR = resolve(process.cwd(), "data", "logs");
const GLOBAL_LOG = resolve(LOG_DIR, "global.log");

/** Vietnam time offset (UTC+7) */
const VN_OFFSET_MS = 7 * 3600_000;

// ─────────────────────────────────────────────────────────────────────────────
// File helpers
// ─────────────────────────────────────────────────────────────────────────────

let _logDirReady = false;

function ensureLogDir(): void {
  if (_logDirReady) return;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    _logDirReady = true;
  } catch {
    // Ignore — may be read-only in test environments
  }
}

function vnTimestamp(now?: Date): string {
  const d = now ?? new Date();
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  return vn.toISOString().replace("T", " ").slice(0, 19);
}

function appendToFile(filePath: string, line: string): void {
  try {
    ensureLogDir();
    // Async fire-and-forget — never blocks the event loop
    appendFile(filePath, line + "\n", "utf-8", () => {});
  } catch {
    // Never crash on log write failure
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Global log format (Tier 1) — one-line for AI quick scan
// Format: [2026-03-29 14:30:05] [ERROR] [ssc] SSC portal fetch failed — timeout after 30s
// ─────────────────────────────────────────────────────────────────────────────

function formatGlobalLine(level: LogLevel, source: string, message: string, errorSummary?: string): string {
  const ts = vnTimestamp();
  const lvl = level.toUpperCase().padEnd(5);
  const src = source.padEnd(20);
  const errPart = errorSummary ? ` — ${errorSummary}` : "";
  return `[${ts}] [${lvl}] [${src}] ${message}${errPart}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool log format (Tier 2) — detailed JSON for AI debugging
// File: data/logs/tool-{name}.log
// ─────────────────────────────────────────────────────────────────────────────

function getToolLogPath(toolName: string): string {
  const safe = toolName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return resolve(LOG_DIR, `tool-${safe}.log`);
}

function formatToolLine(level: LogLevel, tool: string, message: string, context?: Record<string, unknown>): string {
  const entry = {
    t: vnTimestamp(),
    level,
    tool,
    msg: message,
    ...context,
  };
  return JSON.stringify(entry);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract source from message (e.g. "[ssc] fetch failed" → "ssc")
// ─────────────────────────────────────────────────────────────────────────────

function extractSource(message: string): string {
  const match = message.match(/^\[([^\]]+)\]/);
  return match ? match[1]! : "system";
}

function extractErrorSummary(context?: Record<string, unknown>): string | undefined {
  if (!context) return undefined;
  const err = context["error"];
  if (typeof err === "string") return err.slice(0, 100);
  if (err instanceof Error) return err.message.slice(0, 100);
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main logger factory
// ─────────────────────────────────────────────────────────────────────────────

export function createLogger(
  minLevel: LogLevel = "info",
  sink: LogSink = (line) => console.log(line),
): ToolLogger {
  function write(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;

    // Console output (JSON, existing behavior)
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    try {
      sink(JSON.stringify(entry));
    } catch {
      // Ignore sink errors
    }

    // Test isolation: when DB_PATH is ':memory:' we are in a unit test.
    // Skip all shared-file and shared-DB sinks so test fixtures never leak
    // into the production error log / system_logs table.
    const isTestMode = Bun.env["DB_PATH"] === ":memory:";

    // Tier 1: Global log (one-liner) — always for warn/error, info for key events
    if (!isTestMode && (LEVEL_WEIGHT[level] >= LEVEL_WEIGHT["warn"] || LEVEL_WEIGHT[level] >= LEVEL_WEIGHT["info"])) {
      const source = extractSource(message);
      const errSummary = extractErrorSummary(context);
      appendToFile(GLOBAL_LOG, formatGlobalLine(level, source, message, errSummary));
    }

    // Tier 2: Auto-detect tool from source tag and write to tool log
    if (!isTestMode && LEVEL_WEIGHT[level] >= LEVEL_WEIGHT["info"]) {
      const source = extractSource(message);
      if (source !== "system") {
        const toolPath = getToolLogPath(source);
        appendToFile(toolPath, formatToolLine(level, source, message, context));
      }
    }

    // Persist warn/error to SQLite (async, fire-and-forget)
    if (!isTestMode && LEVEL_WEIGHT[level] >= LEVEL_WEIGHT["warn"]) {
      const source = extractSource(message);
      persistLog(level, source, message, context).catch(() => {});
    }
  }

  function toolWrite(
    level: LogLevel,
    tool: string,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const isTestMode = Bun.env["DB_PATH"] === ":memory:";

    // Always write to tool-specific log regardless of minLevel (skipped in tests)
    if (!isTestMode) {
      const toolPath = getToolLogPath(tool);
      appendToFile(toolPath, formatToolLine(level, tool, message, context));
    }

    // Also write to global log if warn/error
    if (!isTestMode && LEVEL_WEIGHT[level] >= LEVEL_WEIGHT["warn"]) {
      const errSummary = extractErrorSummary(context);
      appendToFile(GLOBAL_LOG, formatGlobalLine(level, tool, message, errSummary));
      persistLog(level, tool, message, context).catch(() => {});
    }

    // Console output for debug visibility
    if (LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[minLevel]) {
      const entry: LogEntry = { timestamp: new Date().toISOString(), level, message: `[${tool}] ${message}`, ...context };
      try { sink(JSON.stringify(entry)); } catch { /* ignore */ }
    }
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
    toolDebug: (tool, message, context) => toolWrite("debug", tool, message, context),
    toolInfo: (tool, message, context) => toolWrite("info", tool, message, context),
    toolWarn: (tool, message, context) => toolWrite("warn", tool, message, context),
    toolError: (tool, message, context) => toolWrite("error", tool, message, context),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default logger instance
// ─────────────────────────────────────────────────────────────────────────────

import { loadConfig } from "./config.js";

const _cfg = loadConfig();

export const logger: ToolLogger = createLogger(_cfg.logLevel);

// ─────────────────────────────────────────────────────────────────────────────
// Persistent log helper (SQLite)
// ─────────────────────────────────────────────────────────────────────────────

export async function persistLog(
  level: LogLevel,
  source: string,
  message: string,
  details?: Record<string, unknown>,
  db?: import("bun:sqlite").Database,
): Promise<void> {
  try {
    const { getDb } = await import("./db/schema.js");
    const database = db ?? getDb();
    const detailsJson = details !== undefined ? JSON.stringify(details) : null;
    database.run(
      `INSERT INTO system_logs (level, source, message, details_json) VALUES (?, ?, ?, ?)`,
      [level, source, message, detailsJson],
    );
  } catch {
    // Never throw from a log helper
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool: read logs for AI debugging
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from "node:fs";

/**
 * Read the last N lines from the global log — for AI quick scan.
 */
export function readGlobalLog(lines: number = 50): string {
  try {
    const content = readFileSync(GLOBAL_LOG, "utf-8");
    const allLines = content.trim().split("\n");
    return allLines.slice(-lines).join("\n");
  } catch {
    return "(no global log available)";
  }
}

/**
 * Read the last N lines from a tool-specific log — for AI deep debugging.
 */
export function readToolLog(toolName: string, lines: number = 100): string {
  try {
    const filePath = getToolLogPath(toolName);
    const content = readFileSync(filePath, "utf-8");
    const allLines = content.trim().split("\n");
    return allLines.slice(-lines).join("\n");
  } catch {
    return `(no log available for tool: ${toolName})`;
  }
}

/**
 * List all available tool log files.
 */
export function listToolLogs(): string[] {
  try {
    return readdirSync(LOG_DIR)
      .filter(f => f.startsWith("tool-") && f.endsWith(".log"))
      .map(f => f.replace("tool-", "").replace(".log", ""));
  } catch {
    return [];
  }
}

/**
 * Get error summary from global log — only WARN and ERROR lines.
 */
export function getErrorSummary(lines: number = 30): string {
  try {
    const content = readFileSync(GLOBAL_LOG, "utf-8");
    const allLines = content.trim().split("\n");
    const errors = allLines.filter(l => l.includes("[WARN ]") || l.includes("[ERROR]"));
    return errors.slice(-lines).join("\n") || "(no warnings or errors)";
  } catch {
    return "(no global log available)";
  }
}
