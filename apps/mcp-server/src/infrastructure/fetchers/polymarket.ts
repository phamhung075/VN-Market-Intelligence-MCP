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
import { BROWSER_UA } from "./browserHeaders.js";

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
  question?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  liquidity?: number | string;
  volume?: number | string;
  volume24hr?: number | string;
  lastTradePrice?: number;
  outcomePrices?: string[] | string;
  uniqueWalletsCount?: number;
  tags?: Array<{ id: number; label: string }> | string[];
}

/** Parse a numeric-ish field from Gamma (may be stringified). */
function gammaNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Parse the Gamma outcomePrices field (may be JSON-encoded string).
 *
 * Returns null when the field is absent, unparseable, or yields fewer than
 * two numeric entries. A null result means the market has no real price and
 * MUST be skipped by the caller — never fabricate a 0.5 coin-flip. (FDA-1)
 */
function parseOutcomePrices(v: unknown): { yes: number; no: number } | null {
  let arr: unknown = v;
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    try { arr = JSON.parse(v); } catch { return null; }
  }
  if (Array.isArray(arr) && arr.length >= 2) {
    const yes = gammaNum(arr[0]);
    const no = gammaNum(arr[1]);
    // gammaNum returns 0 for non-numeric input; a [0,0] price pair is also
    // unparseable (both tokens would sum to 0 — not a valid probability).
    if (yes === 0 && no === 0) return null;
    return { yes, no };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Default HTTP fetch implementation (real network)
// ---------------------------------------------------------------------------

/** Shared HTTP fetch helper — no circuit breaker wrapping. */
async function rawFetch(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
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
}

/**
 * Default PolyFetchFn — plain rawFetch with no circuit breaker wrapping.
 * The circuit breaker is applied explicitly around the Gamma step inside
 * fetchPolymarkets, so CLOB failures (geo-blocked 403) never count against
 * the polymarket circuit breaker. Task 1337.
 */
const defaultFetchFn: PolyFetchFn = (url: string): Promise<string> => rawFetch(url);

/**
 * Default CLOB PolyFetchFn — same as defaultFetchFn (raw fetch, no CB).
 * Kept as a separate reference for clarity and independent test injection.
 */
const defaultClobFetchFn: PolyFetchFn = (url: string): Promise<string> => rawFetch(url);

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
 *
 * Returns null when the tokens array is absent/empty or when either the Yes
 * or No token is missing. A null result means the market has no real price
 * and MUST be skipped by the caller — never fabricate a 0.5 coin-flip. (FDA-1)
 */
function extractPrices(tokens: Array<{ outcome: string; price: number }> | undefined): {
  yesPrice: number;
  noPrice: number;
} | null {
  if (!tokens || tokens.length === 0) return null;
  const yes = tokens.find((t) => t.outcome === "Yes");
  const no = tokens.find((t) => t.outcome === "No");
  if (yes === undefined || no === undefined) return null;
  return {
    yesPrice: yes.price,
    noPrice: no.price,
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
 * @param config       - Prediction markets configuration
 * @param fetchFn      - Injected HTTP function for Gamma (CB-wrapped in production). Override in tests.
 * @param clobFetchFn  - Optional injected HTTP function for CLOB only.
 *                       When omitted, falls back to fetchFn so existing single-fetchFn
 *                       tests continue to work unchanged. In production this defaults to
 *                       defaultClobFetchFn (raw, no CB). Task 1337.
 * @returns            - Array of relevant, enriched prediction markets. Never throws.
 */
export async function fetchPolymarkets(
  config: PredictionMarketsConfig,
  fetchFn: PolyFetchFn = defaultFetchFn,
  clobFetchFn?: PolyFetchFn,
): Promise<PredictionMarket[]> {
  // Task 1337: resolve clobFetchFn — use explicit override when provided; when
  // running in production (fetchFn === defaultFetchFn) use the CB-bypassing raw
  // fetcher; otherwise (test injection) fall back to fetchFn so existing tests
  // that pass a single mock continue to exercise both CLOB and Gamma paths.
  const resolvedClobFetch: PolyFetchFn =
    clobFetchFn ?? (fetchFn === defaultFetchFn ? defaultClobFetchFn : fetchFn);
  const fetchedAt = new Date().toISOString();

  // Step 1 — fetch CLOB (best-effort).
  // CLOB endpoint started returning HTTP 403 (geo/IP block) and only ever
  // serves stale 2022-2023 sports markets even when it does respond — see
  // reports #674/#686/#694/#696. We treat CLOB as optional now: catch any
  // failure (including 403), demote to debug, and continue to the Gamma
  // path which is the real source of truth. The circuit breaker is no
  // longer wrapped around CLOB so it can't trip on the known-bad endpoint
  // and block the rest of the pipeline.
  let clobMarkets: ClobMarket[] = [];
  try {
    const clobUrl = `${config.clobApiUrl}/markets?closed=false&limit=${config.maxMarketsPerPoll}`;
    // Task 1337: use resolvedClobFetch (raw fetch, no CB) so a geo-blocked 403
    // does not increment the polymarket circuit breaker counter.
    const raw = await resolvedClobFetch(clobUrl);
    const parsed: unknown = JSON.parse(raw);
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === "object" && "data" in parsed && Array.isArray((parsed as Record<string, unknown>).data))
        ? (parsed as Record<string, unknown>).data as unknown[]
        : null;
    if (arr) {
      clobMarkets = arr as ClobMarket[];
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 403 / network errors are expected on the deprecated CLOB endpoint.
    // Demote to debug so they don't spam the production error log.
    logger.debug("[polymarket] CLOB unavailable, falling back to Gamma", {
      error: msg.slice(0, 120),
    });
  }

  // Step 2 — rate-limit delay
  if (config.rateLimitDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.rateLimitDelayMs));
  }

  // Step 3 — fetch Gamma for enrichment (CB-protected)
  // Task 1337: circuit breaker is applied here explicitly around the Gamma call,
  // not inside the fetch function. This ensures:
  //   - CLOB 403 failures never count against the CB (clobFetchFn is raw)
  //   - Gamma is the real source of truth and is correctly CB-guarded
  let gammaMap = new Map<string, GammaMarket>();
  try {
    const gammaUrl = `${config.gammaApiUrl}/markets?closed=false&active=true&limit=${config.maxMarketsPerPoll}`;
    const raw = await breakers.polymarket.execute(() => fetchFn(gammaUrl));
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

  // Step 4 — merge and filter CLOB primary path
  const results: PredictionMarket[] = [];

  const now = new Date();

  for (const clob of clobMarkets) {
    if (!isRelevant(clob, config)) continue;

    // Skip expired markets (endDate in the past)
    if (clob.end_date_iso) {
      const endDate = new Date(clob.end_date_iso);
      if (endDate.getTime() < now.getTime()) continue;
    }

    // Skip zero-volume markets (no activity = stale/dead)
    if ((clob.volume_24h ?? 0) === 0 && (clob.volume ?? 0) === 0) continue;

    // FDA-1: skip markets whose price is unparseable — never serve a fabricated 0.5.
    const prices = extractPrices(clob.tokens);
    if (prices === null) {
      logger.debug("[polymarket] CLOB market skipped — unparseable prices", {
        id: clob.condition_id,
      });
      continue;
    }

    const { yesPrice, noPrice } = prices;
    const gamma = gammaMap.get(clob.condition_id);

    results.push({
      id: clob.condition_id,
      question: clob.question,
      endDate: clob.end_date_iso ?? "",
      yesPrice,
      noPrice,
      volume24h: clob.volume_24h ?? 0,
      volumeTotal: clob.volume ?? 0,
      liquidity: gamma ? gammaNum(gamma.liquidity) : 0,
      lastTradePrice: gamma?.lastTradePrice ?? yesPrice,
      uniqueWalletsCount: gamma?.uniqueWalletsCount ?? 0,
      tags: normaliseTags(gamma?.tags),
      fetchedAt,
    });
  }

  // Step 5 — Gamma-primary fallback
  // CLOB endpoint has drifted and now returns thousands of closed 2022-2023
  // sports markets, so CLOB-primary filtering yields zero matches despite
  // plenty of active markets on the platform. When CLOB yields nothing,
  // build results directly from the Gamma market list — it has question,
  // endDate, outcomePrices, liquidity, volume and volume24hr on every row.
  if (results.length === 0) {
    let gammaActive = 0;
    for (const g of gammaMap.values()) {
      if (!g.question) continue;
      if (g.closed === true || g.active === false) continue;

      // Keyword/curated relevance on the Gamma shape
      const q = g.question.toLowerCase();
      const isCurated = config.curatedMarketIds.includes(g.conditionId ?? "");
      const matches = isCurated ||
        config.relevantKeywords.some((kw) => q.includes(kw.toLowerCase()));
      if (!matches) continue;

      // Expiry check
      if (g.endDate) {
        const endDate = new Date(g.endDate);
        if (endDate.getTime() < now.getTime()) continue;
      }

      // Zero-volume filter
      const vol24 = gammaNum(g.volume24hr);
      const volTotal = gammaNum(g.volume);
      if (vol24 === 0 && volTotal === 0) continue;

      // FDA-1: skip markets whose outcomePrices is unparseable — never serve a fabricated 0.5.
      const gammaPrices = parseOutcomePrices(g.outcomePrices);
      if (gammaPrices === null) {
        logger.debug("[polymarket] Gamma market skipped — unparseable outcomePrices", {
          id: g.conditionId ?? g.id,
        });
        continue;
      }

      const { yes, no } = gammaPrices;

      results.push({
        id: g.conditionId ?? g.id,
        question: g.question,
        endDate: g.endDate ?? "",
        yesPrice: yes,
        noPrice: no,
        volume24h: vol24,
        volumeTotal: volTotal,
        liquidity: gammaNum(g.liquidity),
        lastTradePrice: g.lastTradePrice ?? yes,
        uniqueWalletsCount: g.uniqueWalletsCount ?? 0,
        tags: normaliseTags(g.tags),
        fetchedAt,
      });
      gammaActive++;
    }
    if (gammaActive > 0) {
      logger.info("[polymarket] using Gamma-primary fallback path", {
        gammaRelevant: gammaActive,
      });
    }
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
