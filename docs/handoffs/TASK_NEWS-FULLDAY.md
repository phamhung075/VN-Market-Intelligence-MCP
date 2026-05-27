# Handoff — Sprint NEWS-FULLDAY

**Sprint goal SSOT:** `docs/SPRINT_GOAL_NEWS-FULLDAY.md`
**Opened:** 2026-05-27T21:41:17Z by PO (self-initiated, user feature request — item #1 of a four-item ask)
**Zone:** `apps/mcp-server` only — owner `dev-mcp-server`
**Pipeline:** PO → **ba** → architect → pm → dev-mcp-server → ops (rebuild+force-recreate) → qa (live) → PO sign-off

---

## What the user asked for (verbatim intent)

`/news` *"only shows the newest items, just new info"* → they want `/news` to return **ALL important news of the DAY** — full-day coverage, deduped, ranked by importance, not only the latest delta.

(The other three items in the same request — `/recap` `/recapw` `/recapm` — are NOT here. They are owned by the sibling **Sprint RECAP-CMD** opened 21:34Z, `docs/SPRINT_GOAL_RECAP-CMD.md`. Do NOT duplicate them.)

## PO decisions LOCKED (do not re-litigate)

1. **`/news` stays a news LIST but becomes COMPLETE + deduped + importance-ranked.** This REVISES (on the record) the RECAP-CMD "`/news` stays as-is" ruling. The day-SYNTHESIS gap (index move / movers / positions) is STILL `/recap`'s job — unchanged. `/news` and `/recap` stay single-purpose and distinct. No overlap with RECAP-CMD: NEWS-FULLDAY touches ONLY `handleNews`.

2. **The gap is NOT the date window** — PO traced the live code. `handleNews` (`apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L510-600) already queries `rag_analyses WHERE created_at >= midnight-VN ORDER BY impact_score DESC, created_at DESC LIMIT 20`, with a recent-N fallback. The "incomplete day" perception comes from THREE concrete defects, all now in scope:
   - **(1) Silent cap at 20** (`DEFAULT_LIMIT=20`, `MAX_LIMIT=50`) — user sees 20 of N with no signal more exist → full-day coverage required.
   - **(2) No dedup** — same story from multiple feeds (cafef + vnexpress + reuters …) lists once per feed, padding the list AND pushing distinct stories off the cap → dedup on `source_title` (and/or `source_url`), keep the highest-impact / most-complete copy.
   - **(3) Raw HTML in `summary`** — live `rag_analyses.summary` carries `<a href=…>`, `<img …>` fragments → strip/escape at render. **This FOLDS IN the backlogged `NEWS-CMD-HTML-STRIP`** (same display path; that row is now marked folded in TASKS.md).

3. **Single-zone render refinement, no new infra.** Render-time HTML strip INSIDE `handleNews` (NOT upstream `apps/news-fetch/` ingestion — that would split the zone). Dedup is a pure in-handler transform (no schema/query change beyond selecting the columns needed). No new DB table / MCP tool / cron / microservice / `docker-compose.yml` change. No LLM. Synchronous read-only pull, ~1s reply, same contract as today's `/news`.

4. **Importance order preserved, no jargon.** Keep `impact_score DESC` primary order so the de-duplicated list is still most-important-first. NEVER show the `impact_score` number to the user. Sentiment as plain Vietnamese words (tích cực / tiêu cực / trung tính).

## What BA must produce (`docs/REQ_NEWS-FULLDAY.md`)

Decompose the three defects into atomic dev + QA tasks with testable ACs:
- (a) **Full-day-coverage** mechanism — exact default so a normal trading day's distinct important stories ALL appear (raise default + chunk as the length safety-valve, and/or an honest "hiển thị N tin quan trọng nhất hôm nay" line when a sane upper bound is hit). `/news N` stays an explicit user override.
- (b) **Dedup** key + tie-break — normalize on `source_title` (and/or `source_url`); keep the highest-impact / most-complete copy; specify the exact comparison so multi-feed duplicates collapse to one.
- (c) **HTML-strip** rule — strip/escape tags in `source_title` + `summary`, preserve human-readable link text, drop markup; dependency-free local helper (flag for architect if a dep is wanted).
- (d) Importance order preserved (no `impact_score` number shown).
- (e) Test matrix extending the existing T-NEWS suite (`apps/mcp-server/src/__tests__/214-telegram-commands.test.ts`): dedup proof, HTML-strip proof, full-day-coverage proof — injected fakes, mirror the `handleNews` tests; no test-baseline regression (floor 9408 PASS / ceiling 348 FAIL).
- (f) `HELP_TEXT` `/news` line wording (update only if behavior changes the "mặc định 20 bài" claim).

Hand to architect to confirm the coverage mechanism + that dedup/strip are pure in-handler transforms, then to pm/dev-mcp-server. Return spec to the PO spec-review gate.

## Reuse (predecessor NEWS-CMD pattern)

- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` — `handleNews` (L510, returns `{ texts: string[] }`, the refinement target), `chunkStories` (L480, never split mid-item), `sentimentLabel` (L445), `midnightVietnamAsUtcInline` (L462), `HELP_TEXT` (L72), router `/news` branch (L633).
- `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` — already iterates `result.texts ?? [result.text]`; NO change needed.
- `rag_analyses` columns confirmed present (per `newsFetchLiveHandler.ts` + `schema-news.ts`): `source_title`, `source_url`, `summary`, `sentiment`, `impact_direction`, `impact_score`, `published_at`, `created_at`.
- Refs: `docs/REQ_NEWS-CMD.md`, `docs/handoffs/TASK_NEWS-CMD.md`, `docs/architecture-briefs/2026-05-27-news-cmd-design.md`.

## Constraints carried

- Plain comprehensible Vietnamese, no jargon, no `impact_score` number, no raw HTML tags. [[feedback_market_report_plain_vietnamese]]
- No silent truncation — `chunkStories` over 4096 chars, never cut mid-story. Never throws.
- After code: ops rebuild + FORCE-RECREATE mcp-server (not restart — stale image). [[feedback_rebuild_after_dev_change]] [[project_mcp_server_write_wedge]]
- Live verify path: `zenmidi.com/vn-market/webhook` (NOT bare `/webhook` — commit 3ddeb820 added the nginx location; `CLOUDFLARE_PATH_PREFIX=/vn-market`).
- Commit: serialized, no `-A`, main terminal commits, no branches, no push, no `pilot-status-*.json`.

## ACK log

- 2026-05-27T21:41:17Z — PO: sprint scoped, goal + BA task written; REVISED the "`/news` stays as-is" ruling on the record; folded in NEWS-CMD-HTML-STRIP; confirmed no overlap with sibling RECAP-CMD. NEXT: ba writes `docs/REQ_NEWS-FULLDAY.md`.
