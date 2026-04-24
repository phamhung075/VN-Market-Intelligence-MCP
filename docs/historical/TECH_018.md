# TECH-018: Scheduled Database Audit & Cleanup Job

status: APPROVED_BY_ARCHITECT
req_ref: REQ-018
sprint: 018
date: 2026-04-01

---

## Brownfield Impact

- **Files created**:
  - `src/scheduler/dataAuditJob.ts` — core audit engine (daily + weekly checks, agent_feedback inserts, system_logs write, Telegram summary, audit_state upsert)
  - `src/__tests__/157-data-audit-job.test.ts` — TDD test suite for AC-1 through AC-12

- **Files modified**:
  - `src/infrastructure/db/schema.ts` — add `market_prices_history` canonical DDL (FR-10) and the `exchange` column ALTER TABLE migration
  - `src/infrastructure/rag/vectorstore.ts` — add `getCount(): Promise<number>` export (FR-5 / W-7)
  - `src/scheduler/jobs.ts` — add `dataAuditDaily` and `dataAuditWeekly` to `CRONS` constant and register both cron entries in `startScheduler()` (FR-13)
  - `src/interface/mcp/tools/systemTools.ts` — append `--- DB Audit ---` section to `get_system_health` response (FR-12)

- **Files deleted**: none

- **Breaking changes**: no. All changes are additive. `getCount()` is a new export on `vectorstore.ts`; existing exports are untouched. The `CRONS` object gains two new keys but the log line count updates from 6 to 8. `get_system_health` output is extended but its tool signature is unchanged.

---

## Architecture Decision

The audit job follows the established pattern of `intelligenceCycleJob.ts` and `sscCheckerJob.ts`: a single self-contained scheduler module under `src/scheduler/` that calls `getDb()` directly without going through a store adapter. This is the correct DDD placement because the audit reads raw table internals (not business entities) and performs hard deletes that have no business-logic representation in `domain/`. Extracting a `src/infrastructure/db/auditStore.ts` would add indirection with no benefit for a standalone, internally-used job.

The `AuditFinding` interface is defined and exported from `dataAuditJob.ts` rather than promoted to `src/domain/models/index.ts` because it is not a business entity — it is an operational report artefact consumed exclusively within the scheduler/infrastructure boundary. The existing `agent_feedback` table, accessed via direct SQL (not via the `submit_feedback` MCP endpoint), serves as the human-visible escalation channel for findings that require operator judgment.

`audit_state` is a singleton-row table created lazily inside `dataAuditJob.ts` (not in `schema.ts`) per the PO decision, keeping the schema migration scope minimal.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `AuditFinding` interface | scheduler (operational type) | `src/scheduler/dataAuditJob.ts` | NEW (exported) |
| `INDICATOR_RANGES` constants | scheduler | `src/scheduler/dataAuditJob.ts` | NEW |
| `runDailyAudit()` | scheduler / infrastructure | `src/scheduler/dataAuditJob.ts` | NEW |
| `runWeeklyAudit()` | scheduler / infrastructure | `src/scheduler/dataAuditJob.ts` | NEW |
| `audit_state` DDL + upsert | scheduler / infrastructure/db | `src/scheduler/dataAuditJob.ts` | NEW (inline) |
| `agent_feedback` DDL guard + insert | scheduler / infrastructure/db | `src/scheduler/dataAuditJob.ts` | NEW (inline DDL + SQL) |
| `market_prices_history` canonical DDL | infrastructure/db | `src/infrastructure/db/schema.ts` | MODIFY |
| `exchange` column migration | infrastructure/db | `src/infrastructure/db/schema.ts` | MODIFY |
| `getCount()` LanceDB export | infrastructure/rag | `src/infrastructure/rag/vectorstore.ts` | MODIFY |
| CRONS entries + cron registration | scheduler | `src/scheduler/jobs.ts` | MODIFY |
| `get_system_health` db_audit section | interface/mcp | `src/interface/mcp/tools/systemTools.ts` | MODIFY |
| Test suite | test | `src/__tests__/157-data-audit-job.test.ts` | NEW |

---

## Interface Contracts

### `AuditFinding` (exported from `dataAuditJob.ts`)

```typescript
export interface AuditFinding {
  table: string;          // SQLite table name, "lancedb", or "db_overall"
  check: string;          // slug: "zero_price_rows", "stale_alerts_unread", etc.
  severity: "info" | "warning" | "critical";
  rowsAffected: number;   // rows deleted, updated, or counted as problematic
  action: "auto_cleaned" | "flagged" | "escalated" | "none";
  detail: string;         // human-readable explanation <= 200 chars
}
```

### `runDailyAudit()` and `runWeeklyAudit()`

```typescript
export async function runDailyAudit(): Promise<AuditFinding[]>
export async function runWeeklyAudit(): Promise<AuditFinding[]>
```

Both functions: read from `getDb()` singleton, perform synchronous SQLite operations (deletes/updates), then invoke one async Telegram send and one async `system_logs` insert. Each individual check is wrapped in `try/catch` — a failing check logs to `system_logs` and continues.

### `getCount()` new export in `vectorstore.ts`

```typescript
/**
 * Returns the total number of rows stored in the LanceDB rag_entries table.
 * Returns 0 if the table does not yet exist (first startup before any analysis).
 * Never throws — returns 0 on any LanceDB error.
 */
export async function getCount(): Promise<number>
```

Implementation: calls `(await getTable()).countRows()`. Wraps in `try/catch`; returns `0` on any error (table not found, connection failure, API change).

### `market_prices_history` DDL block in `schema.ts`

Inserted after the `sbv_rates_history` block and before `market_summaries`:

```typescript
// ── Market Prices History (canonical — task 018) ──────────────────────────
// Previously created lazily by hose.ts ensureHistoryTable(). Added here to
// include it in the canonical schema so initDatabase() guarantees its existence.
db.exec(`
  CREATE TABLE IF NOT EXISTS market_prices_history (
    code       TEXT NOT NULL,
    price      REAL NOT NULL,
    volume     REAL NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (code, fetched_at)
  );
  CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
    ON market_prices_history(code, fetched_at DESC);
`);

// exchange column migration (same pattern as hose.ts inline guard)
try {
  db.exec("ALTER TABLE market_prices_history ADD COLUMN exchange TEXT DEFAULT 'HOSE'");
} catch { /* column already exists — safe to ignore */ }
```

### `audit_state` DDL + upsert (inside `dataAuditJob.ts`)

```typescript
// Singleton guard run at function entry of both runDailyAudit and runWeeklyAudit
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_state (
    id                    INTEGER PRIMARY KEY CHECK (id = 1),
    last_daily_audit_at   TEXT,
    last_weekly_audit_at  TEXT,
    last_daily_findings   TEXT,
    last_weekly_findings  TEXT
  );
`);
```

Daily upsert:
```sql
INSERT INTO audit_state (id, last_daily_audit_at, last_daily_findings)
VALUES (1, datetime('now'), ?)
ON CONFLICT(id) DO UPDATE SET
  last_daily_audit_at  = excluded.last_daily_audit_at,
  last_daily_findings  = excluded.last_daily_findings
```

Weekly upsert additionally updates the weekly columns using the same `ON CONFLICT` pattern.

### `agent_feedback` inline DDL guard (inside `dataAuditJob.ts`)

The `ensureFeedbackTable()` function is NOT imported from `feedbackTools.ts` (that is an interface-layer module — importing it from the scheduler would violate DDD). Instead, the DDL is inlined at the top of the audit job:

```typescript
function ensureAuditDependencies(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent       TEXT NOT NULL,
      category    TEXT NOT NULL,
      title       TEXT NOT NULL,
      detail      TEXT NOT NULL DEFAULT '',
      priority    TEXT NOT NULL DEFAULT 'medium',
      status      TEXT NOT NULL DEFAULT 'new',
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON agent_feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_agent  ON agent_feedback(agent);
  `);
}
```

This is idempotent (uses `CREATE TABLE IF NOT EXISTS`) and carries no circular import risk.

### `get_system_health` db_audit section addition

Insert after the `--- Alert Stats ---` section and before the `--- Summary ---` section:

```typescript
// ── DB Audit ──────────────────────────────────────────────────────────────
lines.push("--- DB Audit ---");
try {
  const auditRow = db.query<{
    last_daily_audit_at: string | null;
    last_weekly_audit_at: string | null;
  }, []>(
    "SELECT last_daily_audit_at, last_weekly_audit_at FROM audit_state WHERE id = 1"
  ).get();

  const pendingFeedback = db.query<{ cnt: number }, []>(
    "SELECT COUNT(*) as cnt FROM agent_feedback WHERE status = 'new'"
  ).get();
  const openWarnings = db.query<{ cnt: number }, []>(
    "SELECT COUNT(*) as cnt FROM agent_feedback WHERE status = 'new' AND priority IN ('high', 'critical')"
  ).get();

  lines.push(`  last_daily_audit:   ${auditRow?.last_daily_audit_at ?? "never"}`);
  lines.push(`  last_weekly_audit:  ${auditRow?.last_weekly_audit_at ?? "never"}`);
  lines.push(`  pending_feedback:   ${pendingFeedback?.cnt ?? 0} new items`);
  lines.push(`  open_warnings:      ${openWarnings?.cnt ?? 0} high/critical items`);
} catch {
  lines.push("  (audit_state table not yet created — no audit has run)");
}
lines.push("");
```

### `CRONS` additions in `jobs.ts`

```typescript
export const CRONS = {
  // ... existing entries unchanged ...
  dataAuditDaily:  Bun.env.CRON_DATA_AUDIT_DAILY  ?? '0 23 * * *',
  dataAuditWeekly: Bun.env.CRON_DATA_AUDIT_WEEKLY ?? '0 1 * * 0',
}
```

Registration in `startScheduler()` after `registerSummaryJobs()`:

```typescript
import { runDailyAudit, runWeeklyAudit } from './dataAuditJob.js'

// 23:00 daily — DB audit (task 157)
cron.schedule(CRONS.dataAuditDaily, async () => {
  await runDailyAudit()
}, { timezone: 'Asia/Ho_Chi_Minh' })

// 01:00 every Sunday — weekly deep audit (task 157)
cron.schedule(CRONS.dataAuditWeekly, async () => {
  await runWeeklyAudit()
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

Update the final log line:
```typescript
log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} core cron jobs + 5 summary jobs + WAL checkpoint active`)
```
This automatically prints `8` (6 existing + 2 new) without a hardcoded number change.

---

## Daily Check Catalogue (FR-4) — Implementation Notes

| # | Check slug | SQL action | Side-effect |
|---|---|---|---|
| D-1 | `zero_price_rows` | `DELETE FROM market_prices WHERE price = 0 OR price IS NULL` | action: `auto_cleaned`, severity: `warning` |
| D-2 | `stale_price_rows` | `DELETE FROM market_prices WHERE updated_at < date('now','-3 days')` | action: `auto_cleaned`, severity: `info` |
| D-3 | `stale_unread_alerts` | `UPDATE alerts SET read = 1 WHERE read = 0 AND triggered_at < datetime('now','-30 days')` | action: `auto_cleaned`, severity: `info` |
| D-4 | `auto_expire_unresolved` | `UPDATE alerts SET resolved_at = datetime('now'), resolution_notes = 'auto-expired by audit' WHERE resolved_at IS NULL AND triggered_at < datetime('now','-60 days')` | action: `auto_cleaned`, severity: `info` |
| D-5 | `missing_sentiment_or_impact` | SELECT COUNT(*) only | action: `flagged`, severity: `warning` — inserts agent_feedback if count > 0 |
| D-6 | `null_source_url_old` | SELECT COUNT(*) only | action: `flagged`, severity: `info` |
| D-7 | `failed_validation_unfixed` | SELECT COUNT(*) only | action: `flagged`, severity: `warning` — inserts agent_feedback if count > 0 |
| D-8 | `stale_new_feedback` | `UPDATE agent_feedback SET priority = 'high' WHERE status = 'new' AND created_at < datetime('now','-14 days') AND priority IN ('low','medium')` | action: `escalated`, severity: `warning` — inserts agent_feedback |
| D-9 | `old_log_purge` | `DELETE FROM system_logs WHERE timestamp < datetime('now','-60 days')` | action: `auto_cleaned`, severity: `info` |
| D-10 | `row_count_snapshot` | `SELECT COUNT(*) FROM <table>` × 7 tables | action: `none`, severity: `info` — one AuditFinding per table |

D-10 produces **7 separate AuditFinding entries**, one per major table: `watchlist`, `market_prices`, `alerts`, `rag_analyses`, `financial_reports`, `agent_feedback`, `system_logs`.

---

## Weekly Check Catalogue (FR-5) — Implementation Notes

| # | Check slug | SQL action | Notes |
|---|---|---|---|
| W-1 | `old_commodity_history` | DELETE WHERE `fetched_at < datetime('now','-180 days')` from `commodity_prices_history` | action: `auto_cleaned` |
| W-2 | `old_sbv_history` | DELETE WHERE `fetched_at < datetime('now','-180 days')` from `sbv_rates_history` | action: `auto_cleaned` |
| W-3 | `duplicate_price_history` | Keep MAX(rowid) per `(code, DATE(fetched_at))` — see exact SQL in REQ-018 FR-5 | action: `auto_cleaned`, severity: `warning`. Uses `rowid` which is safe on composite-PK tables without `WITHOUT ROWID`. |
| W-4 | `duplicate_null_source_url` | DELETE older rows per `(level, DATE(created_at), source_title)` bucket where `source_url IS NULL AND created_at < datetime('now','-30 days')` | action: `auto_cleaned`, severity: `warning` |
| W-5 | `outlier_indicator_values` | SELECT from `tracked_indicators` WHERE indicator IN INDICATOR_RANGES keys, check value bounds | action: `flagged`, severity from INDICATOR_RANGES. Guarded with try/catch — table may not exist. |
| W-6 | `orphan_alerts` | `SELECT COUNT(DISTINCT je.value) FROM alerts, json_each(analysis_ids_json) je LEFT JOIN rag_analyses ra ON ra.id = je.value WHERE ra.id IS NULL AND analysis_ids_json IS NOT NULL AND analysis_ids_json != '[]'` | action: `flagged`, severity: `warning`. Flag count only — no delete. |
| W-7 | `lancedb_rag_count_drift` | `getCount()` vs `SELECT COUNT(*) FROM rag_analyses` — flag if delta > 100 | action: `flagged`, severity: `warning`. Full try/catch — never throws. |

---

## agent_feedback Insert Guard

Before inserting a new `agent_feedback` row, always check for same-day duplicates:

```sql
SELECT COUNT(*) FROM agent_feedback
WHERE agent = 'data-auditor'
  AND title = ?
  AND created_at >= date('now')
```

Skip insert if count > 0.

Category mapping from check slug:
- `zero_price_rows`, `stale_price_rows`, `missing_sentiment_or_impact`, `failed_validation_unfixed`, `outlier_indicator_values` → `"data_extraction_error"`
- `orphan_alerts` → `"alert_quality"`
- `lancedb_rag_count_drift` → `"performance_issue"`
- `stale_new_feedback` → `"other"`
- all others → `"other"`

---

## Telegram Message Format

**Send conditions**:
1. `telegram.enabled = false` in config → skip silently.
2. All findings have `rowsAffected = 0` AND none have `action IN ("flagged", "escalated")` → skip (clean run).
3. Otherwise → send exactly one message.

**Format** (plain text, no Markdown):
```
DB audit (daily) — 2026-04-01 23:00 GMT+7
Cleaned: 5 rows (zero_price_rows: 2, stale_unread_alerts: 1, old_log_purge: 2)
Flagged: 3 warnings, 0 criticals
Feedback queue: 7 new items (2 high priority)
```

The timestamp is displayed in GMT+7 using: `new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', ... })` or equivalent manual offset (`+7 * 3600_000`).

Large row counts formatted with `rowsAffected.toLocaleString('vi-VN')`.

---

## Task Breakdown (for PM)

Dependencies and recommended implementation order:

| Task | Title | Layer | Priority | Depends on |
|---|---|---|---|---|
| 157 | Data audit engine: `dataAuditJob.ts` (D-1 through D-10, W-1 through W-7) + `market_prices_history` canonical schema migration in `schema.ts` + `getCount()` new export in `vectorstore.ts` | scheduler + infrastructure/db + infrastructure/rag | P0 | — |
| 158 | Scheduler wiring: `CRONS.dataAuditDaily` + `CRONS.dataAuditWeekly` + `startScheduler()` registration in `jobs.ts` | scheduler | P1 | 157 (needs stable exported API) |
| 159 | `get_system_health` db_audit section: read `audit_state`, query live `agent_feedback` counts | interface/mcp/tools + infrastructure/db | P2 | 157 (needs `audit_state` table defined) |

Test file: `src/__tests__/157-data-audit-job.test.ts`
- Uses `:memory:` SQLite (`process.env.DB_PATH = ":memory:"`)
- Mocks `sendTelegramMessage` to capture calls without network I/O
- Covers AC-1 through AC-12 from REQ-018

**Task 157 is a large single-file deliverable.** The Developer should implement checks in catalogue order (D-1 → D-10, then W-1 → W-7) and write a corresponding test for each AC before moving to the next.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `rowid` not accessible on `market_prices_history` composite PK | Low | Medium | SQLite always exposes `rowid` unless `WITHOUT ROWID` is declared — not the case here. Developer must run `SELECT rowid, * FROM market_prices_history LIMIT 1` in a test to confirm before using W-3 dedup SQL. |
| `agent_feedback` or `tracked_indicators` table missing at audit time (first startup) | Medium | Low | Both guarded with `CREATE TABLE IF NOT EXISTS` inline DDL or `try/catch` around SELECT (W-5). |
| `json_each()` unavailable on Bun's bundled SQLite | Low | High | SQLite JSON1 extension is compiled in by default in Bun. Test W-6 with an in-memory DB in the test suite to confirm before shipping. |
| LanceDB `countRows()` API change between lancedb versions | Low | Low | `getCount()` wraps entirely in `try/catch`, returns `0` on failure, and W-7 emits `severity: "warning"` + `action: "none"` — the audit never fails hard. |
| D-2 deletes prices for stocks actively in watchlist (3-day staleness window too aggressive during market holidays) | Medium | Medium | D-2 is `info` severity, not `critical`. Row count is logged in the Telegram summary. Consider adjusting the threshold to `-7 days` if false positives are observed in production. No change needed at design time — threshold is a pure SQL constant inside `dataAuditJob.ts`. |
| Weekly audit timing conflict with 23:00 daily audit on Saturday night / Sunday 01:00 | Low | Low | Daily audit runs Saturday 23:00, weekly runs Sunday 01:00. They are in different calendar days — the FR-7 dedup guard on `(agent, title, date('now'))` prevents double-insertion. Confirmed in REQ-018 edge cases. |
| Telegram message silently skipped when config object not yet loaded | Low | Low | Use the same config import pattern as existing jobs: `const { mcpConfig } = await import('../infrastructure/config.js')`. The import is already cached after first load. |

---

## Security Review

- SQL parameterized? **Yes** — all user-facing values use `db.prepare(...).run(...)` with positional `?` placeholders. No string interpolation in SQL except for the `json_each` orphan check (W-6) which uses no user input.
- File paths validated (no `../`)? **Yes** — no file paths involved in this feature.
- External HTTP rate-limited? **Yes** — the only external call is `sendTelegramMessage()`, already rate-limited by the existing notifier implementation.
- Secrets via `Bun.env` only? **Yes** — no new secrets. Telegram credentials remain in `Bun.env.TELEGRAM_BOT_TOKEN` / `Bun.env.TELEGRAM_CHAT_ID` as before.
- Duplicate feedback guard? **Yes** — FR-7 dedup query on `(agent, title, date('now'))` prevents flooding the `agent_feedback` table on same-day re-runs.

---

## DDD Compliance Notes

The `dataAuditJob.ts` file resides in `src/scheduler/` (not `src/infrastructure/`). In this project, `src/scheduler/` is treated as the infrastructure/scheduler sublayer — it has the same import rights as `infrastructure/`: it may import `infrastructure/db/schema.ts`, `infrastructure/rag/vectorstore.ts`, and `infrastructure/notifiers/telegram.ts`, but must not import from `application/` or `interface/`. The inline `ensureFeedbackTable` DDL in `dataAuditJob.ts` deliberately avoids importing `feedbackTools.ts` (interface layer) for this reason.

The `AuditFinding` interface is exported from `dataAuditJob.ts` rather than placed in `src/domain/models/index.ts` because it is not a business-domain entity. It is an operational report structure that only makes sense in the context of the scheduler/infrastructure layer.
