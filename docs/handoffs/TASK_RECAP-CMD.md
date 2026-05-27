# Handoff — Sprint RECAP-CMD

**Sprint goal SSOT:** `docs/SPRINT_GOAL_RECAP-CMD.md`
**Opened:** 2026-05-27T21:34:53Z by PO (self-initiated, user feature request)
**Zone:** `apps/mcp-server` only — owner `dev-mcp-server`
**Pipeline:** PO → **ba** → architect → pm → dev-mcp-server → ops (rebuild+force-recreate) → qa (live) → PO sign-off

---

## What the user asked for (verbatim intent)

- `/recap` → complete recap of TODAY
- `/recapw` → recap of the WEEK
- `/recapm` → recap of the MONTH
- On the just-shipped `/news`: *"it reply but i dont see complete recap of day"*

## PO decisions LOCKED (do not re-litigate)

1. **`/news` stays as-is** (news LIST). **`/recap` is the new fuller day SYNTHESIS.** The user's gap is closed by a new command, not by changing `/news`.

2. **Data source per command — the #1 blocker, RESOLVED.** `docs/recaps/*.md` are NOT mounted into the mcp-server container (verified: `apps/mcp-server/Dockerfile` COPYs only `src/`+config; `docker-compose.yml` mcp-server mounts only `market_data`, `mcp.config.json`, `reports`, `docs/agent-memory`, three `docs/data/*.json`). So all 3 commands use existing ALL-DB in-container assembly fns:
   - `/recap` → `assembleEveningSummary({ db })` → typed `EveningSummary` (apps/mcp-server/src/application/usecases/assembleEveningSummary.ts)
   - `/recapw` → `generatePeriodicSummary("weekly", undefined, db)` → typed `PeriodicSummary`
   - `/recapm` → `generatePeriodicSummary("monthly", undefined, db)` (apps/mcp-server/src/application/usecases/generatePeriodicSummary.ts)

3. **Render from TYPED fields, never prose.** `buildSummaryText()` / `PeriodicSummary.summaryText` are English+jargon — NOT user-facing. Handlers build their own plain-Vietnamese view from the typed object fields only. Both assembly fns are `async`; handlers `async`; router (`handleTelegramCommand`) is already `async`.

4. **No new DB table / MCP tool / cron / microservice / compose change.** Sync read-only ~1s pulls, same contract as `/news`. No LLM in render path.

## Reuse (predecessor NEWS-CMD pattern)

- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` — `handleNews` (line ~510, returns `{ texts: string[] }`), `chunkStories` (line ~480, never split mid-item), `sentimentLabel`, `midnightVietnamAsUtcInline`, `fmtNum` (vi-VN), `HELP_TEXT` (line ~72), router branch for `/news` (line ~633).
- `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` line 86 — `const chunks = result.texts ?? [result.text];` — new commands plug in for free.
- Refs: `docs/REQ_NEWS-CMD.md`, `docs/handoffs/TASK_NEWS-CMD.md`, `docs/architecture-briefs/2026-05-27-news-cmd-design.md`.

## Constraints carried

- Plain comprehensible Vietnamese, no jargon, direction + delta % on moves, vi-VN number format. [[feedback_market_report_plain_vietnamese]] [[feedback_market_data_direction]]
- After code: ops rebuild + FORCE-RECREATE (not restart). [[feedback_rebuild_after_dev_change]] [[project_mcp_server_write_wedge]]
- Live verify path: `zenmidi.com/vn-market/webhook` (NOT bare `/webhook` — commit 3ddeb820 added nginx location; `CLOUDFLARE_PATH_PREFIX=/vn-market`).
- Commit: serialized, no `-A`, main terminal commits, no branches, no push.

## ACK log

- 2026-05-27T21:34:53Z — PO: sprint scoped, goal + BA task written, data-source blocker resolved. NEXT: ba writes `docs/REQ_RECAP-CMD.md`.
