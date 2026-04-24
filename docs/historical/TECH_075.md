# TECH-075: get_pipeline_health MCP Tool

status: APPROVED_BY_ARCHITECT
req_ref: REQ-075

---

## Brownfield Impact

- **Files created:**
  - `src/application/usecases/getPipelineHealth.ts`
  - `src/__tests__/1189-pipeline-health.test.ts`
- **Files modified:**
  - `src/interface/mcp/tools/systemTools.ts` — add one `server.tool()` call inside `registerSystemTools`
  - `src/application/usecases/index.ts` — add barrel export for `getPipelineHealth`
  - `docs/data/tool-registry.json` — toolCount 96 → 97, add entry to "System & Ops" category
  - `docs/data/project-stats.json` — toolCount 96 → 97
- **Files deleted:** none
- **Breaking changes:** no — only additive

---

## Architecture Decision

`getPipelineHealth` is a pure read-only diagnostic snapshot. It belongs in the **application
layer** (not domain) because it orchestrates queries across two DB tables plus the filesystem —
cross-cutting concerns that do not belong in a single domain service. The interface layer
(`systemTools.ts`) wraps the use case with a zero-argument MCP tool that serialises the result
as JSON text, consistent with the `get_system_status` pattern already established in that file.
No new repository interface is needed: the use case receives an injected `Database` directly,
which matches the existing injectable pattern in `assembleEveningSummary.ts`.

---

## DDD Layer Plan

| Component              | Layer       | File Path                                                  | New/Modify |
| ---------------------- | ----------- | ---------------------------------------------------------- | ---------- |
| `getPipelineHealth`    | application | `src/application/usecases/getPipelineHealth.ts`            | NEW        |
| barrel re-export       | application | `src/application/usecases/index.ts`                        | MODIFY     |
| `registerSystemTools`  | interface   | `src/interface/mcp/tools/systemTools.ts`                   | MODIFY     |
| unit tests             | —           | `src/__tests__/1189-pipeline-health.test.ts`               | NEW        |
| tool registry          | —           | `docs/data/tool-registry.json`                             | MODIFY     |
| project stats          | —           | `docs/data/project-stats.json`                             | MODIFY     |

**DDD invariant check:** `getPipelineHealth.ts` imports only `bun:sqlite` (type), `node:fs`,
`node:path`, and `../../infrastructure/logger.js`. No domain layer is touched. No circular
import is introduced.

---

## Interface Contracts

### TypeScript interfaces (defined in `getPipelineHealth.ts`)

```typescript
// ── Input ────────────────────────────────────────────────────────────────────

export interface GetPipelineHealthOptions {
  /** Current epoch ms. Injected in tests; defaults to Date.now() in production. */
  nowMs?: number;
  /** SQLite handle. Injected in tests; defaults to getDb() lazy-loaded in production. */
  db?: Database;
  /** Absolute path to the reports directory. Injected in tests; defaults to process.cwd() + "/reports". */
  reportsDir?: string;
}

// ── Output ───────────────────────────────────────────────────────────────────

export interface PipelineHealthResult {
  /** ISO 8601 timestamp of when this snapshot was taken. */
  generatedAt: string;

  ragRows: {
    /** Row count in rag_analyses inserted today (GMT+7 day boundary). */
    today: number;
    /** Row count in rag_analyses inserted yesterday (GMT+7 day boundary). */
    yesterday: number;
    /** ISO 8601 timestamp of the most recent row, or null if table is empty. */
    lastInsertedAt: string | null;
    /** Minutes since lastInsertedAt, clamped to >= 0, or null if no rows exist. */
    staleMins: number | null;
  };

  /** Per-source breakdown of today's rows, sorted by count DESC. Empty array if no rows today. */
  sources: Array<{
    source: string;   // hostname e.g. "cafef.vn" or "(unknown)"
    count: number;
  }>;

  /**
   * Count of successful news pushes from vps_push_log in the last 24h.
   * null means the vps_push_log table does not exist yet (pre-production).
   * 0 means the table exists but no ok pushes in 24h (pipeline failure signal).
   */
  vpsPushLast24h: number | null;

  /** ISO 8601 mtime of the newest reports/*-evening.json file, or null if none exist. */
  eveningReportLastRun: string | null;
}
```

### Entry point signature

```typescript
export async function getPipelineHealth(
  options: GetPipelineHealthOptions = {},
): Promise<PipelineHealthResult>
```

---

## SQL Queries

All queries use parameterised bindings (`db.query<RowType, [ParamTypes]>(...).get(param)` or
`.all(param)`). No string interpolation. Bun's `Database.query` is preferred over `prepare`
for one-shot queries; both are equivalent and acceptable.

### GMT+7 day boundary (computed in TypeScript — do NOT use SQLite datetime())

```typescript
const OFFSET_MS = 7 * 3600 * 1000;  // UTC+7
const nowMs = options.nowMs ?? Date.now();
const todayStartUtcMs =
  Math.floor((nowMs + OFFSET_MS) / 86_400_000) * 86_400_000 - OFFSET_MS;
const yesterdayStartUtcMs = todayStartUtcMs - 86_400_000;
const todayStartIso      = new Date(todayStartUtcMs).toISOString();
const yesterdayStartIso  = new Date(yesterdayStartUtcMs).toISOString();
```

### FR-1: Row counts (today + yesterday)

```sql
-- today count
SELECT COUNT(*) AS cnt
FROM rag_analyses
WHERE created_at >= ?          -- todayStartIso
```

```sql
-- yesterday count
SELECT COUNT(*) AS cnt
FROM rag_analyses
WHERE created_at >= ?          -- yesterdayStartIso
  AND created_at < ?           -- todayStartIso
```

Both queries hit `idx_rag_created` (already exists). No full scan.

### FR-2: Last insert + staleness

```sql
SELECT created_at
FROM rag_analyses
ORDER BY created_at DESC
LIMIT 1
```

Post-query TypeScript:
```typescript
const lastMs = lastRow ? Date.parse(lastRow.created_at) : null;
const staleMins = lastMs !== null
  ? Math.max(0, Math.floor((nowMs - lastMs) / 60_000))
  : null;
```

### FR-3: Per-source breakdown (today's rows)

```sql
SELECT source_url
FROM rag_analyses
WHERE created_at >= ?          -- todayStartIso
```

Domain extraction is done **in TypeScript** post-query for testability:

```typescript
function extractDomain(sourceUrl: string | null | undefined): string {
  if (!sourceUrl) return "(unknown)";
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "(unknown)";
  }
}
```

Aggregation in TypeScript using a `Map<string, number>`, then converted to a
`{ source, count }[]` sorted by `count DESC`.

### FR-4: VPS push count (last 24h) — safety pattern

```typescript
const since24hIso = new Date(nowMs - 24 * 3600_000).toISOString();

try {
  const row = db.query<{ cnt: number }, [string]>(
    `SELECT COUNT(*) AS cnt
     FROM vps_push_log
     WHERE service = 'news'
       AND status  = 'ok'
       AND pushed_at >= ?`,
  ).get(since24hIso);
  vpsPushLast24h = row?.cnt ?? 0;
} catch {
  // Table does not exist yet — pre-production environment.
  vpsPushLast24h = null;
  logger.warn("[getPipelineHealth] vps_push_log not found — returning null");
}
```

### FR-5: Evening report last mtime (filesystem)

```typescript
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function getEveningReportLastRun(reportsDir: string): string | null {
  try {
    const entries = readdirSync(reportsDir)
      .filter((f) => f.endsWith("-evening.json"))
      .map((f) => ({ f, mtime: statSync(join(reportsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return entries.length > 0 ? new Date(entries[0]!.mtime).toISOString() : null;
  } catch {
    return null;
  }
}
```

---

## Injectable Dependencies for Testing

The function signature receives all external I/O via its `options` bag:

| Dependency     | Production default                                   | Test injection                          |
| -------------- | ---------------------------------------------------- | --------------------------------------- |
| `nowMs`        | `Date.now()`                                         | fixed epoch ms                          |
| `db`           | lazy `import("../../infrastructure/db/schema.js").getDb()` | `new Database(":memory:")` |
| `reportsDir`   | `join(process.cwd(), "reports")`                     | `os.tmpdir()` or in-memory path stub    |

The lazy DB import pattern (dynamic `import()` inside the function body, guarded by `options.db ??`)
mirrors `assembleEveningSummary.ts` line 189–195. This keeps the module importable in tests
without triggering DB initialisation at module load time.

---

## MCP Tool Registration (`systemTools.ts`)

Add the following block **inside** `registerSystemTools(server)`, after the `get_system_status`
tool registration:

```typescript
// ── get_pipeline_health — news pipeline diagnostic snapshot ─────────────────
server.tool(
  "get_pipeline_health",
  "Returns a point-in-time diagnostic snapshot of the news pipeline: " +
    "rag_analyses row counts for today/yesterday (GMT+7), last insert timestamp, " +
    "per-source breakdown, VPS push count (24h), and evening report last run time. " +
    "Use this to detect silent pipeline failures without SSH access.",
  {},   // zero required parameters
  async () => {
    try {
      const result = await getPipelineHealth();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      logger.error("[get_pipeline_health] Unexpected error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        content: [{
          type: "text" as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
      };
    }
  },
);
```

`getPipelineHealth` must be imported at the top of `systemTools.ts`:

```typescript
import { getPipelineHealth } from "../../../application/usecases/getPipelineHealth.js";
```

---

## Test Fixture Design (`src/__tests__/1189-pipeline-health.test.ts`)

### File header

```typescript
process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getPipelineHealth } from "../application/usecases/getPipelineHealth.js";
```

### Minimal schema builder

Tests only create the tables that `getPipelineHealth` actually reads. This avoids coupling to
the full 1 000-line production schema and makes test failures unambiguous.

```typescript
function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE rag_analyses (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      source_url TEXT
    );
    CREATE INDEX idx_rag_created ON rag_analyses(created_at);

    CREATE TABLE vps_push_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      service   TEXT NOT NULL,
      status    TEXT NOT NULL DEFAULT 'ok',
      pushed_at TEXT NOT NULL
    );
  `);
  return db;
}
```

### Fixed clock

All tests pass `nowMs` corresponding to a fixed point in Vietnamese trading hours to make
day-boundary assertions deterministic:

```typescript
// 2026-04-13 10:00:00 ICT  =  2026-04-13 03:00:00 UTC
const NOW_MS = Date.parse("2026-04-13T03:00:00.000Z");

// GMT+7 day boundary for 2026-04-13
const TODAY_START_ISO    = "2026-04-12T17:00:00.000Z";  // midnight 2026-04-13 ICT
const YESTERDAY_START_ISO = "2026-04-11T17:00:00.000Z"; // midnight 2026-04-12 ICT
```

### Test cases

**AC-2 / empty table**

```typescript
it("returns zeros and nulls when rag_analyses is empty", async () => {
  const db = buildDb();
  const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });

  expect(r.ragRows.today).toBe(0);
  expect(r.ragRows.yesterday).toBe(0);
  expect(r.ragRows.lastInsertedAt).toBeNull();
  expect(r.ragRows.staleMins).toBeNull();
  expect(r.sources).toEqual([]);
  expect(r.vpsPushLast24h).toBe(0);       // table exists, no rows
  expect(r.eveningReportLastRun).toBeNull();
  expect(typeof r.generatedAt).toBe("string");
});
```

**AC-1 / normal data**

```typescript
it("counts today vs yesterday correctly across the GMT+7 boundary", async () => {
  const db = buildDb();

  // 5 rows today (ICT)
  for (let i = 0; i < 5; i++) {
    db.run(
      "INSERT INTO rag_analyses (id, created_at, source_url) VALUES (?, ?, ?)",
      [`today-${i}`, `2026-04-13T0${i}:00:00.000Z`, `https://cafef.vn/story/${i}`],
    );
  }
  // 3 rows yesterday (ICT) — between 2026-04-11T17:00Z and 2026-04-12T17:00Z
  for (let i = 0; i < 3; i++) {
    db.run(
      "INSERT INTO rag_analyses (id, created_at, source_url) VALUES (?, ?, ?)",
      [`yest-${i}`, `2026-04-12T0${i}:00:00.000Z`, `https://vnexpress.net/s/${i}`],
    );
  }
  // 2 ok VPS news pushes in last 24h
  for (let i = 0; i < 2; i++) {
    db.run(
      "INSERT INTO vps_push_log (service, status, pushed_at) VALUES (?, ?, ?)",
      ["news", "ok", `2026-04-13T0${i}:30:00.000Z`],
    );
  }

  const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });

  expect(r.ragRows.today).toBe(5);
  expect(r.ragRows.yesterday).toBe(3);
  expect(r.ragRows.lastInsertedAt).not.toBeNull();
  expect(r.ragRows.staleMins).toBeGreaterThanOrEqual(0);
  expect(r.vpsPushLast24h).toBe(2);

  const total = r.sources.reduce((s, x) => s + x.count, 0);
  expect(total).toBe(5);  // all today's rows accounted for
  expect(r.sources[0]!.count).toBeGreaterThanOrEqual(r.sources.at(-1)!.count);  // DESC
});
```

**AC-3 / vps_push_log absent**

```typescript
it("returns vpsPushLast24h=null when vps_push_log table does not exist", async () => {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE rag_analyses (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, source_url TEXT
  )`);
  // deliberately omit vps_push_log

  const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });
  expect(r.vpsPushLast24h).toBeNull();
});
```

**AC-4 / per-source domain extraction**

```typescript
it("groups source_url by hostname and places nulls under (unknown)", async () => {
  const db = buildDb();

  const rows: [string, string | null][] = [
    ["r1", "https://cafef.vn/a/1"],
    ["r2", "https://cafef.vn/a/2"],
    ["r3", "https://vnexpress.net/b/1"],
    ["r4", null],                       // null source_url → (unknown)
  ];
  for (const [id, url] of rows) {
    db.run(
      "INSERT INTO rag_analyses (id, created_at, source_url) VALUES (?, ?, ?)",
      [id, "2026-04-13T02:00:00.000Z", url],
    );
  }

  const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });

  expect(r.sources).toEqual([
    { source: "cafef.vn",      count: 2 },
    { source: "vnexpress.net", count: 1 },
    { source: "(unknown)",     count: 1 },
  ]);
});
```

**Midnight boundary crossing**

```typescript
it("switches today/yesterday correctly at the GMT+7 midnight boundary", async () => {
  const db = buildDb();

  // One row at 23:59 ICT 2026-04-12 = 2026-04-12T16:59:00Z (still yesterday)
  db.run("INSERT INTO rag_analyses (id, created_at) VALUES (?, ?)",
    ["late", "2026-04-12T16:59:00.000Z"]);

  // One row at 00:01 ICT 2026-04-13 = 2026-04-12T17:01:00Z (today)
  db.run("INSERT INTO rag_analyses (id, created_at) VALUES (?, ?)",
    ["early", "2026-04-12T17:01:00.000Z"]);

  const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });
  expect(r.ragRows.today).toBe(1);
  expect(r.ragRows.yesterday).toBe(1);
});
```

**staleMins clamped to 0 on clock skew**

```typescript
it("clamps staleMins to 0 when created_at is in the future (clock drift)", async () => {
  const db = buildDb();

  // Row 5 minutes in the future relative to NOW_MS
  const futureIso = new Date(NOW_MS + 5 * 60_000).toISOString();
  db.run("INSERT INTO rag_analyses (id, created_at) VALUES (?, ?)", ["future", futureIso]);

  const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });
  expect(r.ragRows.staleMins).toBe(0);
});
```

**VPS failed pushes not counted**

```typescript
it("excludes failed VPS pushes from vpsPushLast24h count", async () => {
  const db = buildDb();

  db.run("INSERT INTO vps_push_log (service, status, pushed_at) VALUES (?, ?, ?)",
    ["news", "error", "2026-04-13T01:00:00.000Z"]);
  db.run("INSERT INTO vps_push_log (service, status, pushed_at) VALUES (?, ?, ?)",
    ["news", "ok", "2026-04-13T02:00:00.000Z"]);

  const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });
  expect(r.vpsPushLast24h).toBe(1);  // only the ok row counted
});
```

---

## Full Execution Flow (production path)

```
Claude Desktop
  → MCP call: get_pipeline_health (no args)
  → registerSystemTools handler (systemTools.ts)
  → getPipelineHealth({ /* no injections → all defaults */ })
      ├─ lazy-load getDb()                         [infrastructure]
      ├─ compute todayStartIso, yesterdayStartIso  [TypeScript — no SQLite TZ]
      ├─ SQL: COUNT today rows        (idx_rag_created, < 5 ms)
      ├─ SQL: COUNT yesterday rows    (idx_rag_created, < 5 ms)
      ├─ SQL: SELECT MAX created_at   (idx_rag_created, < 1 ms)
      ├─ SQL: SELECT source_url today (idx_rag_created, < 10 ms)
      │    └─ extractDomain() per row [in TypeScript]
      ├─ SQL: COUNT vps_push_log      (idx_vpl_service_ts, < 5 ms)
      │    └─ try/catch → null if table absent
      └─ fs: readdirSync + statSync   (reports/*.json, < 1 ms)
  → PipelineHealthResult assembled
  → JSON.stringify(result, null, 2)
  → MCP content: [{ type: "text", text: "..." }]
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| `idx_rag_created` missing (fresh install, schema migration lag) | Low | Medium | Both COUNT queries degrade to a full scan — still correct, just slower. Documented in NFR. Index is in `schema.ts` so it is created at boot. |
| `vps_push_log.pushed_at` stored as ISO 8601 string vs SQLite numeric | Low | High | Confirmed column is `TEXT` with ISO 8601 values (schema.ts line 837). String comparison is lexicographically correct for ISO 8601. |
| `source_url` contains percent-encoded or relative URLs | Medium | Low | `new URL()` throws on non-absolute URLs; catch returns `"(unknown)"` per spec. Tested in AC-4. |
| `reports/` directory does not exist on fresh install | Medium | Low | `readdirSync` inside try/catch returns null — no throw. Tested via `reportsDir: "/nonexistent"`. |
| Clock skew: VPS pushes `created_at` ahead of local `nowMs` | Low | Low | `staleMins` clamped to `Math.max(0, ...)` per edge-case spec. |
| Large `rag_analyses` table (> 100k rows): source_url SELECT today | Low | Low | Bounded by `created_at >= todayStartIso` on an indexed column. Today's rows are a small fraction. |

---

## Security Review

- SQL parameterized? **Yes** — all queries use typed parameterized bindings. No user input flows into SQL (tool has zero parameters).
- File paths validated (no `../`)? **Yes** — `reportsDir` is only passed in tests and defaults to `join(process.cwd(), "reports")`. `readdirSync` is called on the directory; individual filenames are filtered with `.endsWith("-evening.json")` before `join`. No path traversal possible.
- External HTTP rate-limited? **N/A** — no HTTP calls.
- Secrets via `Bun.env` only? **Yes** — no secrets accessed.

---

## Task Breakdown (for PM / Dev)

Single atomic task — no internal dependencies:

| Task | Action | File |
| ---- | ------ | ---- |
| 1189-a | Create use case | `src/application/usecases/getPipelineHealth.ts` |
| 1189-b | Update barrel export | `src/application/usecases/index.ts` |
| 1189-c | Register tool | `src/interface/mcp/tools/systemTools.ts` |
| 1189-d | Write tests (TDD — write first) | `src/__tests__/1189-pipeline-health.test.ts` |
| 1189-e | Update registries | `docs/data/tool-registry.json`, `docs/data/project-stats.json` |

Suggested implementation order: **1189-d → 1189-a → 1189-b → 1189-c → 1189-e** (TDD: tests
fail first, then use case makes them pass, then wire the tool, then update counters).
