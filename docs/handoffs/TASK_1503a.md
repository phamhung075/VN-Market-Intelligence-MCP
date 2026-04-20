# TASK_1503a — RED: TDD assertions for ohlcv-foreign-flow (5 AC)

phase: RED
sprint: 190
tech_ref: docs/TECH_190.md
file: src/__tests__/1503-ohlcv-foreign-flow.test.ts (NEW)

## Goal

Write a failing test file with 5 assertions (AC-1 through AC-5). All must FAIL (red) before 1503b starts. `bun tsc --noEmit` must pass (stubs satisfy types).

## Test file location

`src/__tests__/1503-ohlcv-foreign-flow.test.ts`

## Line 1 (mandatory)

```typescript
Bun.env["DB_PATH"] = ":memory:";
```

## Imports needed

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { initDatabase } from "../infrastructure/db/schema.js";
import { writeForeignFlowToOhlcv } from "../infrastructure/db/vnstockStore.js";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { runEveningSummary } from "../scheduler/eveningSummaryJob.js";
import type { Database } from "bun:sqlite";
```

## Stubs required for RED to compile

`writeForeignFlowToOhlcv` does not exist yet in vnstockStore.ts. Two options:
1. Import and let tsc fail → but we need `bun tsc --noEmit` clean.
2. Use `// @ts-expect-error` on the import line and call with `as any`.

Preferred: declare a local stub in the test file so TypeScript is satisfied:

```typescript
// Stub — will be replaced by real import once GREEN
const writeForeignFlowToOhlcv: (
  items: Array<{ code: string; date: string; foreignBuyVol: number; foreignSellVol: number; putThroughVol: number }>,
  db?: Database
) => number = () => { throw new Error("not implemented"); };
```

For AC-3 (endpoint test): call `writeForeignFlowToOhlcv` directly (simulates what server.ts will do) — do NOT make HTTP requests in unit tests.

For AC-5 (Telegram format): inject `foreignFlowMovers` via `getForeignFlowMoversFn` option into `assembleEveningSummary` then pass resulting summary to a formatting helper, OR test the Telegram message string directly by intercepting `sendFn` in `runEveningSummary`.

## AC-1: Schema columns

```typescript
describe("AC-1: daily_ohlcv schema has 4 foreign flow cols", () => {
  it("PRAGMA table_info returns all 4 new columns after initDatabase()", () => {
    const db = initDatabase();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("foreign_buy_vol");
    expect(cols).toContain("foreign_sell_vol");
    expect(cols).toContain("foreign_net_vol");
    expect(cols).toContain("put_through_vol");
  });
});
```

## AC-2: writeForeignFlowToOhlcv update-only semantics

```typescript
describe("AC-2: writeForeignFlowToOhlcv updates existing row, skips missing", () => {
  it("updates VCB (existing), does not insert FPT (missing)", () => {
    const db = initDatabase();
    // Seed VCB row only
    db.exec(`INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
             VALUES ('VCB', '2026-04-20', 100, 105, 99, 102, 50000, '2026-04-20T09:00:00Z')`);

    writeForeignFlowToOhlcv([
      { code: "VCB", date: "2026-04-20", foreignBuyVol: 5000, foreignSellVol: 2000, putThroughVol: 300 },
      { code: "FPT", date: "2026-04-20", foreignBuyVol: 1000, foreignSellVol: 500,  putThroughVol: 0   },
    ], db);

    interface OhlcvRow {
      foreign_buy_vol: number | null;
      foreign_sell_vol: number | null;
      foreign_net_vol: number | null;
      put_through_vol: number | null;
      open: number;
    }
    const vcb = db
      .query<OhlcvRow, [string, string]>(
        "SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol, open FROM daily_ohlcv WHERE code=? AND date=?"
      )
      .get("VCB", "2026-04-20");

    expect(vcb).not.toBeNull();
    expect(vcb!.foreign_buy_vol).toBe(5000);
    expect(vcb!.foreign_sell_vol).toBe(2000);
    expect(vcb!.foreign_net_vol).toBe(3000);   // computed: 5000-2000
    expect(vcb!.put_through_vol).toBe(300);
    expect(vcb!.open).toBe(100);               // price col untouched

    const fpt = db
      .query<{ code: string }, [string, string]>(
        "SELECT code FROM daily_ohlcv WHERE code=? AND date=?"
      )
      .get("FPT", "2026-04-20");
    expect(fpt).toBeNull();  // no stub insert
  });
});
```

## AC-3: net_vol computed correctly

```typescript
describe("AC-3: foreign_net_vol computed at write time", () => {
  it("FPT row: foreignBuyVol=15000, foreignSellVol=2650 → foreign_net_vol=12350", () => {
    const db = initDatabase();
    db.exec(`INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
             VALUES ('FPT', '2026-04-20', 120, 125, 119, 123, 80000, '2026-04-20T09:00:00Z')`);

    writeForeignFlowToOhlcv([
      { code: "FPT", date: "2026-04-20", foreignBuyVol: 15000, foreignSellVol: 2650, putThroughVol: 500 },
    ], db);

    interface OhlcvRow { foreign_buy_vol: number; foreign_sell_vol: number; foreign_net_vol: number; put_through_vol: number }
    const row = db
      .query<OhlcvRow, [string, string]>(
        "SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol FROM daily_ohlcv WHERE code=? AND date=?"
      )
      .get("FPT", "2026-04-20");

    expect(row).not.toBeNull();
    expect(row!.foreign_buy_vol).toBe(15000);
    expect(row!.foreign_sell_vol).toBe(2650);
    expect(row!.foreign_net_vol).toBe(12350);
    expect(row!.put_through_vol).toBe(500);
  });
});
```

## AC-4: assembleEveningSummary returns sorted foreignFlowMovers

```typescript
describe("AC-4: assembleEveningSummary foreignFlowMovers sorted |net| DESC, max 5, null excluded", () => {
  it("returns top 5 by |foreign_net_vol|, row with null excluded", async () => {
    const db = initDatabase();
    const today = new Date().toISOString().slice(0, 10);
    // 6 rows with non-null net + 1 row with null net
    const rows: Array<[string, number, number, number]> = [
      ["AAA", 12350,  15000,  2650],
      ["BBB", -8200,  1100,   9300],
      ["CCC",  5000,  6000,   1000],
      ["DDD", -1000,  500,    1500],
      ["EEE",  3000,  4000,   1000],
      ["FFF",   500,  800,    300 ],
    ];
    for (const [code, net, buy, sell] of rows) {
      db.exec(
        `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at, foreign_net_vol, foreign_buy_vol, foreign_sell_vol)
         VALUES ('${code}', '${today}', 10, 11, 9, 10, 1000, '${today}T09:00:00Z', ${net}, ${buy}, ${sell})`
      );
    }
    // 1 row with null net (should be excluded)
    db.exec(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('GGG', '${today}', 10, 11, 9, 10, 1000, '${today}T09:00:00Z')`
    );

    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/test-reports-1503",
      getForeignFlowMoversFn: undefined, // use real query path
    });

    expect(summary.foreignFlowMovers.length).toBe(5);
    // Order: |12350| > |8200| > |5000| > |3000| > |1000|
    expect(summary.foreignFlowMovers[0].code).toBe("AAA");
    expect(summary.foreignFlowMovers[1].code).toBe("BBB");
    expect(summary.foreignFlowMovers[2].code).toBe("CCC");
    expect(summary.foreignFlowMovers[3].code).toBe("EEE");
    expect(summary.foreignFlowMovers[4].code).toBe("DDD");
    // GGG excluded (null foreign_net_vol)
    expect(summary.foreignFlowMovers.map((m) => m.code)).not.toContain("GGG");
  });
});
```

## AC-5: Telegram message format

```typescript
describe("AC-5: runEveningSummary produces Khoi ngoai section", () => {
  it("message contains Khoi ngoai, stock code, direction, k-suffix vol", async () => {
    const db = initDatabase();
    const today = new Date().toISOString().slice(0, 10);

    const capturedMessages: string[] = [];
    const mockSendFn = async (msg: string) => { capturedMessages.push(msg); };

    await runEveningSummary({
      db,
      sendFn: mockSendFn,
      getForeignFlowMoversFn: () => [
        { code: "FPT", foreignNetVol: 12350, foreignBuyVol: 15000, foreignSellVol: 2650 },
      ],
      // Inject minimal content so hasContent = true
      reportsDir: "/tmp/test-reports-1503",
    });

    expect(capturedMessages.length).toBeGreaterThan(0);
    const msg = capturedMessages.join("\n");
    expect(msg).toContain("Kh\u1ED1i ngo\u1EA1i");  // "Khối ngoại"
    expect(msg).toContain("FPT");
    expect(msg).toContain("mua r\u00F2ng");           // "mua ròng"
    expect(msg).toMatch(/\d+\.\d{3}k/);               // vol with k suffix e.g. 12.350k
  });
});
```

Note: `runEveningSummary` must accept injectable `getForeignFlowMoversFn` and `sendFn` options. If the current signature of `runEveningSummary` does not support this yet, write the test against the expected GREEN signature — it will fail RED for the right reason.

## RED verification command

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1503-ohlcv-foreign-flow.test.ts 2>&1 | tail -20
```

All 5 should show FAIL. Then:

```bash
bun tsc --noEmit 2>&1 | head -30
```

Must be clean (0 errors).
