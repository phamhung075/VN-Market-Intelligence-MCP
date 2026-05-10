/**
 * Infrastructure — Alert Verdict File Store (Task 1863a-RECONCILE)
 *
 * Atomic read/write/prune abstraction over `docs/data/alert-verdicts.json`.
 *
 * TTL strategy: DROP entries whose `resolvedAt` is older than 30 days.
 * Pending rows (resolvedAt == null) are NEVER pruned.
 * 30-day TTL matches verdictResolutionJob semantics (consistent across system).
 *
 * Rules:
 *   - Read entire array from disk on every call (no in-memory cache).
 *   - Append is dedup-safe: existing row with same id is skipped.
 *   - Update patches matching row by id; throws if id not found.
 *   - Prune removes resolved rows older than maxAgeDays; returns count removed.
 *   - Every write uses the atomic temp-file + rename pattern (POSIX atomic).
 *   - Path is resolved via import.meta.url — NOT process.cwd() (Docker cwd not guaranteed).
 *   - File is initialised as `[]` if it does not exist.
 *   - Fail-loud on unreadable / corrupt JSON (never swallow parse errors).
 *
 * DDD layer: infrastructure — may use fs; must NOT import from domain/.
 *
 * @module infrastructure/fileStore/alertVerdictStore
 */

import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertVerdict {
  /** Unique row identifier — UUID v4 or `${ticker}-${firedAt}`. */
  id: string;
  /** Stock code, uppercase. */
  ticker: string;
  /** ISO 8601 UTC — timestamp of MARKET alert fire. */
  firedAt: string;
  /** Signal type that triggered the MARKET alert. */
  alertSource:
    | "urgent_news"
    | "verified_chain"
    | "chain_catalyst"
    | "price_anomaly"
    | "position_danger"
    | "watchlist_opportunity"
    | string;
  /** Direction carried by alert-commander at fire time. */
  direction: "bullish" | "bearish" | "up" | "down" | "neutral" | string;
  /** Conviction score 0–1. */
  conviction: number;
  /** Resolution status — written as "pending" by MCP tool; updated by job. */
  verdict: "pending" | "confirmed" | "false_positive";
  /** ISO 8601 UTC timestamp of resolution; null until resolved. */
  resolvedAt?: string | null;
  /** VND price at firedAt (fetched at resolution time). */
  priceAtFire?: number | null;
  /** VND price ≥24h after firedAt (close price). */
  priceAtResolution?: number | null;
  /** ((priceAtResolution - priceAtFire) / priceAtFire) * 100 */
  pctMove?: number | null;
  /** Human-readable resolution summary or "price-fetch-failed" sentinel. */
  detail?: string | null;
  /** Alias for priceAtFire (kept for Tier 2 compat). */
  basePrice?: number | null;
  /** Alias for priceAtResolution (kept for Tier 2 compat). */
  closePriceAt24h?: number | null;
}

/**
 * Injectable filesystem dependencies — swap out in tests for in-memory fakes.
 * All functions are synchronous to enable POSIX-atomic rename.
 */
export interface FileStoreDeps {
  readFile?: (filePath: string) => string;
  writeFile?: (filePath: string, data: string) => void;
  renameFile?: (from: string, to: string) => void;
  nowFn?: () => Date;
}

/**
 * Public interface for Tier 2 consumers (wire-up via dependency injection).
 * Mirrors the module-level exports exactly.
 */
export interface AlertVerdictStoreIface {
  readVerdicts(filePath?: string, deps?: FileStoreDeps): Promise<AlertVerdict[]>;
  appendVerdict(v: AlertVerdict, filePath?: string, deps?: FileStoreDeps): Promise<void>;
  updateVerdict(
    id: string,
    patch: Partial<AlertVerdict>,
    filePath?: string,
    deps?: FileStoreDeps
  ): Promise<void>;
  pruneVerdicts(maxAgeDays?: number, filePath?: string, deps?: FileStoreDeps): Promise<number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path resolution via import.meta.url (not process.cwd — Docker cwd unreliable)
// ─────────────────────────────────────────────────────────────────────────────

function defaultVerdictPath(): string {
  // __file: apps/mcp-server/src/infrastructure/fileStore/alertVerdictStore.ts
  // Resolve up 6 levels to monorepo root, then into docs/data/
  return new URL(
    "../../../../../docs/data/alert-verdicts.json",
    import.meta.url
  ).pathname;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default fs implementations (used in production; replaced by fakes in tests)
// ─────────────────────────────────────────────────────────────────────────────

function defaultReadFile(filePath: string): string {
  if (!fs.existsSync(filePath)) return "[]";
  return fs.readFileSync(filePath, "utf-8");
}

function defaultWriteFile(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, data, "utf-8");
}

function defaultRenameFile(from: string, to: string): void {
  fs.renameSync(from, to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseVerdicts(raw: string, filePath: string): AlertVerdict[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[alertVerdictStore] JSON parse error in ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `[alertVerdictStore] Expected JSON array in ${filePath}, got ${typeof parsed}`
    );
  }
  return parsed as AlertVerdict[];
}

/**
 * Atomic write: write to .tmp then rename.
 * The rename is atomic on POSIX (and on macOS/Linux Docker).
 * If writeFile throws, renameFile is never called — live file is untouched.
 */
function atomicWrite(
  filePath: string,
  verdicts: AlertVerdict[],
  deps: Required<Pick<FileStoreDeps, "writeFile" | "renameFile">>
): void {
  const tmp = `${filePath}.tmp`;
  deps.writeFile(tmp, JSON.stringify(verdicts, null, 2));
  deps.renameFile(tmp, filePath);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read all verdict rows from disk.
 * Returns `[]` if the file does not exist.
 * Throws on unreadable / corrupt JSON (fail-loud).
 */
export async function readVerdicts(
  filePath?: string,
  deps: FileStoreDeps = {}
): Promise<AlertVerdict[]> {
  const fp = filePath ?? defaultVerdictPath();
  const readFn = deps.readFile ?? defaultReadFile;
  let raw: string;
  try {
    raw = readFn(fp);
  } catch (err) {
    throw new Error(
      `[alertVerdictStore] Cannot read ${fp}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return parseVerdicts(raw, fp);
}

/**
 * Append one verdict row atomically.
 * Deduplicates by `id` — if a row with the same id already exists, it is
 * left unchanged and no error is thrown.
 */
export async function appendVerdict(
  v: AlertVerdict,
  filePath?: string,
  deps: FileStoreDeps = {}
): Promise<void> {
  const fp = filePath ?? defaultVerdictPath();
  const writeFn = deps.writeFile ?? defaultWriteFile;
  const renameFn = deps.renameFile ?? defaultRenameFile;

  const existing = await readVerdicts(fp, deps);
  if (existing.some((r) => r.id === v.id)) return; // dedup — already present

  const updated = [...existing, v];
  atomicWrite(fp, updated, { writeFile: writeFn, renameFile: renameFn });
}

/**
 * Patch an existing verdict row by id.
 * Throws if no row with that id exists (fail-loud).
 */
export async function updateVerdict(
  id: string,
  patch: Partial<AlertVerdict>,
  filePath?: string,
  deps: FileStoreDeps = {}
): Promise<void> {
  const fp = filePath ?? defaultVerdictPath();
  const writeFn = deps.writeFile ?? defaultWriteFile;
  const renameFn = deps.renameFile ?? defaultRenameFile;

  const existing = await readVerdicts(fp, deps);
  const idx = existing.findIndex((r) => r.id === id);
  if (idx === -1) {
    throw new Error(`[alertVerdictStore] updateVerdict: id "${id}" not found`);
  }

  existing[idx] = { ...existing[idx]!, ...patch };
  atomicWrite(fp, existing, { writeFile: writeFn, renameFile: renameFn });
}

/**
 * Prune verdict rows whose `resolvedAt` is older than `maxAgeDays` days.
 * Rows with `resolvedAt == null` (still pending) are never pruned.
 * Returns the count of rows removed.
 *
 * Default: 30 days — consistent with verdictResolutionJob TTL semantics.
 */
export async function pruneVerdicts(
  maxAgeDays: number = 30,
  filePath?: string,
  deps: FileStoreDeps = {}
): Promise<number> {
  const fp = filePath ?? defaultVerdictPath();
  const writeFn = deps.writeFile ?? defaultWriteFile;
  const renameFn = deps.renameFile ?? defaultRenameFile;
  const nowFn = deps.nowFn ?? (() => new Date());

  const existing = await readVerdicts(fp, deps);
  const cutoffMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = nowFn().getTime();

  const kept = existing.filter((r) => {
    if (!r.resolvedAt) return true; // pending — never prune
    const age = now - new Date(r.resolvedAt).getTime();
    return age <= cutoffMs;
  });

  const removed = existing.length - kept.length;
  if (removed > 0) {
    atomicWrite(fp, kept, { writeFile: writeFn, renameFile: renameFn });
  }
  return removed;
}
