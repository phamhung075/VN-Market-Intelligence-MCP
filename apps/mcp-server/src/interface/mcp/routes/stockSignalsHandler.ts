/**
 * stockSignalsHandler — GET /api/signals/stock/:code
 *
 * FIX-SIGNALS-STOCK-FULL-DETAIL (INFOCARD-EXPAND-FETCH)
 *
 * Exposes FULL stored finding_data + payload for every agent_signals row
 * instead of flattening to a single `detail` string.
 *
 * Contracts:
 *   - finding_data: parsed JSON object or null (never string, never fabricated)
 *   - payload: parsed JSON object (never string)
 *   - source: string from finding_data.source or payload.source, else null
 *   - detail: string kept for back-compat (existing consumers unbroken)
 *   - direction: string extracted from finding_data or payload
 *   - confidence_score: number (default 50)
 *   - created_at: ISO-8601 UTC (YYYY-MM-DDTHH:MM:SS.000Z) normalized server-side
 *                 from SQLite native 'YYYY-MM-DD HH:MM:SS' format
 */

import type { Database } from "bun:sqlite";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StockSignalItem {
  id: number;
  stock_code: string | null;
  signal_type: string;
  direction: string;
  confidence_score: number;
  detail: string;
  /** Full structured finding_data parsed from JSON. null if absent or malformed. */
  finding_data: Record<string, unknown> | null;
  /** Full stored payload parsed from JSON. Empty object if absent or malformed. */
  payload: Record<string, unknown>;
  /**
   * Source URL/identifier from finding_data.source or payload.source.
   * null when neither carries a source field.
   * Surface prominently — allows user to re-check the original source.
   */
  source: string | null;
  /** ISO-8601 UTC datetime (YYYY-MM-DDTHH:MM:SS.000Z). Normalized from SQLite 'YYYY-MM-DD HH:MM:SS'. */
  created_at: string | null;
}

// ── DB row type (raw from SQLite) ─────────────────────────────────────────────

interface SignalRow {
  id: number;
  stock_code: string | null;
  signal_type: string;
  payload: string;
  created_at: string;
  confidence_score?: number | null;
  finding_data?: string | null;
}

// ── normalizeCreatedAt ────────────────────────────────────────────────────────

/**
 * Normalize a SQLite datetime string to ISO-8601 UTC.
 *
 * SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' (space separator, no T, no Z).
 * This function converts that to 'YYYY-MM-DDTHH:MM:SS.000Z' for unambiguous UTC output.
 *
 * - Already-ISO inputs (contains 'T') are preserved but Z-suffixed if missing.
 * - null/undefined returns null.
 * - Unparseable strings return null (honest failure, no fabrication).
 */
export function normalizeCreatedAt(raw: string | null | undefined): string | null {
  if (raw == null) return null;

  // Already has ISO T separator
  if (raw.includes("T")) {
    // Already ends with Z — pass through
    if (raw.endsWith("Z")) return raw;
    // Has offset info (e.g. +07:00) — convert to UTC
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // SQLite format: 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD'
  // Replace space with T and add Z to treat as UTC
  const normalized = raw.replace(" ", "T") + (raw.length === 10 ? "T00:00:00" : "") + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ── querySignalsForStock ──────────────────────────────────────────────────────

/**
 * Query agent_signals for a stock code and return full structured detail.
 *
 * Generic across all signal types — does NOT special-case any signal_type.
 * Parses finding_data and payload JSON generically; passes through all fields.
 *
 * @param signalTypes - Optional filter. When ['chain_catalyst'], expands to
 *   ['chain_catalyst','urgent_news'] (both carry macro detail for MacroImpactPanel).
 *   When undefined, all signal types are returned.
 */
export function querySignalsForStock(
  db: Database,
  stockCode: string,
  limit: number,
  signalTypes?: string[],
): StockSignalItem[] {
  // Schema evolution guard: probe optional columns
  let hasConfidenceScore = false;
  let hasFindingData = false;
  let hasCorrelationStub = false;
  try {
    db.prepare("SELECT confidence_score FROM agent_signals LIMIT 0").all();
    hasConfidenceScore = true;
  } catch { /* column absent — older schema */ }
  try {
    db.prepare("SELECT finding_data FROM agent_signals LIMIT 0").all();
    hasFindingData = true;
  } catch { /* column absent */ }
  try {
    db.prepare("SELECT is_correlation_stub FROM agent_signals LIMIT 0").all();
    hasCorrelationStub = true;
  } catch { /* column absent — pre-migration schema */ }

  const confidenceCol = hasConfidenceScore ? ", confidence_score" : "";
  const findingCol = hasFindingData ? ", finding_data" : "";

  // D-1: Cascade type filter.
  // When signalTypes=['chain_catalyst'], expand to include 'urgent_news' (both
  // carry macro detail for MacroImpactPanel). No frontend change needed.
  const effectiveTypes =
    signalTypes && signalTypes.includes("chain_catalyst") && !signalTypes.includes("urgent_news")
      ? [...signalTypes, "urgent_news"]
      : signalTypes;

  const typeFilter =
    effectiveTypes && effectiveTypes.length > 0
      ? `AND signal_type IN (${effectiveTypes.map(() => "?").join(",")})`
      : "";

  // D-2: Stub exclusion guard — belt-and-suspenders, always two layers:
  //  (C) Content guard: always applied — drops empty verified_decision rows regardless of
  //      column presence. Handles 137+ pre-existing stubs (is_correlation_stub=0 default).
  //  (B) Column guard: applied when is_correlation_stub column exists — drops newly-written
  //      stubs marked is_correlation_stub=1.
  //  Combined: correct before AND after migration.
  const contentStubGuard =
    "AND NOT (signal_type = 'verified_decision' AND (finding_data IS NULL OR finding_data = '{}' OR finding_data = '') AND (payload IS NULL OR payload = '{}' OR payload = ''))";
  const columnStubGuard = hasCorrelationStub
    ? "AND (is_correlation_stub IS NULL OR is_correlation_stub = 0)"
    : "";
  const stubFilter = `${contentStubGuard} ${columnStubGuard}`;

  // Bind params: [stockCode, ...expanded types (if any), limit]
  // Type cast to (string | number | null)[] satisfies SQLQueryBindings constraint.
  const bindParams: (string | number | null)[] = [
    stockCode,
    ...(effectiveTypes ?? []),
    limit,
  ];

  const rows = db
    .prepare<SignalRow, (string | number | null)[]>(
      `SELECT id, stock_code, signal_type, payload, created_at${confidenceCol}${findingCol}
       FROM agent_signals
       WHERE stock_code = ?
       ${typeFilter}
       ${stubFilter}
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(...bindParams) as SignalRow[];

  return rows.map((row) => {
    // Parse payload JSON generically
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch { /* malformed JSON — use empty object */ }

    // Parse finding_data JSON generically
    let findingData: Record<string, unknown> | null = null;
    if (row.finding_data) {
      try {
        const parsed = JSON.parse(row.finding_data);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          findingData = parsed as Record<string, unknown>;
        }
      } catch { /* malformed JSON — leave null */ }
    }

    // Extract direction (prefer finding_data, fallback payload)
    const direction =
      typeof findingData?.["direction"] === "string" ? findingData["direction"] :
      typeof findingData?.["catalyst_direction"] === "string" ? findingData["catalyst_direction"] :
      typeof payload["direction"] === "string" ? payload["direction"] :
      "NEUTRAL";

    // Extract detail string for back-compat
    const detail =
      typeof payload["detail"] === "string" ? payload["detail"] :
      typeof findingData?.["summary"] === "string" ? findingData["summary"] :
      typeof findingData?.["headline"] === "string" ? findingData["headline"] :
      typeof payload["title"] === "string" ? payload["title"] :
      "";

    // Extract source: prefer finding_data.source, fallback payload.source, else null
    const source: string | null =
      typeof findingData?.["source"] === "string" ? findingData["source"] :
      typeof payload["source"] === "string" ? payload["source"] :
      null;

    // Normalize created_at to ISO-8601 UTC
    const createdAt = normalizeCreatedAt(row.created_at);

    return {
      id: row.id,
      stock_code: row.stock_code,
      signal_type: row.signal_type,
      direction,
      confidence_score: row.confidence_score ?? 50,
      detail,
      finding_data: findingData,
      payload,
      source,
      created_at: createdAt,
    };
  });
}
