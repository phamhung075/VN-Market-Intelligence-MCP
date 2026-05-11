# TASK 1360a — marketContextBuilder Unit Tests (16 tests, in-memory SQLite)

## Context

Sprint 1360. Domain layer. `marketContextBuilder.ts` (418 lines) powers every
`getCycleBootstrap` call — it assembles the 4-section context string shown to every
analysis agent at the start of each intelligence cycle. Zero tests exist today.

**Source file (read-only — no production changes):**
- `apps/mcp-server/src/domain/services/marketContextBuilder.ts`

**Output file to create:**
- `apps/mcp-server/src/__tests__/1360a-market-context-builder.test.ts`

---

## Coverage Gap Analysis

### Exported public surface

```typescript
export function buildMarketContextText(db: Database, hoursBack: number): string
export function buildSystemStatusText(db: Database): string
```

### Private section builders (tested indirectly via the two public exports)

| Builder | What it reads |
|---------|--------------|
| `buildWatchlistSection(db)` | `watchlist` + `market_prices` LEFT JOIN |
| `buildMacroSection(db)` | `market_prices` (MACRO_CODES) + `tracked_indicators` + `sbv_rates` |
| `buildAlertsSection(db, since, hoursBack)` | `alerts WHERE read = 0 AND triggered_at >= ?` |
| `buildAnalysisSection(db, since, hoursBack)` | `rag_analyses WHERE created_at >= ?` |

### Key logic paths to cover

1. Empty-DB smoke (all tables empty) — each section falls to its "no data" branch.
2. Stale-price flag (`isPriceStale`) — `updated_at` older than 24 h → `[STALE]` suffix + warning line.
3. `hoursBack` boundary — the `since` ISO string filters alerts and analyses correctly.
4. Section header assembly — each section starts with its `=== ... ===` header.
5. `buildSystemStatusText` — pending alert count + last-cycle + last-analysis strings.
6. Stale-count aggregation — multiple stale rows produce a single warning line.
7. Alert row formatting — severity, affected codes, signal types, message.
8. Analysis row formatting — sentiment, title truncation, score/direction, summary truncation.

---

## In-Memory DB Fixture

`marketContextBuilder.ts` takes a raw `Database` object. No `initDatabase`/`closeDb`
needed. Follow the `buildVpsDb()` pattern from `1359a`:

```typescript
import { Database } from "bun:sqlite";

function buildMcbDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'banking',
      notes TEXT,
      alert_drop_pct REAL NOT NULL DEFAULT 5.0,
      alert_rise_pct REAL NOT NULL DEFAULT 5.0,
      alert_impact_min REAL NOT NULL DEFAULT 0.5
    );
    CREATE TABLE market_prices (
      code TEXT PRIMARY KEY,
      price REAL,
      change_pct REAL,
      updated_at TEXT
    );
    CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      signals_json TEXT,
      affected_actions_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE rag_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'market',
      source_title TEXT,
      sentiment TEXT,
      impact_score REAL,
      impact_direction TEXT,
      summary TEXT
    );
  `);
  return db;
}
```

Note: `tracked_indicators` and `sbv_rates` are intentionally absent in most tests —
`buildMacroSection` wraps those queries in try/catch and falls back gracefully, which
is also what the tests verify.

---

## Test Cases

### Section A — buildMarketContextText: empty-DB smoke (MCB-1 through MCB-4)

**MCB-1: empty DB — watchlist section contains fallback message**

Arrange: `buildMcbDb()` (no rows in any table).
Act: `const text = buildMarketContextText(db, 24)`.
Assert:
- `text` contains `"=== WATCHLIST & PRICES ==="`.
- `text` contains `"Watchlist is empty"`.

Rationale: covers the `rows.length === 0` guard in `buildWatchlistSection`.

**MCB-2: empty DB — macro section contains fallback message**

Arrange/Act: same empty DB.
Assert:
- `text` contains `"=== MACRO ==="`.
- `text` contains `"No macro data available"`.

**MCB-3: empty DB — alerts section contains no-alerts message**

Arrange/Act: same empty DB.
Assert:
- `text` contains `"=== OPEN ALERTS (24h) ==="`.
- `text` contains `"No open alerts in this window"`.

**MCB-4: empty DB — analysis section contains no-analysis message**

Arrange/Act: same empty DB.
Assert:
- `text` contains `"=== RECENT ANALYSIS (24h) ==="`.
- `text` contains `"No analysis entries in this window"`.

---

### Section B — buildMarketContextText: stale-price logic (MCB-5 through MCB-7)

**MCB-5: price updated 25 h ago — row gets [STALE] flag and stale warning line**

Arrange: Insert one watchlist row (`code = "VCB"`) and one `market_prices` row with
`updated_at` set to `new Date(Date.now() - 25 * 3_600_000).toISOString()`.
Act: `buildMarketContextText(db, 24)`.
Assert:
- `text` contains `"[STALE]"`.
- `text` contains `"1 price(s) are stale (>24h)"`.

**MCB-6: price updated 23 h ago — no [STALE] flag**

Arrange: same but `updated_at = new Date(Date.now() - 23 * 3_600_000).toISOString()`.
Act: `buildMarketContextText(db, 24)`.
Assert:
- `text` does NOT contain `"[STALE]"`.
- `text` does NOT contain `"stale"`.

**MCB-7: two stale prices — warning line says "2 price(s)"**

Arrange: Insert two watchlist + prices rows both with `updated_at` 48 h ago.
Act: `buildMarketContextText(db, 24)`.
Assert: `text` contains `"2 price(s) are stale (>24h)"`.

---

### Section C — buildMarketContextText: hoursBack boundary (MCB-8 through MCB-10)

**MCB-8: alert older than hoursBack window is excluded**

Arrange: Insert one alert row with `triggered_at = new Date(Date.now() - 25 * 3_600_000).toISOString()` and `read = 0`.
Act: `buildMarketContextText(db, 24)`.
Assert: `text` contains `"No open alerts in this window"`.

Rationale: `since = Date.now() - 24h`. Alert is 25 h old → outside window.

**MCB-9: alert within window is included and formatted correctly**

Arrange: Insert one alert row with:
- `triggered_at` = 1 hour ago (ISO string).
- `severity = "high"`.
- `affected_actions_json = '["VCB","TCB"]'`.
- `signals_json = '["price_drop","volume_spike"]'`.
- `message = "Cảnh báo giảm mạnh"`.
- `read = 0`.

Act: `buildMarketContextText(db, 24)`.
Assert:
- `text` contains `"1 open alert"`.
- `text` contains `"[HIGH]"`.
- `text` contains `"VCB"`.
- `text` contains `"price_drop"`.
- `text` contains `"Cảnh báo giảm mạnh"`.

**MCB-10: read=1 alert is excluded from open alerts section**

Arrange: Insert same alert but `read = 1`.
Act: `buildMarketContextText(db, 24)`.
Assert: `text` contains `"No open alerts in this window"`.

---

### Section D — buildMarketContextText: analysis section (MCB-11 through MCB-12)

**MCB-11: analysis entry within window is rendered with all fields**

Arrange: Insert one `rag_analyses` row with:
- `created_at` = 30 min ago (ISO string).
- `sentiment = "bullish"`.
- `source_title = "VCB tăng trưởng tín dụng Q1"`.
- `impact_score = 0.8`.
- `impact_direction = "positive"`.
- `summary = "Ngân hàng VCB ghi nhận lợi nhuận tăng 20% YoY"`.

Act: `buildMarketContextText(db, 24)`.
Assert:
- `text` contains `"[bullish]"`.
- `text` contains `"VCB tăng trưởng tín dụng Q1"`.
- `text` contains `"0.8"`.
- `text` contains `"positive"`.
- `text` contains `"Ngân hàng VCB"`.

**MCB-12: long source_title (>80 chars) is truncated with ellipsis**

Arrange: Insert a `rag_analyses` row with a 100-char `source_title`.
Act: `buildMarketContextText(db, 24)`.
Assert: `text` contains the first 80 chars of the title followed by `"…"`.

---

### Section E — buildSystemStatusText (MCB-13 through MCB-16)

**MCB-13: empty DB — system status shows "0 alerts pending" and "unknown" for timestamps**

Arrange: `buildMcbDb()`.
Act: `const text = buildSystemStatusText(db)`.
Assert:
- `text` contains `"=== SYSTEM STATUS ==="`.
- `text` contains `"0 alerts pending"`.
- `text` contains `"last alert: unknown"`.
- `text` contains `"last analysis: unknown"`.

**MCB-14: one unread alert — pending count is 1**

Arrange: Insert one alert row with `read = 0`.
Act: `buildSystemStatusText(db)`.
Assert: `text` contains `"1 alert pending"` (singular, not "alerts").

**MCB-15: multiple unread alerts — pending count is correct**

Arrange: Insert 3 alert rows all with `read = 0`.
Act: `buildSystemStatusText(db)`.
Assert: `text` contains `"3 alerts pending"`.

**MCB-16: last alert timestamp is formatted as "YYYY-MM-DD HH:MM"**

Arrange: Insert one alert row with `triggered_at = "2026-04-28T09:30:00.000Z"`.
Act: `buildSystemStatusText(db)`.
Assert: `text` contains `"last alert: 2026-04-28 09:30"`.

Rationale: the formatter is `.slice(0, 16).replace("T", " ")` — covers the
timestamp formatting branch in `buildSystemStatusText`.

---

## DI Strategy Summary

| Function | DI mechanism | Mock needed |
|----------|-------------|-------------|
| `buildMarketContextText` | `(db: Database, hoursBack: number)` | `new Database(":memory:")` with manual schema |
| `buildSystemStatusText` | `(db: Database)` | same fixture |

No `mock.module` needed. No `initDatabase`/`closeDb`. No scheduler imports.

---

## Import Block

```typescript
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  buildMarketContextText,
  buildSystemStatusText,
} from "../domain/services/marketContextBuilder.js";
```

---

## File Header

```typescript
// apps/mcp-server/src/__tests__/1360a-market-context-builder.test.ts
// Task 1360a — marketContextBuilder unit tests (16 tests, in-memory SQLite)
// No mock.module, no initDatabase, no production changes.
```

---

## Constraints

- No production file changes.
- No `Bun.env["DB_PATH"]` override needed (no `getDb()` call — db is injected directly).
- All 16 tests must pass in the baseline suite (`bun test`).
- Test file path: `apps/mcp-server/src/__tests__/1360a-market-context-builder.test.ts`

---

## Acceptance Criteria (from SPRINT_GOAL.md)

- 16 new tests, all green.
- Covers: empty-db smoke, stale-price flag logic, hoursBack boundary, section assembly
  correctness, staleness threshold edge cases.
- Full suite (after 1360b also lands): baseline 7803 + 40 = 7843 pass, 0 fail, 0 TS errors.
- No new source files — tests only.
