# TASK 1521b — Test-drift batch: 6 test files — daily_ohlcv seeds + foreign_net_vol col

type: GREEN (test-only)
sprint: 206
depends_on: []
touches: src/__tests__/ ONLY — no production files

---

## What / Why

Six test files seed `vnstock_trading_stats` or use `daily_ohlcv` without `foreign_net_vol`. Production reads `daily_ohlcv.foreign_net_vol` since sprints 1517b/1518b. Column-missing or table-missing causes 30 failures. All fixes are DDL-only in test scaffolding.

---

## Canonical References (already GREEN — copy patterns from these)

| Reference | What it shows |
|-----------|---------------|
| `src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts:66-80` | Full `daily_ohlcv` DDL with all foreign flow cols |
| `src/__tests__/1517-foreign-flow-alert-ohlcv-source.test.ts:85-106` | Seed pattern: 3+ days × `foreign_net_vol=150_000` → HIGH signal |
| `src/__tests__/1516-france-summary-foreign-flow.test.ts:53-66` | Minimal `daily_ohlcv` DDL with `foreign_net_vol REAL` (used for franceSummaryJob tests) |

---

## Fix 1 — 1133-foreign-flow-alert-job.test.ts

File: `src/__tests__/1133-foreign-flow-alert-job.test.ts`
Scope: lines 30-152 (`makeDb` + `seedForeignFlow`)

### makeDb change

Replace `vnstock_trading_stats` CREATE (lines 50-66) with `daily_ohlcv` CREATE:

```typescript
// REMOVE:
db.run(`
  CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
    code                TEXT NOT NULL,
    date                TEXT NOT NULL DEFAULT '1970-01-01',
    foreign_volume      REAL,
    ...
    UNIQUE(code, date)
  )
`);

// ADD (after watchlist table):
db.run(`
  CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code             TEXT NOT NULL,
    date             TEXT NOT NULL,
    open             REAL,
    high             REAL,
    low              REAL,
    close            REAL,
    volume           REAL,
    foreign_buy_vol  REAL,
    foreign_sell_vol REAL,
    foreign_net_vol  REAL,
    put_through_vol  REAL,
    PRIMARY KEY (code, date)
  )
`);
```

### seedForeignFlow helper change (lines 134-152)

Replace with seed into `daily_ohlcv.foreign_net_vol`:

```typescript
/**
 * Seed N days of foreign net flow for a stock in daily_ohlcv.
 * netVolPerDay: direct net_vol value per row (not cumulative).
 * Production COALESCE query sums these as running total in app layer.
 */
function seedForeignFlow(
  db: Database,
  code: string,
  netVolPerDay: number[],
): void {
  const ins = db.prepare(`
    INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol)
    VALUES (?, ?, ?)
  `);
  const today = new Date();
  for (let i = 0; i < netVolPerDay.length; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    ins.run(code, dateStr, netVolPerDay[i] ?? 0);
  }
}
```

### Seed call sites in test cases

Find all `seedForeignFlow(db, "VNM", [...])` calls in the describe blocks. The existing volumes array was cumulative — replace with per-day net_vol values.

HIGH signal rule: production `foreignFlowAlertJob` sums `COALESCE(foreign_net_vol, 0)` over the last N rows. To trigger HIGH: seed at least 3 rows with `foreign_net_vol = 150_000` each (mirrors 1517 GREEN).

Example replacement for HIGH-signal seed call:
```typescript
// OLD: seedForeignFlow(db, "VNM", [600_000, 550_000, 500_000, 450_000, 400_000])
// NEW:
seedForeignFlow(db, "VNM", [150_000, 150_000, 150_000, 150_000, 0]);
// 4 days × 150k net → cumulative HIGH signal
```

For FPT (1-day seed, low signal or no-signal cases): `seedForeignFlow(db, "FPT", [10_000])`.

AC assertions to verify after fix:
- `stocksScanned: 2` — VNM + FPT in watchlist
- `highSignals: 1` — VNM crosses HIGH threshold
- `alertsInserted: 1` — one alert row for VNM

---

## Fix 2 — 1134-get-foreign-flow-tool.test.ts

File: `src/__tests__/1134-get-foreign-flow-tool.test.ts`
Scope: lines 26-77 (`buildInMemoryDb` + `seedHighBuySignal` + `seedZeroVolume`)

### buildInMemoryDb change (lines 26-42)

Replace `vnstock_trading_stats` CREATE with `daily_ohlcv`:

```typescript
function buildInMemoryDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL,
      high             REAL,
      low              REAL,
      close            REAL,
      volume           REAL,
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}
```

### seedHighBuySignal change (lines 49-63)

```typescript
function seedHighBuySignal(db: Database, code: string, days: number): void {
  const netVolPerDay = 150_000; // each row = one day's net flow → sum > HIGH threshold
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol) VALUES (?, ?, ?)`
    ).run(code, dateStr, netVolPerDay);
  }
}
```

### seedZeroVolume change (lines 68-77)

```typescript
function seedZeroVolume(db: Database, code: string, days: number): void {
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol) VALUES (?, ?, ?)`
    ).run(code, dateStr, 0);
  }
}
```

---

## Fix 3 — 1290-france-summary-job.test.ts

File: `src/__tests__/1290-france-summary-job.test.ts`
Scope: lines 43-49 (`daily_ohlcv` CREATE in `makeDb`)

Minimal change — add `foreign_net_vol REAL` column only:

```typescript
// BEFORE (line 43-49):
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code TEXT NOT NULL, date TEXT NOT NULL,
    open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
    close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL, PRIMARY KEY (code, date)
  )
`)

// AFTER:
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code TEXT NOT NULL, date TEXT NOT NULL,
    open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
    close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
    foreign_net_vol REAL,
    updated_at TEXT NOT NULL, PRIMARY KEY (code, date)
  )
`)
```

Note: keep all `market_prices` + `market_prices_history` seeds as-is — they serve the fallback path tests (line 91-118). Do NOT replace them with `daily_ohlcv` rows. The "caps moverCount at 3" test (line ~130+) — if it seeds via `market_prices`, leave unchanged; only add the column to DDL.

---

## Fix 4 — 1344-france-summary-stale-alerts.test.ts

File: `src/__tests__/1344-france-summary-stale-alerts.test.ts`
Scope: lines 46-52 (`daily_ohlcv` CREATE in `makeDb`)

Same minimal change as Fix 3:

```typescript
// BEFORE (line 46-52):
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code TEXT NOT NULL, date TEXT NOT NULL,
    open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
    close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL, PRIMARY KEY (code, date)
  )
`);

// AFTER: add foreign_net_vol REAL before updated_at
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code TEXT NOT NULL, date TEXT NOT NULL,
    open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
    close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
    foreign_net_vol REAL,
    updated_at TEXT NOT NULL, PRIMARY KEY (code, date)
  )
`);
```

---

## Fix 5 — 1364-france-ta-detail.test.ts

File: `src/__tests__/1364-france-ta-detail.test.ts`
Scope: lines 110-121 (`daily_ohlcv` CREATE)

```typescript
// BEFORE (lines 110-121):
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code       TEXT NOT NULL,
    date       TEXT NOT NULL,
    open       REAL NOT NULL,
    high       REAL NOT NULL,
    low        REAL NOT NULL,
    close      REAL NOT NULL,
    volume     REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (code, date)
  )
`)

// AFTER: add foreign_net_vol REAL before updated_at
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code       TEXT NOT NULL,
    date       TEXT NOT NULL,
    open       REAL NOT NULL,
    high       REAL NOT NULL,
    low        REAL NOT NULL,
    close      REAL NOT NULL,
    volume     REAL NOT NULL DEFAULT 0,
    foreign_net_vol REAL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (code, date)
  )
`)
```

---

## Fix 6 — 1450-france-summary-vnindex.test.ts

File: `src/__tests__/1450-france-summary-vnindex.test.ts`
Scope: lines 47-51 (inline `daily_ohlcv` CREATE inside `db.exec`)

```typescript
// BEFORE (lines 47-51):
CREATE TABLE IF NOT EXISTS daily_ohlcv (
  code TEXT NOT NULL, date TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL, volume REAL,
  PRIMARY KEY (code, date)
);

// AFTER: add foreign_net_vol REAL
CREATE TABLE IF NOT EXISTS daily_ohlcv (
  code TEXT NOT NULL, date TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL, volume REAL,
  foreign_net_vol REAL,
  PRIMARY KEY (code, date)
);
```

---

## Verification

Run after all 6 fixes:

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1133-foreign-flow-alert-job.test.ts
bun test src/__tests__/1134-get-foreign-flow-tool.test.ts
bun test src/__tests__/1290-france-summary-job.test.ts
bun test src/__tests__/1344-france-summary-stale-alerts.test.ts
bun test src/__tests__/1364-france-ta-detail.test.ts
bun test src/__tests__/1450-france-summary-vnindex.test.ts
bun tsc --noEmit
```

Full suite target: `bun test` → fail count ≤ 7 (5 intentional 1511 RED + pre-existing ≤2).

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1133-foreign-flow-alert-job.test.ts   # replaced vnstock_trading_stats DDL + seedForeignFlow with daily_ohlcv; updated 6 seed call sites to per-day net_vol values
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1134-get-foreign-flow-tool.test.ts   # replaced vnstock_trading_stats DDL + seedHighBuySignal + seedZeroVolume + AC-2 inline insert with daily_ohlcv
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1290-france-summary-job.test.ts   # added foreign_net_vol REAL to daily_ohlcv DDL
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1344-france-summary-stale-alerts.test.ts   # added foreign_net_vol REAL to daily_ohlcv DDL
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1364-france-ta-detail.test.ts   # added foreign_net_vol REAL to daily_ohlcv DDL
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1450-france-summary-vnindex.test.ts   # added foreign_net_vol REAL to daily_ohlcv DDL

tests_written: []   # test-only task — no new test file; fixes drift in 6 existing files

new_pass: 17   # 30 fail → 13 fail; 5738 pass → 5755 pass

tests_skipped:
- 1290/1344/1364/1450 pre-existing failures (missing commodity_prices, positions tables) — out of scope for this task

tsc_clean: true
full_suite_pass: false   # 13 pre-existing failures remain; baseline was 30 fail before this task
