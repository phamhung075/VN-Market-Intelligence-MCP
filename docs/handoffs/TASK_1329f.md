# TASK 1329f — IMF Conviction Bridge: Application Service

**Sprint:** 1329
**Layer:** application/services
**Size:** S (part of M IMF chain)
**Branch:** `task/1329b-imf-conviction-dimension`
**Depends on:** 1329e
**Blocks:** 1329g

---

## Objective

Create `apps/mcp-server/src/application/services/imfConvictionBridge.ts`. This is the only new file in the sprint. It reads `imf_indicators` rows from the DB, calls `classifyImfIndicators()` (domain/services — pure), and returns a single `number` in [-1, +1] suitable for injection as `imfMacroScore` into `computeConviction()`.

---

## New File

`apps/mcp-server/src/application/services/imfConvictionBridge.ts`

```typescript
/**
 * Application Service — IMF Conviction Bridge (Task 1329f)
 *
 * Reads imf_indicators rows from the DB and converts them to a single
 * macro sentiment score in [-1, +1] for injection into computeConviction().
 *
 * Design contract (NFR-IMF-1):
 *   - computeConviction() stays pure — no I/O, no async.
 *   - This bridge is called by the application/interface layer BEFORE
 *     calling computeConviction(), injecting the result as imfMacroScore.
 *
 * Staleness: rows with fetched_at older than IMF_STALENESS_HOURS are ignored.
 *   Default: 24h (IMF poller runs every 6h — max 1 missed cycle = 12h old).
 *   Configurable: Bun.env.IMF_STALENESS_HOURS (Architect decision Q-IMF-3).
 *
 * Layer: application/services
 *   - Imports domain/services (pure classifier) — allowed
 *   - Imports infrastructure/db (data access)   — allowed
 *   - Does NOT import interface/                 — DDD rule
 */

import type { Database } from "bun:sqlite";
import {
  classifyImfIndicators,
} from "../../domain/services/imfDataClassifier.js";
import {
  calculateConfidenceDecay,
  type ImfIndicator,
} from "../../domain/models/imfIndicators.js";

/** Default staleness window in hours (configurable via env) */
const IMF_STALENESS_HOURS = Number(Bun.env.IMF_STALENESS_HOURS ?? 24);

/** Row shape from imf_indicators table */
interface ImfIndicatorRow {
  code:         string;
  name:         string;
  value:        number;
  published_at: string;
  age_in_days:  number;
  prev_value:   number | null;
  yoy_change:   number | null;
  source:       string;
  confidence:   number;
  fetched_at:   string;
}

/**
 * Reads all imf_indicators rows fetched within the staleness window,
 * runs classifyImfIndicators(), and returns sentiment in [-1, +1].
 *
 * Returns 0 (neutral) when:
 *   - Table is empty
 *   - All rows are stale (fetched_at > IMF_STALENESS_HOURS ago)
 *   - Any DB error (fail-silent per NFR-IMF-3)
 *
 * @param db - SQLite Database instance (injectable for tests)
 * @returns sentiment score in [-1, +1]
 */
export function getImfMacroScoreForConviction(db: Database): number {
  try {
    const rows = db
      .query<ImfIndicatorRow, [string]>(
        `SELECT code, name, value, published_at, age_in_days,
                prev_value, yoy_change, source, confidence, fetched_at
           FROM imf_indicators
          WHERE fetched_at >= datetime('now', ? || ' hours')
          ORDER BY fetched_at DESC`,
      )
      .all(`-${IMF_STALENESS_HOURS}`);

    if (rows.length === 0) return 0;

    const indicators: ImfIndicator[] = rows.map((row) => ({
      code:        row.code,
      name:        row.name,
      value:       row.value,
      publishedAt: row.published_at,
      ageInDays:   row.age_in_days,
      prevValue:   row.prev_value ?? undefined,
      yoyChange:   row.yoy_change ?? null,
      source:      row.source,
      confidence:  row.confidence,
    }));

    const result = classifyImfIndicators({
      indicators,
      historicalBaseline: 3.0,  // IMF global growth baseline (%), consistent with imfIndicatorPollerJob.ts
    });

    return result.sentiment;
  } catch {
    // Fail-silent: stale/missing IMF data → neutral, never throw
    return 0;
  }
}
```

**Parameter binding note:** The staleness filter uses `datetime('now', ? || ' hours')` with a parameterized binding. The value passed is the string `"-24"` (constructed from `IMF_STALENESS_HOURS`). This is a number-to-string conversion with no user input — safe. An alternative is `datetime('now', '-' || cast(? as text) || ' hours')` with the integer directly; both are equivalent and parameterized.

**`historicalBaseline: 3.0`** — consistent with `imfIndicatorPollerJob.ts:57` which also passes `3.0`. Do NOT hardcode differently.

---

## Files to Read Before Implementing

1. `apps/mcp-server/src/application/services/imfDataFetcher.ts` — understand existing DB query pattern for `imf_indicators`
2. `apps/mcp-server/src/scheduler/market-data/imfIndicatorPollerJob.ts` — confirm `historicalBaseline: 3.0`
3. `apps/mcp-server/src/domain/models/imfIndicators.ts` — confirm `ImfIndicator` field names (especially `ageInDays` vs `age_in_days` snake/camel)

---

## Test File

`apps/mcp-server/src/__tests__/1329b-imf-conviction-dimension.test.ts`

Extend with:

```typescript
import Database from "bun:sqlite";
import { getImfMacroScoreForConviction } from "../application/services/imfConvictionBridge.js";

describe("Task 1329f — getImfMacroScoreForConviction()", () => {
  function makeDb(): Database {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE imf_indicators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL, name TEXT NOT NULL, value REAL NOT NULL,
        published_at TEXT NOT NULL, age_in_days INTEGER NOT NULL DEFAULT 0,
        prev_value REAL, yoy_change REAL, source TEXT NOT NULL DEFAULT 'imf_api',
        confidence REAL NOT NULL DEFAULT 0.95,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(code) ON CONFLICT REPLACE
      )
    `);
    return db;
  }

  it("AC-IMF-2: empty table returns 0", () => {
    const db = makeDb();
    expect(getImfMacroScoreForConviction(db)).toBe(0);
  });

  it("AC-IMF-3: all rows stale (fetched_at > 24h ago) returns 0", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 3.2, '2026-01-01', 30, 0.2, 0.95,
              datetime('now', '-25 hours'))`);
    expect(getImfMacroScoreForConviction(db)).toBe(0);
  });

  it("fresh row with positive yoy_change returns positive sentiment", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 3.5, '2026-04-01', 5, 0.5, 0.95,
              datetime('now', '-1 hours'))`);
    const score = getImfMacroScoreForConviction(db);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("DB error returns 0 (fail-silent)", () => {
    // Simulate by passing a closed/invalid DB
    const db = new Database(":memory:");
    db.close();
    expect(getImfMacroScoreForConviction(db)).toBe(0);
  });
});
```

---

## DDD Compliance

**Allowed imports:**
- `bun:sqlite` — infrastructure, but `Database` type only; the instance is injected by the caller.
- `domain/services/imfDataClassifier` — pure function call. Correct direction.
- `domain/models/imfIndicators` — model types. Correct direction.

**Forbidden imports (verify before commit):**
- Nothing from `interface/` — DDD violation
- Nothing from `infrastructure/db/schema.ts` — this function receives `db` as a parameter; it does not call `getDb()` itself. This is the ports pattern: DB instance is injected.

**Why the bridge does not call `getDb()` internally:**
Calling `getDb()` would couple the application service to the infrastructure singleton. By accepting `Database` as a parameter, the function is testable with `:memory:` and the caller controls the DB instance lifecycle.

---

## IMF_STALENESS_HOURS env var (Architect decision Q-IMF-3)

The env var `IMF_STALENESS_HOURS` is read at module load time (`const IMF_STALENESS_HOURS = Number(Bun.env.IMF_STALENESS_HOURS ?? 24)`). Default is 24h. This is the Architect's recommended approach (configurable without code change, validated by the 24h default covering 4 missed 6h poller cycles before neutrality kicks in).

Add to `.env.example` (or equivalent env documentation):
```
IMF_STALENESS_HOURS=24    # Hours before IMF indicator data is considered stale (default: 24)
```
