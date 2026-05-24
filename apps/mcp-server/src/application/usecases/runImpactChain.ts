/**
 * Run Impact Chain — Task 062 (Application Layer)
 *
 * Orchestrates the causal cascade pipeline:
 *   1. Normalize raw news text → AnalysisEntry (or use pre-built seedEntry)
 *   2. Fetch RAG context (best-effort, wrapped in try/catch)
 *   3. Call pure domain function buildCausalChain with all inputs
 *
 * This is the async application wrapper around the synchronous domain core.
 * I/O is isolated here — the domain layer (cascadeEngine.ts) stays pure.
 *
 * Layer: application/usecases
 */

import { normalizeNews } from "../../domain/services/newsNormalizer.js";
import { buildCausalChain } from "../../domain/services/cascadeEngine.js";
import type { WatchlistEntry, CausalChain, SearchResult, MacroContext } from "../../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../domain/services/newsNormalizer.js";
import { logger } from "../../infrastructure/logger.js";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A RAG retriever function that returns historical context entries.
 * Injected by the caller — defaults to the real `searchContext` if omitted.
 *
 * Using a function parameter instead of importing `searchContext` directly
 * allows the application use case to be tested without I/O (mock injection).
 */
export type RagRetriever = (
  query: string,
  options?: { k?: number },
) => Promise<SearchResult[]>;

/**
 * Commodity snapshot from Yahoo Finance (task 025).
 * Duplicated here as a minimal interface to avoid coupling to infrastructure types.
 * When task 025 is merged, the real infrastructure type must remain compatible.
 */
export interface CommoditySnapshot {
  brentCrudeUSD: number;
  goldUSDPerOz: number;
  /** USD/VND market rate */
  usdVndRate: number;
  fetchedAt: string;
  // new risk-off fields (sprint 188, FR-7)
  vix: number;
  sp500: number;
  shanghaiComp: number;
  hangSeng: number;
  dxy: number;
  cnyVndRate: number;
  copperUSD: number;
  silverUSDPerOz: number;
  jpyVndRate: number;
}

/**
 * SBV macro snapshot (task 028).
 * Duplicated here as a minimal interface to avoid coupling to infrastructure types.
 * When task 028 is merged, the real infrastructure type must remain compatible.
 */
export interface SbvMacroSnapshot {
  overnightRatePct: number;
  refinancingRatePct: number;
  /** Official USD/VND rate from SBV */
  usdVndOfficial: number;
  fetchedAt: string;
}

export interface RunCascadeInput {
  /** Raw news text to normalize (used when seedEntry is not provided) */
  newsText: string;
  /** Pre-normalized seed entry (skips normalizeNews if provided) */
  seedEntry?: AnalysisEntry;
  /** User's watchlist stocks */
  watchlist: WatchlistEntry[];
  /**
   * Optional RAG retriever override.
   * Defaults to the real `ragSearch` via ragHttpClient.ts (G5b P2-F).
   * Pass a mock to avoid I/O in tests.
   */
  ragRetriever?: RagRetriever;
  /**
   * Optional commodity price fetcher override (Yahoo Finance).
   * Defaults to the real `fetchYahooFinancePrices` from infrastructure.
   * Pass a mock to avoid network I/O in tests.
   */
  commodityFetcher?: () => Promise<CommoditySnapshot | null>;
  /**
   * Optional SBV rate fetcher override.
   * Defaults to the real `fetchSbvRates` from infrastructure.
   * Pass a mock to avoid network I/O in tests.
   */
  sbvFetcher?: () => Promise<SbvMacroSnapshot | null>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main exported function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Orchestrate the full causal cascade pipeline.
 *
 * Normalizes news, retrieves RAG context (best-effort), then builds a
 * CausalChain tracing global macro events down to watchlist stock impacts.
 * Macro context (commodity prices + SBV rates) is assembled from injectable
 * fetchers and passed to buildCausalChain for confidence adjustment.
 *
 * @param input - RunCascadeInput with newsText, optional seedEntry, watchlist,
 *                optional RAG retriever, optional commodity + SBV fetchers
 * @returns     - CausalChain with all levels: seed → domain → action
 */
export async function runImpactChain(input: RunCascadeInput): Promise<CausalChain> {
  // ── Step 0: Fetch macro context (best-effort, parallel) ──────────────────
  const commodityFn = input.commodityFetcher ?? defaultCommodityFetcher;
  const sbvFn = input.sbvFetcher ?? defaultSbvFetcher;

  let commodity: CommoditySnapshot | null = null;
  let sbv: SbvMacroSnapshot | null = null;

  try {
    [commodity, sbv] = await Promise.all([commodityFn(), sbvFn()]);
  } catch (err) {
    logger.warn("[runImpactChain] Macro fetchers failed — proceeding without macro context", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Attempt individual fetches so a single failure doesn't cancel both
    if (commodity === null) {
      try {
        commodity = await commodityFn();
      } catch {
        /* ignored */
      }
    }
    if (sbv === null) {
      try {
        sbv = await sbvFn();
      } catch {
        /* ignored */
      }
    }
  }

  // Assemble MacroContext — fields stay null when the fetcher failed/returned null
  const macroContext: MacroContext = {
    brentCrudeUSD:      commodity?.brentCrudeUSD ?? null,
    goldUSDPerOz:       commodity?.goldUSDPerOz ?? null,
    usdVndMarket:       commodity?.usdVndRate ?? null,
    refinancingRatePct: sbv?.refinancingRatePct ?? null,
    overnightRatePct:   sbv?.overnightRatePct ?? null,
    usdVndOfficial:     sbv?.usdVndOfficial ?? null,
    // new risk-off fields (sprint 188, FR-7) — null when commodity fetch failed
    vix:      commodity?.vix      ?? null,
    sp500:    commodity?.sp500    ?? null,
    dxy:      commodity?.dxy      ?? null,
    hangSeng: commodity?.hangSeng ?? null,
  };

  // ── Step 1: Resolve seed entry ───────────────────────────────────────────
  let seedEntry: AnalysisEntry;

  if (input.seedEntry) {
    seedEntry = input.seedEntry;
  } else {
    // Normalize raw text as a manual-source RssItem
    seedEntry = normalizeNews({
      title: input.newsText || "Unknown event",
      url: "",
      publishedAt: new Date().toISOString(),
      content: "",
      source: "manual",
    });
  }

  // ── Step 2: Fetch RAG context (best-effort) ──────────────────────────────
  let ragResults: SearchResult[] = [];

  const retriever: RagRetriever = input.ragRetriever ?? defaultRagRetriever;

  try {
    ragResults = await retriever(input.newsText || seedEntry.summary, { k: 3 });
  } catch (err) {
    logger.warn("[runImpactChain] RAG retrieval failed — proceeding without context", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 2b: Compute σ-based macro stats from history (best-effort) ──────
  let macroStats: import("../../domain/services/macroThresholds.js").MacroStats[] = [];
  try {
    const { getAllMacroStats } = await import("../../infrastructure/db/macroStatsStore.js");
    macroStats = getAllMacroStats();
  } catch {
    // No historical data yet — σ adjustments will be skipped
  }

  // ── Step 3: Build causal chain (pure domain call) ────────────────────────
  // Load broadcast threshold from config (best-effort; default 6 on failure)
  let broadcastMinImpact = 6;
  try {
    const { loadMcpConfig } = await import("../../infrastructure/config.js");
    const cfg = loadMcpConfig();
    broadcastMinImpact = cfg.alerts?.marketWideCascadeMinImpact ?? 6;
  } catch { /* use default */ }

  const chain = buildCausalChain(seedEntry, input.watchlist, ragResults, macroContext, macroStats, broadcastMinImpact);

  // Record cascade rule hits for instrumentation (Task 247)
  if (chain.matchedRules.length > 0) {
    try {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      const { recordHit } = await import("../../infrastructure/db/cascadeHitStore.js");
      const db = getDb();
      for (const rule of chain.matchedRules) {
        recordHit(db, rule.key, rule.matchedKeyword, rule.sector);
      }
    } catch { /* best-effort — don't break cascade on hit recording failure */ }
  }

  return chain;
}

// ── Default RAG retriever (real implementation, loaded lazily) ───────────────

/**
 * Lazy-loaded default retriever that uses ragHttpClient → rag-service HTTP (port 5002).
 * G5b (P2-F): rewired from searchContext (direct LanceDB) to ragSearch (HTTP boundary).
 * Loaded lazily to avoid circular import issues and allow test overrides.
 */
async function defaultRagRetriever(
  query: string,
  options?: { k?: number },
): Promise<SearchResult[]> {
  try {
    const { ragSearch } = await import("../../infrastructure/rag/ragHttpClient.js");
    const response = await ragSearch({
      query,
      ...(options?.k !== undefined ? { limit: options.k } : {}),
    });
    return response.results.map((r) => ({
      id: r.id,
      level: r.level,
      title: r.title,
      summary: r.summary,
      tags: r.tags,
      actionCode: r.action_code,
      createdAt: r.created_at,
      distance: r.distance,
    }));
  } catch (err) {
    logger.warn("[runImpactChain] defaultRagRetriever failed to reach rag-service", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ── Default commodity fetcher (Yahoo Finance, task 025) ──────────────────────

/**
 * Lazy-loaded default commodity fetcher using Yahoo Finance.
 * Returns null when the fetcher module is unavailable (e.g. task 025 not yet merged).
 * The import path is constructed at runtime to prevent TypeScript TS2307 errors
 * for a module that only exists on the task/025-yahoo-finance branch.
 */
async function defaultCommodityFetcher(): Promise<CommoditySnapshot | null> {
  try {
    // Runtime path construction prevents TS2307 "module not found" compile errors
    // while still performing a real dynamic import in production.
    const modPath = ["../../infrastructure/fetchers/", "yahooFinance.js"].join("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (import(modPath) as Promise<Record<string, unknown>>);
    const fn = mod["fetchYahooFinancePrices"] as
      | (() => Promise<CommoditySnapshot | null>)
      | undefined;
    return fn ? fn() : null;
  } catch (err) {
    logger.warn("[runImpactChain] defaultCommodityFetcher unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ── Default SBV fetcher (task 028) ────────────────────────────────────────────

/**
 * Lazy-loaded default SBV rate fetcher.
 * Returns null when the fetcher module is unavailable (e.g. task 028 not yet merged).
 * Uses runtime path construction — same rationale as defaultCommodityFetcher.
 */
async function defaultSbvFetcher(): Promise<SbvMacroSnapshot | null> {
  try {
    const modPath = ["../../infrastructure/fetchers/", "sbv.js"].join("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (import(modPath) as Promise<Record<string, unknown>>);
    const fn = mod["fetchSbvRates"] as
      | (() => Promise<SbvMacroSnapshot | null>)
      | undefined;
    return fn ? fn() : null;
  } catch (err) {
    logger.warn("[runImpactChain] defaultSbvFetcher unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
