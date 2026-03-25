/**
 * Infrastructure — Env Config
 *
 * Provides a typed configuration object loaded from Bun.env.
 * All optional vars have sensible defaults.
 * Required vars (via requireEnv) throw AppConfigError if missing.
 */

/** Supported log levels in ascending severity order. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Typed application configuration. */
export interface AppConfig {
  /** HTTP server port. Default: 3000. */
  port: number;
  /** Path to the SQLite database file. Default: './data/market.db'. */
  dbPath: string;
  /** Minimum log level to emit. Default: 'info'. */
  logLevel: LogLevel;
}

/**
 * Error thrown at startup when a required environment variable is absent.
 */
export class AppConfigError extends Error {
  constructor(varName: string) {
    super(
      `[AppConfigError] Required environment variable "${varName}" is not set.`,
    );
    this.name = "AppConfigError";
  }
}

/**
 * Returns the value of a required environment variable.
 * Throws AppConfigError if the variable is missing or empty.
 *
 * @param varName - The name of the environment variable.
 * @returns The string value of the variable.
 * @throws {AppConfigError} when the variable is absent.
 */
export function requireEnv(varName: string): string {
  const value = Bun.env[varName];
  if (value === undefined || value === "") {
    throw new AppConfigError(varName);
  }
  return value;
}

/**
 * Reads and validates the application configuration from Bun.env.
 * Optional variables fall back to documented defaults.
 *
 * @returns Typed AppConfig object.
 */
export function loadConfig(): AppConfig {
  const rawPort = Bun.env["PORT"];
  const port = rawPort !== undefined ? parseInt(rawPort, 10) : 3000;

  const dbPath = Bun.env["DB_PATH"] ?? "./data/market.db";

  const rawLevel = Bun.env["LOG_LEVEL"];
  const validLevels: LogLevel[] = ["debug", "info", "warn", "error"];
  const logLevel: LogLevel =
    rawLevel !== undefined && (validLevels as string[]).includes(rawLevel)
      ? (rawLevel as LogLevel)
      : "info";

  return { port, dbPath, logLevel };
}

/** Singleton config instance — loaded once at module import time. */
export const config: AppConfig = loadConfig();
