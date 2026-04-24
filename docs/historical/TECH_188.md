# TECH-188: feat(yahoo-extended): Expand Commodity Fetcher 3 → 12 Symbols

status: APPROVED_BY_ARCHITECT
req_ref: REQ-188

## Brownfield Impact

- Files modified:
  - `src/infrastructure/fetchers/yahooFinance.ts` — SYMBOLS, CommoditySnapshot, allSettled, snapshot literal, storeCommoditySnapshot
  - `src/infrastructure/db/schema.ts` — commodity_prices + commodity_prices_history DDL
  - `src/domain/services/cascadeEngine.ts` — MacroContext interface (4 new fields)
  - `src/application/usecases/runImpactChain.ts` — MacroContext assembly (4 new assignments)
- Files created: `src/__tests__/1487-yahoo-finance-extended.test.ts`
- Files deleted: none
- Breaking changes: no — additive only. New DB columns carry `DEFAULT 0`; existing 3-field consumers compile and run unchanged.

## Architecture Decision

Extend the existing 3-symbol Yahoo Finance fetcher additively: same `fetchSymbolPrice` helper, same `Promise.allSettled` concurrency pattern, same partial-failure semantics (field = 0 on individual error, null only when ALL fields are 0). The 9 new fields are appended to `CommoditySnapshot` without changing existing field order or semantics. MacroContext gains 4 of the 9 new fields (VIX, S&P500, DXY, Hang Seng) — the other 5 land in the DB but are not yet wired to cascade rules, consistent with the incremental approach of adding data before rules.

`schema.ts` and `yahooFinance.ts` ship in the same commit to prevent column-count mismatch between the `storeCommoditySnapshot` prepared statement and the table DDL (stated as critical deploy constraint in REQ-188).

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| SYMBOLS map (9 new entries) | infrastructure | `src/infrastructure/fetchers/yahooFinance.ts:51` | MODIFY |
| CommoditySnapshot interface (9 new fields) | infrastructure | `src/infrastructure/fetchers/yahooFinance.ts:70` | MODIFY |
| Promise.allSettled block (3 → 12) | infrastructure | `src/infrastructure/fetchers/yahooFinance.ts:211` | MODIFY |
| Snapshot object literal (12 fields) | infrastructure | `src/infrastructure/fetchers/yahooFinance.ts:241` | MODIFY |
| storeCommoditySnapshot INSERT (12 columns) | infrastructure | `src/infrastructure/fetchers/yahooFinance.ts:272` | MODIFY |
| commodity_prices DDL (9 new cols) | infrastructure | `src/infrastructure/db/schema.ts:379` | MODIFY |
| commodity_prices_history DDL (9 new cols) | infrastructure | `src/infrastructure/db/schema.ts:387` | MODIFY |
| MacroContext interface (4 new fields) | domain | `src/domain/services/cascadeEngine.ts:96` | MODIFY |
| MacroContext assembly (4 new assignments) | application | `src/application/usecases/runImpactChain.ts:138` | MODIFY |
| TDD test file | test | `src/__tests__/1487-yahoo-finance-extended.test.ts` | NEW |

## Interface Contracts

### CommoditySnapshot extension

```typescript
// src/infrastructure/fetchers/yahooFinance.ts:70
export interface CommoditySnapshot {
  // existing — unchanged
  brentCrudeUSD: number;
  goldUSDPerOz: number;
  usdVndRate: number;
  fetchedAt: string;
  // new — 9 fields, default 0 on individual fetch failure
  vix: number;
  sp500: number;
  shanghaiComp: number;
  hangSeng: number;
  dxy: number;
  cnyVndRate: number;
  copperUSD: number;
  silverUSDPerOz: number;
  jpyVndRate: number;
}
```

### SYMBOLS extension

```typescript
// src/infrastructure/fetchers/yahooFinance.ts:51
const SYMBOLS = {
  // existing
  brent:  "BZ=F",
  gold:   "GC=F",
  usdVnd: "USDVND=X",
  // new (9 symbols)
  vix:      "^VIX",
  sp500:    "^GSPC",
  shanghai: "000001.SS",   // 15-min delay on Yahoo free tier — acceptable
  hangSeng: "^HSI",
  dxy:      "DX-Y.NYB",   // NYB venue; 0 stored if unresolvable
  cnyVnd:   "CNHVND=X",   // offshore CNH/VND; low liquidity
  copper:   "HG=F",
  silver:   "SI=F",
  jpyVnd:   "JPYVND=X",
} as const;
```

### MacroContext extension (domain — zero infra imports)

```typescript
// src/domain/services/cascadeEngine.ts:96 — append after usdVndOfficial
export interface MacroContext {
  brentCrudeUSD: number | null;
  goldUSDPerOz: number | null;
  usdVndMarket: number | null;
  refinancingRatePct: number | null;
  overnightRatePct: number | null;
  usdVndOfficial: number | null;
  // new — null = data unavailable, cascade rules skip
  vix: number | null;
  sp500: number | null;
  dxy: number | null;
  hangSeng: number | null;
}
```

### MacroContext assembly (application)

```typescript
// src/application/usecases/runImpactChain.ts:138 — extend object literal
const macroContext: MacroContext = {
  brentCrudeUSD:      commodity?.brentCrudeUSD ?? null,
  goldUSDPerOz:       commodity?.goldUSDPerOz ?? null,
  usdVndMarket:       commodity?.usdVndRate ?? null,
  refinancingRatePct: sbv?.refinancingRatePct ?? null,
  overnightRatePct:   sbv?.overnightRatePct ?? null,
  usdVndOfficial:     sbv?.usdVndOfficial ?? null,
  // new
  vix:      commodity?.vix ?? null,
  sp500:    commodity?.sp500 ?? null,
  dxy:      commodity?.dxy ?? null,
  hangSeng: commodity?.hangSeng ?? null,
};
```

### storeCommoditySnapshot SQL (infrastructure)

**upsertLatest** prepared statement — replace existing 5-column INSERT:
```sql
INSERT OR REPLACE INTO commodity_prices
  (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at,
   vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate, copper_usd, silver_usd_per_oz, jpy_vnd_rate)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**appendHistory** — same 14 columns. Binding order: `SOURCE, snapshot.*12fields, snapshot.fetchedAt, SOURCE, snapshot.fetchedAt` (dedup WHERE clause).

### Schema DDL extension

9 columns added to both tables after `usd_vnd_rate`, before `fetched_at`:
```sql
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

`CREATE TABLE IF NOT EXISTS` — existing production DB rows fill DEFAULT 0 automatically on schema load. No migration script required.

## Architect Decisions on Open Questions

| Open item (REQ-188 §Implementation Notes) | Decision |
|------------------------------------------|----------|
| `tracked_indicators` mirror for copper/silver | Out of scope sprint 188 — deferred. Futures prices are candidates same as brent/gold. New sprint. |
| `market_prices` mirror for new symbols | VIX, DXY, indices are not tradable prices — do NOT mirror via `upsertMacroPrice`. Copper/silver deferred. No change to existing mirror block. |
| `000001.SS` 15-min delay | Acceptable — stored as-is. Comment added in SYMBOLS map. |
| `DX-Y.NYB` if unresolvable | `fetchSymbolPrice` returns null → `dxy = 0` → `MacroContext.dxy = null` → cascade rules skip. No special handling. |
| `CNHVND=X` low liquidity | Same null-guard. `cnyVndRate` not wired to MacroContext — DB only. |

## Task Breakdown

| Task | Phase | Deliverable | Depends on |
|------|-------|-------------|------------|
| 1487 | RED | `src/__tests__/1487-yahoo-finance-extended.test.ts` — 7 failing assertions | — |
| 1488 | GREEN | All FR-1→FR-7 across 4 files, single atomic commit | 1487 RED |

**Deploy constraint**: 1488 GREEN commit MUST include both `schema.ts` and `yahooFinance.ts`. Split commits break `storeCommoditySnapshot` column binding count on first cycle.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `DX-Y.NYB` unresolvable on Yahoo free tier | Medium | Low | 0 stored, `dxy` null in MacroContext, cascade rules skip — no code change |
| `CNHVND=X` frequent 0 (low liquidity) | High | Low | Same null-guard; not in MacroContext; DB-only |
| `000001.SS` URL encoding differs from `=`-suffix symbols | Low | Medium | `symbolAwareClient` in tests uses `url.includes(symbol)` literal match — covers this case |
| Existing YF-09/YF-10 tests break (inline schema has only 3 cols) | Medium | High | GREEN task updates inline DB schemas in 025 test file to add 9 columns + extended bindings |
| `bun tsc --noEmit` fails on MacroContext consumers | Low | Medium | Only `runImpactChain.ts` assembles MacroContext — additive extension, no destructuring breakage |
| Staggered deploy (schema.ts committed alone) | Low | High | Single-commit deploy rule enforced in task handoff — both files in same commit |

## Security Review

- SQL parameterized: yes — all 9 new bindings use `?` placeholders; no string interpolation
- File paths validated: n/a
- External HTTP rate-limited: yes — same per-symbol 30s timeout, `Promise.allSettled` prevents cascade failure; 12 concurrent calls to same Yahoo host
- Secrets via Bun.env only: yes — `YAHOO_FINANCE_API_URL` override pattern unchanged
