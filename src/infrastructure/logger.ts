/**
 * Infrastructure — Structured Logger
 *
 * Emits newline-delimited JSON log entries to stdout (or a custom sink).
 * Each entry always contains: timestamp (ISO 8601), level, message.
 * Extra context fields are merged into the top-level JSON object.
 *
 * Log level hierarchy (ascending severity):
 *   debug < info < warn < error
 *
 * A message is emitted only when its level >= the configured minimum level.
 */

import type { LogLevel } from "./config.js";

/** A function that receives a formatted log line (before the newline). */
export type LogSink = (line: string) => void;

/** Shape of a single structured log entry. */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

/** Logger interface exposing one method per log level. */
export interface Logger {
  /** Log at debug level with optional context. */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Log at info level with optional context. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Log at warn level with optional context. */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Log at error level with optional context. */
  error(message: string, context?: Record<string, unknown>): void;
}

/** Numeric weight for each log level — higher = more severe. */
const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Creates a structured JSON logger.
 *
 * @param minLevel - Minimum level to emit. Messages below this are silently dropped.
 * @param sink     - Optional output function. Defaults to console.log (stdout).
 * @returns Logger instance.
 */
export function createLogger(
  minLevel: LogLevel = "info",
  sink: LogSink = (line) => console.log(line),
): Logger {
  /**
   * Internal write function — builds the JSON entry and passes it to the sink.
   */
  function write(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    try {
      sink(JSON.stringify(entry));
    } catch (err) {
      // Fallback: write to stderr so a broken sink never crashes the process.
      console.error(
        "[logger] sink threw an error:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
  };
}

/**
 * Default application logger.
 * Reads LOG_LEVEL from Bun.env at import time; falls back to 'info'.
 */
import { loadConfig } from "./config.js";

const _cfg = loadConfig();

/** Pre-built application-wide logger instance. */
export const logger: Logger = createLogger(_cfg.logLevel);
