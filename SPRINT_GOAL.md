# Sprint Goal

## Current Sprint

status: ACTIVE
sprint_id: 017
started: 2026-03-30
updated: 2026-03-30

---

### Theme

**"Production Hardening"**

Sprint 016 delivered the analyst's dashboard: portfolio conviction on demand, alert
lifecycle management, conviction history, morning briefing pushed to Telegram, and sigma
readiness diagnostics. The system is now functionally complete for a single investor's
daily workflow.

Sprint 017 shifts focus entirely to production quality. Four problems observed during
real market-hours operation on 2026-03-30 limit the system's day-to-day reliability:

1. All alerts are `low` severity (`news_mention` only). No price-based alert has ever fired
   because the alert noise floor is too high — every news item generates an alert regardless
   of investment relevance. The investor receives dozens of low-signal notifications.
2. SSC document scanning checks 51 documents per cycle against 5 stocks. Each lookup hits
   the database and the full list is re-evaluated every 15 minutes, adding ~30 seconds of
   unnecessary I/O per cycle.
3. LanceDB emits TRACE-level log lines on every vector search, flooding the log file with
   hundreds of lines per cycle that obscure real warnings.
4. The log file has no rotation or size cap. Running production for 48 hours produces a
   log file that overwhelms the filesystem.

The guiding constraint remains: no LLM calls, no new external data sources. All changes are
internal to the system.

---

### Goal

Reduce alert noise by filtering low-relevance news mentions, cut SSC scan time by 60%,
silence LanceDB trace logging, and cap log file growth so the system can run unattended
for weeks without operator intervention.

---

### Scope

**IN**

**P0 — News-mention alert noise filter (task 152): only fire when news is relevant**

Every news item that mentions a watchlist stock currently produces a `news_mention` alert
regardless of the article's content, source credibility, or recency. The result is dozens
of `low`-severity alerts per day that bury any real signal.

This task introduces a relevance gate inside `signalDetector.ts` (or `alertGenerator.ts`)
before a `news_mention` signal is promoted to an alert:

Gate conditions (ALL must pass):
1. The article's sentiment score (from `sentimentClassifier.ts`) is not `neutral` — purely
   neutral articles do not warrant an alert.
2. The article was published within the last 60 minutes at signal-detection time — stale
   news does not re-trigger.
3. The article title or summary contains at least one of the stock's configured keywords
   OR the article source is in a configurable `highTrustSources` list (e.g. cafef, vnexpress
   for Vietnamese stocks). Generic macro articles that happen to contain a ticker symbol
   are filtered out.

Configuration: add `alerts.newsMention.maxAgeMinutes` (default 60),
`alerts.newsMention.requireNonNeutralSentiment` (default true), and
`alerts.newsMention.highTrustSources` (default `["cafef", "vnexpress", "vneconomy"]`) to
`mcp.config.json`. No hardcoded values in production code.

Expected outcome: news_mention alert volume drops by >= 70% while actual high-relevance
news still fires.

- Task 152: modify `src/domain/services/signalDetector.ts` + `mcp.config.json`

**P0 — SSC scan deduplication (task 153): stop re-scanning already-processed documents**

The SSC nightly checker (`checkSscReports.ts` + `sscCheckerJob.ts`) fetches 51 documents
per run. At 15-minute cycle intervals this is wasteful — documents do not change between
scans. The fix is a simple "already seen" guard in SQLite.

New column on `financial_reports` table (try/catch ALTER TABLE):
- `ssc_doc_id TEXT` — the unique document identifier from the SSC portal listing (the URL
  path or document ID extracted by `ssc.ts`).

New function `isDocAlreadyProcessed(docId: string, db: Database): boolean` in
`src/infrastructure/db/alertStore.ts` (or a new `reportStore.ts`). Uses a
`SELECT 1 FROM financial_reports WHERE ssc_doc_id = ?` query.

In `checkSscReports.ts`, before calling `fetchParseAndStoreBctc` for each candidate
document, call `isDocAlreadyProcessed`. Skip the document if it returns `true`.

Expected outcome: after the first full scan, subsequent scans skip all 51 documents in
< 100 ms (single index lookup per doc vs. full parse pipeline).

- Task 153: schema migration + `isDocAlreadyProcessed` helper +
  `checkSscReports.ts` guard

**P1 — Silence LanceDB TRACE logging (task 154): clean logs**

LanceDB's internal logger emits TRACE-level lines on every vector search call. At 15-minute
cycle intervals with 5 watchlist stocks this produces ~150 TRACE lines per hour. These lines
are not controlled by the project's own logger (`src/infrastructure/logger.ts`) — they come
from the LanceDB package itself via an environment variable.

Fix: set `LANCEDB_LOG_LEVEL=warn` (or `error`) in the Bun process environment before any
LanceDB import. The correct place is `src/index.ts` at the very top, before any other
import, using `process.env.LANCEDB_LOG_LEVEL = 'warn'`.

Add a smoke test: after setting the env var, import and call `vectorstore.ts`'s search
function in the test harness and assert that the captured stdout/stderr contains zero lines
matching `/TRACE/i`.

- Task 154: one-line change in `src/index.ts` + env var documented in `mcp.config.json`
  under a new `logging.lancedbLevel` key (read at startup and applied before import)

**P1 — Log file rotation (task 155): prevent unbounded growth**

The structured logger in `src/infrastructure/logger.ts` writes to a single file with no
rotation. After 48 hours of market-hours operation the file exceeds 100 MB.

This task adds size-based rotation to the logger:

- Maximum file size: configurable via `logging.maxFileSizeMb` in `mcp.config.json`
  (default: 50).
- Rotation strategy: when the file exceeds `maxFileSizeMb`, rename the current log file to
  `<name>.1.log` and open a fresh `<name>.log`. Keep at most 3 rotated files
  (`<name>.1.log`, `<name>.2.log`, `<name>.3.log`). Delete `<name>.3.log` before rotating
  if it exists (simple rolling window, no external library).
- Rotation check: performed once per minute using a lightweight `setInterval` in the logger
  module — not on every write (avoids `stat()` on every log line).
- If the log directory does not exist, create it (already done at startup — this is a
  defensive check only).

No external log-rotation library. Pure Bun `Bun.file` + `fs.renameSync`.

- Task 155: modify `src/infrastructure/logger.ts` + `mcp.config.json`

**P2 — Off-hours cycle interval increase (task 156): reduce idle resource use**

During off-hours (outside 08:00-16:00 GMT+7) the intelligence cycle currently runs every
15 minutes. Off-hours cycles only poll news and fetch macro prices — no SSC, no price scan,
no cascade. The 15-minute interval is unnecessarily frequent for off-hours work.

This task makes the off-hours interval configurable and increases the default to 60 minutes.

Changes:
- Add `cycle.offHoursIntervalMinutes` (default 60) to `mcp.config.json` alongside the
  existing `cycle.intervalMinutes` (market-hours interval, stays at 15).
- In `intelligenceCycleJob.ts`, read `offHoursIntervalMinutes` and use it to compute the
  next off-hours cycle delay via a `setTimeout`-based re-schedule (or by skipping cycle
  runs when the elapsed time is < `offHoursIntervalMinutes` since last off-hours run).
- Market-hours cycles are not affected.

Expected outcome: off-hours CPU and network use drops by ~75% (4 cycles/hour → 1
cycle/hour).

- Task 156: modify `src/scheduler/intelligenceCycleJob.ts` + `mcp.config.json`

**OUT**

- Telegram Bot API inline keyboard / callback_query handling (deferred to Sprint 018)
- Backtest mode for conviction scorer (deferred to Sprint 018)
- LLM calls of any kind
- New external data sources
- BCTC extractor, ratio computer, or validator changes
- MCP tool signature changes for any existing tool
- Multi-user Telegram routing
- Database compaction / VACUUM automation (separate concern)

---

### Success Metrics

1. **News-mention noise reduction**: after deploying task 152, a manual run of the
   intelligence cycle against the current news corpus produces <= 30% of the previous
   `news_mention` alert count. Sentiment-negative or sentiment-positive articles from
   `highTrustSources` still generate alerts. Neutral articles do not.

2. **SSC scan speed**: after the first full scan stores `ssc_doc_id` values, a second
   `checkSscReports` run completes the document-existence check for all 51 docs in < 500 ms
   total (verified by log timestamps). No full parse pipeline is triggered for already-seen
   documents.

3. **Clean logs**: after deploying task 154, running one full intelligence cycle produces
   zero log lines matching `/TRACE/i` in the application log file.

4. **Log rotation**: after deploying task 155, when the log file exceeds `maxFileSizeMb`,
   the logger automatically renames it to `app.1.log` and continues writing to a fresh
   `app.log`. The `bun test` suite includes a test that writes > `maxFileSizeMb` worth of
   log lines and asserts that `app.1.log` exists and `app.log` is smaller than the limit.

5. **Off-hours frequency**: after deploying task 156, between 16:01 and 07:59 GMT+7 the
   intelligence cycle fires once per hour rather than every 15 minutes. The `get_system_health`
   tool shows `last_cycle_at` timestamps spaced ~60 minutes apart during off-hours.

6. **Full test suite**: `bun test` passes with 0 failures; `bun tsc --noEmit` reports
   0 errors after all Sprint 017 tasks are merged.

---

### Task board (Sprint 017)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 152 | News-mention alert noise filter | P0 | Backlog | — |
| 153 | SSC scan deduplication | P0 | Backlog | — |
| 154 | Silence LanceDB TRACE logging | P1 | Backlog | — |
| 155 | Log file rotation | P1 | Backlog | — |
| 156 | Off-hours cycle interval increase | P2 | Backlog | — |

---

### Dependency chain

```
152 (news-mention noise filter)   — P0, independent, start immediately
153 (SSC scan dedup)              — P0, independent, start immediately

154 (LanceDB TRACE silence)       — P1, independent of 152-153, start in parallel
155 (log file rotation)           — P1, independent of all above, start in parallel

156 (off-hours cycle interval)    — P2, independent, start after 152-153 land

152 + 153 + 154 + 155 can all start in parallel (different files, no conflict)
156 unblocks once 152 and 153 are merged (confirms cycle overhead is reduced enough)
```

---

### Key technical decisions (locked at PO level)

- **Noise filter placement**: the gate lives in `signalDetector.ts` before a `news_mention`
  Signal object is created, not in `alertGenerator.ts`. This keeps the alert generator
  agnostic of news-specific rules and ensures the filter applies regardless of how signals
  reach the generator.
- **`ssc_doc_id` source**: the document identifier is the URL path segment used by the SSC
  portal (already extracted by `ssc.ts` when building the document list). No new HTTP call
  is needed — the ID is available at the point where `checkSscReports.ts` iterates
  candidates.
- **LanceDB env var timing**: `process.env.LANCEDB_LOG_LEVEL = 'warn'` must appear in
  `src/index.ts` before any `import` that transitively loads LanceDB. In ESM/Bun, `import`
  statements are hoisted. Use a dynamic `await import(...)` for the LanceDB-dependent
  modules, or set the env var in a preload script. The simplest correct approach: set it at
  the top of `src/index.ts` before the static imports — Bun evaluates top-level code in
  file order before resolving dynamic imports, so this works.
- **Log rotation strategy**: synchronous `fs.renameSync` inside the rotation check. The
  check runs every 60 seconds via `setInterval` — contention with concurrent writes is
  negligible in a single-process Bun server. No mutex required.
- **Off-hours interval implementation**: a simple timestamp comparison in `intelligenceCycleJob.ts`.
  Store `lastOffHoursCycleAt: number` at module scope. At cycle entry, if not market hours
  and `Date.now() - lastOffHoursCycleAt < offHoursIntervalMs`, return early. This avoids
  modifying the cron schedule and requires zero external library changes.

---

## Next Sprint (queued — Sprint 017 must merge first)

status: PLANNED
sprint_id: 018
queued_at: 2026-04-01

---

### Theme

**"Data Integrity First"**

Sprint 017 hardens the production runtime (noise filter, SSC dedup, log rotation, cycle
frequency). Sprint 018 addresses the silent risk underneath: bad data flowing through the
pipeline undetected.

Every layer of the system — cascade engine, conviction scorer, morning briefing, Telegram
alerts — reads from five SQLite tables and LanceDB. When those stores accumulate zero-price
rows, stale history, orphaned analyses, or unfixed failed BCTC reports, the pipeline
operates on corrupted inputs without any signal to the operator. The damage is invisible
until a wrong alert fires or a briefing cites a $5 oil price.

Sprint 018 adds a scheduled auditor that runs autonomously, cleans what is safe to clean,
flags what requires human judgment, and routes all findings through the existing
`submit_feedback` / `agent_feedback` infrastructure so the user sees a consolidated digest
rather than a flood of raw errors.

The guiding constraint from Sprint 017 remains: no LLM calls, no new external data sources,
no changes to existing MCP tool signatures.

---

### Goal

Add a `dataAuditJob.ts` scheduler that runs lightweight checks nightly and deep checks
weekly, auto-cleans safe bad data (zero prices, stale history rows, old unread alerts,
expired system logs), flags issues that require judgment via `agent_feedback`, and sends a
single Telegram summary so the operator knows the DB health without querying it manually.

---

### Scope

**IN**

**P0 — Core audit engine: `dataAuditJob.ts` (task 157)**

A new scheduler module `src/scheduler/dataAuditJob.ts` containing two exported functions:

- `runDailyAudit()` — lightweight checks, target runtime < 5 s
- `runWeeklyAudit()` — deep checks including LanceDB sync, target runtime < 30 s

Both functions share a private `AuditReport` accumulator type:

```typescript
interface AuditFinding {
  table: string;
  check: string;
  severity: "info" | "warning" | "critical";
  rowsAffected: number;
  action: "auto_cleaned" | "flagged" | "none";
  detail: string;
}
```

Each check appends one or more `AuditFinding` objects. After all checks complete, the job:
1. Persists critical/warning findings to `agent_feedback` via direct DB insert (same schema
   as `submit_feedback` MCP tool — agent = `"data-auditor"`).
2. Sends one Telegram summary message (plain text, no Markdown): total rows cleaned, count
   of warnings, count of criticals. If zero issues: "DB audit: clean." Only send if
   `telegram.enabled` is true in `mcp.config.json`.
3. Logs all findings to `system_logs` table (level = "info" for auto-cleaned, "warn" for
   flagged, "error" for critical).

No external libraries. All reads/writes use the existing `getDb()` singleton.

**P0 — Daily audit checks (task 157, part of same file)**

Run every night at 23:00 GMT+7 (new cron entry in `jobs.ts`):

| Table | Check | Safe auto-clean? | Severity if found |
|-------|-------|-----------------|-------------------|
| `market_prices` | `price = 0 OR price IS NULL` | Yes — DELETE row | warning |
| `market_prices` | `updated_at` older than 3 calendar days | Yes — DELETE row | info |
| `alerts` | `read = 0` and `triggered_at` older than 30 days | Yes — mark `read = 1` | info |
| `alerts` | `resolved_at IS NULL` and `triggered_at` older than 60 days | Yes — set `resolved_at = now(), resolution_notes = 'auto-expired by audit'` | info |
| `rag_analyses` | `sentiment IS NULL OR impact_score = 0` | No — flag only | warning |
| `rag_analyses` | `source_url IS NULL` and `created_at` older than 7 days | No — flag count only | info |
| `financial_reports` | `validation_status = 'failed'` | No — flag only | warning |
| `agent_feedback` | `status = 'new'` and `created_at` older than 14 days | No — escalate: set `priority = 'high'` where `priority IN ('low','medium')` | warning |
| `system_logs` | `timestamp` older than 60 days | Yes — DELETE rows | info |
| `DB overall` | Row counts for all major tables | No — log info | info |

**P0 — Weekly audit checks (task 157, part of same file)**

Run every Sunday at 01:00 GMT+7 (new cron entry in `jobs.ts`):

All daily checks are included, PLUS:

| Table | Check | Safe auto-clean? | Severity if found |
|-------|-------|-----------------|-------------------|
| `commodity_prices_history` | `fetched_at` older than 180 days | Yes — DELETE rows | info |
| `sbv_rates_history` | `fetched_at` older than 180 days | Yes — DELETE rows | info |
| `market_prices_history` | Duplicate `(code, updated_at)` pairs — keep row with lowest `id` | Yes — DELETE higher-id dupes | warning |
| `rag_analyses` | Duplicate `source_url IS NULL` entries older than 30 days — keep newest per `source_title` | Yes — DELETE older dupes | warning |
| `tracked_indicators` | `value` outside plausible range for known indicator types: oil < 20 or > 300 USD/bbl; gold < 500 or > 5000 USD/oz; CPI outside -5% to +30% | No — flag as `data_extraction_error` via `agent_feedback` | critical if oil/gold; warning if CPI |
| `alerts` | `analysis_ids_json` references IDs not present in `rag_analyses` (orphan check) | No — flag count only | warning |
| LanceDB | Row count in `analyses` table via `vectorstore.getCount()` vs `COUNT(*)` in `rag_analyses` | No — flag delta if > 100 rows diverge | warning |

**P1 — Scheduler wiring (task 158)**

Wire both audit functions into `src/scheduler/jobs.ts`:

- Daily: `cron.schedule('0 23 * * *', runDailyAudit, { timezone: 'Asia/Ho_Chi_Minh' })`
- Weekly: `cron.schedule('0 1 * * 0', runWeeklyAudit, { timezone: 'Asia/Ho_Chi_Minh' })`

Add `CRON_DATA_AUDIT_DAILY` and `CRON_DATA_AUDIT_WEEKLY` to the `CRONS` constant (same
pattern as existing entries — env-var override supported).

**P2 — DB stats MCP tool enhancement (task 159)**

Enhance the existing `get_system_health` MCP tool
(`src/interface/mcp/tools/systemTools.ts`) to include a new `db_audit` section:

```
db_audit:
  last_daily_audit_at: <ISO timestamp or "never">
  last_weekly_audit_at: <ISO timestamp or "never">
  pending_feedback_count: <int>   ← agent_feedback WHERE status='new'
  open_warnings: <int>            ← agent_feedback WHERE status='new' AND priority IN ('high','critical')
```

Source: read from a new `audit_state` table (one-row, upserted after each audit run).
The `audit_state` table is created inside `dataAuditJob.ts` using `CREATE TABLE IF NOT EXISTS`
at first audit run — no schema.ts change required for this table.

**OUT**

- VACUUM / page defragmentation (separate concern, deferred to Sprint 019)
- LanceDB vector deletion / re-embedding (requires LanceDB API investigation — deferred)
- Interactive feedback resolution UI (Telegram inline keyboard — deferred to Sprint 019)
- Any change to existing MCP tool input/output schemas
- Any change to BCTC extractors, ratio computer, or cascade engine rules
- New external data sources
- LLM calls of any kind
- Automated backup / restore

---

### Success Metrics

1. **Daily audit runs and produces output**: after `runDailyAudit()` executes, `system_logs`
   contains at least one row with `source = 'data-auditor'` and `level IN ('info','warn')`.
   Telegram receives exactly one summary message per run (if `telegram.enabled = true`).

2. **Zero-price rows auto-cleaned**: seed one row in `market_prices` with `price = 0` before
   the test; call `runDailyAudit()`; assert the row is deleted and an `AuditFinding` with
   `action = "auto_cleaned"` is returned.

3. **Stale alert auto-archival**: seed an alert with `read = 0` and
   `triggered_at = 35 days ago`; call `runDailyAudit()`; assert `read = 1` for that alert.

4. **Out-of-range commodity flagged**: seed a `tracked_indicators` row with `value = 5.0`
   for indicator `brent_crude_usd`; call `runWeeklyAudit()`; assert an `agent_feedback`
   row is inserted with `category = 'data_extraction_error'` and `priority = 'critical'`.

5. **Stale history pruned**: seed rows in `commodity_prices_history` with
   `fetched_at = 200 days ago`; call `runWeeklyAudit()`; assert those rows are deleted.

6. **Old feedback escalated**: seed an `agent_feedback` row with `status = 'new'`,
   `priority = 'medium'`, `created_at = 15 days ago`; call `runDailyAudit()`; assert
   `priority` is updated to `'high'`.

7. **Scheduler wired**: `startScheduler()` in `jobs.ts` registers both audit cron entries.
   Verify by checking `CRONS.dataAuditDaily` and `CRONS.dataAuditWeekly` are defined.

8. **Full test suite**: `bun test` passes with 0 failures; `bun tsc --noEmit` reports
   0 errors after all Sprint 018 tasks are merged.

---

### Task board (Sprint 018)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 157 | Data audit engine + daily + weekly checks | P0 | Backlog | — |
| 158 | Scheduler wiring for daily + weekly audit crons | P1 | Backlog | 157 |
| 159 | Enhance get_system_health with db_audit section | P2 | Backlog | 157 |

---

### Dependency chain

```
157 (audit engine + checks)   — P0, start first, all checks live in one file
158 (scheduler wiring)        — P1, depends on 157 exported API being stable
159 (health tool enhancement) — P2, depends on 157 audit_state table being defined
```

---

### Key technical decisions (locked at PO level)

- **Single file for audit logic**: `src/scheduler/dataAuditJob.ts` contains both
  `runDailyAudit` and `runWeeklyAudit`. No separate service file in `domain/` — the audit
  job is infrastructure-level (it reads raw DB rows and deletes them), not domain business
  logic. This is consistent with how `sscCheckerJob.ts` and `intelligenceCycleJob.ts` are
  structured.

- **No new DB helper module**: all SQL in `dataAuditJob.ts` uses `getDb()` directly, same
  pattern as other scheduler jobs. Creating a `auditStore.ts` would add indirection with
  no benefit for a standalone job.

- **`agent_feedback` reuse (not a new table)**: audit findings that need human attention
  are inserted directly into `agent_feedback` with `agent = 'data-auditor'`. This means
  the existing `get_feedback` MCP tool immediately surfaces audit issues with no new tool
  needed. The `submit_feedback` MCP tool is NOT called (it is an MCP endpoint, not an
  internal function) — the audit job writes to the DB directly using the same INSERT
  statement pattern.

- **Plausible-range thresholds for `tracked_indicators`**: hardcoded as constants inside
  `dataAuditJob.ts` (not in `mcp.config.json`) because these are physical validity
  constraints (oil cannot be $5 or $500 in normal markets), not tunable policy. The
  user is not expected to adjust them. Document the constants clearly in JSDoc.

- **LanceDB count check**: use the existing `vectorstore.ts` export for count access
  (or add a `getCount(): Promise<number>` helper if not already present). Do not add
  a new LanceDB dependency. If `getCount()` throws, swallow the error and log it — the
  weekly audit must not fail hard on a LanceDB API change.

- **Telegram message format**: plain text, no Markdown, consistent with all other
  Telegram messages in the system. Example:
  ```
  DB audit (daily) — 2026-04-01 23:00
  Cleaned: 3 rows (0-price: 2, stale alerts: 1)
  Flagged: 2 warnings, 0 criticals
  Feedback queue: 5 new items (1 high priority)
  ```

---

## Completed Sprints

| Sprint | Theme | Key Deliverables | Status |
|--------|-------|------------------|--------|
| 000 | Foundation | DB schema, env config, embeddings, vectorstore, watchlist, BCTC balance sheet + income stmt | Done |
| 001 | BCTC RAG pipeline | Cash flow, ratio, delta, orchestrator, RAG retriever | Done |
| 002 | SSC + MCP server | SSC portal scraper, PDF extractor, full BCTC pipeline, Bun MCP server, SSC MCP tools | Done |
| 003 | News intelligence | News + watchlist + alert system (021, 082, 063, 064, 086) | Done |
| 004 | Cascade engine | Cascade engine, analysis MCP tools, legacy cleanup (087, 022, 023, 061, 062, 083, 088) | Done |
| 005 | Market data + scheduler | Market data, morning briefing, news poll, market scan, SSC nightly (088, 026, 102, 104, 103, 101) | Done |
| 006 | Analytical depth | Pattern matcher, AI summary, HNX fetcher, market MCP tools, 28-test integration harness | Done |
| 007 | Test coverage | BCTC edge-case tests, domain coverage, SSC pipeline mock tests, E2E briefing | Done |
| 008 | Macro intelligence | Yahoo Finance commodities, SBV rates, macro cascade, get_macro_snapshot MCP tool | Done |
| 009 | Automation + alerts | SSC Puppeteer, Telegram notifier, 15-min intelligence cycle | Done |
| 010 | Security + quality | SQL injection fix, alert cooldown/dedup/grouping, BCTC validator | Done |
| 011 | Adaptive intelligence | Adaptive signal thresholds, sentiment classifier (Vi + EN), RAG temporal decay, VnEconomy RSS | Done |
| 012 | Periodic summaries | Daily/weekly/monthly/quarterly/yearly summaries, cron triggers, MCP tools | Done |
| 013 | Reliability + depth | OCR fallback (Tesseract + Vietnamese), sector peer mapping, sigma-based macro thresholds, price-news divergence detector, commodity auto-tracking from news text, tradingEconomicsStream fetcher, macroStatsStore, Vietnamese Telegram format, Chrome zombie fix, BCTC Collector SSC call removal, 50+ cascade rules, sensitive-date awareness | Done |
| 014 | Make the system speak | Alert pipeline fix (Step E + D), VN-Index live feed, WAL checkpoint, circuit breaker wiring, system health enhancement | Done |
| 015 | Know Before the Market Does | convictionScorer.ts (5-dimension cross-signal, tasks 142-146), sector peer wiring, historical parallel in alerts, morning briefing upgrade (unresolved alerts + top conviction), weekly pattern watch Sunday 22:30 | Done |
| 016 | The Analyst's Dashboard | Morning briefing Telegram delivery (task 147), alert resolution lifecycle + resolve_alert MCP tool (task 148), get_portfolio_conviction MCP tool (task 149), conviction_history table + trend read (task 150), sigma data sufficiency health check (task 151). 27 MCP tools, conviction dashboard, full alert lifecycle. | Done |
