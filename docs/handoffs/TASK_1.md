# TASK 1 Handoff — Fix market_prices data persistence

## Problem Statement
Live price data is **not being persisted** to `market_prices` table despite VPS pushing 110 prices/min.

### Evidence
| Table | Rows | Last Update | Status |
|-------|------|-------------|--------|
| market_prices | 1 | 2026-03-27 (25d stale) | ❌ NOT UPDATING |
| daily_ohlcv | 1,049 | 2026-04-21 (TODAY) | ✅ WORKING |
| vps_push_log | 8607 | 2026-04-21 22:41 | ✅ PUSHES ARRIVING |

**Critical observation:** Same handler updates BOTH tables, but only daily_ohlcv gets fresh data.

## Analysis

### What Works
- `src/interface/mcp/server.ts:340-499` push-prices handler code is correct ✓
- Test `1193-push-prices-persist.test.ts` passes 7/7 ✓
- Direct SQLite INSERT works ✓
- Schema exists with correct columns ✓
- WAL file is live and updating (44MB, last write 22:55) ✓

### What's Broken
- market_prices INSERT/REPLACE is executing but NOT persisting to disk
- OR the rows are being inserted then immediately deleted
- OR there's a transaction isolation issue

## Root Cause Hypothesis

**Most likely:** DB singleton stale-FD bug.
- Server opened `market.db` when it started
- Database was reopened/rebuilt at some point (schema upgrade, cleanup)
- Old file descriptor in `_db` singleton still points to stale file
- All writes go to old FD, never reach current `market.db`

**Evidence:** This matches the WRITE INVISIBLE error pattern. See line 440 of server.ts.

## Required Fixes

### FIX A: Verify DB connection is fresh (15 lines)
File: `src/infrastructure/db/schema.ts`

In `getDb()` function, add a stat check:
```typescript
export function getDb(): Database {
  const dbPath = Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;

  // NEW: Detect if file was replaced (inode changed)
  if (_db && dbPath !== ":memory:") {
    const oldStat = _dbStat;
    const newStat = statSync(dbPath, { throwIfNoEntry: false });
    if (!oldStat || !newStat || oldStat.ino !== newStat.ino) {
      // File was replaced — close stale connection
      _db.close();
      _db = null;
      log.warn("[getDb] File inode mismatch — flushing stale connection", { path: dbPath });
    }
  }

  if (_db) return _db;

  // ... rest of function
  _dbStat = statSync(dbPath);
  return _db;
}

// Add at module level:
let _dbStat: ReturnType<typeof statSync> | null = null;
```

### FIX B: Force WAL checkpoint on market_prices write (8 lines)
File: `src/interface/mcp/server.ts`, line 448 (after verify block)

```typescript
        // Force WAL checkpoint after large price batch
        if (count > 50) {
          try {
            db.exec("PRAGMA wal_checkpoint(RESTART)");
            log.info("[push-prices] WAL checkpoint forced", { count });
          } catch (e) {
            log.warn("[push-prices] WAL checkpoint failed", { error: String(e) });
          }
        }
```

### FIX C: Verify visibility in async phase too (12 lines)
File: `src/interface/mcp/server.ts`, line 503 (in setImmediate block)

Add at start of async block:
```typescript
        setImmediate(async () => {
          // Verify market_prices is still fresh 100ms later
          const freshCheck = db.prepare(
            `SELECT COUNT(*) as n FROM market_prices WHERE updated_at >= ?`
          ).get(new Date(Date.now() - 1000).toISOString()) as { n: number };
          if (freshCheck.n === 0 && count > 0) {
            log.error("[push-prices] ASYNC: market_prices invisibility confirmed", {
              count, visible_now: freshCheck.n
            });
          }
```

## Test Plan

1. ✅ Unit test: `bun test 1193-push-prices-persist.test.ts` (already passing)
2. ⏳ Integration test: Manually push 10 prices, verify all 10 appear in market_prices within 5s
3. ⏳ Live test: Monitor for 5min, verify market_prices count increases with each push

## Files to Change
- `src/infrastructure/db/schema.ts` — Add inode detection (FIX A)
- `src/interface/mcp/server.ts` — Add WAL checkpoint + async verify (FIX B, C)

## Commit Message
```
fix(1193): Detect stale DB connections + force WAL checkpoint on push-prices

- Add inode detection to catch file replacement scenarios
- Force PRAGMA wal_checkpoint(RESTART) after large price batches
- Add async verification to detect invisible writes earlier
- Fixes market_prices table staying stale despite active VPS pushes
```

## Success Criteria
- ✅ market_prices row count increases with each VPS push
- ✅ updated_at timestamp is current (within 5s of now)
- ✅ All 31 watchlist stocks have recent prices (< 1min old)
- ✅ No "WRITE INVISIBLE" errors in logs
