# Sprint RECAP-CMD — On-demand `/recap` `/recapw` `/recapm` Telegram pull-commands

**BUILD STATUS 2026-05-27T21:34Z — OPEN (PO self-initiated from an EXPLICIT user feature request; full autonomy to scope/dispatch).**
**Note:** `docs/SPRINT_GOAL.md` holds the parallel still-OPEN SELF-IMPROVE-GATE sprint (different zone, no conflict). This file is the RECAP-CMD sprint goal, tracked separately like its predecessor `docs/REQ_NEWS-CMD.md`.

User (non-technical, French-based, broken English — verbatim intent):
> "/recap for day", "/recapw for week", "/recapm for month", "/news retrieve all important new on day" — and on the just-shipped `/news`: *"it reply but i dont see complete recap of day"*.

## Vision

The user can pull a COMPLETE, plain-Vietnamese recap of the market on demand — for today, this week, or this month — by typing one Telegram command, with a reply in ~1 second. The recap is a SYNTHESIS (index move, watchlist movers, top news, alerts, my positions), not just a list of headlines.

## Product Decision — resolves the `/news` ambiguity (PO call, NOT bounced to user)

The user said `/news` "reply but i dont see complete recap of day." Decision:
- **`/news` STAYS AS-IS** — it is the pure news LIST (title + one-line gist + sentiment from `rag_analyses`). It is not broken; it is just narrower than what the user wanted.
- **`/recap` IS the fuller day SYNTHESIS** the user is asking for. The gap the user feels is closed by a NEW command, not by changing `/news`. Each command stays single-purpose; `/news` is not overloaded.

So the "two tangled things" split cleanly: `/news` = headlines, `/recap` = whole-day picture.

## Architectural decision — DATA SOURCE per command (the #1 blocker — RESOLVED by PO before scoping)

PO verified the mcp-server container's reach. **`docs/recaps/*.md` are NOT mounted into the container** (Dockerfile COPYs only `apps/mcp-server/src/`, `tsconfig.json`, `bctc-schema.ts`, `mcp.config.json`; compose mounts only `market_data`, `mcp.config.json`, `reports`, `docs/agent-memory`, and three `docs/data/*.json` files — verified in `docker-compose.yml` mcp-server block and `apps/mcp-server/Dockerfile`). So reading recap `.md` files (option a) is **REJECTED** — it would force an ops compose change + remount and add a stale-file failure mode. All three commands use IN-CONTAINER, ALL-DB assembly functions that ALREADY EXIST:

| Command | Period | Data source (REUSE — do not reinvent) | Nature |
|---------|--------|----------------------------------------|--------|
| `/recap`  | today | `assembleEveningSummary({ db })` — `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts`. Returns typed `EveningSummary` { vnIndex, topStories, watchlistMovers, topAlerts, portfolioPnl, foreignFlowMovers, newsCount, lastPriceUpdate, lastNewsUpdate, ... }. Pure DB reads, ~1s. Run LIVE (do NOT read the persisted `reports/*.json`). | sync read-only |
| `/recapw` | this week (Mon–Sun, GMT+7) | `generatePeriodicSummary("weekly", undefined, db)` — `apps/mcp-server/src/application/usecases/generatePeriodicSummary.ts`. Returns typed `PeriodicSummary` { keyEvents, stockPerformance, alertsSummary, macroContext, newsCount, alertCount, reportCount, periodStart, periodEnd, ... }. Pure DB. | sync read-only |
| `/recapm` | this month (GMT+7) | `generatePeriodicSummary("monthly", undefined, db)` — same use-case. Pure DB. | sync read-only |

**MANDATORY CAVEAT carried to BA/architect/dev — render from STRUCTURED objects, never from prose fields:**
- The existing `buildSummaryText()` (in `generatePeriodicSummary.ts`) and the `PeriodicSummary.summaryText` field produce ENGLISH + jargon ("=== Weekly Market Intelligence Summary ===", "RECOMMENDATIONS", "confidence: 70%", "[UP]/[DN]", "impact 6.0", outlook="bullish"). These are NOT user-facing and MUST NOT be piped to Telegram.
- New handlers render their OWN plain-Vietnamese view from the TYPED fields only. Same for `EveningSummary` — render from typed fields, never serialize the raw object.
- `assembleEveningSummary` is `async` (returns `Promise<EveningSummary>`) — `handleRecap` must be `async`; `handleTelegramCommand` is already `async` (line 612), so awaiting in the router is free.
- `generatePeriodicSummary` is also `async` and performs a best-effort upsert into `market_summaries` as a side-effect — acceptable (it is idempotent on `(period_type, period_start)`), but render from the RETURNED object, not from a subsequent DB read.

## Scope

**IN:**
- Three new read-only handlers in `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`:
  - `handleRecap(db): Promise<{ texts: string[] }>` — day synthesis from `assembleEveningSummary`.
  - `handleRecapWeek(db): Promise<{ texts: string[] }>` — week synthesis from `generatePeriodicSummary("weekly")`.
  - `handleRecapMonth(db): Promise<{ texts: string[] }>` — month synthesis from `generatePeriodicSummary("monthly")`.
- Router wiring in `handleTelegramCommand` for `/recap`, `/recapw`, `/recapm` — same shape as the `/news` branch (line 633): `return { text: r.texts[0] ?? "", texts: r.texts, chatId }`. Must `await` the handler.
- Reuse `chunkStories()` — never split a recap SECTION mid-item across the 4096-char boundary.
- `HELP_TEXT` updated with the three new commands in plain Vietnamese.
- Plain-Vietnamese empty-state fallbacks per command (thin/zero data) — e.g. "Hôm nay chưa có dữ liệu tổng kết.", "Tuần này chưa đủ dữ liệu để tổng kết.", "Tháng này chưa đủ dữ liệu để tổng kết."
- Unit tests with injected in-memory DB / injected fakes (zero creds, zero network), mirroring the existing `handleNews` test suite. Cover: happy path, empty-state, chunking boundary (a recap that exceeds 4096 chars splits without breaking a section).

**OUT:**
- NO change to `/news` behavior (decision above).
- NO mounting `docs/recaps/` into the container; NO `docker-compose.yml` volume changes (data is all-DB).
- NO new DB table, NO new MCP tool, NO scheduler/cron job (these are synchronous pulls, not workflows/jobs).
- NO LLM calls in the render path (assembly fns are rule-based; keep it that way).
- NO new microservice; single zone `apps/mcp-server` only.
- NOT a refactor of `assembleEveningSummary` / `generatePeriodicSummary` — call them as-is via their injectable `db` param.

## Hard constraints (carry through the WHOLE pipeline)

1. **Plain comprehensible Vietnamese** for ALL user-facing text — NO analyst jargon, NO citations / σ / bp / Layer # / hexagram terms / English field names / numeric confidence scores. [[feedback_market_report_plain_vietnamese]] Show price moves with direction + delta % (e.g. "VCB tăng +2,3%", "VN-Index giảm -9 điểm"). [[feedback_market_data_direction]] Use `vi-VN` number formatting (comma decimal) as `/check_position` already does.
2. **Synchronous read-only pull, ~1s reply** — same shape/contract as `/news`. NOT a workflow trigger, NOT a background job.
3. **Single zone:** `apps/mcp-server` only. Owner = `dev-mcp-server` (sole specialist + sole doc-owner of `docs/architecture/microservice/mcp-server/`).
4. **After code lands:** ops MUST rebuild + force-recreate the mcp-server container (NOT just `restart` — stale image). [[feedback_rebuild_after_dev_change]] [[project_mcp_server_write_wedge]]
5. **Live verification path:** webhook is now at `zenmidi.com/vn-market/webhook` (fixed today; `CLOUDFLARE_PATH_PREFIX=/vn-market`, nginx `/webhook` location added — commit 3ddeb820). Ops/QA live tests MUST hit that path, NOT bare `/webhook`.

## Success Metric

User types `/recap`, `/recapw`, `/recapm` against the LIVE bot and receives, within ~1s each, a complete plain-Vietnamese recap:
- `/recap` (day): VN-Index move (direction + points/%), watchlist movers (direction + %), top news headlines, notable alerts, open positions P/L.
- `/recapw` / `/recapm` (week/month): period totals (news/alerts/reports), key events, per-stock moves, alert breakdown — all in plain Vietnamese, no jargon.
Output chunked to ≤4096 chars with no section split mid-item; sensible Vietnamese empty-states when data is thin. `/news` unchanged. QA verifies live via `zenmidi.com/vn-market/webhook` after ops rebuild+force-recreate, then PO sign-off.

## Pipeline

PO (this) → BA (`docs/REQ_RECAP-CMD.md` spec) → architect (confirm VN render contract from the two structured objects; lock section labels) → dev-mcp-server (implement + unit tests) → ops (rebuild + force-recreate) → QA (live verify on `zenmidi.com/vn-market/webhook`) → PO sign-off.

## References (predecessor pattern — reuse, don't reinvent)

- `docs/REQ_NEWS-CMD.md`, `docs/handoffs/TASK_NEWS-CMD.md`, `docs/architecture-briefs/2026-05-27-news-cmd-design.md`
- Existing `/news`: `handleNews` + `chunkStories` + `sentimentLabel` + `midnightVietnamAsUtcInline` in `telegramCommands.ts`
- Webhook send-loop: `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` line 86 — already does `result.texts ?? [result.text]`, new commands plug in for free.
