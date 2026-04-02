# Sprint Goal

## Current Sprint

status: COMPLETE
sprint_id: 035b
started: 2026-04-02
updated: 2026-04-02
completed: 2026-04-02

---

### Theme

**"Two-Team Autonomy — Report Channel Persistence (Sprint 035b)"**

---

### Goal

Sprint 035a delivered the docs and config that define how the Dev Team loop works. Sprint 035b
delivers the four code changes that make it actually run: a SQLite persistence layer for
Report Channel messages, an extended webhook that captures inbound messages from that channel,
and two new MCP tools so the Dev Team cron can read and process reports programmatically.

After this sprint the full autonomous loop is operational:
- Analysis Team agent sends a problem report via `submit_feedback` or `send_test_telegram`
  → message stored in `telegram_reports` SQLite + posted to Report Channel
- Dev Team cron calls `read_telegram_reports` → sees the unprocessed row
- Dev Team fixes the issue, calls `process_telegram_report(id)` → row marked processed +
  Telegram message deleted from Report Channel
- Report Channel stays clean; SQLite has full audit trail

---

### Scope

**IN**

1. **Task 226 — `telegram_reports` SQLite table (P0)**

   Add a new table to `src/infrastructure/db/schema.ts`:

   ```sql
   CREATE TABLE IF NOT EXISTS telegram_reports (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     message_id  INTEGER NOT NULL DEFAULT 0,   -- Telegram message_id (0 if sourced from webhook)
     text        TEXT    NOT NULL,
     from_agent  TEXT    NOT NULL DEFAULT 'unknown',  -- who sent it (agent name or "human")
     priority    TEXT    NOT NULL DEFAULT 'normal',   -- "critical" | "high" | "normal" | "monitor"
     status      TEXT    NOT NULL DEFAULT 'new',      -- "new" | "processed"
     created_at  INTEGER NOT NULL DEFAULT (unixepoch())
   );
   CREATE INDEX IF NOT EXISTS idx_telegram_reports_status ON telegram_reports(status);
   CREATE INDEX IF NOT EXISTS idx_telegram_reports_created ON telegram_reports(created_at);
   ```

   Add `src/infrastructure/db/telegramReportStore.ts` — CRUD helpers:
   - `insertReport(text, fromAgent, messageId, priority)` → inserted row id
   - `listNewReports()` → `TelegramReport[]` with status = "new", ordered by created_at ASC
   - `markProcessed(id)` → void

   Wire `sendTelegramReport()` in `telegram.ts` to call `insertReport()` after a successful
   send so every outbound report is immediately persisted.

   Files:
   - MODIFY: `src/infrastructure/db/schema.ts` — add `telegram_reports` table + indexes
   - ADD: `src/infrastructure/db/telegramReportStore.ts` — CRUD store
   - MODIFY: `src/infrastructure/notifiers/telegram.ts` — call `insertReport` after successful
     `sendTelegramReport()` return (non-blocking, swallow errors)
   - ADD: `src/__tests__/226-telegram-report-store.test.ts` — unit tests for CRUD

2. **Task 227 — Webhook for Report Channel (P0)**

   The current webhook at `POST /telegram-webhook` in `src/index.ts` only dispatches to
   `telegramCommandRouter` which handles TELEGRAM_CHAT_ID messages. Extend it so that
   messages arriving from TELEGRAM_REPORT_ID are stored in `telegram_reports` with
   `from_agent = "human"` and `status = "new"`.

   Detection logic: compare `message.chat.id` (as string) against `TELEGRAM_REPORT_ID` env
   var. If they match, call `insertReport()` and return 200 immediately (no command dispatch).
   If they match TELEGRAM_CHAT_ID, continue existing command routing as today.

   The webhook URL registered for the Report Channel is the same endpoint
   (`POST /telegram-webhook`) — Telegram delivers both channels to the same bot so a single
   endpoint suffices; the chat_id in the payload disambiguates.

   Files:
   - MODIFY: `src/index.ts` — extend `/telegram-webhook` handler with Report Channel branch
   - ADD: `src/__tests__/227-report-webhook.test.ts` — unit tests for dispatch logic

3. **Task 228 — `read_telegram_reports` MCP tool (P1)**

   New MCP tool that the Dev Team cron calls as its first action each loop.

   Input schema (all optional):
   - `status` — `"new"` | `"processed"` | `"all"` (default: `"new"`)
   - `limit` — integer 1–50 (default: 20)

   Output: JSON array of report rows ordered by `created_at` ASC. Each row includes:
   `id`, `message_id`, `text`, `from_agent`, `priority`, `status`, `created_at` (ISO string).

   When `status = "new"` and the array is empty the tool returns:
   `"Khong co bao cao moi. Vong lap ket thuc."` — the Dev Team cron exits immediately on this.

   Files:
   - ADD: `src/interface/mcp/tools/telegramReportTools.ts` — `read_telegram_reports` tool
   - MODIFY: `src/interface/mcp/server.ts` — register tool (63 total)
   - ADD unit tests in `src/__tests__/228-read-telegram-reports.test.ts`

4. **Task 229 — `process_telegram_report` MCP tool (P1)**

   New MCP tool that the Dev Team cron calls after handling a report.

   Input:
   - `id` (required) — the `telegram_reports.id` primary key
   - `delete_telegram_message` (optional, default: `true`) — whether to call
     `deleteTelegramReport(message_id)` in addition to marking the DB row processed

   Behaviour:
   1. Read the row for `id`. If not found → return error "Report {id} not found."
   2. If `message_id > 0` and `delete_telegram_message = true` → call
      `deleteTelegramReport(message_id)`. Swallow errors (Telegram may have already
      deleted the message; the DB update is the source of truth).
   3. Call `markProcessed(id)`.
   4. Return: `"Report {id} marked as processed. Telegram message {message_id} deleted."` or
      `"Report {id} marked as processed. Telegram deletion skipped."` if message_id = 0.

   Files:
   - MODIFY: `src/interface/mcp/tools/telegramReportTools.ts` — add `process_telegram_report`
     tool alongside `read_telegram_reports` in the same file
   - MODIFY: `src/interface/mcp/server.ts` — register tool (64 total)
   - ADD unit tests in `src/__tests__/229-process-telegram-report.test.ts`

**OUT**

- Priority auto-classification via NLP — store raw text as received; priority can be
  enriched in a future sprint once the table is proven
- Re-delivery / retry semantics for failed Telegram sends — out of scope
- Report Channel webhook registration automation — the `telegramWebhookSetup.ts` registers
  only the Chat Channel webhook; the Report Channel webhook must be registered once manually
  via `curl` (documented in task 227 notes); automation is a future task
- New analysis tools, new data sources, new cascade rules

---

### Success Metrics

1. `telegram_reports` table exists in SQLite with correct schema. `insertReport()` inserts a
   row. `listNewReports()` returns only rows with `status = "new"`. `markProcessed(id)`
   flips status to `"processed"`.

2. After a `sendTelegramReport("test")` call, one row appears in `telegram_reports` with
   `status = "new"` and the correct `message_id` returned by the Telegram API.

3. A POST to `/telegram-webhook` with a payload whose `chat.id` matches `TELEGRAM_REPORT_ID`
   inserts a row in `telegram_reports` with `from_agent = "human"` and does not dispatch
   to the command router.

4. `read_telegram_reports` with default args returns the row from metric 2 in the JSON array.
   When no new rows exist, returns the Vietnamese exit message.

5. `process_telegram_report(id)` marks the row processed in SQLite and calls
   `deleteTelegramReport` with the correct `message_id`. Subsequent `read_telegram_reports`
   call with `status = "new"` returns an empty result.

6. `bun test` full suite passes: existing 1934+ tests + new tests for tasks 226-229, 0 failures.

7. `bun tsc --noEmit` → 0 errors.

8. Tool count after Sprint 035b: 64 (62 + `read_telegram_reports` + `process_telegram_report`).

---

### Task board (Sprint 035b)

| # | Title | Priority | Agent | Status | Depends on |
|---|-------|----------|-------|--------|------------|
| 226 | `telegram_reports` SQLite table + store + wire sendTelegramReport | P0 | BA | Backlog | — |
| 227 | Webhook for Report Channel | P0 | BA | Backlog | 226 |
| 228 | `read_telegram_reports` MCP tool | P1 | BA | Backlog | 226 |
| 229 | `process_telegram_report` MCP tool | P1 | BA | Backlog | 226, 228 |

---

### Dependency chain

```
226 (schema + store + telegram.ts wiring — foundation for everything)
  ├─→ 227 (webhook — reads insertReport from 226)
  ├─→ 228 (read tool — reads listNewReports from 226)
  └─→ 229 (process tool — reads markProcessed from 226, calls deleteTelegramReport)
            └─ 229 can start in parallel with 228 once 226 is done
```

226 must be complete before 227, 228, or 229 can begin. 227 and 228 can proceed in parallel
after 226 merges. 229 depends on 226 and 228 being reviewable (it reuses the same tool file
as 228 and calls `deleteTelegramReport` which is already in telegram.ts).

---

### Key technical decisions (locked at PO level)

- **Single endpoint, dual dispatch**: `/telegram-webhook` already exists and handles the bot
  token. Using the same endpoint for both channels avoids registering a second Bun route and
  is consistent with how Telegram delivers updates — all updates for a single bot token go to
  one webhook URL regardless of which chat they originate from.

- **`from_agent` is a free-text label**: no enum enforcement. `submit_feedback` will pass
  the agent name. The webhook will pass `"human"`. Future agents can pass their own names.
  No migration required to add new senders.

- **`insertReport` is best-effort in `sendTelegramReport`**: if the SQLite insert fails, the
  Telegram send is not rolled back. The Report Channel is the authoritative real-time view;
  SQLite is the persistence layer for the Dev Team loop. A failed insert produces a log warning
  only.

- **`delete_telegram_message` defaults to `true`**: the Dev Team cron always wants to keep the
  Report Channel clean. The flag exists solely for test harnesses that inject mock message_ids.

- **Tool count target 64**: 62 (after Sprint 034/035a) + 1 (`read_telegram_reports`, task 228)
  + 1 (`process_telegram_report`, task 229) = 64. Tasks 226 and 227 add no MCP tools.

- **No new external data sources or fetchers**: all four tasks operate on SQLite and existing
  Telegram infrastructure already in `telegram.ts`.

---

## Previous Sprint

status: COMPLETE
sprint_id: 035a
started: 2026-04-02
updated: 2026-04-02
completed: 2026-04-02

---

### Theme

**"Two-Team Autonomy — Docs + Config"**

---

### Goal

Establish the documentation and configuration foundation for the two-team autonomous loop.
Delivered: `dev-team-cron.md`, updated `unified-agent.md`, all agent `.md` files refreshed
for 62 tools and correct channel rules, `start.sh` updated to `bun --hot`, `AI_TEAM_DESIGN.md`
updated, `feedbackTools.ts` fixed to not cross-post to user channel. All committed to main.

---

### Success Metrics (all met)

1. All cowork agent `.md` files show 62 tools, correct channel rules.
2. `dev-team-cron.md` exists with complete hourly loop specification.
3. `unified-agent.md` is analysis-only (no dev chain).
4. `start.sh` uses `bun --hot` for zero-downtime code reload.
5. `feedbackTools.ts` does not cross-post to user Chat Channel.
6. All changes committed and pushed to main.

---

## Previous Sprint (034)

status: COMPLETE
sprint_id: 034
started: 2026-04-02
updated: 2026-04-02
completed: 2026-04-02

---

### Theme

**"Depth Over Breadth — Sentiment Trend Intelligence + Context Sync"**

---

### Goal

The system has 61 tools and 1916 tests. Adding more tools delivers diminishing returns. Sprint
034 invests in depth: (1) close the institutional memory gap by syncing CLAUDE.md through
Sprint 033, and (2) surface the most under-exploited signal already in the database — per-stock
sentiment trend over time — making the investor's existing RAG and SQLite data answer the
question "is the market turning bullish or bearish on VNM this week?"

---

### Scope

**IN**

1. **Task 224 — CLAUDE.md sync: document Sprints 030-033 additions (P0)**

   CLAUDE.md currently documents through Sprint 029. Sprints 030-033 added 14 tasks across
   6 capability areas: Telegram command interface (214-216), multi-stock comparison (217),
   weekly portfolio Telegram report (218), custom alert rules engine (219), watchlist peer
   suggestions (220), alert snooze/mute (222), and portfolio target allocation (223).

   The sync must update:
   - "Current implementation status" — Done section listing all new tasks
   - Architecture summary — new files: `snoozeStore.ts`, `targetAllocationStore.ts`,
     `allocationTools.ts`, `snoozeTools.ts`, `telegramWebhook.ts`, `customAlertRules.ts`,
     `compareStocksTools.ts`, `weeklyPortfolioJob.ts`
   - Scheduled Jobs table — weekly portfolio Telegram job (Sunday 22:00)
   - Tool count: 61 registered MCP tools

   Files:
   - MODIFY: `CLAUDE.md` — sync all sections through Sprint 033

2. **Task 225 — Sentiment trend per stock: `get_sentiment_trend` MCP tool (P1)**

   The `analysis_entries` table already stores per-stock `sentiment` (bullish/bearish/neutral)
   with `created_at` timestamps, produced by `sentimentClassifier.ts` on every news poll.
   Today the investor has no way to query this time series.

   New MCP tool `get_sentiment_trend` accepts:
   - `stock_code` (required): e.g. "VNM"
   - `window_days` (optional, default 7): lookback window — 7, 14, or 30

   The tool queries `analysis_entries` for rows mentioning `stock_code` within the window,
   groups them by day, computes a daily sentiment score (bullish=+1, neutral=0, bearish=-1),
   and returns:
   - Daily breakdown: date, count, bullish%, bearish%, neutral%, net score
   - Trend direction: "improving" | "deteriorating" | "stable" (based on linear regression
     slope of net score over the window)
   - Summary sentence in Vietnamese, e.g.:
     "VNM: 7 ngay qua co xu huong tich cuc (4 ngay bullish, 2 ngay neutral, 1 ngay bearish).
      Xu huong: dang cai thien."

   Storage: no new table required. The tool reads from existing `analysis_entries`.
   A lightweight in-memory slope computation (no external math library needed).

   Files:
   - ADD: `src/domain/services/sentimentTrend.ts` — pure function: `computeSentimentTrend(entries, windowDays)` → trend object
   - ADD: `src/interface/mcp/tools/sentimentTrendTools.ts` — `get_sentiment_trend` MCP tool
   - MODIFY: `src/interface/mcp/server.ts` — register 1 new tool (62 total)
   - ADD: `src/__tests__/225-sentiment-trend.test.ts` — unit tests for trend computation and
     MCP tool response formatting

**OUT**

- Historical OHLCV chart data endpoint — requires structured price history redesign; Sprint 035+
- Automated backtesting — depends on OHLCV history being solid; deferred
- Multi-timeframe analysis (1D/1W/1M views) — partially covered by existing pattern matcher
  and periodic summaries; not the highest gap
- New external data sources
- LLM-generated text in any output

---

### Success Metrics

1. `CLAUDE.md` accurately lists all tasks through Sprint 033, all new files in the architecture
   summary, correct tool count of 61, and the weekly portfolio Telegram cron job.

2. `get_sentiment_trend VNM 7` returns a structured response with per-day sentiment breakdown
   for the last 7 days, a trend direction label, and a Vietnamese summary sentence. When there
   are fewer than 3 data points, the tool returns a graceful "Du lieu khong du" message rather
   than an error.

3. `bun test` full suite passes: existing 1916 tests + new tests for tasks 224/225, 0 failures.

4. `bun tsc --noEmit` → 0 errors.

5. Tool count after Sprint 034: 62 (task 224 adds 0 tools; task 225 adds 1 tool).

---

### Task board (Sprint 034)

| # | Title | Priority | Agent | Status | Depends on |
|---|-------|----------|-------|--------|------------|
| 224 | CLAUDE.md sync: document Sprints 030-033 | P0 | BA | Backlog | — |
| 225 | Sentiment trend per stock: `get_sentiment_trend` | P1 | BA | Backlog | 224 (soft) |

---

### Dependency chain

```
224 (CLAUDE.md sync — documentation only, no code changes; standalone)
  └─→ 225 (sentiment trend — new domain service + MCP tool; benefits from 224 being
            complete so the new tool is immediately documented)
```

224 and 225 can proceed in parallel. 225 should target merge after 224 so CLAUDE.md is
updated in one pass.

---

### Key technical decisions (locked at PO level)

- **No new SQLite table for sentiment trend**: `analysis_entries` already contains the
  required fields (`stock_code`, `sentiment`, `created_at`). A pure read-path query
  avoids schema migration risk.

- **Linear regression slope for trend direction**: a simple least-squares slope over the
  daily net sentiment scores is sufficient and avoids any external math dependency. Positive
  slope = "improving", negative = "deteriorating", near-zero (|slope| < 0.05) = "stable".

- **Tool count target 62**: 61 (current after Sprint 033) + 0 (task 224) + 1 (task 225) = 62.

- **`window_days` capped at 30**: beyond 30 days the signal-to-noise ratio of sentiment
  entries degrades because the RAG store prunes old embeddings. The tool rejects values
  outside 1–30 with a clear error message.

---

## Previous Sprint

status: COMPLETE
sprint_id: 033
started: 2026-04-01
updated: 2026-04-02
completed: 2026-04-02

### Theme

**"Investor UX Hardening — Smarter Watchlist, Quieter Alerts, Persistent Targets"**

---

### Goal

The investor's three most common friction points are: (1) manually looking up sector peers
when adding a new stock to the watchlist, (2) being flooded with expected alerts during
earnings season when a stock is naturally volatile, and (3) re-entering target portfolio
weights every time the rebalancing tool is called. Sprint 033 eliminates all three frictions
with three tightly scoped additions that build exclusively on existing infrastructure.

---

### Scope

**IN**

1. **Task 220 — Watchlist auto-enrichment: sector peer suggestions on `add_to_watchlist` (P0)**

   When the investor calls `add_to_watchlist` with stock code `VCB`, the response appends a
   suggestion block listing the top 2-3 sector peers from `sectorPeers.ts` that are not yet
   on the watchlist. Example response suffix:

   ```
   Da them VCB (banking) vao danh sach theo doi.
   Goi y them cac co phieu cung nganh: BID, CTG, MBB
   (Dung add_to_watchlist de them tung ma.)
   ```

   The suggestion is informational only — it does not add peers automatically. No new MCP
   tool is added; the existing `add_to_watchlist` tool response is enriched.

   Files:
   - MODIFY: `src/domain/services/sectorPeers.ts` — add `getSectorPeers(stockCode): string[]`
     helper that returns top peers excluding the stock itself
   - MODIFY: `src/interface/mcp/tools/watchlist.ts` — after successful add, call
     `getSectorPeers`, filter against current watchlist, append suggestion text
   - ADD: `src/__tests__/220-watchlist-peer-suggestions.test.ts` — unit tests for peer
     suggestion logic and response formatting

2. **Task 222 — Alert snooze/mute: `snooze_alerts` / `unmute_alerts` MCP tools (P1)**

   Let the investor temporarily silence alerts for a stock without removing it from the
   watchlist. A snooze record is stored in a new `alert_snooze` SQLite table:

   ```
   stock_code   TEXT
   snoozed_until  INTEGER  -- Unix timestamp; NULL = muted indefinitely
   reason       TEXT       -- investor-supplied label ("Q1 earnings volatility")
   created_at   INTEGER
   ```

   During `sendAlerts()` in the intelligence cycle, any alert whose stock code has an active
   snooze record (snoozed_until > now, or NULL) is skipped for Telegram dispatch but still
   stored in SQLite. Skipped alerts are marked with `notified = -1` (new sentinel for
   "snoozed") so they are distinguishable from unnotified (`0`) and notified (`1`).

   Two new MCP tools:
   - `snooze_alerts` — snooze a stock for N hours (or indefinitely). Returns confirmation
     with snooze expiry in Vietnamese (e.g., "VCB da tam tat thong bao den 15:00 ngay 03/04").
   - `unmute_alerts` — lift an active snooze immediately.

   `get_alerts` response prepends a warning line when any watchlist stock is currently snoozed:
   "Luu y: VCB dang tam tat thong bao (den 15:00 03/04)."

   Files:
   - MODIFY: `src/infrastructure/db/schema.ts` — add `alert_snooze` table
   - ADD: `src/infrastructure/db/snoozeStore.ts` — CRUD for snooze records
   - MODIFY: `src/scheduler/intelligenceCycleJob.ts` (or `alertStore.ts` sendAlerts path) —
     check snooze before dispatching each alert to Telegram
   - MODIFY: `src/interface/mcp/tools/alerts.ts` — prepend active snooze warnings to
     `get_alerts` response
   - ADD: `src/interface/mcp/tools/snoozeTools.ts` — 2 new MCP tools
   - MODIFY: `src/interface/mcp/server.ts` — register 2 new tools (59 total)
   - ADD: `src/__tests__/222-alert-snooze.test.ts` — unit tests

3. **Task 223 — Portfolio target allocation: `set_target_allocation` / `get_target_allocation` MCP tools (P2)**

   Store the investor's target portfolio weights in SQLite so that `get_rebalancing_signals`
   (task 195) and future rebalancing calls do not require the investor to re-specify weights
   each time. A target allocation record is simple:

   ```
   stock_code   TEXT PRIMARY KEY
   target_pct   REAL   -- 0.0–100.0
   updated_at   INTEGER
   ```

   Weights are investor-managed; the system does not auto-normalise. If weights sum to != 100,
   a warning is included in the response ("Tong trong so hien tai: 95%. Kiem tra lai.").

   Two new MCP tools:
   - `set_target_allocation` — set or update the target weight for one or more stocks.
     Accepts a list of `{stock_code, target_pct}` pairs.
   - `get_target_allocation` — return current targets, actual weights (from
     `portfolio_positions` market value), and deviation from target for each stock.

   `get_rebalancing_signals` is extended to read from `target_allocations` when no explicit
   targets are supplied in the call — making targets the new default source of truth.

   Files:
   - MODIFY: `src/infrastructure/db/schema.ts` — add `target_allocations` table
   - ADD: `src/infrastructure/db/targetAllocationStore.ts` — CRUD
   - MODIFY: `src/application/usecases/getRebalancingSignals.ts` (task 195) — fall back to
     `target_allocations` when no explicit targets provided
   - ADD: `src/interface/mcp/tools/allocationTools.ts` — 2 new MCP tools
   - MODIFY: `src/interface/mcp/server.ts` — register 2 new tools (61 total)
   - ADD: `src/__tests__/223-target-allocation.test.ts` — unit tests

**OUT**

- Historical OHLCV chart data endpoint — requires structured price history redesign; Sprint 034+
- News sentiment trend per stock — valuable but depends on RAG query patterns not yet indexed by stock; Sprint 034+
- Auto-add peers (only suggest, never add automatically) — avoids watchlist pollution
- LLM-generated text in any output — rule-based only
- New external data sources

---

### Success Metrics

1. `add_to_watchlist` with code `VCB` returns a response that includes a suggestion naming
   at least 2 sector peers (e.g., BID, CTG) that are not already on the watchlist. If all
   peers are already on the watchlist, no suggestion block appears.

2. `snooze_alerts VNM 4` silences VNM Telegram alerts for 4 hours. During that window the
   intelligence cycle stores VNM alerts in SQLite with `notified = -1`. After 4 hours the
   snooze expires and alerts resume normally. `unmute_alerts VNM` lifts the snooze immediately.

3. `set_target_allocation [{VNM: 25}, {FPT: 30}, {VCB: 30}, {VEA: 15}]` stores 4 rows.
   Subsequent `get_rebalancing_signals` call with no explicit targets reads from
   `target_allocations` and returns deviation from target for each stock.

4. `bun test` full suite passes: existing 1864 tests + new tests for tasks 220/222/223, 0
   failures.

5. `bun tsc --noEmit` → 0 errors.

6. Tool count after Sprint 033: 61 (59 after task 222, +2 from task 223). Task 220 adds no
   new MCP tools.

---

### Task board (Sprint 033)

| # | Title | Priority | Agent | Status | Depends on |
|---|-------|----------|-------|--------|------------|
| 220 | Watchlist auto-enrichment: sector peer suggestions | P0 | BA → Architect → Dev | Backlog | — |
| 222 | Alert snooze/mute: `snooze_alerts` / `unmute_alerts` | P1 | BA → Architect → Dev | Backlog | — |
| 223 | Portfolio target allocation: `set_target_allocation` / `get_target_allocation` | P2 | BA → Architect → Dev | Backlog | 195 (soft) |

---

### Dependency chain

```
220 (watchlist enrichment — touches sectorPeers + watchlist tool only; standalone)
222 (snooze — new DB table + intelligence cycle hook; standalone)
  └─→ 223 (target allocation — new DB table + rebalancing integration; benefits from 222
            DB migration pattern being established first)
```

220 and 222 can proceed in parallel. 223 starts after 222 is in Review so the DB schema
migration pattern (new table + CRUD store) is established and reviewable before 223 repeats it.

---

### Key technical decisions (locked at PO level)

- **Peer suggestions are response-only**: `getSectorPeers()` is a pure function returning
  stock codes. No new data is stored. The suggestion is appended to the existing
  `add_to_watchlist` response string — no schema changes required for task 220.

- **Snooze sentinel `notified = -1`**: the existing `alerts` table already has a `notified`
  INTEGER column (0/1). Using -1 as a snooze sentinel avoids a schema change to the `alerts`
  table itself. Only the new `alert_snooze` table and the dispatch check are added.

- **Target allocation weights are advisory**: the system stores them as supplied. It warns
  when the sum deviates from 100% but does not block the save. This keeps the tool fast and
  avoids edge cases where the investor is mid-edit.

- **Tool count target 61**: 57 (current after Sprint 032) + 0 (task 220) + 2 (snooze tools,
  task 222) + 2 (allocation tools, task 223) = 61.

- **No new external data sources or fetchers**: all three tasks operate on data already
  present in SQLite or domain services.

---

## Completed Sprints

| Sprint | Theme | Completed | Tasks |
|--------|-------|-----------|-------|
| 000 | Foundation | 2026-03-24 | 000 |
| 001 | BCTC Pipeline Wave 1 | 2026-03-25 | 001, 002, 003, 011, 012, 041, 042, 014 |
| 002 | BCTC Pipeline Wave 2 | 2026-03-26 | 043, 044, 013, 045, 046, 047, 029, 030, 048, 085 |
| 003 | News + Alerts | 2026-03-27 | 021, 082, 063, 064, 086 |
| 004 | MCP Wiring + Analysis | 2026-03-27 | 087, 022, 023, 061, 062, 083 |
| 005 | Market Data + Scheduler | 2026-03-28 | 088, 026, 102, 104, 103, 101 |
| 006 | Analytical Depth | 2026-03-28 | 065, 066, 027, 084, 105, 123 |
| 007 | Doc + Tests | 2026-03-28 | DOC-001, 081, 122, 124, 125 |
| 008 | Macro Intelligence | 2026-03-29 | FIX-081, 025, 028, 126, 089 |
| 009 | SSC Automation + Telegram | 2026-03-29 | 031, 034, 106 |
| 010 | Security + Alert Quality | 2026-04-01 | SQL-fix, 131, 132 |
| 011 | Adaptive Signals + Sentiment | 2026-04-01 | 133, 134, 135, 137 |
| 012 | Periodic Summaries | 2026-04-01 | 130 |
| 013 | Fetcher Reliability + Sector Context | 2026-04-01 | 035, 024, 035-TE, sectorPeers, macroThresholds, priceNewsValidator, commodityTracker |
| 014 | Trade Relationships | 2026-04-01 | tradeRelationships, tradeStore |
| 015 | Circuit Breaker | 2026-04-01 | 136 |
| 016 | Conviction Scorer + Portfolio Tools | 2026-04-01 | convictionScorer, portfolioTools, feedbackTools |
| 017 | Production Hardening | 2026-04-01 | 152, 153, 154, 155, 156 |
| 018 | Data Integrity First | 2026-04-01 | 157, 158, 159 |
| 019 | Stock Aliases + Market Broadcast | 2026-04-01 | 160, 161, 162 |
| 020 | Prediction Market Intelligence | 2026-04-01 | 163, 164, 165, 166 (stub), 167, 168, 169 |
| 021 | Close the Loop — Prediction Signals Live | 2026-04-01 | 170, 171, 172, 173 |
| 022 | House in Order | 2026-04-01 | 174, 175, 176, 177 |
| 023 | Close the Investor Loop | 2026-04-01 | 178, 179, 180, 181 |
| 024 | Reliability Hardening and Investor UX Polish | 2026-04-01 | 182, 183, 184, 185 |
| 025 | Daily Investor Intelligence | 2026-04-01 | 186, 187, 188 |
| 026 | Signal Quality and Portfolio Correlation | 2026-04-02 | 189, 190, 191 |
| 027 | Stability First | 2026-04-02 | 194 (CLAUDE.md sync), 195 (rebalancing, in Review), hotfixes 198-205 |
| 028 | Structural Integrity and Investor Safety Net | 2026-04-02 | 192, 193, 206, 207 |
| 029 | Always-On Investor | 2026-04-02 | 208 (Telegram commands), 209 (P&L snapshot), 210 (source health) |
| 030 | Quality Before Quantity | 2026-04-02 | 211 (CLAUDE.md sync), 212 (worktree cleanup), 213 (test isolation) |
| 031 | Telegram Command Interface | 2026-04-02 | 214 (webhook + router), 215 (registration + security), 216 (integration tests) |
| 032 | See More, Decide Faster | 2026-04-02 | 217 (compare_stocks), 218 (weekly portfolio Telegram), 219 (custom alert rules) |
| 033 | Investor UX Hardening | 2026-04-02 | 220 (watchlist peer suggestions), 222 (alert snooze/mute), 223 (target allocation) |
| 034 | Depth Over Breadth | 2026-04-02 | 224 (CLAUDE.md sync), 225 (sentiment trend) |
| 035a | Two-Team Autonomy — Docs + Config | 2026-04-02 | dev-team-cron.md, unified-agent.md, agent files, start.sh, feedbackTools fix |
