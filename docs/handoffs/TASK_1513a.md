# TASK_1513a — RED: france-summary global snapshot test

sprint: 197
depends_on: []
test_file: src/__tests__/1513-france-summary-global-snapshot.test.ts

## What must FAIL (RED)

Five assertions, all targeting code not yet written:
1. `FranceSummaryResult` has `globalSnapshot` field
2. `FranceSummaryOptions` has `getGlobalSnapshotFn?` field
3. `formatFranceSummaryVI` renders "Thị trường toàn cầu" section when snapshot present
4. `formatFranceSummaryVI` omits section when snapshot null
5. `runFranceSummary` populates `result.globalSnapshot` from injectable fn

## Test file to create

`src/__tests__/1513-france-summary-global-snapshot.test.ts`

```typescript
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runFranceSummary,
  formatFranceSummaryVI,
} from "../scheduler/franceSummaryJob.js";
import type { FranceSummaryOptions, FranceSummaryResult } from "../scheduler/franceSummaryJob.js";
import type { GlobalSnapshot } from "../application/usecases/assembleBriefing.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_SNAPSHOT: GlobalSnapshot = {
  vix: 22.5,
  dxy: 104.3,
  sp500: 5150.0,
  hangSeng: 17200.0,
  fetchedAt: "2026-04-20T05:00:00Z",
};

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      company_name TEXT,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3,
      alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT NOT NULL,
      price REAL NOT NULL,
      volume REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT,
      affected_actions_json TEXT
    );
    CREATE TABLE IF NOT EXISTS market_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      from_agent TEXT,
      message_type TEXT,
      sent_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source TEXT PRIMARY KEY,
      vix REAL NOT NULL DEFAULT 0,
      dxy REAL NOT NULL DEFAULT 0,
      sp500 REAL NOT NULL DEFAULT 0,
      hang_seng REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );
  `);
  return db;
}

// ── AC-1: FranceSummaryResult has globalSnapshot field ───────────────────────

describe("1513 AC-1 — FranceSummaryResult has globalSnapshot field", () => {
  it("result.globalSnapshot key exists in returned object", async () => {
    const db = setupTestDb();
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getGlobalSnapshotFn: async () => null,
    });
    // RED: globalSnapshot not in FranceSummaryResult yet
    expect("globalSnapshot" in result).toBe(true);
  });
});

// ── AC-2: FranceSummaryOptions has getGlobalSnapshotFn field ─────────────────

describe("1513 AC-2 — getGlobalSnapshotFn injectable", () => {
  it("accepts getGlobalSnapshotFn without TypeScript error (runtime shape check)", async () => {
    const db = setupTestDb();
    let called = false;
    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getGlobalSnapshotFn: async () => { called = true; return MOCK_SNAPSHOT; },
    };
    // Seed content so silent-skip guard does not short-circuit
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);
    await runFranceSummary(opts);
    // RED: getGlobalSnapshotFn not in interface → TS error at import time
    expect(called).toBe(true);
  });
});

// ── AC-3: formatFranceSummaryVI renders global section when snapshot present ──

describe("1513 AC-3 — formatFranceSummaryVI renders global section", () => {
  it("message contains 'Thị trường toàn cầu' when snapshot provided", () => {
    // RED: formatFranceSummaryVI signature does not accept globalSnapshot yet
    const msg = formatFranceSummaryVI(
      "20/04/2026",
      [],
      [],
      [],
      null,
      null,
      MOCK_SNAPSHOT,
    );
    expect(msg).toContain("Thị trường toàn cầu");
    expect(msg).toContain("VIX");
    expect(msg).toContain("DXY");
    expect(msg).toContain("S&P500");
    expect(msg).toContain("Hang Seng");
  });

  it("VIX value formatted to 2 decimal places", () => {
    const msg = formatFranceSummaryVI("20/04/2026", [], [], [], null, null, MOCK_SNAPSHOT);
    expect(msg).toContain("22.50");
  });
});

// ── AC-4: formatFranceSummaryVI omits section when snapshot null ──────────────

describe("1513 AC-4 — formatFranceSummaryVI omits section when null", () => {
  it("message omits 'Thị trường toàn cầu' when globalSnapshot is null", () => {
    const msg = formatFranceSummaryVI("20/04/2026", [], [], [], null, null, null);
    expect(msg).not.toContain("Thị trường toàn cầu");
  });

  it("message omits section when globalSnapshot is undefined", () => {
    const msg = formatFranceSummaryVI("20/04/2026", [], [], [], null, null, undefined);
    expect(msg).not.toContain("Thị trường toàn cầu");
  });
});

// ── AC-5: runFranceSummary populates result.globalSnapshot ───────────────────

describe("1513 AC-5 — runFranceSummary populates result.globalSnapshot", () => {
  it("result.globalSnapshot equals value returned by getGlobalSnapshotFn", async () => {
    const db = setupTestDb();
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);
    const captured: string[] = [];
    const result = await runFranceSummary({
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getGlobalSnapshotFn: async () => MOCK_SNAPSHOT,
    });
    // RED: result.globalSnapshot not set yet
    expect(result.globalSnapshot).toBeDefined();
    expect(result.globalSnapshot!.vix).toBeCloseTo(22.5);
    expect(captured[0]).toContain("Thị trường toàn cầu");
  });

  it("result.globalSnapshot is null when fn returns null", async () => {
    const db = setupTestDb();
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getGlobalSnapshotFn: async () => null,
    });
    expect(result.globalSnapshot).toBeNull();
  });

  it("globalSnapshot alone satisfies hasContent guard — sends even with no movers/alerts", async () => {
    const db = setupTestDb();
    // No movers, no alerts, no TA — only snapshot
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getGlobalSnapshotFn: async () => MOCK_SNAPSHOT,
    });
    // RED: hasContent guard does not check globalSnapshot yet → sent=false
    expect(result.sent).toBe(true);
  });
});

// ── AC-6: default DB path queries commodity_prices ────────────────────────────

describe("1513 AC-6 — default path reads commodity_prices table", () => {
  it("runFranceSummary without getGlobalSnapshotFn reads commodity_prices", async () => {
    const db = setupTestDb();
    db.exec(`INSERT INTO commodity_prices VALUES ('yahoo', 22.5, 104.3, 5150.0, 17200.0, '2026-04-20T05:00:00Z')`);
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);
    const captured: string[] = [];
    const result = await runFranceSummary({
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
    });
    // RED: no default commodity_prices query in runFranceSummary yet
    expect(result.globalSnapshot).toBeDefined();
    expect(captured[0]).toContain("Thị trường toàn cầu");
  });
});
```

## Stubs needed (for RED compile)

None — do NOT add these yet. Test must FAIL at runtime, not compile-error. Use `as any` casts only if TS blocks import.

If TS blocks `formatFranceSummaryVI` call with 7 args, add a `// @ts-expect-error` comment above the call — the GREEN phase will fix the signature.

## Run command

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1513-france-summary-global-snapshot.test.ts 2>&1 | tail -30
```

Expected: 6+ FAIL, 0 pass.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1513-france-summary-global-snapshot.test.ts   # created: RED test file, 10 assertions

tests_written:
- src/__tests__/1513-france-summary-global-snapshot.test.ts   # 10 assertions, 8 FAIL (RED), 2 pass (AC-4 trivially pass at runtime)

tests_skipped: []

tsc_clean: N/A (RED phase — @ts-expect-error guards TS errors on 7-arg calls)
full_suite_pass: N/A (RED phase)
