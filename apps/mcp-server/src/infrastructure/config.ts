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
  /** TELEGRAM_INFO_MARKET_GROUP_ID — user-facing market alerts/briefings. */
  marketGroupId: string;
  /** TELEGRAM_INFO_WORK_CHANNEL_ID — dev/analysis status, refresh asks. */
  workChannelId: string;
  /** TELEGRAM_REPORT_BUG_CHANNEL_ID — analysis → dev bug reports. */
  bugChannelId: string;
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

/** Flat prediction markets configuration block (TECH-020, Section 5). */
export interface PredictionMarketsConfig {
  /** Whether prediction market polling is active. Default: true */
  enabled: boolean;
  /** How often (in minutes) to poll prediction markets. Default: 30 */
  pollingIntervalMinutes: number;
  /** Polymarket CLOB REST API base URL. Default: https://clob-api.polymarket.com */
  clobApiUrl: string;
  /** Polymarket Gamma Markets API base URL. Default: https://gamma-api.polymarket.com */
  gammaApiUrl: string;
  /** Minimum absolute probability shift (%) to trigger a signal. Default: 5 */
  probabilityShiftPct: number;
  /** USD volume threshold above which a market is flagged as a volume spike. Default: 50000 */
  volumeSpikeThresholdUsd: number;
  /** Minimum distinct wallet count to raise signal severity. Default: 10 */
  minUniqueWallets: number;
  /** USD trade size considered a whale trade. Default: 10000 */
  whaleTradeThresholdUsd: number;
  /** Maximum markets to fetch per poll cycle. Default: 50 */
  maxMarketsPerPoll: number;
  /** Delay (ms) between CLOB and Gamma API calls to respect rate limits. Default: 500 */
  rateLimitDelayMs: number;
  /** Keywords used to filter relevant prediction markets. */
  relevantKeywords: string[];
  /** Explicitly curated market IDs to always include regardless of keyword match. */
  curatedMarketIds: string[];
  /**
   * Hours after which prediction_markets.fetched_at is considered stale.
   * If MAX(fetched_at) is older than this, signal detection is skipped and
   * a Telegram bug alert is sent (once per 24h). Default: 24.
   */
  staleThresholdHours: number;
}

export interface NewsMentionConfig {
  /** Max article age in minutes before it's considered stale (default: 240) */
  maxAgeMinutes: number;
  /** Require non-neutral sentiment to create a news_mention signal (default: true) */
  requireNonNeutralSentiment: boolean;
  /** Minimum sentiment confidence for cascade-only impacts (default: 0.5) */
  minSentimentConfidence: number;
  /** Minimum cascade confidence for non-direct-mention impacts (default: 0.7) */
  minCascadeConfidence: number;
  /** Sources considered trustworthy for Vietnamese stock news (default: cafef, vnexpress, vneconomy) */
  highTrustSources: string[];
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
  newsMention: NewsMentionConfig;
  telegramOnSeverity: string[];
  telegramOnNewDocument: boolean;
  telegramMinCascadeConfidence: number;
  /** Minimum impactScore for market-wide cascade broadcast (Task 162). Default: 6. */
  marketWideCascadeMinImpact?: number;
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
  rss: { cafef: string; vnexpress: string };
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

export interface AlertPolicyPositionDangerConfig {
  /** Minimum single-session price drop (%) required for the danger gate. Default: 5 */
  singleDayDropPct: number;
  /** News sentiment must be at or below this value (inclusive). Default: -0.5 */
  newsSentimentBelow: number;
  /** Whether all conditions are required simultaneously (always true). Default: true */
  requireAllConditions: boolean;
}

export interface AlertPolicyWatchlistOpportunityConfig {
  /** Minimum Kinh Dich confidence percentage. Default: 70 */
  kinhDichConfidenceMin: number;
  /** Kinh Dich signal must equal this value. Default: "BUY" */
  kinhDichSignalMustBe: string;
  /** News sentiment must be at or above this value (inclusive). Default: 0.3 */
  newsSentimentMin: number;
  /** Agent signals majority must equal this value. Default: "BUY" */
  agentSignalsMajority: string;
}

/**
 * Feature flags for toggling infrastructure behaviour without code changes.
 * Sprint 056 — Task 1111: BCTC fallback hardening.
 */
export interface FeaturesConfig {
  /**
   * When true, skip the SSC portal entirely in listSscDocuments and go directly
   * to HOSE/HNX/UPCOM fallbacks.  Default: true (SSC returns JS-only shell).
   * Set to false to re-enable SSC polling once the portal is fixed.
   */
  disableSscPolling: boolean;
  /**
   * Task 1281-fix: When false, the local MCP server will NOT attempt to download
   * BCTC PDFs directly from Vietnamese exchange portals (SSC/HOSE/HNX/UPCOM).
   * Default: false — VPS-only architecture. The Vinahost VPS (vn-bctc-fetch.service)
   * is the sole source of BCTC PDFs; the local server receives them via push endpoint.
   *
   * Set to true ONLY on the VPS itself (where geo-block does not apply).
   * Override via env var: ENABLE_LOCAL_BCTC_FETCH=true
   */
  enableLocalBctcFetch: boolean;
}

/** Alert policy thresholds for the two narrowed alert types (Sprint 054). */
export interface AlertPolicyConfig {
  positionDanger: AlertPolicyPositionDangerConfig;
  watchlistOpportunity: AlertPolicyWatchlistOpportunityConfig;
  /** Cooldown between repeated alerts for the same ticker (minutes). Default: 0 (no cooldown). */
  alertCooldownMinutes: number;
}

/**
 * Alert quality / deduplication settings (mcp.config.json `alertQuality` block).
 * Controls step-E cooldown in the intelligence cycle.
 */
export interface AlertQualityConfig {
  /** Minutes to suppress same stock+signal combo. Default: 30. */
  cooldownMinutes: number;
  /** Maximum alerts per stock per calendar day. Default: 3. */
  maxAlertsPerStockPerDay: number;
  /** Window (minutes) for exact-duplicate detection. Default: 60. */
  dedupWindowMinutes: number;
  /** Window (minutes) to group related alerts before sending. Default: 15. */
  groupWindowMinutes: number;
  /** Severity levels that are never suppressed. Default: ["critical"]. */
  neverSuppressSeverity: string[];
  /**
   * Cooldown (minutes) specifically for macro_deviation / macro_high_volatility alerts.
   * SBV FX and commodity rates are persistent conditions — a 6h window prevents
   * the same macro signal from firing every 15-min cycle. Task 1276.
   * Default: 360 (6 hours).
   */
  macroCooldownMinutes: number;
}

/**
 * DFR-P1-MCP / FR-4: Per-doc_type temporal-decay half-life map.
 * Values are in days and are read at runtime from mcp.config.json.
 * Keys: "news" | "macro" | "filing" | "analysis"
 */
export interface RagDecayHalfLifeDaysConfig {
  news: number;
  macro: number;
  filing: number;
  analysis: number;
}

/** RAG retrieval configuration (rag block in mcp.config.json). */
export interface RagConfig {
  temporalDecay: {
    enabled: boolean;
    halfLifeDays: number;
    maxBoost: number;
  };
  /** Per-doc_type temporal-decay half-life in days. DFR-P1-MCP FR-4. */
  decayHalfLifeDays: RagDecayHalfLifeDaysConfig;
  maxDistance: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DFR-P2-MCP: Deep-fetch pipeline configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepFetchConfig {
  /** Max deep-fetch queue rows processed per VPS executor cycle (default 10) */
  maxPerCycle: number;
  /** Max Playwright rows processed per main-server executor cycle (default 5) */
  maxPlaywrightPerCycle: number;
  /** Hours after which a queued row is considered stale and expired (default 4) */
  staleExpiryHours: number;
  /** Per-domain daily fetch cap map — e.g. {"cafef.vn": 50} */
  domainDailyCap: Record<string, number>;
  /** Domains allowed for Playwright executor — loaded from config, never hardcoded */
  playwrightAllowedDomains?: string[];
}

export interface McpConfig {
  server: ServerConfig;
  data: DataConfig;
  embedding: EmbeddingConfig;
  telegram: TelegramConfig;
  market: MarketConfig;
  alerts: AlertConfig;
  fetchers: FetchersConfig;
  cycle: CycleConfig;
  fetchLimits: FetchLimitsConfig;
  /** Prediction market intelligence configuration. */
  predictionMarkets: PredictionMarketsConfig;
  /** Narrowed alert policy thresholds for Sprint 054 position-danger + watchlist-opportunity. */
  alertPolicy: AlertPolicyConfig;
  /** Alert quality / deduplication settings — step-E cooldown (Task 1281). */
  alertQuality: AlertQualityConfig;
  /** Feature flags for toggling infrastructure behaviour. Sprint 056. */
  features: FeaturesConfig;
  /** RAG retrieval configuration. DFR-P1-MCP FR-4. */
  rag: RagConfig;
  /** Deep-fetch pipeline configuration. DFR-P2-MCP. */
  deepFetch?: DeepFetchConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy AppConfig (backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export interface AppConfig {
  host: string;
  port: number;
  dbPath: string;
  logLevel: LogLevel;
  telegramBotToken: string;
  /** TELEGRAM_INFO_MARKET_GROUP_ID — user-facing market alerts/briefings. */
  telegramMarketGroupId: string;
  /** TELEGRAM_INFO_WORK_CHANNEL_ID — dev/analysis status, refresh asks. */
  telegramWorkChannelId: string;
  /** TELEGRAM_REPORT_BUG_CHANNEL_ID — analysis → dev bug reports. */
  telegramBugChannelId: string;
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

/**
 * Returns boolean from a raw object by key, with env-var override support.
 * Accepts: true (boolean), "true", "1" (string) as truthy.
 */
function boolVal(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = obj[key];
  if (v === true || v === "true" || v === "1") return true;
  if (v === false || v === "false" || v === "0") return false;
  return fallback;
}

/**
 * Returns string[] from a raw object by key, falling back to provided default.
 */
function arrVal(obj: Record<string, unknown>, key: string, fallback: string[]): string[] {
  const v = obj[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return fallback;
}

/**
 * Returns number from a raw object by key, falling back to provided default.
 */
function numVal(obj: Record<string, unknown>, key: string, fallback: number): number {
  const v = obj[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

/** Default keyword list for prediction market relevance filtering. */
const DEFAULT_PREDICTION_KEYWORDS: string[] = [
  "fed", "china", "oil", "tariff", "asean", "vietnam",
  "interest rate", "war", "sanctions", "trade", "inflation", "currency",
];

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
      marketGroupId: str(f, "telegram.marketGroupId", "TELEGRAM_INFO_MARKET_GROUP_ID", ""),
      workChannelId: str(f, "telegram.workChannelId", "TELEGRAM_INFO_WORK_CHANNEL_ID", ""),
      bugChannelId: str(f, "telegram.bugChannelId", "TELEGRAM_REPORT_BUG_CHANNEL_ID", ""),
      parseMode: str(f, "telegram.parseMode", null, "Markdown"),
      enabled: bool(f, "telegram.enabled", "TELEGRAM_ENABLED", false),
    },
    market: {
      timezone: str(f, "market.timezone", null, "Asia/Ho_Chi_Minh"),
      utcOffset: num(f, "market.utcOffset", null, 7),
      openTime: str(f, "market.openTime", "MARKET_OPEN_TIME", "09:00"),
      closeTime: str(f, "market.closeTime", "MARKET_CLOSE_TIME", "15:30"),
      tradingDays: numArr(f, "market.tradingDays", [1, 2, 3, 4, 5]),
      watchlist: strArr(f, "market.watchlist", "WATCHLIST", [
        "VCB", "BID", "SHB", "EIB",
        "VHM", "VIC", "KBC", "HUT", "DIG", "DXG", "KDH", "PDR", "NVL", "VRE",
        "HPG",
        "MSN", "FRT", "KDC",
        "SAB",
        "FPT",
        "VNM", "VEA", "DPM",
        "SSI", "VIX", "VND", "VCI",
        "DGC",
        "VJC",
        "GEX",
        "BSR",
      ]),
    },
    alerts: {
      defaultDropPct: num(f, "alerts.defaultDropPct", "DEFAULT_ALERT_DROP_PCT", -3),
      defaultRisePct: num(f, "alerts.defaultRisePct", "DEFAULT_ALERT_RISE_PCT", 5),
      // Task 1328j — threshold raised 7→7.5 after 1328k PO review (2026-04-25).
      // PO chose 7.5 (not 8) to retain FPT/VIC/HPG signals. Gate: PO must re-approve before raising further.
      defaultImpactScoreMin: num(f, "alerts.defaultImpactScoreMin", "DEFAULT_IMPACT_SCORE_MIN", 7.5),
      volumeSpikeMultiplier: num(f, "alerts.volumeSpikeMultiplier", null, 2),
      reportFreshHours: num(f, "alerts.reportFreshHours", null, 24),
      severityEscalation: {
        signalsForHigh: num(f, "alerts.severityEscalation.signalsForHigh", null, 2),
        signalsForCritical: num(f, "alerts.severityEscalation.signalsForCritical", null, 3),
      },
      newsMention: {
        maxAgeMinutes: num(f, "alerts.newsMention.maxAgeMinutes", null, 240),
        requireNonNeutralSentiment: bool(f, "alerts.newsMention.requireNonNeutralSentiment", null, true),
        minSentimentConfidence: num(f, "alerts.newsMention.minSentimentConfidence", null, 0.5),
        minCascadeConfidence: num(f, "alerts.newsMention.minCascadeConfidence", null, 0.85),
        highTrustSources: strArr(f, "alerts.newsMention.highTrustSources", null, ["cafef", "vnexpress", "vneconomy"]),
      },
      telegramOnSeverity: strArr(f, "alerts.telegramOnSeverity", null, ["high", "critical"]),
      telegramOnNewDocument: bool(f, "alerts.telegramOnNewDocument", null, true),
      telegramMinCascadeConfidence: num(f, "alerts.telegramMinCascadeConfidence", null, 0.85),
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
    predictionMarkets: (() => {
      const pm = (get(f, "predictionMarkets") ?? {}) as Record<string, unknown>;
      const envEnabled = Bun.env["PREDICTION_MARKETS_ENABLED"];
      const enabled =
        envEnabled === "true" || envEnabled === "1" ? true
        : envEnabled === "false" || envEnabled === "0" ? false
        : boolVal(pm, "enabled", true);
      return {
        enabled,
        pollingIntervalMinutes: numVal(pm, "pollingIntervalMinutes", 30),
        clobApiUrl: (typeof pm["clobApiUrl"] === "string" && pm["clobApiUrl"]) ? pm["clobApiUrl"] : (Bun.env["POLYMARKET_CLOB_API_URL"] ?? "https://clob.polymarket.com"),
        gammaApiUrl: (typeof pm["gammaApiUrl"] === "string" && pm["gammaApiUrl"]) ? pm["gammaApiUrl"] : (Bun.env["POLYMARKET_GAMMA_API_URL"] ?? "https://gamma-api.polymarket.com"),
        probabilityShiftPct: numVal(pm, "probabilityShiftPct", 5),
        volumeSpikeThresholdUsd: numVal(pm, "volumeSpikeThresholdUsd", 50000),
        minUniqueWallets: numVal(pm, "minUniqueWallets", 10),
        whaleTradeThresholdUsd: numVal(pm, "whaleTradeThresholdUsd", 10000),
        maxMarketsPerPoll: numVal(pm, "maxMarketsPerPoll", 50),
        rateLimitDelayMs: numVal(pm, "rateLimitDelayMs", 500),
        relevantKeywords: arrVal(pm, "relevantKeywords", DEFAULT_PREDICTION_KEYWORDS),
        curatedMarketIds: arrVal(pm, "curatedMarketIds", []),
        staleThresholdHours: numVal(pm, "staleThresholdHours", 24),
      };
    })(),
    alertPolicy: (() => {
      const ap = (get(f, "alertPolicy") ?? {}) as Record<string, unknown>;
      const pd = (ap["positionDanger"] ?? {}) as Record<string, unknown>;
      const wo = (ap["watchlistOpportunity"] ?? {}) as Record<string, unknown>;
      return {
        positionDanger: {
          singleDayDropPct: numVal(pd, "singleDayDropPct", 5),
          newsSentimentBelow: numVal(pd, "newsSentimentBelow", -0.5),
          requireAllConditions: boolVal(pd, "requireAllConditions", true),
        },
        watchlistOpportunity: {
          kinhDichConfidenceMin: numVal(wo, "kinhDichConfidenceMin", 70),
          kinhDichSignalMustBe: typeof wo["kinhDichSignalMustBe"] === "string" ? wo["kinhDichSignalMustBe"] : "BUY",
          newsSentimentMin: numVal(wo, "newsSentimentMin", 0.3),
          agentSignalsMajority: typeof wo["agentSignalsMajority"] === "string" ? wo["agentSignalsMajority"] : "BUY",
        },
        alertCooldownMinutes: numVal(ap, "alertCooldownMinutes", 0),
      } satisfies AlertPolicyConfig;
    })(),
    alertQuality: (() => {
      const aq = (get(f, "alertQuality") ?? {}) as Record<string, unknown>;
      return {
        cooldownMinutes: numVal(aq, "cooldownMinutes", 30),
        maxAlertsPerStockPerDay: numVal(aq, "maxAlertsPerStockPerDay", 3),
        dedupWindowMinutes: numVal(aq, "dedupWindowMinutes", 60),
        groupWindowMinutes: numVal(aq, "groupWindowMinutes", 15),
        neverSuppressSeverity: arrVal(aq, "neverSuppressSeverity", ["critical"]),
        macroCooldownMinutes: numVal(aq, "macroCooldownMinutes", 360),
      } satisfies AlertQualityConfig;
    })(),
    features: (() => {
      const ft = (get(f, "features") ?? {}) as Record<string, unknown>;
      // ENABLE_LOCAL_BCTC_FETCH env var override (task 1281-fix)
      const envLocalBctc = Bun.env["ENABLE_LOCAL_BCTC_FETCH"];
      const enableLocalBctcFetch =
        envLocalBctc === "true" || envLocalBctc === "1" ? true
        : envLocalBctc === "false" || envLocalBctc === "0" ? false
        : boolVal(ft, "enableLocalBctcFetch", false);
      return {
        disableSscPolling: boolVal(ft, "disableSscPolling", true),
        enableLocalBctcFetch,
      } satisfies FeaturesConfig;
    })(),
    // DFR-P1-MCP / FR-4: RAG per-doc_type decay config.
    // Falls back to safe defaults when the block is absent (forward-compat).
    rag: (() => {
      const r = (get(f, "rag") ?? {}) as Record<string, unknown>;
      const td = (r["temporalDecay"] ?? {}) as Record<string, unknown>;
      const dhl = (r["decayHalfLifeDays"] ?? {}) as Record<string, unknown>;
      return {
        temporalDecay: {
          enabled: boolVal(td, "enabled", true),
          halfLifeDays: numVal(td, "halfLifeDays", 7),
          maxBoost: numVal(td, "maxBoost", 0.3),
        },
        decayHalfLifeDays: {
          news:     numVal(dhl, "news",     2),
          macro:    numVal(dhl, "macro",    7),
          filing:   numVal(dhl, "filing",   30),
          analysis: numVal(dhl, "analysis", 14),
        },
        maxDistance: numVal(r, "maxDistance", 0.9),
      } satisfies RagConfig;
    })(),
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
  const cfg = mcpConfig; // Use cached singleton — avoids disk read on every call
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
    host: fresh.server.host,
    dbPath: fresh.data.dbPath,
    logLevel: fresh.server.logLevel,
    telegramBotToken: fresh.telegram.botToken,
    telegramMarketGroupId: fresh.telegram.marketGroupId,
    telegramWorkChannelId: fresh.telegram.workChannelId,
    telegramBugChannelId: fresh.telegram.bugChannelId,
  };
}

/** Legacy singleton. */
export const config: AppConfig = loadConfig();
