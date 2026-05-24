/**
 * RAG — LanceDB Vector Store
 *
 * Generic vector store for RAG analysis entries.
 * Stores entries with 384-dim embeddings (multilingual-MiniLM)
 * and supports filtered similarity search.
 *
 * Exports:
 *   initVectorStore(dbPath?)   — open / create the LanceDB database
 *   insertVector(entry)        — store a single entry
 *   searchSimilar(query, k, filters) — top-k similarity search
 *   closeVectorStore()         — release resources
 */

import * as lancedb from "@lancedb/lancedb";

const DEFAULT_LANCEDB_PATH = Bun.env.LANCEDB_PATH ?? "./data/lancedb";
const TABLE_NAME = "rag_entries";

// ── Types ─────────────────────────────────────────────────────────────────

export interface VectorEntry {
  id: string;
  level: string; // "global" | "country" | "domain" | "action"
  title: string;
  summary: string;
  vector: Float32Array | number[];
  tags: string[]; // stored as JSON string internally
  actionCode?: string;
  createdAt: string; // ISO timestamp
}

/**
 * Internal row shape stored in LanceDB.
 * Uses snake_case column names because LanceDB/DataFusion
 * lowercases unquoted identifiers in SQL filter expressions.
 */
interface StoredRow {
  id: string;
  level: string;
  title: string;
  summary: string;
  vector: number[];
  tags: string; // JSON string
  action_code: string;
  created_at: string;
}

export interface SearchResult {
  id: string;
  level: string;
  title: string;
  summary: string;
  tags: string[];
  actionCode: string;
  createdAt: string;
  distance: number; // L2 distance — lower is more similar
}

export interface SearchFilters {
  level?: string;
  actionCode?: string;
}

// ── Input validation & sanitization ──────────────────────────────────────────

/** Valid levels for the causal hierarchy. */
const VALID_LEVELS = new Set(["global", "country", "domain", "action"]);

/**
 * Validate that `value` is a legal stock ticker: 1–10 uppercase letters/digits only.
 * Returns `true` if the value is safe to use as an `actionCode` filter.
 */
export function validateActionCode(value: string): boolean {
  return /^[A-Z0-9]{1,10}$/.test(value);
}

/**
 * Validate that `value` is one of the four allowed causal hierarchy levels.
 * Returns `true` if the value is safe to use as a `level` filter.
 */
export function validateLevel(value: string): boolean {
  return VALID_LEVELS.has(value);
}

/**
 * Escape a filter string value for safe embedding in a LanceDB / DataFusion
 * SQL WHERE clause by doubling all single-quote characters (SQL standard).
 *
 * The caller is responsible for surrounding the result with single-quote
 * delimiters: `column = '${sanitizeFilterValue(raw)}'`.
 *
 * This is a defence-in-depth measure on top of input validation.
 * Prefer `validateActionCode` / `validateLevel` as the primary gate.
 */
export function sanitizeFilterValue(value: string): string {
  return value.replace(/'/g, "''");
}

// ── DB connection singleton ───────────────────────────────────────────────

let _db: Awaited<ReturnType<typeof lancedb.connect>> | null = null;
let _table: Awaited<ReturnType<Awaited<ReturnType<typeof lancedb.connect>>["openTable"]>> | null =
  null;

/**
 * Initialise (or re-initialise) the vector store.
 * Creates the LanceDB directory and table if they do not exist.
 */
export async function initVectorStore(dbPath?: string): Promise<void> {
  const resolvedPath = dbPath ?? DEFAULT_LANCEDB_PATH;

  // Ensure parent directory exists
  const fs = await import("node:fs");
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true });
  }

  _db = await lancedb.connect(resolvedPath);
  _table = null; // will be lazily created on first operation
}

/**
 * Get or create the table (lazy).
 */
async function getTable() {
  if (_table) return _table;
  if (!_db) {
    await initVectorStore();
  }
  const db = _db!;

  const names = await db.tableNames();
  if (names.includes(TABLE_NAME)) {
    _table = await db.openTable(TABLE_NAME);
    return _table;
  }

  // Create table with a seed row then delete it to establish the schema
  const seed: StoredRow = {
    id: "__init__",
    level: "",
    title: "",
    summary: "",
    vector: new Array(384).fill(0),
    tags: "[]",
    action_code: "",
    created_at: new Date().toISOString(),
  };
  _table = await db.createTable(TABLE_NAME, [seed as unknown as Record<string, unknown>]);
  await _table.delete("id = '__init__'");
  return _table;
}

// ── Write ─────────────────────────────────────────────────────────────────

/**
 * Insert a single vector entry into the store.
 */
export async function insertVector(entry: VectorEntry): Promise<void> {
  const table = await getTable();
  const row: StoredRow = {
    id: entry.id,
    level: entry.level,
    title: entry.title,
    summary: entry.summary,
    vector: Array.from(entry.vector),
    tags: JSON.stringify(entry.tags),
    action_code: entry.actionCode ?? "",
    created_at: entry.createdAt,
  };
  await table.add([row as unknown as Record<string, unknown>]);
}

// ── Search ────────────────────────────────────────────────────────────────

/**
 * Search for the top-k most similar entries to the given query vector.
 *
 * @param queryVector 384-dim vector
 * @param k           max results (default 5)
 * @param filters     optional level / actionCode filter
 */
export async function searchSimilar(
  queryVector: Float32Array | number[],
  k: number = 5,
  filters?: SearchFilters,
): Promise<SearchResult[]> {
  const table = await getTable();
  const qv = Array.from(queryVector);

  let query = table.vectorSearch(qv).limit(k);

  // Apply filters (use snake_case column names to match stored schema).
  // Defence-in-depth: validate format first, then sanitize with SQL-standard
  // single-quote doubling before embedding in the WHERE clause.
  const clauses: string[] = [];
  if (filters?.level) {
    if (!validateLevel(filters.level)) {
      throw new Error(
        `[searchSimilar] Invalid level filter value: "${filters.level}". ` +
          `Must be one of: global, country, domain, action.`,
      );
    }
    clauses.push(`level = '${sanitizeFilterValue(filters.level)}'`);
  }
  if (filters?.actionCode) {
    if (!validateActionCode(filters.actionCode)) {
      throw new Error(
        `[searchSimilar] Invalid actionCode filter value: "${filters.actionCode}". ` +
          `Must match /^[A-Z0-9]{1,10}$/.`,
      );
    }
    clauses.push(`action_code = '${sanitizeFilterValue(filters.actionCode)}'`);
  }
  if (clauses.length > 0) {
    query = query.where(clauses.join(" AND "));
  }

  // Sprint 053 / report 1027: the same news article gets re-indexed across
  // multiple fetch cycles with different ids, so a vector search for "PVOIL
  // niêm yết" can return 5 identical rows. Pull a wider window from LanceDB
  // (up to 4× requested k, capped at 50) and dedupe by (title, summary)
  // before returning the top-k unique results. The dedup key uses raw
  // strings rather than a hash so it stays cheap.
  const wideLimit = Math.min(50, Math.max(k * 4, k));
  const rawRows = (await query.limit(wideLimit).toArray()) as unknown as (StoredRow & {
    _distance: number;
  })[];

  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of rawRows) {
    const key = `${r.title}\u0000${r.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      id: r.id,
      level: r.level,
      title: r.title,
      summary: r.summary,
      tags: safeParseTags(r.tags),
      actionCode: r.action_code,
      createdAt: r.created_at,
      distance: r._distance ?? 0,
    });
    if (deduped.length >= k) break;
  }
  return deduped;
}

function safeParseTags(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

/**
 * Returns the total number of rows stored in the LanceDB rag_entries table.
 * Returns 0 if the table does not yet exist (first startup before any analysis).
 * Never throws — returns 0 on any LanceDB error.
 */
export async function getCount(): Promise<number> {
  try {
    const table = await getTable();
    return await table.countRows();
  } catch {
    return 0;
  }
}

/**
 * Compact and optimize the LanceDB table.
 * Merges small data files, removes old versions, reduces disk footprint.
 * Safe to run while the server is live — LanceDB handles concurrent access.
 *
 * @returns Object with before/after stats, or null if table doesn't exist.
 */
export async function compactVectorStore(): Promise<{
  beforeFiles: number;
  afterFiles: number;
  rowCount: number;
} | null> {
  try {
    const table = await getTable();
    const rowCount = await table.countRows();

    // Count data files before
    const { readdirSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const dbPath = Bun.env.LANCEDB_PATH ?? "./data/lancedb";
    const dataDir = resolve(dbPath, TABLE_NAME + ".lance", "data");
    let beforeFiles = 0;
    try { beforeFiles = readdirSync(dataDir).length; } catch { /* dir may not exist */ }

    // Compact: merge small fragments into larger files
    await (table as unknown as { optimize: (opts?: unknown) => Promise<unknown> }).optimize?.();

    // Cleanup old versions (keep last 2)
    await (table as unknown as { cleanupOldVersions: (olderThan?: number, deleteUnverified?: boolean) => Promise<unknown> })
      .cleanupOldVersions?.(2, true);

    let afterFiles = 0;
    try { afterFiles = readdirSync(dataDir).length; } catch { /* dir may not exist */ }

    return { beforeFiles, afterFiles, rowCount };
  } catch (err) {
    console.warn("[vectorstore] compaction failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Close the vector store connection and release resources.
 */
export async function closeVectorStore(): Promise<void> {
  _table = null;
  if (_db !== null) {
    // LanceDB connection may expose a close() method — call it if present
    const db = _db as unknown as { close?: () => void | Promise<void> };
    if (typeof db.close === "function") {
      await Promise.resolve(db.close()).catch(() => {});
    }
    _db = null;
  }
}
