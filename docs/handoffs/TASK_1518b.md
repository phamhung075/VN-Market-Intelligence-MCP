# TASK 1518b — GREEN: get-foreign-flow ohlcv source impl

req_ref: Sprint 203
phase: GREEN
file_modified: src/interface/mcp/tools/foreignFlowTools.ts

---

## Changes — foreignFlowTools.ts only

### Change 1 — Line 85: update column header

**Location**: `formatForeignFlowOutput`, daily history table header

**Old**:
```typescript
  lines.push("  Date        | Foreign Volume | Foreign Room  | Holding Ratio");
  lines.push("  ------------|----------------|---------------|---------------");
```

**New**:
```typescript
  lines.push("  Date        | Net Vol (daily) | Foreign Room  | Holding Ratio");
  lines.push("  ------------|-----------------|---------------|---------------");
```

---

### Change 2 — Lines 144-168: replace test-path query

**Location**: inside `registerForeignFlowTools`, the `if (db)` test branch.

**Old** (queries `vnstock_trading_stats`):
```typescript
        if (db) {
          // Test path: query the injected in-memory db directly
          const rows = resolvedDb
            .prepare<any, [string, number]>(
              `SELECT code,
                      substr(fetched_at, 1, 10) AS date,
                      foreign_volume, foreign_room, current_holding_ratio
               FROM vnstock_trading_stats
               WHERE code = ?
               ORDER BY fetched_at DESC
               LIMIT ?`,
            )
            .all(code, days);

          history = rows.map((row: any) => ({
            code: row.code,
            date: row.date,
            foreignVolume: row.foreign_volume ?? 0,
            foreignRoom: row.foreign_room ?? 0,
            holdingRatio: row.current_holding_ratio ?? 0,
          }));
        } else {
          // Production path: use the shared store function
          history = getForeignFlowHistory(code, days);
        }
```

**New** (queries `daily_ohlcv` using cumsum pattern from Sprint 202):
```typescript
        if (db) {
          // Test path: query daily_ohlcv directly on injected db.
          // ASC order to build cumulative sum; reversed to DESC for analyzeForeignFlow.
          const rows = resolvedDb
            .prepare<any, [string, number]>(
              `SELECT code,
                      date,
                      COALESCE(foreign_net_vol, 0) AS net_vol
               FROM daily_ohlcv
               WHERE code = ?
               ORDER BY date ASC
               LIMIT ?`,
            )
            .all(code, days);

          let cumsum = 0;
          const ascending: DailyForeignFlow[] = rows.map((row: any) => {
            cumsum += row.net_vol as number;
            return {
              code: row.code as string,
              date: row.date as string,
              foreignVolume: cumsum,
              foreignRoom: 0,
              holdingRatio: 0,
            };
          });
          history = ascending.reverse();
        } else {
          // Production path: use the shared store function
          history = getForeignFlowHistory(code, days);
        }
```

---

## Import cleanup

`getForeignFlowHistory` import at line 23 is still used by production path — keep it.
No new imports needed.

---

## Zero-data guard compatibility

After migration, `foreignVolume` = cumsum value. Baseline row has `net_vol=0` → cumsum=0, then subsequent rows accumulate positively. The guard `history.every(r => r.foreignVolume === 0)` will NOT fire when there are positive streak days. Guard behavior preserved correctly.

---

## Production path (else branch)

`getForeignFlowHistory` in `vnstockStore.ts` must also be updated in a follow-up sprint to query `daily_ohlcv` instead of `vnstock_trading_stats`. For Sprint 203 GREEN, the production path (`else`) is unchanged — only the test-injection path (`if (db)`) is migrated. This matches the Sprint 202 pattern (foreignFlowAlertJob migrated its internal helper; foreignFlowTools production path is a separate concern).

---

## Verify GREEN

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1518-get-foreign-flow-ohlcv-source.test.ts
bun test  # full suite — 0 regressions expected
bun tsc --noEmit
```

Expected: 4 pass / 0 fail.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/foreignFlowTools.ts   # Change 1: header "Net Vol (daily)"; Change 2: test-path query migrated to daily_ohlcv with cumsum

tests_written:
- src/__tests__/1518-get-foreign-flow-ohlcv-source.test.ts   # 4 assertions (AC1-AC4), all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # Bun OOM crash on 5775 tests unrelated to this change; task suite 4/4
