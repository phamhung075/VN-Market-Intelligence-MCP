/**
 * Session Tool Cache — Sprint 1299c
 *
 * Infrastructure layer. Pure in-memory LRU with TTL.
 * Observable-only: populated after tool resolution, NOT on SSE request path.
 * No blocking I/O. Does not affect tool loading behaviour.
 *
 * @module infrastructure/cache/sessionToolCache
 */

export interface SessionCacheEntry {
  /** Skill names active for this session. */
  skills: string[];
  /** Tool names resolved for this session. */
  toolNames: string[];
  /** Epoch ms when entry was created. */
  loadedAt: number;
}

/**
 * In-memory LRU cache with TTL.
 *
 * Eviction order:
 *   1. Expired entries (TTL exceeded) purged lazily on each mutating call.
 *   2. When maxSize is reached after TTL purge, the entry with the oldest
 *      `loadedAt` timestamp is evicted (LRU approximation).
 */
export class SessionToolCache {
  private store = new Map<string, { entry: SessionCacheEntry; expiresAt: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 100, ttlMs = 8 * 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /** Returns the entry for sessionId, or undefined if missing / expired. */
  get(sessionId: string): SessionCacheEntry | undefined {
    const record = this.store.get(sessionId);
    if (!record) return undefined;
    if (Date.now() > record.expiresAt) {
      this.store.delete(sessionId);
      return undefined;
    }
    return record.entry;
  }

  /** Stores an entry, evicting expired + oldest entries as needed. */
  set(sessionId: string, entry: SessionCacheEntry): void {
    this._purgeExpired();
    if (this.store.size >= this.maxSize) {
      // Evict entry with oldest loadedAt
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [k, v] of this.store) {
        if (v.entry.loadedAt < oldestTime) {
          oldestTime = v.entry.loadedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(sessionId, { entry, expiresAt: Date.now() + this.ttlMs });
  }

  /**
   * Returns a shallow snapshot of all non-expired entries.
   * Safe to call from the cron job without blocking the SSE path.
   */
  snapshot(): Record<string, SessionCacheEntry> {
    this._purgeExpired();
    const out: Record<string, SessionCacheEntry> = {};
    for (const [k, v] of this.store) out[k] = v.entry;
    return out;
  }

  /** Returns the count of non-expired entries. */
  size(): number {
    this._purgeExpired();
    return this.store.size;
  }

  private _purgeExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now > v.expiresAt) this.store.delete(k);
    }
  }
}

/** Singleton for production use (TTL 8h, max 100 sessions). */
export const sessionToolCache = new SessionToolCache();
