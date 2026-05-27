# Sprint NEWS-FULLDAY — Refine `/news` to a COMPLETE deduped importance-ranked day digest (+ strip HTML)

**BUILD STATUS — COMPLETE, SIGNED OFF 2026-05-27T22:41:51Z by PO (NEWS-FD-EXIT gate). Success Metric MET; deployed live @ 99f433ec; QA-attested 60/0 + tsc exit 0 + live E2E on `zenmidi.com/vn-market/webhook`. Goal stays ARMED on the subjective USER-comprehensibility axis (lane-c verbal G9) — user real-group confirmation is acknowledgement, not a blocking gate per [[feedback_trust_verification_is_system_job]].** _(Opened 2026-05-27T21:41Z — PO self-initiated from an EXPLICIT user feature request.)_

**Relationship to the sibling sprints (read first — no overlap):**
- `docs/SPRINT_GOAL_RECAP-CMD.md` (OPEN, at BA gate) owns the NEW commands `/recap` `/recapw` `/recapm` (the day/week/month SYNTHESIS). This sprint does NOT touch those — they remain RECAP-CMD's deliverable.
- `docs/SPRINT_GOAL.md` holds the parallel SELF-IMPROVE-GATE sprint (different concern, no conflict).
- This file is the NEWS-FULLDAY sprint goal: it covers ONLY item #1 of the user's request — refining the EXISTING `/news` command — and folds in the already-backlogged `NEWS-CMD-HTML-STRIP` (raw HTML in summaries), since both live on the exact same display path.

User (non-technical, French-based, broken English — verbatim intent reconstructed):
> `/news` "only shows the newest items, just new info" — they want `/news` to return ALL important news of the DAY (full-day coverage, deduped, ranked by importance — not only the latest delta).

## PO product call — REVISING the earlier RECAP-CMD decision (recorded, not silent)

At RECAP-CMD kickoff (2026-05-27T21:34Z) I ruled "`/news` STAYS AS-IS" — that the day-synthesis gap is closed by the NEW `/recap` command, not by changing `/news`. That ruling stands for the SYNTHESIS gap (`/recap` is still the right home for index move + movers + positions). **But the user has now sent a SEPARATE, explicit signal about `/news` itself**: it shows "just new info," not the complete day. That is a distinct, legitimate refinement of `/news`'s OWN job (a news LIST) — not a request to turn `/news` into a synthesis. So I REVISE the narrow "stays byte-for-byte as-is" reading: `/news` stays a news LIST, but it must become a COMPLETE, deduped, importance-ranked list of the DAY's important news rather than a possibly-truncated recency-leaning slice. `/news` and `/recap` stay single-purpose and distinct (`/news` = the full day's headlines+gist+sentiment; `/recap` = the synthesised picture).

## What the LIVE `/news` actually does today (PO traced the code — do NOT re-derive)

`handleNews` (`apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L510-600) already:
- Queries `rag_analyses WHERE created_at >= midnight-Vietnam-today ORDER BY impact_score DESC, created_at DESC LIMIT 20` (so it IS today-windowed and impact-ranked — the user's "just new info" perception is NOT a wrong window).
- Falls back to most-recent-N (header "Tin tức gần đây") when today is empty.
- Renders each row: title + `summary` truncated at 200 chars + plain-VN sentiment via `sentimentLabel`.
- Chunks via `chunkStories` into ≤4096-char messages.

**So the gap is NOT the date window. The gap is three concrete defects that make a full day look incomplete:**
1. **Silent cap at 20** (`DEFAULT_LIMIT=20`, `MAX_LIMIT=50`). On a busy day the user sees 20 of N stories with NO indication more exist — reads as "incomplete." A full-day digest must show ALL of today's important stories (or make the cap honest + raisable), not a silent top-20.
2. **No dedup.** The same story arrives from multiple feeds (cafef + vnexpress + reuters …). `/news` lists each copy, so the list looks padded with near-duplicates AND pushes genuinely distinct stories off the bottom of the cap. A full-day digest must dedup (key on title / url) so each real story appears once.
3. **Raw HTML in the summary** (the backlogged `NEWS-CMD-HTML-STRIP`): live `rag_analyses.summary` contains `<a href=…>`, `<img …>` fragments. A non-technical user must NEVER see raw tags. Strip/escape at render time. Folded in here because it is the same display path and directly harms the "complete day picture" perception.

## Vision

The user types `/news` and instantly receives the COMPLETE set of today's important Vietnam-market news in plain Vietnamese — every distinct story the system gathered since Vietnam-midnight, deduped so nothing repeats, ranked by importance so the biggest stories are first, with clean readable text (no raw HTML), correctly chunked. Not a silent top-20 slice, not a wall of near-duplicates — the whole day's news, once each, most-important-first.

## Binding Session Goal (verbatim intent, ARMED + UNMET)

> `/news` must "retrieve all important news on [the] day" — complete day coverage, deduped, ranked, not just the latest.

Meaning: the EXISTING live `/news` command, refined in place, returns the complete deduped importance-ranked digest of today's `rag_analyses` in plain Vietnamese with HTML stripped. NOT DONE until QA verifies live on `zenmidi.com/vn-market/webhook` that `/news` returns the full deduped day (not a silent slice, no duplicate stories, no raw HTML).

## Scope

**IN:**
- Refine `handleNews` in `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` (single function, single zone):
  - **Full-day coverage:** default behavior returns ALL of today's important stories, not a silent 20-cap. BA/architect decide the exact mechanism (e.g. raise the default to cover a normal day + keep chunking as the length safety-valve, and/or make the count honest with a "hiển thị N tin quan trọng nhất hôm nay" line when a sane upper bound is hit). `/news N` arg still honored as an explicit user override. The non-negotiable: a normal trading day's worth of distinct important stories all appear, not a silent slice.
  - **Dedup:** collapse duplicate stories before rendering. Key on normalized `source_title` (and/or `source_url`); when duplicates collapse, keep the highest-impact / most-complete copy. BA specifies the exact key + tie-break; architect confirms it is a pure in-handler transform (no schema/query change beyond selecting the columns needed).
  - **Importance ranking:** keep the existing `impact_score DESC` primary order (already correct) — make the de-duplicated list still ordered most-important-first. No `impact_score` NUMBER shown to the user (jargon ban).
  - **Strip/escape HTML** (folds in `NEWS-CMD-HTML-STRIP`): remove or escape HTML tags from `source_title` + `summary` before display, at render time in the handler. A small local strip helper (no new dependency unless architect approves one). The `<a href=…>` text inside tags: keep the human-readable link text, drop the markup.
- Keep `chunkStories` reuse — full day will often exceed 4096 chars; chunk, never truncate silently (existing `texts[]` + webhook send-loop already handle this — no change needed there).
- Update the `/news` line in `HELP_TEXT` only if its wording changes (e.g. drop "mặc định 20 bài" if the cap behavior changes); otherwise leave HELP_TEXT alone.
- Empty-state fallback unchanged ("Chưa có tin hôm nay." / "Tin tức gần đây" recent fallback) — keep working.
- Extend `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` (the existing `/news` T-NEWS suite) with: dedup proof (seed duplicate titles → one rendered story), HTML-strip proof (seed a summary with `<a href>`/`<img>` → no `<`/`>` tags in output), full-day-coverage proof (seed more than the old cap of distinct stories → all appear, chunked). Injected in-memory DB / fakes, zero creds, zero network. No test-baseline regression (floor 9408 PASS / ceiling 348 FAIL per `project-stats.json`).
- ops REBUILD + force-recreate the mcp-server container after the change (NOT restart — stale image; `feedback_rebuild_after_dev_change`, `project_mcp_server_write_wedge`).

**OUT:**
- The `/recap` `/recapw` `/recapm` commands — those are RECAP-CMD's deliverable (`docs/SPRINT_GOAL_RECAP-CMD.md`). NEWS-FULLDAY does NOT add, change, or depend on them.
- Turning `/news` into a synthesis (index move / movers / positions) — that is `/recap`'s job. `/news` stays a news LIST.
- Any new scheduled/cron PUSH, any change to the MARKET-group push lane, alert-commander, or the delivery cron. Pull-only, like today's `/news`.
- Fresh on-the-fly news fetching / re-scraping / re-analysis — read stored `rag_analyses` only (the news-fetch pipeline keeps populating it on its own schedule).
- Reading the `docs/daily/` blackboard or `docs/recaps/*.md` — not mounted in the container (verified at RECAP-CMD kickoff); read the live `rag_analyses` table, the current SSOT.
- New DB table / new MCP tool / new microservice / `docker-compose.yml` volume change. None needed — this is a single-handler render refinement.
- Translating foreign-source headlines — render stored `summary`/title as-is (HTML stripped); framing text (labels, headers, sentiment words) MUST stay plain Vietnamese.
- Upstream HTML sanitisation at ingestion in `apps/news-fetch/` — render-time strip in the mcp-server handler is the chosen fix (single zone, no cross-service split). Architect MAY note an upstream-sanitise follow-up but must not split the zone.

## HARD CONSTRAINTS (non-negotiable)

1. **Plain comprehensible Vietnamese only** (`feedback_market_report_plain_vietnamese`): NO analyst jargon — no `impact_score` numbers, no citations, no "Layer #", no σ/bp, no hexagram terms, no raw HTML tags. Sentiment as plain words (tích cực / tiêu cực / trung tính). User is non-technical.
2. **No raw HTML reaches the user.** Tags stripped/escaped before display; link text preserved, markup removed.
3. **Complete day, deduped.** A normal trading day's distinct important stories all appear, each once, most-important-first. No silent slice, no near-duplicate padding.
4. **No silent truncation** — over-4096-char digests chunked, never cut mid-story (existing `chunkStories` contract).
5. **Never throws** — all errors wrapped in a friendly Vietnamese message (existing router contract).
6. **Zone = `apps/mcp-server/`** — dev-mcp-server is the sole code owner. Single-zone; no `multi` split. The whole refinement lives inside `handleNews` + its tests + (maybe) one `HELP_TEXT` line.
7. **Live verification path:** webhook is at `zenmidi.com/vn-market/webhook` (`CLOUDFLARE_PATH_PREFIX=/vn-market`, nginx `/webhook` location — fixed today, commit 3ddeb820). Ops/QA live tests MUST hit that path, NOT bare `/webhook`.
8. **Commit safety:** explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; NO `git push`; all on `main` (NO branches); do NOT touch any `pilot-status-*.json`; never ask user to run/deploy — spawn ops/dev. Main terminal commits (`feedback_concurrent_commit_race`).

## Success Metric

User types `/news` against the LIVE bot → receives, within ~1s, the COMPLETE deduped importance-ranked digest of today's Vietnam-market news in plain Vietnamese: every distinct important story since Vietnam-midnight appears once, ordered most-important-first, with clean readable text (zero raw HTML tags), correctly chunked when long, with the friendly "Chưa có tin hôm nay." / "Tin tức gần đây" fallback intact. No silent top-20 slice; no duplicate stories. Verified live in the running container by QA on `zenmidi.com/vn-market/webhook` after ops rebuild+force-recreate (real `rag_analyses` content, not stub/N/A), then PO sign-off. Goal stays ARMED on the subjective USER-comprehensibility axis (verbal G9) — human-judged forever (lane-c).

## Pipeline

PO (this) → BA (`docs/REQ_NEWS-FULLDAY.md` spec — decompose the three defects into testable ACs: full-day-coverage mechanism, dedup key+tie-break, HTML-strip rule, the test matrix) → architect (confirm the cap/coverage mechanism + dedup is a pure in-handler transform + the HTML-strip approach is dependency-free or names the dep; small scope, single-command refinement, NOT an architecture overhaul) → pm → dev-mcp-server (refine `handleNews` + extend the T-NEWS test suite + HELP_TEXT touch) → ops (rebuild + force-recreate) → QA (live verify on `zenmidi.com/vn-market/webhook`: full day, deduped, no HTML) → PO sign-off.

## References (predecessor pattern — reuse, don't reinvent)

- Live `/news`: `handleNews` + `chunkStories` + `sentimentLabel` + `midnightVietnamAsUtcInline` in `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` (L444-600).
- `docs/REQ_NEWS-CMD.md`, `docs/handoffs/TASK_NEWS-CMD.md`, `docs/architecture-briefs/2026-05-27-news-cmd-design.md` (the original `/news` build — this sprint refines it).
- Webhook send-loop: `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` — already iterates `result.texts ?? [result.text]`; no change needed.
- `rag_analyses` columns confirmed present: `source_title`, `source_url`, `summary`, `sentiment`, `impact_direction`, `impact_score`, `published_at`, `created_at` (per `newsFetchLiveHandler.ts` + `schema-news.ts`).
