/**
 * Domain types for VN market data.
 * Tier 1 of DDD: pure TypeScript — ZERO imports from app/lib/api/ or app/components/.
 *
 * These types reflect the api-gateway response shapes; keep in sync with
 * docs/architecture/microservice/frontend/domain-model.md.
 */

/** Direction of a price move — always shown with a delta %, never a bare snapshot. */
export type PriceDirection = "up" | "down" | "flat";

/** HOSE/HNX/UPCOM price colour convention. */
export type MarketColour = "up" | "down" | "ceil" | "floor" | "ref";

/** A single stock quote as returned by api-gateway → stock-price service. */
export interface StockQuote {
  ticker: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  price: number;         // VND
  priceRef: number;      // reference price (previous close)
  /** Absolute change in VND. null = unavailable (Tier-3 cache), 0 = genuine flat day (DSI-S2-PRICE). */
  change: number | null;
  changePct: number;     // percent change, e.g. 2.5 means +2.5%
  /** Nullable change percent mirroring Go *float64 — null = unavailable, 0 = genuine flat (DSI-S2-PRICE). */
  changePercent: number | null;
  direction: PriceDirection;
  colour: MarketColour;
  volume: number;        // shares
  timestamp: string;     // ISO 8601
  // DSI: staleness + provenance fields (DSI-S2-PRICE)
  staleness?: "FRESH" | "STALE" | "EXPIRED" | null;
  isEstimate?: boolean;
  /** True DB timestamp of the underlying fetch — never serve-time (DSI-INV-1). */
  fetchedAt?: string;
}

/** Health summary for a single downstream service. */
export type ServiceStatus = "ok" | "degraded" | "down";

/** A single price history data point from GET /price/history */
export interface PricePoint {
  date: string;       // ISO date string e.g. "2026-05-17"
  code: string;       // ticker symbol e.g. "VN-INDEX"
  open?: number;
  high?: number;
  low?: number;
  close: number;      // closing price
  volume?: number;
}

/** A single source entry inside MacroData.sources */
export interface MacroSourceEntry {
  status: "ok" | "failed" | string;
  latencyMs?: number;
  data?: Record<string, unknown>;
  error?: string;
}

/** A flattened row used by MacroPanel for display */
export interface MacroSourceRow {
  name: string;
  status: "ok" | "failed" | string;
  latencyMs?: number;
  error?: string;
}

/** Macro summary counts */
export interface MacroSummary {
  ok: number;
  failed: number;
  totalLatencyMs?: number;
}

/** Macro external data snapshot from GET /macro/external */
export interface MacroData {
  fetchedAt?: string;
  sources?: Record<string, MacroSourceEntry>;
  summary?: MacroSummary;
  /** Legacy fields — kept for backward-compat; real shape uses sources+summary */
  source?: string;
  status?: string;
  indicators?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Flatten MacroData.sources into display rows for MacroPanel.
 * Pure function — safe to use in tests and loaders.
 */
export function parseMacroSources(macro: MacroData | null): MacroSourceRow[] {
  if (!macro?.sources) return [];
  return Object.entries(macro.sources).map(([name, entry]) => ({
    name,
    status: entry.status,
    latencyMs: entry.latencyMs,
    error: entry.error,
  }));
}

// --------------------------------------------------------------------------
// Kinh Dich types
// --------------------------------------------------------------------------

/** Market-level hexagram reading from GET /kinh-dich/market */
export interface KinhDichMarket {
  hexagram: number;
  name: string;
  trend: string;
  signal: string;
  confidence: number;
  timestamp: string;
}

/** Per-stock hexagram reading from GET /kinh-dich/reading/:code */
export interface KinhDichReading extends KinhDichMarket {
  stock: string;
  actionNote?: string;
  overallReading?: string;
}

// --------------------------------------------------------------------------
// Macro snapshot types
// --------------------------------------------------------------------------

/**
 * A single macro signal entry from the keyed-object returned by
 * POST /macro/snapshot. Each key is a signal name (e.g. "oil", "gold").
 * Fields vary by signal type; optional fields may be absent.
 * New primitives may add new keys — use the index signature for forward-compat.
 */
export interface MacroSignalEntry {
  // investment-clock fields
  tier?: string;
  score?: number;
  phase?: string;
  // oil / gold / usdvnd fields
  impact?: string;
  direction?: string;
  priceUSD?: number;
  rateVND?: number;
  reasoning?: string;
  // carry fields
  regime?: string | null;
  carrySpread?: number | null;
  // yield fields
  label?: string;
  spread?: number;
  // DSI: per-signal provenance fields (DSI-S1-MACRO / DSI-INV-1)
  is_estimate?: boolean;
  source_tier?: 1 | 2 | 3 | 4;
  fetched_at?: string;
  // forward-compat catch-all
  [key: string]: unknown;
}

/**
 * Keyed-object map of macro signal entries.
 * Keys: "investment-clock" | "oil" | "gold" | "usdvnd" | "carry" | "yield"
 * Shape is intentional — macro-indicators Go DTO SignalResult (dtos.go).
 */
export type MacroSignals = Record<string, MacroSignalEntry>;

/** Macro snapshot from POST /macro/snapshot (macro-indicators Go service). */
export interface MacroSnapshot {
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
  signals: MacroSignals;
  fetchedAt: string;
  // DSI: response-level provenance (DSI-S1-MACRO / DSI-INV-1)
  /** "live" only when ALL component fields are fresh within SLA window and is_estimate=false. */
  dataSource?: "live" | "fixture" | "stale" | "estimate";
  /** true when any component field (fedFunds, vndDeposit, oil, gold, usdVnd) is estimate/stale. */
  is_estimate?: boolean;
  source_tier?: 1 | 2 | 3 | 4;
  /** true when fedFunds rate is from FRED fixture fallback, not a live EFFR fetch. */
  fedFundsRateIsEstimate?: boolean;
  /** Carry spread (VND deposit rate − fedFunds). null when is_estimate=true for either input. */
  carrySpread?: number | null;
  /** Carry/yield regime label. null or "unavailable — est. rate" when computed from estimates. */
  carryRegime?: string | null;
}

// --------------------------------------------------------------------------
// Agent signals types
// --------------------------------------------------------------------------

/**
 * Accuracy stats for a single signal_type, returned by the upgraded
 * GET /api/signals/stock/:code endpoint (Sprint B of outcome feedback loop).
 *
 * accuracy_rate: null when sample_count < 3 (insufficient history).
 * sample_count: number of resolved outcomes (correct + incorrect, excludes neutral).
 */
export interface SignalAccuracy {
  accuracy_rate: number | null;
  sample_count: number;
}

/**
 * A per-stock agent signal row from the agent_signals table.
 * Returned by GET /mcp/api/signals/stock/:code
 *
 * accuracy is optional — present only when the endpoint has been upgraded to
 * Sprint B (outcome feedback loop). Treat absence as "no history yet".
 */
export interface AgentSignal {
  id: number;
  stockCode: string;
  signalType: string;       // e.g. "chain_catalyst", "urgent_news", "price_anomaly"
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | string;
  confidence: number;       // normalised 0.0–1.0 (converted from DB integer 0–100)
  reasoning: string;        // human-readable explanation
  createdAt: string;        // ISO/SQLite datetime string
  /** Present when the endpoint returns Sprint B accuracy data. Absence = no history. */
  accuracy?: SignalAccuracy;
}

// --------------------------------------------------------------------------
// Accuracy digest types (system-level, Sprint 1945b)
// --------------------------------------------------------------------------

/**
 * Per-signal-type row in the system accuracy digest.
 * signal_types with ≥ 3 resolved samples only.
 */
export interface SignalTypeAccuracyDigest {
  signal_type: string;
  correct: number;
  total: number;
  /** correct / total (0–1). */
  rate: number;
}

/**
 * System-level accuracy digest response.
 * Mirrors SystemAccuracyDigestStats from signalOutcomeStore.ts
 * plus server-side generatedAt timestamp.
 */
export interface AccuracyDigestStats {
  totalResolved: number;
  totalCorrect: number;
  /** null when totalResolved < 10 */
  overallRate: number | null;
  bySignalType: SignalTypeAccuracyDigest[];
  newStocksCount: number;
  /** Rows with outcome_24h='neutral' AND predicted_direction!='NEUTRAL' */
  neutralOnlyRows: number;
  generatedAt: string; // ISO-8601
}

// --------------------------------------------------------------------------
// Watchlist types
// --------------------------------------------------------------------------

/**
 * A stock entry from the canonical watchlist in docs/data/system-map.json.
 * These are embedded at build time — never call the filesystem at runtime.
 */
export interface WatchlistStock {
  ticker: string;
  company: string;
  sector: string;
  exchange: "HOSE" | "HNX" | "UPCOM" | string;
  active: boolean;
  note?: string;
}

/**
 * Canonical watchlist — mirrors docs/data/system-map.json project.watchlist.
 * Source of truth for all 30+ tickers tracked across 10 sectors.
 * Active = true only; VEA removed in sprint-054.
 */
export const WATCHLIST_STOCKS: WatchlistStock[] = [
  { ticker: "VNM", company: "Vinamilk", sector: "Agriculture / Dairy", exchange: "HOSE", active: true },
  { ticker: "FPT", company: "FPT Corp", sector: "Tech / IT outsourcing", exchange: "HOSE", active: true },
  { ticker: "VCB", company: "Vietcombank", sector: "Banking", exchange: "HOSE", active: true },
  { ticker: "HPG", company: "Hoa Phat Group", sector: "Steel", exchange: "HOSE", active: true },
  { ticker: "VEA", company: "VEAM Corp", sector: "Automotive (Honda/Toyota/Ford JV)", exchange: "UPCOM", active: false, note: "Removed sprint-054" },
  { ticker: "BID", company: "BIDV", sector: "Banking", exchange: "HOSE", active: true },
  { ticker: "SHB", company: "Saigon-Hanoi Bank", sector: "Banking", exchange: "HNX", active: true },
  { ticker: "EIB", company: "Eximbank", sector: "Banking", exchange: "HOSE", active: true },
  { ticker: "VHM", company: "Vinhomes", sector: "Real estate", exchange: "HOSE", active: true },
  { ticker: "VIC", company: "Vingroup", sector: "Real estate / Conglomerate", exchange: "HOSE", active: true },
  { ticker: "KBC", company: "Kinh Bac City", sector: "Real estate / Industrial zone", exchange: "HOSE", active: true },
  { ticker: "HUT", company: "Tasco", sector: "Real estate / Infrastructure", exchange: "HNX", active: true },
  { ticker: "DIG", company: "DIC Corp", sector: "Real estate", exchange: "HOSE", active: true },
  { ticker: "DXG", company: "Dat Xanh Group", sector: "Real estate", exchange: "HOSE", active: true },
  { ticker: "KDH", company: "Khang Dien House", sector: "Real estate", exchange: "HOSE", active: true },
  { ticker: "PDR", company: "Phat Dat Real Estate", sector: "Real estate", exchange: "HOSE", active: true },
  { ticker: "NVL", company: "No Va Land", sector: "Real estate", exchange: "HOSE", active: true },
  { ticker: "VRE", company: "Vincom Retail", sector: "Real estate / Retail REIT", exchange: "HOSE", active: true },
  { ticker: "MSN", company: "Masan Group", sector: "Food / Beverage / Retail", exchange: "HOSE", active: true },
  { ticker: "FRT", company: "FPT Retail", sector: "Retail / Electronics", exchange: "HOSE", active: true },
  { ticker: "KDC", company: "Kido Group", sector: "Food / Beverage", exchange: "HOSE", active: true },
  { ticker: "SAB", company: "Sabeco", sector: "Food / Beverage (Beer)", exchange: "HOSE", active: true },
  { ticker: "DPM", company: "Phu My Fertilizer", sector: "Agriculture / Chemicals", exchange: "HOSE", active: true },
  { ticker: "SSI", company: "SSI Securities", sector: "Securities", exchange: "HOSE", active: true },
  { ticker: "VIX", company: "VIX Securities", sector: "Securities", exchange: "HOSE", active: true },
  { ticker: "VND", company: "VNDirect Securities", sector: "Securities", exchange: "HOSE", active: true },
  { ticker: "VCI", company: "Viet Capital Securities", sector: "Securities", exchange: "HOSE", active: true },
  { ticker: "DGC", company: "Duc Giang Chemicals", sector: "Chemicals / Phosphate", exchange: "HOSE", active: true },
  { ticker: "VJC", company: "VietJet Air", sector: "Aviation / Low-cost carrier", exchange: "HOSE", active: true },
  { ticker: "GEX", company: "Gelex Group", sector: "Utilities / Electrical", exchange: "HOSE", active: true },
  { ticker: "BSR", company: "Binh Son Refinery", sector: "Oil & Gas / Refinery", exchange: "UPCOM", active: true },
  { ticker: "PLX", company: "Petrolimex", sector: "Oil & Gas / Petroleum Retail", exchange: "HOSE", active: true },
  { ticker: "DAG", company: "Da Nang Rubber Group", sector: "Machinery / Industrial", exchange: "HOSE", active: true },
  { ticker: "DBC", company: "Dabaco", sector: "Agriculture / Livestock", exchange: "HOSE", active: true },
];

/** Options for groupBySector */
export interface GroupBySectorOptions {
  includeInactive?: boolean;
}

/**
 * Group watchlist stocks by sector label.
 * By default only active stocks are included.
 * Pure function — safe for loaders and tests.
 */
export function groupBySector(
  stocks: WatchlistStock[],
  options: GroupBySectorOptions = {},
): Record<string, WatchlistStock[]> {
  const { includeInactive = false } = options;
  const filtered = includeInactive ? stocks : stocks.filter((s) => s.active);
  const groups: Record<string, WatchlistStock[]> = {};
  for (const stock of filtered) {
    if (!groups[stock.sector]) groups[stock.sector] = [];
    groups[stock.sector].push(stock);
  }
  return groups;
}

// --------------------------------------------------------------------------
// Fetch status types (F-3 — FETCH-OPS-PAGE-TRUTH sprint)
// --------------------------------------------------------------------------

/** Per-source freshness entry from GET /api/fetch-status */
export interface FetchSourceStatus {
  id: string;           // source slug e.g. "cafef", "vnexpress"
  lastArticleAt: string; // ISO timestamp (empty string for no-data sources)
  ageMs: number;         // milliseconds since last article (0 for no-data)
  count24h: number;      // articles in last 24h
  status: "fresh" | "stale" | "no-data";
}

/** Per-VPS-service push log entry */
export interface VpsProxyServiceStatus {
  last_push: string;   // ISO timestamp
  stale: boolean;
  pushes_24h: number;
  errors_24h: number;
}

/** VPS proxy health for all 5 upstream data feeds */
export interface VpsProxyStatus {
  news: VpsProxyServiceStatus;
  bctc: VpsProxyServiceStatus;
  prices: VpsProxyServiceStatus;
  sbv: VpsProxyServiceStatus;
  "foreign-flow": VpsProxyServiceStatus;
}

/** BCTC PDF extraction pipeline queue counts */
export interface BctcPipelineStatus {
  pending: number;
  done: number;
  failed: number;
}

/** Aggregated fetch operations status from GET /api/fetch-status */
export interface FetchStatus {
  sources: FetchSourceStatus[];
  vpsProxy: VpsProxyStatus;
  bctcPipeline: BctcPipelineStatus;
}

/**
 * Format ageMs into a human-readable string.
 * 0 → "no data" | <60s → "< 1 min ago" | <60min → "N min ago" | else "N h ago"
 * Pure function — safe for unit tests and loaders.
 */
export function formatSourceAge(ageMs: number): string {
  if (ageMs === 0) return "no data";
  const seconds = ageMs / 1000;
  if (seconds < 60) return "< 1 min ago";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  // Round to 1 decimal if fractional, else integer
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} h ago`;
}

/**
 * Derive direction indicator colour from a FetchSourceStatus.
 * Rules:
 *   - status "no-data" → "grey"
 *   - status "fresh" OR ageMs < 2h → "green"
 *   - ageMs 2–12h → "amber"
 *   - ageMs > 12h → "red"
 * Pure function — safe for unit tests and loaders.
 */
export function sourceStatusColor(
  source: FetchSourceStatus,
): "green" | "amber" | "red" | "grey" {
  if (source.status === "no-data") return "grey";
  if (source.status === "fresh") return "green";
  const TWO_HOURS = 2 * 3600 * 1000;
  const TWELVE_HOURS = 12 * 3600 * 1000;
  if (source.ageMs <= TWO_HOURS) return "green";
  if (source.ageMs <= TWELVE_HOURS) return "amber";
  return "red";
}

// --------------------------------------------------------------------------
// Technical Analysis types
// --------------------------------------------------------------------------

/** Single-point TA snapshot from POST /ta/ta/indicators */
export interface TASnapshot {
  code: string;
  rsi: number | null;
  macd: { line: number; signal: number; histogram: number } | null;
  movingAverages: { ma5: number | null; ma20: number | null; ma50: number | null };
  bollingerBands: { upper: number; mid: number; lower: number } | null;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  computedAt: string;
}
