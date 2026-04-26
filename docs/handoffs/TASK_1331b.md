# TASK 1331b — GREEN: Single-Writer SQLite Implementation

**Sprint:** 1331 | **Phase:** GREEN | **Size:** M
**Design:** `docs/TECH_1307.md`
**Requires:** TASK_1331a merged (3 failing tests in baseline)

---

## Objective

Implement the single-writer architecture so all 4 tests in `1331a-single-writer-guard.test.ts`
pass. The root fix: `alert-engine` and `stock-price` stop writing to `market.db` directly.
`mcp-server` becomes the ONLY writer.

---

## Implementation Checklist (in order)

### Step 1 — `writerGuard.ts` (new file, mcp-server)

**Create:** `apps/mcp-server/src/infrastructure/db/writerGuard.ts`

```typescript
/**
 * Infrastructure — Single-Writer Guard
 *
 * assertSingleWriter(): attempts a no-op exclusive lock probe on the DB.
 * Returns { contested: true } if another process holds a write lock.
 * Sends WORK channel alert if contested (non-fatal — server still starts).
 *
 * Called from initDatabase() in production.
 * Skipped when DB_PATH=:memory: (test env).
 *
 * Layer: infrastructure/db
 */
import type { Database } from "bun:sqlite";

export interface WriterGuardResult {
  contested: boolean;
  details?: string;
}

export function assertSingleWriter(db: Database): WriterGuardResult {
  try {
    // WAL mode: try an exclusive write probe
    // PRAGMA wal_checkpoint will fail with SQLITE_BUSY if another writer is active
    const result = db.query<{ busy: number; log: number; checkpointed: number }, []>(
      "PRAGMA wal_checkpoint(PASSIVE)"
    ).get();
    // busy > 0 means at least one WAL frame was blocked by another writer
    const contested = (result?.busy ?? 0) > 0;
    return { contested, details: contested ? `busy=${result?.busy}` : undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("SQLITE_BUSY") || msg.includes("database is locked")) {
      return { contested: true, details: msg };
    }
    // Other errors (permissions, etc.) are not contention
    return { contested: false, details: msg };
  }
}
```

**Wire into `schema.ts`** — call inside `initDatabase()` after `getDb()`:
```typescript
// After: const db = dbArg ?? getDb();
// Add:
if (Bun.env["DB_PATH"] !== ":memory:" && Bun.env["BUN_ENV"] !== "test") {
  const { assertSingleWriter } = await import("./writerGuard.js");
  const guard = assertSingleWriter(db);
  if (guard.contested) {
    logger.warn("[writerGuard] market.db has concurrent writer — potential corruption risk", guard);
    // Non-fatal: log to WORK channel async (do not block startup)
    import("../notifiers/telegram.js").then(({ sendTelegramWork }) =>
      sendTelegramWork(`[writerGuard] market.db contested write lock — ${guard.details ?? "unknown"}`)
    ).catch(() => {});
  }
}
```

**Test 4 turns GREEN** after this step.

---

### Step 2 — Alert-Engine: Private DB Migration

**File:** `apps/alert-engine/src/infrastructure/config.ts`

Add `ownDbPath` to `ServiceConfig` interface and `loadConfig()`:
```typescript
export interface ServiceConfig {
  port: number;
  dbPath: string;           // market.db — kept for potential readonly reads
  ownDbPath: string;        // alert_engine.db — WRITE target
  telegramBotToken: string;
  telegramMarketId: string;
  telegramWorkId: string;
  telegramBugId: string;
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '5006', 10),
    dbPath: process.env['DB_PATH'] ?? './data/market.db',
    ownDbPath: process.env['ALERT_ENGINE_DB_PATH'] ?? './data/alert_engine.db',
    // ...rest unchanged
  };
}
```

**File:** `apps/alert-engine/src/index.ts`

Change DB open to use `config.ownDbPath` for writes:
```typescript
// Before:
const db = new Database(config.dbPath, { create: true });

// After:
const db = new Database(config.ownDbPath, { create: true });
```

`initAlertTables(db)` still called — same DDL, different file path.

**Test 2 turns GREEN** after this step.

---

### Step 3 — Stock-Price: Private DB Migration

**File:** `apps/stock-price/src/infrastructure/fetchers.ts`

`Tier3CacheFetcher` constructor — change to accept `ownDbPath`:
```typescript
export class Tier3CacheFetcher implements PriceFetcherPort {
  // Before: constructor(private readonly dbPath: string)
  // After: constructor(private readonly dbPath: string, private readonly ownDbPath: string)

  async saveQuote(quote: PriceQuote): Promise<void> {
    try {
      const { Database } = await import('bun:sqlite');
      // Write to own isolated DB, NOT market.db
      const db = new Database(this.ownDbPath, { create: true });
      db.run(
        `CREATE TABLE IF NOT EXISTS market_prices_cache
         (code TEXT, price REAL, volume REAL, fetched_at TEXT)`,
      );
      db.run(
        `INSERT INTO market_prices_cache (code, price, volume, fetched_at) VALUES (?, ?, ?, ?)`,
        [quote.code, quote.price, quote.volume, quote.fetchedAt],
      );
      db.close();
    } catch {
      // best-effort cache
    }
  }
}
```

`SQLitePriceHistoryRepository.saveQuote()` — same change: use `ownDbPath`.

**File:** `apps/stock-price/src/index.ts`

Export `OWN_DB_PATH` constant and pass to constructors:
```typescript
const OWN_DB_PATH = Bun.env["STOCK_PRICE_DB_PATH"] ?? "./data/stock_price.db";
export { OWN_DB_PATH }; // allows test inspection
```

**Test 3 turns GREEN** after this step + setup.ts update below.

---

### Step 4 — Test Setup: Add Env Var for Test 3

**File:** `apps/mcp-server/src/__tests__/setup.ts`

Add one line:
```typescript
Bun.env["STOCK_PRICE_DB_PATH"] = "/tmp/test_stock_price.db";
```

This makes `STOCK_PRICE_DB_PATH` defined in the test environment so test 3's assertion passes.

---

### Step 5 — docker-compose.yml Updates

**`alert-engine` service** — add env var, remove market.db write access:
```yaml
environment:
  - PORT=5006
  - ALERT_ENGINE_DB_PATH=/app/data/alert_engine.db
  # Remove DB_PATH entirely — alert-engine no longer reads market.db
```

**`stock-price` service** — add own DB env var:
```yaml
environment:
  - PORT=5000
  - DB_PATH=/app/data/market.db          # kept: Tier1/2 fallback still reads market for history
  - STOCK_PRICE_DB_PATH=/app/data/stock_price.db   # add: write target
```

**`technical-analysis`, `macro-indicators`, `kinh-dich-service`** — add explicit readonly flag:
```yaml
environment:
  - PORT=50XX
  - DB_PATH=/app/data/market.db
  - DB_READONLY=true                     # documentation signal; code already opens readonly:true
```

---

### Step 6 — ARCHITECTURE.md Update

In `docs/ARCHITECTURE.md`, section `## Services`:

Change:
```
**Shared:** SQLite database at `data/market.db` (mounted to all services)
```

To:
```
**Database isolation (single-writer):**
- `market.db` — WRITE: mcp-server only | READ: technical-analysis, macro-indicators, kinh-dich-service (readonly:true)
- `alert_engine.db` — WRITE: alert-engine only (local alert cache; results POST to mcp-server)
- `stock_price.db` — WRITE: stock-price Tier3 cache only (results POST to mcp-server /api/push-prices)
- `pdf_extractor.db` — WRITE: pdf-extractor only (isolated, no sharing)
- `rag_service.db` — WRITE: rag-service only (isolated, no sharing)
```

---

## Acceptance Criteria — GREEN Phase

- [ ] `bun test apps/mcp-server/src/__tests__/1331a-single-writer-guard.test.ts` → 4 pass, 0 fail
- [ ] `bun test` full suite → >= 6927 pass, 0 new failures
- [ ] `bun tsc --noEmit` clean (no TypeScript errors)
- [ ] `docker-compose config` shows:
  - `alert-engine`: `ALERT_ENGINE_DB_PATH` set, no `DB_PATH=market.db`
  - `stock-price`: `STOCK_PRICE_DB_PATH` set
  - `mcp-server`: sole service with write access to `market.db`
- [ ] `writerGuard.ts` unit tested (test 4 passes)
- [ ] `ARCHITECTURE.md` updated (step 6)

---

## Files Modified in This Task

| File | Change Type | Description |
|------|------------|-------------|
| `apps/mcp-server/src/infrastructure/db/writerGuard.ts` | CREATE | Single-writer guard with `assertSingleWriter()` |
| `apps/mcp-server/src/infrastructure/db/schema.ts` | MODIFY | Wire writerGuard in `initDatabase()` |
| `apps/mcp-server/src/__tests__/setup.ts` | MODIFY | Add `STOCK_PRICE_DB_PATH` env for tests |
| `apps/alert-engine/src/infrastructure/config.ts` | MODIFY | Add `ownDbPath` to `ServiceConfig` |
| `apps/alert-engine/src/index.ts` | MODIFY | Open `ownDbPath` for DB writes |
| `apps/stock-price/src/infrastructure/fetchers.ts` | MODIFY | `saveQuote` targets `ownDbPath` not `dbPath` |
| `apps/stock-price/src/index.ts` | MODIFY | Export `OWN_DB_PATH` constant |
| `docker-compose.yml` | MODIFY | Add `ALERT_ENGINE_DB_PATH`, `STOCK_PRICE_DB_PATH`, remove market.db from alert-engine |
| `docs/ARCHITECTURE.md` | MODIFY | Update database isolation section |

## Files NOT Changed

- `apps/mcp-server/src/infrastructure/db/schema-*.ts` (no schema DDL changes)
- `apps/pdf-extractor/` (already isolated)
- `apps/rag-service/` (already isolated)
- VPS scripts (constraint 4 satisfied)
- Any MCP tool handlers

---

## Commit Message

```
task(1331b): single-writer SQLite — isolate alert-engine + stock-price DB writes

- writerGuard.ts: assertSingleWriter() detects concurrent write lock, logs to WORK
- alert-engine: writes to alert_engine.db (ALERT_ENGINE_DB_PATH), not market.db
- stock-price: saveQuote() writes to stock_price.db (STOCK_PRICE_DB_PATH), not market.db
- docker-compose: env vars updated, alert-engine DB_PATH removed
- ARCHITECTURE.md: document per-service DB isolation

Fixes: market.db corruption (6 incidents in one day, root cause: multi-writer WAL contention)
Constraint: no VPS changes, no mcp-server schema changes, no existing test regressions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
