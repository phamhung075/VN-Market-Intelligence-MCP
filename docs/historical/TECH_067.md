# TECH-067: Morning Briefing Intelligence Enrichment

status: APPROVED_BY_ARCHITECT
req_ref: REQ-067

---

## Brownfield Impact

- Files modified:
  - `src/application/usecases/assembleBriefing.ts` — type extension + 3 new query steps
  - `src/scheduler/morningBriefingJob.ts` — 3 new Telegram section renderers
- Files created:
  - `src/__tests__/1159-morning-briefing-enrichment.test.ts` — TDD test file
- Files deleted: none
- Breaking changes: no — all three new `DailyBriefing` fields are optional (`?`), so
  existing persisted JSON files under `data/briefings/` deserialise without error.

---

## Architecture Decision

The three new data signals (insider transactions, foreign flow, evidence scores) are
already populated by existing jobs (`insiderCheckJob`, `foreignFlowAlertJob`,
`evidenceAccumulatorJob`) into production SQLite tables. The correct pattern — matching
Steps 10–13 in `assembleBriefing()` — is to add read-only, best-effort query blocks at
the application layer and extend `DailyBriefing` with optional fields. No new ports,
adapters, or domain services are required; this is a pure enrichment of the existing
briefing assembly pipeline.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| InsiderBriefingRow, ForeignFlowBriefingRow, EvidenceScoreBriefingRow types | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| DailyBriefing extension (3 optional fields) | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| queryInsiderRecent() helper | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| queryForeignFlowSummary() helper | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| queryEvidenceTopScores() helper | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| assembleBriefing() Steps 14-16 | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| Telegram section renderers (3 sections) | interface/scheduler | `src/scheduler/morningBriefingJob.ts` | MODIFY |
| Test suite | tests | `src/__tests__/1159-morning-briefing-enrichment.test.ts` | NEW |

---

## Interface Contracts

### New exported types (add to `assembleBriefing.ts` after existing type declarations)

```typescript
export interface InsiderBriefingRow {
  /** Stock ticker, e.g. "VCB" */
  code: string;
  /** "buy" | "sell" | "other" */
  type: string;
  /** executed_volume from insider_transactions */
  executedVolume: number;
  /** insider_name from insider_transactions */
  insiderName: string;
  /** from_date (YYYY-MM-DD) from insider_transactions */
  fromDate: string;
}

export interface ForeignFlowBriefingRow {
  /** Stock ticker */
  code: string;
  /** "net_buy" | "net_sell" */
  direction: "net_buy" | "net_sell";
  /** foreign_volume for the queried date (raw signed value, abs in display) */
  foreignVolume: number;
  /** Date of the data point (YYYY-MM-DD, derived from fetched_at) */
  date: string;
}

export interface EvidenceScoreBriefingRow {
  /** Stock ticker */
  code: string;
  /** bullish_score - bearish_score */
  netScore: number;
  /** Raw bullish_score */
  bullishScore: number;
  /** Raw bearish_score */
  bearishScore: number;
  /** fragment_count for this score row */
  fragmentCount: number;
  /** score_date (YYYY-MM-DD) */
  scoreDate: string;
}
```

### DailyBriefing extension (append after `portfolioPnl?` field)

```typescript
/** Insider transactions fetched_at in the last 24h, up to 3, for watchlist stocks */
insiderRecent?: InsiderBriefingRow[];

/** Foreign flow summary for the previous trading day, watchlist stocks only */
foreignFlowSummary?: ForeignFlowBriefingRow[];

/** Top evidence scores (bullish leaders + bearish warnings), latest score_date per stock */
evidenceTopScores?: EvidenceScoreBriefingRow[];
```

### New internal SQLite row types (add to internal row types section)

```typescript
interface InsiderTransactionRow {
  code: string;
  type: string;
  executed_volume: number;
  insider_name: string;
  from_date: string;
}

interface VnstatsRow {
  code: string;
  date: string;
  foreign_volume: number;
}

interface EvidenceScoreRow {
  code: string;
  score_date: string;
  bullish_score: number;
  bearish_score: number;
  fragment_count: number;
}
```

### New private query helper function signatures

All three helpers are module-private (not exported), placed in the `// Helpers` section
of `assembleBriefing.ts` alongside `midnightVietnamAsUtc()` and `todayVietnam()`.

```typescript
/**
 * Query insider_transactions for watchlist stocks active in the last 24h.
 * Returns at most 3 rows ordered by executed_volume DESC.
 * Returns [] when watchlist is empty or no rows match.
 */
function queryInsiderRecent(
  db: Database,
  watchlistCodes: string[],
): InsiderBriefingRow[]

/**
 * Query vnstock_trading_stats for the most-recent foreign_volume per watchlist stock.
 * Returns top 3 net-buy + top 3 net-sell rows (up to 6 total).
 * Excludes rows where foreign_volume = 0 or NULL.
 * Returns [] when watchlist is empty or no qualifying rows exist.
 */
function queryForeignFlowSummary(
  db: Database,
  watchlistCodes: string[],
): ForeignFlowBriefingRow[]

/**
 * Query evidence_scores for the most-recent score per watchlist stock.
 * Returns top 3 bullish leaders (netScore > 0, fragment_count >= 1) +
 * all bearish warnings (netScore < BEARISH_WARNING_THRESHOLD, fragment_count >= 1).
 * Deduplicates: bearish takes priority if a stock qualifies for both.
 * Returns [] when watchlist is empty or no qualifying rows exist.
 */
function queryEvidenceTopScores(
  db: Database,
  watchlistCodes: string[],
): EvidenceScoreBriefingRow[]
```

### Named constant (add near top of `assembleBriefing.ts`)

```typescript
/** Net bearish weight threshold below which a stock is flagged as a bearish warning. */
const BEARISH_WARNING_THRESHOLD = -2.0;
```

---

## assembleBriefing() Changes — Where to Insert Steps 14–16

**Current structure of the function tail** (lines ~560–643):

```
Step 12: Prediction market signals
Step 13a: Portfolio P&L snapshot
Step 13: Persist briefing (construct briefing object, writeFileSync, return)
```

**Required insertion point**: between Step 13a (portfolioPnl) and Step 13 (persist).
The three new steps must run AFTER `watchlistRows` is populated (Step 5) and AFTER
portfolioPnl (Step 13a). They must run BEFORE the `briefing` object is constructed so
that the new fields are included in the persisted JSON.

**Step 14 block** (insert after the portfolioPnl try/catch block, before `const date = todayVietnam()`):

```typescript
// ── Step 14: Insider transactions (last 24h, watchlist only) ─────────────────
let insiderRecent: InsiderBriefingRow[] = [];
try {
  insiderRecent = queryInsiderRecent(
    db,
    watchlistRows.map((r) => r.code),
  );
} catch (insiderErr) {
  logger.warn("[assembleBriefing] insiderRecent step failed", {
    error: insiderErr instanceof Error ? insiderErr.message : String(insiderErr),
  });
}

// ── Step 15: Foreign flow summary (previous trading day, watchlist only) ──────
let foreignFlowSummary: ForeignFlowBriefingRow[] = [];
try {
  foreignFlowSummary = queryForeignFlowSummary(
    db,
    watchlistRows.map((r) => r.code),
  );
} catch (ffErr) {
  logger.warn("[assembleBriefing] foreignFlowSummary step failed", {
    error: ffErr instanceof Error ? ffErr.message : String(ffErr),
  });
}

// ── Step 16: Evidence top scores (bullish leaders + bearish warnings) ─────────
let evidenceTopScores: EvidenceScoreBriefingRow[] = [];
try {
  evidenceTopScores = queryEvidenceTopScores(
    db,
    watchlistRows.map((r) => r.code),
  );
} catch (esErr) {
  logger.warn("[assembleBriefing] evidenceTopScores step failed", {
    error: esErr instanceof Error ? esErr.message : String(esErr),
  });
}
```

**briefing object construction** — extend the `DailyBriefing` literal to include the
three new fields:

```typescript
const briefing: DailyBriefing = {
  date,
  ...(vnIndex !== undefined ? { vnIndex } : {}),
  topStories,
  alerts,
  watchlistSummary,
  newReports,
  macroSnapshot,
  sensitiveWarnings,
  trackedCommodities,
  unresolvedAlerts,
  topConviction,
  predictionSignals,
  portfolioPnl,
  insiderRecent,          // NEW
  foreignFlowSummary,     // NEW
  evidenceTopScores,      // NEW
  generatedAt,
};
```

---

## Query Helper Implementations

### queryInsiderRecent

```typescript
function queryInsiderRecent(
  db: Database,
  watchlistCodes: string[],
): InsiderBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const placeholders = watchlistCodes.map(() => "?").join(", ");
  const rows = db
    .prepare<InsiderTransactionRow, unknown[]>(`
      SELECT code, type, executed_volume, insider_name, from_date
      FROM insider_transactions
      WHERE fetched_at >= ?
        AND code IN (${placeholders})
      ORDER BY executed_volume DESC
      LIMIT 3
    `)
    .all(since24h, ...watchlistCodes);
  return rows.map((r) => ({
    code: r.code,
    type: r.type,
    executedVolume: r.executed_volume,
    insiderName: r.insider_name,
    fromDate: r.from_date,
  }));
}
```

### queryForeignFlowSummary

```typescript
function queryForeignFlowSummary(
  db: Database,
  watchlistCodes: string[],
): ForeignFlowBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const placeholders = watchlistCodes.map(() => "?").join(", ");
  const rows = db
    .prepare<VnstatsRow, unknown[]>(`
      SELECT code,
             substr(fetched_at, 1, 10) AS date,
             foreign_volume
      FROM vnstock_trading_stats
      WHERE code IN (${placeholders})
        AND foreign_volume IS NOT NULL
        AND foreign_volume != 0
        AND (code, fetched_at) IN (
              SELECT code, MAX(fetched_at)
              FROM vnstock_trading_stats
              WHERE code IN (${placeholders})
              GROUP BY code
            )
      ORDER BY foreign_volume DESC
    `)
    .all(...watchlistCodes, ...watchlistCodes);

  const netBuyRows = rows
    .filter((r) => r.foreign_volume > 0)
    .slice(0, 3)
    .map((r): ForeignFlowBriefingRow => ({
      code: r.code,
      direction: "net_buy",
      foreignVolume: r.foreign_volume,
      date: r.date,
    }));

  // rows is ordered DESC so most-negative values are at the end
  const netSellRows = rows
    .filter((r) => r.foreign_volume < 0)
    .slice(-3)
    .map((r): ForeignFlowBriefingRow => ({
      code: r.code,
      direction: "net_sell",
      foreignVolume: r.foreign_volume,
      date: r.date,
    }));

  return [...netBuyRows, ...netSellRows];
}
```

Note: the REQ states "take last 3" for net-sell (rows ordered ASC = most negative first).
The SQL already orders `foreign_volume DESC`, so the most-negative values are at the tail.
`slice(-3)` gives the 3 most-negative rows. If there are fewer than 3 negative rows,
`slice(-3)` returns all of them — correct behaviour.

### queryEvidenceTopScores

```typescript
function queryEvidenceTopScores(
  db: Database,
  watchlistCodes: string[],
): EvidenceScoreBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const placeholders = watchlistCodes.map(() => "?").join(", ");
  const rows = db
    .prepare<EvidenceScoreRow, unknown[]>(`
      SELECT stock AS code,
             score_date,
             bullish_score,
             bearish_score,
             fragment_count
      FROM evidence_scores
      WHERE stock IN (${placeholders})
        AND (stock, score_date) IN (
              SELECT stock, MAX(score_date)
              FROM evidence_scores
              WHERE stock IN (${placeholders})
              GROUP BY stock
            )
    `)
    .all(...watchlistCodes, ...watchlistCodes);

  const enriched = rows
    .filter((r) => r.fragment_count >= 1)
    .map((r) => ({
      code: r.code,
      netScore: r.bullish_score - r.bearish_score,
      bullishScore: r.bullish_score,
      bearishScore: r.bearish_score,
      fragmentCount: r.fragment_count,
      scoreDate: r.score_date,
    }));

  const bearishWarnings = enriched.filter(
    (r) => r.netScore < BEARISH_WARNING_THRESHOLD,
  );
  const bearishCodes = new Set(bearishWarnings.map((r) => r.code));

  const bullishLeaders = enriched
    .filter((r) => r.netScore > 0 && !bearishCodes.has(r.code))
    .sort((a, b) => b.netScore - a.netScore)
    .slice(0, 3);

  return [...bullishLeaders, ...bearishWarnings];
}
```

---

## Telegram Formatter Changes

### Insertion point in `morningBriefingJob.ts`

The three new section blocks must be appended **after** the `// ── New reports` block
(after the `}` that closes the `if (briefing.newReports.length > 0)` block) and
**before** `const text = lines.join("\n")`.

### Section 1 — Insider Moi

```typescript
// ── Insider Mới ──────────────────────────────────────────────────────────────
if (briefing.insiderRecent && briefing.insiderRecent.length > 0) {
  lines.push("");
  lines.push("👤 Insider Mới:");
  for (const row of briefing.insiderRecent) {
    const typeLabel =
      row.type === "buy" ? "MUA" : row.type === "sell" ? "BÁN" : "KHÁC";
    const vol = row.executedVolume.toLocaleString("en-US");
    lines.push(`  ${row.code}: ${typeLabel} ${vol} cp — ${row.insiderName}`);
  }
}
```

### Section 2 — Dong Tien Ngoai

```typescript
// ── Dòng Tiền Ngoại ──────────────────────────────────────────────────────────
if (briefing.foreignFlowSummary && briefing.foreignFlowSummary.length > 0) {
  lines.push("");
  lines.push("🌊 Dòng Tiền Ngoại:");
  for (const row of briefing.foreignFlowSummary) {
    const dirLabel = row.direction === "net_buy" ? "MUA RÒNG" : "BÁN RÒNG";
    const vol = Math.abs(row.foreignVolume).toLocaleString("en-US");
    lines.push(`  ${row.code}: ${dirLabel} ${vol}`);
  }
}
```

### Section 3 — Tich Luy Bang Chung

```typescript
// ── Tích Lũy Bằng Chứng ──────────────────────────────────────────────────────
if (briefing.evidenceTopScores && briefing.evidenceTopScores.length > 0) {
  lines.push("");
  lines.push("🧠 Tích Lũy Bằng Chứng:");
  for (const row of briefing.evidenceTopScores) {
    const icon =
      row.netScore > 0 ? "🟢" : row.netScore < BEARISH_WARNING_THRESHOLD ? "🔴" : "⚪";
    lines.push(
      `  ${icon} ${row.code}: net=${row.netScore.toFixed(2)} ` +
        `(bull=${row.bullishScore.toFixed(2)}/bear=${row.bearishScore.toFixed(2)}, ` +
        `${row.fragmentCount} mảnh)`,
    );
  }
}
```

Note: `BEARISH_WARNING_THRESHOLD` is defined in `assembleBriefing.ts` (not
`morningBriefingJob.ts`). For the Telegram formatter, use the literal `-2.0` or import
the constant. The simplest approach: import the constant from `assembleBriefing.ts`. If
not exported, use the literal `-2.0` inline and add a comment referencing the constant.
Preferred: export `BEARISH_WARNING_THRESHOLD` from `assembleBriefing.ts` and import it
in `morningBriefingJob.ts`.

---

## hasContent Guard — No Change Required

FR-6 is explicit: the three new arrays must NOT be added to the `hasContent` check.
The guard at line 91–97 of `morningBriefingJob.ts` remains unchanged.

---

## Task Breakdown (Dependency Order)

| ID | Title | Layer | Depends On |
|----|-------|-------|------------|
| 1159 | TDD: write failing tests for all 3 new briefing sections (AC-1 through AC-6) | tests | — |
| 1160 | Extend DailyBriefing type + add 3 query steps to assembleBriefing.ts (FR-1 to FR-4) | application | 1159 |
| 1161 | Render 3 new Telegram sections in morningBriefingJob.ts (FR-5) | interface/scheduler | 1160 |
| 1162 | Advance project-stats.json currentSprint 67, update lastUpdated | docs/data | 1161 |

Implementation order enforces TDD: 1159 must be committed with red tests, 1160 makes
them green, 1161 adds integration formatting, 1162 closes the sprint.

All four tasks fit on a single branch `task/1159-morning-briefing-enrichment`.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `IN ()` SQL error when watchlist is empty | High (predictable) | High | Guard at top of every helper: `if (watchlistCodes.length === 0) return []` |
| `vnstock_trading_stats` uses `date` column but REQ uses `fetched_at` for MAX | Low | High | Schema confirmed: table has both `date TEXT` and `fetched_at TEXT`. REQ-067 query uses `MAX(fetched_at)` for recency — correct because `date` is the VPS-reported trading date but `fetched_at` is the insertion timestamp and reflects actual data freshness. Both approaches are valid; use REQ's spec verbatim. |
| Race condition: `insiderCheckJob` fires at 08:00 VN same as briefing | Medium | Low | Accepted — documented in REQ-067 edge cases. `insiderRecent = []` is correct on first-day overlap. |
| `evidence_scores` not populated on first deploy (no `evidenceAccumulatorJob` run yet) | High (first day) | Low | Empty-state guard returns `[]` without error. Correct by spec. |
| `bun:sqlite` parameterised `IN` with spread args | Medium | High | Pattern already used by `foreignFlowAlertJob` and `insiderCheckJob` in production — validated working. Use `...watchlistCodes` spread to `db.prepare(...).all(...params)`. |
| TypeScript type error: `unknown[]` params type for variadic prepare | Low | Medium | Use `db.prepare<RowType, unknown[]>` — matches pattern in existing query helpers across the codebase. |

---

## Security Review

- SQL parameterized? Yes — all three helpers use `?` placeholders with spread positional params; no string interpolation of user input.
- File paths validated (no `../`)? N/A — no file path input in this feature.
- External HTTP rate-limited? N/A — all three steps are read-only SQLite queries, no HTTP.
- Secrets via Bun.env only? N/A — no new secrets introduced.
