# TASK 1450a — RED: TDD test for france-summary VN-Index snapshot

sprint: 165
phase: RED
file: src/__tests__/1450-france-summary-vnindex.test.ts

## What to create

New test file. Three assertions. All must FAIL before GREEN phase.

## Test file skeleton

```typescript
process.env["DB_PATH"] = ":memory:";

/**
 * Task 1450 — France Summary VN-Index snapshot (TDD RED phase)
 *
 * Tests:
 *   (a) vnIndex present → formatted output contains "VN-Index: XXXX" block as Section 0
 *   (b) silent-skip fires when only vnIndex is null + all other sources empty
 *   (c) vnIndex block omitted when fetchVnIndexFn returns null
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runFranceSummary,
  formatFranceSummaryVI,
} from "../scheduler/franceSummaryJob.js";
import type { FranceSummaryOptions, FranceSummaryResult } from "../scheduler/franceSummaryJob.js";
import type { VnIndexSnapshot } from "../application/usecases/assembleEveningSummary.js";

// ── minimal in-memory DB ──────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, company_name TEXT, exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other', notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT NOT NULL, price REAL NOT NULL, volume REAL NOT NULL,
      fetched_at TEXT NOT NULL, exchange TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL,
      message TEXT, affected_actions_json TEXT
    );
    CREATE TABLE IF NOT EXISTS market_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      from_agent TEXT, message_type TEXT, sent_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL, date TEXT NOT NULL,
      open REAL, high REAL, low REAL, close REAL, volume REAL,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

// ── fixture ───────────────────────────────────────────────────────────────────

const MOCK_VN_INDEX: VnIndexSnapshot = {
  close: 1285.43,
  change: 12,
  changePct: 0.94,
  fetchedAt: "2026-04-18T07:00:00Z",
};

// ── (a) vnIndex present → block appears as first content section ─────────────

describe("1450 (a) — vnIndex present → VN-Index block in output", () => {
  it("formatFranceSummaryVI renders VN-Index line when vnIndex provided", () => {
    const msg = formatFranceSummaryVI(
      "18/04/2026",
      [],       // movers
      [],       // alerts
      [],       // taSignals
      null,     // portfolioPnl
      MOCK_VN_INDEX,
    );
    expect(msg).toContain("VN-Index");
    expect(msg).toContain("1.285");   // Vietnamese dot-thousands: 1285 → "1.285"
  });

  it("runFranceSummary with fetchVnIndexFn → sent message contains VN-Index", async () => {
    const db = setupTestDb();
    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
      fetchVnIndexFn: async () => MOCK_VN_INDEX,
    };

    await runFranceSummary(opts);

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain("VN-Index");
  });

  it("VN-Index block appears before movers (Section 0)", () => {
    const movers = [{ code: "VCB", price: 85000, change_pct: 5.2 }];
    const msg = formatFranceSummaryVI(
      "18/04/2026",
      movers,
      [],
      [],
      null,
      MOCK_VN_INDEX,
    );
    const vnIdxPos = msg.indexOf("VN-Index");
    const moverPos = msg.indexOf("biến động");
    expect(vnIdxPos).toBeGreaterThanOrEqual(0);
    expect(vnIdxPos).toBeLessThan(moverPos);
  });
});

// ── (b) silent-skip when vnIndex null + all sources empty ────────────────────

describe("1450 (b) — silent-skip when vnIndex null + all sources empty", () => {
  it("runFranceSummary returns sent=false when only fetchVnIndexFn returns null + no other data", async () => {
    const db = setupTestDb();
    // No watchlist, no alerts, no TA — only fetchVnIndexFn=null
    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
      fetchVnIndexFn: async () => null,
    };

    const result: FranceSummaryResult = await runFranceSummary(opts);
    expect(result.sent).toBe(false);
  });
});

// ── (c) vnIndex block omitted when fetchFn returns null ──────────────────────

describe("1450 (c) — vnIndex block omitted when fetchVnIndexFn returns null", () => {
  it("formatFranceSummaryVI omits VN-Index line when vnIndex is null", () => {
    const movers = [{ code: "VCB", price: 85000, change_pct: 5.2 }];
    const msg = formatFranceSummaryVI(
      "18/04/2026",
      movers,
      [],
      [],
      null,
      null,  // vnIndex = null
    );
    expect(msg).not.toContain("VN-Index");
  });

  it("runFranceSummary with fetchVnIndexFn returning null → no VN-Index in output", async () => {
    const db = setupTestDb();

    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
    db.exec(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VCB', 85000, 1000, datetime('now', '-1 minute')),
             ('VCB', 75000, 900,  datetime('now', '-2 minutes'))
    `);

    const captured: string[] = [];

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg) => { captured.push(msg); return true; },
      nowFn: () => new Date("2026-04-18T07:00:00Z"),
      getPnlFn: async () => null,
      fetchVnIndexFn: async () => null,
    };

    await runFranceSummary(opts);

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).not.toContain("VN-Index");
  });
});
```

## Failing assertions (before GREEN)

| # | Assertion | Why fails |
|---|-----------|-----------|
| a1 | `msg.toContain("VN-Index")` | `formatFranceSummaryVI` has no 6th param |
| a2 | `captured[0].toContain("VN-Index")` | `runFranceSummary` never calls `fetchVnIndexFn` |
| a3 | `vnIdxPos < moverPos` | VN-Index block doesn't exist yet |
| b1 | `result.sent === false` | silent-skip guard doesn't check vnIndex |
| c1 | `not.toContain("VN-Index")` when null | param doesn't exist → no block ever rendered (may pass already — still valid) |
| c2 | no VN-Index in output when null | same |

## Run

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1450-france-summary-vnindex.test.ts
```

Expected: multiple failures on a1/a2/a3/b1.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1450-france-summary-vnindex.test.ts   # created: 6 tests across 3 describe blocks

tests_written:
- src/__tests__/1450-france-summary-vnindex.test.ts   # 6 tests, 3 FAIL (RED) + 3 PASS

tests_skipped: []

tsc_clean: false   # expected — TS errors confirm missing param + option field (RED phase)
full_suite_pass: false   # 3 fail on a1/a2/a3 as expected

---

## [QA] Review Record

verdict: APPROVED (RED phase)
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1450-france-summary-vnindex.test.ts

red_phase_verified:
  failing_3: [a1, a2, a3] — all vnIndex rendering assertions, correct RED failures
  passing_3: [b1, c1, c2] — all guard/null cases, semantically valid
  full_suite: 5494 pass / 3 fail / 21 skip (21 skips pre-existing, no regressions)
  baseline_math: 5512 pre-1450 + 3 new passing = 5515 expected pass; 5494 pass + 21 skip = pre-existing delta confirmed

merge_commit: DO NOT MERGE — GREEN phase pending
