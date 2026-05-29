<!-- size-justification: multi-zone 4-bug design; DDD layer per bug; DI seam specs; SQL patterns; risk flags; per-zone dev routing -->

# DPI-ARCH — Architect Handoff: DATA-PIPELINE-INTEGRITY

**Sprint:** DATA-PIPELINE-INTEGRITY | **Author:** architect | **Date:** 2026-05-30
**BA Spec:** `docs/REQ_DATA-PIPELINE-INTEGRITY.md`

---

## [Architect] Brownfield Findings

### Zone

**Multi-zone — PM must split into two parallel dev subtasks:**

| Zone | Developer | Bugs |
|------|-----------|------|
| `apps/macro-indicators/` | dev-macro-indicators | DPI-1, DPI-2 |
| `apps/mcp-server/` | dev-mcp-server | DPI-3, DPI-4 |

> DPI-3 fix lives in mcp-server (write seam). DPI-1 surface fix lives in macro-indicators.
> Both zones can execute in parallel — no shared code, no write-back coupling.

---

### Verified Paths

**Zone A — apps/macro-indicators/**

- `apps/macro-indicators/pkg/domain/ports.go:18-23` — `SBVRatePort` interface with `GetRate(ctx, from, to)` already declared. Port is wired in usecases.go but adapter is fixture-only.
- `apps/macro-indicators/pkg/infrastructure/repositories.go:88-112` — `SBVRateRepository` (fixture stub). Hardcoded `"USD/VND": 24500.0`. This is the adapter to replace/extend.
- `apps/macro-indicators/pkg/infrastructure/repositories.go:195-315` — `SQLiteCommodityRepository` — canonical pattern for a live SQLite read adapter. New `SBVRateSQLiteAdapter` must follow this exact pattern (DB_PATH env, read-only open, staleness guard, safe-degrade to 0).
- `apps/macro-indicators/pkg/application/usecases.go:44-45` — `const fixtureComputedAt = "2026-05-23T00:00:00Z"` — hardcoded constant targeted by DPI-2.
- `apps/macro-indicators/pkg/application/usecases.go:108-117` — both `CarryTrade.ComputedAt` and `YieldSpread.ComputedAt` fields receive `fixtureComputedAt` directly. Both assignments are in `Execute()` scope.
- `apps/macro-indicators/pkg/application/usecases.go:100` — `resolveMarketPrices()` returns `usdVnd` from `CommodityFetcherPort`; this is where USDVND lands in the snapshot response. DPI-1 routes through `SBVRatePort` not `CommodityFetcherPort` — see design decision below.
- `apps/macro-indicators/cmd/server/main.go:51` — `sbvRateRepo := infrastructure.NewSBVRateRepository()` — DI wiring point for DPI-1. One line change.
- `apps/macro-indicators/pkg/application/usecases_test.go` — existing tests use `stubSBVRate{}` returning 0 (triggers fixture fallback). No test asserts on `fixtureComputedAt` value directly — but confirm before change.

**Zone B — apps/mcp-server/**

- `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts:409-415` — `upsertMacroPrice` prepared statement. Hardcodes `change_amt=0, change_pct=0` and ON CONFLICT does NOT update those columns. Confirmed by code read.
- `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts:418-428` — `appendHistory` dedup guard: `strftime('%Y-%m-%d %H', fetched_at)` — hour-level dedup. Confirmed safe; no multiple rows per hour in history.
- `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts:430-499` — `runTransaction()` — BRENT and GOLD are upserted at L469-473. USDVND is NOT mirrored via `upsertMacroPrice` (correct; excluded per FR-DPI-3d).
- `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts:30-37` — UPDATE-only SQL. Confirmed single-file, single-function fix.
- `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts:163-180` — PRIMARY OHLCV write path: `INSERT INTO daily_ohlcv ... ON CONFLICT(code, date) DO UPDATE SET high=MAX(...), low=MIN(...), close=..., volume=..., updated_at=...`. Critically: ON CONFLICT branch does NOT touch `foreign_buy_vol`, `foreign_sell_vol`, `foreign_net_vol`, `put_through_vol`. Safe for DPI-4 stub-row race.
- `apps/mcp-server/src/interface/mcp/server.ts:1077-1080` — Secondary OHLCV path: `INSERT OR REPLACE INTO daily_ohlcv` — this is a FULL REPLACE (not partial UPDATE), so a stub row inserted by DPI-4 fix WILL be overwritten on conflict, preserving all columns not in the INSERT list as their defaults. See DPI-4 race risk flag below.
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:90-107` — `daily_ohlcv` schema confirmed: `(code, date) PRIMARY KEY`, OHLCV columns are `NOT NULL DEFAULT 0` except `close NOT NULL` (no default). Foreign flow columns (`foreign_buy_vol`, `foreign_sell_vol`, `foreign_net_vol`, `put_through_vol`) are `REAL` nullable (no NOT NULL, no DEFAULT). Stub row needs explicit `NULL` or `0` for OHLCV columns — see design below.

---

### Design Decisions

#### DPI-1 — FX Canonical Source: OPTION A (canonical, SBV official)

**Decision: Option A.** Both surfaces read SBV official USDVND. No source attribution label.

**Rationale:** `feedback_data_sources_vn` — SBV official is policy-correct for VN market. Yahoo Finance USDVND is offshore/global; the 140-VND gap (26255 vs 26115) is a known structural divergence. Tagging (Option B) would expose the divergence to consumers who can't act on it. Canonical source convergence is cleaner and correct.

**How it routes through the existing DI contract:**

The `usdVnd` field in `MacroSnapshotResponse` is currently populated by `CommodityFetcherPort.FetchPrices()["USDVND"]`, which in live mode reads `commodity_prices WHERE source='yahoo'` (returns 26255). The `SBVRatePort.GetRate("USD","VND")` is injected but returns fixture 24500 — its result is NOT wired into `USDVnd` in the response today (it's unused by `Execute()`).

**The fix has two parts:**

1. **New `SBVRateSQLiteAdapter` in `repositories.go`** (infrastructure layer) — reads `sbv_rates.usd_vnd_official WHERE source=<canonical>` from the shared `market.db`. Pattern: identical to `SQLiteCommodityRepository` (DB_PATH env, read-only open, staleness guard). Staleness bound: 6h (SBV refresh runs every 4h; +2h tolerance).

2. **`Execute()` in `usecases.go`** — after `resolveMarketPrices()` populates `usdVnd` from CommodityFetcher, if `SBVRatePort.GetRate(ctx, "USD", "VND")` returns a positive value, REPLACE `usdVnd` with it. This gives SBV priority over Yahoo for the USDVND field while preserving the OIL and GOLD values from the commodity path.

   Concretely, add ~4 lines after `resolveMarketPrices()`:
   ```go
   if uc.sbvRate != nil {
       if r, err := uc.sbvRate.GetRate(ctx, "USD", "VND"); err == nil && r > 0 {
           usdVnd = r
       }
   }
   ```

3. **DI wiring in `cmd/server/main.go:51`** — replace `infrastructure.NewSBVRateRepository()` with `infrastructure.NewSBVRateSQLiteAdapter()`. One line.

**FR-DPI-1c satisfied:** no new HTTP calls. The `sbv_rates` table is populated by mcp-server's `sbvRatesRefresh` cron (existing, healthy).

**Safe-degrade:** if `sbv_rates` is absent or empty, `SBVRateSQLiteAdapter.GetRate` returns `(0, nil)` — the `r > 0` guard keeps the Yahoo value instead. No error, no panic.

---

#### DPI-2 — Carry/Yield ComputedAt: Replace constant with `time.Now()`

**Decision: Inline timestamp at Execute() call site — do not introduce a new parameter or field.**

The `fixtureComputedAt` constant is used in exactly one place: `Execute()` in `usecases.go` at the input struct literal. The fix is:

```go
// BEFORE:
const fixtureComputedAt = "2026-05-23T00:00:00Z"
// used as:
CarryTrade: carry.CarryTradeInput{..., ComputedAt: fixtureComputedAt},
YieldSpread: yld.YieldSpreadInput{..., ComputedAt: fixtureComputedAt},

// AFTER (delete the const; add one var in Execute body):
computedAt := time.Now().UTC().Format(time.RFC3339)
// used as:
CarryTrade: carry.CarryTradeInput{..., ComputedAt: computedAt},
YieldSpread: yld.YieldSpreadInput{..., ComputedAt: computedAt},
```

`time` is already imported in `usecases.go` (used by `fetchedAt := time.Now().UTC()` at L124). No new import.

**DDD layer: Application.** The constant lives in the application use-case — its replacement stays in the application layer. No domain or infrastructure change.

**Test update required:** `usecases_test.go` — search for any assertion on `"2026-05-23T00:00:00Z"`. Current scan shows no such assertion exists in the test file (tests only assert on VNIndex and commodity prices). Confirm before commit; if found, update to accept any valid RFC3339 pattern (e.g. `strings.HasPrefix(computedAt, "202")`).

---

#### DPI-3 — Brent/Gold Delta: prev-close lookup inside transaction

**Decision: Pre-transaction read of prev-close; inline delta computation; update both INSERT and ON CONFLICT branches.**

**SQL for prev-close lookup (BEFORE the transaction, separate read):**

```typescript
// Read prev-close for each commodity BEFORE the transaction.
// Use the most recent history row BEFORE the current snapshot's fetched_at.
// ORDER BY fetched_at DESC LIMIT 1 skips current hour row because dedup guard
// already prevents a second same-hour append — the most recent history row IS
// the prior tick. If history is empty, returns null (tolerated per FR-DPI-3c).
const prevBrent: number | null = db.prepare(`
  SELECT brent_crude_usd FROM commodity_prices_history
  WHERE source = 'yahoo' AND fetched_at < ?
  ORDER BY fetched_at DESC LIMIT 1
`).get(snapshot.fetchedAt)?.brent_crude_usd ?? null;

const prevGold: number | null = db.prepare(`
  SELECT gold_usd_per_oz FROM commodity_prices_history
  WHERE source = 'yahoo' AND fetched_at < ?
  ORDER BY fetched_at DESC LIMIT 1
`).get(snapshot.fetchedAt)?.gold_usd_per_oz ?? null;
```

**Why pre-transaction read is cleaner:** SQLite allows reads inside a write transaction, but a separate pre-read avoids holding the write lock while doing the SELECT. Given Bun SQLite's single-writer model this makes no practical difference, but it keeps the transaction body write-only (better DDD readability).

**Updated `upsertMacroPrice` statement:**

```sql
INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
VALUES (?, ?, ?, ?, 0, ?)
ON CONFLICT(code) DO UPDATE SET
  price      = excluded.price,
  change_amt = excluded.change_amt,
  change_pct = excluded.change_pct,
  updated_at = excluded.updated_at
```

**Delta computation (TypeScript, before `runTransaction`):**

```typescript
function computeDelta(current: number | null, prev: number | null): { amt: number; pct: number } {
  if (current == null || prev == null || prev === 0) return { amt: 0, pct: 0 };
  const amt = current - prev;
  const pct = (amt / prev) * 100;
  return { amt, pct };
}
const brentDelta = computeDelta(snapshot.brentCrudeUSD, prevBrent);
const goldDelta  = computeDelta(snapshot.goldUSDPerOz, prevGold);
```

**Call sites in transaction (replace L469-473):**

```typescript
if (snapshot.brentCrudeUSD != null) {
  upsertMacroPrice.run("BRENT", snapshot.brentCrudeUSD, brentDelta.amt, brentDelta.pct, snapshot.fetchedAt);
}
if (snapshot.goldUSDPerOz != null) {
  upsertMacroPrice.run("GOLD", snapshot.goldUSDPerOz, goldDelta.amt, goldDelta.pct, snapshot.fetchedAt);
}
```

**File: `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts`**
Scope: `storeCommoditySnapshot()` function only. No schema change.

---

#### DPI-4 — Foreign-Flow UPSERT: replace UPDATE-only with INSERT…ON CONFLICT

**Decision: INSERT…ON CONFLICT(code, date) UPSERT. Stub rows have explicit 0-defaults for OHLCV required columns.**

**Confirmed schema analysis:**
- `daily_ohlcv.open, high, low, volume` = `REAL NOT NULL DEFAULT 0` → safe if omitted from INSERT column list (SQLite uses DEFAULT).
- `daily_ohlcv.close` = `REAL NOT NULL` with **no DEFAULT** → MUST be included in stub INSERT or will fail NOT NULL constraint.
- `daily_ohlcv.updated_at` = `TEXT NOT NULL DEFAULT ''` → safe if omitted.
- Foreign flow columns = `REAL` nullable → no constraint issue.

**Replacement SQL:**

```sql
INSERT INTO daily_ohlcv (code, date, close, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol)
VALUES (?, ?, 0, ?, ?, ?, ?)
ON CONFLICT(code, date) DO UPDATE SET
  foreign_buy_vol  = excluded.foreign_buy_vol,
  foreign_sell_vol = excluded.foreign_sell_vol,
  foreign_net_vol  = excluded.foreign_net_vol,
  put_through_vol  = excluded.put_through_vol
```

`close = 0` satisfies the NOT NULL constraint on stub rows. When the real OHLCV row arrives later, the primary write path (`pushPricesHandler.ts:163-172` ON CONFLICT branch) updates `high, low, close, volume, updated_at` — it does NOT touch foreign flow columns, so the stub's foreign flow values survive.

**Race condition analysis (CRITICAL — DPI-4 vs server.ts secondary OHLCV path):**

`server.ts:1077-1080` uses `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)`. INSERT OR REPLACE performs a DELETE + INSERT when a conflict is found. If a stub row exists (foreign flow populated, close=0), INSERT OR REPLACE will DELETE the stub row (losing the foreign flow values) then INSERT fresh OHLCV data with NULL foreign flow columns.

**Risk: CONFIRMED.** The secondary path at `server.ts:1078` is a row-destructive write that will silently wipe foreign flow from DPI-4 stub rows.

**Resolution:** dev-mcp-server must also change `server.ts:1077-1080` from `INSERT OR REPLACE` to an `ON CONFLICT(code, date) DO UPDATE SET` that preserves foreign flow columns:

```sql
INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(code, date) DO UPDATE SET
  open       = excluded.open,
  high       = excluded.high,
  low        = excluded.low,
  close      = excluded.close,
  volume     = excluded.volume,
  updated_at = excluded.updated_at
  -- foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol: NOT updated (preserve stub values)
```

The `ohlcvBackfill.ts:145` path uses `INSERT OR IGNORE` — safe (skips if row exists; won't destroy stub data). `taOhlcvBackfillJob.ts:108` uses `INSERT OR REPLACE` — same risk as server.ts secondary path; dev-mcp-server should audit and apply same fix.

**JSDoc update required:** `ohlcvForeignFlowStore.ts` module comment and function JSDoc must be updated to reflect UPSERT behavior per FR-DPI-4d.

**File: `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts`** (primary fix)
**File: `apps/mcp-server/src/interface/mcp/server.ts:1077-1080`** (secondary — race fix)
**File: `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts:108`** (audit + fix if INSERT OR REPLACE)

---

### Reuse Patterns

- Extend `SBVRateRepository` → `SBVRateSQLiteAdapter` (same file `repositories.go`). Do NOT create a new file — keeps Fence-C clean (only main.go imports infrastructure).
- `fetchCommodityPricesFromDB` is the extraction pattern for testability — `SBVRateSQLiteAdapter` should expose a `fetchSBVRateFromDB(ctx, db, staleBound)` inner function for the same reason.
- `computeDelta()` helper in `yahooFinance.ts` should be a module-private function (not exported) — no new port/interface needed.

---

### DDD Layer Assignment per Bug

| Bug | DDD Layer | Rationale |
|-----|-----------|-----------|
| DPI-1 | Infrastructure (new adapter) + Application (port dispatch patch ~4 lines) | Adapter is infra; SBV priority logic is application orchestration |
| DPI-2 | Application | Constant-to-timestamp in use-case; no infra change |
| DPI-3 | Infrastructure (mcp-server write adapter) | DB write seam; no domain model change |
| DPI-4 | Infrastructure (mcp-server DB store + secondary write path) | Storage strategy change; no domain model change |

No domain layer changes in any bug. No new ports. No new microservice HTTP calls.

---

### Rebuild Order (confirmed)

1. **mcp-server FIRST** — DPI-3 writes fresh `change_pct` to `market_prices`; DPI-4 enables foreign flow stub rows.
2. **macro-indicators SECOND** — DPI-1 reads from `sbv_rates` (written by mcp-server cron, already running); DPI-2 timestamps are computed in-process.

Both in one ops pass. Soft ordering only — no hard blocking, but mcp-server first ensures the delta data is available when macro-indicators first serves a request post-restart.

---

### Risk Flags

**R-1 (CRITICAL) — DPI-4 INSERT OR REPLACE race in server.ts:**
`server.ts:1078` `INSERT OR REPLACE` is row-destructive. Stub rows from the DPI-4 UPSERT will be silently wiped when the secondary OHLCV write fires. This must be fixed in the same dev-mcp-server task or DPI-4 will show intermittent data loss (data appears briefly then disappears on next OHLCV push).

**R-2 (MEDIUM) — DPI-3 prev-close on first run:**
If `commodity_prices_history` has fewer than 2 rows on rebuild day, `prevBrent` / `prevGold` will be `null` → delta written as `0`. This is per-spec acceptable (AC-DPI-3 allows zero delta on first run). The next daily tick (06:00 UTC) will produce non-zero delta. No action needed; document in code comment.

**R-3 (LOW) — DPI-1 SBV staleness window:**
`sbv_rates` has a `NOT NULL DEFAULT 0` on `usd_vnd_official`. If the SBV refresh cron has not yet run post-rebuild (or the row is 0 from a fresh schema), `GetRate` returns 0 → `r > 0` guard uses Yahoo value (26255) as fallback. This is correct safe-degrade behavior — not a bug, but the first post-rebuild probe may show Yahoo value until SBV cron fires. Document in code comment.

**R-4 (LOW) — DPI-2 test assertion check:**
Current usecases_test.go does not assert on `computedAt` value. Dev must grep for `"2026-05-23"` in test files before removing the constant; if any assertion exists, update it to a regex/prefix match.

**R-5 (LOW) — taOhlcvBackfillJob.ts INSERT OR REPLACE:**
Same destructive pattern as server.ts secondary path. Likely runs on demand (backfill), not on every tick. Dev-mcp-server must audit and fix to match the pushPricesHandler ON CONFLICT pattern.

---

### Standard Detection

```
Classify task against apps/ directory:
  BUG-FIX / REFACTOR (in-zone, no new primitives) — 4 confirmed bugs:
    → BUILD-STANDARD: not-applicable (skip)
    → No new service, no new port, no relay required beyond dev routing.
```

---

### Scan Clean

Scan clean: true. No DDD violations detected. No new cross-service HTTP dependencies introduced. All fixes are read-from-DB or write-to-DB within existing adapter patterns.

---

## Implementation Approach Summary (PM briefing)

| Bug | File(s) | Change size | DDD layer | Dev zone |
|-----|---------|-------------|-----------|----------|
| DPI-1 | `repositories.go` (new `SBVRateSQLiteAdapter`) + `usecases.go` (~4 lines) + `main.go` (1 line) | ~60 lines new adapter + ~6 lines change | Infrastructure + Application | dev-macro-indicators |
| DPI-2 | `usecases.go` (delete const, add var in Execute) | ~2 lines | Application | dev-macro-indicators |
| DPI-3 | `yahooFinance.ts` (storeCommoditySnapshot — pre-read + delta + updated SQL) | ~25 lines change | Infrastructure | dev-mcp-server |
| DPI-4 | `ohlcvForeignFlowStore.ts` (SQL replace + JSDoc) + `server.ts:1078` (INSERT OR REPLACE → ON CONFLICT) + `taOhlcvBackfillJob.ts` (audit) | ~15 lines + 2 file audits | Infrastructure | dev-mcp-server |

**Parallel dev confirmed.** No file shared between zones.

---

## RETURN

```
DONE: Technical design complete, brownfield findings written to docs/handoffs/DPI-ARCH.md
ZONE: multi — apps/macro-indicators/ (DPI-1, DPI-2) + apps/mcp-server/ (DPI-3, DPI-4)
NEXT: pm | break into per-zone atomic tasks; route DPI-1+DPI-2 to dev-macro-indicators; DPI-3+DPI-4 to dev-mcp-server; include R-1 race fix (server.ts INSERT OR REPLACE) in DPI-4 scope
HANDOFF: docs/handoffs/DPI-ARCH.md
PIPELINE: continue
```
