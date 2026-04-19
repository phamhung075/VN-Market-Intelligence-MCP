# TASK 1487b — GREEN: yahooFinance + schema + cascadeEngine + runImpactChain

phase: GREEN
sprint: 188
branch: task/1487-yahoo-extended-green
depends_on: 1487a RED merged

## Goal

Implement FR-1 → FR-7. All T-1 → T-7 assertions must pass. Single atomic commit includes BOTH `schema.ts` AND `yahooFinance.ts` — never split.

## Files to modify (4 files)

1. `src/infrastructure/fetchers/yahooFinance.ts`
2. `src/infrastructure/db/schema.ts`
3. `src/domain/services/cascadeEngine.ts`
4. `src/application/usecases/runImpactChain.ts`

---

## File 1: `src/infrastructure/fetchers/yahooFinance.ts`

### Edit 1 — SYMBOLS map (line 51, currently 3 entries)

Replace:
```typescript
const SYMBOLS = {
  brent: "BZ=F",
  gold: "GC=F",
  usdVnd: "USDVND=X",
} as const;
```

With:
```typescript
const SYMBOLS = {
  // existing
  brent:  "BZ=F",
  gold:   "GC=F",
  usdVnd: "USDVND=X",
  // new (FR-1) — 9 global risk-off symbols
  vix:      "^VIX",       // CBOE Volatility Index (fear gauge)
  sp500:    "^GSPC",      // S&P 500 index
  shanghai: "000001.SS",  // Shanghai Composite — 15-min delay on Yahoo free tier
  hangSeng: "^HSI",       // Hang Seng index
  dxy:      "DX-Y.NYB",  // US Dollar Index (NYB venue; 0 stored if unresolvable)
  cnyVnd:   "CNHVND=X",  // CNH/VND offshore rate (low liquidity)
  copper:   "HG=F",       // Copper futures (USD/lb)
  silver:   "SI=F",       // Silver futures (USD/oz)
  jpyVnd:   "JPYVND=X",  // JPY/VND exchange rate
} as const;
```

### Edit 2 — CommoditySnapshot interface (line 70, currently 4 fields)

Replace the entire interface block:
```typescript
export interface CommoditySnapshot {
  /** Brent crude oil price in USD per barrel. 0 if unavailable. */
  brentCrudeUSD: number;
  /** Gold futures price in USD per troy ounce. 0 if unavailable. */
  goldUSDPerOz: number;
  /** USD to Vietnamese Dong exchange rate. 0 if unavailable. */
  usdVndRate: number;
  /** ISO 8601 timestamp of when this snapshot was fetched. */
  fetchedAt: string;
}
```

With:
```typescript
export interface CommoditySnapshot {
  /** Brent crude oil price in USD per barrel. 0 if unavailable. */
  brentCrudeUSD: number;
  /** Gold futures price in USD per troy ounce. 0 if unavailable. */
  goldUSDPerOz: number;
  /** USD to Vietnamese Dong exchange rate. 0 if unavailable. */
  usdVndRate: number;
  /** ISO 8601 timestamp of when this snapshot was fetched. */
  fetchedAt: string;
  // ── new fields (FR-2) — all 0 when individual fetch fails ─────────────────
  /** CBOE Volatility Index level. 0 if unavailable. */
  vix: number;
  /** S&P 500 index level. 0 if unavailable. */
  sp500: number;
  /** Shanghai Composite level (15-min delay on Yahoo free tier). 0 if unavailable. */
  shanghaiComp: number;
  /** Hang Seng index level. 0 if unavailable. */
  hangSeng: number;
  /** US Dollar Index (DXY) level. 0 if unavailable (DX-Y.NYB venue). */
  dxy: number;
  /** CNH to VND offshore exchange rate. 0 if unavailable. */
  cnyVndRate: number;
  /** Copper futures price in USD per lb. 0 if unavailable. */
  copperUSD: number;
  /** Silver futures price in USD per troy oz. 0 if unavailable. */
  silverUSDPerOz: number;
  /** JPY to VND exchange rate. 0 if unavailable. */
  jpyVndRate: number;
}
```

### Edit 3 — Promise.allSettled block (line 211, currently 3 symbols)

Replace:
```typescript
  // Fetch all three symbols concurrently
  const [brentResult, goldResult, usdVndResult] = await Promise.allSettled([
    fetchSymbolPrice(SYMBOLS.brent, client, apiBase),
    fetchSymbolPrice(SYMBOLS.gold, client, apiBase),
    fetchSymbolPrice(SYMBOLS.usdVnd, client, apiBase),
  ]);
```

With:
```typescript
  // Fetch all 12 symbols concurrently (FR-3)
  const [
    brentResult, goldResult, usdVndResult,
    vixResult, sp500Result, shanghaiResult, hangSengResult,
    dxyResult, cnyVndResult, copperResult, silverResult, jpyVndResult,
  ] = await Promise.allSettled([
    fetchSymbolPrice(SYMBOLS.brent,    client, apiBase),
    fetchSymbolPrice(SYMBOLS.gold,     client, apiBase),
    fetchSymbolPrice(SYMBOLS.usdVnd,   client, apiBase),
    fetchSymbolPrice(SYMBOLS.vix,      client, apiBase),
    fetchSymbolPrice(SYMBOLS.sp500,    client, apiBase),
    fetchSymbolPrice(SYMBOLS.shanghai, client, apiBase),
    fetchSymbolPrice(SYMBOLS.hangSeng, client, apiBase),
    fetchSymbolPrice(SYMBOLS.dxy,      client, apiBase),
    fetchSymbolPrice(SYMBOLS.cnyVnd,   client, apiBase),
    fetchSymbolPrice(SYMBOLS.copper,   client, apiBase),
    fetchSymbolPrice(SYMBOLS.silver,   client, apiBase),
    fetchSymbolPrice(SYMBOLS.jpyVnd,   client, apiBase),
  ]);
```

After the existing 3 field extractions (`brentCrudeUSD`, `goldUSDPerOz`, `usdVndRate`), add 9 more field extractions following the same pattern:
```typescript
  const vix =
    vixResult.status === "fulfilled" && vixResult.value !== null ? vixResult.value : 0;
  const sp500 =
    sp500Result.status === "fulfilled" && sp500Result.value !== null ? sp500Result.value : 0;
  const shanghaiComp =
    shanghaiResult.status === "fulfilled" && shanghaiResult.value !== null ? shanghaiResult.value : 0;
  const hangSeng =
    hangSengResult.status === "fulfilled" && hangSengResult.value !== null ? hangSengResult.value : 0;
  const dxy =
    dxyResult.status === "fulfilled" && dxyResult.value !== null ? dxyResult.value : 0;
  const cnyVndRate =
    cnyVndResult.status === "fulfilled" && cnyVndResult.value !== null ? cnyVndResult.value : 0;
  const copperUSD =
    copperResult.status === "fulfilled" && copperResult.value !== null ? copperResult.value : 0;
  const silverUSDPerOz =
    silverResult.status === "fulfilled" && silverResult.value !== null ? silverResult.value : 0;
  const jpyVndRate =
    jpyVndResult.status === "fulfilled" && jpyVndResult.value !== null ? jpyVndResult.value : 0;
```

Update the all-zero guard to check all 12 fields:
```typescript
  // Return null ONLY when ALL 12 fields are 0 (FR-3 business rule)
  if (
    brentCrudeUSD === 0 && goldUSDPerOz === 0 && usdVndRate === 0 &&
    vix === 0 && sp500 === 0 && shanghaiComp === 0 && hangSeng === 0 &&
    dxy === 0 && cnyVndRate === 0 && copperUSD === 0 && silverUSDPerOz === 0 &&
    jpyVndRate === 0
  ) {
    logger.warn("[yahooFinance] all 12 symbols returned 0 — no data parsed", { apiBase });
    return null;
  }
```

### Edit 4 — snapshot object literal (line 241, currently 4 fields)

Replace:
```typescript
  const snapshot: CommoditySnapshot = {
    brentCrudeUSD,
    goldUSDPerOz,
    usdVndRate,
    fetchedAt,
  };
```

With:
```typescript
  const snapshot: CommoditySnapshot = {
    // existing
    brentCrudeUSD,
    goldUSDPerOz,
    usdVndRate,
    fetchedAt,
    // new (FR-4)
    vix,
    sp500,
    shanghaiComp,
    hangSeng,
    dxy,
    cnyVndRate,
    copperUSD,
    silverUSDPerOz,
    jpyVndRate,
  };
```

Also update the `logger.info` block to include the 9 new fields (add them after `usdVndRate`).

### Edit 5 — storeCommoditySnapshot INSERT (line 272, FR-5)

Replace the `upsertLatest` prepared statement:
```typescript
  const upsertLatest = database.prepare(`
    INSERT OR REPLACE INTO commodity_prices
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
    VALUES (?, ?, ?, ?, ?)
  `);
```

With:
```typescript
  const upsertLatest = database.prepare(`
    INSERT OR REPLACE INTO commodity_prices
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
       vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate,
       copper_usd, silver_usd_per_oz, jpy_vnd_rate, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
```

Replace the `appendHistory` prepared statement:
```typescript
  const appendHistory = database.prepare(`
    INSERT INTO commodity_prices_history
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
    SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM commodity_prices_history
      WHERE source = ? AND strftime('%Y-%m-%d %H', fetched_at) = strftime('%Y-%m-%d %H', ?)
    )
  `);
```

With:
```typescript
  const appendHistory = database.prepare(`
    INSERT INTO commodity_prices_history
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
       vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate,
       copper_usd, silver_usd_per_oz, jpy_vnd_rate, fetched_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM commodity_prices_history
      WHERE source = ? AND strftime('%Y-%m-%d %H', fetched_at) = strftime('%Y-%m-%d %H', ?)
    )
  `);
```

Replace the `upsertLatest.run(...)` call:
```typescript
    upsertLatest.run(
      SOURCE,
      snapshot.brentCrudeUSD,
      snapshot.goldUSDPerOz,
      snapshot.usdVndRate,
      snapshot.fetchedAt,
    );
```

With:
```typescript
    upsertLatest.run(
      SOURCE,
      snapshot.brentCrudeUSD,
      snapshot.goldUSDPerOz,
      snapshot.usdVndRate,
      snapshot.vix,
      snapshot.sp500,
      snapshot.shanghaiComp,
      snapshot.hangSeng,
      snapshot.dxy,
      snapshot.cnyVndRate,
      snapshot.copperUSD,
      snapshot.silverUSDPerOz,
      snapshot.jpyVndRate,
      snapshot.fetchedAt,
    );
```

Replace the `appendHistory.run(...)` call:
```typescript
    appendHistory.run(
      SOURCE,
      snapshot.brentCrudeUSD,
      snapshot.goldUSDPerOz,
      snapshot.usdVndRate,
      snapshot.fetchedAt,
      SOURCE,
      snapshot.fetchedAt,
    );
```

With:
```typescript
    appendHistory.run(
      SOURCE,
      snapshot.brentCrudeUSD,
      snapshot.goldUSDPerOz,
      snapshot.usdVndRate,
      snapshot.vix,
      snapshot.sp500,
      snapshot.shanghaiComp,
      snapshot.hangSeng,
      snapshot.dxy,
      snapshot.cnyVndRate,
      snapshot.copperUSD,
      snapshot.silverUSDPerOz,
      snapshot.jpyVndRate,
      snapshot.fetchedAt,
      // dedup WHERE bindings
      SOURCE,
      snapshot.fetchedAt,
    );
```

**No change** to: `upsertMacroPrice` block (VIX/DXY are index levels, not prices), `upsertTrackedIndicator` block (copper/silver deferred per architect decision). Existing brent/gold mirror logic is unchanged.

---

## File 2: `src/infrastructure/db/schema.ts`

### Edit — commodity_prices DDL (line 379)

Replace:
```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source          TEXT PRIMARY KEY,
      brent_crude_usd REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz REAL NOT NULL DEFAULT 0,
      usd_vnd_rate    REAL NOT NULL DEFAULT 0,
      fetched_at      TEXT NOT NULL
    )
  `);
```

With:
```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source            TEXT PRIMARY KEY,
      brent_crude_usd   REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz   REAL NOT NULL DEFAULT 0,
      usd_vnd_rate      REAL NOT NULL DEFAULT 0,
      vix               REAL NOT NULL DEFAULT 0,
      sp500             REAL NOT NULL DEFAULT 0,
      shanghai_comp     REAL NOT NULL DEFAULT 0,
      hang_seng         REAL NOT NULL DEFAULT 0,
      dxy               REAL NOT NULL DEFAULT 0,
      cny_vnd_rate      REAL NOT NULL DEFAULT 0,
      copper_usd        REAL NOT NULL DEFAULT 0,
      silver_usd_per_oz REAL NOT NULL DEFAULT 0,
      jpy_vnd_rate      REAL NOT NULL DEFAULT 0,
      fetched_at        TEXT NOT NULL
    )
  `);
```

### Edit — commodity_prices_history DDL (line 387)

Replace:
```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source          TEXT NOT NULL,
      brent_crude_usd REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz REAL NOT NULL DEFAULT 0,
      usd_vnd_rate    REAL NOT NULL DEFAULT 0,
      fetched_at      TEXT NOT NULL
    )
  `);
```

With:
```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      source            TEXT NOT NULL,
      brent_crude_usd   REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz   REAL NOT NULL DEFAULT 0,
      usd_vnd_rate      REAL NOT NULL DEFAULT 0,
      vix               REAL NOT NULL DEFAULT 0,
      sp500             REAL NOT NULL DEFAULT 0,
      shanghai_comp     REAL NOT NULL DEFAULT 0,
      hang_seng         REAL NOT NULL DEFAULT 0,
      dxy               REAL NOT NULL DEFAULT 0,
      cny_vnd_rate      REAL NOT NULL DEFAULT 0,
      copper_usd        REAL NOT NULL DEFAULT 0,
      silver_usd_per_oz REAL NOT NULL DEFAULT 0,
      jpy_vnd_rate      REAL NOT NULL DEFAULT 0,
      fetched_at        TEXT NOT NULL
    )
  `);
```

**Deploy note**: `CREATE TABLE IF NOT EXISTS` — existing production DB is unaffected by this change. The new columns will exist in fresh DBs (including `:memory:` test DBs). Existing production DB needs a one-time migration — handled by the server startup idempotent ALTER TABLE block (add after the existing `CREATE INDEX IF NOT EXISTS idx_cph_source_fetched` line):

```typescript
  // FR-6: idempotent migration for existing production DBs that were created
  // before sprint 188. `CREATE TABLE IF NOT EXISTS` above covers new DBs.
  // These ALTERs are no-ops if the column already exists (SQLite ignores "duplicate column").
  const commodity9Cols = [
    "vix", "sp500", "shanghai_comp", "hang_seng", "dxy",
    "cny_vnd_rate", "copper_usd", "silver_usd_per_oz", "jpy_vnd_rate",
  ];
  for (const col of commodity9Cols) {
    try { db.exec(`ALTER TABLE commodity_prices ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE commodity_prices_history ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
  }
```

Place this block immediately after the `idx_cph_source_fetched` index creation (line 397).

---

## File 3: `src/domain/services/cascadeEngine.ts`

### Edit — MacroContext interface (line 96, FR-7 interface)

Append 4 new fields after `usdVndOfficial`:
```typescript
  /** SBV official USD/VND exchange rate. */
  usdVndOfficial: number | null;
  // ── new risk-off fields (sprint 188, FR-7) ─────────────────────────────────
  /** CBOE Volatility Index. null = data unavailable, cascade rules skip. */
  vix: number | null;
  /** S&P 500 index level. null = data unavailable, cascade rules skip. */
  sp500: number | null;
  /** US Dollar Index (DXY). null = data unavailable, cascade rules skip. */
  dxy: number | null;
  /** Hang Seng index level. null = data unavailable, cascade rules skip. */
  hangSeng: number | null;
```

**Zero infrastructure imports** — this file touches only the interface declaration. No import changes required.

---

## File 4: `src/application/usecases/runImpactChain.ts`

### Edit — MacroContext assembly (lines 138-145, FR-7 wiring)

Replace:
```typescript
  const macroContext: MacroContext = {
    brentCrudeUSD: commodity?.brentCrudeUSD ?? null,
    goldUSDPerOz: commodity?.goldUSDPerOz ?? null,
    usdVndMarket: commodity?.usdVndRate ?? null,
    refinancingRatePct: sbv?.refinancingRatePct ?? null,
    overnightRatePct: sbv?.overnightRatePct ?? null,
    usdVndOfficial: sbv?.usdVndOfficial ?? null,
  };
```

With:
```typescript
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
```

---

## Also update: `src/__tests__/025-yahoo-finance.test.ts`

The existing YF-09 and YF-10 tests create inline schemas with only 3 data columns. After GREEN, `storeCommoditySnapshot` binds 13 values — these tests will throw "table has 5 columns but 14 values supplied" (5 = source + 3 cols + fetched_at). Must update both inline schemas to add the 9 new columns.

**Edit YF-09 and YF-10** (both have identical inline schemas): add the 9 new columns to both `commodity_prices` and `commodity_prices_history` table definitions in the `db.exec(...)` call. Pattern:

```sql
-- add after usd_vnd_rate line, before fetched_at, in both table CREATE statements:
vix               REAL NOT NULL DEFAULT 0,
sp500             REAL NOT NULL DEFAULT 0,
shanghai_comp     REAL NOT NULL DEFAULT 0,
hang_seng         REAL NOT NULL DEFAULT 0,
dxy               REAL NOT NULL DEFAULT 0,
cny_vnd_rate      REAL NOT NULL DEFAULT 0,
copper_usd        REAL NOT NULL DEFAULT 0,
silver_usd_per_oz REAL NOT NULL DEFAULT 0,
jpy_vnd_rate      REAL NOT NULL DEFAULT 0,
```

Do the same for YF-12a.

---

## Validation sequence

```bash
# 1. Type check (must be clean)
bun tsc --noEmit

# 2. New tests pass
bun test src/__tests__/1487-yahoo-finance-extended.test.ts

# 3. Existing tests not broken (focus on affected file)
bun test src/__tests__/025-yahoo-finance.test.ts

# 4. Full suite baseline (must be >= 5629)
bun test --bail 1
```

## Commit (single atomic commit — BOTH schema.ts + yahooFinance.ts)

```
feat(1488): GREEN — expand Yahoo fetcher 3→12 symbols, schema 9 new cols, MacroContext risk-off wiring
```

Branch: `task/1487-yahoo-extended-green`

---

## [Architect] Brownfield Findings

interfaces_found:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/yahooFinance.ts` — REUSE `fetchSymbolPrice` helper, `symbolAwareClient` pattern from 025 tests
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/cascadeEngine.ts` — REUSE `MacroContext` interface — additive extension only
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/runImpactChain.ts` — REUSE `commodity?.field ?? null` assembly pattern

interfaces_to_create:
- none — all changes are additive extensions to existing interfaces

decisions:
- "No tracked_indicators mirror for copper/silver in sprint 188 — deferred"
- "No market_prices mirror for VIX/DXY/indices — index levels not tradable prices"
- "Idempotent ALTER TABLE block added to schema.ts for production DB migration — no separate migration script"
- "schema.ts + yahooFinance.ts must ship in same commit"

brownfield_scan_clean: true
