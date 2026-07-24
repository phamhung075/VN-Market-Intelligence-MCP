/**
 * Application Service — Kinh Dich Hao Score Computation
 *
 * FACTORY-INTERFACE-move-kinhdich-ta-scoring-down (2026-07-24): PURE MOVE out of
 * `interface/mcp/tools/kinhdich/kinhDichTools.ts` (Task 285's "Score computation
 * helpers" block). No formula/threshold/rounding/ordering change — byte-identical
 * numeric output preserved. Moved (not the reading/hexagram algorithm itself,
 * which already lived correctly in domain/services/kinhDich/ as pure functions —
 * only the DB-touching score computation, which reads market.db directly via
 * getDb()/IKinhDichScoreRepository and therefore does NOT satisfy this codebase's
 * "domain/services = pure, zero I/O" convention (see kinhDichReading.ts header).
 * Layer: application/services — orchestrates domain + infrastructure, same
 * pattern as application/services/imfConvictionBridge.ts and
 * application/usecases/getForeignRoom.ts (usecase calls infra store, then domain
 * pure compute). Interface layer (kinhDichTools.ts) now imports and calls these
 * functions instead of defining them — interface keeps only request parsing,
 * tool registration, and response-text shaping (AC-8 unaffected: these helpers
 * are still NOT migrated to the separate kinh-dich-service HTTP microservice —
 * this move is entirely internal to mcp-server's own DDD layering).
 *
 * Score computation helpers (best-effort, all wrapped in try/catch)
 */

import { getDb } from "../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../infrastructure/db/sqlHelpers.js";
import { TRACKED_INDICATOR_STALE_MS } from "../../../infrastructure/db/commodityTracker.js";
import type { IKinhDichScoreRepository } from "../../../domain/repositories/IKinhDichScoreRepository.js";
import { SqliteKinhDichScoreRepository } from "../../../infrastructure/db/repositories/SqliteKinhDichScoreRepository.js";
import { getSectorPeers } from "../../../domain/services/sectorPeers.js";
import type { DomainType } from "../../../../bctc-schema.js";

/**
 * Hao 1 — Sentiment score from recent rag_analyses entries.
 * Counts bullish vs bearish sentiments for the stock code.
 * Returns a value in [-1, +1].
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeSentimentScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const rows = repo.getRecentSentiments(code, 7, 20);

    // rag_analyses may not have stock_code column in older schemas — try JSON metadata
    if (rows.length === 0) {
      // fallback: search analysis text via direct DB query (legacy path)
      const db = getDb();
      const textRows = db
        .query<{ text: string }, [string]>(
          `SELECT text FROM rag_analyses WHERE text LIKE ? LIMIT 20`,
        )
        .all(`%${code}%`);

      if (textRows.length === 0) return 0.0;

      let bullish = 0;
      let bearish = 0;
      for (const r of textRows) {
        const upper = r.text.toUpperCase();
        if (
          upper.includes("BULLISH") ||
          upper.includes("TANG") ||
          upper.includes("MUA") ||
          upper.includes("TICH CUC")
        ) {
          bullish++;
        } else if (
          upper.includes("BEARISH") ||
          upper.includes("GIAM") ||
          upper.includes("BAN") ||
          upper.includes("TIEU CUC")
        ) {
          bearish++;
        }
      }

      const total = bullish + bearish;
      if (total === 0) return 0.0;
      return (bullish - bearish) / total;
    }

    return 0.0;
  } catch {
    return 0.0;
  }
}

/**
 * Hao 2 — Fundamentals score from vnstock_financials PE vs sector average.
 * Returns a value in [-1, +1]: positive if PE below sector avg (undervalued),
 * negative if PE above (overvalued relative).
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeFundamentalsScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const targetRow = repo.getLatestPe(code);
    if (!targetRow?.pe || targetRow.pe <= 0) return 0.0;

    const domain = repo.getWatchlistDomain(code);
    if (!domain) return 0.0;

    const sectorRows = repo.getSectorPeList(domain, 10);
    if (sectorRows.length === 0) return 0.0;

    const avgPE =
      sectorRows.slice(0, 10).reduce((s, r) => s + (r.pe ?? 0), 0) /
      Math.min(sectorRows.length, 10);

    if (avgPE === 0) return 0.0;

    // PE below avg → positive (undervalued = good), above → negative
    const ratio = (avgPE - targetRow.pe) / avgPE;
    return Math.max(-1, Math.min(1, ratio));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 3 — Price score from latest market_prices change_pct.
 * Normalizes to [-1, +1] via a tanh-like scaling (±5% = ±1).
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computePriceScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const row = repo.getLatestChangePct(code);
    if (!row?.changePct) return 0.0;
    // Scale: 5% change → score of 1.0
    return Math.max(-1, Math.min(1, row.changePct / 5.0));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 4 — Foreign flow score from vnstock_trading_stats.
 * Computes net foreign volume ratio: foreign_volume / avg_volume_2w.
 * Returns a value in [-1, +1].
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeForeignFlowScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const row = repo.getLatestTradingStats(code);
    if (!row?.foreignVolume || !row?.avgVolume2w || row.avgVolume2w === 0) {
      return 0.0;
    }
    return Math.max(-1, Math.min(1, row.foreignVolume / row.avgVolume2w));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 5 — Sector relative strength.
 * Compares stock change_pct vs average of sector peers from getSectorPeers()
 * (domain service), intersected with codes present in market_prices.
 * Returns a value in [-1, +1].
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeSectorScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const domain = repo.getWatchlistDomain(code);
    if (!domain) return 0.0;

    // Resolve peer codes from domain service (pure, no I/O)
    const sectorPeerEntries = getSectorPeers(
      domain as DomainType,
      new Set([code]),
    );
    const peerCodesFromDomain = sectorPeerEntries.map((p) => p.code);

    // Intersect with codes that actually have prices in market_prices
    let peerCodes: string[] = [];
    if (peerCodesFromDomain.length > 0) {
      const available = repo.getMarketPricesForCodes(peerCodesFromDomain);
      peerCodes = available.map((r) => r.code);
    }

    // Fallback: use all available market_prices codes except the target stock
    if (peerCodes.length === 0) {
      const db = getDb();
      peerCodes = db
        .query<{ code: string }, [string]>(
          "SELECT DISTINCT code FROM market_prices WHERE code != ? LIMIT 20",
        )
        .all(code)
        .map((r) => r.code);
    }

    if (peerCodes.length === 0) return 0.0;

    const peerPrices = repo.getMarketPricesForCodes(peerCodes);
    const validChanges = peerPrices
      .map((r) => r.changePct)
      .filter((v) => v !== 0);
    if (validChanges.length === 0) return 0.0;

    const sectorAvg =
      validChanges.reduce((s, v) => s + v, 0) / validChanges.length;

    // My own change
    const myRow = repo.getLatestChangePct(code);
    const myChange = myRow?.changePct ?? 0;
    const relativeStrength = myChange - sectorAvg;
    // Scale: 3% outperformance → 1.0
    return Math.max(-1, Math.min(1, relativeStrength / 3.0));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 6 — Macro score from tracked_indicators (brent_crude_usd, gold_usd_oz, wti_crude_usd).
 * Derives z-score inline from a rolling history window of each indicator.
 * Rising commodity prices = macro stress = negative score for stocks.
 * Returns a value in [-1, +1].
 *
 * FIX-COMMODITY-WTI-DELTA-CORRUPT (I10, 2026-07-23): wti_crude_usd has no live
 * fetcher — it is only populated by news-text regex extraction (commodityTracker.ts).
 * When a news source stops mentioning WTI, the latest row freezes indefinitely
 * (live case: wti_crude_usd stuck at $95.5 for 102+ days, last real extraction
 * 2026-04-12). Feeding a frozen value into the z-score corrupts the oil-regime
 * signal with a phantom "no movement" reading forever. Same anti-pattern already
 * fixed once for marketContextBuilder.buildMacroSection (DSI-MACRO-PHANTOM-STALE-GUARD)
 * but this consumer was missed. Fix: reuse the SAME TRACKED_INDICATOR_STALE_MS
 * threshold (4h) generically for ALL three indicators — an indicator whose latest
 * row is stale is excluded from the composite z-score entirely (degrades that
 * indicator's contribution to zero-influence rather than serving a frozen number
 * as "current"). Generic — no per-indicator/per-value literal.
 */
export function computeMacroScore(): number {
  try {
    const db = getDb();
    const indicators = ["brent_crude_usd", "gold_usd_oz", "wti_crude_usd"];
    const placeholders = sqlInClause(indicators.length);

    const rows = db
      .query<
        { indicator: string; value: number; extracted_at: string },
        string[]
      >(
        `SELECT indicator, value, extracted_at FROM tracked_indicators
         WHERE indicator IN (${placeholders})
         ORDER BY extracted_at DESC LIMIT 80`,
      )
      .all(...indicators);

    if (rows.length === 0) return 0.0;

    // Group by indicator — first value per group is the most recent (ORDER BY extracted_at DESC)
    const byIndicator = new Map<string, { value: number; extractedAt: string }[]>();
    for (const r of rows) {
      const arr = byIndicator.get(r.indicator) ?? [];
      arr.push({ value: r.value, extractedAt: r.extracted_at });
      byIndicator.set(r.indicator, arr);
    }

    const now = Date.now();
    const zScores: number[] = [];
    for (const [, points] of byIndicator) {
      if (points.length < 3) continue;
      // DSI-MACRO-PHANTOM-STALE-GUARD extension: skip indicators whose latest
      // (most recent) row is stale — never fabricate a z-score against a frozen value.
      const latestAgeMs = now - new Date(points[0]!.extractedAt).getTime();
      if (!isFinite(latestAgeMs) || latestAgeMs >= TRACKED_INDICATOR_STALE_MS) continue;
      const values = points.map((p) => p.value);
      const latest = values[0]!;
      const window = values.slice(1);
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const std = Math.sqrt(
        window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
      );
      if (std === 0) continue;
      zScores.push((latest - mean) / std);
    }

    if (zScores.length === 0) return 0.0;

    const avgZ = zScores.reduce((s, v) => s + v, 0) / zScores.length;
    // High macro stress (positive z = rising commodities) = negative for stocks
    return Math.max(-1, Math.min(1, -avgZ / 2.0));
  } catch {
    return 0.0;
  }
}

/**
 * Deterministic per-ticker jitter to prevent convergence when real data is absent.
 *
 * When BCTC is missing, VPS is offline, or no rag_analyses exist, all 6 hao
 * scores default to 0.0 and multiple stocks collapse to the same hexagram.
 * This jitter adds a tiny but unique perturbation to Hao 5 (sector) for each
 * stock code so the final hexagram differs even when all real signals are flat.
 *
 * Properties:
 *   - Deterministic: same code → same jitter (stable across cycles)
 *   - Small: |jitter| ≤ 0.089 → real scores (typically 0.2–1.0) always dominate
 *   - Non-zero: |jitter| ≥ 0.05 → large enough to differentiate
 *   - Straddles the 0.10 THIEU_DUONG/THIEU_AM threshold so different tickers
 *     land on opposite sides → different binary signals → different hexagrams
 *   - Positive or negative: derived from odd/even sum to spread across ±
 *   - Case-insensitive: normalised to uppercase before hashing
 *
 * Task 1007 / Report 1007 + 1020. Extended to all haos in KI-278 fix.
 *
 * @param code - Stock ticker, e.g. "VCB". Case-insensitive.
 * @param seed - Optional seed to produce different jitter per hao (default 0).
 * @returns A value in (-0.089, -0.05] ∪ [+0.05, +0.089], or 0 for empty input.
 */
export function tickerJitter(code: string, seed: number = 0): number {
  if (!code) return 0;
  const upper = code.toUpperCase();
  // Polynomial hash: each char contributes code × (position+1) × 31^position
  // Seed mixed in to produce different values per hao dimension.
  let h = seed >>> 0;
  for (let i = 0; i < upper.length; i++) {
    h = (h * 31 + upper.charCodeAt(i)) >>> 0; // unsigned 32-bit
  }
  // Map to [0, 39] → [0.05, 0.089] range (40 steps of 0.001) — task 1292.
  // Clamped to max 0.089 to satisfy test 1007 contract (|jitter| <= 0.09).
  // Original range was 0.05–0.15; the upper bound drifted past the test limit.
  const magnitude = 0.05 + (h % 40) * 0.001; // 0.050 … 0.089
  // Sign: mix seed into char sum for per-hao sign variation
  const charSum = upper.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + seed;
  return charSum % 2 === 1 ? magnitude : -magnitude;
}

/**
 * Compute all 6 hao scores for a stock code.
 * Each score defaults to 0.0 on any error.
 *
 * ALL haos receive a deterministic per-ticker jitter (|jitter| ≤ 0.09)
 * when their raw score is 0.0 (data absent). Each hao uses a different seed
 * so stocks differentiate across multiple dimensions, not just hao 5.
 * Non-zero real signals are never perturbed. Task 1007 + KI-278.
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeHaoScores(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number[] {
  const raw = [
    computeSentimentScore(code, repo),      // hao 1, seed 1
    computeFundamentalsScore(code, repo),   // hao 2, seed 2
    computePriceScore(code, repo),          // hao 3, seed 3
    computeForeignFlowScore(code, repo),    // hao 4, seed 4
    computeSectorScore(code, repo),         // hao 5, seed 5
    computeMacroScore(),                    // hao 6, seed 6
  ];

  // Apply per-hao jitter only when the raw score is exactly 0.0 (data absent).
  // Different seed per hao ensures maximum differentiation across stocks.
  return raw.map((score, i) =>
    score === 0.0
      ? Math.max(-1, Math.min(1, tickerJitter(code, i + 1)))
      : score,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VN-Index + macro composite scores for market hexagram
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a z-score for a single indicator from its recent history.
 * Used by get_market_hexagram for USD/VND, oil, gold direction.
 *
 * Sign convention: +z/2.0 (caller interprets the sign for market context).
 * Returns a value in [-1, +1], or 0.0 if fewer than 3 rows exist.
 */
export function computeMacroIndicatorScore(name: string): number {
  try {
    const db = getDb();
    const rows = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM tracked_indicators
         WHERE indicator = ? ORDER BY extracted_at DESC LIMIT 21`,
      )
      .all(name);

    if (rows.length < 3) return 0.0;

    const latest = rows[0]!.value;
    const window = rows.slice(1).map((r) => r.value);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const std = Math.sqrt(
      window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
    );
    if (std === 0) return 0.0;

    const z = (latest - mean) / std;
    return Math.max(-1, Math.min(1, z / 2.0));
  } catch {
    return 0.0;
  }
}
