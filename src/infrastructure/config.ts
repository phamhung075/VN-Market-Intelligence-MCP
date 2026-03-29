/**
 * Infrastructure — Unified Config Loader
 *
 * Loads configuration from `mcp.config.json` at project root,
 * with environment variable overrides for secrets and deployment.
 *
 * Priority: env var > mcp.config.json > built-in default
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ServerConfig {
  port: number;
  host: string;
  name: string;
  version: string;
  logLevel: LogLevel;
}

export interface DataConfig {
  dbPath: string;
  lancedbPath: string;
  briefingsDir: string;
  reportsDir: string;
}

export interface EmbeddingConfig {
  model: string;
  cacheDir: string;
  dimensions: number;
  maxTextLength: number;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  parseMode: string;
  enabled: boolean;
}

export interface MarketConfig {
  timezone: string;
  utcOffset: number;
  openTime: string;
  closeTime: string;
  tradingDays: number[];
  watchlist: string[];
}

export interface SchedulerConfig {
  intelligenceCycle: string;
  morningBriefing: string;
  marketOpen: string;
  marketClose: string;
  sscCheck: string;
  eveningSummary: string;
}

export interface AlertConfig {
  defaultDropPct: number;
  defaultRisePct: number;
  defaultImpactScoreMin: number;
  volumeSpikeMultiplier: number;
  reportFreshHours: number;
  severityEscalation: {
    signalsForHigh: number;
    signalsForCritical: number;
  };
  telegramOnSeverity: string[];
  telegramOnNewDocument: boolean;
  telegramMinCascadeConfidence: number;
}

export interface SscFetcherConfig {
  url: string;
  chromePath: string;
  pageTimeoutMs: number;
  selectorTimeoutMs: number;
  inputDelayMs: number;
  resultsWaitMs: number;
  downloadWaitMs: number;
  headless: boolean;
}

export interface FetchersConfig {
  httpTimeoutMs: number;
  ssc: SscFetcherConfig;
  hose: { apiBase: string; maxPageSize: number; avgVolumeWindow: number };
  hnx: { apiBase: string };
  rss: { cafef: string; vnexpress: string; reuters: string; apNews: string };
  tradingEconomics: { baseUrl: string; indicatorsPath: string };
  yahooFinance: { baseUrl: string; symbols: { brentCrude: string; gold: string; usdVnd: string } };
  sbv: { baseUrl: string; ratesPath: string; fxPath: string };
}

export interface CycleConfig {
  warnThresholdMinutes: number;
  offHoursIntervalMinutes: number;
  maxConcurrent: number;
}

export interface FetchLimitProfile {
  newsPerSource: number;
  totalNews: number;
}

export interface FetchLimitsConfig {
  marketHours: FetchLimitProfile;
  prePostMarket: FetchLimitProfile;
  offHours: FetchLimitProfile;
  manual: FetchLimitProfile;
}

export interface McpConfig {
  server: ServerConfig;
  data: DataConfig;
  embedding: EmbeddingConfig;
  telegram: TelegramConfig;
  market: MarketConfig;
  scheduler: SchedulerConfig;
  alerts: AlertConfig;
  fetchers: FetchersConfig;
  cycle: CycleConfig;
  fetchLimits: FetchLimitsConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy AppConfig (backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export interface AppConfig {
  port: number;
  dbPath: string;
  logLevel: LogLevel;
  telegramBotToken: string;
  telegramChatId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class AppConfigError extends Error {
  constructor(varName: string) {
    super(`[AppConfigError] Required environment variable "${varName}" is not set.`);
    this.name = "AppConfigError";
  }
}

export function requireEnv(varName: string): string {
  const value = Bun.env[varName];
  if (value === undefined || value === "") throw new AppConfigError(varName);
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config file loader
// ─────────────────────────────────────────────────────────────────────────────

function loadConfigFile(): Record<string, unknown> {
  const configPath = Bun.env["MCP_CONFIG_PATH"] ?? resolve(process.cwd(), "mcp.config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Config file is optional — fall back to defaults
    return {};
  }
}

function get(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function str(file: Record<string, unknown>, path: string, envKey: string | null, fallback: string): string {
  if (envKey) {
    const envVal = Bun.env[envKey];
    if (envVal !== undefined && envVal !== "") return envVal;
  }
  const fileVal = get(file, path);
  if (typeof fileVal === "string") return fileVal;
  return fallback;
}

function num(file: Record<string, unknown>, path: string, envKey: string | null, fallback: number): number {
  if (envKey) {
    const envVal = Bun.env[envKey];
    if (envVal !== undefined && envVal !== "") {
      const parsed = Number(envVal);
      if (!isNaN(parsed)) return parsed;
    }
  }
  const fileVal = get(file, path);
  if (typeof fileVal === "number") return fileVal;
  return fallback;
}

function bool(file: Record<string, unknown>, path: string, envKey: string | null, fallback: boolean): boolean {
  if (envKey) {
    const envVal = Bun.env[envKey];
    if (envVal === "true" || envVal === "1") return true;
    if (envVal === "false" || envVal === "0") return false;
  }
  const fileVal = get(file, path);
  if (typeof fileVal === "boolean") return fileVal;
  return fallback;
}

function strArr(file: Record<string, unknown>, path: string, envKey: string | null, fallback: string[]): string[] {
  if (envKey) {
    const envVal = Bun.env[envKey];
    if (envVal !== undefined && envVal !== "") return envVal.split(",").map(s => s.trim());
  }
  const fileVal = get(file, path);
  if (Array.isArray(fileVal)) return fileVal.filter((v): v is string => typeof v === "string");
  return fallback;
}

function numArr(file: Record<string, unknown>, path: string, fallback: number[]): number[] {
  const fileVal = get(file, path);
  if (Array.isArray(fileVal)) return fileVal.filter((v): v is number => typeof v === "number");
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loader
// ─────────────────────────────────────────────────────────────────────────────

export function loadMcpConfig(): McpConfig {
  const f = loadConfigFile();

  const validLevels: LogLevel[] = ["debug", "info", "warn", "error"];
  const rawLevel = str(f, "server.logLevel", "LOG_LEVEL", "info");
  const logLevel: LogLevel = (validLevels as string[]).includes(rawLevel) ? (rawLevel as LogLevel) : "info";

  return {
    server: {
      port: num(f, "server.port", "PORT", 3000),
      host: str(f, "server.host", "HOST", "127.0.0.1"),
      name: str(f, "server.name", null, "vn-market-intelligence"),
      version: str(f, "server.version", null, "1.0.0"),
      logLevel,
    },
    data: {
      dbPath: str(f, "data.dbPath", "DB_PATH", "./data/market.db"),
      lancedbPath: str(f, "data.lancedbPath", "LANCEDB_PATH", "./data/lancedb"),
      briefingsDir: str(f, "data.briefingsDir", null, "./data/briefings"),
      reportsDir: str(f, "data.reportsDir", "REPORTS_DIR", "./data/reports"),
    },
    embedding: {
      model: str(f, "embedding.model", "EMBEDDING_MODEL", "Xenova/paraphrase-multilingual-MiniLM-L12-v2"),
      cacheDir: str(f, "embedding.cacheDir", "EMBEDDING_CACHE_DIR", "./data/models"),
      dimensions: num(f, "embedding.dimensions", null, 384),
      maxTextLength: num(f, "embedding.maxTextLength", null, 2000),
    },
    telegram: {
      botToken: str(f, "telegram.botToken", "TELEGRAM_BOT_TOKEN", ""),
      chatId: str(f, "telegram.chatId", "TELEGRAM_CHAT_ID", ""),
      parseMode: str(f, "telegram.parseMode", null, "Markdown"),
      enabled: bool(f, "telegram.enabled", "TELEGRAM_ENABLED", false),
    },
    market: {
      timezone: str(f, "market.timezone", null, "Asia/Ho_Chi_Minh"),
      utcOffset: num(f, "market.utcOffset", null, 7),
      openTime: str(f, "market.openTime", "MARKET_OPEN_TIME", "09:00"),
      closeTime: str(f, "market.closeTime", "MARKET_CLOSE_TIME", "15:30"),
      tradingDays: numArr(f, "market.tradingDays", [1, 2, 3, 4, 5]),
      watchlist: strArr(f, "market.watchlist", "WATCHLIST", ["VNM", "FPT", "VCB", "VEA"]),
    },
    scheduler: {
      intelligenceCycle: str(f, "scheduler.intelligenceCycle", "CRON_INTELLIGENCE_CYCLE", "*/15 * * * *"),
      morningBriefing: str(f, "scheduler.morningBriefing", "CRON_MORNING_BRIEFING", "0 8 * * 1-5"),
      marketOpen: str(f, "scheduler.marketOpen", "CRON_MARKET_OPEN", "0 9 * * 1-5"),
      marketClose: str(f, "scheduler.marketClose", "CRON_MARKET_CLOSE", "30 15 * * 1-5"),
      sscCheck: str(f, "scheduler.sscCheck", "CRON_SSC_CHECK", "0 20 * * *"),
      eveningSummary: str(f, "scheduler.eveningSummary", "CRON_EVENING_SUMMARY", "0 22 * * 1-5"),
    },
    alerts: {
      defaultDropPct: num(f, "alerts.defaultDropPct", "DEFAULT_ALERT_DROP_PCT", -3),
      defaultRisePct: num(f, "alerts.defaultRisePct", "DEFAULT_ALERT_RISE_PCT", 5),
      defaultImpactScoreMin: num(f, "alerts.defaultImpactScoreMin", "DEFAULT_IMPACT_SCORE_MIN", 7),
      volumeSpikeMultiplier: num(f, "alerts.volumeSpikeMultiplier", null, 2),
      reportFreshHours: num(f, "alerts.reportFreshHours", null, 24),
      severityEscalation: {
        signalsForHigh: num(f, "alerts.severityEscalation.signalsForHigh", null, 2),
        signalsForCritical: num(f, "alerts.severityEscalation.signalsForCritical", null, 3),
      },
      telegramOnSeverity: strArr(f, "alerts.telegramOnSeverity", null, ["high", "critical"]),
      telegramOnNewDocument: bool(f, "alerts.telegramOnNewDocument", null, true),
      telegramMinCascadeConfidence: num(f, "alerts.telegramMinCascadeConfidence", null, 0.7),
    },
    fetchers: {
      httpTimeoutMs: num(f, "fetchers.httpTimeoutMs", "HTTP_TIMEOUT_MS", 15000),
      ssc: {
        url: str(f, "fetchers.ssc.url", null, "https://congbothongtin.ssc.gov.vn/faces/NewsSearch"),
        chromePath: str(f, "fetchers.ssc.chromePath", "CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        pageTimeoutMs: num(f, "fetchers.ssc.pageTimeoutMs", null, 30000),
        selectorTimeoutMs: num(f, "fetchers.ssc.selectorTimeoutMs", null, 15000),
        inputDelayMs: num(f, "fetchers.ssc.inputDelayMs", null, 80),
        resultsWaitMs: num(f, "fetchers.ssc.resultsWaitMs", null, 5000),
        downloadWaitMs: num(f, "fetchers.ssc.downloadWaitMs", null, 5000),
        headless: bool(f, "fetchers.ssc.headless", null, true),
      },
      hose: {
        apiBase: str(f, "fetchers.hose.apiBase", null, "https://finfo-api.vndirect.com.vn/v4"),
        maxPageSize: num(f, "fetchers.hose.maxPageSize", null, 100),
        avgVolumeWindow: num(f, "fetchers.hose.avgVolumeWindow", null, 20),
      },
      hnx: {
        apiBase: str(f, "fetchers.hnx.apiBase", null, "https://api.hnx.vn/api/snapshot"),
      },
      rss: {
        cafef: str(f, "fetchers.rss.cafef", null, "https://cafef.vn/rss/trang-chu.rss"),
        vnexpress: str(f, "fetchers.rss.vnexpress", null, "https://vnexpress.net/rss/kinh-doanh.rss"),
        reuters: str(f, "fetchers.rss.reuters", null, "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best"),
        apNews: str(f, "fetchers.rss.apNews", null, "https://rsshub.app/apnews/topics/business"),
      },
      tradingEconomics: {
        baseUrl: str(f, "fetchers.tradingEconomics.baseUrl", "TRADING_ECONOMICS_BASE_URL", "https://tradingeconomics.com"),
        indicatorsPath: str(f, "fetchers.tradingEconomics.indicatorsPath", null, "/vietnam/indicators"),
      },
      yahooFinance: {
        baseUrl: str(f, "fetchers.yahooFinance.baseUrl", "YAHOO_FINANCE_BASE_URL", "https://finance.yahoo.com"),
        symbols: {
          brentCrude: str(f, "fetchers.yahooFinance.symbols.brentCrude", null, "BZ=F"),
          gold: str(f, "fetchers.yahooFinance.symbols.gold", null, "GC=F"),
          usdVnd: str(f, "fetchers.yahooFinance.symbols.usdVnd", null, "USDVND=X"),
        },
      },
      sbv: {
        baseUrl: str(f, "fetchers.sbv.baseUrl", "SBV_BASE_URL", "https://www.sbv.gov.vn"),
        ratesPath: str(f, "fetchers.sbv.ratesPath", null, "/en/home/rm/ir"),
        fxPath: str(f, "fetchers.sbv.fxPath", null, "/en/home/rm/ex"),
      },
    },
    cycle: {
      warnThresholdMinutes: num(f, "cycle.warnThresholdMinutes", null, 12),
      offHoursIntervalMinutes: num(f, "cycle.offHoursIntervalMinutes", null, 60),
      maxConcurrent: num(f, "cycle.maxConcurrent", null, 1),
    },
    fetchLimits: {
      marketHours: {
        newsPerSource: num(f, "fetchLimits.marketHours.newsPerSource", null, 5),
        totalNews: num(f, "fetchLimits.marketHours.totalNews", null, 15),
      },
      prePostMarket: {
        newsPerSource: num(f, "fetchLimits.prePostMarket.newsPerSource", null, 10),
        totalNews: num(f, "fetchLimits.prePostMarket.totalNews", null, 30),
      },
      offHours: {
        newsPerSource: num(f, "fetchLimits.offHours.newsPerSource", null, 15),
        totalNews: num(f, "fetchLimits.offHours.totalNews", null, 40),
      },
      manual: {
        newsPerSource: num(f, "fetchLimits.manual.newsPerSource", null, 20),
        totalNews: num(f, "fetchLimits.manual.totalNews", null, 50),
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton + backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

/** Full MCP configuration (singleton). */
export const mcpConfig: McpConfig = loadMcpConfig();

/**
 * Returns the appropriate fetch limits based on current Vietnam time.
 * - Market hours (09:00-15:30 weekdays): small batches (5/source, 15 total)
 * - Pre/post market (07:00-09:00, 15:30-22:00): medium (10/source, 30 total)
 * - Off hours / weekends: larger batches (15/source, 40 total)
 */
export function getCurrentFetchLimits(now?: Date): FetchLimitProfile {
  const cfg = loadMcpConfig();
  const d = now ?? new Date();
  const utcH = d.getUTCHours();
  const utcM = d.getUTCMinutes();
  const vnMinutes = (utcH + cfg.market.utcOffset) * 60 + utcM;
  // Normalize to 0-1440 range
  const mins = ((vnMinutes % 1440) + 1440) % 1440;
  const dayOfWeek = d.getUTCDay();
  // Adjust for timezone (if VN time crosses midnight)
  const vnDay = vnMinutes >= 1440 ? (dayOfWeek + 1) % 7 : vnMinutes < 0 ? (dayOfWeek + 6) % 7 : dayOfWeek;
  const isWeekday = cfg.market.tradingDays.includes(vnDay);

  if (!isWeekday) return cfg.fetchLimits.offHours;

  const [openH, openM] = cfg.market.openTime.split(":").map(Number) as [number, number];
  const [closeH, closeM] = cfg.market.closeTime.split(":").map(Number) as [number, number];
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;

  if (mins >= openMins && mins < closeMins) return cfg.fetchLimits.marketHours;
  if (mins >= openMins - 120 && mins < openMins) return cfg.fetchLimits.prePostMarket; // 2h before open
  if (mins >= closeMins && mins < closeMins + 390) return cfg.fetchLimits.prePostMarket; // until 22:00
  return cfg.fetchLimits.offHours;
}

/** Legacy AppConfig — re-reads env vars each call for test compatibility. */
export function loadConfig(): AppConfig {
  const fresh = loadMcpConfig();
  return {
    port: fresh.server.port,
    dbPath: fresh.data.dbPath,
    logLevel: fresh.server.logLevel,
    telegramBotToken: fresh.telegram.botToken,
    telegramChatId: fresh.telegram.chatId,
  };
}

/** Legacy singleton. */
export const config: AppConfig = loadConfig();
