# TASK_1517a — RED: foreign-flow-alert ohlcv source test

sprint: 202
phase: RED
file: src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts

---

## Goal

Prove that `runForeignFlowAlertJob` fires HIGH signals when `daily_ohlcv.foreign_net_vol`
has a 3-day streak > 100k and **zero rows** exist in `vnstock_trading_stats`.

---

## DB schema required

```ts
Bun.env["DB_PATH"] = ":memory:";
```

Tables to create in `setupTestDb()`:

```sql
-- watchlist (required by job)
CREATE TABLE watchlist (
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

-- alerts (job inserts here)
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  triggered_at TEXT NOT NULL,
  severity TEXT NOT NULL,
  signals_json TEXT,
  affected_actions_json TEXT,
  analysis_ids_json TEXT,
  message TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  user_note TEXT,
  sent_by TEXT
);

-- evidence_fragments (job inserts here)
CREATE TABLE evidence_fragments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  magnitude REAL,
  confidence REAL,
  source_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

-- daily_ohlcv WITH foreign flow columns (migration already applied)
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
);

-- vnstock_trading_stats intentionally NOT created (or created empty)
-- to verify old source is NOT used
```

---

## Seed data

Insert one watchlist stock `'VNM'` and 4 days of `daily_ohlcv` with a
3-consecutive-day net BUY streak of 150 000 shares/day:

```ts
// dates ASC: d0 is oldest baseline, d1/d2/d3 are the streak days
const dates = ["2026-04-15", "2026-04-16", "2026-04-17", "2026-04-18"];
// foreign_net_vol per day: streak of +150_000 for d1, d2, d3
// d0 is baseline (any value — 0 is fine)
db.run("INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)", ["VNM", "2026-04-15", 0]);
db.run("INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)", ["VNM", "2026-04-16", 150_000]);
db.run("INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)", ["VNM", "2026-04-17", 150_000]);
db.run("INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)", ["VNM", "2026-04-18", 150_000]);
```

No rows in `vnstock_trading_stats` (table not created OR created empty).

---

## Assertions (exact, copy into test)

```ts
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runForeignFlowAlertJob } from "../scheduler/foreignFlowAlertJob.js";

const noop = async (_: string) => true;

describe("Task 1517 — foreignFlowAlertJob reads daily_ohlcv.foreign_net_vol", () => {

  it("AC1: result.highSignals >= 1 with no vnstock_trading_stats rows", async () => {
    const db = setupTestDb();          // seed as above
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.highSignals).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("AC2: result.stocksSkipped === 0 — VNM not zero-gated", async () => {
    const db = setupTestDb();
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.stocksSkipped).toBe(0);
    db.close();
  });

  it("AC3: alert row inserted for VNM in alerts table", async () => {
    const db = setupTestDb();
    await runForeignFlowAlertJob(db, { sendWork: noop });
    const row = db.query("SELECT id FROM alerts WHERE id LIKE 'foreign-flow-VNM-%'").get();
    expect(row).toBeTruthy();
    db.close();
  });

  it("AC4: result.stocksScanned === 1", async () => {
    const db = setupTestDb();
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.stocksScanned).toBe(1);
    db.close();
  });

});
```

---

## Stubs needed (for RED to compile)

`getForeignFlowHistoryFromDb` body at lines 78-108 must expose the
function signature unchanged — only body changes in GREEN.
No other stubs needed; function signature is already exported indirectly
through `runForeignFlowAlertJob`.

---

## Expected RED failure

Tests AC1/AC2/AC3 fail because current impl queries `vnstock_trading_stats`
which has no rows → all foreignVolume = 0 → zero-data guard fires →
`stocksSkipped = 1`, `highSignals = 0`, no alert inserted.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts   # created: RED test file, 4 assertions

tests_written:
- src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts   # 4 assertions, all RED (SQLiteError: no such table: vnstock_trading_stats)

tests_skipped: []

tsc_clean: true
full_suite_pass: false   # expected — RED phase, 4 new tests failing as designed
