# TASK 1518a — RED: get-foreign-flow ohlcv source test

req_ref: Sprint 203
phase: RED (failing assertions)
file: src/__tests__/1518-get-foreign-flow-ohlcv-source.test.ts (NEW)

---

## Why RED

Current `foreignFlowTools.ts:144-168` test path queries `vnstock_trading_stats`.
New test seeds only `daily_ohlcv` — no `vnstock_trading_stats` table.
Tool must return HIGH signal from `daily_ohlcv` data, not zero-data guard.

Expected RED failures:
- AC1: tool returns zero-data message (no vnstock_trading_stats rows) instead of signal
- AC2: signal direction not `net_buy`
- AC3: signal severity not `HIGH`
- AC4: column header still "Foreign Volume" not "Net Vol (daily)"

---

## Test file to create

`src/__tests__/1518-get-foreign-flow-ohlcv-source.test.ts`

```typescript
/**
 * Task 1518a — RED
 *
 * Proves get_foreign_flow MCP tool reads daily_ohlcv.foreign_net_vol
 * when zero rows exist in vnstock_trading_stats.
 *
 * Expected RED failures: AC1/AC2/AC3 — current impl queries vnstock_trading_stats
 * (no rows) → zero-data guard fires → returns no-data message instead of signal.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { registerForeignFlowTools } from "../interface/mcp/tools/foreignFlowTools.js";

function setupTestDb(): Database {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE daily_ohlcv (
      code          TEXT NOT NULL,
      date          TEXT NOT NULL,
      open          REAL,
      high          REAL,
      low           REAL,
      close         REAL,
      volume        REAL,
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    )
  `);

  // vnstock_trading_stats intentionally NOT created
  // to verify old source is NOT used

  // Seed daily_ohlcv: baseline day + 3-day BUY streak of 150_000/day
  // Dates ASC so cumsum builds correctly
  db.run(
    "INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)",
    ["VNM", "2026-04-15", 0],
  );
  db.run(
    "INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)",
    ["VNM", "2026-04-16", 150_000],
  );
  db.run(
    "INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)",
    ["VNM", "2026-04-17", 150_000],
  );
  db.run(
    "INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)",
    ["VNM", "2026-04-18", 150_000],
  );

  return db;
}

async function callTool(
  db: Database,
  code: string,
  days: number,
): Promise<string> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerForeignFlowTools(server, db);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const result = await client.callTool({
    name: "get_foreign_flow",
    arguments: { code, days },
  });

  await client.close();

  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]?.text ?? "";
}

describe("Task 1518 — get_foreign_flow reads daily_ohlcv.foreign_net_vol", () => {
  it("AC1: returns signal text (not no-data message) with only daily_ohlcv rows", async () => {
    const db = setupTestDb();
    const text = await callTool(db, "VNM", 10);
    expect(text).not.toContain("foreign investor volume has not been collected yet");
    expect(text).toContain("Foreign Flow Analysis");
    db.close();
  });

  it("AC2: signal direction is net_buy (3-day BUY streak)", async () => {
    const db = setupTestDb();
    const text = await callTool(db, "VNM", 10);
    expect(text).toContain("net_buy");
    db.close();
  });

  it("AC3: severity is HIGH (3+ consecutive days AND net vol > 100k)", async () => {
    const db = setupTestDb();
    const text = await callTool(db, "VNM", 10);
    expect(text).toContain("HIGH");
    db.close();
  });

  it("AC4: daily history table header shows 'Net Vol (daily)' not 'Foreign Volume'", async () => {
    const db = setupTestDb();
    const text = await callTool(db, "VNM", 10);
    expect(text).toContain("Net Vol (daily)");
    expect(text).not.toContain("Foreign Volume");
    db.close();
  });
});
```

---

## Stubs needed

None — `registerForeignFlowTools` already exported. Test imports it directly with injected `db`.

---

## Run to confirm RED

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1518-get-foreign-flow-ohlcv-source.test.ts
```

Expected: 4 failures (AC1–AC4).

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1518-get-foreign-flow-ohlcv-source.test.ts   # created: RED test, 4 assertions

tests_written:
- src/__tests__/1518-get-foreign-flow-ohlcv-source.test.ts   # 4 assertions, all RED (expected)

tests_skipped: []

tsc_clean: N/A (RED phase — no impl code)
full_suite_pass: N/A (RED phase)

RED failure reason: `foreignFlowTools.ts` queries `vnstock_trading_stats` directly → table missing → error path, not `daily_ohlcv` fallback.
