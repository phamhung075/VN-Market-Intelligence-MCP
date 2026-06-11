/**
 * cascadeSignalHandler.ts — GET /api/sector-cascade
 *
 * TASK17-PAGE10 — "Tín hiệu dây chuyền theo ngành" (Sector Cascade Signals) analyst page.
 *
 * Key design constraint: STORED DATA ONLY — no live network fan-out.
 * Fast, deterministic read from `cascade_rule_hits` table.
 * Different from the `get_sector_rotation` MCP tool which does live fan-out.
 *
 * Source table: cascade_rule_hits (read via cascadeSignalStore — infrastructure).
 * This handler maps + aggregates only — NO SQL here.
 *
 * rule_key taxonomy: "{sector}_{up|down|neutral}" e.g. "pharma_neutral", "tech_up".
 * neutral is the majority direction — never assume up/down only.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   8,570 rows, span 2026-02-16 → 2026-06-11
 *   7-day window: ~416 rows across 17 sectors
 *   hit_at format: "YYYY-MM-DD HH:MM:SS" (space, NOT ISO T/Z) — filter uses same format
 *   Ground-truth 7d (netBias = up − down, sorted DESC):
 *     tech +19, real_estate +9, retail +7, logistics +4, gold_mining +4,
 *     aviation +2, utilities +1, pharma +1, construction +1, steel 0,
 *     machinery 0, chemicals 0, automotive 0, agriculture 0,
 *     securities -1, oil_gas -2, banking -2
 *
 * Query params:
 *   ?days=N   — default 7, clamped [1, 30]
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt:  string,      // ISO 8601 server clock
 *     windowDays:   number,      // effective window in days
 *     windowStart:  string,      // "YYYY-MM-DD HH:MM:SS" lower bound used in query
 *     source:       "cascade_rules",
 *     sectors: [                 // aggregated per sector, sorted netBias DESC, tie-break total DESC
 *       { sector, up, down, neutral, total, netBias }
 *     ],
 *     summary: {
 *       bullishSectors:  number,
 *       bearishSectors:  number,
 *       neutralSectors:  number,
 *       topBullish:      sectors[0..4] by netBias DESC
 *       topBearish:      sectors[0..4] by netBias ASC
 *     },
 *     recentHits: [              // rows.slice(0,40), already DESC by hit_at
 *       { ruleKey, sector, direction, matchedText, affectedStocks, hitAt, confidence }
 *     ],
 *     count: number              // sectors.length
 *   }
 *
 * 200-on-empty (empty sectors[], zeroed summary, empty recentHits) when no rows.
 * 500 JSON on DB error (mirrors foreignFlowHandler catch).
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() call here).
 * Imports ONLY from cascadeSignalStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getCascadeHitsSince,
  type CascadeHitRow,
} from "../../../infrastructure/db/cascadeSignalStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 7;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 30;
const RECENT_HITS_LIMIT = 40;
const STORE_LIMIT = 5000;
const TOP_LIST_SIZE = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Direction parsed from rule_key suffix. */
export type CascadeDirection = "up" | "down" | "neutral";

/** One aggregated sector entry. */
export interface SectorCascadeEntry {
  sector: string;
  up: number;
  down: number;
  neutral: number;
  total: number;
  netBias: number; // up − down
}

/** One recent hit item in the response. */
export interface CascadeHitItem {
  ruleKey: string;
  sector: string;
  direction: CascadeDirection;
  matchedText: string;
  affectedStocks: string[];
  hitAt: string;
  confidence: number | null;
}

/** Summary block in response. */
export interface CascadeSummary {
  bullishSectors: number;
  bearishSectors: number;
  neutralSectors: number;
  /** Up to 5 sector entries by netBias DESC (most bullish). */
  topBullish: SectorCascadeEntry[];
  /** Up to 5 sector entries by netBias ASC (most bearish). */
  topBearish: SectorCascadeEntry[];
}

/** Full response body for GET /api/sector-cascade. */
export interface SectorCascadeResponse {
  generatedAt: string;
  windowDays: number;
  windowStart: string;
  source: "cascade_rules";
  sectors: SectorCascadeEntry[];
  summary: CascadeSummary;
  recentHits: CascadeHitItem[];
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the direction from a rule_key by examining the suffix after the LAST "_".
 * Valid suffixes: "up", "down", "neutral".
 * Any other value (or malformed key) → "neutral" (honest default).
 *
 * Examples:
 *   "pharma_neutral"       → "neutral"
 *   "tech_up"              → "up"
 *   "securities_down"      → "down"
 *   "gold_mining_up"       → "up"   (prefix has underscore; last segment is authoritative)
 *   "unknown"              → "neutral"
 *
 * Exported for testability.
 */
export function parseDirection(rule_key: string): CascadeDirection {
  const lastUnderscore = rule_key.lastIndexOf("_");
  if (lastUnderscore === -1) return "neutral";
  const suffix = rule_key.slice(lastUnderscore + 1).toLowerCase();
  if (suffix === "up") return "up";
  if (suffix === "down") return "down";
  return "neutral";
}

/**
 * Resolve the canonical sector for a row.
 * Prefers affected_sector (authoritative column) when non-null and non-empty.
 * Falls back to the rule_key prefix (everything before the last "_") when
 * affected_sector is null or empty.
 *
 * Examples:
 *   row.affected_sector = "pharma", rule_key = "pharma_neutral" → "pharma"
 *   row.affected_sector = null, rule_key = "gold_mining_up"     → "gold_mining"
 *   row.affected_sector = "",   rule_key = "tech_up"            → "tech"
 *
 * Exported for testability.
 */
export function resolveSector(row: CascadeHitRow): string {
  if (row.affected_sector && row.affected_sector.trim() !== "") {
    return row.affected_sector;
  }
  // Fallback: prefix = everything before the last "_"
  const lastUnderscore = row.rule_key.lastIndexOf("_");
  if (lastUnderscore === -1) return row.rule_key;
  return row.rule_key.slice(0, lastUnderscore);
}

/**
 * Parse affected_stocks from a raw string value.
 * Handles:
 *   - null / empty string  → []
 *   - JSON array string    → parsed array (e.g. '["VCB","BID"]')
 *   - comma-separated      → split + trim + filter empty (e.g. "VCB,BID,ACB")
 * Defensive against unexpected shapes — never throws.
 *
 * Exported for testability.
 */
export function parseAffectedStocks(s: string | null): string[] {
  if (!s || s.trim() === "") return [];
  const trimmed = s.trim();

  // Attempt JSON array parse
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => String(v).trim())
          .filter((v) => v.length > 0);
      }
    } catch {
      // Fall through to comma split
    }
  }

  // Comma-separated fallback
  return trimmed
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Aggregate hit rows by resolved sector.
 * For each sector: count up / down / neutral hits; compute total and netBias = up − down.
 * Sorted netBias DESC, tie-break total DESC (more activity ranks first within same bias).
 *
 * Exported for testability.
 */
export function aggregateBySector(rows: CascadeHitRow[]): SectorCascadeEntry[] {
  const map = new Map<string, { up: number; down: number; neutral: number }>();

  for (const row of rows) {
    const sector = resolveSector(row);
    const direction = parseDirection(row.rule_key);

    const existing = map.get(sector) ?? { up: 0, down: 0, neutral: 0 };
    if (direction === "up") {
      existing.up += 1;
    } else if (direction === "down") {
      existing.down += 1;
    } else {
      existing.neutral += 1;
    }
    map.set(sector, existing);
  }

  const entries: SectorCascadeEntry[] = [];
  for (const [sector, counts] of map.entries()) {
    entries.push({
      sector,
      up: counts.up,
      down: counts.down,
      neutral: counts.neutral,
      total: counts.up + counts.down + counts.neutral,
      netBias: counts.up - counts.down,
    });
  }

  // Sort netBias DESC, tie-break total DESC
  entries.sort((a, b) => {
    if (b.netBias !== a.netBias) return b.netBias - a.netBias;
    return b.total - a.total;
  });

  return entries;
}

/**
 * Map a single CascadeHitRow to a CascadeHitItem for the recentHits array.
 * Exported for testability.
 */
export function mapHit(row: CascadeHitRow): CascadeHitItem {
  return {
    ruleKey: row.rule_key,
    sector: resolveSector(row),
    direction: parseDirection(row.rule_key),
    matchedText: row.matched_text,
    affectedStocks: parseAffectedStocks(row.affected_stocks),
    hitAt: row.hit_at,
    confidence: row.confidence ?? null,
  };
}

/**
 * Build the summary block from the already-sorted sectors list.
 *
 * bullishSectors:  count of sectors with netBias > 0
 * bearishSectors:  count of sectors with netBias < 0
 * neutralSectors:  count of sectors with netBias === 0
 * topBullish:      up to 5 entries by netBias DESC (already sorted DESC — take first 5)
 * topBearish:      up to 5 entries by netBias ASC (reverse of sorted — take last 5, re-sort)
 *
 * Exported for testability.
 */
export function buildSummary(sectors: SectorCascadeEntry[]): CascadeSummary {
  let bullishSectors = 0;
  let bearishSectors = 0;
  let neutralSectors = 0;

  for (const s of sectors) {
    if (s.netBias > 0) bullishSectors++;
    else if (s.netBias < 0) bearishSectors++;
    else neutralSectors++;
  }

  // topBullish: sectors is already netBias DESC — first 5 are the most bullish
  const topBullish = sectors.slice(0, TOP_LIST_SIZE);

  // topBearish: 5 entries with lowest netBias — sort ASC, take first 5
  const topBearish = [...sectors]
    .sort((a, b) => {
      if (a.netBias !== b.netBias) return a.netBias - b.netBias;
      return b.total - a.total; // tie-break: more activity first
    })
    .slice(0, TOP_LIST_SIZE);

  return {
    bullishSectors,
    bearishSectors,
    neutralSectors,
    topBullish,
    topBearish,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/sector-cascade.
 *
 * Produces "Tín hiệu dây chuyền theo ngành" — recent news/event cascade pressure
 * per sector, with direction (up/down/neutral), netBias, and top-hit summary.
 *
 * @param req - Incoming HTTP request (reads ?days= query param)
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 * @param now - Optional clock override for testability (defaults to new Date())
 */
export function handleGetSectorCascade(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Parse ?days= param — default 7, clamp [1, 30]
    // Use NaN-check rather than `|| default` so that "0" clamps to MIN (not fallback to default).
    const daysParam = url.searchParams.get("days");
    const parsedDays = parseInt(daysParam ?? "", 10);
    const rawDays = isNaN(parsedDays) ? DEFAULT_WINDOW_DAYS : parsedDays;
    const windowDays = Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, rawDays));

    // Produce sinceIso in "YYYY-MM-DD HH:MM:SS" format — matches hit_at column format.
    // hit_at is stored as "YYYY-MM-DD HH:MM:SS" (space, no T, no Z) so string comparison
    // works correctly only when sinceIso uses the same format.
    const sinceMs = now.getTime() - windowDays * 86400 * 1000;
    const windowStart = new Date(sinceMs)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    // ── 1. Fetch rows from store ─────────────────────────────────────────────
    const rows = getCascadeHitsSince(db, windowStart, STORE_LIMIT);

    // ── 2. Aggregate by sector ───────────────────────────────────────────────
    const sectors = aggregateBySector(rows);

    // ── 3. Build summary ─────────────────────────────────────────────────────
    const summary = buildSummary(sectors);

    // ── 4. Build recentHits (first 40 rows, already DESC by hit_at) ──────────
    const recentHits = rows.slice(0, RECENT_HITS_LIMIT).map(mapHit);

    const body: SectorCascadeResponse = {
      generatedAt: now.toISOString(),
      windowDays,
      windowStart,
      source: "cascade_rules",
      sectors,
      summary,
      recentHits,
      count: sectors.length,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
