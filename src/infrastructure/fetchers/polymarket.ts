/**
 * Infrastructure — Polymarket REST Fetcher (Task 164)
 *
 * Fetches prediction market data from Polymarket's public APIs:
 *   1. CLOB API — primary source of market data (prices, volumes)
 *   2. Gamma API — enrichment source (unique wallets, tags, liquidity)
 *
 * Two sequential calls are made per poll cycle with a configurable
 * rate-limit delay between them.
 *
 * The `PredictionMarket` domain type is defined in
 * `src/domain/services/predictionSignalDetector.ts`. The fetcher imports
 * that type and returns it, following the same pattern as `cascadeEngine.ts`
 * consuming `AnalysisEntry` from `newsNormalizer.ts`.
 *
 * Layer: infrastructure/fetchers — may import config and db; must NOT import domain/.
 * Exception: `PredictionMarket` is imported from domain as it is a pure data
 * transfer object (architect-approved — see TECH-020 DDD Compliance Note).
 */

import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import type { PredictionMarketsConfig } from "../config.js";
import type { PredictionMarket } from "../../domain/services/predictionSignalDetector.js";
import { breakers } from "../circuitBreakerRegistry.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Injectable HTTP fetch function for dependency injection / testing.
 * Returns the raw response body as a string.
 */
export type PolyFetchFn = (url: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Internal types matching Polymarket API shapes
// ---------------------------------------------------------------------------

interface ClobMarket {
  condition_id: string;
  question: string;
  end_date_iso: string;
  tokens: Array<{ outcome: "Yes" | "No"; price: number }>;
  volume: number;
  volume_24h?: number;
}

interface GammaMarket {
  id: string;
  conditionId?: string;
  uniqueWalletsCount?: number;
  tags?: Array<{ id: number; label: string }> | string[];
  liquidity?: number;
  lastTradePrice?: number;
}

// ---------------------------------------------------------------------------
// Default HTTP fetch implementation (real network)
// ---------------------------------------------------------------------------

/**
 * Default PolyFetchFn using Bun.fetch with a browser User-Agent.
 * Times out after 15 seconds.
 */
const defaultFetchFn: PolyFetchFn = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalises a raw Gamma `tags` field to a flat string[].
 * Accepts both Array<{id, label}> and string[].
 */
function normaliseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => {
    if (typeof t === "string") return t;
    if (t && typeof t === "object" && "label" in t && typeof (t as Record<string, unknown>)["label"] === "string") {
      return (t as Record<string, unknown>)["label"] as string;
    }
    return String(t);
  });
}

/**
 * Extracts the Yes and No prices from a CLOB market tokens array.
 * Defaults to 0.5 / 0.5 when the tokens array is empty or malformed.
 */
function extractPrices(tokens: Array<{ outcome: string; price: number }> | undefined): {
  yesPrice: number;
  noPrice: number;
} {
  if (!tokens || tokens.length === 0) return { yesPrice: 0.5, noPrice: 0.5 };
  const yes = tokens.find((t) => t.outcome === "Yes");
  const no = tokens.find((t) => t.outcome === "No");
  return {
    yesPrice: yes?.price ?? 0.5,
    noPrice: no?.price ?? 0.5,
  };
}

/**
 * Returns true when a market is relevant — either its question contains at
 * least one keyword from `config.relevantKeywords` (case-insensitive), or
 * its condition_id is in `config.curatedMarketIds`.
 */
function isRelevant(market: ClobMarket, config: PredictionMarketsConfig): boolean {
  if (config.curatedMarketIds.includes(market.condition_id)) return true;
  const q = market.question.toLowerCase();
  return config.relevantKeywords.some((kw) => q.includes(kw.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

/**
 * Fetches prediction markets from Polymarket (CLOB + Gamma enrichment).
 *
 * Execution flow:
 *   1. GET {clobApiUrl}/markets?closed=false&limit={maxMarketsPerPoll} → ClobMarket[]
 *   2. Wait `rateLimitDelayMs` (rate-limit guard)
 *   3. GET {gammaApiUrl}/markets?closed=false&limit={maxMarketsPerPoll} → GammaMarket[]
 *   4. Build enrichment map keyed by id + conditionId
 *   5. Merge CLOB + Gamma → PredictionMarket[]
 *   6. Filter to relevant markets only (keyword or curated)
 *
 * @param config   - Prediction markets configuration
 * @param fetchFn  - Injected HTTP function (defaults to real Bun fetch). Override in tests.
 * @returns        - Array of relevant, enriched prediction markets. Never throws.
 */
export async function fetchPolymarkets(
  config: PredictionMarketsConfig,
  fetchFn: PolyFetchFn = defaultFetchFn,
): Promise<PredictionMarket[]> {
  const fetchedAt = new Date().toISOString();

  // Step 1 — fetch CLOB (wrapped in circuit breaker)
  let clobMarkets: ClobMarket[];
  try {
    clobMarkets = await breakers.polymarket.execute(async () => {
      const clobUrl = `${config.clobApiUrl}/markets?closed=false&limit=${config.maxMarketsPerPoll}`;
      const raw = await fetchFn(clobUrl);
      const parsed: unknown = JSON.parse(raw);
      // CLOB API may return a bare array or { data: [...] } envelope
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === "object" && "data" in parsed && Array.isArray((parsed as Record<string, unknown>).data))
          ? (parsed as Record<string, unknown>).data as unknown[]
          : null;
      if (!arr) {
        throw new Error("CLOB response is not an array or {data:[]}");
      }
      return arr as ClobMarket[];
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // CircuitOpenError → debug level (expected), others → error level
    if (msg.includes("OPEN")) {
      logger.debug("[polymarket] circuit breaker OPEN — skipping fetch", {});
    } else {
      logger.error("[polymarket] CLOB fetch failed", { error: msg });
    }
    return [];
  }

  // Step 2 — rate-limit delay
  if (config.rateLimitDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.rateLimitDelayMs));
  }

  // Step 3 — fetch Gamma for enrichment
  let gammaMap = new Map<string, GammaMarket>();
  try {
    const gammaUrl = `${config.gammaApiUrl}/markets?closed=false&limit=${config.maxMarketsPerPoll}`;
    const raw = await fetchFn(gammaUrl);
    const parsed: unknown = JSON.parse(raw);
    // Gamma API may return a bare array or { data: [...] } envelope
    const gammaArr = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === "object" && "data" in parsed && Array.isArray((parsed as Record<string, unknown>).data))
        ? (parsed as Record<string, unknown>).data as unknown[]
        : null;
    if (gammaArr) {
      for (const g of gammaArr as GammaMarket[]) {
        if (g.id) gammaMap.set(g.id, g);
        if (g.conditionId && g.conditionId !== g.id) gammaMap.set(g.conditionId, g);
      }
    }
  } catch (err) {
    // Gamma failure is non-fatal — proceed with default enrichment values
    logger.warn("[polymarket] Gamma fetch failed (continuing with defaults)", { error: String(err) });
  }

  // Step 4 — merge and filter
  const results: PredictionMarket[] = [];

  for (const clob of clobMarkets) {
    if (!isRelevant(clob, config)) continue;

    const { yesPrice, noPrice } = extractPrices(clob.tokens);
    const gamma = gammaMap.get(clob.condition_id);

    results.push({
      id: clob.condition_id,
      question: clob.question,
      endDate: clob.end_date_iso ?? "",
      yesPrice,
      noPrice,
      volume24h: clob.volume_24h ?? 0,
      volumeTotal: clob.volume ?? 0,
      liquidity: gamma?.liquidity ?? 0,
      lastTradePrice: gamma?.lastTradePrice ?? yesPrice,
      uniqueWalletsCount: gamma?.uniqueWalletsCount ?? 0,
      tags: normaliseTags(gamma?.tags),
      fetchedAt,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// SQLite persistence
// ---------------------------------------------------------------------------

/**
 * Upserts a batch of `PredictionMarket` records into the `prediction_markets`
 * SQLite table (INSERT OR REPLACE — one row per market id).
 *
 * @param markets - Markets to persist (may be empty — no-op in that case).
 */
export async function storePolymarketSnapshot(markets: PredictionMarket[]): Promise<void> {
  if (markets.length === 0) return;

  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
       liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const insertMany = db.transaction((rows: PredictionMarket[]) => {
    for (const m of rows) {
      stmt.run(
        m.id,
        m.question,
        m.endDate,
        m.yesPrice,
        m.noPrice,
        m.volume24h,
        m.volumeTotal,
        m.liquidity,
        m.lastTradePrice,
        m.uniqueWalletsCount,
        JSON.stringify(m.tags),
        m.fetchedAt,
        now,
      );
    }
  });

  insertMany(markets);
}
