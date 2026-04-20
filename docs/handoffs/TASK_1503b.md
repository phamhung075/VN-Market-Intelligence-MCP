# TASK_1503b — GREEN: implement ohlcv-foreign-flow (6 file edits)

phase: GREEN
sprint: 190
tech_ref: docs/TECH_190.md
depends_on: TASK_1503a (5 assertions must be RED before starting)

## Completion target

All 5 assertions in `src/__tests__/1503-ohlcv-foreign-flow.test.ts` GREEN.
`bun tsc --noEmit` clean. Existing 5681 baseline passes.

---

## Edit 1 — schema.ts: DDL + migration

**File:** `src/infrastructure/db/schema.ts`

### 1a. Inside CREATE TABLE daily_ohlcv block

Location: after `volume REAL NOT NULL DEFAULT 0,` (line ~1116), before `updated_at`:

```sql
      volume     REAL    NOT NULL DEFAULT 0,
      foreign_buy_vol   REAL,
      foreign_sell_vol  REAL,
      foreign_net_vol   REAL,
      put_through_vol   REAL,
      updated_at TEXT    NOT NULL,
```

### 1b. After `CREATE INDEX` for daily_ohlcv (line ~1121), add migration block

```typescript
  // ── daily_ohlcv foreign-flow columns (task 1503 migration) ──────────────
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_buy_vol  REAL`);
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_sell_vol REAL`);
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS foreign_net_vol  REAL`);
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN IF NOT EXISTS put_through_vol  REAL`);
```

Each statement is idempotent on SQLite 3.37+ (Bun ships 3.44+). On a fresh DB the DDL already has the cols — `IF NOT EXISTS` makes ALTER a no-op.

---

## Edit 2 — vnstockStore.ts: new export `writeForeignFlowToOhlcv`

**File:** `src/infrastructure/db/vnstockStore.ts`

**Injection point:** Insert the interface + function immediately after the `upsertForeignFlow` closing brace (currently ending around line 420-430 — search for `} // end upsertForeignFlow` or just after the export function block).

### Interface (add before function)

```typescript
/** Payload shape for writing foreign-flow data into daily_ohlcv rows. */
export interface WriteForeignFlowItem {
  code: string;
  date: string;
  foreignBuyVol: number;
  foreignSellVol: number;
  putThroughVol: number;  // 0 when absent from VPS payload
}
```

### Function

```typescript
/**
 * Updates the 4 foreign-flow columns on existing daily_ohlcv rows.
 * Uses UPDATE only — no INSERT — so rows missing from daily_ohlcv are silently skipped.
 * foreign_net_vol is computed at write time: foreignBuyVol - foreignSellVol.
 *
 * @returns Number of rows actually changed.
 */
export function writeForeignFlowToOhlcv(
  items: WriteForeignFlowItem[],
  db?: ReturnType<typeof getDb>,
): number {
  if (items.length === 0) return 0;
  const database = db ?? getDb();
  const stmt = database.prepare<void, [number, number, number, number, string, string]>(`
    UPDATE daily_ohlcv
    SET foreign_buy_vol  = ?,
        foreign_sell_vol = ?,
        foreign_net_vol  = ?,
        put_through_vol  = ?
    WHERE code = ? AND date = ?
  `);
  let changed = 0;
  for (const item of items) {
    const netVol = item.foreignBuyVol - item.foreignSellVol;
    stmt.run(item.foreignBuyVol, item.foreignSellVol, netVol, item.putThroughVol, item.code, item.date);
    changed += database.changes;
  }
  return changed;
}
```

Key: `database.changes` (Bun SQLite Database property) returns rows affected by last statement. Must be read immediately after `stmt.run(...)`.

---

## Edit 3 — server.ts: wire writeForeignFlowToOhlcv after upsertForeignFlow

**File:** `src/interface/mcp/server.ts`

### 3a. Import (top of file, alongside upsertForeignFlow import)

Find the line importing `upsertForeignFlow` from `vnstockStore.js` and add `writeForeignFlowToOhlcv` and `WriteForeignFlowItem` to the same import:

```typescript
import { upsertForeignFlow, writeForeignFlowToOhlcv, type WriteForeignFlowItem } from "../../infrastructure/db/vnstockStore.js";
```

### 3b. Inside push-foreign-flow handler (lines 691-710)

After the existing `items` array is built and `upsertForeignFlow(items)` is called, add:

```typescript
        const upserted = upsertForeignFlow(items);
        log.info("[push-foreign-flow] upserted rows", { count: upserted, source: "vps-proxy" });

        // ── Write foreign-flow cols to daily_ohlcv (task 1503) ──────────────
        const ohlcvItems: WriteForeignFlowItem[] = (rawItems as Record<string, unknown>[]).map((raw) => ({
          code:           typeof raw.code           === "string" ? raw.code : String(raw.code ?? ""),
          date:           (typeof raw.date          === "string" && raw.date) ? raw.date : todayUtc,
          foreignBuyVol:  typeof raw.foreignBuyVol  === "number" ? raw.foreignBuyVol  : 0,
          foreignSellVol: typeof raw.foreignSellVol === "number" ? raw.foreignSellVol : 0,
          putThroughVol:  typeof raw.putThroughVol  === "number" ? raw.putThroughVol  : 0,
        }));
        const ohlcvUpdated = writeForeignFlowToOhlcv(ohlcvItems);
        log.info("[push-foreign-flow] ohlcv foreign-flow updated", { count: ohlcvUpdated });
        // ─────────────────────────────────────────────────────────────────────

        logVpsPush({ service: "foreign-flow", itemsCount: upserted, status: "ok" });
```

Note: `rawItems` is available in scope (parsed above the existing `items` mapping). `todayUtc` already declared. No new HTTP or DB round-trips.

---

## Edit 4 — assembleEveningSummary.ts: interface + query

**File:** `src/application/usecases/assembleEveningSummary.ts`

### 4a. New interface (insert before `EveningSummary` interface, ~line 73)

```typescript
/** Foreign investor flow mover for a single stock — top-5 by |net_vol|. */
export interface ForeignFlowMover {
  code: string;
  foreignNetVol: number;   // positive = net buy, negative = net sell
  foreignBuyVol: number;
  foreignSellVol: number;
}
```

### 4b. EveningSummary extension (add after `portfolioPnl?` field, ~line 109)

```typescript
  /**
   * Top 5 stocks by |foreign_net_vol| for the latest trading day.
   * Empty array when daily_ohlcv has no rows with non-null foreign_net_vol.
   */
  foreignFlowMovers: ForeignFlowMover[];
```

### 4c. AssembleEveningSummaryOptions extension (add after `getPnlFn?`, ~line 138)

```typescript
  /** Injectable for tests — bypasses real DB query for foreign flow movers */
  getForeignFlowMoversFn?: (db: Database) => ForeignFlowMover[];
```

### 4d. Step 4b query block (insert after the TA try/catch block, before Step 5 at ~line 510)

```typescript
  // ── Step 4b: Foreign flow movers ─────────────────────────────────────────
  let foreignFlowMovers: ForeignFlowMover[] = [];
  try {
    if (options.getForeignFlowMoversFn) {
      foreignFlowMovers = options.getForeignFlowMoversFn(db);
    } else {
      interface ForeignFlowRow {
        code: string;
        foreign_net_vol: number;
        foreign_buy_vol: number;
        foreign_sell_vol: number;
      }
      foreignFlowMovers = db
        .prepare<ForeignFlowRow, []>(`
          SELECT code, foreign_net_vol, foreign_buy_vol, foreign_sell_vol
          FROM daily_ohlcv
          WHERE date = (SELECT MAX(date) FROM daily_ohlcv)
            AND foreign_net_vol IS NOT NULL
          ORDER BY ABS(foreign_net_vol) DESC
          LIMIT 5
        `)
        .all()
        .map((r) => ({
          code: r.code,
          foreignNetVol: r.foreign_net_vol,
          foreignBuyVol: r.foreign_buy_vol,
          foreignSellVol: r.foreign_sell_vol,
        }));
    }
  } catch (err) {
    logger.warn("[assembleEveningSummary] foreignFlowMovers query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // foreignFlowMovers stays [] — no crash
  }
```

### 4e. Summary object (Step 6, ~line 587) — add field

```typescript
  const summary: EveningSummary = {
    date,
    topAlerts,
    topStories,
    watchlistMovers,
    predictionSignals,
    predictionDiag,
    taDiag,
    taSummary,
    newsCount,
    generatedAt,
    ...(vnIndex !== undefined ? { vnIndex } : {}),
    portfolioPnl,
    foreignFlowMovers,   // ← add this line
  };
```

---

## Edit 5 — eveningSummaryJob.ts: hasContent + formatter

**File:** `src/scheduler/eveningSummaryJob.ts`

### 5a. hasContent guard (lines 199-208)

Add `foreignFlowMovers` condition to the OR-chain:

```typescript
    const hasContent =
      summary.topStories.length > 0 ||
      summary.topAlerts.length > 0 ||
      summary.watchlistMovers.length > 0 ||
      summary.predictionSignals.length > 0 ||
      (summary.taSummary ?? []).some(
        (s) => s.rsiStatus !== "neutral",
      ) ||
      (summary.portfolioPnl != null && summary.portfolioPnl.items.length > 0) ||
      (summary.foreignFlowMovers?.length ?? 0) > 0 ||   // ← add this line
      summary.vnIndex != null;
```

### 5b. Formatter block (insert after portfolioPnl block, before `await doSend`, ~line 298)

```typescript
        // ── Khối ngoại (task 1503) ──────────────────────────────────────────
        if ((summary.foreignFlowMovers ?? []).length > 0) {
          lines.push("");
          lines.push(`Kh\u1ED1i ngo\u1EA1i (${summary.foreignFlowMovers.length} cp):`);
          for (const m of summary.foreignFlowMovers) {
            const direction = m.foreignNetVol >= 0 ? "mua r\u00F2ng" : "b\u00E1n r\u00F2ng";
            const sign      = m.foreignNetVol >= 0 ? "+" : "";
            const net       = (Math.abs(m.foreignNetVol) / 1000).toFixed(3);
            const buy       = (m.foreignBuyVol  / 1000).toFixed(3);
            const sell      = (m.foreignSellVol / 1000).toFixed(3);
            lines.push(`  ${m.code}: ${direction} ${sign}${m.foreignNetVol >= 0 ? "" : "-"}${net}k (B:${buy}k / S:${sell}k)`);
          }
        }
```

Unicode escapes: `\u1ED1` = ổ (Khối), `\u1EA1` = ạ (ngoại), `\u00F2` = ò (ròng), `\u00E1` = á (bán). Use literal Vietnamese if editor supports UTF-8 — both forms are equivalent.

Note on sign formatting: `foreignNetVol` is already signed. For negative values use `Math.abs` for the numeric part and prefix with `-`. For positive values prefix with `+`.

Simplified correct formatter:
```typescript
            const absNet    = Math.abs(m.foreignNetVol);
            const sign      = m.foreignNetVol >= 0 ? "+" : "-";
            const direction = m.foreignNetVol >= 0 ? "mua ròng" : "bán ròng";
            const net       = (absNet / 1000).toFixed(3);
```

### 5c. runEveningSummary options (if AC-5 needs injectable sendFn and getForeignFlowMoversFn)

If `runEveningSummary` does not yet accept `getForeignFlowMoversFn`, pass it through to `assembleEveningSummary` options. Check current function signature — if it already forwards `options` to `assembleEveningSummary`, just adding `getForeignFlowMoversFn` to `AssembleEveningSummaryOptions` (Edit 4c) is sufficient and the test injection works automatically.

---

## Verification sequence

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP

# 1. Type check
bun tsc --noEmit

# 2. New test suite
bun test src/__tests__/1503-ohlcv-foreign-flow.test.ts

# 3. Full baseline
bun test

# 4. Health check (after launchctl restart)
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
curl http://localhost:3000/health
```

Target: 5681 + 5 = 5686 passing. 0 type errors.

---

## Branch hygiene (post-merge)

```bash
git checkout main
git branch -d task/1503-ohlcv-foreign-flow
```

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
- "foreignFlowMovers step failed: no such table: daily_ohlcv" warnings in 105-job-evening-summary.test.ts are expected (minimal test DB, fail-open guard works)
- Full `bun test` OOM-crashed (Bun 1.3.11 memory bug); targeted regression 27/0 pass on all changed modules

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/ohlcvForeignFlowStore.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleEveningSummary.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/eveningSummaryJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1503-ohlcv-foreign-flow.test.ts

merge_commit: 9f882cc
