# TECH_057 — Prediction Engine Phase A: Evidence Accumulation Store

status: APPROVED
created: 2026-04-12
sprint: 057
req: docs/REQ_057.md (Phase A only)

---

## Scope

Three tasks in DDD order:

| Task | Layer | File(s) | Size |
|------|-------|---------|------|
| 1116 | infrastructure/db | evidenceFragmentStore.ts + schema.ts | M |
| 1117 | interface/mcp | evidenceTools.ts + server.ts | S |
| 1118 | scheduler | evidenceAccumulatorJob.ts + jobs.ts | M |

Foreign flow (Phase A task 1114 from REQ): DEFERRED — not in TECH_057. Requires Architect confirmation of VPS proxy extension feasibility.

---

## Task 1116 — evidence_fragments DDL + evidenceFragmentStore CRUD

### DDL (add to `initDatabase()` in `src/infrastructure/db/schema.ts`)

```sql
CREATE TABLE IF NOT EXISTS evidence_fragments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  stock          TEXT NOT NULL,
  evidence_type  TEXT NOT NULL,
  direction      TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
  magnitude      REAL NOT NULL CHECK(magnitude BETWEEN 0.0 AND 1.0),
  confidence     REAL NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
  timestamp      TEXT NOT NULL,
  source_agent   TEXT NOT NULL,
  ttl_days       INTEGER NOT NULL DEFAULT 30,
  expires_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ef_stock_ts  ON evidence_fragments(stock, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ef_expires   ON evidence_fragments(expires_at);
```

```sql
CREATE TABLE IF NOT EXISTS evidence_scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  stock         TEXT NOT NULL,
  score_date    TEXT NOT NULL,
  bullish_score REAL NOT NULL DEFAULT 0.0,
  bearish_score REAL NOT NULL DEFAULT 0.0,
  neutral_score REAL NOT NULL DEFAULT 0.0,
  fragment_count INTEGER NOT NULL DEFAULT 0,
  computed_at   TEXT NOT NULL,
  UNIQUE(stock, score_date)
);
CREATE INDEX IF NOT EXISTS idx_es_stock ON evidence_scores(stock, score_date DESC);
```

### Store file: `src/infrastructure/db/evidenceFragmentStore.ts`

Exported functions:
```typescript
insertEvidenceFragment(db, fragment: EvidenceFragmentInput): number
// Returns inserted row id

getEvidenceFragments(db, stock: string, options?: { days?: number; evidenceTypes?: string[] }): EvidenceFragmentRow[]
// Returns fragments for stock, newest first, optionally filtered. Default days=30.

purgeExpiredFragments(db): number
// Deletes rows where expires_at < now. Returns deleted count.

upsertEvidenceScore(db, stock: string, scoreDate: string, scores: EvidenceScores): void
// INSERT OR REPLACE into evidence_scores.

getLatestEvidenceScore(db, stock: string): EvidenceScoreRow | null
// Returns most recent evidence_scores row for the stock.
```

### Types

```typescript
export interface EvidenceFragmentInput {
  stock: string;
  evidence_type: string;
  direction: "bullish" | "bearish" | "neutral";
  magnitude: number;       // 0.0–1.0
  confidence: number;      // 0.0–1.0
  source_agent: string;
  ttl_days?: number;       // default 30
}

export interface EvidenceFragmentRow extends EvidenceFragmentInput {
  id: number;
  timestamp: string;       // ISO 8601 UTC
  expires_at: string;      // ISO 8601 UTC = timestamp + ttl_days
}

export interface EvidenceScores {
  bullish: number;   // weighted avg: sum(magnitude * confidence) for bullish
  bearish: number;   // weighted avg: sum(magnitude * confidence) for bearish
  neutral: number;   // same for neutral
  fragmentCount: number;
}

export interface EvidenceScoreRow extends EvidenceScores {
  id: number;
  stock: string;
  score_date: string;
  computed_at: string;
}
```

### DDD constraint

`evidenceFragmentStore.ts` is infrastructure — no domain imports. All DB access via parameterized bindings.

### evidence_type canonical values (soft enum — CHECK not enforced, BA decision)

Common values: `news_sentiment_macro`, `news_sentiment_stock`, `bctc_revenue_growth`, `bctc_pe_ratio`, `bctc_debt_equity`, `price_momentum_5d`, `price_momentum_20d`, `kinh_dich_signal`. Not enforced by DB CHECK (tool validates by convention; extensible without migration).

---

## Task 1117 — record_evidence_fragment MCP Tool

### New file: `src/interface/mcp/tools/evidenceTools.ts`

Single tool registered:

```typescript
server.tool(
  "record_evidence_fragment",
  "Store an evidence fragment for a stock from an analysis agent. Used by News Scout, BCTC Collector, Market Watcher, Alert Commander agents to accumulate directional evidence.",
  {
    stock: z.string(),
    evidence_type: z.string(),
    direction: z.enum(["bullish", "bearish", "neutral"]),
    magnitude: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    source_agent: z.string(),
    ttl_days: z.number().int().min(1).max(365).default(30).optional(),
  },
  async ({ stock, evidence_type, direction, magnitude, confidence, source_agent, ttl_days }) => {
    // insertEvidenceFragment → return "Fragment recorded: id={id}"
  }
)
```

Register in `src/interface/mcp/server.ts` alongside existing tool registrations. `toolCount` → 85.

---

## Task 1118 — evidenceAccumulatorJob + evidence_scores table

### New file: `src/scheduler/evidenceAccumulatorJob.ts`

```typescript
export async function runEvidenceAccumulator(db?: Database): Promise<{ stocks: number; purged: number }> {
  // 1. purgeExpiredFragments(db) → purged count
  // 2. Get distinct stocks from evidence_fragments (last 30d)
  // 3. For each stock:
  //    a. getEvidenceFragments(db, stock, { days: 30 })
  //    b. Compute weighted scores:
  //       bullish_score = sum(mag * conf for bullish) / max(1, bullish_count)
  //       bearish_score = sum(mag * conf for bearish) / max(1, bearish_count)
  //       neutral_score = sum(mag * conf for neutral) / max(1, neutral_count)
  //    c. upsertEvidenceScore(db, stock, today, scores)
  // 4. Return { stocks: processed_count, purged }
}
```

### Register cron in `src/scheduler/jobs.ts`

Add to CRONS map:
```typescript
"evidenceAccumulator": process.env["CRON_EVIDENCE_ACCUMULATOR"] ?? "0 16 * * *", // 23:00 VN = 16:00 UTC
```

Wrap with `recordJobRun(db, "evidenceAccumulatorJob", ...)`.

---

## Test Files

| Task | Test file |
|------|-----------|
| 1116 | `src/__tests__/1116-evidence-fragment-store.test.ts` |
| 1117 | `src/__tests__/1117-evidence-tools.test.ts` |
| 1118 | `src/__tests__/1118-evidence-accumulator-job.test.ts` |

---

## Acceptance Criteria Summary

### Task 1116
- `initDatabase()` creates `evidence_fragments` + `evidence_scores` tables
- `insertEvidenceFragment` sets `expires_at = timestamp + ttl_days days`
- `getEvidenceFragments` returns newest-first, respects days filter
- `purgeExpiredFragments` deletes expired rows, returns count
- `upsertEvidenceScore` upserts by (stock, score_date)
- All: `bun tsc --noEmit` → 0 errors

### Task 1117
- `record_evidence_fragment(stock="VCB", evidence_type="news_sentiment_stock", direction="bullish", magnitude=0.7, confidence=0.8, source_agent="04-market-watcher")` → inserts row, returns success message with id
- Bad magnitude (> 1.0) → Zod validation error
- Tool registered in server.ts, health endpoint shows toolCount=85

### Task 1118
- `runEvidenceAccumulator()` with 3 bullish + 1 bearish fragment for "VCB":
  - `evidence_scores` row for VCB today: bullish_score > 0, bearish_score > 0
  - `fragment_count = 4`
- Expired fragments purged before accumulation
- CRONS map contains "evidenceAccumulator" key
- `bun tsc --noEmit` → 0 errors

---

## Architecture Notes

- DDD layer order respected: store (infrastructure) → tool (interface) → job (scheduler)
- No circular imports: `evidenceAccumulatorJob.ts` imports `evidenceFragmentStore.ts` (infra), not the other way
- Tool count: 84 → 85 after task 1117
- `evidence_scores` upsert uses `INSERT OR REPLACE` (UNIQUE on stock+date)
