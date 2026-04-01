# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 020
started: 2026-04-01
updated: 2026-04-01

---

### Theme

**"Prediction Market Intelligence — The Crowd Knows First"**

---

### Goal

Add Polymarket as a Level 1 (global) intelligence source: poll macro and geopolitical
prediction markets every 30 minutes, detect abnormal crowd-money flows (large bets, sharp
probability shifts), and feed those signals into the existing cascade engine so that
Vietnam-relevant events (US-China trade, Fed rate decisions, oil supply shocks, ASEAN
geopolitics) surface as actionable alerts before traditional news reports them.

---

### Scope

**IN**

1. **Polymarket REST fetcher** (`src/infrastructure/fetchers/polymarket.ts`)
   - Public Clob API: `https://clob.polymarket.com/markets` — no API key required
   - Gamma Markets API: `https://gamma-api.polymarket.com/markets` — richer metadata
   - Fetch open markets tagged with categories relevant to Vietnam macro:
     `economics`, `crypto`, `politics`, `fed`, `trade`, `oil`, `asia`, `china`
   - Return typed `PredictionMarket` objects: `{ id, question, endDate, yesPrice, noPrice,
     volume24h, volumeTotal, liquidity, lastTradePrice, outcomes }`

2. **Smart-money signal detector** (`src/domain/services/predictionSignalDetector.ts`)
   - Detect `volume_spike`: 24h volume crosses configurable threshold (default $50K USD)
   - Detect `probability_shift`: yes/no price moves >= configurable delta in one cycle
     (default 5 percentage points)
   - Detect `new_whale`: single-trade bet > configurable threshold (default $10K) — requires
     the Polymarket order book / trade history endpoint
   - Output `PredictionSignal` objects that map to the existing `Signal` interface

3. **Cascade mapping** (`src/domain/services/predictionCascadeMapper.ts`)
   - Keyword rules mapping market question text to `DomainType` sectors and stock codes
   - Examples:
     - "Fed rate cut" → `banking` → VCB, TCB, BID, CTG
     - "US-China trade war" → `manufacturing`, `steel` → HPG, GAS
     - "Oil price above $X" → `energy`, `petroleum` → GAS, PLX
     - "Vietnam GDP" → all watchlist stocks (country-level event)
     - "ASEAN summit" → broad VN macro signal

4. **Poll integration** — `predictionMarketJob.ts` (new scheduler job, every 30 min)
   OR integrate into existing `intelligenceCycleJob.ts` as Step A3

5. **MCP tool** — `get_prediction_markets` returning current market prices, volumes, and
   detected signals for Vietnam-relevant markets

6. **Telegram alerts** — when a `PredictionSignal` of sufficient severity is detected,
   format and push via existing Telegram notifier in Vietnamese

7. **Configuration** in `mcp.config.json` under new `predictionMarkets` section:
   `enabled`, `pollingIntervalMinutes`, `volumeSpikeThresholdUsd`, `probabilityShiftPct`,
   `whaleTradeThresholdUsd`, `relevantCategories`, `maxMarketsPerPoll`

**OUT**

- On-chain Polygon transaction monitoring (too complex, deferred)
- Kalshi, Manifold, or other prediction market platforms (add later if Polymarket proves
  value; one source first)
- Automated trading or position management of any kind
- Real-money Polymarket account integration
- LLM calls for market interpretation
- Changes to existing MCP tool signatures

---

### Success Metric

1. `get_prediction_markets` MCP tool returns at least 5 Vietnam-relevant open markets with
   live yes/no prices and 24h volume.
2. A simulated volume spike (injected in test) produces a `PredictionSignal` that propagates
   through `predictionCascadeMapper` to at least one watchlist stock alert.
3. End-to-end: `intelligenceCycleJob` (or new job) calls the Polymarket fetcher every 30
   minutes; a HIGH-severity `prediction_market` signal triggers a Telegram notification in
   Vietnamese with market question, current probability, and affected VN stocks.
4. Full `bun test` suite passes; `bun tsc --noEmit` reports 0 errors.

---

### Blockers requiring human input before BA can proceed

**BLOCKER-020-A**: Polymarket API access pattern
- The Clob API (`clob.polymarket.com`) is public but rate-limits unauthenticated requests.
  Do you have a Polymarket API key (L1/L2 credentials via Polymarket account)? If not,
  unauthenticated polling at 30-min intervals should be within limits, but this must be
  confirmed. Answer: YES (have key) / NO (use unauthenticated).

**BLOCKER-020-B**: Whale trade detection feasibility
- Detecting individual large trades requires the Polymarket trade history endpoint
  (`/trades?market=...`), which returns all recent trades. On liquid markets this can be
  thousands of rows per poll. Should the system: (A) poll trade history and flag trades
  above threshold, (B) rely only on 24h volume and probability shift as signals (no
  per-trade analysis), or (C) skip whale detection entirely for now?
  Answer: A / B / C.

**BLOCKER-020-C**: Vietnam-relevant market discovery strategy
- Polymarket has thousands of open markets. Should the system: (A) use pre-configured
  keyword filters (Fed, China, oil, Vietnam, ASEAN, trade) applied to market question text,
  (B) rely solely on Polymarket category tags, or (C) maintain a manually curated list of
  market IDs in `mcp.config.json` (most precise, requires manual updates)?
  Answer: A / B / C (or combination).

**BLOCKER-020-D**: Polling cadence during market hours vs off-hours
- The current intelligence cycle runs every 15 min during market hours and 60 min off-hours.
  Prediction markets are global and 24/7. Should prediction market polling: (A) follow the
  same market-hours/off-hours split as existing cycle, (B) run at a fixed 30-min interval
  24/7 regardless of VN market hours, or (C) run more frequently during VN market hours
  (e.g. 15 min) and less frequently off-hours (e.g. 60 min)?
  Answer: A / B / C.

---

### Task queue (pending blocker answers)

| # | Title | Role | Status |
|---|-------|------|--------|
| REQ-020 | BA: Requirement Spec for Sprint 020 | BA | Blocked — awaiting BLOCKER-020-A through D |
| TECH-020 | Architect: Technical Design for Sprint 020 | Architect | Blocked — awaiting REQ-020 |

---

## Previous Sprint

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

## Next-Next Sprint (queued — Sprint 018 must sign-off and Sprint 017 must merge first)

status: PLANNED
sprint_id: 019
queued_at: 2026-04-01

---

### Theme

**"Know What You're Watching"**

The analysis team identified two silent intelligence failures observed on 2026-04-01:

1. The headline "Vinamilk lên kế hoạch doanh thu 2026 cao kỷ lục" scored an impact of 5/10
   yet the Stocks field was empty. `run_impact_chain` returned "No watchlist stocks directly
   affected." VNM is on the watchlist. The cascade engine does not know that "Vinamilk" the
   company name refers to stock code VNM. The same gap exists for every company whose
   Vietnamese trade name differs from its ticker: Hòa Phát → HPG, Vietcombank → VCB,
   FPT Corporation → FPT, and dozens more.

2. The VN-Index seasonal pattern "VN-Index 4 năm liên tiếp mất điểm tháng 4" scored an
   impact of 8/10 yet produced zero individual-stock alerts. A market-wide pattern of that
   magnitude should cascade to every watchlist stock as a contextual risk signal — not be
   silently discarded because no single stock name appears in the headline.

Both gaps are correctness bugs, not performance issues. They cause the system to silently
miss its primary purpose: alerting the investor about news that directly affects their
portfolio.

The guiding constraint from earlier sprints remains: no LLM calls, no new external data
sources, no changes to existing MCP tool signatures.

---

### Goal

Wire company-name-to-stock-code aliases into the cascade and signal-detection pipeline so
that Vietnamese trade names in news headlines resolve to watchlist stock codes; and make
market-wide pattern articles cascade as contextual risk signals to all watchlist stocks.

---

### Scope

**IN**

**P0 — Company name alias dictionary (task 160)**

A new domain service `src/domain/services/stockAliases.ts` that exports:

```typescript
// Returns all known aliases (trade names, abbreviations, full Vietnamese names)
// for a given stock code, lower-cased, accent-normalised.
export function getAliasesForCode(code: string): string[];

// Given a text string, returns all watchlist stock codes whose aliases
// appear in the text. Case-insensitive, accent-insensitive.
export function detectStocksInText(text: string, watchlistCodes: string[]): string[];
```

The alias map is a static, hard-coded object in the same file. Initial coverage must
include at minimum every stock in the default watchlist (VNM, FPT, VCB, VEA) plus the
20 most-liquid HOSE stocks (HPG, VIC, VHM, MSN, MWG, TCB, BID, CTG, ACB, VPB, HDB, STB,
VNM, GAS, PLX, SAB, REE, PNJ, DHG, FPT). The alias object must be extensible — a developer
adds entries without touching any other file.

Aliases for each stock must cover: full Vietnamese company name, common abbreviation, known
brand names (e.g. VNM → ["vinamilk", "viet nam dairy", "sữa vinamilk"]).

Configuration: the alias map lives entirely in `stockAliases.ts`. No database table, no
`mcp.config.json` key. Aliases are static knowledge, not runtime data.

Test requirement: >= 30 test cases covering: exact match, partial match inside a sentence,
accent-normalised match (Vinamilk vs vinamilk), no false-positive on a stock whose name does
not appear, and multi-stock detection in a single headline.

- Task 160: create `src/domain/services/stockAliases.ts` + `src/__tests__/160-stock-aliases.test.ts`

**P0 — Wire aliases into cascade engine and signal detector (task 161)**

Modify `src/domain/services/cascadeEngine.ts` and `src/application/usecases/pollNews.ts`
(the news-mention signal detection path) to call `detectStocksInText()` when the primary
stock-code scan finds zero watchlist hits.

Precise logic change in the cascade engine's article-to-stock mapping step:

1. Current: scan `article.title + article.summary` for exact stock code tokens
   (e.g. "VNM", "FPT").
2. Addition: if step 1 yields zero hits, call `detectStocksInText(text, watchlistCodes)`
   and merge results.
3. Alias-resolved stocks are tagged with `resolvedViaAlias: true` in the intermediate
   signal object (for logging / future explainability — not surfaced in the Alert output
   schema, no breaking change).

The same logic must apply in `signalDetector.ts` when it scans article text for
watchlist-relevant news mentions.

No change to the `Alert` or `Signal` domain model types. No new MCP tool. No change to
Telegram message format.

- Task 161: modify `src/domain/services/cascadeEngine.ts` +
  `src/domain/services/signalDetector.ts` +
  `src/application/usecases/pollNews.ts`

**P1 — Market-wide pattern cascade to all watchlist stocks (task 162)**

Market-wide articles (VN-Index, toàn thị trường, thị trường chứng khoán, index seasonal
patterns) currently produce a cascade analysis entry but generate no per-stock signals
because no individual stock ticker appears in the text.

This task adds a "market-wide broadcast" path in the cascade engine:

Detection: an article is classified as "market-wide" if it matches >= 1 of:
- Contains "VN-Index" (case-insensitive)
- Contains any of: "toàn thị trường", "thị trường chứng khoán", "index", "thị trường"
  combined with a price/percentage token (e.g. "giảm X%", "tăng X điểm", "mất điểm")
- The cascade level resolves to `country` or `global` with impact score >= 6

Broadcast behaviour: when an article is classified market-wide AND impact >= 6 (threshold
configurable via `alerts.marketWideCascadeMinImpact` in `mcp.config.json`, default 6), emit
one `news_mention` signal for EACH watchlist stock with:
- `direction`: inherited from the article's cascade direction (bearish → sell pressure)
- `confidence`: `article.impactScore / 10` (capped at 0.7 — lower than a direct mention)
- `note`: "market-wide cascade: <article title truncated to 80 chars>"

This means "VN-Index 4 năm liên tiếp mất điểm tháng 4" (impact 8, bearish) generates a
`low`-severity signal for VNM, FPT, VCB, VEA simultaneously — which then flows through
the existing alert cooldown / dedup / grouping stack.

The existing news-mention alert noise filter from Sprint 017 (task 152) naturally limits
how many of these broadcast signals become alerts: only non-neutral sentiment articles from
trusted sources within 60 minutes will pass the gate.

Configuration key added to `mcp.config.json`: `alerts.marketWideCascadeMinImpact` (integer,
default 6). No hardcoded thresholds in production code.

- Task 162: modify `src/domain/services/cascadeEngine.ts` +
  `src/application/usecases/runImpactChain.ts` +
  `mcp.config.json`

**OUT**

- Building a database-backed alias store with CRUD MCP tools (deferred — static map is
  sufficient for the watchlist size; adds complexity with no user-facing benefit at this stage)
- Alias learning from news text (deferred — requires NLP entity extraction, out of scope
  without LLM calls)
- Changes to the Alert or Signal domain model type signatures
- Changes to existing MCP tool input/output schemas
- New external data sources
- LLM calls of any kind
- BCTC extractor, ratio computer, or validator changes
- Telegram format changes

---

### Success Metrics

1. **Vinamilk → VNM resolved**: given a news article with title "Vinamilk lên kế hoạch
   doanh thu 2026 cao kỷ lục" and VNM in the watchlist, calling `detectStocksInText()` with
   the title returns `["VNM"]`. A full `run_impact_chain` call for this article produces a
   cascade entry with `affectedStocks` containing VNM.

2. **Alias accuracy**: `detectStocksInText()` test suite passes >= 30 cases with 0 false
   positives on the negative-case set (articles that contain neither the stock code nor any
   alias must return an empty array).

3. **HPG detected from "Hòa Phát"**: `detectStocksInText("Tập đoàn Hòa Phát ghi nhận lợi
   nhuận kỷ lục", ["HPG"])` returns `["HPG"]`.

4. **Market-wide broadcast fires**: given an article "VN-Index 4 năm liên tiếp mất điểm
   tháng 4" with impact score 8 and cascade level `country`, and watchlist = [VNM, FPT,
   VCB, VEA], the cascade engine emits exactly 4 `news_mention` signals — one per watchlist
   stock — each with confidence <= 0.7 and a note starting with "market-wide cascade:".

5. **Market-wide broadcast respects threshold**: an article classified market-wide with
   impact score 5 (below `marketWideCascadeMinImpact = 6`) emits zero broadcast signals.

6. **No regression**: `bun test` passes with 0 failures and `bun tsc --noEmit` reports
   0 errors after all Sprint 019 tasks are merged. The Sprint 017 noise filter (task 152)
   still correctly suppresses neutral, stale, and low-trust articles even when they are
   broadcast via the market-wide path.

---

### Task board (Sprint 019)

| # | Title | Priority | Status | Depends on |
|---|-------|----------|--------|------------|
| 160 | Company name alias dictionary (`stockAliases.ts`) | P0 | Backlog | — |
| 161 | Wire aliases into cascade engine + signal detector | P0 | Backlog | 160 |
| 162 | Market-wide pattern cascade to all watchlist stocks | P1 | Backlog | — |

---

### Dependency chain

```
160 (alias dictionary)          — P0, independent, start first
161 (wire aliases)              — P0, depends on 160 API stable
162 (market-wide broadcast)     — P1, independent of 160/161, can start in parallel with 160

Sprint 017 tasks 152-156 must merge before Sprint 019 starts.
Sprint 018 sign-off must complete before Sprint 019 starts.
```

---

### Key technical decisions (locked at PO level)

- **Static alias map, not a database**: the alias dictionary is a TypeScript const object.
  The watchlist is small (4-20 stocks). A database table adds operational overhead
  (migrations, CRUD tools, backup) with no benefit at this scale. When the watchlist grows
  beyond 50 stocks this decision will be revisited in a future sprint.

- **Accent normalisation strategy**: normalise both the alias keys and the incoming text to
  NFD + remove combining diacritical marks before comparison. This ensures "Vinamílk" (typo
  in source) and "Vinamilk" both hit the same alias. The normaliser is a 3-line pure function
  inside `stockAliases.ts` — no external library.

- **Alias resolution is additive, not replacing**: the current stock-code token scan remains
  as the primary pass. Alias resolution runs only as a fallback (step 2). This avoids any
  risk of false-positive alias matches overriding an explicit ticker symbol.

- **Market-wide confidence cap at 0.7**: a direct mention of "VNM" in a headline warrants
  full confidence. A market-index article that doesn't name a stock warrants lower confidence.
  The cap of 0.7 ensures broadcast signals are downstream of direct signals in the conviction
  scorer without requiring changes to the scorer's weighting logic.

- **`marketWideCascadeMinImpact` default = 6**: impact scores 1-5 are informational or
  low-relevance macro context. Scores 6-10 represent sector-moving or market-moving events
  where every portfolio stock faces exposure. The threshold of 6 was chosen based on the
  observed score distribution: the Vinamilk revenue plan article scored 5 (company-specific,
  should NOT broadcast) while the VN-Index seasonal pattern scored 8 (market-wide, SHOULD
  broadcast). This correctly separates the two cases at the default threshold.

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
