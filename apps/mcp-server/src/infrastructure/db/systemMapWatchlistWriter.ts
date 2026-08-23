/**
 * Infrastructure — System-Map Watchlist Write-Through Store
 * size-justification: 207L — TASK_001-WATCHLIST-WRITE-THROUGH-INFRA new file: two public
 * functions (upsert/remove) sharing 4 small helpers (path normalize, atomic write, failure
 * handler, default fs deps) plus full injectable-deps + onError-callback typing for
 * AC-1/AC-2/AC-4 testability; splitting upsert/remove into separate files would duplicate
 * every shared helper across 3 files for no isolation benefit — single cohesive module.
 * TASK_001-WATCHLIST-WRITE-THROUGH-INFRA (parent: FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58)
 *
 * Mirrors SQLite `watchlist` table mutations (add_to_watchlist /
 * remove_from_watchlist) into `docs/data/system-map.json`'s
 * `.project.watchlist[]` array — the file `deriveWatchlistSeedFromSystemMap()`
 * (seedWatchlist.ts) reads on every container restart. Without this
 * write-through, a ticker added via the user-facing MCP tool only exists in
 * the DB; a DB-corruption-recovery reseed (5 incidents since April 2026)
 * silently discards it because the file never learned about it.
 *
 * Atomic write pattern: same tmp-file + renameSync idiom as
 * `infrastructure/fileStore/alertVerdictStore.ts` (read-modify-write, whole
 * file rewritten, POSIX-atomic rename) — but here the mutated slice is a
 * NESTED array (`.project.watchlist[]`) inside a much larger document, so
 * the read-modify-write preserves every other top-level/nested key
 * byte-for-byte; only `.project.watchlist[]` changes.
 *
 * Fail-open discipline (AC-1/AC-2): this is a durability HINT, not a gate.
 * The DB mutation has already committed by the time these functions run —
 * a file-write failure (race, permission, disk full, missing file) must
 * never throw back into the caller. Both functions catch internally, log via
 * `logger.warn`, and resolve normally. An optional `onError` callback lets a
 * caller surface a soft warning (e.g. appended to a tool response) without
 * the writer itself ever rejecting or throwing — the callback is invoked
 * synchronously from inside the catch block, after logging.
 *
 * DDD layer: infrastructure/db — fs I/O only, no domain imports.
 *
 * @module infrastructure/db/systemMapWatchlistWriter
 */

import * as fs from "node:fs";
import { resolve } from "node:path";
import { logger } from "../logger.js";
import { getProjectRoot } from "../projectRoot.js";
import type { SystemMapWatchlistEntry } from "./seedWatchlist.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One entry of system-map.json `.project.watchlist[]` — reuses the shape
 * `deriveWatchlistSeedFromSystemMap()` already consumes, so a written entry
 * round-trips through that filter with zero transformation. */
export type WatchlistEntry = SystemMapWatchlistEntry;

/** Injectable filesystem dependencies — swap out in tests for in-memory fakes. */
export interface WatchlistWriterDeps {
  readFile?: (filePath: string) => string;
  writeFile?: (filePath: string, data: string) => void;
  renameFile?: (from: string, to: string) => void;
}

/** Optional error hook — invoked (never thrown) when the write fails. */
export type WatchlistWriteErrorHandler = (err: Error) => void;

export interface WatchlistWriteOptions {
  deps?: WatchlistWriterDeps;
  onError?: WatchlistWriteErrorHandler;
}

interface SystemMapFile {
  project?: {
    watchlist?: WatchlistEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Default on-disk location of the SSOT (docs/data/system-map.json). */
export const DEFAULT_SYSTEM_MAP_PATH = resolve(getProjectRoot(), "docs/data/system-map.json");

// ─────────────────────────────────────────────────────────────────────────────
// Default fs implementations (production; replaced by fakes in tests)
// ─────────────────────────────────────────────────────────────────────────────

function defaultReadFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function defaultWriteFile(filePath: string, data: string): void {
  fs.writeFileSync(filePath, data, "utf-8");
}

function defaultRenameFile(from: string, to: string): void {
  fs.renameSync(from, to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCode(ticker: string): string {
  return ticker.toUpperCase().trim();
}

function atomicWriteSystemMap(
  filePath: string,
  parsed: SystemMapFile,
  deps: Required<WatchlistWriterDeps>,
): void {
  const tmp = `${filePath}.tmp`;
  deps.writeFile(tmp, JSON.stringify(parsed, null, 2) + "\n");
  deps.renameFile(tmp, filePath);
}

function handleFailure(op: string, ticker: string, filePath: string, err: unknown, onError?: WatchlistWriteErrorHandler): void {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.warn(
    `[systemMapWatchlistWriter] ${op} failed for ${ticker} at ${filePath}: ${error.message} — ` +
      "DB mutation already committed; file write skipped (fail-open)",
  );
  onError?.(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert one entry into system-map.json `.project.watchlist[]`, matched by
 * `ticker` (case-insensitive). New entries default `active: true` (added via
 * a live user mutation implies the ticker is live); an existing entry's
 * other fields are merged with the incoming entry, so a caller supplying only
 * a subset does not blow away previously-recorded fields (e.g. `note`).
 *
 * Never throws — file errors are caught, logged, and reported only via the
 * optional `onError` callback (see module docblock).
 */
export async function upsertSystemMapWatchlistEntry(
  filePath: string,
  entry: WatchlistEntry,
  opts: WatchlistWriteOptions = {},
): Promise<void> {
  const readFileFn = opts.deps?.readFile ?? defaultReadFile;
  const writeFileFn = opts.deps?.writeFile ?? defaultWriteFile;
  const renameFileFn = opts.deps?.renameFile ?? defaultRenameFile;

  try {
    const raw = readFileFn(filePath);
    const parsed = JSON.parse(raw) as SystemMapFile;
    if (!parsed.project) parsed.project = {};
    const list = parsed.project.watchlist ?? [];

    const code = normalizeCode(entry.ticker);
    const idx = list.findIndex((e) => normalizeCode(e.ticker) === code);
    const normalized: WatchlistEntry = { ...entry, ticker: code, active: entry.active ?? true };

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...normalized };
    } else {
      list.push(normalized);
    }
    parsed.project.watchlist = list;

    atomicWriteSystemMap(filePath, parsed, {
      readFile: readFileFn,
      writeFile: writeFileFn,
      renameFile: renameFileFn,
    });
  } catch (err) {
    handleFailure("upsert", entry.ticker, filePath, err, opts.onError);
  }
}

/**
 * Remove one entry from system-map.json `.project.watchlist[]`, matched by
 * `code` (case-insensitive). No-op (no write) when the code is not found —
 * matches `remove_from_watchlist`'s own "not found" tolerance.
 *
 * Never throws — see `upsertSystemMapWatchlistEntry` docblock.
 */
export async function removeSystemMapWatchlistEntry(
  filePath: string,
  code: string,
  opts: WatchlistWriteOptions = {},
): Promise<void> {
  const readFileFn = opts.deps?.readFile ?? defaultReadFile;
  const writeFileFn = opts.deps?.writeFile ?? defaultWriteFile;
  const renameFileFn = opts.deps?.renameFile ?? defaultRenameFile;

  try {
    const raw = readFileFn(filePath);
    const parsed = JSON.parse(raw) as SystemMapFile;
    const list = parsed.project?.watchlist ?? [];

    const target = normalizeCode(code);
    const filtered = list.filter((e) => normalizeCode(e.ticker) !== target);
    if (filtered.length === list.length) return; // not found — no write needed

    if (parsed.project) parsed.project.watchlist = filtered;
    atomicWriteSystemMap(filePath, parsed, {
      readFile: readFileFn,
      writeFile: writeFileFn,
      renameFile: renameFileFn,
    });
  } catch (err) {
    handleFailure("remove", code, filePath, err, opts.onError);
  }
}
