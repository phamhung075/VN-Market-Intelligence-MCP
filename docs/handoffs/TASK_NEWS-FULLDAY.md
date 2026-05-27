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

---

## [Architect] Brownfield Findings — NEWS-FULLDAY

**Zone:** `apps/mcp-server/` — sole zone, owner `dev-mcp-server`

**BUILD-STANDARD:** lean (feature refinement — `apps/mcp-server/` exists, no new service)

### Verified paths

- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L510-600 — `handleNews` confirmed exactly as BA described. `DEFAULT_LIMIT=20` at L511, `MAX_LIMIT=50` at L513. Primary SQL query with `LIMIT ?` at L541-546. Fallback at L551-559. Header at L572-573. Story block builder at L576-594. Calls `chunkStories` at L597.
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L480-500 — `chunkStories(header, storyBlocks, maxLen=4096)` confirmed. Not modified.
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L461-477 — `midnightVietnamAsUtcInline()` confirmed. Not modified.
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L72-83 — `HELP_TEXT` constant, line 77: `/news [N]   Tin tức hôm nay (mặc định 20 bài)` — must be updated.
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L631-636 — `/news` branch in `handleTelegramCommand` — calls `handleNews(db, args)` and spreads `texts`. No change needed to this branch.
- `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` — BA-confirmed existing T-NEWS-1..8. Extension point for T-NEWS-9..12 and T-STRIP-1..7.
- `apps/mcp-server/src/infrastructure/db/schema-news.ts` — `rag_analyses` schema. Columns confirmed: `source_title`, `source_url`, `summary`, `sentiment`, `impact_score`, `created_at`, `published_at`. No schema change needed.

**Greenfield confirmation:**
`stripHtml` is completely absent from `apps/mcp-server/src/` (grep-verified). Defined once in this sprint as a module-level export in `telegramCommands.ts`. Zero collision risk.

**Reuse patterns:**
- `chunkStories` — called unchanged; it is the length safety-valve for the uncapped primary query result.
- `sentimentLabel`, `midnightVietnamAsUtcInline`, `fmtNum` — reused unchanged.
- `NewsRow` interface inside `handleNews` must be extended to include `source_url` for dedup secondary key (or a new `seedNewsTodayWithUrl` test helper must add it — dev choice; `source_url` is already in `rag_analyses`).

### DDD layer assignments

| Change | Layer | Rationale |
|---|---|---|
| `export function stripHtml(...)` | Interface / Presentation | Pure render-time transform, no domain state. Module-level to be shared with RECAP-CMD. |
| Dedup logic in `handleNews` | Application (in-handler) | Post-query data reduction, no side effects, no domain invariant. Consistent with established pattern of lightweight read-only handlers. |
| Remove DEFAULT_LIMIT / update HELP_TEXT | Interface | Argument parsing + query limit = presentation-tier concern. |
| `rag_analyses` read — no schema change | Infrastructure (read-only) | DB contract frozen. |

### Resolved design decisions

**B1 — Full-day cap mechanism (RESOLVED)**

Decision: **remove the `LIMIT` clause from the primary (today) query entirely** when no explicit `/news N` argument is provided.

Rationale:
1. A large ceiling constant (9999) is safer from a SQLite perspective but adds a hidden assumption that no real day ever hits it. It is also misleading — the code reads as though there is a limit when there is not. Removal is cleaner and self-documenting.
2. The length safety-valve is `chunkStories`, not SQL. Removing LIMIT from SQL does not affect the 4096-char Telegram send-loop in any way — `chunkStories` already handles any size.
3. SQLite is stable with full-table scans on `rag_analyses` ordered by `impact_score DESC, created_at DESC`. The table is a time-bounded single-day working set (confirmed 174 rows max on a busy day). No full-table risk.
4. The explicit `/news N` path continues to apply `LIMIT MIN(MAX_LIMIT_EXPLICIT, N)` unchanged.

Implementation: the two-branch query pattern in `handleNews` becomes:

```
// No-argument path: SELECT ... WHERE created_at >= ? ORDER BY impact_score DESC, created_at DESC
//                   (no LIMIT clause)
// Explicit-N path:  SELECT ... WHERE created_at >= ? ORDER BY impact_score DESC, created_at DESC LIMIT ?
//                   with limit = MIN(MAX_LIMIT_EXPLICIT, parsed_N)
```

`DEFAULT_LIMIT` constant is removed entirely. `MAX_LIMIT` is renamed `MAX_LIMIT_EXPLICIT` and raised to **200** (BA recommendation confirmed: allows an explicit request to reach a large set on a heavy news day; aligns with the confirmed 174-row live observation plus headroom).

For `/news 0` or `/news -1` (invalid explicit N), treat as no-argument — use the uncapped primary query. Dev implements: `if (parsed > 0)` guard already exists at L519; values <= 0 fall through to the no-arg path naturally.

**B2 — Fallback path cap (RESOLVED — PO already ruled "capped"; architect picks number)**

Decision: **`FALLBACK_LIMIT = 20`** as a named constant.

Rationale:
1. The fallback fires only when today has zero rows — it shows multi-day stale data. Returning 20 rows is the established user expectation from the original NEWS-CMD sprint and the live behaviour. No reason to change it — the PO explicitly ruled this path stays capped.
2. 20 is the right number: it is enough for the user to see recent news without flooding with potentially weeks-old content. The BA recommendation of "~20" is confirmed as the exact value.
3. Named constant `FALLBACK_LIMIT` (rather than inline `20`) keeps the code self-documenting.

The fallback path also retains its own `LIMIT ?` bound to `FALLBACK_LIMIT`:

```
// Fallback path (zero today-rows): always capped at FALLBACK_LIMIT=20
// SELECT ... ORDER BY impact_score DESC, created_at DESC LIMIT 20
```

If the user typed `/news N` and today is empty, the fallback still uses `FALLBACK_LIMIT` (not the user's N), because the fallback is degraded-mode stale data — the user's explicit N is irrelevant in that context. This is consistent with the PO's UX rationale.

### Exact functions / signatures to add or modify

**File: `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`**

1. **ADD** (before the `midnightVietnamAsUtcInline` function, after the `fmtNum` block — approximately after L93):

```typescript
/**
 * Strip HTML tags from a string, preserving inner text of element content.
 * Self-closing / void elements (img, br, hr, input) are discarded entirely.
 * Null or undefined input returns ''. Never throws.
 *
 * Called by handleNews (this sprint) and handleRecap (RECAP-CMD sprint).
 * Module-level export for unit testing and sibling-sprint reuse.
 */
export function stripHtml(raw: string | null | undefined): string {
  if (raw == null) return "";
  try {
    // Remove void/self-closing elements entirely (no inner text to preserve)
    let s = raw.replace(/<(img|br|hr|input|meta|link|area|base|col|embed|param|source|track|wbr)\b[^>]*\/?>/gi, "");
    // Replace all remaining tags with their inner text (strip the angle brackets)
    s = s.replace(/<[^>]*>/g, "");
    // Collapse runs of whitespace and trim
    s = s.replace(/\s+/g, " ").trim();
    return s;
  } catch {
    return raw.replace(/<[^>]*>/g, "").trim();
  }
}
```

Exact insertion point: after `fmtNum` function closing brace (L92), before the section comment `// ─── Command handlers ───` (L96). This places it in the module-level helpers block.

2. **MODIFY `handleNews`** (L510-600):
   - Remove `DEFAULT_LIMIT = 20` constant (L511).
   - Rename `MAX_LIMIT = 50` → `MAX_LIMIT_EXPLICIT = 200` (L513).
   - Add `FALLBACK_LIMIT = 20` constant.
   - Change argument-parsing block: when no arg (or arg <= 0), set `limit = null` (null = uncapped). When valid arg > 0, set `limit = Math.min(MAX_LIMIT_EXPLICIT, parsed)`.
   - Change primary SQL query: when `limit === null`, omit `LIMIT ?` clause (use a separate prepared statement or construct the SQL string). When `limit` is a number, apply `LIMIT ?`.
   - Change fallback query: always use `LIMIT FALLBACK_LIMIT` (hardcoded 20 — no user arg applies).
   - Add `source_url` to the `NewsRow` interface (needed for dedup secondary key; also add `impact_score` to the SELECT for tie-breaking in dedup).
   - After primary query returns rows, run dedup in-memory per FR-2 spec: build a `Map<string, NewsRow>` keyed on normalized title; iterate rows in SQL order (highest impact first); for each row, compute normalized key via `stripHtml` → trim → lowercase → collapse spaces → strip trailing punctuation. If key not seen, add. If seen, skip. Null/empty titles each get a unique Symbol key (treated as unique).
   - Build story blocks using `stripHtml(row.source_title) ?? "(không có tiêu đề)"` and `stripHtml(row.summary)` before the 200-char truncation.
   - Update header count to reflect `dedupedRows.length` (post-dedup count).

3. **MODIFY `HELP_TEXT`** (L77):
   - Change: `/news [N]   Tin tức hôm nay (mặc định 20 bài)`
   - To: `/news [N]               Tất cả tin quan trọng hôm nay (hoặc N bài gần nhất)`

### File:line insertion points

| What | File | Lines affected |
|---|---|---|
| ADD `export function stripHtml(...)` | `telegramCommands.ts` | After L92 (after `fmtNum` closing brace) |
| MODIFY `handleNews` — constants + query + dedup + strip | `telegramCommands.ts` | L510-600 (full function rewrite) |
| MODIFY `HELP_TEXT` `/news` line | `telegramCommands.ts` | L77 |
| ADD T-NEWS-9..12, T-STRIP-1..7 | `214-telegram-commands.test.ts` | Append to existing `handleNews` describe block |

### Test approach

**Framework:** Bun test, in-memory SQLite via `makeDb()` (existing helper). Zero network, zero credentials, zero filesystem.

**T-STRIP-1..7:** Standalone `describe("stripHtml")` block. Direct unit tests — no DB needed. Input strings → expected output. All 7 cases from the spec matrix. Can live in `214-telegram-commands.test.ts` or a separate `215-strip-html.test.ts` (dev choice — same file is simplest).

**T-NEWS-9..12:** Extend existing `describe("handleNews")` block.
- `seedNewsTodayWithUrl` helper: extend `seedNewsToday` to accept `{ sourceUrl?: string | null }`. Adds `source_url` column seeding.
- T-NEWS-9 (dedup): seed 2 rows with normalized-equal titles, different `impact_score`. Assert 1 occurrence in joined output from Row B (higher score).
- T-NEWS-10 (3 distinct): seed 3 distinct-title rows. Assert all 3 appear.
- T-NEWS-11 (HTML strip): seed 1 row with HTML in both `source_title` and `summary`. Assert no `<` `>` in joined output; assert inner text present.
- T-NEWS-12 (full-day >20): seed 25 distinct rows (all today). Call `handleNews(db, [])`. Assert all 25 titles appear in `result.texts.join("\n")`. Assert each `result.texts[i].length <= 4096`.

**Regression guard:** T-NEWS-1..8 pass unchanged. Any modification to `handleNews` that breaks them is a defect.

**`tsc` zero errors:** `NewsRow` interface extended with `source_url: string | null` and `impact_score: number | null`. The `stripHtml` export must be typed `(raw: string | null | undefined): string`.

### Risk flags

- **R-LOW — regex HTML stripping correctness:** The regex approach handles the AC-defined cases correctly. It does not handle malformed HTML (e.g. `<a href=">broken"`) in a semantically correct way — but AC-FR3 explicitly accepts "best effort, no crash, no raw `<` in output". The void-element regex must be placed before the generic tag-strip regex to avoid leaving orphan text attributes.
- **R-LOW — dedup null/undefined title handling:** null titles in SQLite are returned as `null` in Bun SQLite. The dedup Map must use a unique Symbol per null-title row (not the string `"null"`). Developer must test this explicitly (T-NEWS has AC-FR2-4 for this case).
- **R-LOW — SQL two-branch query:** the uncapped and capped branches use different SQL strings. Either use two separate `db.prepare()` calls (cleaner) or a conditional string — both are fine. Avoid template-string SQL injection risk; the only interpolation is the hardcoded `FALLBACK_LIMIT` constant (no user input in SQL string).
- **R-INFO — `impact_score` needed for dedup tie-break:** the current `NewsRow` interface at L524 does not include `impact_score`. The SELECT must be extended. This is a non-breaking change — `impact_score` is only used in-handler for tie-breaking, never in output.

### Scan clean: true

No DDD violations. No new infra. No cross-zone imports. No new DB schema. Import direction: `telegramCommands.ts` (infrastructure) reads from `schema-news.ts` (infrastructure) — same layer, no violation. `stripHtml` helper is pure presentation-layer, no domain import. `chunkStories` unchanged.

---

## [QA] Review Record — NEWS-FULLDAY

**date:** 2026-05-28
**commit under test:** 99f433ec
**verdict:** APPROVED

### Test Results

- Target test file `214-telegram-commands.test.ts`: **60 pass / 0 fail** (independently re-run, not trusting dev claim)
- T-NEWS-1..8 regression: all 8 still pass unmodified (confirmed in run output)
- T-NEWS-9 (dedup survivor): PASS
- T-NEWS-10 (3 distinct): PASS
- T-NEWS-11 (HTML-strip removes tags): PASS
- T-NEWS-12 (full-day >20 uncapped): PASS
- T-STRIP-1..7 (stripHtml unit): all 7 PASS
- TypeScript: `pnpm --filter vn-market check` (bun tsc --noEmit) → **exit 0, 0 errors**

### AC Coverage

- AC-FR1-1 (no-arg uncapped): PASS — `handleNews` confirmed at L597-606; no LIMIT clause on the default path. `DEFAULT_LIMIT=20` removed, `MAX_LIMIT_EXPLICIT=200`, `FALLBACK_LIMIT=20`.
- AC-FR1-2 (explicit /news N): PASS — L586-596, LIMIT applied with MIN(200, N)
- AC-FR1-4 (HELP_TEXT updated): PASS — L81: `/news [N]               Tất cả tin quan trọng hôm nay (hoặc N bài gần nhất)`
- AC-FR1-5 (header uses post-dedup count): PASS — L668
- AC-FR2-1/2/3/4/5/7 (dedup): PASS — L631-668, normalizeTitle + Map<string,true> + first-wins
- AC-FR3-1..10 (stripHtml): PASS — `export function stripHtml` defined at L113, module-level, single definition confirmed (`grep` finds 1 definition only)
- AC-FR4-2 (impact_score never in output): PASS — `impact_score` only in NewsRow interface + SELECT; never emitted as a string
- AC-FR5-1 (empty-DB → "Chưa có tin hôm nay."): PASS — L622-628
- AC-FR5-2 (fallback header "gần đây"): PASS — L667
- NFR-1-AC-4 (no HTML in output): PASS — stripHtml applied to source_title + summary before render
- NFR-3-AC-1 (zone: apps/mcp-server only): PASS — commit 99f433ec touches only mcp-server files

### DDD: PASS

- `telegramCommands.ts` (infrastructure) imports from `domain/services/timeConstants.js` + `application/usecases/assembleEveningSummary.js` + `application/usecases/generatePeriodicSummary.js` — valid DDD direction (infra→app→domain)
- No domain→infra imports
- `stripHtml` defined once at module level — no duplicate

### Security: PASS

- Zero `process.env` in `telegramCommands.ts` (confirmed by grep)
- All SQL in `handleNews` uses parameterized queries (`db.prepare(...).all(midnight, explicitLimit)` / `.all(midnight)` / `.all(FALLBACK_LIMIT)`)
- No hardcoded secrets/tokens/credentials in modified file

### Live E2E Probe

Command `/news` — `update_id:99001`, `chat_id:99999999`:
- HTTP 200 `ok` from `https://zenmidi.com/vn-market/webhook`
- Container log: `[telegram] sendMessage failed status:400 channel:market chatId:99999999`
- Handler ran, reply built, targeted chatId from update (not hardcoded). 400 = expected (fake chat).
- No handler error in logs.

### Merge Status: APPROVED — already on main (commit 99f433ec)
